/**
 * 课件版面体检：把每一页渲染成 true-to-size 的 1920x1080 舞台，
 * 逐个文本元素取盒子，报出越界、互相压字、与页脚打架、以及内容溢出画框的页。
 *
 *   npx tsx scripts/deck-audit.ts [projectId] [--shot]
 *
 * projectId 省略时取 store.json 里最近更新的项目。
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { buildDeckSlideHtml } from '../server/deck';
import type { CourseProject } from '../src/types';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA = path.join(ROOT, 'data', 'store.json');

const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean) as string[];

const chrome = chromeCandidates.find((item) => fs.existsSync(item));
if (!chrome) throw new Error('找不到 Chrome / Edge');

const args = process.argv.slice(2);
const wantShot = args.includes('--shot');
const idArg = args.find((item) => !item.startsWith('--'));

const store = JSON.parse(fs.readFileSync(DATA, 'utf8')) as { projects: CourseProject[] };
const project = idArg
  ? store.projects.find((item) => item.id === idArg)
  : [...store.projects].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
if (!project) throw new Error('没有找到项目');

const outDir = path.join(ROOT, '.deck-audit', project.id);
fs.mkdirSync(outDir, { recursive: true });

interface Box {
  sel: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const STAGE_W = 1920;
const STAGE_H = 1080;

const browser = await chromium.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage({ viewport: { width: STAGE_W, height: STAGE_H }, deviceScaleFactor: 1 });

let problems = 0;
const total = project.slides.length;

for (const [index, slide] of project.slides.entries()) {
  const html = buildDeckSlideHtml(slide, { ...project, slides: project.slides }, total);
  const htmlPath = path.join(outDir, `audit-${String(index + 1).padStart(2, '0')}.html`);
  fs.writeFileSync(htmlPath, html, 'utf8');
  await page.goto('file:///' + htmlPath.split(path.sep).join('/'), { waitUntil: 'load' });
  await page.evaluate(() => (document as any).fonts?.ready);
  await page.waitForTimeout(120);

  // 用字符串形式注入，避免打包器注入的 helper 在页面上下文中不存在（__name）。
  const measures = await page.evaluate(`(() => {
    const out = { boxes: [], overflow: null, frameOverflow: null, docScroll: {} };
    const isTextLeaf = (el) => {
      if (!(el instanceof HTMLElement)) return false;
      const hasOwnText = Array.from(el.childNodes).some(
        (node) => node.nodeType === 3 && (node.textContent || '').trim().length > 0
      );
      if (!hasOwnText) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const all = Array.from(document.querySelectorAll('.slide *')).filter(isTextLeaf);
    for (const el of all) {
      const rect = el.getBoundingClientRect();
      out.boxes.push({
        sel:
          el.tagName.toLowerCase() +
          (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : ''),
        text: (el.textContent || '').trim().slice(0, 28),
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        w: Math.round(rect.width),
        h: Math.round(rect.height)
      });
    }
    const body = document.querySelector('.body');
    if (body instanceof HTMLElement) {
      out.overflow = { scrollH: body.scrollHeight, clientH: body.clientHeight };
    }
    const frame = document.querySelector('.frame');
    if (frame instanceof HTMLElement) {
      out.frameOverflow = { scrollH: frame.scrollHeight, clientH: frame.clientHeight };
    }
    out.figures = Array.from(document.querySelectorAll('.figure, .single-figure')).map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        sel: el.className,
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        w: Math.round(rect.width),
        h: Math.round(rect.height)
      };
    });
    out.docScroll = { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight };
    return out;
  })()`);

  const boxes = measures.boxes as Box[];
  const issues: string[] = [];

  for (const box of boxes) {
    if (box.y + box.h > STAGE_H + 1) issues.push(`越出下边界 ${box.y + box.h}px：${box.text}`);
    if (box.x + box.w > STAGE_W + 1) issues.push(`越出右边界 ${box.x + box.w}px：${box.text}`);
    if (box.x < -1) issues.push(`越出左边界 ${box.x}px：${box.text}`);
  }

  const foot = boxes.find((box) => box.sel.includes('foot'));
  if (foot) {
    for (const box of boxes) {
      if (box.sel.includes('foot')) continue;
      const overlapY = Math.min(box.y + box.h, foot.y + foot.h) - Math.max(box.y, foot.y);
      const overlapX = Math.min(box.x + box.w, foot.x + foot.w) - Math.max(box.x, foot.x);
      if (overlapY > 4 && overlapX > 4) issues.push(`压到页脚：${box.text}`);
    }
  }

  const n = boxes.length;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      // 父子嵌套（如 .foot 与其内部 span）不算重叠。
      const contains =
        (a.x <= b.x + 2 && a.y <= b.y + 2 && a.x + a.w >= b.x + b.w - 2 && a.y + a.h >= b.y + b.h - 2) ||
        (b.x <= a.x + 2 && b.y <= a.y + 2 && b.x + b.w >= a.x + a.w - 2 && b.y + b.h >= a.y + a.h - 2);
      if (contains) continue;
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 6 && oy > 6) {
        const area = ox * oy;
        const small = Math.min(a.w * a.h, b.w * b.h);
        if (area / small > 0.12) {
          issues.push(`文字互相重叠：「${a.text}」×「${b.text}」`);
        }
      }
    }
  }

  if (measures.overflow && measures.overflow.scrollH > measures.overflow.clientH + 2) {
    issues.push(`正文溢出画框 ${measures.overflow.scrollH - measures.overflow.clientH}px`);
  }

  const figures = (measures.figures ?? []) as Box[];
  for (const figure of figures) {
    if (figure.y + figure.h > STAGE_H - 60) issues.push(`图片越过页脚线（底边 ${figure.y + figure.h}px）`);
    if (figure.h < 200) issues.push(`图片高度只有 ${figure.h}px，偏小`);
    if (foot) {
      const overlapY = Math.min(figure.y + figure.h, foot.y + foot.h) - Math.max(figure.y, foot.y);
      if (overlapY > 4) issues.push('图片压到页脚');
    }
  }
  if (measures.docScroll.h > STAGE_H + 1) issues.push(`文档高度 ${measures.docScroll.h}px 超过 1080`);

  if (wantShot) {
    await page.screenshot({ path: path.join(outDir, `audit-${String(index + 1).padStart(2, '0')}.png`) });
  }

  const head = `第 ${index + 1} 页 [${slide.layout}] ${slide.title}`;
  if (issues.length) {
    problems += issues.length;
    console.log(`\n✗ ${head}`);
    for (const issue of [...new Set(issues)]) console.log('   · ' + issue);
  } else {
    console.log(`✓ ${head}`);
  }
}

await browser.close();
console.log(`\n共 ${total} 页，问题 ${problems} 处。输出：${outDir}`);
