import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type {
  CourseProject,
  CourseScript,
  CourseSlide,
  RuntimeSettings,
  ScriptSection
} from '../src/types';
import { callModel, parseJsonLoose } from './llm';

const nodeRequire = createRequire(import.meta.url);

/**
 * PDF 导入：把现成的 PDF 讲义拆成逐页课件，并给出可直接朗读的口播稿。
 *
 * 思路很朴素——老师手里的 PDF 多半是已经排好版的讲义或旧 PPT 导出件，
 * 重排会丢掉图表和公式。所以这里不走"拆版重新排版"，而是把每一页按
 * 1920×1080 舞台等比铺满渲染成图，讲义原样搬进课件，讲稿另配。
 * 这样"讲的"和"放的"都是同一份内容，不会出现一页变两页的错位。
 *
 * 渲染交给浏览器（pdfjs + Canvas）：PDF 里嵌字缺失时要靠字形路径填充，
 * 服务端画布对 Path2D 的支持有坑，个别页会整段文字消失。
 */

/* ------------------------------------------------------------
   pdfjs（只用来读文本）
   ------------------------------------------------------------ */

type AnyModule = Record<string, any>;

let pdfjsModule: AnyModule | null = null;
let pdfjsLoading: Promise<AnyModule> | null = null;

async function loadPdfjs() {
  if (pdfjsModule) return pdfjsModule;
  if (!pdfjsLoading) {
    pdfjsLoading = (async () => {
      const specifier = 'pdfjs-dist/legacy/build/pdf.mjs';
      const mod = (await import(specifier)) as AnyModule;
      pdfjsModule = mod;
      return mod;
    })();
  }
  return pdfjsLoading;
}

const pdfjsRoot = () => path.dirname(nodeRequire.resolve('pdfjs-dist/package.json'));

const asFileUrl = (dir: string) => `file:///${dir.split(path.sep).join('/')}/`;

/* ------------------------------------------------------------
   读文本
   ------------------------------------------------------------ */

export interface PdfPageText {
  /** 1 起算的原始页码。 */
  index: number;
  title: string;
  text: string;
  width: number;
  height: number;
}

export interface PdfSession {
  pageCount: number;
  docTitle: string;
  readPages: (from: number, to: number) => Promise<PdfPageText[]>;
  dispose: () => Promise<void>;
}

/**
 * 「部首补充」区（U+2E80–U+2EFF）没有兼容分解，NFKC 折不动它，
 * 只能自己列表。每一对都用同字号渲染比对过，左右字形完全一致。
 * 不覆盖全表，只收简体正文里真会出现的这些。
 */
const RADICAL_SUPPLEMENT: Record<string, string> = {
  '\u2E9F': '母',
  '\u2EA0': '民',
  '\u2EA7': '牛',
  '\u2EA9': '王',
  '\u2EBC': '月',
  '\u2EC4': '西',
  '\u2EC5': '见',
  '\u2EC6': '角',
  '\u2EC8': '讠',
  '\u2EC9': '贝',
  '\u2ECB': '车',
  '\u2ECC': '辶',
  '\u2ECD': '辶',
  '\u2ECF': '阝',
  '\u2ED0': '钅',
  '\u2ED3': '长',
  '\u2ED4': '门',
  '\u2ED6': '阝',
  '\u2ED8': '青',
  '\u2ED9': '韦',
  '\u2EDA': '页',
  '\u2EDB': '风',
  '\u2EDC': '飞',
  '\u2EDD': '食',
  '\u2EE2': '马',
  '\u2EE5': '鱼',
  '\u2EE6': '鸟',
  '\u2EEC': '齐',
  '\u2EEE': '齿',
  '\u2EF0': '龙',
  '\u2EF3': '龟'
};

/**
 * 有些 PDF 的 ToUnicode 表把汉字映射到「康熙部首」区（U+2F00–U+2FD5）或兼容汉字区，
 * 抽出来是「⼯作」「⽅法」这种长得一样、码位不同的字。直接喂给模型会被原样抄进讲稿，
 * TTS 读的时候也可能漏字。
 *
 * 这里只对这几个区做逐字折叠（⼯ → 工），不用整串 NFKC——整串会把全角标点
 * 一起压成半角，中文标题里的「，」「：」就变成英文逗号冒号了。
 */
