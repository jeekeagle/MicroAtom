import type { CourseProject, CourseSlide } from '../src/types';
import { renderVisualSvg, type VisualTheme } from '../src/lib/slideVisuals';

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const ACCENTS: Record<CourseSlide['accent'], { accent: string; soft: string }> = {
  brick: { accent: '#c0512f', soft: '#fbeee9' },
  teal: { accent: '#1f7a6d', soft: '#e8f3f1' },
  gold: { accent: '#a97721', soft: '#f8f1e2' },
  ink: { accent: '#3f5147', soft: '#e9edf1' }
};

const themeFor = (accent: CourseSlide['accent']): VisualTheme => ({
  accent: ACCENTS[accent].accent,
  accentSoft: ACCENTS[accent].soft,
  ink: '#16202b',
  muted: '#64707c',
  line: '#e3e7eb',
  panel: '#ffffff'
});

/**
 * White-background classroom slide. This is the local twin of the white
 * courseware spec: 1920x1080, course name on top, conclusion-style headline
 * at the upper left, generous whitespace, body text never below 28px.
 */
export function buildWhiteSlideHtml(
  slide: CourseSlide,
  project: CourseProject
): string {
  const accent = ACCENTS[slide.accent];
  const svg = renderVisualSvg(slide.visual, themeFor(slide.accent));
  const bullets = (slide.bullets ?? []).filter(Boolean);
  const points = bullets.length
    ? bullets
        .map(
          (bullet) =>
            `<li><i></i><span>${escapeHtml(bullet)}</span></li>`
        )
        .join('')
    : '';
  const supporting = (slide.supporting ?? []).filter(Boolean);
  const course = [project.subject, project.grade].filter(Boolean).join(' · ');

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%;overflow:hidden}
body{font-family:"Microsoft YaHei UI","PingFang SC","Noto Sans SC",sans-serif;background:#ffffff;color:#16202b}
.slide{position:relative;width:100%;height:100%;padding:4.79vw 6.77vw 5vw;background:#fff}
.slide:before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(22,32,43,.028) 1px,transparent 1px),linear-gradient(90deg,rgba(22,32,43,.028) 1px,transparent 1px);background-size:3.33vw 3.33vw;pointer-events:none}
.top{position:relative;display:flex;justify-content:space-between;align-items:center;font-size:1.2vw;color:#939ea8}
.top b{color:#16202b;font-weight:600}
.rule{position:relative;width:4.06vw;height:.26vw;background:${accent.accent};margin-top:1.25vw}
h1{position:relative;margin-top:1.67vw;font-size:3.33vw;line-height:1.22;font-weight:600;letter-spacing:0}
.sub{position:relative;margin-top:.94vw;max-width:1400px;font-size:1.67vw;line-height:1.55;color:#64707c}
.body{position:relative;margin-top:3.02vw;display:grid;grid-template-columns:${svg ? 'minmax(0,0.92fr) minmax(0,1.08fr)' : '1fr'};gap:3.96vw;align-items:start}
ul{list-style:none}
li{display:flex;gap:1.15vw;padding:1.25vw 0;border-top:1px solid #e3e7eb;font-size:1.77vw;line-height:1.5;color:#2b3641}
li i{width:1.46vw;height:.26vw;background:${accent.accent};margin-top:1.35vw;flex:none}
.support{margin-top:1.77vw;display:grid;gap:.73vw}
.support span{display:flex;gap:.73vw;font-size:1.35vw;line-height:1.6;color:#8a949e}
.support span:before{content:"";width:.47vw;height:.47vw;margin-top:.83vw;flex:none;border-radius:50%;background:${accent.accent}}
.ask{margin-top:2.08vw;padding:1.35vw 1.56vw;background:${accent.soft};border-radius:.52vw}
.ask b{display:block;color:${accent.accent};font-size:1.09vw;letter-spacing:.12em}
.ask p{margin-top:.52vw;font-size:1.56vw;line-height:1.55;color:#2b3641}
.take{margin-top:1.88vw;padding-top:1.25vw;border-top:1px solid #e3e7eb}
.take b{display:block;font-size:1.09vw;letter-spacing:.12em;color:#8a949e}
.take p{margin-top:.52vw;font-size:1.77vw;line-height:1.45;color:#16202b}
.visual{position:relative;padding:1.35vw 1.46vw;background:#fff;border:1px solid #e3e7eb;border-radius:.73vw}
.visual svg{display:block;width:100%;height:auto}
.foot{position:absolute;left:6.77vw;right:6.77vw;bottom:2.6vw;display:flex;align-items:center;gap:1.04vw;color:#939ea8;font-size:1.09vw}
.foot i{display:block;width:3.33vw;height:1px;background:#d7dde3}
</style>
</head>
<body>
<div class="slide">
  <div class="top"><b>${escapeHtml(project.title)}</b><span>${escapeHtml(course)}</span></div>
  <div class="rule"></div>
  <h1>${escapeHtml(slide.title)}</h1>
  ${slide.keyPoint ? `<p class="sub">${escapeHtml(slide.keyPoint)}</p>` : ''}
  <div class="body">
    <div>
      ${points ? `<ul>${points}</ul>` : ''}
      ${
        supporting.length
          ? `<div class="support">${supporting
              .map((item) => `<span>${escapeHtml(item)}</span>`)
              .join('')}</div>`
          : ''
      }
      ${slide.ask ? `<div class="ask"><b>课堂提问</b><p>${escapeHtml(slide.ask)}</p></div>` : ''}
      ${slide.takeaway ? `<div class="take"><b>一句话带走</b><p>${escapeHtml(slide.takeaway)}</p></div>` : ''}
    </div>
    ${svg ? `<div class="visual">${svg}</div>` : ''}
  </div>
  <div class="foot"><span>${String(slide.order).padStart(2, '0')}</span><i></i><span>${escapeHtml(
    slide.eyebrow.split('/')[0]
  )}</span></div>
</div>
</body>
</html>`;
}
