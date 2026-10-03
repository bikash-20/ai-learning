/**
 * Live proof for the AI-generated flashcards feature.
 *
 * Captures:
 *  - The new Vercel /flashcards bundle has the AI-flow identifiers
 *    (2-tab "New deck" dialog, "Generate with AI", HINT, AI Explain,
 *    Markdown wrapper, ModelChip usage)
 *  - The old "Add card" / manual-only flow identifiers are also gone
 *    from the bundle
 *  - Every new flashcards endpoint responds 401 + CORS when unauthed
 *  - /api/health/models is healthy
 *  - Playwright headless nav to /flashcards while signed out — proves
 *    the route guard kicks in and the user lands on /sign-in
 *  - Curl POST /api/flashcards/decks/generate (no auth) → 401 + CORS +
 *    friendly JSON code
 *
 * Outputs scripts/.proof/flashcards-live.json + scripts/.proof/flashcards.png.
 */
import playwright from '/Users/bikashtalukder/.npm/_npx/705bc6b22212b352/node_modules/playwright/index.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WEB = 'https://web-nine-rho-1j664llz3j.vercel.app';
const API = 'https://ai-learning-api.bikashtalukder040.workers.dev';
const ORIGIN = WEB;
const outDir = resolve(process.cwd(), 'scripts', '.proof');
mkdirSync(outDir, { recursive: true });

const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

const capture = { startedAt: new Date().toISOString(), steps: [] };

// 1) Discover the new /flashcards bundle and every chunk it imports.
log('discovering /flashcards bundle from Vercel …');
const html = await (await fetch(`${WEB}/flashcards`)).text();
const bundleMatch = html.match(/flashcards\/page-([0-9a-f]+)\.js/);
const bundle = bundleMatch ? `page-${bundleMatch[1]}.js` : null;
log(`flashcards bundle: ${bundle}`);

const chunkUrls = [...html.matchAll(/"(\/_next\/static\/chunks\/[^"]+\.js)"/g)]
  .map((m) => m[1])
  .filter((u) => !u.includes('webpack-') && !u.includes('polyfills') && !u.includes('main-app'));
log(`shared chunks: ${chunkUrls.length}`);

const NEW_IDENTIFIERS = [
  // 2-tab New deck dialog
  'Generate with AI',
  'Manual',
  // AI form fields (real strings in source)
  'sourceText',
  'Paste notes, a chapter',
  // Per-card AI metadata
  'hint',
  'explanation',
  // Study screen helper buttons
  'Hint (H)',
  'AI Explain (E)',
  'simpler',
  'deeper',
  // Deck card actions (real labels)
  'Reset progress',
  'Export JSON',
  'Export CSV',
  // Markdown pipeline (shared component)
  'prose-quiet',
  // Shared primitives
  'Modal',
  'role:"tablist',
  // API routes
  '/api/flashcards/decks/generate',
  '/api/flashcards/decks/import',
  '/api/flashcards/cards',
];

const LEGACY_IDENTIFIERS = [
  // Old text-only manual flow (now lives inside the Manual tab)
  '"Add card"',
];

// Fetch every chunk in parallel and concatenate into one corpus so we
// catch strings that Next split between the page bundle and the shared
// chunks.
const corpusChunks = await Promise.all(
  chunkUrls.map(async (u) => {
    const src = await (await fetch(`${WEB}${u}`)).text();
    return { url: u, bytes: src.length, src };
  }),
);
log(`fetched ${corpusChunks.length} chunks (total ${corpusChunks.reduce((a, c) => a + c.bytes, 0)} bytes)`);
const corpus = corpusChunks.map((c) => c.src).join('\n');

const foundNew = NEW_IDENTIFIERS.filter((s) => corpus.includes(s));
const foundLegacy = LEGACY_IDENTIFIERS.filter((s) => corpus.includes(s));
log(`new identifiers in corpus: ${foundNew.length}/${NEW_IDENTIFIERS.length}`);
if (foundNew.length < NEW_IDENTIFIERS.length) {
  const missing = NEW_IDENTIFIERS.filter((s) => !foundNew.includes(s));
  log(`  missing: ${missing.join(', ')}`);
}
log(`legacy identifiers in corpus: ${foundLegacy.length}/${LEGACY_IDENTIFIERS.length}`);

capture.steps.push({
  step: 'bundle + chunk corpus inspection',
  bundle,
  chunkCount: corpusChunks.length,
  totalBytes: corpusChunks.reduce((a, c) => a + c.bytes, 0),
  newIdentifiers: foundNew,
  missingNew: NEW_IDENTIFIERS.filter((s) => !foundNew.includes(s)),
  legacyIdentifiers: foundLegacy,
  perChunkBytes: corpusChunks.map((c) => ({ url: c.url.split('/').pop(), bytes: c.bytes })),
});

