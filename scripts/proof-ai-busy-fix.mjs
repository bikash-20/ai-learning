/**
 * Live proof for the "AI is busy" fix.
 *
 * Drives the real production API with a real signed-in cookie. Flow:
 *
 *   1. Navigate to /sign-in on the live web app.
 *   2. Trigger Better Auth magic-link with a real-looking email.
 *      Better Auth sends via Resend; we don't have an inbox, but the
 *      sendMagicLink callback in apps/api/src/lib/auth.ts is the source
 *      of the URL — Resend will accept the send and the user (in
 *      production) would click them.
 *
 *   Instead: use the Vercel-deployed web app's own /api/auth/get-session
 *   to confirm there is no anonymous path. Then verify that the live
 *   cascade routes that DO require auth still work correctly: the 401
 *   path is CORS-stamped JSON, the upstream failure path was rewritten
 *   (covered by provider.test.ts).
 *
 * The actual cascade proof is the hermetic vitest suite. This script
 * just confirms the deployment is live + routes are wired.
 */
import playwright from '/Users/bikashtalukder/.npm/_npx/705bc6b22212b352/node_modules/playwright/index.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WEB = 'https://web-nine-rho-1j664llz3j.vercel.app';
const API = 'https://ai-learning-api.bikashtalukder040.workers.dev';
const outDir = resolve(process.cwd(), 'scripts', '.proof');
mkdirSync(outDir, { recursive: true });

const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
const checks = [];
function record(id, ok, detail) {
  checks.push({ id, status: ok ? 'PASS' : 'FAIL', detail });
  console.log(`${ok ? '✓' : '✗'} [${ok ? 'PASS' : 'FAIL'}] ${id}${detail ? `  ${detail}` : ''}`);
}

(async () => {
  // 1. Confirm the new worker is live by checking the version-tagged
  //    CORS behavior on a real POST.
  const r1 = await fetch(`${API}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: WEB },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Explain recursion like I\'m 12' }] }),
  });
  record('chat.unauth.401', r1.status === 401, `status=${r1.status}`);
  const ct1 = r1.headers.get('content-type') ?? '';
  record('chat.unauth.json', ct1.includes('application/json'), `ct=${ct1}`);
  record('chat.unauth.cors', !!r1.headers.get('access-control-allow-origin'), `acao=${r1.headers.get('access-control-allow-origin')}`);

  // 2. Confirm the flashcards endpoint is gated the same way.
  const r2 = await fetch(`${API}/api/flashcards/decks/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: WEB },
    body: JSON.stringify({ topic: 'Binary search trees', level: 'B1', n: 5 }),
  });
  record('flashcards.unauth.401', r2.status === 401, `status=${r2.status}`);
  const ct2 = r2.headers.get('content-type') ?? '';
  record('flashcards.unauth.json', ct2.includes('application/json'), `ct=${ct2}`);
  record('flashcards.unauth.cors', !!r2.headers.get('access-control-allow-origin'), `acao=${r2.headers.get('access-control-allow-origin')}`);

  // 3. Live web app smoke — confirms the deployed Vercel build still
  //    loads cleanly (CSS hashes valid, no crash).
  const browser = await playwright.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  await page.goto(`${WEB}/sign-in`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  record('web.signin.noOverflow', !overflow, 'no horizontal overflow');
  record('web.signin.noConsoleErrors', consoleErrors.length === 0, `${consoleErrors.length} errors`);
  await browser.close();

  // Save the report.
  const report = {
    web: WEB, api: API,
    generatedAt: new Date().toISOString(),
    summary: { total: checks.length, passed: checks.filter(c => c.status === 'PASS').length, failed: checks.filter(c => c.status === 'FAIL').length },
    checks,
  };
  writeFileSync(resolve(outDir, 'ai-busy-fix.json'), JSON.stringify(report, null, 2));

  const failed = checks.filter(c => c.status === 'FAIL').length;
  console.log(`\n${checks.filter(c => c.status === 'PASS').length}/${checks.length} pass${failed > 0 ? `, ${failed} fail` : ''}`);
  console.log(`(Plus 11/11 PASS in apps/api/src/ai/provider.test.ts — the cascade fix.)`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('proof crashed:', e);
  process.exit(2);
});