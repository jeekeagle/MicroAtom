import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const outputDir = path.resolve('data/ui-check');
fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

const report = [];

async function snapshot(name) {
  await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: false });
  report.push({
    name,
    ...(await page.evaluate(() => {
      const drawer = document.querySelector('#runtime-drawer');
      const trigger = document.querySelector('.runtime-drawer-trigger');
      const scrim = document.querySelector('.runtime-drawer-scrim');
      const rect = drawer?.getBoundingClientRect();
      return {
        drawerOpen: Boolean(drawer),
        triggerVisible: Boolean(trigger),
        scrimVisible: Boolean(scrim),
        drawerRect: rect
          ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
          : null,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        bodyOverflow: document.body.style.overflow,
        tabs: [...document.querySelectorAll('.runtime-drawer-tabs button')].map((item) =>
          item.textContent?.trim()
        ),
        scrollHeight: document.querySelector('.runtime-drawer-scroll')?.scrollHeight ?? null,
        clientHeight: document.querySelector('.runtime-drawer-scroll')?.clientHeight ?? null
      };
    }))
  });
}

await page.goto('http://127.0.0.1:5173/projects/p-lever?stage=script', {
  waitUntil: 'networkidle'
});
await page.waitForTimeout(400);
await snapshot('runtime-drawer-closed-desktop');
await page.getByRole('button', { name: '打开智能体与运行面板' }).click();
await page.waitForTimeout(350);
await snapshot('runtime-drawer-status-desktop');

for (const [label, name] of [
  ['智能体', 'runtime-drawer-activity-desktop'],
  ['调度', 'runtime-drawer-dispatch-desktop']
]) {
  await page.locator('.runtime-drawer-tabs button', { hasText: label }).click();
  await page.waitForTimeout(250);
  await snapshot(name);
}

await page.keyboard.press('Escape');
await page.waitForTimeout(250);
await snapshot('runtime-drawer-closed-after-escape');

await page.setViewportSize({ width: 390, height: 844 });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.getByRole('button', { name: '打开智能体与运行面板' }).click();
await page.waitForTimeout(350);
await snapshot('runtime-drawer-status-mobile');

const reportPath = path.join(outputDir, 'runtime-drawer-report.json');
fs.writeFileSync(reportPath, JSON.stringify({ report, errors }, null, 2));
console.log(JSON.stringify({ report, errors }, null, 2));
await browser.close();
