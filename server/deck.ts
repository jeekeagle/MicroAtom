import fs from 'node:fs';
import path from 'node:path';
import type { CourseProject, CourseSlide } from '../src/types';
import { renderVisualSvg, type VisualTheme } from '../src/lib/slideVisuals';
import { mediaUrl, projectMediaDir } from './media';

/**
 * 授课放映课件（deck）渲染器。
 *
 * 设计基线来自 frontend-slides 的固定舞台规格：
 * - 每一页都在 1920×1080 的设计画布内排版，整块舞台等比缩放，不随设备重排；
 * - 单文件、零依赖，CSS/JS 全部内联；
 * - 白底，课程名固定在页眉，正文最小字号 24px；
 * - 键盘 / 滚轮 / 触屏翻页，渐进呈现，支持就地改字与打印为 PDF。
 *
 * 页数严格等于 project.slides：多插一页会让旁白时间轴与成片失去对位。
 */

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

type AccentKey = CourseSlide['accent'];

const ACCENTS: Record<AccentKey, { accent: string; soft: string }> = {
  brick: { accent: '#b2452b', soft: '#f8ece8' },
  teal: { accent: '#1c6b62', soft: '#e8f2f0' },
  gold: { accent: '#8f6415', soft: '#f8f1e0' },
  ink: { accent: '#33414d', soft: '#eef1f4' }
};

const themeFor = (accent: AccentKey): VisualTheme => ({
  accent: ACCENTS[accent].accent,
  accentSoft: ACCENTS[accent].soft,
  ink: '#15202b',
  muted: '#6b7885',
  line: '#e4e8ec',
  panel: '#ffffff'
});

/* ============================================================
   文案清洗
   课件的正文只留教学内容：过程说明、版式备注、提示词一律不进入页面。
   ============================================================ */

const PROCESS_PREFIX =
  /^(画面提示|视觉任务|版式建议|排版提示|设计说明|风格说明|配色说明|展示建议|页面提示|讲解思路|素材提示|提示词|提示|切换页|精简排版|图注建议)\s*[:：]\s*/;

const PROCESS_LEAD =
  /^(本页|这一页|此页|本条|本张|本屏|版式|配色|风格|设计|提示词|元提示|画面|页面建议|以上)/;

const PROCESS_ONLY = /(提示词|prompt|风格说明|版式说明)/i;

/** 描述"这页要做什么"的句子，属于备课语言，不进课件。 */
const PROCESS_TONE =
  /(点明|说明这节课|让听众|让观众|让学生知道这节课|让读者|本条内容|本页内容|作为开场|起到.*作用)/;

/**
 * 把排版要求误当成知识点的短句，例如"目标页最多四条""每条不超过 14 个汉字"。
 * 只在整句很短时命中，避免误杀正常论述。
 */
const LAYOUT_TALK =
  /(最多\s*\d+\s*[条行个项]|不超过\s*\d+\s*个?\s*(汉字|字)|字数控制在|封面(只|上)放|只放课程标题|目标页|标题页)/;

