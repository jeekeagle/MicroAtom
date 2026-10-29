import type {
  CourseProject,
  CourseScript,
  MediaArtifact,
  MediaKind,
  MediaTriggerPlacement,
  ProductionEngine
} from '../src/types';
import { mediaEngineForKind } from './engines';
import { localCardContent, renderInteractiveCard } from './interactive-cards';

export const MEDIA_KIND_LABEL: Record<MediaKind, string> = {
  'knowledge-graph': '知识图谱',
  'cognitive-map': '认知地图',
  'concept-card': '概念卡',
  infographic: '一图读懂',
  timeline: '课程时间线',
  quiz: '问答题',
  flashcard: '术语速记卡',
  checklist: '掌握自检卡',
  counterexample: '反例辨析卡',
  challenge: '迁移挑战卡'
};

export interface MediaGenerationInput {
  kind: MediaKind;
  title?: string;
  description?: string;
  sectionId?: string;
  slideId?: string;
  triggerSeconds?: number;
  placement?: MediaTriggerPlacement;
  engineId?: string;
}

const mediaAccents: Record<MediaKind, { accent: string; soft: string; label: string }> = {
  'knowledge-graph': { accent: '#0e6f63', soft: '#e5f4f0', label: 'RELATION MAP' },
  'cognitive-map': { accent: '#9f3d2f', soft: '#f8e9e5', label: 'LEARNING PATH' },
  'concept-card': { accent: '#9b6a18', soft: '#f8efd9', label: 'CONCEPT CARD' },
  infographic: { accent: '#23588a', soft: '#e8f0f7', label: 'VISUAL BRIEF' },
  timeline: { accent: '#6c4b3b', soft: '#f3ece8', label: 'COURSE TIMELINE' },
  quiz: { accent: '#3d5c4d', soft: '#e9f0eb', label: 'KNOWLEDGE CHECK' },
  flashcard: { accent: '#2f5d8c', soft: '#e8eff7', label: 'TERM CARD' },
  checklist: { accent: '#1f7a6d', soft: '#e6f2f0', label: 'SELF CHECK' },
  counterexample: { accent: '#a2452f', soft: '#f9ebe5', label: 'MISCONCEPTION' },
  challenge: { accent: '#8a5a12', soft: '#f8efdd', label: 'TRANSFER TASK' }
};

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const jsonForHtml = (value: unknown) =>
  JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim();

const shortText = (value: string, limit: number) => {
  const text = normalizeText(value);
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
};

const firstSentence = (value: string) => {
  const text = normalizeText(value);
  const index = text.search(/[。！？!?]/);
  return index >= 0 ? text.slice(0, index + 1) : shortText(text, 90);
};

const slideForSection = (project: CourseProject, sectionId?: string) =>
  sectionId ? project.slides.find((slide) => slide.sectionId === sectionId) : undefined;

export function suggestMediaTrigger(
  project: CourseProject,
  kind: MediaKind,
  sectionId?: string
): number {
  const shots = project.timeline?.shots ?? [];
  if (sectionId) {
    const shot = shots.find((item) => item.sectionId === sectionId);
    if (shot) return Math.max(0, Math.round(shot.startSeconds + 0.8));
    if (project.script) {
      let seconds = 0;
      for (const section of project.script.sections) {
        if (section.id === sectionId) return Math.round(seconds + 0.8);
        seconds += section.durationSeconds;
      }
    }
  }

  const sections = project.script?.sections ?? [];
  const target =
    kind === 'quiz'
      ? sections[sections.length - 1]
      : kind === 'concept-card'
        ? [...sections].sort((a, b) => b.narration.length - a.narration.length)[0]
        : sections[0];
  if (target) {
    const shot = shots.find((item) => item.sectionId === target.id);
    if (shot) return Math.max(0, Math.round(shot.startSeconds + 0.8));
    let seconds = 0;
    for (const section of sections) {
      if (section.id === target.id) break;
      seconds += section.durationSeconds;
    }
    return Math.round(seconds + 0.8);
  }
  return 0;
}