const normalizeGlyphs = (raw: string) => {
  if (!/[\u2E80-\u2FDF\uF900-\uFAFF]/.test(raw)) return raw;
  return raw.replace(/[\u2E80-\u2FDF\uF900-\uFAFF]/g, (char) => {
    const known = RADICAL_SUPPLEMENT[char];
    if (known) return known;
    try {
      return char.normalize('NFKC');
    } catch {
      return char;
    }
  });
};

const CJK = '\u3400-\u4dbf\u4e00-\u9fff';

/**
 * PDF 里的大标题常带字距，抽出来是「智 能 体 与 既 有 工 作」。
 * 这种串直接写进讲稿，TTS 会一字一顿地念，必须先把汉字之间的空白吃掉。
 */
const tidyLine = (raw: string) =>
  normalizeGlyphs(raw)
    .replace(new RegExp(`(?<=[${CJK}])[\\s\\u3000]+(?=[${CJK}])`, 'g'), '')
    .replace(/[\s\u3000]+/g, ' ')
    .trim();

/** 纯页码行（"12" / "第 12 页"）对讲稿没用，还会被念出来，直接扔掉。 */
const isPageNumber = (text: string) => /^\d{1,3}$/.test(text) || /^第\s*\d+\s*页$/.test(text);

/** 章节序号行："壹""贰 06""第三章"——字号最大但根本不是标题。 */
const isChapterMark = (text: string) =>
  /^[一二三四五六七八九十壹贰叁肆伍陆柒捌玖拾]+[\s\d·、.．]*$/.test(text) ||
  /^第\s*[一二三四五六七八九十\d]+\s*[章节讲部分]\s*$/.test(text);