/** 去掉过程痕迹，返回可以直接上课的句子。 */
function polish(value: unknown): string {
  let text = String(value ?? '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
  if (!text) return '';
  for (let i = 0; i < 3; i += 1) {
    const next = text.replace(PROCESS_PREFIX, '').trim();
    if (next === text) break;
    text = next;
  }
  if (!text) return '';
  if (PROCESS_LEAD.test(text) || PROCESS_ONLY.test(text)) return '';
  if (PROCESS_TONE.test(text)) return '';
  if (text.length <= 26 && LAYOUT_TALK.test(text)) return '';
  // 去掉切句留下的悬空标点。
  text = text.replace(/[：:，,、；;]+$/, '').trim();
  if (!text) return '';
  // 标题行不保留句末句号，正文不保留连续空行。
  text = text.replace(/\n{3,}/g, '\n\n');
  return text;
}

const polishList = (list: unknown): string[] =>
  (Array.isArray(list) ? list : [])
    .map((item) => polish(item))
    .filter(Boolean);

/**
 * 清洗后如果一条都不剩，说明整页内容都是备课语言。
 * 与其留一页空白，不如把原句保留下来——老师扫一眼就知道要改哪句。
 */
const polishListOrRaw = (list: unknown, limit = 2): string[] => {
  const cleaned = polishList(list);
  if (cleaned.length) return cleaned;
  return (Array.isArray(list) ? list : [])
    .map((item) => String(item ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, limit);
};

const dedupe = (items: string[], extra: string[] = []) => {
  const seen = new Set(extra.map((item) => item.trim()));
  return items.filter((item) => {
    const key = item.trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/* ============================================================
   舞台与页面样式
   ============================================================ */

const VIEWPORT_BASE_CSS = `
/* ===========================================
   FIXED 16:9 STAGE: MANDATORY BASE STYLES
   =========================================== */
html, body {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    background: var(--stage-bg, #000);
}
.deck-viewport {
    position: fixed;
    inset: 0;
    overflow: hidden;
    background: var(--stage-bg, #000);
}
.deck-stage {
    position: absolute;
    left: 0;
    top: 0;
    width: 1920px;
    height: 1080px;
    overflow: hidden;
    transform-origin: 0 0;
    background: var(--slide-bg, #fff);
}
.slide {
    position: absolute;
    inset: 0;
    width: 1920px;
    height: 1080px;
    overflow: hidden;
    display: block;
    visibility: hidden;
    opacity: 0;
    pointer-events: none;
    background: var(--slide-bg, #fff);
}
.slide.active,
.slide.visible {
    visibility: visible;
    opacity: 1;
    pointer-events: auto;
    z-index: 1;
}
img, video, canvas, svg {
    max-width: 100%;
    max-height: 100%;
}
.deck-controls {
    position: fixed;
    left: 50%;
    bottom: 22px;
    transform: translateX(-50%);
    z-index: 1000;
}
@media print {
    html, body {
        width: 1920px;
        height: auto;
        overflow: visible;
        background: #fff;
    }
    .deck-viewport { position: static; overflow: visible; background: #fff; }
    .deck-stage {
        position: static;
        width: auto;
        height: auto;
        transform: none !important;
        background: none;
    }
    .slide {
        position: relative;
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        pointer-events: auto !important;
        width: 1920px;
        height: 1080px;
        break-after: page;
        page-break-after: always;
    }
    .slide:last-child { break-after: auto; page-break-after: auto; }
    .deck-controls, .deck-progress { display: none !important; }
}
@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
        animation-duration: 0.01ms !important;
        transition-duration: 0.2s !important;
    }
}
`;

const SLIDE_CSS = `/* ===========================================
   1. 主题变量：白底、墨色正文、单一强调色
   --u 是全页排版缩放：内容多的页自动收小字号与间距，
   保证任何一页都能实装进 1920×1080，不会顶到页眉、压到页脚。
   =========================================== */
:root {
    --paper: #ffffff;
    --stage-bg: #eceff2;
    --slide-bg: #ffffff;
    --ink: #15202b;
    --ink-2: #33414d;
    --muted: #6b7885;
    --hair: #e4e8ec;
    --accent: #b2452b;
    --accent-soft: #f8ece8;
    /* 只用系统自带字体：不联网、不等待字体下载，放映与成片截图度量完全一致。 */
    --font-display: "Source Han Serif SC", "Noto Serif SC", "SimSun", "Songti SC", STSong, serif;
    --font-body: "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif;
    --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
    --duration-normal: 0.62s;
}

/* ===========================================
   2. 页面骨架：页眉 / 正文 / 页脚三段固定分格
   =========================================== */
.slide {
    font-family: var(--font-body);
    color: var(--ink);
    --u: 1;
    --pad: 1;
}

/* PDF 导入页：原讲义整页上屏，白底衬一张"纸"。
   选择器带上 .slide 是为了压过上面的骨架规则（display/overflow 那一组）。 */
.slide.pdf-page {
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    padding: 36px;
    background: #ffffff;
    overflow: hidden;
}
.slide.pdf-page .pdf-paper {
    display: block;
    flex: none;
    line-height: 0;
    background: #ffffff;
    box-shadow: 0 14px 44px rgba(15, 23, 42, 0.18);
}
.slide.pdf-page .pdf-paper img {
    display: block;
    width: auto;
    height: auto;
    max-width: 1848px;
    max-height: 1008px;
}
.frame {
    position: absolute;
    inset: 0;
    padding: calc(56px * var(--pad)) 96px calc(52px * var(--pad));
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    align-content: stretch;
}

/* 页眉：左侧课程名，右侧学科与学段 */
.topbar {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 32px;
    font-size: 23px;
    line-height: 1.4;
    color: var(--muted);
}
.topbar .course {
    color: var(--ink);
    font-weight: 500;
    letter-spacing: 0.01em;
    max-width: 1220px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}
.topbar .meta { flex: none; letter-spacing: 0.04em; }
.hair { height: 1px; background: var(--hair); margin-top: 18px; }

/* 正文区：内容整体在页眉与页脚之间垂直居中，溢出时向上不越界 */
.body {
    position: relative;
    min-height: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    justify-content: safe center;
    overflow: hidden;
    padding: calc(26px * var(--u)) 0 calc(18px * var(--u));
}
.mark {
    width: 78px;
    height: 4px;
    flex: none;
    background: var(--accent);
    margin-bottom: calc(24px * var(--u));
    transform-origin: 0 50%;
}
h1 {
    font-family: var(--font-display);
    font-size: calc(66px * var(--u));
    line-height: 1.22;
    font-weight: 600;
    letter-spacing: -0.005em;
    color: var(--ink);
    max-width: 1560px;
    margin: 0;
    flex: none;
}
.lead {
    flex: none;
    margin: calc(20px * var(--u)) 0 0;
    font-size: calc(31px * var(--u));
    line-height: 1.6;
    color: var(--ink-2);
    max-width: 1420px;
}

/* 编号要点：细线分隔，不用项目符号 */
.rows { flex: none; margin-top: calc(28px * var(--u)); max-width: 1560px; }
.row {
    display: flex;
    gap: 28px;
    padding: calc(18px * var(--u)) 0;
    border-top: 1px solid var(--hair);
}
.row:last-child { border-bottom: 1px solid var(--hair); }
.row .idx {
    flex: none;
    width: 50px;
    font-family: var(--font-display);
    font-size: calc(25px * var(--u));
    line-height: 1.5;
    color: var(--accent);
    padding-top: 3px;
}
.row p {
    margin: 0;
    font-size: calc(30px * var(--u));
    line-height: 1.5;
    color: var(--ink-2);
}
.support { flex: none; margin-top: calc(20px * var(--u)); display: grid; gap: calc(9px * var(--u)); }
.support span {
    position: relative;
    padding-left: 24px;
    font-size: calc(25px * var(--u));
    line-height: 1.55;
    color: var(--muted);
}
.support span::before {
    content: "";
    position: absolute;
    left: 0;
    top: calc(15px * var(--u));
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
}

/* 课堂提问 / 一句话带走 */
.band {
    flex: none;
    margin-top: calc(24px * var(--u));
    padding: calc(18px * var(--u)) 28px;
    background: var(--accent-soft);
    border-left: 6px solid var(--accent);
    border-radius: 6px;
}
.band .tag {
    display: block;
    font-size: 23px;
    font-weight: 600;
    letter-spacing: 0.06em;
    color: var(--accent);
}
.band p {
    margin: calc(8px * var(--u)) 0 0;
    font-size: calc(28px * var(--u));
    line-height: 1.5;
    color: var(--ink);
}
.take {
    flex: none;
    margin-top: calc(24px * var(--u));
    padding-top: calc(18px * var(--u));
    border-top: 1px solid var(--hair);
    max-width: 1560px;
}
.take .tag {
    display: block;
    font-size: 23px;
    letter-spacing: 0.06em;
    color: var(--muted);
}
.take p {
    margin: 7px 0 0;
    font-family: var(--font-display);
    font-size: calc(31px * var(--u));
    line-height: 1.45;
    font-weight: 600;
    color: var(--ink);
}

/* ===========================================
   3. 图文分栏
   =========================================== */
.dual {
    display: grid;
    grid-template-columns: minmax(0, 0.94fr) minmax(0, 1.06fr);
    gap: 56px;
    align-items: center;
    min-height: 0;
    flex: none;
}
.dual .copy { min-width: 0; }
.dual h1 { font-size: calc(56px * var(--u)); }
.dual .row p { font-size: calc(28px * var(--u)); }
.dual .lead { font-size: calc(29px * var(--u)); }
.figure {
    box-sizing: border-box;
    border: 1px solid var(--hair);
    border-radius: 10px;
    padding: 18px 20px;
    background: var(--paper);
    display: flex;
    align-items: center;
    justify-content: center;
    /* 固定外框高度、内部 SVG 等比撑满：图不会被版面压扁或裁掉一截。 */
    height: 470px;
    flex: none;
    overflow: hidden;
}
.figure svg { width: 100%; height: 100%; display: block; }
.single-figure { flex: none; max-width: 1180px; margin: 0 auto; width: 100%; }
.single-figure .figure { height: 300px; }

/* ===========================================
   4. 封面
   =========================================== */
.frame.cover {
    display: flex;
    flex-direction: column;
    justify-content: center;
    overflow: hidden;
}
.cover .orbit {
    position: absolute;
    border-radius: 50%;
    border: 1px solid rgba(21, 32, 43, 0.07);
    pointer-events: none;
}
.cover .orbit.one { right: -220px; bottom: -280px; width: 760px; height: 760px; }
.cover .orbit.two { right: -80px; bottom: -140px; width: 460px; height: 460px; }
.cover .kicker {
    display: flex;
    align-items: center;
    gap: 18px;
    font-size: 25px;
    letter-spacing: 0.08em;
    color: var(--accent);
    font-weight: 500;
}
.cover .kicker::before {
    content: "";
    width: 44px;
    height: 4px;
    background: var(--accent);
}
.cover h1 {
    font-size: calc(92px * var(--u));
    line-height: 1.16;
    max-width: 1500px;
    margin-top: 30px;
}
.cover .lead { font-size: calc(33px * var(--u)); max-width: 1240px; margin-top: 28px; }
.cover .cover-meta {
    display: flex;
    gap: 44px;
    margin-top: 60px;
    font-size: 25px;
    color: var(--muted);
}

/* ===========================================
   5. 目标页
   =========================================== */
.layout-objectives .goals {
    margin-top: calc(10px * var(--u));
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 64px;
}
.layout-objectives .goal {
    display: flex;
    gap: 22px;
    padding: calc(22px * var(--u)) 0;
    border-top: 1px solid var(--hair);
}
.layout-objectives .goal .idx {
    flex: none;
    font-family: var(--font-display);
    font-size: calc(28px * var(--u));
    color: var(--accent);
    line-height: 1.4;
}
.layout-objectives .goal p {
    margin: 0;
    font-size: calc(28px * var(--u));
    line-height: 1.5;
    color: var(--ink-2);
}

/* ===========================================
   6. 对照页
   =========================================== */
.compare { display: grid; grid-template-columns: 1fr 1fr; gap: 0 72px; margin-top: calc(34px * var(--u)); }
.compare .col { border-top: 3px solid var(--accent); padding-top: calc(20px * var(--u)); }
.compare .col + .col { border-top-color: var(--hair); }
.compare h2 {
    font-family: var(--font-display);
    font-size: calc(28px * var(--u));
    font-weight: 600;
    color: var(--ink);
    margin: 0 0 calc(14px * var(--u));
}
.compare p {
    margin: 0 0 calc(14px * var(--u));
    font-size: calc(28px * var(--u));
    line-height: 1.5;
    color: var(--ink-2);
    padding-left: 22px;
    position: relative;
}
.compare p:last-child { margin-bottom: 0; }
.compare p::before {
    content: "";
    position: absolute;
    left: 0;
    top: calc(17px * var(--u));
    width: 9px;
    height: 2px;
    background: var(--accent);
}

/* ===========================================
   7. 引语页
   =========================================== */
.layout-quote .body { justify-content: center; }
.layout-quote blockquote {
    flex: none;
    margin: 0;
    max-width: 1480px;
    font-family: var(--font-display);
    font-size: calc(56px * var(--u));
    line-height: 1.45;
    font-weight: 500;
    color: var(--ink);
}
.layout-quote .attrib {
    flex: none;
    margin-top: calc(28px * var(--u));
    font-size: 25px;
    color: var(--muted);
    letter-spacing: 0.04em;
}

/* ===========================================
   8. 总结页
   =========================================== */
.layout-summary .cards {
    flex: none;
    margin-top: calc(34px * var(--u));
    display: grid;
    gap: calc(30px * var(--u)) 48px;
}
.layout-summary .card { border-top: 1px solid var(--hair); padding-top: calc(18px * var(--u)); }
.layout-summary .card .idx {
    font-family: var(--font-display);
    font-size: 23px;
    color: var(--accent);
    letter-spacing: 0.06em;
}
.layout-summary .card p {
    margin: calc(10px * var(--u)) 0 0;
    font-size: calc(28px * var(--u));
    line-height: 1.5;
    color: var(--ink-2);
}

/* ===========================================
   9. 页脚
   =========================================== */
.foot {
    display: flex;
    align-items: center;
    gap: 16px;
    flex: none;
    font-size: 21px;
    line-height: 1.4;
    color: var(--muted);
    letter-spacing: 0.04em;
}
.foot .line { flex: 1; height: 1px; background: var(--hair); }
.foot .no { font-variant-numeric: tabular-nums; }
.foot .of { color: #b3bcc5; }

/* ===========================================
   10. 渐进呈现
   =========================================== */
.reveal {
    opacity: 0;
    transform: translateY(22px);
    transition: opacity var(--duration-normal) var(--ease-out-expo),
        transform var(--duration-normal) var(--ease-out-expo);
}
.slide.visible .reveal { opacity: 1; transform: translateY(0); }
.slide.visible .reveal:nth-child(1) { transition-delay: 0.06s; }
.slide.visible .reveal:nth-child(2) { transition-delay: 0.12s; }
.slide.visible .reveal:nth-child(3) { transition-delay: 0.18s; }
.slide.visible .reveal:nth-child(4) { transition-delay: 0.24s; }
.slide.visible .reveal:nth-child(5) { transition-delay: 0.3s; }
.slide.visible .reveal:nth-child(6) { transition-delay: 0.36s; }
.slide.visible .mark { animation: mark-in 0.7s var(--ease-out-expo) both; }
@keyframes mark-in {
    from { transform: scaleX(0.2); opacity: 0.2; }
    to { transform: scaleX(1); opacity: 1; }
}

/* ===========================================
   11. 内容密度：页面按内容量自动收字号与间距
   由排版器在 <section data-density> 上标注，1 最松、3 最紧。
   =========================================== */
.slide[data-density="2"] {
    --u: 0.9;
    --pad: 0.94;
}
.slide[data-density="3"] {
    --u: 0.8;
    --pad: 0.86;
}
.slide[data-density="3"] .frame { padding-left: 84px; padding-right: 84px; }
.slide[data-density="2"] .figure { height: 430px; }
.slide[data-density="3"] .figure { height: 390px; }
.slide[data-density="3"] .foot,
.slide[data-density="2"] .foot { font-size: 20px; }

/* ===========================================
   12. 放映控件与就地改字（舞台之外）
   =========================================== */
.deck-progress {
    position: fixed;
    top: 0;
    left: 0;
    height: 3px;
    width: 0;
    background: #b2452b;
    z-index: 1200;
    transition: width 0.35s var(--ease-out-expo);
}
.deck-controls {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 10px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.92);
    border: 1px solid rgba(21, 32, 43, 0.1);
    box-shadow: 0 6px 24px rgba(21, 32, 43, 0.08);
    font-family: var(--font-body);
    font-size: 14px;
    color: #33414d;
    backdrop-filter: blur(8px);
}
.deck-controls button {
    appearance: none;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    height: 30px;
    min-width: 30px;
    padding: 0 9px;
    border-radius: 999px;
    cursor: pointer;
    line-height: 1;
}
.deck-controls button:hover { background: rgba(21, 32, 43, 0.06); }
.deck-controls button.on { background: #15202b; color: #fff; }
.deck-controls .counter {
    font-variant-numeric: tabular-nums;
    padding: 0 8px;
    color: #6b7885;
}
.deck-hint {
    position: fixed;
    right: 18px;
    bottom: 26px;
    z-index: 1000;
    font-family: var(--font-body);
    font-size: 13px;
    color: #7b8794;
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid rgba(21, 32, 43, 0.08);
    border-radius: 999px;
    padding: 6px 12px;
}
body.editing .slide [data-edit] {
    outline: 1px dashed rgba(178, 69, 43, 0.5);
    outline-offset: 6px;
    border-radius: 2px;
}
body.editing .slide [data-edit]:focus {
    outline: 2px solid rgba(178, 69, 43, 0.85);
}
`;

/* ============================================================
   页面片段
   ============================================================ */

const pad2 = (value: number) => String(Math.max(0, value)).padStart(2, '0');

interface RenderContext {
  project: CourseProject;
  total: number;
  /** PDF 页图片地址解析：整册走 /media，单页走内联 data URI。 */
  pageSrc?: (slide: CourseSlide) => string;
}

/**
 * PDF 页图片统一走 /media 静态地址：一页 PNG 三四百 KB，
 * 内联进 HTML 会让每个项目的存档和接口响应膨胀几十兆。
 */
export const pdfPageSrc = (projectId: string, fileName: string) =>
  mediaUrl(projectId, `slides/${fileName}`);

/** 兼容保留：内部已不再内联，清缓存时只做空操作。 */
export function clearPageImageCache(_projectId: string) {}

const courseLabel = (project: CourseProject) =>
  polish(project.title) || polish(project.topic) || '微课';

const metaLabel = (project: CourseProject) => {
  const parts = [polish(project.subject), polish(project.grade)].filter(Boolean);
  return parts.join(' · ');
};

/**
 * 只有"标签短、节点少"的图才配得上版面。
 * 把整句讲稿塞进方块里的图，投影时既看不清也不增信息，直接不放。
 */
const visualIsReadable = (slide: CourseSlide): boolean => {
  const visual = slide.visual;
  if (!visual || visual.kind === 'none') return false;
  const labels = [
    ...(visual.nodes ?? []).map((node) => node.label),
    ...(visual.steps ?? []).map((step) => step.label),
    ...(visual.series ?? []).map((item) => item.label),
    ...(visual.columns ?? [])
  ]
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
  if (!labels.length) return visual.kind === 'chart' || visual.kind === 'timeline' || visual.kind === 'cycle';
  return labels.length <= 5 && labels.every((label) => label.length <= 10);
};

const fig = (slide: CourseSlide) =>
  visualIsReadable(slide)
    ? `<figure class="figure">${renderVisualSvg(slide.visual, themeFor(slide.accent))}</figure>`
    : '';

const bandBlock = (slide: CourseSlide, askText: string) =>
  askText
    ? `<div class="band reveal"><span class="tag">课堂提问</span><p>${escapeHtml(askText)}</p></div>`
    : '';

const takeBlock = (slide: CourseSlide, takeText: string) =>
  takeText
    ? `<div class="take reveal"><span class="tag">一句话带走</span><p>${escapeHtml(takeText)}</p></div>`
    : '';

const supportBlock = (items: string[]) =>
  items.length
    ? `<div class="support reveal">${items.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>`
    : '';

const rowsBlock = (items: string[], startIndex = 0) =>
  items.length
    ? `<div class="rows reveal">${items
        .map(
          (item, index) =>
            `<div class="row"><span class="idx">${pad2(startIndex + index + 1)}</span><p>${escapeHtml(
              item
            )}</p></div>`
        )
        .join('')}</div>`
    : '';

const topbarBlock = (ctx: RenderContext) => `<div class="topbar"><span class="course">${escapeHtml(
  courseLabel(ctx.project)
)}</span><span class="meta">${escapeHtml(metaLabel(ctx.project) || '课堂讲解')}</span></div>
      <div class="hair"></div>`;

const footBlock = (slide: CourseSlide, total: number) => `<div class="foot">
        <span class="line"></span>
        <span class="no">${pad2(slide.order)} <span class="of">/ ${pad2(total)}</span></span>
      </div>`;

/** 内容页统一骨架：页眉 → 正文 → 页脚，全部在同一个 1080 高的画框内。 */
const shell = (slide: CourseSlide, ctx: RenderContext, body: string, extraClass = '') =>
  `<div class="frame ${extraClass}">
      ${topbarBlock(ctx)}
      <div class="body">${body}</div>
      ${footBlock(slide, ctx.total)}
    </div>`;

function renderCover(slide: CourseSlide, ctx: RenderContext): string {
  const title = polish(slide.title) || courseLabel(ctx.project);
  const lead = polish(slide.keyPoint) || polish(ctx.project.script?.thesis);
  const meta = metaLabel(ctx.project);
  const minutes = Number(ctx.project.durationMinutes) || 0;
  const metaItems = [meta, minutes ? `${minutes} 分钟` : ''].filter(Boolean);
  return `<div class="frame cover">
      <span class="orbit one"></span><span class="orbit two"></span>
      <div class="kicker reveal">微课</div>
      <h1 class="reveal" data-edit>${escapeHtml(title)}</h1>
      ${lead ? `<p class="lead reveal" data-edit>${escapeHtml(lead)}</p>` : ''}
      ${
        metaItems.length
          ? `<div class="cover-meta reveal">${metaItems
              .map((item) => `<span>${escapeHtml(item)}</span>`)
              .join('')}</div>`
          : ''
      }
    </div>`;
}

function renderObjectives(slide: CourseSlide, ctx: RenderContext): string {
  const title = polish(slide.title) || '这节课要走完的三步';
  const lead = polish(slide.keyPoint);
  const goals = dedupe(polishListOrRaw(slide.bullets).slice(0, 4), [title, lead]);
  const inner = goals.length
    ? `<div class="goals">${goals
        .map(
          (item, index) =>
            `<div class="goal reveal"><span class="idx">${pad2(index + 1)}</span><p>${escapeHtml(
              item
            )}</p></div>`
        )
        .join('')}</div>`
    : rowsBlock(dedupe(polishListOrRaw(slide.supporting), [title, lead]));
  const body = `<div class="mark reveal"></div>
        <h1 class="reveal" data-edit>${escapeHtml(title)}</h1>
        ${lead ? `<p class="lead reveal" data-edit>${escapeHtml(lead)}</p>` : ''}
        ${inner}`;
  return shell(slide, ctx, body, 'layout-objectives');
}

function renderCompare(slide: CourseSlide, ctx: RenderContext): string {
  const title = polish(slide.title) || '两种判断放在一起看';
  const lead = polish(slide.keyPoint);
  const bullets = dedupe(polishListOrRaw(slide.bullets), [title, lead]);
  const supporting = dedupe(polishListOrRaw(slide.supporting), [title, lead]);
  const headers = supporting.slice(0, 2);
  const half = Math.ceil(bullets.length / 2) || 1;
  const column = (items: string[], index: number) =>
    `<div class="col reveal">${headers[index] ? `<h2>${escapeHtml(headers[index])}</h2>` : ''}${items
      .map((item) => `<p>${escapeHtml(item)}</p>`)
      .join('')}</div>`;
  const body = `<div class="mark reveal"></div>
        <h1 class="reveal" data-edit>${escapeHtml(title)}</h1>
        ${lead ? `<p class="lead reveal" data-edit>${escapeHtml(lead)}</p>` : ''}
        <div class="compare">${column(bullets.slice(0, half), 0)}${column(bullets.slice(half), 1)}</div>
        ${bandBlock(slide, polish(slide.ask))}`;
  return shell(slide, ctx, body, 'layout-compare');
}

function renderQuote(slide: CourseSlide, ctx: RenderContext): string {
  const title = polish(slide.title);
  const lead = polish(slide.keyPoint);
  const take = polish(slide.takeaway);
  const body = `<div class="mark reveal"></div>
        <blockquote class="reveal" data-edit>${escapeHtml(title || lead)}</blockquote>
        ${lead && title ? `<div class="attrib reveal" data-edit>${escapeHtml(lead)}</div>` : ''}
        ${take ? takeBlock(slide, take) : ''}`;
  return shell(slide, ctx, body, 'layout-quote');
}

function renderSummary(slide: CourseSlide, ctx: RenderContext): string {
  const title = polish(slide.title) || '这节课留下的几件事';
  const lead = polish(slide.keyPoint);
  const cards = dedupe(polishListOrRaw(slide.bullets), [title, lead]).slice(0, 6);
  const take = polish(slide.takeaway);
  const cols = cards.length >= 5 ? 3 : cards.length === 4 ? 2 : Math.max(cards.length, 1);
  const body = `<div class="mark reveal"></div>
        <h1 class="reveal" data-edit>${escapeHtml(title)}</h1>
        ${lead ? `<p class="lead reveal" data-edit>${escapeHtml(lead)}</p>` : ''}
        ${
          cards.length
            ? `<div class="cards" style="grid-template-columns:repeat(${cols},1fr)">${cards
                .map(
                  (item, index) =>
                    `<div class="card reveal"><span class="idx">${pad2(index + 1)}</span><p>${escapeHtml(
                      item
                    )}</p></div>`
                )
                .join('')}</div>`
            : ''
        }
        ${take ? takeBlock(slide, take) : ''}`;
  return shell(slide, ctx, body, 'layout-summary');
}

function renderBody(slide: CourseSlide, ctx: RenderContext): string {
  const title = polish(slide.title) || courseLabel(ctx.project);
  const lead = polish(slide.keyPoint);
  const bullets = dedupe(polishListOrRaw(slide.bullets), [title, lead]).slice(0, 4);
  const supporting = dedupe(polishListOrRaw(slide.supporting), [title, lead]).slice(0, 3);
  const take = polish(slide.takeaway);
  const ask = polish(slide.ask);
  const visual = fig(slide);
  const wantsVisualLayout =
    Boolean(visual) && ['split', 'case', 'steps', 'concept', 'statement'].includes(slide.layout);

  const copy = `<div class="copy">
        <div class="mark reveal"></div>
        <h1 class="reveal" data-edit>${escapeHtml(title)}</h1>
        ${lead ? `<p class="lead reveal" data-edit>${escapeHtml(lead)}</p>` : ''}
        ${rowsBlock(bullets)}
        ${supportBlock(supporting)}
      </div>`;

  const stack = wantsVisualLayout
    ? `<div class="dual">${copy}${visual}</div>`
    : `${copy}${
        visual
          ? `<div class="single-figure" style="margin-top:36px">${visual}</div>`
          : ''
      }`;

  const body = `${stack}
        ${bandBlock(slide, ask)}
        ${take ? takeBlock(slide, take) : ''}`;
  return shell(slide, ctx, body, 'layout-body');
}

const isCover = (slide: CourseSlide) => slide.layout === 'cover' || slide.role === 'cover';

const layoutOf = (slide: CourseSlide): string =>
  slide.layout === 'cover' || slide.role === 'cover'
    ? 'cover'
    : slide.layout === 'objectives' || slide.role === 'objectives'
      ? 'objectives'
      : slide.layout === 'compare'
        ? 'compare'
        : slide.layout === 'quote'
          ? 'quote'
          : slide.layout === 'summary' || slide.role === 'summary'
            ? 'summary'
            : 'body';

/**
 * 内容拥挤度：1 最松、3 最紧。
 * 页面是固定 1920×1080 的舞台，内容一多就必然压字，所以按字数与块数
 * 提前把字号、行距、间距整体收一档，而不是等浏览器把元素挤到页脚外面。
 */
function densityOf(slide: CourseSlide, layout: string): 1 | 2 | 3 {
  const title = polish(slide.title);
  const lead = polish(slide.keyPoint);
  const bullets = polishListOrRaw(slide.bullets);
  const supporting = polishListOrRaw(slide.supporting);
  const extras = [polish(slide.ask), polish(slide.takeaway)].filter(Boolean);
  const bodyChars =
    bullets.reduce((sum, item) => sum + item.length, 0) +
    supporting.reduce((sum, item) => sum + item.length, 0) +
    extras.reduce((sum, item) => sum + item.length, 0);
  // 一行正文约 44 个汉字（28px / 1420px），标题一行约 22 个。
  const lines =
    Math.ceil(title.length / 22 || 1) +
    Math.ceil(lead.length / 44) +
    Math.ceil(bodyChars / 44);
  let score = lines + bullets.length * 0.7 + supporting.length * 0.5 + extras.length * 0.8;
  if (layout === 'summary') score += 0.6;
  if (layout === 'compare') score += 0.4;
  if (layout === 'cover') score -= 1.6;
  if (layout === 'quote') score -= 2.4;
  if (layout === 'objectives') score -= 0.4;
  if (visualIsReadable(slide) && layout === 'body') score -= 0.6;
  if (score <= 6) return 1;
  if (score <= 9) return 2;
  return 3;
}

function renderSection(slide: CourseSlide, ctx: RenderContext): string {
  if (slide.pageImage && ctx.pageSrc) return renderPdfPageSection(slide, ctx);
  const accent = ACCENTS[slide.accent] ?? ACCENTS.ink;
  const layout = layoutOf(slide);
  const inner =
    layout === 'cover'
      ? renderCover(slide, ctx)
      : layout === 'objectives'
        ? renderObjectives(slide, ctx)
        : layout === 'compare'
          ? renderCompare(slide, ctx)
          : layout === 'quote'
            ? renderQuote(slide, ctx)
            : layout === 'summary'
              ? renderSummary(slide, ctx)
              : renderBody(slide, ctx);
  return `<section class="slide layout-${layout}${isCover(slide) ? ' is-cover' : ''}" data-index="${
    slide.order
  }" data-density="${densityOf(slide, layout)}" style="--accent:${accent.accent};--accent-soft:${
    accent.soft
  }">
      ${inner}
    </section>`;
}

/**
 * PDF 导入页：不重排、不改字，原讲义整页等比铺满舞台。
 * 页面的正文、要点字段只用来喂讲稿和编辑面板，不参与这里的排版。
 */
function renderPdfPageSection(slide: CourseSlide, ctx: RenderContext): string {
  const src = ctx.pageSrc?.(slide) ?? '';
  const figure = src
    ? `<div class="pdf-paper"><img src="${escapeHtml(src)}" alt="${escapeHtml(
        slide.title || ''
      )}" decoding="sync"></div>`
    : `<div class="pdf-paper" style="padding:56px 64px;line-height:1.5;font-size:28px;color:#64707c">第 ${
        slide.order + 1
      } 页的原页图片缺失，重新导入即可恢复</div>`;
  return `<section class="slide pdf-page" data-index="${slide.order}" data-density="1" style="--accent:#3f5147;--accent-soft:#e9edf1">
      ${figure}
    </section>`;
}

/* ============================================================
   整册课件
   ============================================================ */
const DECK_SCRIPT = `(function () {
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  if (!slides.length) return;
  var stage = document.getElementById('deckStage');
  var bar = document.getElementById('deckBar');
  var counter = document.getElementById('deckCounter');
  var projectId = document.body.getAttribute('data-project') || 'deck';
  var storeKey = 'kexu-deck:' + projectId;
  var current = 0;
  var wheelLock = false;

  function scale() {
    var factor = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    var x = (window.innerWidth - 1920 * factor) / 2;
    var y = (window.innerHeight - 1080 * factor) / 2;
    stage.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + factor + ')';
  }

  function paint(index, writeHash) {
    current = Math.max(0, Math.min(index, slides.length - 1));
    slides.forEach(function (slide, i) {
      var on = i === current;
      slide.classList.toggle('active', on);
      slide.classList.toggle('visible', on);
      slide.setAttribute('aria-hidden', on ? 'false' : 'true');
    });
    if (counter) counter.textContent = (current + 1) + ' / ' + slides.length;
    if (bar) bar.style.width = ((current + 1) / slides.length) * 100 + '%';
    if (writeHash) {
      try { history.replaceState(null, '', '#' + (current + 1)); } catch (err) {}
    }
  }

  function next() { paint(current + 1, true); }
  function prev() { paint(current - 1, true); }

  /* 键盘：方向键 / 空格 / PageUp、PageDown / Home、End */
  document.addEventListener('keydown', function (event) {
    var editing = document.body.classList.contains('editing');
    var target = event.target;
    if (editing && target && target.getAttribute && target.getAttribute('contenteditable') === 'true') return;
    switch (event.key) {
      case 'ArrowRight': case 'ArrowDown': case ' ': case 'PageDown': case 'Enter':
        event.preventDefault(); next(); break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp':
        event.preventDefault(); prev(); break;
      case 'Home': event.preventDefault(); paint(0, true); break;
      case 'End': event.preventDefault(); paint(slides.length - 1, true); break;
      case 'e': case 'E': setEdit(!document.body.classList.contains('editing')); break;
      case 'p': case 'P': window.print(); break;
      default: break;
    }
  });

  /* 滚轮翻页：加锁避免一次手势连翻 */
  window.addEventListener('wheel', function (event) {
    if (Math.abs(event.deltaY) < 12) return;
    if (document.body.classList.contains('editing')) return;
    if (wheelLock) return;
    wheelLock = true;
    setTimeout(function () { wheelLock = false; }, 480);
    if (event.deltaY > 0) next(); else prev();
  }, { passive: true });

  /* 触屏左右滑动 */
  var touchX = 0;
  var touchY = 0;
  window.addEventListener('touchstart', function (event) {
    if (!event.touches.length) return;
    touchX = event.touches[0].clientX;
    touchY = event.touches[0].clientY;
  }, { passive: true });
  window.addEventListener('touchend', function (event) {
    if (!event.changedTouches.length) return;
    var dx = event.changedTouches[0].clientX - touchX;
    var dy = event.changedTouches[0].clientY - touchY;
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) next(); else prev();
  }, { passive: true });

  /* 就地改字：改动存本地，刷新后仍在 */
  var saveTimer = null;
  function collect() {
    var map = {};
    document.querySelectorAll('.slide [data-edit]').forEach(function (el, i) {
      map[i] = el.innerHTML;
    });
    return map;
  }
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(storeKey, JSON.stringify(collect())); } catch (err) {}
    }, 320);
  }
  function restore() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(storeKey) || 'null'); } catch (err) {}
    if (!saved) return;
    document.querySelectorAll('.slide [data-edit]').forEach(function (el, i) {
      if (typeof saved[i] === 'string') el.innerHTML = saved[i];
    });
  }
  function setEdit(on) {
    document.body.classList.toggle('editing', on);
    document.querySelectorAll('.slide [data-edit]').forEach(function (el) {
      el.setAttribute('contenteditable', on ? 'true' : 'false');
    });
    var button = document.getElementById('editBtn');
    if (button) button.classList.toggle('on', on);
    var reset = document.getElementById('resetBtn');
    if (reset) reset.style.display = on ? 'inline-block' : 'none';
  }
  document.addEventListener('input', function (event) {
    if (document.body.classList.contains('editing')) persist();
  });

  function bind() {
    var prevBtn = document.getElementById('prevBtn');
    var nextBtn = document.getElementById('nextBtn');
    var editBtn = document.getElementById('editBtn');
    var resetBtn = document.getElementById('resetBtn');
    if (prevBtn) prevBtn.addEventListener('click', prev);
    if (nextBtn) nextBtn.addEventListener('click', next);
    if (editBtn) editBtn.addEventListener('click', function () {
      setEdit(!document.body.classList.contains('editing'));
    });
    if (resetBtn) resetBtn.addEventListener('click', function () {
      try { localStorage.removeItem(storeKey); } catch (err) {}
      setEdit(false);
      window.location.reload();
    });
  }

  window.addEventListener('resize', scale);
  restore();
  scale();
  bind();
  var start = parseInt((window.location.hash || '').replace('#', ''), 10);
  paint(isNaN(start) ? 0 : start - 1, false);
})();
`;

export function buildDeckHtml(project: CourseProject): string {
  const slides = Array.isArray(project.slides) ? project.slides : [];
  const ctx: RenderContext = {
    project,
    total: slides.length,
    pageSrc: (slide) => (slide.pageImage ? pdfPageSrc(project.id, slide.pageImage) : '')
  };
  const sections = slides.map((slide) => renderSection(slide, ctx)).join('\n');
  const course = courseLabel(project);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(course)}</title>
<style>${VIEWPORT_BASE_CSS}${SLIDE_CSS}</style>
</head>
<body data-project="${escapeHtml(project.id)}">
<div class="deck-progress" id="deckBar"></div>
<div class="deck-viewport">
  <main class="deck-stage" id="deckStage" aria-label="${escapeHtml(course)}">
${sections}
  </main>
</div>
<nav class="deck-controls" aria-label="放映控制">
  <button id="prevBtn" title="上一页（←）" aria-label="上一页">←</button>
  <span class="counter" id="deckCounter">1 / ${slides.length}</span>
  <button id="nextBtn" title="下一页（→）" aria-label="下一页">→</button>
  <button id="editBtn" title="就地改字（E）" aria-label="就地改字">改字</button>
  <button id="resetBtn" title="清除本机改动" aria-label="清除本机改动" style="display:none">还原</button>
</nav>
<div class="deck-hint">方向键翻页 · E 改字 · P 打印或导出 PDF</div>
<script>${DECK_SCRIPT}</script>
</body>
</html>`;
}

/**
 * 单页版本：供成片截图、缩略图与逐页预览使用，视觉与整册完全一致。
 *
 * 页面内容是 1920×1080 的固定舞台，放进任意大小的窗口或 iframe 时
 * 必须整体等比缩放——否则小窗口里只能看到左上角一小块，看着像"课件特别大"。
 * 截图窗口正好 1920×1080，缩放系数为 1，抓出来的图与原尺寸完全一致。
 */
const SINGLE_FIT_SCRIPT = `
(function () {
  var stage = document.getElementById('fitStage');
  if (!stage) return;
  function fit() {
    var w = window.innerWidth || 1920;
    var h = window.innerHeight || 1080;
    var factor = Math.min(w / 1920, h / 1080);
    var x = (w - 1920 * factor) / 2;
    var y = (h - 1080 * factor) / 2;
    stage.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + factor + ')';
  }
  fit();
  window.addEventListener('resize', fit);
  window.addEventListener('load', fit);
})();
`;

export function buildDeckSlideHtml(
  slide: CourseSlide,
  project: CourseProject,
  total?: number
): string {
  const ctx: RenderContext = {
    project,
    total: total ?? project.slides.length,
    pageSrc: (item) => (item.pageImage ? pdfPageSrc(project.id, item.pageImage) : '')
  };
  const accent = ACCENTS[slide.accent] ?? ACCENTS.ink;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(polish(slide.title) || courseLabel(project))}</title>
<style>${SLIDE_CSS}
html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #ffffff; }
.fit-stage { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; transform-origin: 0 0; }
.slide { position: absolute; inset: 0; width: 1920px; height: 1080px; visibility: visible; opacity: 1; }
.reveal { opacity: 1; transform: none; }
.mark { animation: none; }
</style>
</head>
<body style="--accent:${accent.accent};--accent-soft:${accent.soft}">
<div class="fit-stage" id="fitStage">
${renderSection(slide, ctx)}
</div>
<script>${SINGLE_FIT_SCRIPT}</script>
</body>
</html>`;
}

/** 写入 data/media/<project>/deck.html，返回可直接打开的地址。 */
export function writeDeck(project: CourseProject) {
  const dir = projectMediaDir(project.id);
  const file = path.join(dir, 'deck.html');
  const html = buildDeckHtml(project);
  fs.writeFileSync(file, html, 'utf8');
  return {
    url: mediaUrl(project.id, 'deck.html'),
    slides: project.slides.length,
    bytes: Buffer.byteLength(html, 'utf8')
  };
}
