/**
 * Unit tests for the shared AI cascade helper (`myChat` / `chatJson`).
 *
 * Covers the regression fixed on 2026-10-04:
 *
 *   1. chatJson rethrows `AllUpstreamError` / `UpstreamAuthError` from
 *      the Workers tier, so OpenRouter is never tried. We remove both
 *      rethrows; only fail after OpenRouter also fails.
 *   2. Both tiers share one deadlineMs, so Workers AI timeouts consume
 *      the whole budget and OpenRouter starts already expired. We give
 *      each tier its own deadline (Workers ~8s, OpenRouter ~15s) in
 *      both `myChat` and `chatJson`.
 *   3. cachePut is awaited on the request path. We move it to a
 *      fire-and-forget background write.
 *
 * The tests stub out `workersCascade` and `openRouterCascade*` to keep
 * the run hermetic — no real network, no D1.
 */
import { afterEach, describe, it, expect, vi } from 'vitest';

// Mock the aicache module so cacheGet returns null and cachePut is a no-op.
vi.mock('../lib/aicache', () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cachePut: vi.fn().mockResolvedValue(undefined),
  cacheKey: vi.fn((parts: unknown[]) => `k:${JSON.stringify(parts)}`),
}));

// Mock analytics so we don't need D1 in the helper.
vi.mock('../lib/analytics', () => ({
  trackAI: vi.fn(),
}));

// Hoisted mocks — the cascade module exports are observed by the helper.
const { mockWorkersCascade, mockOpenRouterCascade, mockOpenRouterCascadeJson } = vi.hoisted(() => ({
  mockWorkersCascade: vi.fn(),
  mockOpenRouterCascade: vi.fn(),
  mockOpenRouterCascadeJson: vi.fn(),
}));

vi.mock('./cascade', () => {
  // Re-import the real error types so instanceof checks still work.
  class UpstreamAuthError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'UpstreamAuthError';
    }
  }
  class AllUpstreamError extends Error {
    override cause: 'rate_limited' | 'upstream' | 'empty' | 'unknown' = 'upstream';
    attempts: Array<{ model: string; status?: number; error: string; latencyMs: number }> = [];
    constructor(message: string, cause: 'rate_limited' | 'upstream' | 'empty' | 'unknown' = 'upstream', attempts: Array<{ model: string; status?: number; error: string; latencyMs: number }> = []) {
      super(message);
      this.name = 'AllUpstreamError';
      this.cause = cause;
      this.attempts = attempts;
    }
  }
  return {
    AllUpstreamError,
    UpstreamAuthError,
    JsonCascadeError: class extends Error {},
    workersCascade: mockWorkersCascade,
    openRouterCascade: mockOpenRouterCascade,
    openRouterCascadeJson: mockOpenRouterCascadeJson,
    CASCADE_BUDGET_MS: 22_000,
  };
});

const { myChat, chatJson, AllUpstreamError, UpstreamAuthError } = await import('./provider');
const { cachePut } = await import('../lib/aicache');

const env = {} as Parameters<typeof myChat>[0];

afterEach(() => {
  vi.clearAllMocks();
});

