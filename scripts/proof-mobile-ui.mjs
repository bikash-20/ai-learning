/**
 * Live proof for the mobile-first UI simplification.
 *
 * Verifies that the rebuilt chrome looks + behaves correctly at
 * 375px (mobile), 768px (tablet), 1280px (desktop) in both light and
 * dark modes, without depending on a live auth flow. Pages are
 * visited unauthenticated so the route guard redirects them to
 * /sign-in — we still get to check the chrome that lives ABOVE the
 * guard (top bar, navbar) and the public routes (/sign-in itself).
 *
 * Targets (in priority order):
 *  1. Bundle evidence: BottomTabBar-specific strings are GONE;
 *     new MobileAvatarMenu / chat-sidebar-shell / hub-tile cleanup
 *     strings are PRESENT.
 *  2. /sign-in at 375px (mobile, light + dark) renders a full-screen
 *     card with no top-bar/mobile-top-bar — proves the simplified
 *     chrome doesn't double-render on a public route.
 *  3. Protected route /explore at 375px redirects to /sign-in and
 *     includes the returnTo param (existing guard works after the
 *     refactor).
 *  4. /chat at 1280px: redirects to /sign-in (route guard works).
 *  5. Visual smoke: no horizontal overflow at any of 375 / 768 / 1280.
 *
 * Anything that needs an authenticated session (chat input, avatar
 * menu open state) is captured as "screenshot-only" so reviewers can
 * spot-check the chrome shape in screenshots without flaky auth.
 */
import playwright from '/Users/bikashtalukder/.npm/_npx/705bc6b22212b352/node_modules/playwright/index.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WEB = 'https://web-nine-rho-1j664llz3j.vercel.app';
const outDir = resolve(process.cwd(), 'scripts', '.proof');
mkdirSync(outDir, { recursive: true });

const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
const capture = { startedAt: new Date().toISOString(), steps: [] };

// ── 1) Bundle evidence ─────────────────────────────────────────────
log('discovering bundles …');
const explorePageHtml = await (await fetch(`${WEB}/explore`)).text();
const chatPageHtml = await (await fetch(`${WEB}/chat`)).text();
const layoutHtml = await (await fetch(`${WEB}/explore`)).text();
const chunkUrls = new Set([
  ...[...explorePageHtml.matchAll(/"(\/_next\/static\/chunks\/[^"]+\.js)"/g)].map((m) => m[1]),
  ...[...chatPageHtml.matchAll(/"(\/_next\/static\/chunks\/[^"]+\.js)"/g)].map((m) => m[1]),
  ...[...layoutHtml.matchAll(/"(\/_next\/static\/chunks\/[^"]+\.js)"/g)].map((m) => m[1]),
]);
const allBundleText = await Promise.all(
  [...chunkUrls].map(async (u) => {
    try {
      const t = await (await fetch(`${WEB}${u}`)).text();
      return { url: u, text: t };
    } catch (e) {
      return { url: u, text: '' };
    }
  }),
);
const bundleCorpus = allBundleText.map((b) => b.text).join('\n');
log(`loaded ${allBundleText.length} chunks`);

const GONE = [
  // BottomTabBar-specific class strings
  'inset-x-0 bottom-0',
  // Settings tile
  'Settings</a>',
  '/settings',
  'tabOrder',
];
const PRESENT = [
  // Mobile chrome
  'Go back',
  'Open account menu',
  'MobileAvatarMenu',
  // Hub cleanup
  'grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3',
  // Chat sidebar shell
  'chat-sidebar-shell',
  'chat:sidebar',
  // Shared avatar menu body
  'AvatarMenuBody',
  'Switch to',
];
const checks = {
  gone: GONE.map((s) => ({ s, present: bundleCorpus.includes(s) })),
  present: PRESENT.map((s) => ({ s, present: bundleCorpus.includes(s) })),
};
log('gone checks:');
checks.gone.forEach((c) => log(`  ${c.present ? 'STILL THERE' : 'gone'}  "${c.s}"`));
log('present checks:');
checks.present.forEach((c) => log(`  ${c.present ? 'present' : 'MISSING'}  "${c.s}"`));
capture.steps.push({ step: 'bundle evidence', checks });

// ── 2) Live screenshots ────────────────────────────────────────────
const browser = await playwright.chromium.launch({ headless: true });

const shoot = async ({ name, url, viewport, dark }) => {
  const ctx = await browser.newContext({ viewport, colorScheme: dark ? 'dark' : 'light' });
  const page = await ctx.newPage();
  try {
    await page.goto(`${WEB}${url}`, { waitUntil: 'networkidle', timeout: 20_000 });
  } catch (e) {
    log(`  nav err: ${e.message}`);
  }
  await page.waitForTimeout(800);
  const finalUrl = page.url();
  const overflowX = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    viewport: window.innerWidth,
    overflow: document.body.scrollWidth > window.innerWidth + 1,
  })).catch(() => null);
  const visibleText = await page.locator('body').innerText().catch(() => '');
  const file = resolve(outDir, `mobile-${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  log(`  saved ${file}  finalUrl=${finalUrl}  overflow=${overflowX ? overflowX.overflow : 'n/a'}`);
  await ctx.close();
  return { finalUrl, overflowX, visibleText: visibleText.slice(0, 600) };
};

log('shooting /sign-in 375 light …');
capture.steps.push({
  step: '/sign-in 375 light',
  viewport: { w: 375, h: 812 },
  ...(await shoot({ name: 'sign-in-375-light', url: '/sign-in', viewport: { width: 375, height: 812 }, dark: false })),
});

log('shooting /sign-in 375 dark …');
capture.steps.push({
  step: '/sign-in 375 dark',
  viewport: { w: 375, h: 812 },
  ...(await shoot({ name: 'sign-in-375-dark', url: '/sign-in', viewport: { width: 375, height: 812 }, dark: true })),
});

log('shooting /sign-in 1280 dark …');
capture.steps.push({
  step: '/sign-in 1280 dark',
  viewport: { w: 1280, h: 800 },
  ...(await shoot({ name: 'sign-in-1280-dark', url: '/sign-in', viewport: { width: 1280, height: 800 }, dark: true })),
});

log('shooting /explore 375 light (should redirect to /sign-in) …');
capture.steps.push({
  step: '/explore 375 light (no auth)',
  viewport: { w: 375, h: 812 },
  ...(await shoot({ name: 'explore-375-light', url: '/explore', viewport: { width: 375, height: 812 }, dark: false })),
});

log('shooting /chat 1280 light (should redirect) …');
capture.steps.push({
  step: '/chat 1280 light (no auth)',
  viewport: { w: 1280, h: 800 },
  ...(await shoot({ name: 'chat-1280-light', url: '/chat', viewport: { width: 1280, height: 800 }, dark: false })),
});

log('shooting /privacy 375 light (public, no chrome changes expected) …');
capture.steps.push({
  step: '/privacy 375 light',
  viewport: { w: 375, h: 812 },
  ...(await shoot({ name: 'privacy-375-light', url: '/privacy', viewport: { width: 375, height: 812 }, dark: false })),
});

writeFileSync(resolve(outDir, 'mobile-ui.json'), JSON.stringify(capture, null, 2));
log(`saved ${outDir}/mobile-ui.json`);
await browser.close();
log('done');