const cleanText = (raw: string) =>
  normalizeGlyphs(raw)
    .replace(/\u0000/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();

interface TextLine {
  text: string;
  size: number;
}

/** 把一页的文字块按行聚起来，同时记下每行字号，用来判断哪行是标题。 */
function groupLines(items: AnyModule[]): TextLine[] {
  const lines: TextLine[] = [];
  let current = '';
  let size = 0;
  for (const item of items) {
    const chunk = typeof item?.str === 'string' ? normalizeGlyphs(item.str) : '';
    if (chunk) {
      current += chunk;
      size = Math.max(size, Number(item?.height) || 0);
    }
    if (item?.hasEOL) {
      const line = tidyLine(current);
      if (line) lines.push({ text: line, size });
      current = '';
      size = 0;
    }
  }
  const line = tidyLine(current);
  if (line) lines.push({ text: line, size });
  return lines;
}

/** 标题＝全页字号最大、长度又说得过去的那一行，且不能是章节序号或页码。 */
function guessTitle(lines: TextLine[]): string {
  const usable = lines
    .filter((line) => line.text.length >= 2 && line.text.length <= 42)
    .filter((line) => new RegExp(`[${CJK}A-Za-z]`).test(line.text))
    .filter((line) => !isPageNumber(line.text))
    .filter((line) => !isChapterMark(line.text));
  if (!usable.length) return '';
  const biggest = Math.max(...usable.map((line) => line.size));
  const top = usable.filter((line) => line.size >= biggest - 0.5);
  return (top[0] ?? usable[0]).text;
}

export async function openPdfSession(buffer: Buffer): Promise<PdfSession> {
  const pdfjs = await loadPdfjs();
  const root = pdfjsRoot();
  const task = pdfjs.getDocument({
    // pdfjs 会接管这块内存，必须给它独立副本。
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
    standardFontDataUrl: asFileUrl(path.join(root, 'standard_fonts')),
    cMapUrl: asFileUrl(path.join(root, 'cmaps')),
    cMapPacked: true
  });
  const doc = await task.promise;
  const meta = await doc.getMetadata().catch(() => null);
  const rawTitle = String(meta?.info?.Title ?? '').trim();

  const readPages = async (from: number, to: number): Promise<PdfPageText[]> => {
    const start = Math.max(1, Math.min(from, doc.numPages));
    const end = Math.max(start, Math.min(to, doc.numPages));

    // 先把所有页的行读出来，再统一决定哪些行是页眉页脚——需要跨页频次才能判断。
    const raw: Array<{ index: number; lines: TextLine[]; width: number; height: number }> = [];
    for (let index = start; index <= end; index += 1) {
      const page = await doc.getPage(index);
      const viewport = page.getViewport({ scale: 1 });
      let lines: TextLine[] = [];
      try {
        const content = await page.getTextContent();
        lines = groupLines(content.items as AnyModule[]);
      } catch {
        lines = [];
      }
      raw.push({
        index,
        lines,
        width: Math.round(viewport.width),
        height: Math.round(viewport.height)
      });
      page.cleanup();
    }

    // 每页都印同一句（页眉、页脚、讲义名），它是版面装饰，不该进讲稿。
    const freq = new Map<string, number>();
    for (const page of raw) {
      for (const line of page.lines) {
        freq.set(line.text, (freq.get(line.text) ?? 0) + 1);
      }
    }
    const runningThreshold = Math.max(3, Math.ceil(raw.length * 0.6));
    const isRunning = (text: string) => (freq.get(text) ?? 0) >= runningThreshold;

    // 还有一种是「页眉每页都在、但后半截随章节变」：`某某讲义 一 · 章名`。
    // 整行不同，只能靠开头几个字认——首行开场 6 字在多数页重复，就是页眉前缀。
    const firstLines = raw
      .map(
        (page) =>
          page.lines.find((line) => line.text.length >= 6 && !isPageNumber(line.text))?.text ?? ''
      )
      .filter(Boolean);
    const headerCount = new Map<string, number>();
    for (const line of firstLines) {
      const key = line.slice(0, 6);
      if (key.length === 6) headerCount.set(key, (headerCount.get(key) ?? 0) + 1);
    }
    let headerPrefix = '';
    for (const [key, count] of headerCount) {
      if (count >= runningThreshold) headerPrefix = key;
    }
    const isMasthead = (text: string) => Boolean(headerPrefix) && text.startsWith(headerPrefix);

    return raw.map((page) => {
      // 标题候选不套页眉前缀：封面标题本身就可能是那句"讲义名"，套上会被误删。
      const titleLines = page.lines
        .filter((line) => !isRunning(line.text))
        .filter((line) => !isPageNumber(line.text));
      const bodyLines = titleLines.filter((line) => !isMasthead(line.text));
      return {
        index: page.index,
        title: guessTitle(titleLines) || guessTitle(page.lines),
        text: cleanText(bodyLines.map((line) => line.text).join('\n')),
        width: page.width,
        height: page.height
      };
    });
  };

  return {
    pageCount: doc.numPages,
    docTitle: rawTitle,
    readPages,
    dispose: async () => {
      try {
        await doc.destroy();
      } catch {
        // 关闭失败不影响已经读到的文本。
      }
    }
  };
}

/* ------------------------------------------------------------
   渲染（浏览器）
   ------------------------------------------------------------ */

/** 渲染高度：舞台上页面最高 1008，这里留 1.25 倍给高分屏和导出。 */
export const PDF_RENDER_HEIGHT = 1260;

export interface PdfRenderRequest {
  /** 例如 http://127.0.0.1:8787 */
  baseUrl: string;
  /** 例如 /media/project-xxx/source.pdf */
  pdfUrl: string;
  chrome: string;
  pages: number[];
  onPage: (index: number, png: Buffer) => void;
  onProgress?: (done: number, total: number) => void;
}

export async function renderPdfPages(request: PdfRenderRequest): Promise<void> {
  const { chromium } = (await import('playwright-core')) as AnyModule;
  const total = request.pages.length;
  const browser = await chromium.launch({
    executablePath: request.chrome,
    headless: true,
    args: [
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions'
    ]
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1200 },
      deviceScaleFactor: 1
    });
    const target = `${request.baseUrl}/pdfkit/pdf-view?file=${encodeURIComponent(request.pdfUrl)}`;
    await page.goto(target, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForFunction(
      () => Boolean((window as any).__pdfReady) || Boolean((window as any).__pdfError),
      undefined,
      { timeout: 180_000 }
    );
    const failure = await page.evaluate(() => String((window as any).__pdfError || ''));
    if (failure) throw new Error(`PDF 载入失败：${failure}`);

    for (const [index, pageNumber] of request.pages.entries()) {
      const shot = await page.evaluate(
        (args: [number, number]) => (window as any).__renderPage(args[0], args[1], 1),
        [pageNumber, PDF_RENDER_HEIGHT] as [number, number]
      );
      const dataUrl = String(shot?.dataUrl || '');
      const base64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : '';
      if (!base64) throw new Error(`第 ${pageNumber} 页渲染为空`);
      request.onPage(pageNumber, Buffer.from(base64, 'base64'));
      request.onProgress?.(index + 1, total);
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
}

/* ------------------------------------------------------------
   课件页
   ------------------------------------------------------------ */

/** 页码 → 稳定的图片文件名，重导入时直接覆盖同名文件。 */
export const pageImageName = (pageIndex: number) =>
  `pdf-${String(pageIndex).padStart(3, '0')}.png`;

const ACCENT_CYCLE: Array<CourseSlide['accent']> = ['brick', 'teal', 'gold', 'ink'];

export interface BuildPdfSlideInput {
  page: PdfPageText;
  order: number;
  total: number;
  seconds: number;
}

/**
 * 一页 PDF 对应一页课件。页面只承担"展示原页"这一件事，
 * 正文、要点这些字段留给讲稿和编辑面板做参考，不参与排版。
 */
export function buildPdfSlide(input: BuildPdfSlideInput): CourseSlide {
  const { page, order, total, seconds } = input;
  const first = order === 0;
  const last = order === total - 1 && total > 2;
  const title = page.title || `第 ${page.index} 页`;
  return {
    id: `slide-pdf-${page.index}`,
    order,
    role: first ? 'cover' : last ? 'summary' : 'content',
    title,
    eyebrow: `原讲义第 ${page.index} 页`,
    layout: first ? 'cover' : last ? 'summary' : 'concept',
    bullets: [],
    keyPoint: '',
    pageImage: pageImageName(page.index),
    note: page.text,
    accent: ACCENT_CYCLE[order % ACCENT_CYCLE.length],
    sectionId: `section-pdf-${page.index}`,
    seconds
  };
}

/* ------------------------------------------------------------
   讲稿
   ------------------------------------------------------------ */

const narrationRole = (order: number, total: number): ScriptSection['role'] => {
  if (order === 0) return 'intro';
  if (order === total - 1 && total > 2) return 'close';
  return 'body';
};

function fallbackNarration(page: PdfPageText, order: number, total: number) {
  const title = page.title || '';
  // 兜底稿不是把整页字念一遍：标题本身、标题的碎片、太短的行（多半是页码或角标）都跳过。
  const spoken = page.text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length >= 6)
    .filter((line) => !title || !(line === title || title.includes(line)))
    .slice(0, 5)
    .join('；');
  const head =
    order === 0
      ? `这一页先把整体框架立起来：${page.title || '本页内容'}。`
      : order === total - 1
        ? `最后回到这一页收个尾：${page.title || '本页内容'}。`
        : `往下看这一页，重点是${page.title || '这一页的内容'}。`;
  return spoken ? `${head}${spoken}。` : `${head}请结合画面里的内容展开讲解。`;
}

const narrationStyle =
  '你是一位讲课老师，正在给学员逐页讲解一份讲义。' +
  '每一页给一段可以直接开口念的口播稿：口语、短句、有停顿感的自然语气，' +
  '不要照念屏幕上的文字，要用自己的话把这一页讲清楚；' +
  '不要写括号里的动作，也不要出现"本页""本段"这类讲稿备注。';

export interface PdfNarrationRequest {
  pages: PdfPageText[];
  topic: string;
  subject: string;
  grade: string;
  secondsPerPage: number;
}

export interface PdfNarrationResult {
  sections: ScriptSection[];
  engine: 'model' | 'local-fallback';
  warnings: string[];
}

/** 一次喂给模型的页数。太多会超出输出上限，太少又浪费往返。
 *  推理模型（如 mimo-v2.6）会先花预算思考，一批十页经常只写回一半，取 6 更稳。 */
const SCRIPT_BATCH = 6;

export async function buildPdfNarration(
  request: PdfNarrationRequest,
  settings: RuntimeSettings
): Promise<PdfNarrationResult> {
  const { pages, topic, subject, grade, secondsPerPage } = request;
  const total = pages.length;
  const warnings: string[] = [];
  const collected: ScriptSection[] = [];

  const toSection = (
    page: PdfPageText,
    order: number,
    narration: string,
    title?: string
  ): ScriptSection => ({
    // 与 buildPdfSlide 里的 sectionId 必须逐字一致，否则时间轴会对不上页。
    id: `section-pdf-${page.index}`,
    order,
    role: narrationRole(order, total),
    title: (title || page.title || `第 ${page.index} 页`).slice(0, 40),
    purpose: order === 0 ? '开场立框架' : '逐页讲解',
    narration,
    slideBrief: `原讲义第 ${page.index} 页`,
    valueNote: '',
    durationSeconds: secondsPerPage
  });

  /** 把一页（或几页）发给模型，拿回「页码 → 小标题 + 口播稿」。 */
  const askModel = async (batch: PdfPageText[]) => {
    const listing = batch
      .map((page) => {
        const body = page.text.replace(/\s+/g, ' ').slice(0, 900);
        return `【第 ${page.index} 页】\n${body || '（这一页以图形为主，没有可提取的文字）'}`;
      })
      .join('\n\n');
    const response = await callModel(settings, {
      messages: [
        {
          role: 'system',
          content:
            narrationStyle +
            '严格输出 JSON：{"pages":[{"index":页码,"title":"这页的小标题（不超过14字）","narration":"口播稿，80-220字"}]}，' +
            '不要 Markdown，不要解释，不要遗漏任何一页。'
        },
        {
          role: 'user',
          content: `课程：${topic}\n学科：${subject}｜学段：${grade}\n每页讲解约 ${secondsPerPage} 秒。\n\n${listing}`
        }
      ],
      json: true,
      temperature: 0.7,
      maxTokens: 4200
    });
    const parsed = parseJsonLoose<{ pages?: Array<Record<string, unknown>> }>(response.text);
    const rows = Array.isArray(parsed?.pages) ? parsed.pages : [];
    const map = new Map<number, { title: string; narration: string }>();
    for (const row of rows) {
      const index = Number(row.index);
      const narration = String(row.narration ?? '').trim();
      if (!Number.isFinite(index) || !narration) continue;
      map.set(index, { title: String(row.title ?? '').trim(), narration });
    }
    return map;
  };

  let modelOk = false;
  if (pages.some((page) => page.text.trim().length > 0)) {
    for (let start = 0; start < pages.length; start += SCRIPT_BATCH) {
      const batch = pages.slice(start, start + SCRIPT_BATCH);
      let byIndex = new Map<number, { title: string; narration: string }>();
      try {
        byIndex = await askModel(batch);
      } catch (error) {
        const message = error instanceof Error ? error.message : '模型调用失败';
        warnings.push(
          `第 ${batch[0].index}-${batch[batch.length - 1].index} 页讲稿改用页面文字兜底：${message}`
        );
      }

      // 推理模型会把输出预算吃在思考上，一批十页常常只写回前几页。
      // 漏掉的页单独再要一次，别整批丢掉——单页很少有写不完的。
      for (const page of batch.filter((item) => !byIndex.has(item.index))) {
        try {
          const hit = (await askModel([page])).get(page.index);
          if (hit) byIndex.set(page.index, hit);
        } catch {
          // 单页也补不上，就交给下面的兜底。
        }
      }

      const dropped = batch.filter((page) => !byIndex.has(page.index));
      if (dropped.length) {
        warnings.push(
          `第 ${dropped.map((page) => page.index).join('、')} 页模型没写回来，讲稿改用页面文字兜底`
        );
      }

      for (const page of batch) {
        const hit = byIndex.get(page.index);
        const order = collected.length;
        collected.push(
          toSection(page, order, hit?.narration || fallbackNarration(page, order, total), hit?.title)
        );
      }
      if (byIndex.size) modelOk = true;
    }
  } else {
    warnings.push('这份 PDF 没有可提取的文字（可能是扫描件），讲稿按页占位，需要手写');
    for (const page of pages) {
      const order = collected.length;
      collected.push(toSection(page, order, fallbackNarration(page, order, total)));
    }
  }

  return {
    sections: collected,
    engine: modelOk ? 'model' : 'local-fallback',
    warnings
  };
}

/* ------------------------------------------------------------
   整册收尾
   ------------------------------------------------------------ */

export function buildPdfScript(project: CourseProject, sections: ScriptSection[]): CourseScript {
  const firstTitle = project.slides[0]?.title || project.title;
  return {
    title: project.title,
    thesis: `${project.title}：按原讲义逐页讲解`,
    openingHook: sections[0]?.narration?.slice(0, 120) || '',
    objectives: project.slides
      .slice(0, 4)
      .map((slide) => slide.title)
      .filter(Boolean),
    valueThread: [],
    sections,
    summary: sections[sections.length - 1]?.narration?.slice(0, 120) || `回看${firstTitle}`,
    keywords: project.slides
      .map((slide) => slide.title)
      .filter(Boolean)
      .slice(0, 8),
    quality: {
      structure: 78,
      oral: 80,
      value: 70,
      fit: 82,
      note: '按原讲义逐页对应生成，重点在讲清楚页面内容'
    },
    version: 1,
    confirmed: false,
    generatedAt: new Date().toISOString()
  };
}

export function pdfFileSizeLabel(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
