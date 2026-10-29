import { useMemo } from 'react';
import type { CourseSlide, SlideVisual } from '../types';
import { renderVisualSvg, type VisualTheme } from '../lib/slideVisuals';

const accentLabel = {
  brick: '01',
  teal: '02',
  gold: '03',
  ink: '04'
};

const themes: Record<CourseSlide['accent'], VisualTheme> = {
  brick: {
    accent: '#c0512f',
    accentSoft: '#fbeee9',
    ink: '#16202b',
    muted: '#64707c',
    line: '#e3e7eb',
    panel: '#ffffff'
  },
  teal: {
    accent: '#1f7a6d',
    accentSoft: '#e8f3f1',
    ink: '#16202b',
    muted: '#64707c',
    line: '#e3e7eb',
    panel: '#ffffff'
  },
  gold: {
    accent: '#a97721',
    accentSoft: '#f8f1e2',
    ink: '#16202b',
    muted: '#64707c',
    line: '#e3e7eb',
    panel: '#ffffff'
  },
  ink: {
    accent: '#3f5147',
    accentSoft: '#e9edf1',
    ink: '#16202b',
    muted: '#64707c',
    line: '#e3e7eb',
    panel: '#ffffff'
  }
};

const visualKindLabel: Record<SlideVisual['kind'], string> = {
  none: '无视觉',
  diagram: '结构示意图',
  steps: '流程步骤',
  chart: '数据图表',
  cycle: '闭环循环',
  timeline: '时间线',
  matrix: '对比表格',
  image: '插图'
};

