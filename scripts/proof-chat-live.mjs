/**
 * Live proof for /chat "No connection" fix.
 *
 * Captures:
 *  - The new Vercel chat bundle (post-deploy)
 *  - The new error-routing identifiers inside it
 *  - The OLD error-routing identifiers NOT in the bundle
 *  - /api/chat 401 + CORS response (CORS stamp)
 *  - /api/health/models (cascade state — Workers AI healthy, OpenRouter 429ing)
 *
 * Outputs scripts/.proof/chat-live.json with all evidence.
 */
import playwright from '/Users/bikashtalukder/.npm/_npx/705bc6b22212b352/node_modules/playwright/index.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WEB = 'https://web-nine-rho-1j664llz3j.vercel.app';
const API = 'https://ai-learning-api.bikashtalukder040.workers.dev';
const outDir = resolve(process.cwd(), 'scripts', '.proof');
mkdirSync(outDir, { recursive: true });

const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

const capture = {
  startedAt: new Date().toISOString(),
  steps: [],
};

// 1) Find the new chat bundle from Vercel.
log('discovering chat bundle from /chat HTML …');
const html = await (await fetch(`${WEB}/chat`)).text();
const chatBundleMatch = html.match(/chat\/page-([0-9a-f]+)\.js/);
const chatBundle = chatBundleMatch ? `page-${chatBundleMatch[1]}.js` : null;
log(`chat bundle: ${chatBundle}`);

// 2) Fetch the bundle and grep for the new error routing identifiers.
log('fetching bundle and searching for new identifiers …');
const bundleUrl = `https://web-nine-rho-1j664llz3j.vercel.app/_next/static/chunks/app/(app)/chat/${chatBundle}`;
const bundleSrc = await (await fetch(bundleUrl)).text();

const NEW_IDENTIFIERS = [
  'UPSTREAM_AUTH',
  'UPSTREAM_UNAVAILABLE',
  'AI_INVALID_OUTPUT',
  'RATE_LIMITED',
  'UNAUTHORIZED',
  'upstreamMessage',
  'The tutor is busy',
  'cat === \'busy\'',
  'auth',
  'rate_limited',
  'network',
];
const OLD_IDENTIFIERS = [
  '"All AI models are busy"',
  'No connection',
];

const foundNew = NEW_IDENTIFIERS.filter((s) => bundleSrc.includes(s));
const foundOld = OLD_IDENTIFIERS.filter((s) => bundleSrc.includes(s));
log(`new identifiers in bundle: ${foundNew.length}/${NEW_IDENTIFIERS.length}`);
log(`  found: ${foundNew.join(', ')}`);
log(`old identifiers in bundle: ${foundOld.length}/${OLD_IDENTIFIERS.length}`);
if (foundOld.length > 0) log(`  STILL PRESENT: ${foundOld.join(', ')}`);

// 3) /api/chat CORS + 401.
log('POST /api/chat with no auth …');
const chatRes = await fetch(`${API}/api/chat`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Origin: WEB,
    'Idempotency-Key': crypto.randomUUID(),
  },
  body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
});
const chatHeaders = Object.fromEntries(chatRes.headers);
const chatBody = await chatRes.text();
log(`  status: ${chatRes.status}`);
log(`  ACAO: ${chatHeaders['access-control-allow-origin']}`);
log(`  body: ${chatBody}`);

// 4) /api/health/models — cascade state.
log('GET /api/health/models …');
const healthRes = await fetch(`${API}/api/health/models`, { headers: { Origin: WEB } });
const healthBody = await healthRes.json();
const workersHealthy = healthBody.providers.workers.filter((m) => m.ok).length;
const workersTotal = healthBody.providers.workers.length;
const openrouter429 = healthBody.providers.openrouter.filter((m) => m.status === 429).length;
const openrouterTotal = healthBody.providers.openrouter.length;
log(`  workers: ${workersHealthy}/${workersTotal} healthy`);
log(`  openrouter: ${openrouter429}/${openrouterTotal} returning 429`);

capture.steps.push({
  step: 'bundle inspection',
  chatBundle,
  newIdentifiers: foundNew,
  missingNew: NEW_IDENTIFIERS.filter((s) => !foundNew.includes(s)),
  oldIdentifiers: foundOld,
});
capture.steps.push({
  step: 'POST /api/chat (no auth)',
  status: chatRes.status,
  headers: chatHeaders,
  body: chatBody,
});
capture.steps.push({
  step: 'GET /api/health/models',
  workersHealthy,
  workersTotal,
  openrouter429,
  openrouterTotal,
});

writeFileSync(resolve(outDir, 'chat-live.json'), JSON.stringify(capture, null, 2));
log(`saved ${outDir}/chat-live.json`);

// 5) Optional Playwright nav.
log('starting headless browser …');
const browser = await playwright.chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
const requests = [];
page.on('response', (res) => {
  const url = res.url();
  if (url.includes('/api/')) {
    requests.push({ url, status: res.status(), headers: Object.fromEntries(Object.entries(res.headers())) });
  }
});

await page.goto(`${WEB}/chat`, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch((e) => log(`nav err: ${e.message}`));
await page.waitForTimeout(3000);
const visibleText = (await page.locator('body').innerText().catch(() => '')) ?? '';
log(`page body length: ${visibleText.length}`);
log(`body excerpt: ${visibleText.slice(0, 300).replace(/\s+/g, ' ')}`);
capture.steps.push({
  step: 'playwright /chat (no auth)',
  visibleText: visibleText.slice(0, 800),
  networkRequests: requests,
});

writeFileSync(resolve(outDir, 'chat-live.json'), JSON.stringify(capture, null, 2));
await browser.close();
log('done');