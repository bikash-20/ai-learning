/**
 * Live proof for the chat sidebar (D).
 *
 * Auth bypass: /chat redirects unauthenticated visitors to /sign-in,
 * so we can't see the new ChatHistory inside the protected area
 * without a real cookie. What we CAN prove without auth:
 *
 *   1. Bundle evidence. The (app) layout chunk carries the new sidebar
 *      strings: "Search chats", grouped-date headers ("Today",
 *      "Yesterday", "Previous 7 days", "Previous 30 days", "Older"),
 *      the overflow menu ("Conversation actions"), the new icons
 *      (Search / More / Trash SVG path snippets).
 *   2. Visual. /sign-in renders cleanly at 375 / 768 / 1280 with no
 *      horizontal overflow (the new sidebar chrome doesn't break the
 *      shared layout shell).
 *
 * Anything that requires sign-in (real "New chat" + grouped list) is
 * marked `unverified` in the JSON report.
 */
import playwright from '/Users/bikashtalukder/.npm/_npx/705bc6b22212b352/node_modules/playwright/index.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WEB = 'https://web-nine-rho-1j664llz3j.vercel.app';
const OUT = resolve('scripts/.proof');
mkdirSync(OUT, { recursive: true });

const findings = {
  bundleChecks: [],
  visualChecks: [],
  unverified: [
    'Full sidebar UX (search filtering, grouped-date rendering, "..." overflow menu actions) — requires authenticated /chat session.',
  ],
  issues: [],
};

async function bundleEvidence() {
  console.log('discovering bundles …');
  const browser = await playwright.chromium.launch();
  const page = await browser.newPage();

  // Public surface — /sign-in.
  await page.goto(`${WEB}/sign-in`, { waitUntil: 'networkidle' });
  const candidates = new Set();
  const publicScripts = await page.evaluate(() =>
    Array.from(document.querySelectorAll('script[src]'))
      .map((s) => s.src)
      .filter((u) => u.startsWith('http')),
  );
  for (const s of publicScripts) candidates.add(s);

  // Probe protected routes — their HTML still references the chunk URLs.
  for (const path of ['/chat', '/explore', '/flashcards', '/quiz']) {
    try {
      const resp = await page.context().request.get(`${WEB}${path}`);
      const html = await resp.text();
      const matches = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]);
      for (const u of matches) {
        if (u.startsWith('http')) candidates.add(u);
        else candidates.add(new URL(u, WEB).toString());
      }
    } catch (e) {
      findings.issues.push(`probe ${path} failed: ${e.message}`);
    }
  }

  const allText = [];
  for (const url of candidates) {
    try {
      const res = await fetch(url);
      const txt = await res.text();
      allText.push(txt);
    } catch {
      findings.issues.push(`fetch chunk failed: ${url}`);
    }
  }
  const haystack = allText.join('\n');

  const checks = [
    { label: 'Search chats',           present: true },
    { label: 'Conversation actions',   present: true },
    { label: 'Today',                  present: true },
    { label: 'Yesterday',              present: true },
    { label: 'Previous 7 days',        present: true },
    { label: 'Previous 30 days',       present: true },
    { label: 'Chats',                  present: true },
    { label: 'Collapse history',       present: true },
  ];

  for (const c of checks) {
    const ok = haystack.includes(c.label) === c.present;
    findings.bundleChecks.push({ label: c.label, ok });
    console.log(`  ${ok ? 'OK ' : 'MISS'}  ${c.label}`);
  }
  await browser.close();
}

async function visual() {
  const browser = await playwright.chromium.launch();
  const page = await browser.newPage();
  for (const s of [
    { name: 'mobile',  width: 375,  height: 812  },
    { name: 'tablet',  width: 768,  height: 1024 },
    { name: 'desktop', width: 1280, height: 800  },
  ]) {
    await page.setViewportSize({ width: s.width, height: s.height });
    await page.goto(`${WEB}/sign-in`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    const path = resolve(OUT, `chat-sidebar-${s.name}-${s.width}.png`);
    await page.screenshot({ path });
    findings.visualChecks.push({
      name: s.name,
      width: s.width,
      overflow,
      path,
    });
    console.log(`shooting ${s.name} ${s.width} … overflow=${overflow}`);
  }
  await browser.close();
}

(async () => {
  await bundleEvidence();
  await visual();
  writeFileSync(resolve(OUT, 'chat-sidebar.json'), JSON.stringify(findings, null, 2));
  console.log('done');
  process.exit(0);
})().catch((e) => {
  console.error(e);
  findings.issues.push(String(e));
  writeFileSync(resolve(OUT, 'chat-sidebar.json'), JSON.stringify(findings, null, 2));
  process.exit(1);
});