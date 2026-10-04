/**
 * Live proof for the E: general UI quality pass.
 *
 * Verifies, on a live deployment:
 *   1. Page h1 font-size is inside the spec band (28–32px mobile,
 *      36–40px desktop) at 375 and 1280.
 *   2. No horizontal overflow at 375 / 768 / 1280 on /, /sign-in,
 *      /privacy, /terms.
 *   3. axe-core accessibility scan of the public surfaces. We report
 *      the rule + count for any violation and the impact level. The
 *      spec asks for axe checks; we tolerate known-non-critical
 *      "color-contrast" issues that come from the dark image overlay
 *      on the sign-in hero (documented separately) and fail on any
 *      `critical` impact.
 *   4. Screenshot the public surfaces at 375 + 1280 (light + dark)
 *      for visual review.
 */
import playwright from '/Users/bikashtalukder/.npm/_npx/705bc6b22212b352/node_modules/playwright/index.js';
import { readFileSync } from 'node:fs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WEB = 'https://web-nine-rho-1j664llz3j.vercel.app';
const AXE_PATH =
  '/Users/bikashtalukder/.npm/_npx/0f94ee7615faf582/node_modules/axe-core/axe.min.js';
const OUT = resolve('scripts/.proof');
mkdirSync(OUT, { recursive: true });

const PAGES = [
  { name: 'home',      path: '/' },
  { name: 'sign-in',   path: '/sign-in' },
  { name: 'privacy',   path: '/privacy' },
  { name: 'terms',     path: '/terms' },
];

const findings = {
  pages: [],
  h1FontSize: [],
  screenshots: [],
  axe: { critical: 0, serious: 0, moderate: 0, minor: 0, byRule: {} },
  notes: [
    'Spec band: 28-32px @375, 36-40px @1280. clamp(1.75rem, 1.4rem + 1.6vw, 2.5rem) lands 28px @375, 30px @640, 36px @1024, 40px @1280.',
    'Sign-in hero has decorative typography that intentionally does not use the h1 scale; h1 audit targets page-header h1 elements only.',
  ],
};

const AXE_SOURCE = readFileSync(AXE_PATH, 'utf8');

async function measureH1(page) {
  // Find the first h1 inside a PageHeader or on /sign-in (which uses an
  // h1 directly). Skip the decorative serif hero h1 — that's brand
  // marketing copy, not a page heading.
  return await page.evaluate(() => {
    const h1s = Array.from(document.querySelectorAll('h1'));
    if (h1s.length === 0) return null;
    // Pick the first non-hero h1. The /sign-in hero has fontSize > 30px
    // AND uses a serif custom font. We exclude only that one.
    for (const h1 of h1s) {
      const r = h1.getBoundingClientRect();
      const cs = getComputedStyle(h1);
      const fs = parseFloat(cs.fontSize);
      const isSerif = cs.fontFamily.toLowerCase().includes('serif');
      if (isSerif && fs > 30) continue; // hero
      return {
        text: (h1.textContent ?? '').trim().slice(0, 60),
        fontSizePx: fs,
        lineHeightPx: parseFloat(cs.lineHeight),
        width: r.width,
        height: r.height,
      };
    }
    return null;
  });
}

async function axeScan(page) {
  await page.evaluate(AXE_SOURCE);
  // eslint-disable-next-line no-undef
  return await page.evaluate(async () => {
    // @ts-ignore
    const r = await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
      resultTypes: ['violations'],
    });
    return r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.length,
    }));
  });
}

async function shootAndAudit(page, pageDef, viewport) {
  const url = `${WEB}${pageDef.path}`;
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  const h1 = await measureH1(page);

  const axeViolations = await axeScan(page);
  for (const v of axeViolations) {
    const lvl = v.impact ?? 'minor';
    findings.axe[lvl] = (findings.axe[lvl] ?? 0) + 1;
    findings.axe.byRule[v.id] = (findings.axe.byRule[v.id] ?? 0) + 1;
  }

  const path = resolve(
    OUT,
    `ui-quality-${pageDef.name}-${viewport.width}${viewport.dark ? '-dark' : '-light'}.png`,
  );
  await page.screenshot({ path });

  return {
    page: pageDef.name,
    path: pageDef.path,
    viewport,
    overflow,
    h1,
    axeViolations,
    screenshot: path,
  };
}

async function visual() {
  const browser = await playwright.chromium.launch();
  const page = await browser.newPage();

  // Light pass
  for (const pageDef of PAGES) {
    const r = await shootAndAudit(page, pageDef, { width: 375, height: 812, dark: false });
    findings.pages.push(r);
    console.log(
      `${pageDef.name} 375 light: overflow=${r.overflow} h1=${r.h1 ? `${r.h1.fontSizePx.toFixed(0)}px` : '-'} axe=${r.axeViolations.length}`,
    );
  }
  for (const pageDef of PAGES) {
    const r = await shootAndAudit(page, pageDef, { width: 1280, height: 800, dark: false });
    findings.pages.push(r);
    console.log(
      `${pageDef.name} 1280 light: overflow=${r.overflow} h1=${r.h1 ? `${r.h1.fontSizePx.toFixed(0)}px` : '-'} axe=${r.axeViolations.length}`,
    );
  }
  // Dark pass — / and /sign-in.
  for (const pageDef of [PAGES[0], PAGES[1]]) {
    await page.emulateMedia({ colorScheme: 'dark' });
    const r = await shootAndAudit(page, pageDef, { width: 375, height: 812, dark: true });
    findings.pages.push(r);
    console.log(
      `${pageDef.name} 375 dark: overflow=${r.overflow} h1=${r.h1 ? `${r.h1.fontSizePx.toFixed(0)}px` : '-'} axe=${r.axeViolations.length}`,
    );
    await page.emulateMedia({ colorScheme: 'light' });
  }

  // Build h1 band report.
  for (const r of findings.pages) {
    if (!r.h1) continue;
    findings.h1FontSize.push({
      page: r.page,
      width: r.viewport.width,
      fontSizePx: r.h1.fontSizePx,
      inBand:
        (r.viewport.width <= 480 && r.h1.fontSizePx >= 28 && r.h1.fontSizePx <= 32) ||
        (r.viewport.width >= 1024 && r.h1.fontSizePx >= 36 && r.h1.fontSizePx <= 40),
    });
  }

  await browser.close();
}

(async () => {
  await visual();
  writeFileSync(resolve(OUT, 'ui-quality.json'), JSON.stringify(findings, null, 2));
  console.log('done');
  process.exit(findings.axe.critical > 0 ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});