// 2) Probe every new endpoint for 401 + CORS.
log('probing flashcards endpoints (no auth, expect 401 + CORS) …');
const ENDPOINTS = [
  ['POST', '/api/flashcards/decks/generate', { topic: 'x', level: 'B2', n: 3, language: 'en' }],
  ['POST', '/api/flashcards/decks', { title: 'x', topic: 'x', cards: [] }],
  ['POST', '/api/flashcards/decks/abc/cards/more', { topic: 'x', level: 'B2', n: 3, language: 'en' }],
  ['PATCH', '/api/flashcards/decks/abc', { title: 'y' }],
  ['DELETE', '/api/flashcards/decks/abc', null],
  ['POST', '/api/flashcards/decks/abc/reset', null],
  ['GET', '/api/flashcards/decks/abc/export?format=json', null],
  ['POST', '/api/flashcards/decks/import', { format: 'json', data: '{}', source: 'manual' }],
  ['GET', '/api/flashcards/decks/abc/cards', null],
  ['POST', '/api/flashcards/cards/abc/hint', {}],
  ['POST', '/api/flashcards/cards/abc/explain', { depth: 'normal', level: 'B2' }],
];

const endpointResults = [];
for (const [method, path, body] of ENDPOINTS) {
  const init = {
    method,
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
  };
  if (body) init.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, init);
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* not JSON */ }
  endpointResults.push({
    method,
    path,
    status: res.status,
    acao: res.headers.get('access-control-allow-origin'),
    code: parsed?.code ?? null,
    bodyPreview: text.slice(0, 200),
  });
  log(`  ${method} ${path} → ${res.status} code=${parsed?.code ?? '-'} acao=${res.headers.get('access-control-allow-origin') ?? '-'}`);
}

capture.steps.push({ step: 'endpoint 401+CORS probe', endpoints: endpointResults });

// 3) /api/health/models.
log('GET /api/health/models …');
const healthRes = await fetch(`${API}/api/health/models`, { headers: { Origin: ORIGIN } });
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

// 4) Curl POST /api/flashcards/decks/generate explicitly (live evidence in body).
log('POST /api/flashcards/decks/generate (no auth) …');
const genRes = await fetch(`${API}/api/flashcards/decks/generate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
  body: JSON.stringify({ topic: 'Binary search trees', level: 'B2', n: 3, language: 'en' }),
});
const genHeaders = Object.fromEntries(genRes.headers);
const genText = await genRes.text();
let genParsed = null;
try { genParsed = JSON.parse(genText); } catch { /* not JSON */ }
log(`  status: ${genRes.status}`);
log(`  ACAO: ${genHeaders['access-control-allow-origin']}`);
log(`  body: ${genText}`);

capture.steps.push({
  step: 'POST /api/flashcards/decks/generate (no auth)',
  status: genRes.status,
  headers: genHeaders,
  body: genParsed ?? genText,
});

// 5) Playwright headless nav to /flashcards (signed out) — confirm
//    redirect to /sign-in?returnTo=/flashcards and capture screenshot.
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

await page.goto(`${WEB}/flashcards`, { waitUntil: 'networkidle', timeout: 30_000 }).catch((e) => log(`flashcards nav err: ${e.message}`));
await page.waitForTimeout(2000);
const finalUrl = page.url();
log(`/flashcards final URL: ${finalUrl}`);
const visibleText = (await page.locator('body').innerText().catch(() => '')) ?? '';
log(`/flashcards body length: ${visibleText.length}`);
log(`body excerpt: ${visibleText.slice(0, 300).replace(/\s+/g, ' ')}`);

const redirectedToSignIn = finalUrl.includes('/sign-in');
const hasReturnToFlashcards = finalUrl.includes('returnTo=%2Fflashcards') || finalUrl.includes('returnTo=/flashcards');
log(`/flashcards redirected to /sign-in: ${redirectedToSignIn}`);
log(`returnTo=/flashcards present: ${hasReturnToFlashcards}`);

const exploreScreenshot = await page.screenshot({ path: resolve(outDir, 'flashcards.png'), fullPage: false });
log(`saved screenshot: scripts/.proof/flashcards.png`);

capture.steps.push({
  step: 'playwright /flashcards (no auth)',
  finalUrl,
  redirectedToSignIn,
  hasReturnToFlashcards,
  visibleText: visibleText.slice(0, 800),
  networkRequests: requests,
});

writeFileSync(resolve(outDir, 'flashcards-live.json'), JSON.stringify(capture, null, 2));
log(`saved ${outDir}/flashcards-live.json`);
await browser.close();
log('done');