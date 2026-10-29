import fs from 'node:fs';
import path from 'node:path';
import type {
  ConceptAnchor,
  CourseMount,
  CourseProject,
  MediaKind,
  MediaTriggerPlacement,
  RecordingAsset,
  RuntimeSettings
} from '../src/types';
import { callModel, parseJsonLoose } from './llm';
import { localCardContent, type CardContent } from './interactive-cards';
import { projectMediaDir } from './media';

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const jsonForHtml = (value: unknown) =>
  JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

export const MOUNT_KIND_LABEL: Record<MediaKind, string> = {
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

const kindAccent: Record<MediaKind, { accent: string; soft: string; tag: string }> = {
  'knowledge-graph': { accent: '#0e6f63', soft: '#e5f4f0', tag: 'RELATION MAP' },
  'cognitive-map': { accent: '#9f3d2f', soft: '#f8e9e5', tag: 'LEARNING PATH' },
  'concept-card': { accent: '#9b6a18', soft: '#f8efd9', tag: 'CONCEPT CARD' },
  infographic: { accent: '#23588a', soft: '#e8f0f7', tag: 'VISUAL BRIEF' },
  timeline: { accent: '#6c4b3b', soft: '#f3ece8', tag: 'COURSE TIMELINE' },
  quiz: { accent: '#3d5c4d', soft: '#e9f0eb', tag: 'KNOWLEDGE CHECK' },
  flashcard: { accent: '#2f5d8c', soft: '#e8eff7', tag: 'TERM CARD' },
  checklist: { accent: '#1f7a6d', soft: '#e6f2f0', tag: 'SELF CHECK' },
  counterexample: { accent: '#a2452f', soft: '#f9ebe5', tag: 'MISCONCEPTION' },
  challenge: { accent: '#8a5a12', soft: '#f8efdd', tag: 'TRANSFER TASK' }
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Pull the body content out of a standalone artifact page so it can be inlined. */
export function inlineArtifactHtml(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const inner = bodyMatch ? bodyMatch[1] : html;
  return inner
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .trim();
}

export const activeRecording = (project: CourseProject): RecordingAsset | undefined => {
  const withAudio = project.recordings.filter((asset) => asset.audioUrl || asset.fileName);
  if (!withAudio.length) return undefined;
  return (
    withAudio.find((asset) => asset.id === project.timeline?.shots[0]?.slideId) ??
    withAudio.find((asset) => asset.kind === 'tts') ??
    withAudio[withAudio.length - 1]
  );
};

const transcriptSegments = (project: CourseProject, recording?: RecordingAsset) => {
  const segments = recording?.transcriptSegments ?? [];
  if (segments.length) return segments;
  const shots = project.timeline?.shots ?? [];
  const sections = project.script?.sections ?? [];
  return shots.map((shot, index) => ({
    text:
      sections.find((section) => section.id === shot.sectionId)?.narration ??
      sections[index]?.narration ??
      shot.slideTitle,
    startSeconds: shot.startSeconds,
    endSeconds: shot.endSeconds
  }));
};

const conceptCandidates = (project: CourseProject) => {
  const script = project.script;
  const list: string[] = [];
  for (const keyword of script?.keywords ?? []) {
    const term = keyword.trim();
    if (term.length >= 2 && term.length <= 14) list.push(term);
  }
  for (const section of script?.sections ?? []) {
    const title = section.title.trim();
    // Long sentence titles are not concepts; keywords are the reliable anchors.
    if (title.length >= 2 && title.length <= 12) list.push(title);
  }
  return Array.from(new Set(list.map((item) => item.trim()).filter((item) => item.length >= 2)));
};

/** Local concept alignment: match the transcript segments with course concepts. */
export function localConceptAnchors(project: CourseProject): ConceptAnchor[] {
  const recording = activeRecording(project);
  const segments = transcriptSegments(project, recording);
  const concepts = conceptCandidates(project);
  const anchors: ConceptAnchor[] = [];
  for (const concept of concepts) {
    const hit = segments.find((segment) => segment.text.includes(concept));
    if (!hit) continue;
    anchors.push({
      concept,
      atSeconds: Number(hit.startSeconds.toFixed(2)),
      endSeconds: Number(hit.endSeconds.toFixed(2)),
      segmentIndex: segments.indexOf(hit),
      note: hit.text.slice(0, 60),
      kind: 'concept-card'
    });
  }
  return anchors.sort((a, b) => a.atSeconds - b.atSeconds);
}

const buildAnchorMessages = (project: CourseProject, segments: ReturnType<typeof transcriptSegments>) => {
  const list = segments
    .map(
      (segment, index) =>
        `#${index} [${segment.startSeconds.toFixed(1)}s-${segment.endSeconds.toFixed(1)}s] ${segment.text}`
    )
    .join('\n');
  const concepts = conceptCandidates(project).join('、');
  return [
    {
      role: 'system' as const,
      content:
        '你是微课概念定位助手。请在逐字稿中找出值得挂载介质的教学概念，并给出精确时间点。' +
        '只输出 JSON，不要解释，不要编造逐字稿里没有的内容。'
    },
    {
      role: 'user' as const,
      content: `课程：${project.title}
主题：${project.topic}
候选概念：${concepts}

逐字稿：
${list}

请输出 4-8 个最值得挂载的概念：
{"anchors":[{"concept":"概念名","atSeconds":12.5,"endSeconds":24,"segmentIndex":3,"note":"这里讲到的关键含义","kind":"concept-card|knowledge-graph|cognitive-map|infographic|timeline|quiz"}]}

要求：atSeconds 与 endSeconds 必须落在逐字稿对应片段的时间范围内，kind 表示该概念最适合的介质形式。`
    }
  ];
};

/**
 * Locate the concepts in the transcript. Uses the model when it is reachable and
 * falls back to local keyword alignment so the composer always has anchors.
 */
export async function locateConceptAnchors(
  project: CourseProject,
  settings: RuntimeSettings
): Promise<{ anchors: ConceptAnchor[]; source: 'model' | 'local-fallback'; warning?: string }> {
  const segments = transcriptSegments(project, activeRecording(project));
  if (!segments.length) {
    return { anchors: [], source: 'local-fallback', warning: '还没有可对齐的逐字稿' };
  }
  try {
    const response = await callModel(settings, {
      messages: buildAnchorMessages(project, segments),
      json: true,
      temperature: 0.3,
      maxTokens: 1600
    });
    const parsed = parseJsonLoose<{ anchors?: unknown }>(response.text);
    const raw = Array.isArray(parsed.anchors) ? parsed.anchors : [];
    const anchors: ConceptAnchor[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const entry = item as Record<string, unknown>;
      const concept = String(entry.concept || '').trim();
      if (!concept) continue;
      const at = Number(entry.atSeconds);
      const end = Number(entry.endSeconds);
      const index = Number.isFinite(Number(entry.segmentIndex))
        ? Math.max(0, Math.min(segments.length - 1, Math.round(Number(entry.segmentIndex))))
        : 0;
      const segment = segments[index];
      const kind = String(entry.kind || 'concept-card') as MediaKind;
      anchors.push({
        concept: concept.slice(0, 24),
        atSeconds: Number.isFinite(at) ? Math.max(0, at) : segment.startSeconds,
        endSeconds: Number.isFinite(end) ? Math.max(at, end) : segment.endSeconds,
        segmentIndex: index,
        note: String(entry.note || '').slice(0, 120),
        kind: kindAccent[kind] ? kind : 'concept-card'
      });
    }
    if (anchors.length) {
      return {
        anchors: anchors.sort((a, b) => a.atSeconds - b.atSeconds),
        source: 'model'
      };
    }
    throw new Error('模型没有返回概念定位');
  } catch (error) {
    return {
      anchors: localConceptAnchors(project),
      source: 'local-fallback',
      warning:
        error instanceof Error
          ? `概念定位模型不可用，已用本地关键词对齐：${error.message}`
          : '概念定位模型不可用，已用本地关键词对齐'
    };
  }
}

const railCardHtml = (mount: CourseMount) => {
  const tone = kindAccent[mount.mediaKind] ?? kindAccent['concept-card'];
  return `<button class="rail-card" data-mount="${escapeHtml(mount.id)}" style="--accent:${tone.accent};--soft:${tone.soft}">
    <span class="rail-card-tag">${escapeHtml(tone.tag)}</span>
    <strong>${escapeHtml(mount.title)}</strong>
    <small>${escapeHtml(mount.description || mount.concept || '')}</small>
    <em>${mount.atSeconds.toFixed(1)}s</em>
  </button>`;
};

export interface CourseHtmlResult {
  indexPath: string;
  indexUrl: string;
  fileCount: number;
  sizeBytes: number;
  durationSeconds: number;
}

/**
 * Builds the interactive HTML course: the video or slide deck on top, the
 * audio-driven transcript below, and every mounted card pinned to its moment.
 */
export function buildCourseHtml(project: CourseProject, mounts: CourseMount[]): CourseHtmlResult {
  const projectDir = projectMediaDir(project.id);
  const courseDir = path.join(projectDir, 'course');
  fs.mkdirSync(courseDir, { recursive: true });

  const recording = activeRecording(project);
  const renderFile = path.join(projectDir, 'render', 'course.mp4');
  const hasVideo = fs.existsSync(renderFile);
  const posterFile = path.join(projectDir, 'render', 'poster.png');
  const hasPoster = fs.existsSync(posterFile);

  const slides = (project.slides ?? []).map((slide, index) => {
    const file = `slide-${String(index + 1).padStart(2, '0')}.png`;
    const exists = fs.existsSync(path.join(projectDir, 'slides', file));
    const shot = project.timeline?.shots?.find((item) => item.slideId === slide.id);
    return {
      id: slide.id,
      title: slide.title,
      file: exists ? `../slides/${file}` : '',
      start: shot?.startSeconds ?? 0,
      end: shot?.endSeconds ?? 0
    };
  });

  const audioFile = recording?.fileName
    ? `../${recording.fileName}`
    : project.timeline?.audioDuration
      ? ''
      : '';
  const audioExists = Boolean(audioFile) && fs.existsSync(path.join(projectDir, recording?.fileName ?? ''));
  const durationSeconds = Number(
    (recording?.durationSeconds ?? project.timeline?.totalSeconds ?? 0).toFixed(2)
  );

  const mountsPayload = mounts.map((mount) => ({
    id: mount.id,
    title: mount.title,
    description: mount.description,
    concept: mount.concept ?? '',
    kind: mount.mediaKind,
    at: Number(mount.atSeconds.toFixed(2)),
    end: Number((mount.endSeconds ?? mount.atSeconds + 8).toFixed(2)),
    placement: mount.placement,
    accent: (kindAccent[mount.mediaKind] ?? kindAccent['concept-card']).accent,
    soft: (kindAccent[mount.mediaKind] ?? kindAccent['concept-card']).soft,
    tag: (kindAccent[mount.mediaKind] ?? kindAccent['concept-card']).tag,
    html: inlineArtifactHtml(mount.html)
  }));

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(project.title)} · HTML 课程</title>
<style>
:root{--ink:#16202b;--ink2:#2b3641;--muted:#64707c;--line:#e3e7eb;--paper:#f6f7f9;--accent:#c0512f}
*{box-sizing:border-box}
html,body{margin:0;background:var(--paper);color:var(--ink);font-family:"Microsoft YaHei UI","PingFang SC","Noto Sans SC",sans-serif}
button{font:inherit;color:inherit}
.course{max-width:1240px;margin:0 auto;padding:22px clamp(14px,3vw,32px) 46px}
.head{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;padding-bottom:16px;border-bottom:1px solid var(--line)}
.brand{color:var(--accent);font-size:11px;font-weight:800;letter-spacing:.16em}
.head h1{margin:6px 0 4px;font-size:24px}
.head p{margin:0;color:var(--muted);font-size:12px}
.screen{position:relative;margin-top:20px;background:#0f1418;border-radius:8px;overflow:hidden;aspect-ratio:16/9;box-shadow:0 18px 44px rgba(16,24,32,.16)}
.screen video,.screen img{width:100%;height:100%;object-fit:contain;display:block}
.screen img{display:none}
.screen-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#cbd5df;text-align:center;padding:24px}
.screen-empty strong{font-size:16px;color:#e6edf3}
.screen-empty span{font-size:12px;max-width:420px;line-height:1.7}
.transport{display:flex;align-items:center;gap:12px;margin-top:12px;padding:10px 14px;background:#fff;border:1px solid var(--line);border-radius:6px}
.transport button{width:40px;height:40px;border-radius:50%;border:none;background:var(--accent);color:#fff;font-size:15px;cursor:pointer}
.transport .time{font:600 12px/1 ui-monospace,Consolas,monospace;color:var(--muted);min-width:104px}
.transport input[type=range]{flex:1;accent-color:var(--accent)}
.now{margin-top:16px;padding:14px 16px;display:flex;align-items:center;gap:14px;background:#fff;border:1px solid var(--line);border-radius:6px;min-height:76px}
.now.is-empty{color:var(--muted);font-size:12px}
.now .now-tag{flex:none;padding:3px 9px;border-radius:3px;background:var(--soft,#f2f5f8);color:var(--accent);font-size:10px;font-weight:700;letter-spacing:.08em}
.now .now-body{min-width:0}
.now strong{display:block;font-size:15px}
.now small{display:block;margin-top:3px;color:var(--muted);font-size:12px}
.now button{margin-left:auto;flex:none;padding:7px 14px;border:1px solid var(--accent);background:#fff;border-radius:4px;color:var(--accent);font-size:12px;font-weight:600;cursor:pointer}
.rail{margin-top:16px;padding:14px;background:#fff;border:1px solid var(--line);border-radius:6px}
.rail-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:11px}
.rail-head strong{font-size:13px}
.rail-head span{color:var(--muted);font-size:11px}
.rail-track{display:flex;gap:12px;overflow-x:auto;padding-bottom:6px}
.rail-card{flex:none;width:206px;padding:12px 13px;text-align:left;background:var(--soft);border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:5px;cursor:pointer;transition:transform .16s ease,box-shadow .16s ease}
.rail-card:hover{transform:translateY(-2px);box-shadow:0 8px 18px rgba(16,24,32,.1)}
.rail-card.is-active{outline:2px solid var(--accent);outline-offset:1px}
.rail-card-tag{display:block;color:var(--accent);font-size:9px;font-weight:700;letter-spacing:.12em}
.rail-card strong{display:block;margin-top:5px;font-size:13px;line-height:1.4}
.rail-card small{display:block;margin-top:5px;color:var(--muted);font-size:11px;line-height:1.5}
.rail-card em{display:block;margin-top:7px;color:var(--muted);font-style:normal;font:600 10px/1 ui-monospace,Consolas,monospace}
.overlay{position:fixed;inset:0;background:rgba(16,24,32,.42);display:none;align-items:center;justify-content:center;padding:24px;z-index:50}
.overlay.is-open{display:flex}
.overlay-card{position:relative;width:min(720px,100%);max-height:82vh;overflow:auto;background:#fff;border-radius:8px;padding:22px 24px;box-shadow:0 24px 60px rgba(16,24,32,.3)}
.overlay-card h3{margin:0 0 4px;font-size:18px}
.overlay-card .sub{margin:0 0 14px;color:var(--muted);font-size:12px}
.overlay-close{position:absolute;top:14px;right:14px;width:30px;height:30px;border:1px solid var(--line);background:#fff;border-radius:50%;cursor:pointer}
.overlay-body{font-size:14px;line-height:1.7;color:var(--ink2)}
.overlay-body table{border-collapse:collapse;width:100%;font-size:13px}
.overlay-body th,.overlay-body td{border:1px solid var(--line);padding:7px 9px;text-align:left}
.overlay-body h1,.overlay-body h2,.overlay-body h3{color:var(--ink)}
@media (max-width:720px){.now{flex-wrap:wrap}.now button{margin-left:0}}
</style>
</head>
<body>
<div class="course">
  <header class="head">
    <div>
      <span class="brand">课序 · HTML COURSE</span>
      <h1>${escapeHtml(project.title)}</h1>
      <p>${escapeHtml([project.subject, project.grade, project.topic].filter(Boolean).join(' · '))}</p>
    </div>
    <p>${mounts.length} 张挂载卡片 · ${durationSeconds.toFixed(0)} 秒</p>
  </header>

  <section class="screen">
    ${
      hasVideo
        ? `<video id="player" src="../render/course.mp4"${hasPoster ? ' poster="../render/poster.png"' : ''} preload="metadata"></video>`
        : `<video id="player" src="../render/course.mp4" preload="metadata" style="display:none"></video><img id="slideImage" alt="课件画面"><div class="screen-empty" id="screenEmpty"><strong>还没有渲染成片</strong><span>在成片交付环节渲染 1080p 视频后，这里会播放课程画面；现在先用音频与卡片体验课程结构。</span></div>`
    }
  </section>

  <div class="transport">
    <button id="play" aria-label="播放">▶</button>
    <span class="time" id="time">00:00 / 00:00</span>
    <input type="range" id="seek" min="0" max="100" value="0" step="0.05" aria-label="进度">
    ${
      audioExists
        ? `<audio id="audio" src="${escapeHtml(audioFile)}" preload="metadata"></audio>`
        : ''
    }
  </div>

  <section class="now is-empty" id="now">
    <span>提示</span>
    <div class="now-body"><strong>播放课程后，命中的概念卡片会在这里出现</strong><small>点击卡片可以展开查看完整内容</small></div>
  </section>

  <section class="rail">
    <div class="rail-head"><strong>介质轨道</strong><span>按时间顺序排列，点击展开</span></div>
    <div class="rail-track" id="rail">${mounts.map(railCardHtml).join('')}</div>
  </section>
</div>

<div class="overlay" id="overlay">
  <div class="overlay-card">
    <button class="overlay-close" id="overlayClose" aria-label="关闭">✕</button>
    <h3 id="overlayTitle">卡片</h3>
    <p class="sub" id="overlaySub"></p>
    <div class="overlay-body" id="overlayBody"></div>
  </div>
</div>

<script>
const MOUNTS = ${jsonForHtml(mountsPayload)};
const SLIDES = ${jsonForHtml(slides)};
const player = document.getElementById('player');
const audio = document.getElementById('audio');
const slideImage = document.getElementById('slideImage');
const playBtn = document.getElementById('play');
const seek = document.getElementById('seek');
const timeLabel = document.getElementById('time');
const rail = document.getElementById('rail');
const now = document.getElementById('now');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlaySub = document.getElementById('overlaySub');
const overlayBody = document.getElementById('overlayBody');
const hasVideo = ${hasVideo ? 'true' : 'false'};
const media = hasVideo ? player : audio;
let activeId = '';

const fmt = (value) => {
  const total = Math.max(0, Math.floor(value || 0));
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
};
const currentTime = () => (media ? media.currentTime || 0 : 0);
const currentDuration = () => (media && media.duration ? media.duration : ${durationSeconds});

const mountAt = (time) => {
  let found = null;
  for (const mount of MOUNTS) {
    if (mount.at <= time + 0.2) found = mount;
    else break;
  }
  return found;
};

const showSlide = (time) => {
  if (!slideImage) return;
  let current = null;
  for (const slide of SLIDES) {
    if (slide.file && time >= slide.start) current = slide;
  }
  if (current && slideImage.getAttribute('src') !== current.file) {
    slideImage.setAttribute('src', current.file);
  }
};

const paint = () => {
  const time = currentTime();
  const duration = currentDuration();
  timeLabel.textContent = fmt(time) + ' / ' + fmt(duration);
  if (!seek.max || Number(seek.max) !== duration) seek.max = duration;
  seek.value = String(time);
  showSlide(time);
  const mount = mountAt(time);
  const id = mount ? mount.id : '';
  if (id !== activeId) {
    activeId = id;
    rail.querySelectorAll('.rail-card').forEach((card) => {
      card.classList.toggle('is-active', card.dataset.mount === id);
    });
    const active = rail.querySelector('.rail-card.is-active');
    if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }
  if (!mount) {
    now.className = 'now is-empty';
    now.innerHTML = '<span>提示</span><div class="now-body"><strong>播放课程后，命中的概念卡片会在这里出现</strong><small>点击卡片可以展开查看完整内容</small></div>';
    return;
  }
  now.className = 'now';
  now.style.setProperty('--accent', mount.accent);
  now.style.setProperty('--soft', mount.soft);
  now.innerHTML =
    '<span class="now-tag">' + mount.tag + '</span>' +
    '<div class="now-body"><strong>' + mount.title + '</strong><small>' + (mount.description || '') + '</small></div>' +
    '<button type="button" id="openNow">展开卡片</button>';
  document.getElementById('openNow').addEventListener('click', () => openMount(mount));
};

const openMount = (mount) => {
  if (!mount) return;
  overlayTitle.textContent = mount.title;
  overlaySub.textContent = (mount.concept ? mount.concept + ' · ' : '') + fmt(mount.at) + ' 起出现';
  overlayBody.innerHTML = mount.html || '<p>这张卡片还没有内容。</p>';
  overlay.classList.add('is-open');
};

rail.addEventListener('click', (event) => {
  const card = event.target.closest('.rail-card');
  if (!card) return;
  const mount = MOUNTS.find((item) => item.id === card.dataset.mount);
  if (mount) {
    if (media && Number.isFinite(media.duration)) media.currentTime = mount.at;
    openMount(mount);
  }
});
document.getElementById('overlayClose').addEventListener('click', () => overlay.classList.remove('is-open'));
overlay.addEventListener('click', (event) => {
  if (event.target === overlay) overlay.classList.remove('is-open');
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') overlay.classList.remove('is-open');
});

playBtn.addEventListener('click', () => {
  if (!media) return;
  if (media.paused) {
    if (audio && !hasVideo) media.play();
    else if (player && hasVideo) player.play();
  } else {
    media.pause();
  }
});
if (media) media.addEventListener('timeupdate', paint);
if (player) player.addEventListener('ended', () => { playBtn.textContent = '▶'; });
if (media) media.addEventListener('play', () => { playBtn.textContent = '❚❚'; });
if (media) media.addEventListener('pause', () => { playBtn.textContent = '▶'; });
seek.addEventListener('input', () => {
  if (media) media.currentTime = Number(seek.value);
});
paint();
</script>
</body>
</html>`;

  const indexPath = path.join(courseDir, 'index.html');
  fs.writeFileSync(indexPath, html, 'utf8');
  return {
    indexPath,
    indexUrl: `/media/${project.id}/course/index.html`,
    fileCount: mounts.length,
    sizeBytes: fs.statSync(indexPath).size,
    durationSeconds
  };
}

const buildCardMessages = (
  project: CourseProject,
  kind: MediaKind,
  count: number,
  segments: ReturnType<typeof transcriptSegments>
) => {
  const list = segments
    .map(
      (segment, index) =>
        `#${index} [${segment.startSeconds.toFixed(1)}s-${segment.endSeconds.toFixed(1)}s] ${segment.text}`
    )
    .join('\n');
  const fieldHint: Record<string, string> = {
    flashcard:
      '用 title/definition/hook/points：title 是术语或概念名，definition 是一句话定义，hook 是记忆钩子，points 是 3-5 条要点。',
    checklist:
      '用 title/points/criteria：points 是 4-5 条可以打勾的自查项，criteria 是每条的达标标准。',
    counterexample:
      '用 title/myth/fact/question/answer：myth 是常见误区，fact 是事实，question 是判别问句，answer 是回答要点。',
    challenge:
      '用 title/question/hints/answer/criteria：question 是迁移任务，hints 是 2-3 级提示，answer 是参考答案，criteria 是自评标准。',
    quiz:
      '用 title/question/options/explain：options 给 4 个选项，其中恰好一个 correct 为 true，explain 是解析。'
  };
  return [
    {
      role: 'system' as const,
      content:
        '你是交互学习设计师，为微课生成可以放进课程时间轴的互动卡片。' +
        '只输出 JSON，不要 Markdown，不要解释。内容必须来自讲稿，不要编造事实。'
    },
    {
      role: 'user' as const,
      content: `课程：${project.title}
主题：${project.topic}
价值引领：${project.valueGuide}

逐字稿：
${list}

请生成 ${count} 张「${MOUNT_KIND_LABEL[kind] ?? kind}」。
${fieldHint[kind] ?? ''}

只输出 JSON：{"cards":[{"title":"...","subtitle":"...","definition":"...","hook":"...","points":["..."],"myth":"...","fact":"...","question":"...","hints":["..."],"answer":"...","criteria":["..."],"options":[{"label":"A","text":"...","correct":true}],"explain":"..."}]}
每张卡片都要给出 atSeconds（命中逐字稿的时刻，取对应片段的 startSeconds）。`
    }
  ];
};

/**
 * Ask the agent for interactive cards. Falls back to local templates so the
 * composer always has something to mount.
 */
export async function generateInteractiveCards(
  project: CourseProject,
  settings: RuntimeSettings,
  options: { kind: MediaKind; count?: number }
): Promise<{
  contents: Array<CardContent & { atSeconds: number }>;
  source: 'model' | 'local-fallback';
  warning?: string;
}> {
  const count = Math.min(Math.max(options.count ?? 3, 1), 6);
  const segments = transcriptSegments(project, activeRecording(project));
  const sections = project.script?.sections ?? [];
  try {
    const response = await callModel(settings, {
      messages: buildCardMessages(project, options.kind, count, segments),
      json: true,
      temperature: 0.4,
      maxTokens: 2200
    });
    const parsed = parseJsonLoose<{ cards?: unknown }>(response.text);
    const raw = Array.isArray(parsed.cards) ? parsed.cards : [];
    const contents: Array<CardContent & { atSeconds: number }> = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const entry = item as Record<string, unknown>;
      const title = String(entry.title || '').trim();
      if (!title) continue;
      const at = Number(entry.atSeconds);
      const fallbackSection = sections[contents.length % Math.max(1, sections.length)];
      contents.push({
        title: title.slice(0, 40),
        kicker: MOUNT_KIND_LABEL[options.kind],
        subtitle: String(entry.subtitle || '').slice(0, 80),
        definition: String(entry.definition || '').slice(0, 160),
        hook: String(entry.hook || '').slice(0, 120),
        points: Array.isArray(entry.points)
          ? entry.points.slice(0, 6).map((point) => String(point).slice(0, 90))
          : undefined,
        myth: String(entry.myth || '').slice(0, 160),
        fact: String(entry.fact || '').slice(0, 200),
        question: String(entry.question || '').slice(0, 160),
        hints: Array.isArray(entry.hints)
          ? entry.hints.slice(0, 3).map((hint) => String(hint).slice(0, 120))
          : undefined,
        answer: String(entry.answer || '').slice(0, 260),
        criteria: Array.isArray(entry.criteria)
          ? entry.criteria.slice(0, 4).map((item2) => String(item2).slice(0, 90))
          : undefined,
        options: Array.isArray(entry.options)
          ? entry.options.slice(0, 4).map((option, index) => {
              const data = (option && typeof option === 'object' ? option : {}) as Record<
                string,
                unknown
              >;
              return {
                label: String(data.label || String.fromCharCode(65 + index)).slice(0, 4),
                text: String(data.text || '').slice(0, 120),
                correct: data.correct === true
              };
            })
          : undefined,
        explain: String(entry.explain || '').slice(0, 260),
        atSeconds: Number.isFinite(at)
          ? Math.max(0, at)
          : Number((fallbackSection?.durationSeconds ?? 30) * contents.length)
      });
    }
    if (contents.length) return { contents, source: 'model' };
    throw new Error('模型没有返回卡片内容');
  } catch (error) {
    const contents = Array.from({ length: count }, (_, index) => {
      const section = sections[index % Math.max(1, sections.length)];
      const local = localCardContent(project, options.kind, section?.id);
      return {
        ...local,
        title: local.title,
        atSeconds: Number(
          (sections
            .slice(0, index)
            .reduce((sum, item) => sum + (item.durationSeconds ?? 0), 0) + 2).toFixed(2)
        )
      };
    });
    return {
      contents,
      source: 'local-fallback',
      warning:
        error instanceof Error
          ? `卡片智能体暂时不可用，已用本地模板生成：${error.message}`
          : '卡片智能体暂时不可用，已用本地模板生成'
    };
  }
}
