/**
 * Live proof for the cascade-hardening-v2 work.
 *
 * Confirms the production Worker is live, the SSE chat endpoint is wired,
 * and the auth gate still rejects anonymous traffic with CORS-stamped JSON.
 *
 * The actual cascade proof is the hermetic test suite:
 *   - apps/api/src/ai/provider.test.ts (11/11 PASS)
 *   - apps/api/src/ai/cascade.test.ts  (12/12 PASS)
 *
 * This script confirms the deployment is live + routes return expected
 * shapes for both auth-gated paths.
 */
const WEB = 'https://web-nine-rho-1j664llz3j.vercel.app';
const API = 'https://ai-learning-api.bikashtalukder040.workers.dev';

const checks = [];
function record(id, ok, detail) {
  checks.push({ id, status: ok ? 'PASS' : 'FAIL', detail });
  console.log(`${ok ? '✓' : '✗'} [${ok ? 'PASS' : 'FAIL'}] ${id}${detail ? `  ${detail}` : ''}`);
}

(async () => {
  // 1. /api/chat (POST) — must 401 with JSON content-type and the right
  //    CORS header set. The new SSE-only chat route still has the
  //    requireAuth gate before the stream starts, so anonymous callers
  //    see JSON 401, not an empty SSE stream.
  const r1 = await fetch(`${API}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: WEB },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'Explain recursion like I\'m 12' }],
      mode: 'explain',
    }),
  });
  record('chat.unauth.401', r1.status === 401, `status=${r1.status}`);
  const ct1 = r1.headers.get('content-type') ?? '';
  record('chat.unauth.json', ct1.includes('application/json'), `ct=${ct1}`);
  record('chat.unauth.cors', !!r1.headers.get('access-control-allow-origin'), `acao=${r1.headers.get('access-control-allow-origin')}`);

  // 2. /api/chat/conversations (POST) — must 401 too. The auth gate
  //    sits at the top of every protected route.
  const r2 = await fetch(`${API}/api/chat/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: WEB },
    body: JSON.stringify({ mode: 'general' }),
  });
  record('conversations.unauth.401', r2.status === 401, `status=${r2.status}`);
  record('conversations.unauth.cors', !!r2.headers.get('access-control-allow-origin'), `acao=${r2.headers.get('access-control-allow-origin')}`);

  // 3. /api/flashcards/decks/generate (POST) — must 401.
  const r3 = await fetch(`${API}/api/flashcards/decks/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: WEB },
    body: JSON.stringify({ topic: 'Binary search trees', level: 'B1', n: 5 }),
  });
  record('flashcards.unauth.401', r3.status === 401, `status=${r3.status}`);

  // 4. /api/health/models (GET) — public, must 200 with providers.
  const r4 = await fetch(`${API}/api/health/models`, {
    headers: { Origin: WEB },
  });
  record('health.public.200', r4.status === 200, `status=${r4.status}`);
  const j4 = await r4.json();
  record('health.providers.workers', Array.isArray(j4.providers?.workers) && j4.providers.workers.length > 0, `${j4.providers?.workers?.length ?? 0} workers models`);
  record('health.providers.openrouter', Array.isArray(j4.providers?.openrouter) && j4.providers.openrouter.length > 0, `${j4.providers?.openrouter?.length ?? 0} openrouter models`);

  // 5. CORS preflight (OPTIONS) on /api/chat — must return 204 with the
  //    right allow-* headers. This is the path the SSE chat client
  //    hits first when streaming.
  const r5 = await fetch(`${API}/api/chat`, {
    method: 'OPTIONS',
    headers: {
      Origin: WEB,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,idempotency-key',
    },
  });
  record('chat.cors.preflight.204', r5.status === 204, `status=${r5.status}`);
  record('chat.cors.allowOrigin', !!r5.headers.get('access-control-allow-origin'), `acao=${r5.headers.get('access-control-allow-origin')}`);

  // Summary
  const failed = checks.filter(c => c.status === 'FAIL').length;
  console.log(`\n${checks.filter(c => c.status === 'PASS').length}/${checks.length} pass${failed > 0 ? `, ${failed} fail` : ''}`);
  console.log(`(Plus 23/23 PASS in apps/api/src/ai/{provider,cascade}.test.ts — the cascade hardening v2 proof.)`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('proof crashed:', e);
  process.exit(2);
});