import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type {
  CourseMount,
  CourseProject,
  DeliveryBundle,
  DeliveryCue,
  MediaArtifact,
  MediaKind
} from '../src/types';
import { mediaRoot, projectMediaDir } from './media';

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const safeFilePart = (value: string) =>
  value.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 70) || 'artifact';

const formatSeconds = (value: number) => {
  const seconds = Math.max(0, Math.round(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const sizeOf = (target: string): number => {
  if (!fs.existsSync(target)) return 0;
  const stat = fs.statSync(target);
  if (!stat.isDirectory()) return stat.size;
  return fs
    .readdirSync(target)
    .reduce((sum, item) => sum + sizeOf(path.join(target, item)), 0);
};

/** 卡片在归档轨上圆点的颜色。和编辑台、卡片本身的配色保持一致。 */
const KIND_COLORS: Record<MediaKind, string> = {
  'knowledge-graph': '#0e6f63',
  'cognitive-map': '#9f3d2f',
  'concept-card': '#9b6a18',
  infographic: '#23588a',
  timeline: '#6c4b3b',
  quiz: '#3d5c4d',
  flashcard: '#2f5d8c',
  checklist: '#1f7a6d',
  counterexample: '#a2452f',
  challenge: '#8a5a12'
};

const KIND_LABELS: Record<MediaKind, string> = {
  'knowledge-graph': '知识图谱',
  'cognitive-map': '认知地图',
  'concept-card': '概念卡',
  infographic: '一图读懂',
  timeline: '课程时间线',
  quiz: '随堂提问',
  flashcard: '术语速记',
  checklist: '掌握自检',
  counterexample: '反例辨析',
  challenge: '迁移挑战'
};

/**
 * 默认出现方式：要学生动手的（题、自检、挑战）停下来看，
 * 纯补充说明的（图谱、一图读懂、术语卡）边播边看。
 */
const defaultHold = (kind: MediaKind) =>
  kind === 'quiz' ||
  kind === 'checklist' ||
  kind === 'challenge' ||
  kind === 'counterexample';

const cardColor = (kind: MediaKind) => KIND_COLORS[kind] ?? '#a14232';

/**
 * 卡片进右侧面板前先把"卡片自己的外壳"拆掉：
 * 面板本身已经是框，卡片再套一层边框、再加一条重复的课程页眉，就变成三层皮。
 */
const CARD_FIT = `<style>
html,body{background:#fff}
body{margin:0;padding:18px 20px}
.card{max-width:none!important;margin:0!important}
.card-head{display:none!important}
.card-face{background:transparent!important;border:0!important;box-shadow:none!important;border-radius:0!important;padding:0!important}
.card-face>.tag,.card-face>h2{display:none!important}
</style>`;

const withCardFit = (html: string) =>
  /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${CARD_FIT}</body>`) : `${html}${CARD_FIT}`;

function runCompressArchive(sourceDir: string, destination: string): Promise<void> {
  const escapedSource = sourceDir.replace(/'/g, "''");
  const escapedDestination = destination.replace(/'/g, "''");
  const command = `Compress-Archive -Path '${escapedSource}\\*' -DestinationPath '${escapedDestination}' -Force`;
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { windowsHide: true }
    );
    let errorOutput = '';
    child.stderr.on('data', (chunk) => {
      errorOutput += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(errorOutput.trim() || `Compress-Archive exited with ${code}`));
    });
  });
}

/**
 * 学习工作台：左边固定视频 + 下方合并归档轨，右边是卡片舞台。
 * 不是一个"读完就关"的文档页，而是一个边看边拿卡的桌面。
 */
const deliveryHtml = (project: CourseProject, cues: DeliveryCue[]): string => {
  const duration =
    project.render?.durationSeconds ?? project.timeline?.totalSeconds ?? 0;
  const safeDuration = duration > 0 ? duration : 1;
  const payload = cues.map((cue, index) => ({
    index,
    title: cue.title,
    description: cue.description,
    at: Number(cue.atSeconds.toFixed(2)),
    end: Number(cue.endSeconds.toFixed(2)),
    hold: cue.hold,
    kind: cue.kind,
    kindLabel: KIND_LABELS[cue.kind] ?? cue.kind,
    color: cardColor(cue.kind),
    file: cue.file,
    timeLabel: formatSeconds(cue.atSeconds),
    left: Math.min(100, Math.max(0, (cue.atSeconds / safeDuration) * 100))
  }));

  const dots = payload
    .map(
      (cue) =>
        `<button class="wb-dot${cue.hold ? ' is-hold' : ' is-flow'}" type="button" data-i="${cue.index}" style="left:${cue.left.toFixed(3)}%;--c:${cue.color}" title="${escapeHtml(
          `${cue.timeLabel} · ${cue.kindLabel}｜${cue.title}`
        )}" aria-label="${escapeHtml(`${cue.timeLabel} ${cue.title}`)}"><i></i></button>`
    )
    .join('');

  const frames = payload
    .map(
      (cue) =>
        `<iframe class="wb-frame" data-i="${cue.index}" title="${escapeHtml(cue.title)}" loading="lazy" src="cards/${escapeHtml(cue.file)}"></iframe>`
    )
    .join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(project.title)} · 学习工作台</title>