const documentShell = (
  project: CourseProject,
  script: CourseScript,
  kind: MediaKind,
  title: string,
  body: string,
  extraScript = ''
) => {
  const tone = mediaAccents[kind];
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · ${escapeHtml(project.title)}</title>
<style>
:root{--ink:#1f2421;--ink-soft:#5f6964;--paper:#fbfaf6;--line:#ddd8cc;--accent:${tone.accent};--soft:${tone.soft};--white:#fff}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;background:var(--paper);color:var(--ink);font-family:"Noto Sans SC","Microsoft YaHei","PingFang SC",Arial,sans-serif}
body{padding:clamp(16px,3vw,34px)}
button{font:inherit}
.media-doc{max-width:1180px;margin:0 auto}
.doc-kicker{display:flex;align-items:center;gap:10px;color:var(--accent);font-size:11px;font-weight:800;letter-spacing:.16em}
.doc-kicker:before{content:"";width:26px;height:2px;background:var(--accent)}
.doc-head{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;border-bottom:1px solid var(--line);padding:12px 0 20px;margin-bottom:24px}
.doc-head h1{margin:8px 0 4px;font-size:clamp(25px,4vw,48px);line-height:1.08;letter-spacing:0}
.doc-head p{margin:0;color:var(--ink-soft);font-size:13px;line-height:1.7}
.doc-course{text-align:right;font-size:12px;color:var(--ink-soft);line-height:1.65;min-width:150px}
.doc-course strong{display:block;color:var(--ink);font-size:14px}
.doc-foot{margin-top:26px;padding-top:14px;border-top:1px solid var(--line);display:flex;justify-content:space-between;gap:16px;color:var(--ink-soft);font-size:11px}
.doc-foot strong{color:var(--accent)}
.pill{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:999px;background:var(--white);padding:5px 9px;font-size:11px;color:var(--ink-soft)}
.card{background:var(--white);border:1px solid var(--line);border-radius:8px}
.eyebrow{color:var(--accent);font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
.muted{color:var(--ink-soft)}
@media(max-width:700px){body{padding:16px}.doc-head{display:block}.doc-course{text-align:left;margin-top:14px}.doc-foot{display:block}.doc-foot span{display:block;margin-top:6px}}
</style>
</head>
<body>
<main class="media-doc">
  <header class="doc-head">
    <div>
      <span class="doc-kicker">${tone.label} / ${escapeHtml(MEDIA_KIND_LABEL[kind])}</span>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(shortText(script.thesis, 150))}</p>
    </div>
    <div class="doc-course">
      <strong>${escapeHtml(project.title)}</strong>
      ${escapeHtml(project.subject)} · ${escapeHtml(project.grade)}<br>
      ${script.sections.length} 段 · ${project.durationMinutes} 分钟
    </div>
  </header>
  ${body}
  <footer class="doc-foot">
    <span><strong>课序</strong> · 课程介质容器 / 单文件 HTML</span>
    <span>${escapeHtml(script.keywords.slice(0, 4).join(' · '))}</span>
  </footer>
</main>
${extraScript}
</body>
</html>`;
};

function knowledgeGraphHtml(project: CourseProject, script: CourseScript): string {
  const sections = script.sections.slice(0, 8);
  const nodes = [
    { id: 'core', title: shortText(script.thesis, 32), detail: script.thesis, center: true },
    ...sections.map((section) => ({
      id: section.id,
      title: section.title,
      detail: `${section.purpose} ${shortText(section.narration, 110)}`,
      center: false
    }))
  ];
  const satellite = nodes.slice(1);
  const points = satellite.map((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(satellite.length, 1) - Math.PI / 2;
    return {
      ...node,
      x: 50 + Math.cos(angle) * 36,
      y: 50 + Math.sin(angle) * 36
    };
  });
  const lines = points
    .map((node) => `<line x1="50" y1="50" x2="${node.x.toFixed(2)}" y2="${node.y.toFixed(2)}" />`)
    .join('');
  const buttons = points
    .map(
      (node, index) =>
        `<button class="graph-node" style="left:${node.x}%;top:${node.y}%" data-node="${index}">
          <span>${String(index + 1).padStart(2, '0')}</span>
          <strong>${escapeHtml(shortText(node.title, 13))}</strong>
        </button>`
    )
    .join('');
  const body = `<section class="graph-layout">
    <div class="graph-board">
      <svg viewBox="0 0 100 100" aria-hidden="true">${lines}</svg>
      <div class="graph-core"><small>核心主张</small><strong>${escapeHtml(shortText(script.thesis, 46))}</strong></div>
      ${buttons}
    </div>
    <aside class="graph-detail card">
      <span class="eyebrow">NODE INSPECTOR</span>
      <h2 id="graphTitle">${escapeHtml(points[0]?.title ?? '课程关系')}</h2>
      <p id="graphBody">${escapeHtml(points[0]?.detail ?? script.thesis)}</p>
      <div class="graph-facts">
        <span class="pill">${script.sections.length} 个教学节点</span>
        <span class="pill">${script.keywords.length} 个关键词</span>
      </div>
    </aside>
  </section>
  <style>
  .graph-layout{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(250px,.7fr);gap:18px}
  .graph-board{position:relative;min-height:560px;border:1px solid var(--line);border-radius:8px;background:var(--white);overflow:hidden}
  .graph-board:before{content:"";position:absolute;inset:0;background-image:radial-gradient(#d8d2c5 1px,transparent 1px);background-size:22px 22px;opacity:.55}
  .graph-board svg{position:absolute;inset:0;width:100%;height:100%}
  .graph-board line{stroke:#b8aa92;stroke-width:.35;stroke-dasharray:1.2 1}
  .graph-core{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(230px,35%);background:var(--ink);color:#fff;border-radius:8px;padding:18px;text-align:center;z-index:2;box-shadow:0 10px 30px #1f24211f}
  .graph-core small{display:block;color:#d9d0bd;font-size:10px;letter-spacing:.12em;margin-bottom:8px}
  .graph-core strong{display:block;font-size:15px;line-height:1.45}
  .graph-node{position:absolute;transform:translate(-50%,-50%);width:150px;min-height:64px;border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:6px;background:#fffdf8;padding:10px 12px;text-align:left;cursor:pointer;z-index:2;transition:border-color .18s,transform .18s}
  .graph-node:hover,.graph-node.is-active{border-color:var(--accent);transform:translate(-50%,-50%) translateY(-3px)}
  .graph-node span{display:block;color:var(--accent);font-size:9px;font-weight:800;letter-spacing:.12em}
  .graph-node strong{display:block;font-size:13px;line-height:1.35;color:var(--ink)}
  .graph-detail{padding:24px;align-self:start;position:sticky;top:20px}
  .graph-detail h2{margin:12px 0 10px;font-size:25px;line-height:1.25}
  .graph-detail p{margin:0;color:var(--ink-soft);line-height:1.8;font-size:14px}
  .graph-facts{display:flex;flex-wrap:wrap;gap:8px;margin-top:24px}
  @media(max-width:800px){.graph-layout{grid-template-columns:1fr}.graph-board{min-height:650px}.graph-node{width:120px}.graph-detail{position:static}}
  </style>`;
  const data = jsonForHtml(points.map(({ title, detail }) => ({ title, detail })));
  const extraScript = `<script>
(() => {
  const nodes = ${data};
  const title = document.getElementById('graphTitle');
  const body = document.getElementById('graphBody');
  document.querySelectorAll('[data-node]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-node]').forEach((item) => item.classList.remove('is-active'));
      button.classList.add('is-active');
      const node = nodes[Number(button.dataset.node)];
      if (!node) return;
      title.textContent = node.title;
      body.textContent = node.detail;
    });
  });
  document.querySelector('[data-node]')?.classList.add('is-active');
})();
</script>`;
  return documentShell(project, script, 'knowledge-graph', '课程知识图谱', body, extraScript);
}

function cognitiveMapHtml(project: CourseProject, script: CourseScript): string {
  const sections = script.sections;
  const known = sections.slice(0, Math.max(1, Math.ceil(sections.length / 3)));
  const building = sections.slice(known.length, Math.max(known.length + 1, sections.length - 1));
  const transfer = sections.slice(known.length + building.length);
  const column = (title: string, label: string, items: typeof sections, index: number) => `
    <section class="map-column">
      <div class="map-column-head"><span>${String(index).padStart(2, '0')}</span><div><small>${label}</small><h2>${title}</h2></div></div>
      <div class="map-stack">
        ${items
          .map(
            (section) => `<article class="map-note">
              <span>${escapeHtml(section.title)}</span>
              <strong>${escapeHtml(shortText(section.purpose, 34))}</strong>
              <p>${escapeHtml(shortText(section.narration, 72))}</p>
            </article>`
          )
          .join('')}
      </div>
    </section>`;
  const body = `<section class="map-wrap">
    <div class="map-summary">
      <span class="eyebrow">COGNITIVE ROUTE</span>
      <p>从已有经验出发，经过概念辨析与证据检验，最终迁移到新的问题情境。</p>
      <div>${script.objectives.map((item) => `<span class="pill">${escapeHtml(shortText(item, 36))}</span>`).join('')}</div>
    </div>
    <div class="map-grid">
      ${column('已经知道', 'ANCHOR', known, 1)}
      ${column('正在建立', 'BRIDGE', building, 2)}
      ${column('迁移应用', 'TRANSFER', transfer.length ? transfer : sections.slice(-1), 3)}
    </div>
  </section>
  <style>
  .map-summary{display:grid;grid-template-columns:150px minmax(0,1fr);gap:20px;border:1px solid var(--line);border-radius:8px;background:var(--white);padding:18px;margin-bottom:16px}
  .map-summary p{margin:0;color:var(--ink-soft);line-height:1.7;font-size:13px}
  .map-summary>div{grid-column:2;display:flex;flex-wrap:wrap;gap:6px}
  .map-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;align-items:start}
  .map-column{border-top:3px solid var(--accent);background:#fff;border-radius:6px;padding:14px;min-height:420px}
  .map-column:nth-child(2){border-top-color:#23588a}.map-column:nth-child(3){border-top-color:#9b6a18}
  .map-column-head{display:flex;gap:10px;align-items:flex-start;padding-bottom:12px;border-bottom:1px solid var(--line);margin-bottom:12px}
  .map-column-head>span{font-size:26px;font-weight:800;color:#b7ad9c;line-height:1}
  .map-column-head small{font-size:9px;letter-spacing:.14em;color:var(--ink-soft)}
  .map-column-head h2{margin:3px 0 0;font-size:18px}
  .map-stack{display:grid;gap:9px}
  .map-note{background:#fbfaf6;border:1px solid var(--line);border-radius:6px;padding:12px}
  .map-note>span{display:block;color:var(--accent);font-size:10px;font-weight:800;margin-bottom:6px}
  .map-note strong{display:block;font-size:13px;line-height:1.45}
  .map-note p{margin:7px 0 0;color:var(--ink-soft);font-size:11px;line-height:1.65}
  @media(max-width:900px){.map-grid{grid-template-columns:1fr}.map-column{min-height:0}.map-summary{grid-template-columns:1fr}.map-summary>div{grid-column:auto}}
  </style>`;
  return documentShell(project, script, 'cognitive-map', '认知地图', body);
}

function conceptCardHtml(project: CourseProject, script: CourseScript, sectionId?: string): string {
  const section = script.sections.find((item) => item.id === sectionId) ?? script.sections[0];
  const points = [
    { label: '它是什么', value: section?.purpose || script.thesis },
    { label: '关键边界', value: section?.valueNote || script.valueThread[0]?.content || '先确认概念适用的条件' },
    { label: '课堂证据', value: firstSentence(section?.narration || script.openingHook) },
    { label: '常见误区', value: section?.slideBrief || '把现象当作结论，忽略形成条件' }
  ];
  const body = `<section class="concept-stage">
    <div class="concept-front">
      <span class="eyebrow">ONE CONCEPT</span>
      <div class="concept-index">${String(section?.order ?? 1).padStart(2, '0')}</div>
      <h2>${escapeHtml(section?.title ?? script.title)}</h2>
      <p>${escapeHtml(shortText(section?.narration ?? script.thesis, 180))}</p>
      <div class="concept-keywords">
        ${script.keywords.slice(0, 3).map((word) => `<span>${escapeHtml(word)}</span>`).join('')}
      </div>
    </div>
    <div class="concept-grid">
      ${points
        .map(
          (point, index) => `<article>
            <span>${String(index + 1).padStart(2, '0')}</span>
            <small>${escapeHtml(point.label)}</small>
            <p>${escapeHtml(shortText(point.value, 145))}</p>
          </article>`
        )
        .join('')}
    </div>
    <div class="concept-transfer">
      <span class="eyebrow">TRANSFER QUESTION</span>
      <strong>如果换一个情境，你还能找到同样的关系吗？</strong>
      <p>${escapeHtml(script.objectives[script.objectives.length - 1] ?? script.summary)}</p>
    </div>
  </section>
  <style>
  .concept-stage{display:grid;grid-template-columns:minmax(260px,.7fr) minmax(0,1.3fr);gap:16px}
  .concept-front{background:var(--ink);color:#fff;border-radius:8px;padding:clamp(24px,4vw,44px);position:relative;overflow:hidden;min-height:440px}
  .concept-front:after{content:"";position:absolute;right:-70px;bottom:-70px;width:230px;height:230px;border:1px solid #ffffff26;border-radius:50%}
  .concept-front .eyebrow{color:#d9cdb7}
  .concept-index{font-size:76px;line-height:1;font-weight:800;color:#ffffff14;margin:24px 0 10px}
  .concept-front h2{font-size:clamp(28px,4vw,45px);line-height:1.13;margin:0;position:relative;z-index:1}
  .concept-front p{color:#d8d5cc;line-height:1.8;font-size:14px;margin:18px 0 24px;position:relative;z-index:1}
  .concept-keywords{display:flex;flex-wrap:wrap;gap:6px;position:relative;z-index:1}
  .concept-keywords span{border:1px solid #ffffff35;border-radius:999px;padding:5px 9px;font-size:11px}
  .concept-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .concept-grid article{background:#fff;border:1px solid var(--line);border-radius:8px;padding:18px;min-height:150px}
  .concept-grid article>span{font-size:10px;font-weight:800;color:var(--accent)}
  .concept-grid small{display:block;margin-top:10px;color:var(--ink-soft);font-size:10px;font-weight:800;letter-spacing:.08em}
  .concept-grid p{margin:7px 0 0;font-size:14px;line-height:1.7}
  .concept-transfer{grid-column:1/-1;background:var(--soft);border-left:4px solid var(--accent);padding:18px 22px;border-radius:6px}
  .concept-transfer strong{display:block;margin-top:8px;font-size:17px}
  .concept-transfer p{margin:6px 0 0;color:var(--ink-soft);font-size:12px;line-height:1.7}
  @media(max-width:760px){.concept-stage{grid-template-columns:1fr}.concept-front{min-height:0}.concept-grid{grid-template-columns:1fr}}
  </style>`;
  return documentShell(project, script, 'concept-card', section ? `概念卡 · ${section.title}` : '概念卡', body);
}

function infographicHtml(project: CourseProject, script: CourseScript): string {
  const body = `<section class="info-brief">
    <div class="info-thesis">
      <span class="eyebrow">ONE BIG IDEA</span>
      <h2>${escapeHtml(shortText(script.thesis, 95))}</h2>
      <p>${escapeHtml(shortText(script.openingHook, 170))}</p>
    </div>
    <div class="info-metrics">
      <div><strong>${script.sections.length}</strong><span>教学段落</span></div>
      <div><strong>${script.objectives.length}</strong><span>学习目标</span></div>
      <div><strong>${project.durationMinutes}</strong><span>课程分钟</span></div>
    </div>
    <div class="info-objectives">
      <span class="eyebrow">LEARNING OUTCOMES</span>
      ${script.objectives
        .slice(0, 4)
        .map(
          (item, index) => `<div><span>${String(index + 1).padStart(2, '0')}</span><p>${escapeHtml(item)}</p></div>`
        )
        .join('')}
    </div>
    <div class="info-flow">
      <span class="eyebrow">CONTENT FLOW</span>
      <div class="info-flow-grid">
        ${script.sections
          .map(
            (section) => `<article>
              <span>${String(section.order).padStart(2, '0')}</span>
              <strong>${escapeHtml(section.title)}</strong>
              <p>${escapeHtml(shortText(section.purpose, 48))}</p>
            </article>`
          )
          .join('')}
      </div>
    </div>
    <div class="info-value">
      <span class="eyebrow">VALUE THREAD</span>
      ${script.valueThread
        .map(
          (item) => `<div><strong>${escapeHtml(item.label)}</strong><p>${escapeHtml(shortText(item.content, 95))}</p></div>`
        )
        .join('')}
    </div>
  </section>
  <style>
  .info-brief{display:grid;grid-template-columns:1.3fr .7fr;gap:12px}
  .info-thesis{grid-column:1/-1;background:var(--soft);border:1px solid var(--line);border-radius:8px;padding:clamp(22px,4vw,42px)}
  .info-thesis h2{margin:12px 0;font-size:clamp(23px,3.5vw,39px);line-height:1.35;max-width:980px}
  .info-thesis p{margin:0;max-width:820px;color:var(--ink-soft);line-height:1.8;font-size:13px}
  .info-metrics{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--line);border-radius:8px;background:#fff;overflow:hidden}
  .info-metrics div{padding:24px 14px;text-align:center;border-right:1px solid var(--line)}
  .info-metrics div:last-child{border-right:0}
  .info-metrics strong{display:block;font-size:38px;color:var(--accent);line-height:1}
  .info-metrics span{display:block;margin-top:7px;color:var(--ink-soft);font-size:11px}
  .info-objectives,.info-flow,.info-value{background:#fff;border:1px solid var(--line);border-radius:8px;padding:20px}
  .info-objectives{grid-row:span 2}
  .info-objectives>div{display:grid;grid-template-columns:30px 1fr;gap:10px;padding:12px 0;border-bottom:1px solid var(--line)}
  .info-objectives>div:last-child{border-bottom:0}
  .info-objectives>div>span{color:var(--accent);font-size:10px;font-weight:800}
  .info-objectives p{margin:0;font-size:12px;line-height:1.65}
  .info-flow{grid-column:1/-1}
  .info-flow-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:8px;margin-top:12px}
  .info-flow-grid article{border-top:2px solid var(--accent);background:#fbfaf6;padding:12px}
  .info-flow-grid article>span{font-size:9px;color:var(--accent);font-weight:800}
  .info-flow-grid strong{display:block;margin-top:7px;font-size:13px}
  .info-flow-grid p{margin:5px 0 0;color:var(--ink-soft);font-size:11px;line-height:1.55}
  .info-value>div{padding:10px 0;border-bottom:1px solid var(--line)}
  .info-value>div:last-child{border-bottom:0}
  .info-value strong{font-size:12px}.info-value p{margin:4px 0 0;color:var(--ink-soft);font-size:11px;line-height:1.6}
  @media(max-width:780px){.info-brief{grid-template-columns:1fr}.info-thesis,.info-flow{grid-column:auto}.info-objectives{grid-row:auto}}
  </style>`;
  return documentShell(project, script, 'infographic', '一图读懂这堂课', body);
}

function timelineHtml(project: CourseProject, script: CourseScript): string {
  let cursor = 0;
  const rows = script.sections
    .map((section) => {
      const start = cursor;
      cursor += section.durationSeconds;
      return { section, start, end: cursor };
    })
    .map(
      ({ section, start, end }, index) => `<article class="time-row">
        <div class="time-mark"><span>${String(index + 1).padStart(2, '0')}</span><i></i></div>
        <div class="time-card">
          <div class="time-card-head">
            <strong>${escapeHtml(section.title)}</strong>
            <span>${Math.floor(start / 60)}:${String(start % 60).padStart(2, '0')} – ${Math.floor(end / 60)}:${String(end % 60).padStart(2, '0')}</span>
          </div>
          <p>${escapeHtml(section.purpose)}</p>
          <small>${escapeHtml(firstSentence(section.narration))}</small>
        </div>
      </article>`
    )
    .join('');
  const body = `<section class="timeline-wrap">
    <div class="timeline-intro">
      <span class="eyebrow">TEACHING SEQUENCE</span>
      <h2>从一个问题，走到一次可迁移的理解</h2>
      <p>${escapeHtml(script.summary)}</p>
    </div>
    <div class="time-list">${rows}</div>
  </section>
  <style>
  .timeline-intro{max-width:780px;margin-bottom:26px}
  .timeline-intro h2{font-size:clamp(24px,3vw,36px);margin:10px 0;line-height:1.35}
  .timeline-intro p{margin:0;color:var(--ink-soft);line-height:1.8;font-size:13px}
  .time-list{display:grid;gap:0}
  .time-row{display:grid;grid-template-columns:54px 1fr;gap:12px}
  .time-mark{display:flex;flex-direction:column;align-items:center}
  .time-mark span{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:var(--accent);color:#fff;font-size:11px;font-weight:800}
  .time-mark i{display:block;width:1px;flex:1;min-height:54px;background:var(--line)}
  .time-row:last-child .time-mark i{display:none}
  .time-card{border:1px solid var(--line);border-radius:8px;background:#fff;padding:17px 18px;margin-bottom:12px}
  .time-card-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
  .time-card-head strong{font-size:16px}
  .time-card-head span{font-size:10px;color:var(--accent);font-weight:800;white-space:nowrap}
  .time-card p{margin:9px 0 0;font-size:12px;line-height:1.65}
  .time-card small{display:block;margin-top:8px;color:var(--ink-soft);font-size:11px;line-height:1.7;padding-left:10px;border-left:2px solid var(--soft)}
  @media(max-width:600px){.time-row{grid-template-columns:38px 1fr}.time-mark span{width:30px;height:30px}.time-card-head{display:block}.time-card-head span{display:block;margin-top:5px}}
  </style>`;
  return documentShell(project, script, 'timeline', '课程时间线', body);
}

function quizHtml(project: CourseProject, script: CourseScript): string {
  const baseQuestions = [
    ...script.objectives.map((objective, index) => ({
      question: `学习目标 ${index + 1}：你能用自己的话说清“${shortText(objective, 42)}”吗？`,
      answer: script.sections[index]?.narration ?? script.summary
    })),
    ...script.valueThread.map((item) => ({
      question: `价值追问：${shortText(item.content, 50)} 这对你的判断意味着什么？`,
      answer: `${item.label}：${item.content}`
    }))
  ];
  const questions = baseQuestions.slice(0, 6);
  const body = `<section class="quiz-wrap">
    <div class="quiz-head">
      <div><span class="eyebrow">FORMATIVE CHECK</span><h2>先想十秒，再展开参考答案</h2></div>
      <span class="pill">${questions.length} 道形成性问题</span>
    </div>
    <div class="quiz-grid">
      ${questions
        .map(
          (item, index) => `<details class="quiz-card">
            <summary><span>${String(index + 1).padStart(2, '0')}</span><strong>${escapeHtml(item.question)}</strong><i>展开</i></summary>
            <div class="quiz-answer">
              <span class="eyebrow">REFERENCE</span>
              <p>${escapeHtml(item.answer)}</p>
            </div>
          </details>`
        )
        .join('')}
    </div>
    <div class="quiz-close">
      <span class="eyebrow">EXIT TICKET</span>
      <strong>用一句话写下：今天我改变了哪个原来的判断？</strong>
    </div>
  </section>
  <style>
  .quiz-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;margin-bottom:16px}
  .quiz-head h2{margin:8px 0 0;font-size:clamp(22px,3vw,34px)}
  .quiz-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .quiz-card{background:#fff;border:1px solid var(--line);border-radius:8px;overflow:hidden}
  .quiz-card[open]{border-color:var(--accent)}
  .quiz-card summary{list-style:none;display:grid;grid-template-columns:36px 1fr auto;gap:10px;align-items:center;padding:17px;cursor:pointer}
  .quiz-card summary::-webkit-details-marker{display:none}
  .quiz-card summary>span{color:var(--accent);font-size:10px;font-weight:800}
  .quiz-card summary strong{font-size:13px;line-height:1.55}
  .quiz-card summary i{font-style:normal;font-size:10px;color:var(--ink-soft);border:1px solid var(--line);border-radius:99px;padding:4px 8px}
  .quiz-answer{border-top:1px solid var(--line);background:var(--soft);padding:16px}
  .quiz-answer p{margin:7px 0 0;font-size:12px;line-height:1.75;color:var(--ink)}
  .quiz-close{margin-top:14px;background:var(--ink);color:#fff;border-radius:8px;padding:22px}
  .quiz-close .eyebrow{color:#d8ccb8}
  .quiz-close strong{display:block;margin-top:8px;font-size:18px;line-height:1.5}
  @media(max-width:760px){.quiz-grid{grid-template-columns:1fr}.quiz-head{display:block}.quiz-head>.pill{margin-top:10px}}
  </style>`;
  return documentShell(project, script, 'quiz', '课程问答题', body);
}

export function buildMediaHtml(
  project: CourseProject,
  kind: MediaKind,
  sectionId?: string
): string {
  const script = project.script;
  if (!script) throw new Error('请先生成并确认讲稿');
  switch (kind) {
    case 'knowledge-graph':
      return knowledgeGraphHtml(project, script);
    case 'cognitive-map':
      return cognitiveMapHtml(project, script);
    case 'concept-card':
      return conceptCardHtml(project, script, sectionId);
    case 'infographic':
      return infographicHtml(project, script);
    case 'timeline':
      return timelineHtml(project, script);
    case 'quiz':
      return quizHtml(project, script);
    case 'flashcard':
    case 'checklist':
    case 'counterexample':
    case 'challenge':
      return renderInteractiveCard(project, kind, localCardContent(project, kind, sectionId));
    default:
      throw new Error('不支持的介质类型');
  }
}

export function createMediaArtifact(
  project: CourseProject,
  engines: ProductionEngine[],
  input: MediaGenerationInput
): MediaArtifact {
  const script = project.script;
  if (!script) throw new Error('请先生成并确认讲稿');
  const engine =
    (input.engineId ? engines.find((item) => item.id === input.engineId && item.stage === 'media') : undefined) ??
    mediaEngineForKind(engines, input.kind);
  if (!engine) throw new Error('没有可用的介质引擎');
  const section =
    script.sections.find((item) => item.id === input.sectionId) ??
    (input.kind === 'concept-card'
      ? [...script.sections].sort((a, b) => b.narration.length - a.narration.length)[0]
      : script.sections[0]);
  const slide = slideForSection(project, section?.id);
  const title =
    input.title?.trim() ||
    (input.kind === 'concept-card' && section
      ? `概念卡 · ${section.title}`
      : MEDIA_KIND_LABEL[input.kind]);
  const description =
    input.description?.trim() ||
    `${engine.name}根据讲稿生成，关联「${section?.title ?? '整门课程'}」。`;
  const createdAt = new Date().toISOString();
  return {
    id: `media-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    kind: input.kind,
    title,
    description,
    html: buildMediaHtml(project, input.kind, section?.id),
    status: 'ready',
    engineId: engine.id,
    skillId: engine.skillIds[0],
    sectionId: section?.id,
    slideId: input.slideId ?? slide?.id,
    triggerSeconds:
      input.triggerSeconds !== undefined
        ? Math.max(0, Math.round(Number(input.triggerSeconds) * 10) / 10)
        : suggestMediaTrigger(project, input.kind, section?.id),
    placement: input.placement ?? 'below',
    createdAt,
    updatedAt: createdAt
  };
}
