import type { CourseSlide } from '../types';

const accentLabel = {
  brick: '01',
  teal: '02',
  gold: '03',
  ink: '04'
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
  const modeClass = slide.layout === 'cover' ? 'slide-dark' : `slide-${slide.layout}`;
  return (
    <div
      className={`slide-canvas ${modeClass} accent-${slide.accent} ${compact ? 'is-compact' : ''} ${className}`}
    >
      <div className="slide-grid-mark" aria-hidden="true" />
      <div className="slide-topline">
        <span>{slide.eyebrow}</span>
        <span>课序 / KEXU</span>
      </div>
      <div className="slide-accent-rule" aria-hidden="true" />

      {slide.layout === 'cover' && (
        <div className="slide-cover-body">
          <span className="slide-kicker">MICRO COURSE</span>
          <h2>{slide.title}</h2>
          <p>{slide.bullets[0]}</p>
          <div className="slide-cover-footer">
            <span>课程讲稿 · 视觉分镜</span>
            <strong>{accentLabel[slide.accent]}</strong>
          </div>
        </div>
      )}

      {slide.layout === 'objectives' && (
        <div className="slide-objectives-body">
          <h2>{slide.title}</h2>
          <div className="slide-objective-list">
            {slide.bullets.map((bullet, index) => (
              <div key={bullet}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <p>{bullet}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {(slide.layout === 'concept' || slide.layout === 'statement' || slide.layout === 'summary') && (
        <div className="slide-concept-body">
          <div className="slide-concept-title">
            <span>KEY IDEA</span>
            <h2>{slide.title}</h2>
          </div>
          <div className="slide-concept-points">
            {slide.bullets.map((bullet, index) => (
              <div key={`${bullet}-${index}`}>
                <span className="point-line" />
                <p>{bullet}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {slide.layout === 'compare' && (
        <div className="slide-compare-body">
          <h2>{slide.title}</h2>
          <div className="slide-compare-grid">
            {slide.bullets.slice(0, 2).map((bullet, index) => (
              <div key={bullet}>
                <span>{index === 0 ? 'A / 观察' : 'B / 判断'}</span>
                <p>{bullet}</p>
                {index === 0 && <span className="compare-arrow">→</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {slide.layout === 'quote' && (
        <div className="slide-quote-body">
          <span className="quote-mark">“</span>
          <h2>{slide.title}</h2>
          <div className="slide-keywords">
            {slide.bullets.map((bullet) => (
              <span key={bullet}>{bullet}</span>
            ))}
          </div>
        </div>
      )}

      <div className="slide-footer">
        <span>{slide.order < 10 ? `0${slide.order}` : slide.order}</span>
        <span className="slide-footer-line" />
        <span>{slide.eyebrow.split('/')[0]}</span>
      </div>
    </div>
  );
}