<style>
:root{
  --paper:#f5f3ec;--surface:#fff;--ink:#1c221f;--ink2:#3d4741;--soft:#6d776f;
  --line:#e4ded0;--line2:#efe9dc;--brick:#a14232;--teal:#0e6f63;--gold:#a87922;
  --shadow:0 18px 44px rgba(28,34,31,.10);--shadow-sm:0 6px 16px rgba(28,34,31,.08);
  --radius:14px;
}
*{box-sizing:border-box}
html,body{height:100%}
body{
  margin:0;background:var(--paper);color:var(--ink);
  font-family:"Noto Sans SC","PingFang SC","Microsoft YaHei UI","Microsoft YaHei",Arial,sans-serif;
  -webkit-font-smoothing:antialiased;overflow:hidden;
}
button{font:inherit;color:inherit}
.wb{display:grid;grid-template-rows:auto minmax(0,1fr);height:100dvh}

/* ---------- 顶栏 ---------- */
.wb-top{
  display:flex;align-items:center;gap:16px;
  padding:12px clamp(14px,2vw,24px);
  background:rgba(255,255,255,.72);border-bottom:1px solid var(--line);
  backdrop-filter:blur(8px);
}
.wb-brand{display:flex;align-items:center;gap:9px;flex:none;font-size:10px;font-weight:800;letter-spacing:.16em;color:var(--brick)}
.wb-mark{width:20px;height:20px;border:1.4px solid var(--ink);position:relative;border-radius:2px}
.wb-mark:before,.wb-mark:after{content:"";position:absolute;width:5px;height:5px;background:var(--brick)}
.wb-mark:before{left:3px;top:3px}
.wb-mark:after{right:3px;bottom:3px}
.wb-head{min-width:0;flex:1}
.wb-head h1{margin:0;font-size:16px;font-weight:700;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wb-head p{margin:2px 0 0;font-size:11px;color:var(--soft)}
.wb-tools{display:flex;align-items:center;gap:8px;flex:none}
.wb-state{
  display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 11px;border-radius:99px;
  background:#fff;border:1px solid var(--line);font-size:11px;font-weight:600;color:var(--ink2);
}
.wb-state i{width:6px;height:6px;border-radius:50%;background:#b9c0b8}
.wb-state.is-live i{background:var(--teal);box-shadow:0 0 0 3px rgba(14,111,99,.14)}
.wb-state.is-hold i{background:var(--gold);box-shadow:0 0 0 3px rgba(168,121,34,.16)}
.wb-btn{
  height:28px;padding:0 12px;border-radius:8px;border:1px solid var(--ink);
  background:var(--ink);color:#fff;font-size:11px;font-weight:600;cursor:pointer;
}
.wb-btn:hover{background:#000}

/* ---------- 主体 ---------- */
.wb-body{
  display:grid;grid-template-columns:minmax(0,1fr) clamp(280px,26vw,420px);
  gap:clamp(10px,1.2vw,16px);padding:clamp(10px,1.2vw,16px);min-height:0;
}
.wb-left{display:grid;grid-template-rows:minmax(0,1fr) auto;gap:12px;min-height:0}

/* 视频：左上固定 */
.wb-video{
  position:relative;min-height:0;display:flex;align-items:center;justify-content:center;
  background:#0e1210;border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow);
}
.wb-video video{display:block;width:100%;height:100%;max-height:100%;object-fit:contain;background:#0e1210}
.wb-video:after{
  content:"";position:absolute;inset:0;border-radius:var(--radius);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.06);pointer-events:none;
}

/* ---------- 归档轨 ---------- */
.wb-arch{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:12px 16px 10px;box-shadow:var(--shadow-sm)}
.wb-arch-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.wb-arch-title{font-size:10px;font-weight:800;letter-spacing:.14em;color:var(--soft)}
.wb-arch-time{font-family:"SFMono-Regular",Consolas,monospace;font-size:11px;color:var(--soft)}
.wb-arch-time b{color:var(--ink);font-weight:700}
.wb-rail{position:relative;height:44px;margin:2px 0 0;cursor:pointer}
.wb-rail-base,.wb-rail-fill{position:absolute;left:0;top:50%;height:7px;border-radius:99px;transform:translateY(-50%)}
.wb-rail-base{right:0;background:#ebe5d8}
.wb-rail-fill{width:0;background:linear-gradient(90deg,var(--brick),#c3684f)}
.wb-rail-head{position:absolute;top:calc(50% - 15px);width:2px;height:30px;left:0;background:var(--ink);border-radius:2px;transform:translateX(-1px)}
.wb-rail-head i{position:absolute;left:50%;top:-4px;width:9px;height:9px;border-radius:50%;background:var(--ink);transform:translate(-50%,0)}
.wb-dot{
  position:absolute;top:50%;width:18px;height:18px;margin:0;padding:0;border:0;background:none;
  transform:translate(-50%,-50%);cursor:pointer;
}
.wb-dot i{
  display:block;width:14px;height:14px;border-radius:50%;background:var(--c);
  box-shadow:0 0 0 2.5px #fff,0 2px 6px rgba(20,26,22,.22);
  transition:transform .16s ease,box-shadow .16s ease;opacity:.62;
}
.wb-dot.is-past i,.wb-dot.is-active i{opacity:1}
.wb-dot:hover i{transform:scale(1.18);opacity:1}
.wb-dot.is-hold i{border-radius:5px}
.wb-dot.is-active i{transform:scale(1.42);box-shadow:0 0 0 3px #fff,0 0 0 5px var(--c)}
.wb-arch-foot{display:flex;align-items:center;gap:14px;margin-top:2px;font-size:10px;color:var(--soft)}
.wb-arch-foot .wb-key{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px;vertical-align:-1px;background:#b9b2a2}
.wb-arch-foot .wb-key.is-hold{border-radius:2px}
.wb-arch-foot .wb-key.is-flow{border-radius:50%}
.wb-arch-hint{margin-left:auto}

/* ---------- 右侧卡片舞台 ---------- */
.wb-panel{min-height:0;display:flex}
.wb-card{
  display:flex;flex-direction:column;flex:1;min-height:0;
  background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);
  box-shadow:var(--shadow);overflow:hidden;
}
.wb-card-top{display:none;align-items:center;gap:8px;padding:11px 14px 9px;border-bottom:1px solid var(--line2)}
.wb-card.is-live .wb-card-top{display:flex}
.wb-card-kind{
  display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 9px;border-radius:6px;
  background:color-mix(in srgb,var(--c,#a14232) 10%,#fff);color:var(--c,#a14232);
  font-size:10px;font-weight:800;letter-spacing:.06em;
}
.wb-card-kind:before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.wb-mode{
  display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 8px;border-radius:6px;
  background:#f3f1ea;color:var(--soft);font-size:10px;font-weight:600;
}
.wb-card.is-hold .wb-mode{background:#fbf2df;color:#8a6415}
.wb-resume{
  margin-left:auto;height:26px;padding:0 11px;border-radius:7px;border:1px solid var(--brick);
  background:var(--brick);color:#fff;font-size:11px;font-weight:700;cursor:pointer;
}
.wb-resume:hover{background:#8d3829}
.wb-card h2{margin:12px 16px 0;font-size:17px;line-height:1.4;letter-spacing:-.005em}
.wb-card-meta{margin:5px 16px 0;font-size:11.5px;line-height:1.6;color:var(--soft)}
.wb-card:not(.is-live) h2,.wb-card:not(.is-live) .wb-card-meta{display:none}
.wb-card-body{position:relative;flex:1;min-height:0;margin-top:11px;border-top:1px solid var(--line2);background:#fff}
.wb-frame{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff;display:none}
.wb-frame.is-active{display:block}
.wb-blank{
  position:absolute;inset:0;display:grid;place-content:center;justify-items:center;gap:6px;
  padding:26px;text-align:center;color:var(--soft);
}
.wb-blank.is-hidden{display:none}
.wb-blank-kicker{font-size:9.5px;font-weight:800;letter-spacing:.16em;color:var(--brick)}
.wb-blank strong{display:block;color:var(--ink);font-size:15px;line-height:1.45;max-width:20em}
.wb-blank p{margin:0;font-size:11.5px;line-height:1.75;max-width:22em}
.wb-blank-list{list-style:none;margin:10px 0 0;padding:12px 0 0;border-top:1px solid var(--line2);display:grid;gap:7px;text-align:left;justify-self:center;width:min(100%,22em)}
.wb-blank-list li{display:flex;gap:8px;align-items:flex-start;font-size:11px;line-height:1.6;color:var(--soft)}
.wb-blank-list i{flex:none;margin-top:5px;width:8px;height:8px;border-radius:2px;background:#c6bfaf}
.wb-blank-list i.is-dot{border-radius:50%}
.wb-blank-list i.is-key{width:13px;height:6px;border-radius:1px}
.wb-hold{
  display:none;align-items:center;gap:7px;flex:none;
  padding:7px 14px;background:#fbf2df;border-bottom:1px solid #f0e2c6;
  color:#8a6415;font-size:10.5px;font-weight:700;letter-spacing:.02em;
}
.wb-card.is-hold .wb-hold{display:flex}

@media(max-width:880px){
  .wb-body{grid-template-columns:minmax(0,1fr) clamp(272px,32vw,320px)}
  .wb-head p{display:none}
}
@media(max-width:780px){
  .wb-body{display:flex;flex-direction:column;overflow:auto;gap:10px}
  .wb-left{flex:none;gap:10px}
  .wb-video{aspect-ratio:16/9;min-height:0}
  .wb-panel{flex:none;height:min(58vh,400px)}
}
@media(max-height:700px){
  .wb-arch{padding:9px 14px 8px}
  .wb-rail{height:36px}
  .wb-card h2{font-size:15px;margin-top:8px}
}
@media(max-width:640px){
  .wb-top{flex-wrap:wrap;gap:8px}
  .wb-head{flex:1 1 100%;order:3}
  .wb-video{border-radius:10px}
  .wb-arch-hint{display:none}
}
</style>
</head>
<body>
<div class="wb">
  <header class="wb-top">
    <div class="wb-brand"><span class="wb-mark"></span>课序 · 学习工作台</div>
    <div class="wb-head">
      <h1>${escapeHtml(project.title)}</h1>
      <p>${escapeHtml(project.subject)}${project.grade ? ` · ${escapeHtml(project.grade)}` : ''} · 时长 ${formatSeconds(duration)} · ${cues.length} 张卡片</p>
    </div>
    <div class="wb-tools">
      <span class="wb-state" id="wbState"><i></i><span id="wbStateText">未开始</span></span>
      <button class="wb-btn" id="fsBtn" type="button">全屏</button>
    </div>
  </header>

  <main class="wb-body">
    <section class="wb-left">
      <div class="wb-video">
        <video id="v" controls playsinline preload="metadata" poster="render/poster.jpg">
          <source src="render/course.mp4" type="video/mp4">
          当前浏览器无法播放该视频。
        </video>
      </div>

      <section class="wb-arch">
        <div class="wb-arch-head">
          <span class="wb-arch-title">课程归档 · 卡片轨</span>
          <span class="wb-arch-time"><b id="tNow">00:00</b> / ${formatSeconds(duration)}</span>
        </div>
        <div class="wb-rail" id="rail">
          <div class="wb-rail-base"></div>
          <div class="wb-rail-fill" id="railFill"></div>
          <div class="wb-rail-head" id="railHead"><i></i></div>
          ${dots}
        </div>
        <div class="wb-arch-foot">
          <span><i class="wb-key is-hold"></i>停一下看</span>
          <span><i class="wb-key is-flow"></i>边看边讲</span>
          <span class="wb-arch-hint">点任意一点，跳到那张卡</span>
        </div>
      </section>
    </section>

    <aside class="wb-panel">
      <article class="wb-card" id="card">
        <div class="wb-hold">已暂停 · 这一页要停下来看，看完点右上角继续</div>
        <header class="wb-card-top">
          <span class="wb-card-kind" id="cKind">卡片</span>
          <span class="wb-mode" id="cMode">边看边讲</span>
          <button class="wb-resume" id="resumeBtn" type="button" hidden>继续播放</button>
        </header>
        <h2 id="cTitle">还没有卡片出现</h2>
        <p class="wb-card-meta" id="cMeta">播放视频，讲到知识点时卡片会出现在这里。</p>
        <div class="wb-card-body" id="cBody">
          ${frames}
          <div class="wb-blank" id="cBlank">
            <span class="wb-blank-kicker">课前说明</span>
            <strong>${escapeHtml(project.title)}</strong>
            <p>${escapeHtml(project.script?.thesis ?? project.topic ?? '')}</p>
            ${
              cues.length
                ? `<ul class="wb-blank-list">
              <li><i></i>方形点是「停一下看」，讲到这一页视频会暂停；圆形点是「边看边讲」，视频照走</li>
              <li><i class="is-dot"></i>点下方归档轨上任意一点，直接跳到那张卡片</li>
              <li><i class="is-key"></i>空格播放/暂停，← → 前后 5 秒，右上角可全屏</li>
            </ul>`
                : `<ul class="wb-blank-list"><li><i></i>这门课还没有挂卡片：回到成片编辑台，把介质卡挂到时间点上，再导出一次。</li></ul>`
            }
          </div>
        </div>
      </article>
    </aside>
  </main>
</div>
<script>
(() => {
  const CUES = ${JSON.stringify(payload).replace(/</g, '\\u003c')};
  const video = document.getElementById('v');
  const rail = document.getElementById('rail');
  const fill = document.getElementById('railFill');
  const head = document.getElementById('railHead');
  const dots = [...document.querySelectorAll('.wb-dot')];
  const frames = [...document.querySelectorAll('.wb-frame')];
  const card = document.getElementById('card');
  const cKind = document.getElementById('cKind');
  const cMode = document.getElementById('cMode');
  const cTitle = document.getElementById('cTitle');
  const cMeta = document.getElementById('cMeta');
  const cBlank = document.getElementById('cBlank');
  const resumeBtn = document.getElementById('resumeBtn');
  const state = document.getElementById('wbState');
  const stateText = document.getElementById('wbStateText');
  const fsBtn = document.getElementById('fsBtn');

  const duration = Number(video.duration) || ${Number(duration.toFixed(2))} || 1;
  let active = -1;
  const consumed = new Set();

  const pad = (n) => String(n).padStart(2, '0');
  const clock = (s) => {
    const t = Math.max(0, Math.floor(s || 0));
    return pad(Math.floor(t / 60)) + ':' + pad(t % 60);
  };

  function setState(kind) {
    state.classList.toggle('is-live', kind === 'live');
    state.classList.toggle('is-hold', kind === 'hold');
    stateText.textContent = kind === 'hold' ? '暂停中' : kind === 'live' ? '播放中' : '已暂停';
  }

  function activate(index) {
    if (index < 0 || index >= CUES.length || index === active) return;
    active = index;
    const cue = CUES[index];
    frames.forEach((frame, i) => frame.classList.toggle('is-active', i === index));
    dots.forEach((dot, i) => dot.classList.toggle('is-active', i === index));
    cBlank.classList.add('is-hidden');
    card.classList.add('is-live');
    cKind.textContent = cue.kindLabel;
    cKind.style.setProperty('--c', cue.color);
    cMode.textContent = cue.hold ? '停一下看' : '边看边讲';
    card.classList.toggle('is-hold', Boolean(cue.hold) && video.paused);
    cTitle.textContent = cue.title;
    cMeta.textContent =
      cue.timeLabel + ' 出现 · 第 ' + (index + 1) + ' 张，共 ' + CUES.length + ' 张';
  }

  function markPast(current) {
    dots.forEach((dot, i) => dot.classList.toggle('is-past', CUES[i].at <= current + 0.05));
  }

  function paint() {
    const current = Number(video.currentTime) || 0;
    const ratio = Math.min(1, Math.max(0, current / duration));
    fill.style.width = (ratio * 100).toFixed(3) + '%';
    head.style.left = (ratio * 100).toFixed(3) + '%';
    document.getElementById('tNow').textContent = clock(current);
    markPast(current);
  }

  function pickAt(current) {
    let found = -1;
    CUES.forEach((cue, i) => {
      if (cue.at <= current + 0.25) found = i;
    });
    return found;
  }

  function enter(index) {
    if (index < 0) return;
    if (index === active) return;
    const cue = CUES[index];
    activate(index);
    if (cue.hold && !consumed.has(index) && !video.paused) {
      video.pause();
      card.classList.add('is-hold');
      setState('hold');
    }
  }

  function onTick() {
    paint();
    const current = Number(video.currentTime) || 0;
    enter(pickAt(current));
    if (active >= 0) {
      const cue = CUES[active];
      const stillHold = Boolean(cue.hold) && video.paused && !consumed.has(active);
      card.classList.toggle('is-hold', stillHold);
      resumeBtn.hidden = !stillHold;
      if (stillHold) {
        setState('hold');
      } else {
        setState(video.paused ? 'idle' : 'live');
      }
    }
  }

  video.addEventListener('timeupdate', onTick);
  video.addEventListener('seeked', onTick);
  video.addEventListener('loadedmetadata', () => { paint(); onTick(); });
  video.addEventListener('play', onTick);
  video.addEventListener('pause', onTick);
  video.addEventListener('ended', () => setState('idle'));

  resumeBtn.addEventListener('click', () => {
    if (active >= 0) consumed.add(active);
    resumeBtn.hidden = true;
    card.classList.remove('is-hold');
    void video.play().catch(() => {});
  });

  dots.forEach((dot) => {
    dot.addEventListener('click', (event) => {
      event.stopPropagation();
      const cue = CUES[Number(dot.dataset.i)];
      if (!cue) return;
      consumed.delete(Number(dot.dataset.i));
      video.currentTime = Math.min(duration - 0.05, cue.at + 0.02);
      activate(Number(dot.dataset.i));
      if (cue.hold) {
        video.pause();
        card.classList.add('is-hold');
        resumeBtn.hidden = false;
        setState('hold');
      } else if (video.paused) {
        void video.play().catch(() => {});
      }
      paint();
    });
  });

  rail.addEventListener('click', (event) => {
    const rect = rail.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    video.currentTime = ratio * duration;
    paint();
  });

  document.addEventListener('keydown', (event) => {
    if (event.target && /INPUT|TEXTAREA/.test(event.target.tagName)) return;
    if (event.code === 'Space') {
      event.preventDefault();
      if (video.paused) void video.play().catch(() => {});
      else video.pause();
    }
    if (event.code === 'ArrowRight') video.currentTime = Math.min(duration, video.currentTime + 5);
    if (event.code === 'ArrowLeft') video.currentTime = Math.max(0, video.currentTime - 5);
  });

  fsBtn.addEventListener('click', () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  });
  document.addEventListener('fullscreenchange', () => {
    fsBtn.textContent = document.fullscreenElement ? '退出全屏' : '全屏';
  });

  paint();
  onTick();
})();
</script>
</body>
</html>`;
}

export async function buildDeliveryBundle(project: CourseProject): Promise<DeliveryBundle> {
  const projectDir = projectMediaDir(project.id);
  const deliveryDir = path.join(projectDir, 'delivery');
  const cardDir = path.join(deliveryDir, 'cards');
  const renderDir = path.join(deliveryDir, 'render');
  const sourceVideo = path.join(projectDir, 'render', 'course.mp4');
  if (!fs.existsSync(sourceVideo)) {
    throw new Error('尚未生成可播放的 MP4 成片，请先完成成片渲染');
  }
  fs.mkdirSync(cardDir, { recursive: true });
  fs.mkdirSync(renderDir, { recursive: true });
  fs.copyFileSync(sourceVideo, path.join(renderDir, 'course.mp4'));
  const sourcePoster = path.join(projectDir, 'render', 'poster.jpg');
  if (fs.existsSync(sourcePoster)) {
    fs.copyFileSync(sourcePoster, path.join(renderDir, 'poster.jpg'));
  }

  const mounts = [...(project.mounts ?? [])].sort((a, b) => a.atSeconds - b.atSeconds);
  const artifacts = (project.artifacts ?? [])
    .filter((artifact) => artifact.status === 'ready')
    .sort((a, b) => a.triggerSeconds - b.triggerSeconds);

  let cues: DeliveryCue[] = [];

  if (mounts.length) {
    // 编辑台里挂的卡才是课程真正的结构，优先导它。介质库里的草稿不上桌。
    cues = mounts.map((mount: CourseMount, index) => {
      const file = `card-${String(index + 1).padStart(2, '0')}-${safeFilePart(mount.id)}.html`;
      fs.writeFileSync(path.join(cardDir, file), withCardFit(mount.html), 'utf8');
      const start = Math.max(0, mount.atSeconds);
      const rawEnd = Number(mount.endSeconds);
      return {
        artifactId: mount.artifactId ?? mount.id,
        kind: mount.mediaKind,
        title: mount.title,
        description: mount.description,
        concept: mount.concept,
        atSeconds: Number(start.toFixed(2)),
        endSeconds: Number((Number.isFinite(rawEnd) && rawEnd > start ? rawEnd : start + 8).toFixed(2)),
        placement: mount.placement,
        hold: typeof mount.hold === 'boolean' ? mount.hold : defaultHold(mount.mediaKind),
        file
      };
    });
  } else {
    cues = artifacts.map((artifact: MediaArtifact) => {
      const file = `${safeFilePart(artifact.kind)}-${safeFilePart(artifact.id)}.html`;
      fs.writeFileSync(path.join(cardDir, file), withCardFit(artifact.html), 'utf8');
      const start = Math.max(0, artifact.triggerSeconds);
      return {
        artifactId: artifact.id,
        kind: artifact.kind,
        title: artifact.title,
        description: artifact.description,
        atSeconds: Number(start.toFixed(2)),
        endSeconds: Number((start + 8).toFixed(2)),
        placement: artifact.placement,
        hold: defaultHold(artifact.kind),
        file
      };
    });
  }

  const indexPath = path.join(deliveryDir, 'index.html');
  fs.writeFileSync(indexPath, deliveryHtml(project, cues), 'utf8');
  const zipPath = path.join(mediaRoot, project.id, 'delivery.zip');
  await runCompressArchive(deliveryDir, zipPath);
  const builtAt = new Date().toISOString();
  return {
    status: 'ready',
    builtAt,
    indexPath,
    indexUrl: `/media/${encodeURIComponent(project.id)}/delivery/index.html`,
    zipUrl: `/media/${encodeURIComponent(project.id)}/delivery.zip`,
    artifactCount: cues.length,
    sizeBytes: sizeOf(deliveryDir)
  };
}