describe('myChat cascade', () => {
  it('returns the first successful Workers AI result', async () => {
    mockWorkersCascade.mockResolvedValueOnce({
      text: 'workers says hi', provider: 'workers', model: 'llama-3.3-70b', tokens: 5, latencyMs: 100,
    });
    const out = await myChat(env, 'chat', {
      messages: [{ role: 'user', content: 'ping' }],
    });
    expect(out.provider).toBe('workers');
    expect(out.text).toBe('workers says hi');
    expect(mockOpenRouterCascade).not.toHaveBeenCalled();
  });

  it('falls through to OpenRouter when Workers AI throws AllUpstreamError', async () => {
    mockWorkersCascade.mockRejectedValueOnce(
      new AllUpstreamError('all workers down', 'upstream', []),
    );
    mockOpenRouterCascade.mockResolvedValueOnce({
      text: 'openrouter says hi', provider: 'openrouter', model: 'qwen3-27b:free', tokens: 7, latencyMs: 300,
    });
    const out = await myChat(env, 'chat', {
      messages: [{ role: 'user', content: 'ping' }],
    });
    expect(out.provider).toBe('openrouter');
    expect(out.text).toBe('openrouter says hi');
    expect(mockOpenRouterCascade).toHaveBeenCalledTimes(1);
  });

  it('rethrows UpstreamAuthError immediately without trying OpenRouter', async () => {
    mockWorkersCascade.mockRejectedValueOnce(new UpstreamAuthError('bad key'));
    await expect(
      myChat(env, 'chat', { messages: [{ role: 'user', content: 'ping' }] }),
    ).rejects.toBeInstanceOf(UpstreamAuthError);
    expect(mockOpenRouterCascade).not.toHaveBeenCalled();
  });

  it('propagates AllUpstreamError when BOTH tiers fail', async () => {
    mockWorkersCascade.mockRejectedValueOnce(
      new AllUpstreamError('all workers down', 'upstream', []),
    );
    mockOpenRouterCascade.mockRejectedValueOnce(
      new AllUpstreamError('all openrouter down', 'upstream', []),
    );
    await expect(
      myChat(env, 'chat', { messages: [{ role: 'user', content: 'ping' }] }),
    ).rejects.toBeInstanceOf(AllUpstreamError);
  });

  it('gives OpenRouter a fresh deadline independent of Workers AI budget', async () => {
    // Workers AI: deadlineMs ~ start + 7s. OpenRouter: deadlineMs is
    // computed when the tier starts (NOT at request start) and gets 18s.
    // Verify the OpenRouter deadlineMs is meaningfully GREATER than the
    // Workers deadlineMs.
    let workersDeadline = 0;
    let orDeadline = 0;
    let baseline = 0;
    mockWorkersCascade.mockImplementationOnce(async (_env, input: { deadlineMs?: number }) => {
      baseline = Date.now();
      workersDeadline = input.deadlineMs ?? 0;
      throw new AllUpstreamError('boom', 'upstream', []);
    });
    mockOpenRouterCascade.mockImplementationOnce(async (_env, input: { deadlineMs?: number }) => {
      // We expect to be called after Workers AI. Snapshot now so we can
      // see that its deadlineMs is meaningfully AFTER the Workers deadline.
      orDeadline = input.deadlineMs ?? 0;
      return { text: 'ok', provider: 'openrouter', model: 'qwen3', tokens: 1, latencyMs: 50 };
    });
    await myChat(env, 'chat', { messages: [{ role: 'user', content: 'ping' }] });
    expect(workersDeadline).toBeGreaterThan(baseline);
    expect(orDeadline).toBeGreaterThan(workersDeadline);
    // Specifically: OpenRouter gets a fresh ~18s budget (Workers used ~7s).
    // The gap should be ~11s (18 - 7). Allow a generous 5_000ms slack for
    // test wall-clock + scheduling jitter.
    expect(orDeadline - workersDeadline).toBeGreaterThan(5_000);
  });

  it('shrinks both tier budgets when caller passes budgetMs', async () => {
    let workersDeadline = 0;
    let orDeadline = 0;
    mockWorkersCascade.mockImplementationOnce(async (_env, input: { deadlineMs?: number }) => {
      workersDeadline = input.deadlineMs ?? 0;
      throw new AllUpstreamError('boom', 'upstream', []);
    });
    mockOpenRouterCascade.mockImplementationOnce(async (_env, input: { deadlineMs?: number }) => {
      orDeadline = input.deadlineMs ?? 0;
      return { text: 'ok', provider: 'openrouter', model: 'qwen3', tokens: 1, latencyMs: 50 };
    });
    await myChat(env, 'chat', { messages: [{ role: 'user', content: 'ping' }] }, { budgetMs: 6_000 });
    // Caller budget (6s) caps BOTH tiers.
    expect(orDeadline - workersDeadline).toBeLessThan(1_000);
  });

  it('writes the cache as fire-and-forget (does not block the response)', async () => {
    let cachePutResolved = false;
    vi.mocked(cachePut).mockImplementationOnce(async () => {
      // Simulate a slow D1 round-trip.
      await new Promise((r) => setTimeout(r, 50));
      cachePutResolved = true;
    });
    mockWorkersCascade.mockResolvedValueOnce({
      text: 'fast', provider: 'workers', model: 'm', tokens: 1, latencyMs: 5,
    });
    const out = await myChat(env, 'chat', { messages: [{ role: 'user', content: 'ping' }] });
    expect(out.text).toBe('fast');
    // The helper returned BEFORE cachePut resolved.
    expect(cachePutResolved).toBe(false);
    // Allow the background promise to settle.
    await new Promise((r) => setTimeout(r, 80));
    expect(cachePutResolved).toBe(true);
  });
});

