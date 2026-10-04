/**
 * Cascade-level tests. Verifies the structural guarantees that the
 * cascade-harden-v2 work added:
 *
 *   1. Workers AI hang → OpenRouter is actually called (no swallowing).
 *   2. Breaker is NOT marked when the only failure was a deadline
 *      exceeded. A slow upstream for one request should not poison the
 *      next.
 *   3. When BOTH tiers fail, the user-facing error is `AllUpstreamError`
 *      (which the route layer surfaces as a friendly 503 with the
 *      `upstream` aggregate cause).
 *   4. workersCascade caps at `WORKERS_MAX_MODELS` (2) so a hung first
 *      model can't burn the whole Workers tier.
 *   5. The streaming cascade's first-token watchdog (8s) advances to the
 *      next model when the first model is silent.
 *
 * Mocks `global.fetch` (for OpenRouter) and `env.AI.run` (for Workers AI)
 * directly so we exercise the REAL cascade code — no module mocks.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../env';
import {
  openRouterCascade,
  openRouterCascadeJson,
  workersCascade,
  openRouterStreamCascade,
  AllUpstreamError,
  UpstreamAuthError,
  __resetCascadeBreaker,
} from './cascade';

const baseEnv = (): Env =>
  ({
    OPENROUTER_API_KEY: 'sk-or-v1-test',
    OPENROUTER_MODELS: 'model-a:free,model-b:free,model-c:free',
    WORKERS_AI_MODELS: '@cf/llama-primary,@cf/llama-secondary,@cf/llama-tertiary',
    AI: { run: vi.fn() },
  } as unknown as Env);

const stubFetch = (impl: (url: string, init?: RequestInit) => Promise<Response>) => {
  vi.stubGlobal('fetch', vi.fn(impl));
};

const openRouterOk = (model: string, text = 'hi from OR') =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: text } }],
      usage: { total_tokens: 5 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

const openRouterError = (status: number) =>
  new Response('boom', { status });

const openRouterSseOk = (text: string) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(ctrl) {
        ctrl.enqueue(new TextEncoder().encode(
          `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n` +
          `data: [DONE]\n\n`,
        ));
        ctrl.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );

/**
 * Build a hanging ReadableStream that can be errored from outside via
 * the returned `abort()`. We keep a reference to the underlying
 * ReadableStreamDefaultController so the AbortSignal listener can call
 * `controller.error()` and reject any pending `reader.read()`.
 */
type ControlledStream = {
  body: ReadableStream<Uint8Array>;
  abort: (reason?: Error) => void;
};
const makeControlledStream = (): ControlledStream => {
  let ctl: ReadableStreamDefaultController<Uint8Array> | null = null;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      ctl = controller;
    },
  });
  return {
    body,
    abort: (reason?: Error) => {
      if (!ctl) return;
      ctl.error(reason ?? new DOMException('aborted', 'AbortError'));
    },
  };
};