export function SlideCanvas({
  slide,
  compact = false,
  className = ''
}: {
  slide: CourseSlide;
  compact?: boolean;
  className?: string;
}) {
  const theme = themes[slide.accent] ?? themes.brick;
  const svg = useMemo(
    () =>
      renderVisualSvg(
        slide.visual,
        theme,
        slide.layout === 'compare'
          ? { width: 1000, height: 430 }
          : { width: 1000, height: 620 }
      ),
    [slide.visual, theme, slide.layout]
  );
  const hasVisual = Boolean(svg);
  const supporting = (slide.supporting ?? []).filter(Boolean);
  const modeClass = slide.layout === 'cover' ? 'slide-dark' : `slide-${slide.layout}`;

  const visualBlock = hasVisual ? (
    <div className="slide-visual" key="visual">
      <div className="slide-visual-inner" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  ) : null;

  const askBlock = slide.ask ? (
    <div className="slide-ask" key="ask">
      <span>课堂提问</span>
      <p>{slide.ask}</p>
    </div>
  ) : null;

  const takeawayBlock = slide.takeaway ? (
    <div className="slide-takeaway" key="takeaway">
      <span>一句话带走</span>
      <p>{slide.takeaway}</p>
    </div>
  ) : null;

  const points = (slide.bullets ?? []).filter(Boolean);

  const body = (() => {
    if (slide.layout === 'cover') {
      return (
        <div className="slide-cover-body">
          <span className="slide-kicker">MICRO COURSE</span>
          <h2>{slide.title}</h2>
          <p>{slide.bullets[0]}</p>
          <div className="slide-cover-footer">
            <span>课程讲稿 · 视觉分镜</span>
            <strong>{accentLabel[slide.accent]}</strong>
          </div>
        </div>
      );
    }

    if (slide.layout === 'objectives') {
      return (
        <div className="slide-objectives-body">
          <h2>{slide.title}</h2>
          <div className="slide-objective-list">
            {points.map((bullet, index) => (
              <div key={bullet}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <p>{bullet}</p>
              </div>
            ))}
          </div>
          {askBlock}
        </div>
      );
    }

    if (slide.layout === 'compare') {
      return (
        <div className="slide-compare-body">
          <h2>{slide.title}</h2>
          <div className="slide-compare-grid">
            {points.slice(0, 2).map((bullet, index) => (
              <div key={bullet}>
                <span>{index === 0 ? 'A / 观察' : 'B / 判断'}</span>
                <p>{bullet}</p>
                {index === 0 && <span className="compare-arrow">→</span>}
              </div>
            ))}
          </div>
          {hasVisual && visualBlock}
          {askBlock}
        </div>
      );
    }

    if (slide.layout === 'quote') {
      return (
        <div className="slide-quote-body">
          <span className="quote-mark">“</span>
          <h2>{slide.title}</h2>
          <div className="slide-keywords">
            {points.map((bullet) => (
              <span key={bullet}>{bullet}</span>
            ))}
          </div>
          {takeawayBlock}
        </div>
      );
    }

    if (slide.layout === 'steps') {
      return (
        <div className="slide-steps-body">
          <div className="slide-concept-title">
            <span>PROCESS / 步骤</span>
            <h2>{slide.title}</h2>
            {slide.keyPoint && <p className="slide-key-point">{slide.keyPoint}</p>}
          </div>
          {hasVisual ? visualBlock : (
            <div className="slide-concept-points">
              {points.map((bullet, index) => (
                <div key={`${bullet}-${index}`}>
                  <span className="point-line" />
                  <p>{bullet}</p>
                </div>
              ))}
            </div>
          )}
          {askBlock}
        </div>
      );
    }

    if (slide.layout === 'case') {
      return (
        <div className="slide-case-body">
          <div className="slide-case-scene">
            <span>情境 / CASE</span>
            <h2>{slide.title}</h2>
            {slide.keyPoint && <p className="slide-key-point">{slide.keyPoint}</p>}
            {hasVisual && visualBlock}
          </div>
          <div className="slide-case-insight">
            <span>启示 / INSIGHT</span>
            <div className="slide-concept-points">
              {points.map((bullet, index) => (
                <div key={`${bullet}-${index}`}>
                  <span className="point-line" />
                  <p>{bullet}</p>
                </div>
              ))}
            </div>
            {takeawayBlock}
          </div>
        </div>
      );
    }

    if (slide.layout === 'split') {
      return (
        <div className="slide-concept-body is-split">
          <div className="slide-concept-copy">
            <div className="slide-concept-title">
              <span>KEY IDEA</span>
              <h2>{slide.title}</h2>
            </div>
            {slide.keyPoint && <p className="slide-key-point">{slide.keyPoint}</p>}
            <div className="slide-concept-points">
              {points.map((bullet, index) => (
                <div key={`${bullet}-${index}`}>
                  <span className="point-line" />
                  <p>{bullet}</p>
                </div>
              ))}
            </div>
            {supporting.length > 0 && (
              <ul className="slide-supporting">
                {supporting.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </div>
          {visualBlock}
          {askBlock}
        </div>
      );
    }

    return (
      <div className={`slide-concept-body ${hasVisual ? 'is-split' : ''}`}>
        <div className="slide-concept-copy">
          <div className="slide-concept-title">
            <span>KEY IDEA</span>
            <h2>{slide.title}</h2>
          </div>
          {slide.keyPoint && <p className="slide-key-point">{slide.keyPoint}</p>}
          <div className="slide-concept-points">
            {points.map((bullet, index) => (
              <div key={`${bullet}-${index}`}>
                <span className="point-line" />
                <p>{bullet}</p>
              </div>
            ))}
          </div>
          {supporting.length > 0 && (
            <ul className="slide-supporting">
              {supporting.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </div>
        {visualBlock}
        {askBlock}
      </div>
    );
  })();

  if (slide.html) {
    return (
      <div
        className={`slide-canvas slide-html-page accent-${slide.accent} ${compact ? 'is-compact' : ''} ${className}`}
        data-visual="html"
      >
        <iframe
          title={slide.title}
          srcDoc={slide.html}
          sandbox="allow-same-origin allow-popups"
        />
      </div>
    );
  }

  return (
    <div
      className={`slide-canvas ${modeClass} accent-${slide.accent} ${compact ? 'is-compact' : ''} ${className}`}
      data-visual={slide.visual?.kind ?? 'none'}
      data-visual-label={visualKindLabel[slide.visual?.kind ?? 'none']}
    >
      <div className="slide-grid-mark" aria-hidden="true" />
      <div className="slide-topline">
        <span>{slide.eyebrow}</span>
        <span>课序 / KEXU</span>
      </div>
      <div className="slide-accent-rule" aria-hidden="true" />
      {body}
      <div className="slide-footer">
        <span>{slide.order < 10 ? `0${slide.order}` : slide.order}</span>
        <span className="slide-footer-line" />
        <span>{slide.eyebrow.split('/')[0]}</span>
      </div>
    </div>
  );
}
