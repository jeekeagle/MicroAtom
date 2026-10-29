import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const outputDir = path.resolve('data/ui-check');
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
  await page.goto(`http://127.0.0.1:5173${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: true });
  const metrics = await page.evaluate(() => {
    const body = document.body;
    const doc = document.documentElement;
    const overflowing = [...document.querySelectorAll('*')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        return rect.right > doc.clientWidth + 1 || rect.left < -1;
      })
      .slice(0, 12)
      .map((element) => ({
        tag: element.tagName,
        className: String(element.className).slice(0, 100),
        text: (element.textContent || '').trim().slice(0, 60),
        rect: element.getBoundingClientRect().toJSON()
      }));
    return {
      title: document.title,
      bodyWidth: body.scrollWidth,
      viewportWidth: doc.clientWidth,
      scrollHeight: body.scrollHeight,
      overflowing
    };
  });
  report.push({ name, route, ...metrics });
}

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
const newCourseButton = page.getByRole('button', { name: /新建课程|创建课程|新建/ }).first();
if (await newCourseButton.count()) {
  await newCourseButton.click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outputDir, 'new-project-dialog.png'), fullPage: true });
  report.push({
    name: 'new-project-dialog',
    ...(await page.evaluate(() => ({
      dialogHeight: document.querySelector('[role="dialog"]')?.getBoundingClientRect().height ?? null,
      viewportHeight: window.innerHeight
    })))
  });
  await page.keyboard.press('Escape');
}

await page.setViewportSize({ width: 390, height: 844 });
for (const [route, name] of [
  ['/', 'dashboard-mobile'],
  ['/projects/p-cell?stage=slides', 'studio-mobile']
]) {
  await page.goto(`http://127.0.0.1:5173${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: true });
  report.push({
    name,
    ...(await page.evaluate(() => ({
      bodyWidth: document.body.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      scrollHeight: document.body.scrollHeight
    })))
  });
}

fs.writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify({ report, consoleErrors }, null, 2));
console.log(JSON.stringify({ report, consoleErrors }, null, 2));
await browser.close();
