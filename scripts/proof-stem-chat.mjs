/**
 * Live proof for the STEM tutor chat redesign.
 *
 * Captures:
 *  - The new Vercel chat bundle has the new STEM-flavored strings
 *    (mode chip labels, QuickStart prompts, sidebar text, ChatHistory)
 *  - The OLD "All AI models are busy" / English-only subtitle strings
 *    are gone
 *  - /api/chat/conversations responds 401 + CORS when unauthenticated
 *  - /api/health/models is healthy
 *  - Playwright headless nav to /chat and /explore (signed out) so we
 *    capture the new copy in the rendered DOM
 *
 * Outputs scripts/.proof/stem-chat.json with all evidence.
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

// 1) Discover the new chat bundle from Vercel.
log('discovering chat bundle from /chat HTML …');
const html = await (await fetch(`${WEB}/chat`)).text();
const chatBundleMatch = html.match(/chat\/page-([0-9a-f]+)\.js/);
const chatBundle = chatBundleMatch ? `page-${chatBundleMatch[1]}.js` : null;
log(`chat bundle: ${chatBundle}`);

// 2) Inspect the new bundle for STEM identifiers.
log('fetching bundle and searching for new STEM identifiers …');
const bundleUrl = `https://web-nine-rho-1j664llz3j.vercel.app/_next/static/chunks/app/(app)/chat/${chatBundle}`;
const bundleSrc = await (await fetch(bundleUrl)).text();

const NEW_IDENTIFIERS = [
  // Mode chip labels
  'General',
  'Code',
  'Math',
  'Theory',
  'Explain',
  // QuickStart prompts
  'Explain bubble sort',
  'time complexity of a hash table',
  'recursive Fibonacci',
  'Explain recursion',
  'Pythagorean identity',
  // Sidebar
  'History',
  'New chat',
  'Rename',
  'Delete',
  'No conversations yet',
  // Chat input
  'Ask anything',
  'Stop',
  'Message',
  // PageHeader subtitle (STEM framing)
  'Ask anything CS, math, or code',
  // Conversation endpoint
  '/api/chat/conversations',
  // Tailwind classes used by the new components
  'prose-quiet',
  'flex flex-1 flex-col gap-3 overflow-hidden p-3',
];

const LEGACY_IDENTIFIERS = [
  // Old chat subtitle (English-focused)
  'Ask anything. The tutor streams back.',
  // Old empty state hint (English-focused)
  "Explain the difference between 'for' and 'since'",
];

const foundNew = NEW_IDENTIFIERS.filter((s) => bundleSrc.includes(s));
const foundLegacy = LEGACY_IDENTIFIERS.filter((s) => bundleSrc.includes(s));
log(`new STEM identifiers in bundle: ${foundNew.length}/${NEW_IDENTIFIERS.length}`);
if (foundNew.length < NEW_IDENTIFIERS.length) {
  const missing = NEW_IDENTIFIERS.filter((s) => !foundNew.includes(s));
  log(`  missing: ${missing.join(', ')}`);
}
log(`legacy English-only identifiers in bundle: ${foundLegacy.length}/${LEGACY_IDENTIFIERS.length}`);
if (foundLegacy.length > 0) log(`  STILL PRESENT: ${foundLegacy.join(', ')}`);

capture.steps.push({
  step: 'chat bundle inspection',
  chatBundle,
  newIdentifiers: foundNew,
  missing: NEW_IDENTIFIERS.filter((s) => !foundNew.includes(s)),
  legacyIdentifiers: foundLegacy,
});

// 3) Conversation endpoints — CORS + 401 (unauthenticated).
log('GET /api/chat/conversations (no auth) …');
const convRes = await fetch(`${API}/api/chat/conversations`, { headers: { Origin: WEB } });
const convHeaders = Object.fromEntries(convRes.headers);
const convBody = await convRes.text();
log(`  status: ${convRes.status}`);
log(`  ACAO: ${convHeaders['access-control-allow-origin']}`);
log(`  body: ${convBody.slice(0, 200)}`);

capture.steps.push({
  step: 'GET /api/chat/conversations (no auth)',
  status: convRes.status,
  headers: convHeaders,
  body: convBody,
});

// 4) /api/health/models.
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
  step: 'GET /api/health/models',
  workersHealthy,
  workersTotal,
  openrouter429,
  openrouterTotal,
});

// 5) Playwright headless nav to /explore so we can grab the new copy.
log('starting headless browser …');
const browser = await playwright.chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const requests = [];
page.on('response', (res) => {
  const url = res.url();
  if (url.includes('/api/')) {
    requests.push({ url, status: res.status(), headers: Object.fromEntries(Object.entries(res.headers())) });
  }
});

await page.goto(`${WEB}/explore`, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch((e) => log(`explore nav err: ${e.message}`));
await page.waitForTimeout(2500);
const exploreText = (await page.locator('body').innerText().catch(() => '')) ?? '';
log(`/explore body length: ${exploreText.length}`);
log(`/explore excerpt: ${exploreText.slice(0, 400).replace(/\s+/g, ' ')}`);

await page.goto(`${WEB}/chat`, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch((e) => log(`chat nav err: ${e.message}`));
await page.waitForTimeout(2500);
const chatText = (await page.locator('body').innerText().catch(() => '')) ?? '';
log(`/chat body length: ${chatText.length}`);

// Check whether the new copy is in the rendered page.
const exploreHasNewTagline = exploreText.includes('An AI tutor for CS, math, physics, and code');
const exploreHasOldTagline = exploreText.includes('AI-powered English practice');
log(`/explore has new STEM tagline: ${exploreHasNewTagline}`);
log(`/explore still has old English tagline: ${exploreHasOldTagline}`);

// Screenshot /explore so we have visual proof.
const exploreScreenshot = await page.screenshot({ path: resolve(outDir, 'chat-explore-signed-out.png'), fullPage: false });
log(`saved screenshot: scripts/.proof/chat-explore-signed-out.png`);

capture.steps.push({
  step: 'playwright /explore (no auth)',
  visibleText: exploreText.slice(0, 800),
  hasNewTagline: exploreHasNewTagline,
  hasOldTagline: exploreHasOldTagline,
  networkRequests: requests,
});

writeFileSync(resolve(outDir, 'stem-chat.json'), JSON.stringify(capture, null, 2));
log(`saved ${outDir}/stem-chat.json`);
await browser.close();
log('done');