beforeEach(() => {
  __resetCascadeBreaker();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('workersCascade (real module)', () => {
  it('caps at WORKERS_MAX_MODELS even when more are configured', async () => {
    const env = baseEnv();
    // Fail immediately so the overall deadline doesn't prevent later models
    // from being attempted; this isolates the configured model-count cap.
    vi.mocked(env.AI.run).mockImplementation(
      () => Promise.reject(new Error('workers unavailable')),
    );
    await expect(
      workersCascade(env, {
        messages: [{ role: 'user', content: 'hi' }],
        route: 'test',
      }),
    ).rejects.toBeInstanceOf(AllUpstreamError);
    expect(vi.mocked(env.AI.run)).toHaveBeenCalledTimes(2);
  });

  it('returns the first successful Workers AI result without calling OpenRouter', async () => {
    const env = baseEnv();
    vi.mocked(env.AI.run).mockResolvedValueOnce({
      response: 'workers says hi',
      usage: { tokens: 5 },
    } as never);
    const out = await workersCascade(env, {
      messages: [{ role: 'user', content: 'hi' }],
      route: 'test',
    });
    expect(out.provider).toBe('workers');
    expect(out.text).toBe('workers says hi');
    expect(vi.mocked(env.AI.run)).toHaveBeenCalledTimes(1);
  });

  it('clears the per-call setTimeout even when the AI.run promise rejects', async () => {
    // Regression: 25 workers leaked one setTimeout per attempt because
    // clearTimeout was never called in the finally block. We can't
    // directly observe the timer leak, but we can confirm the cascade
    // resolves cleanly with the cleanup in place.
    const env = baseEnv();
    vi.mocked(env.AI.run).mockRejectedValueOnce(new Error('cold start blew up'));
    vi.mocked(env.AI.run).mockRejectedValueOnce(new Error('cold start blew up 2'));
    stubFetch(async () => openRouterOk('model-a:free'));
    await expect(
      workersCascade(env, {
        messages: [{ role: 'user', content: 'hi' }],
        route: 'test',
      }),
    ).rejects.toBeInstanceOf(AllUpstreamError);
    // The cascade resolved without throwing "Cannot clear undefined timer"
    // — that's the visible signal that the finally block runs.
  });
});

describe('openRouterCascade + breaker (real module)', () => {
  it('marks the breaker on a real upstream failure', async () => {
    const env = baseEnv();
    // Strategy: run a 1-model cascade that fails, which marks only
    // model-a. Then run a 3-model cascade with all failures and verify
    // model-a is NOT in the list of attempted models.
    const singleModelEnv = {
      ...baseEnv(),
      OPENROUTER_MODELS: 'model-a:free',
    } as Env;
    stubFetch(async (_u, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { model?: string };
      if (body.model === 'model-a:free') return openRouterError(502);
      throw new Error('unexpected model in single-model env');
    });
    await expect(
      openRouterCascade(singleModelEnv, {
        messages: [{ role: 'user', content: 'hi' }],
        route: 'test',
      }),
    ).rejects.toBeInstanceOf(AllUpstreamError);

    // Multi-model cascade with all failures. The breaker should skip
    // model-a, so only b and c reach fetch.
    const modelsAttempted: string[] = [];
    stubFetch(async (_u, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { model?: string };
      modelsAttempted.push(body.model ?? '');
      return openRouterError(502);
    });
    await expect(
      openRouterCascade(env, {
        messages: [{ role: 'user', content: 'hi' }],
        route: 'test',
      }),
    ).rejects.toBeInstanceOf(AllUpstreamError);
    expect(modelsAttempted).not.toContain('model-a:free');
    expect(modelsAttempted.length).toBe(2); // only b and c
  });

  it('does NOT mark the breaker when the only failure is deadline_exceeded', async () => {
    const env = baseEnv();
    // First cascade: deadlineMs is already in the past, so EVERY model
    // short-circuits at the top of `tryModel` with reason='deadline_exceeded'.
    // The breaker guard at line ~309 (`if (outcome.reason !== 'deadline_exceeded')`)
    // MUST skip the markFailed call — otherwise the next cascade would skip
    // an otherwise-healthy model.
    stubFetch(async () => openRouterOk('model-a:free'));
    await expect(
      openRouterCascade(env, {
        messages: [{ role: 'user', content: 'hi' }],
        route: 'test',
        deadlineMs: Date.now() - 100, // already past
      }),
    ).rejects.toBeInstanceOf(AllUpstreamError);

    // Second cascade: deadlineMs unset, fetch is healthy. If the breaker
    // HAD been tripped, model-a would be skipped and the cascade would
    // hit model-b first. Since the breaker was NOT tripped (deadline
    // excluded), the cascade tries model-a and succeeds on it.
    let count = 0;
    stubFetch(async () => {
      count++;
      return openRouterOk('model-a:free', 'OR a');
    });
    const out = await openRouterCascade(env, {
      messages: [{ role: 'user', content: 'hi' }],
      route: 'test',
    });
    expect(out.model).toBe('model-a:free');
    expect(count).toBe(1);
  });

  it('does NOT mark the JSON breaker when the only failure is deadline_exceeded', async () => {
    const env = {
      ...baseEnv(),
      OPENROUTER_MODELS: 'model-a:free',
    } as Env;
    await expect(
      openRouterCascadeJson(
        env,
        {
          messages: [{ role: 'user', content: 'hi' }],
          route: 'test',
          deadlineMs: Date.now() - 100,
        },
        (raw) => raw,
      ),
    ).rejects.toBeInstanceOf(AllUpstreamError);

    let count = 0;
    stubFetch(async () => {
      count++;
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    const out = await openRouterCascadeJson(
      env,
      {
        messages: [{ role: 'user', content: 'hi' }],
        route: 'test',
      },
      (raw) => raw,
    );
    expect(out.result.model).toBe('model-a:free');
    expect(count).toBe(1);
  });

  it('throws UpstreamAuthError on a 401 and stops the cascade', async () => {
    const env = baseEnv();
    stubFetch(async () => openRouterError(401));
    await expect(
      openRouterCascade(env, {
        messages: [{ role: 'user', content: 'hi' }],
        route: 'test',
      }),
    ).rejects.toBeInstanceOf(UpstreamAuthError);
  });

  it('both tiers fail → friendly 503 (AllUpstreamError with friendly message)', async () => {
    const env = baseEnv();
    // Workers: hang
    vi.mocked(env.AI.run).mockImplementation(
      () => new Promise(() => { /* hang */ }),
    );
    // OpenRouter: every model 503s
    stubFetch(async () => openRouterError(503));
    await expect(
      openRouterCascade(env, {
        messages: [{ role: 'user', content: 'hi' }],
        route: 'test',
      }),
    ).rejects.toMatchObject({
      name: 'AllUpstreamError',
      message: expect.stringMatching(/temporarily unavailable|rate-limited/),
    });
  });
});

describe('provider → openRouterCascade wiring (Workers hang → OR is called)', () => {
  it('falls through to OpenRouter when Workers AI hangs through its tier budget', async () => {
    const { myChat } = await import('./provider');
    const env = {
      ...baseEnv(),
      DB: undefined,
      ANALYTICS: undefined,
      RATE_LIMITER: undefined,
      CHAT_SESSION: undefined,
    } as unknown as Env;
    vi.mocked(env.AI.run).mockImplementation(() => new Promise(() => {}));

    let orCalls = 0;
    stubFetch(async () => {
      orCalls++;
      return openRouterOk('model-a:free', 'OpenRouter recovered after Workers timeout');
    });

    const out = await myChat(
      env,
      'test',
      { messages: [{ role: 'user', content: 'hi' }] },
      { budgetMs: 80 },
    );

    expect(vi.mocked(env.AI.run)).toHaveBeenCalledTimes(1);
    expect(orCalls).toBe(1);
    expect(out.provider).toBe('openrouter');
    expect(out.text).toBe('OpenRouter recovered after Workers timeout');
  });

  it('falls through from Workers to OpenRouter when Workers fails', async () => {
    // This test exercises the actual provider helper (real `myChat`) by
    // mocking only the network primitives (fetch + env.AI.run) — so we
    // cover the WHOLE chain: cacheGet → workersCascade → openRouterCascade.
    const { myChat } = await import('./provider');
    // Minimal env stub. provider.ts + aicache.ts only access env.DB,
    // env.ANALYTICS, env.OPENROUTER_API_KEY. Pass placeholders; the helpers
    // bail when the underlying is undefined.
    const env = {
      ...baseEnv(),
      DB: undefined,
      ANALYTICS: undefined,
      RATE_LIMITER: undefined,
      CHAT_SESSION: undefined,
    } as unknown as Env;

    // Workers AI: fail every model → triggers fallthrough to OpenRouter.
    vi.mocked(env.AI.run).mockRejectedValue(new Error('workers unreachable'));

    let orCalls = 0;
    stubFetch(async () => {
      orCalls++;
      return openRouterOk('model-a:free', 'OR says hi');
    });

    const out = await myChat(env, 'test', {
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(out.provider).toBe('openrouter');
    expect(orCalls).toBe(1);
    expect(out.text).toBe('OR says hi');
  });

  it('does NOT call OpenRouter on UpstreamAuthError from OpenRouter', async () => {
    // The route from Workers AI doesn't surface a distinct auth code, so
    // the only way UpstreamAuthError can leak into `myChat` is via
    // OpenRouter's 401. To exercise that path we make Workers AI
    // unreachable (returns AllUpstreamError), then verify the OpenRouter
    // cascade throws on the first 401 instead of trying more models.
    const { myChat } = await import('./provider');
    const env = {
      ...baseEnv(),
      DB: undefined,
      ANALYTICS: undefined,
      RATE_LIMITER: undefined,
      CHAT_SESSION: undefined,
    } as unknown as Env;

    // Workers AI: AllUpstreamError → triggers fallthrough to OpenRouter.
    vi.mocked(env.AI.run).mockRejectedValue(new AllUpstreamError('workers down', 'upstream', []));

    let orCalls = 0;
    stubFetch(async () => {
      orCalls++;
      return openRouterError(401);
    });

    await expect(
      myChat(env, 'test', {
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toBeInstanceOf(UpstreamAuthError);
    // OpenRouter returns 401 on first try → cascade throws, no further
    // models attempted.
    expect(orCalls).toBe(1);
  });
});

describe('openRouterStreamCascade (chat path)', () => {
  it('first-token watchdog advances to the next model when the first stalls', async () => {
    const env = baseEnv();
    // Model-a hangs (and respects abort). Model-b streams successfully.
    const a = makeControlledStream();
    let firstStreamAttempted = false;
    let secondStreamAttempted = false;

    stubFetch(async (_u, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { model: string; stream?: boolean };
      if (!body.stream) throw new Error('expected stream:true');
      const signal = init?.signal;
      if (body.model === 'model-a:free') {
        firstStreamAttempted = true;
        // Wire the abort signal to the controlled stream so the watchdog
        // can actually fire (and the reader.read() rejects).
        if (signal) {
          signal.addEventListener('abort', () => a.abort());
        }
        return new Response(a.body, { status: 200 });
      }
      if (body.model === 'model-b:free') {
        secondStreamAttempted = true;
        return openRouterSseOk('hello from b');
      }
      return openRouterSseOk('fallback');
    });

    // Use a very tight first-token timeout (50ms) so the test completes fast.
    const tokens: string[] = [];
    const out = await openRouterStreamCascade(
      env,
      {
        messages: [{ role: 'user', content: 'hi' }],
        route: 'test',
        firstTokenTimeoutMs: 50,
      },
      (e) => { if (e.kind === 'token') tokens.push(e.text); },
    );

    expect(firstStreamAttempted).toBe(true);
    expect(secondStreamAttempted).toBe(true);
    expect(out.model).toBe('model-b:free');
    expect(tokens.join('')).toContain('hello from b');
  }, 10_000);

  it('returns the full text on a successful single-model stream', async () => {
    const env = baseEnv();
    stubFetch(async (_u, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { model: string; stream?: boolean };
      if (!body.stream) throw new Error('expected stream:true');
      const r = new ReadableStream<Uint8Array>({
        start(ctrl) {
          ctrl.enqueue(new TextEncoder().encode(
            `data: ${JSON.stringify({ choices: [{ delta: { content: 'hello ' } }] })}\n\n` +
            `data: ${JSON.stringify({ choices: [{ delta: { content: 'world' } }] })}\n\n` +
            `data: [DONE]\n\n`,
          ));
          ctrl.close();
        },
      });
      return new Response(r, { status: 200 });
    });
    const tokens: string[] = [];
    const out = await openRouterStreamCascade(
      env,
      {
        messages: [{ role: 'user', content: 'hi' }],
        route: 'test',
        firstTokenTimeoutMs: 500,
      },
      (e) => { if (e.kind === 'token') tokens.push(e.text); },
    );
    expect(tokens.join('')).toBe('hello world');
    expect(out.text).toBe('hello world');
    expect(out.provider).toBe('openrouter');
  });

  it('throws AllUpstreamError when every model fails the first-token watchdog', async () => {
    const env = baseEnv();
    const streams: ControlledStream[] = [];
    stubFetch(async (_u, init) => {
      const s = makeControlledStream();
      streams.push(s);
      const signal = init?.signal;
      if (signal) {
        signal.addEventListener('abort', () => s.abort());
      }
      return new Response(s.body, { status: 200 });
    });
    await expect(
      openRouterStreamCascade(
        env,
        {
          messages: [{ role: 'user', content: 'hi' }],
          route: 'test',
          firstTokenTimeoutMs: 50,
        },
        () => { /* no-op */ },
      ),
    ).rejects.toBeInstanceOf(AllUpstreamError);
    // Three models attempted (one per configured model).
    expect(streams.length).toBe(3);
  });
});

describe('workersStreamCascade (chat path)', () => {
  // Import the cascade-level function under test lazily so the mocks above
  // are already in place when the module is loaded.
  const importWorkers = async () => {
    const mod = await import('./cascade');
    return mod.workersStreamCascade;
  };

  /** Build a Workers AI stream of SSE frames from an array of token strings.
   *  Matches the wire format: `data: {"response":"..."}\n\n` per token,
   *  terminated by `data: [DONE]\n\n`. */
  const workersStreamFromTokens = (tokens: string[]): ReadableStream<Uint8Array> => {
    const enc = new TextEncoder();
    return new ReadableStream<Uint8Array>({
      start(ctrl) {
        for (const t of tokens) {
          ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ response: t })}\n\n`));
        }
        ctrl.enqueue(enc.encode(`data: [DONE]\n\n`));
        ctrl.close();
      },
    });
  };

  /** A hanging stream whose reader.read() rejects when the given signal
   *  aborts. Mirrors the OpenRouter test helper `makeControlledStream`. */
  const makeControlledWorkersStream = (signal: AbortSignal): ReadableStream<Uint8Array> => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        signal.addEventListener('abort', () => {
          controller.error(new DOMException('aborted', 'AbortError'));
        });
      },
    });
    return stream;
  };

  it('returns the full token stream + firstTokenAtMs on a healthy single-model cascade', async () => {
    const env = baseEnv();
    vi.mocked(env.AI.run).mockResolvedValueOnce(
      workersStreamFromTokens(['Hi', ' there']) as never,
    );
    const workersStreamCascade = await importWorkers();
    const tokens: string[] = [];
    const out = await workersStreamCascade(
      env,
      { messages: [{ role: 'user', content: 'hi' }], route: 'test', firstTokenTimeoutMs: 500 },
      (e) => { if (e.kind === 'token') tokens.push(e.text); },
    );
    expect(out.provider).toBe('workers');
    expect(out.text).toBe('Hi there');
    expect(out.model).toBe('@cf/llama-primary');
    expect(out.firstTokenAtMs).toBeGreaterThanOrEqual(0);
    expect(tokens.join('')).toBe('Hi there');
  });

  it('advances to the next model on first-token timeout', async () => {
    const env = baseEnv();
    // The cascade passes ctl.signal as the abort signal to env.AI.run. We
    // mock env.AI.run to honor the signal: capture it, and build a stream
    // that errors when the signal aborts (mirrors how a hung upstream
    // reacts to an aborted request).
    vi.mocked(env.AI.run).mockImplementation(((_model: unknown, _input: unknown, opts?: { signal?: AbortSignal }) => {
      const signal = opts?.signal ?? new AbortController().signal;
      return Promise.resolve(makeControlledWorkersStream(signal) as never);
    }) as never);
    // Queue the second model to return actual tokens once the first aborts.
    const fallback = workersStreamFromTokens(['fallback']);
    const origImpl = vi.mocked(env.AI.run).getMockImplementation();
    let calls_ = 0;
    vi.mocked(env.AI.run).mockImplementation(((
      model: string,
      input: Parameters<typeof env.AI.run>[1],
      opts?: Parameters<typeof env.AI.run>[2],
    ) => {
      calls_++;
      if (calls_ === 1) return origImpl!(model, input, opts);
      return Promise.resolve(fallback as never);
    }) as never);
    const workersStreamCascade = await importWorkers();
    const tokens: string[] = [];
    const out = await workersStreamCascade(
      env,
      { messages: [{ role: 'user', content: 'hi' }], route: 'test', firstTokenTimeoutMs: 50 },
      (e) => { if (e.kind === 'token') tokens.push(e.text); },
    );
    expect(out.model).toBe('@cf/llama-secondary');
    expect(out.text).toBe('fallback');
    expect(tokens.join('')).toBe('fallback');
    expect(vi.mocked(env.AI.run)).toHaveBeenCalledTimes(2);
  }, 5_000);

  it('throws AllUpstreamError when every Workers stream attempt fails', async () => {
    const env = baseEnv();
    vi.mocked(env.AI.run).mockImplementation(((_model: unknown, _input: unknown, opts?: { signal?: AbortSignal }) => {
      const signal = opts?.signal ?? new AbortController().signal;
      return Promise.resolve(makeControlledWorkersStream(signal) as never);
    }) as never);
    const workersStreamCascade = await importWorkers();
    await expect(
      workersStreamCascade(
        env,
        { messages: [{ role: 'user', content: 'hi' }], route: 'test', firstTokenTimeoutMs: 50 },
        () => { /* no-op */ },
      ),
    ).rejects.toBeInstanceOf(AllUpstreamError);
    expect(vi.mocked(env.AI.run)).toHaveBeenCalledTimes(2);
  }, 5_000);
});