describe('chatJson cascade', () => {
  const parseShape = (raw: unknown) => {
    const r = raw as { cards?: unknown[] };
    return { cards: Array.isArray(r.cards) ? r.cards : [] };
  };

  it('falls through to OpenRouter when Workers AI transport fails (regression)', async () => {
    // The pre-fix bug: chatJson rethrew AllUpstreamError, so this call
    // returned a 503 instead of falling through to OpenRouter.
    mockWorkersCascade.mockRejectedValueOnce(
      new AllUpstreamError('all workers down', 'upstream', []),
    );
    mockOpenRouterCascadeJson.mockResolvedValueOnce({
      parsed: { cards: ['a', 'b', 'c'] },
      result: { text: '{"cards":["a","b","c"]}', provider: 'openrouter', model: 'qwen3', tokens: 9, latencyMs: 300 },
    });
    const out = await chatJson(env, 'flashcardsGen', {
      messages: [{ role: 'user', content: 'make 3 cards' }],
    }, parseShape);
    expect(out.out.provider).toBe('openrouter');
    expect(out.parsed.cards).toEqual(['a', 'b', 'c']);
  });

  it('falls through to OpenRouter when Workers returns unparseable JSON', async () => {
    mockWorkersCascade.mockResolvedValueOnce({
      text: 'not json at all', provider: 'workers', model: 'm', tokens: 1, latencyMs: 5,
    });
    mockOpenRouterCascadeJson.mockResolvedValueOnce({
      parsed: { cards: ['x'] },
      result: { text: '{"cards":["x"]}', provider: 'openrouter', model: 'qwen3', tokens: 3, latencyMs: 100 },
    });
    const out = await chatJson(env, 'flashcardsGen', {
      messages: [{ role: 'user', content: 'make 1 card' }],
    }, parseShape);
    expect(out.out.provider).toBe('openrouter');
    expect(out.parsed.cards).toEqual(['x']);
  });

  it('propagates AllUpstreamError when BOTH tiers fail', async () => {
    mockWorkersCascade.mockRejectedValueOnce(
      new AllUpstreamError('workers dead', 'upstream', []),
    );
    mockOpenRouterCascadeJson.mockRejectedValueOnce(
      new AllUpstreamError('openrouter dead', 'upstream', []),
    );
    await expect(
      chatJson(env, 'flashcardsGen', {
        messages: [{ role: 'user', content: 'x' }],
      }, parseShape),
    ).rejects.toBeInstanceOf(AllUpstreamError);
  });

  it('gives OpenRouter a fresh deadline independent of Workers AI budget', async () => {
    let workersDeadline = 0;
    let orDeadline = 0;
    mockWorkersCascade.mockImplementationOnce(async (_env, input: { deadlineMs?: number }) => {
      workersDeadline = input.deadlineMs ?? 0;
      throw new AllUpstreamError('boom', 'upstream', []);
    });
    mockOpenRouterCascadeJson.mockImplementationOnce(
      async (env: unknown, input: { deadlineMs?: number }, _parse: unknown) => {
        orDeadline = input.deadlineMs ?? 0;
        return {
          parsed: { cards: [] },
          result: { text: '{"cards":[]}', provider: 'openrouter', model: 'qwen3', tokens: 1, latencyMs: 50 },
        };
      },
    );
    await chatJson(env, 'flashcardsGen', {
      messages: [{ role: 'user', content: 'x' }],
    }, parseShape);
    expect(orDeadline).toBeGreaterThan(workersDeadline);
    expect(orDeadline - workersDeadline).toBeGreaterThan(5_000);
  });
});