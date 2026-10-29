import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type {
  CourseProject,
  DeliveryBundle,
  DeliveryCue,
  MediaArtifact
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

const artifactFileName = (artifact: MediaArtifact) =>
  `${safeFilePart(artifact.kind)}-${safeFilePart(artifact.id)}.html`;

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

const deliveryHtml = (project: CourseProject, cues: DeliveryCue[]): string => {
  const cueData = cues.map((cue, index) => ({
    ...cue,
    index,
    timeLabel: formatSeconds(cue.atSeconds)
  }));
  const duration = project.render?.durationSeconds ?? project.timeline?.totalSeconds ?? 0;
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(project.title)} · 微课交付包</title>
<style>
:root{--ink:#202420;--soft:#657069;--paper:#f7f5ee;--white:#fff;--line:#dcd6c7;--brick:#a14232;--teal:#0e6f63;--gold:#a87922;--wash:#eee9dd}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--paper);color:var(--ink);font-family:"Noto Sans SC","Microsoft YaHei","PingFang SC",Arial,sans-serif}
button{font:inherit}
.delivery{max-width:1360px;margin:0 auto;padding:22px clamp(14px,3vw,36px) 40px}
.delivery-layout{display:grid;gap:20px;margin-top:20px}
.delivery-layout.layout-below{grid-template-columns:1fr}
.delivery-layout.layout-side{grid-template-columns:minmax(0,1.3fr) minmax(360px,.7fr);align-items:start}
.delivery-layout.layout-focus{grid-template-columns:minmax(280px,.55fr) minmax(0,1.45fr);align-items:start}
.delivery-layout.layout-side .hero,.delivery-layout.layout-focus .hero{grid-template-columns:1fr;margin:0}
.topline{display:flex;justify-content:space-between;gap:20px;align-items:flex-end;padding-bottom:18px;border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:11px;font-size:11px;font-weight:800;letter-spacing:.14em;color:var(--brick)}
.brand-mark{width:24px;height:24px;border:1px solid var(--ink);position:relative}
.brand-mark:before,.brand-mark:after{content:"";position:absolute;width:6px;height:6px;background:var(--brick)}
.brand-mark:before{left:4px;top:4px}.brand-mark:after{right:4px;bottom:4px}
.course-meta{text-align:right;color:var(--soft);font-size:11px;line-height:1.6}
.course-meta strong{display:block;color:var(--ink);font-size:14px}
.hero{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(280px,.68fr);gap:16px;margin:20px 0 18px;align-items:start}
.video-shell{background:#151816;border-radius:8px;overflow:hidden;box-shadow:0 14px 34px #2024201c}
.video-shell video{display:block;width:100%;aspect-ratio:16/9;background:#101210}
.course-panel{background:var(--white);border:1px solid var(--line);border-radius:8px;padding:22px}
.kicker{display:flex;align-items:center;gap:8px;color:var(--brick);font-size:10px;font-weight:800;letter-spacing:.14em}
.kicker:before{content:"";width:20px;height:2px;background:var(--brick)}
.course-panel h1{font-size:clamp(22px,3vw,34px);line-height:1.2;letter-spacing:0;margin:11px 0 10px}
.course-panel>p{font-size:13px;line-height:1.8;color:var(--soft);margin:0 0 18px}
.facts{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--line);border-left:1px solid var(--line)}
.facts div{padding:11px;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}
.facts span{display:block;color:var(--soft);font-size:9px;letter-spacing:.1em}
.facts strong{display:block;margin-top:4px;font-size:12px}
.media-head{display:flex;justify-content:space-between;align-items:flex-end;margin:24px 0 10px;gap:16px}
.media-head h2{margin:6px 0 0;font-size:22px}
.media-head p{margin:0;color:var(--soft);font-size:11px}
.media-stage{background:var(--white);border:1px solid var(--line);border-radius:8px;min-height:380px;overflow:hidden;position:relative}
.media-empty{display:grid;place-items:center;min-height:380px;text-align:center;padding:30px;color:var(--soft)}
.media-empty strong{display:block;color:var(--ink);font-size:16px;margin-bottom:6px}
.cue-frame{display:none;width:100%;height:min(68vh,720px);min-height:380px;border:0;background:var(--white)}
.cue-frame.is-active{display:block}
.cue-frame.is-focus{height:min(80vh,860px)}
.cue-frame.is-side{height:min(72vh,760px)}
.media-caption{display:none;justify-content:space-between;gap:16px;padding:11px 14px;background:#f1eee5;border-top:1px solid var(--line);font-size:11px;color:var(--soft)}
.media-caption.is-active{display:flex}
.media-caption strong{color:var(--ink)}
.cue-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin-top:10px}
.cue-button{display:grid;grid-template-columns:42px 1fr auto;gap:10px;align-items:center;background:var(--white);border:1px solid var(--line);border-radius:6px;padding:10px;text-align:left;cursor:pointer;min-height:62px}
.cue-button:hover,.cue-button.is-active{border-color:var(--brick);background:#fffdf8}
.cue-button.is-active{box-shadow:inset 3px 0 0 var(--brick)}
.cue-placement-tag{display:none}
.cue-time{font-size:10px;font-weight:800;color:var(--brick)}
.cue-copy strong{display:block;font-size:12px;line-height:1.35}
.cue-copy small{display:block;margin-top:3px;color:var(--soft);font-size:9px}
.cue-kind{font-size:9px;color:var(--soft);border:1px solid var(--line);border-radius:99px;padding:3px 7px}
.footer{display:flex;justify-content:space-between;gap:20px;margin-top:28px;padding-top:14px;border-top:1px solid var(--line);color:var(--soft);font-size:10px}
.footer strong{color:var(--ink)}
@media(max-width:900px){.hero{grid-template-columns:1fr}.course-meta{display:none}.topline{display:block}.media-stage{min-height:300px}.cue-frame{height:62vh;min-height:300px}}
@media(max-width:960px){.delivery-layout.layout-side,.delivery-layout.layout-focus{grid-template-columns:1fr}.delivery-layout.layout-side .media-stage,.delivery-layout.layout-focus .media-stage{min-height:420px}}
@media(max-width:560px){.delivery{padding:14px 12px 28px}.course-panel{padding:16px}.cue-grid{grid-template-columns:1fr}.footer{display:block}.footer span{display:block;margin-top:6px}.facts{grid-template-columns:1fr 1fr}}
</style>
</head>
<body>
<main class="delivery">
  <header class="topline">
    <div class="brand"><span class="brand-mark"></span>课序 / COURSE SEQUENCE · DELIVERY</div>
    <div class="course-meta"><strong>${escapeHtml(project.title)}</strong>${escapeHtml(project.subject)} · ${escapeHtml(project.grade)} · ${project.durationMinutes} 分钟</div>
  </header>

  <section class="hero">
    <div class="video-shell">
      <video id="courseVideo" controls playsinline preload="metadata" poster="render/poster.jpg">
        <source src="render/course.mp4" type="video/mp4">
        当前浏览器无法播放该视频。
      </video>
    </div>
    <aside class="course-panel">
      <span class="kicker">MICRO COURSE / 微课交付</span>
      <h1>${escapeHtml(project.title)}</h1>
      <p>${escapeHtml(project.script?.thesis ?? project.topic)}</p>
      <div class="facts">
        <div><span>SUBJECT</span><strong>${escapeHtml(project.subject)}</strong></div>
        <div><span>LEVEL</span><strong>${escapeHtml(project.grade)}</strong></div>
        <div><span>DURATION</span><strong>${duration ? formatSeconds(duration) : `${project.durationMinutes} 分钟`}</strong></div>
        <div><span>MEDIA</span><strong>${cues.length} 个课程介质</strong></div>
      </div>
    </aside>
  </section>

  <div class="media-head">
    <div><span class="kicker">SYNCED COURSE MEDIA</span><h2>随视频出现的课程介质</h2></div>
    <p>播放到触发时间会自动切换；点击下方条目可直接跳到对应位置。</p>
  </div>
  <section class="media-stage" id="mediaStage">
    <div class="media-empty" id="mediaEmpty"><div><strong>课程介质已就位</strong>播放视频后，会在对应知识点下方自动出现。</div></div>
    ${cueData
      .map(
        (cue) =>
          `<iframe class="cue-frame" data-cue="${cue.index}" title="${escapeHtml(cue.title)}" loading="lazy" src="artifacts/${escapeHtml(cue.file)}"></iframe>`
      )
      .join('')}
    <div class="media-caption" id="mediaCaption"><strong id="captionTitle"></strong><span id="captionDescription"></span></div>
  </section>
  <div class="cue-grid">
    ${cueData
      .map(
        (cue) =>
          `<button class="cue-button" data-seek="${cue.atSeconds}" data-index="${cue.index}">
            <span class="cue-time">${cue.timeLabel}</span>
            <span class="cue-copy"><strong>${escapeHtml(cue.title)}</strong><small>${escapeHtml(cue.description)}</small></span>
            <span class="cue-kind">${escapeHtml(cue.kind)}</span>
          </button>`
      )
      .join('')}
  </div>

  <footer class="footer">
    <span><strong>课序</strong> · 单文件课程介质 + MP4 微课</span>
    <span>${cues.length} 个时间点 · 本包可离线打开</span>
  </footer>
</main>
<script>
(() => {
  const cues = ${JSON.stringify(cueData).replace(/</g, '\\u003c')};
  const video = document.getElementById('courseVideo');
  const frames = [...document.querySelectorAll('[data-cue]')];
  const buttons = [...document.querySelectorAll('.cue-button')];
  const empty = document.getElementById('mediaEmpty');
  const caption = document.getElementById('mediaCaption');
  const captionTitle = document.getElementById('captionTitle');
  const captionDescription = document.getElementById('captionDescription');
  let active = -1;

  function activate(index, reveal = true) {
    if (index < 0 || index >= cues.length || index === active) return;
    active = index;
    frames.forEach((frame, frameIndex) => frame.classList.toggle('is-active', frameIndex === index));
    buttons.forEach((button, buttonIndex) => button.classList.toggle('is-active', buttonIndex === index));
    const cue = cues[index];
    captionTitle.textContent = cue.title;
    captionDescription.textContent = cue.description;
    caption.classList.add('is-active');
    empty.style.display = 'none';
    if (reveal) document.getElementById('mediaStage').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function updateForTime() {
    const current = Number(video.currentTime || 0);
    let next = -1;
    cues.forEach((cue, index) => {
      if (Number(cue.atSeconds) <= current + 0.25) next = index;
    });
    if (next >= 0) activate(next, false);
  }

  video.addEventListener('timeupdate', updateForTime);
  video.addEventListener('seeked', updateForTime);
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const seconds = Number(button.dataset.seek) || 0;
      video.currentTime = seconds;
      if (video.paused) void video.play().catch(() => {});
      activate(Number(button.dataset.index), true);
    });
  });
  if (cues.length) updateForTime();
})();
</script>
</body>
</html>`;
}

export async function buildDeliveryBundle(project: CourseProject): Promise<DeliveryBundle> {
  const projectDir = projectMediaDir(project.id);
  const deliveryDir = path.join(projectDir, 'delivery');
  const artifactDir = path.join(deliveryDir, 'artifacts');
  const renderDir = path.join(deliveryDir, 'render');
  const sourceVideo = path.join(projectDir, 'render', 'course.mp4');
  if (!fs.existsSync(sourceVideo)) {
    throw new Error('尚未生成可播放的 MP4 成片，请先完成成片渲染');
  }
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.mkdirSync(renderDir, { recursive: true });
  fs.copyFileSync(sourceVideo, path.join(renderDir, 'course.mp4'));
  const sourcePoster = path.join(projectDir, 'render', 'poster.jpg');
  if (fs.existsSync(sourcePoster)) {
    fs.copyFileSync(sourcePoster, path.join(renderDir, 'poster.jpg'));
  }

  const artifacts = (project.artifacts ?? [])
    .filter((artifact) => artifact.status === 'ready')
    .sort((a, b) => a.triggerSeconds - b.triggerSeconds);
  const cues: DeliveryCue[] = artifacts.map((artifact) => {
    const file = artifactFileName(artifact);
    fs.writeFileSync(path.join(artifactDir, file), artifact.html, 'utf8');
    return {
      artifactId: artifact.id,
      kind: artifact.kind,
      title: artifact.title,
      description: artifact.description,
      atSeconds: artifact.triggerSeconds,
      placement: artifact.placement,
      file
    };
  });

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
