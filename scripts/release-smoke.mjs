import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = (process.argv[2] || 'http://127.0.0.1:8791').replace(/\/$/, '');
const outputDir = path.resolve(process.argv[3] || 'data/ui-check/release-smoke');
fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1
});
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

const targets = [
  ['/', 'dashboard'],
  ['/projects', 'projects'],
  ['/projects/p-lever?stage=script', 'studio-script'],
  ['/projects/p-cell?stage=slides', 'studio-slides'],
  ['/projects/p-poetry?stage=audio', 'studio-audio'],
  ['/agents', 'agents'],
  ['/skills', 'skills'],
  ['/settings', 'settings']
];

const report = [];
for (const [route, name] of targets) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: true });
  report.push({
    name,
    route,
    ...(await page.evaluate(() => {
      const doc = document.documentElement;
      const overflowing = [...document.querySelectorAll('*')]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return false;
          return rect.right > doc.clientWidth + 1 || rect.left < -1;
        })
        .slice(0, 8)
        .map((element) => ({
          tag: element.tagName,
          className: String(element.className).slice(0, 80),
          text: (element.textContent || '').trim().slice(0, 50)
        }));
      return {
        title: document.title,
        bodyWidth: document.body.scrollWidth,
        viewportWidth: doc.clientWidth,
        hasSidebar: Boolean(document.querySelector('nav, aside')),
        hasDrawerTrigger: Boolean(document.querySelector('.runtime-drawer-trigger')),
        overflowing
      };
    }))
  });
}

await page.goto(`${baseUrl}/projects/p-lever?stage=script`, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const closed = await page.evaluate(() => ({
  drawerOpen: Boolean(document.querySelector('#runtime-drawer')),
  triggerVisible: Boolean(document.querySelector('.runtime-drawer-trigger'))
}));
await page.getByRole('button', { name: '打开智能体与运行面板' }).click();
await page.waitForTimeout(350);
const openedTabs = await page.evaluate(() => ({
  drawerOpen: Boolean(document.querySelector('#runtime-drawer')),
  tabs: [...document.querySelectorAll('.runtime-drawer-tabs button')].map((item) =>
    item.textContent?.trim()
  )
}));
await page.screenshot({ path: path.join(outputDir, 'runtime-drawer-open.png') });
await page.keyboard.press('Escape');
await page.waitForTimeout(250);
const closedAfterEscape = await page.evaluate(() =>
  Boolean(document.querySelector('#runtime-drawer'))
);

await page.setViewportSize({ width: 390, height: 844 });
for (const [route, name] of [
  ['/', 'dashboard-mobile'],
  ['/projects/p-cell?stage=slides', 'studio-mobile']
]) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: true });
  report.push({
    name,
    route,
    ...(await page.evaluate(() => ({
      bodyWidth: document.body.scrollWidth,
      viewportWidth: document.documentElement.clientWidth
    })))
  });
}

const summary = {
  baseUrl,
  consoleErrors,
  drawer: { closed, openedTabs, closedAfterEscape },
  report
};
fs.writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
await browser.close();
