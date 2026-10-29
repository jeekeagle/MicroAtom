import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Layers3,
  LayoutGrid,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Save,
  Sparkles,
  WandSparkles
} from 'lucide-react';
import { api } from '../../lib/api';
import { formatDuration, sectionRoleLabel } from '../../lib/format';
import type { CourseSlide, SlideLayout } from '../../types';
import { Button } from '../ui';
import { SlideCanvas } from '../SlideCanvas';
import type { StageProps } from './types';

const layouts: Array<{ value: SlideLayout; label: string }> = [
  { value: 'cover', label: '封面' },
  { value: 'objectives', label: '学习目标' },
  { value: 'statement', label: '观点' },
  { value: 'concept', label: '概念' },
  { value: 'compare', label: '对照' },
  { value: 'quote', label: '引语 / 收束' },
  { value: 'summary', label: '总结' }
];

const accents: Array<{ value: CourseSlide['accent']; label: string }> = [
  { value: 'brick', label: '砖红' },
  { value: 'teal', label: '青绿' },
  { value: 'gold', label: '金色' },
  { value: 'ink', label: '墨色' }
];

const cloneSlide = (slide: CourseSlide): CourseSlide => ({
  ...slide,
  bullets: [...slide.bullets]
});

export function SlidesStage({ project, onProject, notify, onStage }: StageProps) {
  const [selectedId, setSelectedId] = useState(project.slides[0]?.id ?? '');
  const [slideDraft, setSlideDraft] = useState<CourseSlide | null>(
    project.slides[0] ? cloneSlide(project.slides[0]) : null
  );
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [entering, setEntering] = useState(false);

  const selectedIndex = Math.max(
    0,
    project.slides.findIndex((slide) => slide.id === selectedId)
  );
  const selected = project.slides[selectedIndex];
  const selectedSection = useMemo(
    () =>
      project.script?.sections.find((section) => section.id === selected?.sectionId) ??
      project.script?.sections[0],
    [project.script?.sections, selected?.sectionId]
  );

  useEffect(() => {
    const next = project.slides.find((slide) => slide.id === selectedId) ?? project.slides[0];
    if (next) {
      setSelectedId(next.id);
      setSlideDraft(cloneSlide(next));
    } else {
      setSelectedId('');
      setSlideDraft(null);
    }
  }, [project.id, project.slides]);

  const selectSlide = (slide: CourseSlide) => {
    if (slideDraft && slideDraft.id !== slide.id && slideDraft !== cloneSlide(selected ?? slideDraft)) {
      // Local edits stay on the current page until they are explicitly saved.
    }
    setSelectedId(slide.id);
    setSlideDraft(cloneSlide(slide));
  };

  const totalSeconds = useMemo(
    () => project.slides.reduce((sum, slide) => sum + slide.seconds, 0),
    [project.slides]
  );

  const generate = async () => {
    setGenerating(true);
    try {
      const next = await api.projectAction(project.id, 'generate-slides');
      onProject(next);
      const first = next.slides[0];
      setSelectedId(first?.id ?? '');
      setSlideDraft(first ? cloneSlide(first) : null);
      notify(`构页已完成 ${next.slides.length} 页课件`);
    } catch (error) {
      notify(error instanceof Error ? error.message : '课件生成失败', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    if (!slideDraft) return null;
    setSaving(true);
    try {
      const next = await api.updateSlide(project.id, slideDraft.id, {
        title: slideDraft.title,
        eyebrow: slideDraft.eyebrow,
        layout: slideDraft.layout,
        bullets: slideDraft.bullets,
        note: slideDraft.note,
        accent: slideDraft.accent,
        seconds: slideDraft.seconds
      });
      onProject(next);
      const saved = next.slides.find((slide) => slide.id === slideDraft.id);
      if (saved) setSlideDraft(cloneSlide(saved));
      notify('当前页面已保存');
      return next;
    } catch (error) {
      notify(error instanceof Error ? error.message : '页面保存失败', 'error');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const enterAudio = async () => {
    setEntering(true);
    try {
      if (slideDraft && selected && JSON.stringify(slideDraft) !== JSON.stringify(selected)) {
        const saved = await save();
        if (!saved) return;
      }
      const next = await api.projectAction(project.id, 'enter-audio');
      onProject(next);
      notify('课件已锁定，进入声音与录制');
      onStage('audio');
    } catch (error) {
      notify(error instanceof Error ? error.message : '无法进入声音环节', 'error');
    } finally {
      setEntering(false);
    }
  };

  const updateDraft = <K extends keyof CourseSlide>(key: K, value: CourseSlide[K]) => {
    setSlideDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  if (!project.script?.confirmed) {
    return (
      <div className="stage-page">
        <div className="stage-toolbar">
          <div className="stage-title">
            <span className="stage-icon">
              <Layers3 size={19} />
            </span>
            <div>
              <span className="eyebrow">SLIDE WORKSHOP / 02</span>
              <h2>课件工坊</h2>
              <p>只把已确认的讲稿转成视觉任务，不让课件先于教学逻辑。</p>
            </div>
          </div>
        </div>
        <section className="stage-gate">
          <span className="gate-icon">
            <LockKeyhole size={24} />
          </span>
          <span className="eyebrow">SCRIPT NOT CONFIRMED</span>
          <h3>课件需要一份已确认的讲稿</h3>
          <p>构页会读取每个段落的视觉任务、信息密度与讲述节拍，生成可编辑课件页面。</p>
          <Button variant="primary" icon={<ArrowRight size={16} />} onClick={() => onStage('script')}>
            返回讲稿工坊
          </Button>
        </section>
      </div>
    );
  }

  if (!project.slides.length) {
    return (
      <div className="stage-page">
        <div className="stage-toolbar">
          <div className="stage-title">
            <span className="stage-icon">
              <Layers3 size={19} />
            </span>
            <div>
              <span className="eyebrow">SLIDE WORKSHOP / 02</span>
              <h2>课件工坊</h2>
              <p>讲稿已确认。下一步由构页分配页面、组织版式并检查可读性。</p>
            </div>
          </div>
        </div>
        <section className="stage-empty large">
          <span className="empty-seal">
            <LayoutGrid size={26} />
          </span>
          <span className="eyebrow">VISUAL STORYBOARD</span>
          <h3>从 {project.script.sections.length} 个讲稿段落生成课件</h3>
          <p>
            每页只承担一个表达任务。封面、学习目标、概念页、对照页与收束页会自动匹配不同版式。
          </p>
          <div className="empty-facts">
            <span>
              <Layers3 size={15} />
              约 {project.script.sections.length + 3} 页
            </span>
            <span>
              <Sparkles size={15} />
              可编辑版式
            </span>
            <span>
              <Check size={15} />
              可读性质检
            </span>
          </div>
          <Button
            variant="primary"
            icon={<WandSparkles size={16} />}
            loading={generating}
            onClick={generate}
          >
            生成课件
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div className="stage-page">
      <div className="stage-toolbar">
        <div className="stage-title">
          <span className="stage-icon">
            <Layers3 size={19} />
          </span>
          <div>
            <span className="eyebrow">SLIDE WORKSHOP / 02</span>
            <h2>课件工坊</h2>
            <p>{project.slides.length} 页 · 预计画面 {formatDuration(totalSeconds)} · 讲稿驱动</p>
          </div>
        </div>
        <div className="stage-toolbar-actions">
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw size={15} />}
            loading={generating}
            onClick={generate}
          >
            重排全部
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<ArrowRight size={15} />}
            loading={entering}
            onClick={enterAudio}
          >
            进入声音
          </Button>
        </div>
      </div>

      <div className="slide-workbench">
        <aside className="slide-rail">
          <div className="slide-rail-head">
            <span>页面顺序</span>
            <small>{project.slides.length} 页</small>
          </div>
          <div className="slide-thumb-list">
            {project.slides.map((slide) => (
              <button
                key={slide.id}
                className={slide.id === selectedId ? 'is-active' : ''}
                onClick={() => selectSlide(slide)}
                aria-label={`第 ${slide.order} 页 ${slide.title}`}
              >
                <span className="slide-thumb-index">{String(slide.order).padStart(2, '0')}</span>
                <span className="slide-thumb-canvas">
                  <SlideCanvas slide={slide} compact />
                </span>
                <span className="slide-thumb-copy">
                  <strong>{slide.title}</strong>
                  <small>{slide.eyebrow}</small>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="slide-main">
          <div className="slide-canvas-stage">
            <div className="slide-canvas-stage-head">
              <div>
                <span className="eyebrow">CANVAS / 16:9</span>
                <strong>
                  第 {selectedIndex + 1} 页 · {selected?.eyebrow}
                </strong>
              </div>
              <div className="slide-pager">
                <button
                  className="icon-button"
                  disabled={selectedIndex <= 0}
                  onClick={() => selectSlide(project.slides[selectedIndex - 1])}
                  aria-label="上一页"
                >
                  <ChevronLeft size={17} />
                </button>
                <span>
                  {selectedIndex + 1} / {project.slides.length}
                </span>
                <button
                  className="icon-button"
                  disabled={selectedIndex >= project.slides.length - 1}
                  onClick={() => selectSlide(project.slides[selectedIndex + 1])}
                  aria-label="下一页"
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>
            <div className="slide-canvas-frame">
              {slideDraft && <SlideCanvas slide={slideDraft} />}
            </div>
            {selected && (
              <div className="slide-lecture-note">
                <span>
                  对应讲稿 · {selectedSection ? sectionRoleLabel[selectedSection.role] : '正文'}
                </span>
                <p>
                  {selectedSection?.narration
                    ? `${selectedSection.narration.slice(0, 120)}${
                        selectedSection.narration.length > 120 ? '…' : ''
                      }`
                    : (selected.note || '这一页还没有对应的讲稿段落。')}
                </p>
                <small>{formatDuration(selected.seconds)}</small>
              </div>
            )}
          </div>

          {slideDraft && (
            <section className="slide-properties">
              <div className="slide-properties-head">
                <div>
                  <span className="eyebrow">PAGE PROPERTIES</span>
                  <strong>页面内容与版式</strong>
                </div>
                <div className="layout-switch" role="group" aria-label="页面版式">
                  {layouts.map((layout) => (
                    <button
                      key={layout.value}
                      className={slideDraft.layout === layout.value ? 'is-active' : ''}
                      onClick={() => updateDraft('layout', layout.value)}
                    >
                      {layout.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="slide-property-grid">
                <div className="slide-property-fields">
                  <label className="field">
                    <span>页面标题</span>
                    <input
                      value={slideDraft.title}
                      onChange={(event) => updateDraft('title', event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>页眉标签</span>
                    <input
                      value={slideDraft.eyebrow}
                      onChange={(event) => updateDraft('eyebrow', event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>
                      页面要点
                      <small>每行一个，建议不超过 3 行</small>
                    </span>
                    <textarea
                      rows={5}
                      value={slideDraft.bullets.join('\n')}
                      onChange={(event) =>
                        updateDraft(
                          'bullets',
                          event.target.value
                            .split('\n')
                            .map((line) => line.trim())
                            .filter(Boolean)
                        )
                      }
                    />
                  </label>
                </div>
                <div className="slide-property-side">
                  <div className="property-group">
                    <span>强调色</span>
                    <div className="accent-swatches">
                      {accents.map((accent) => (
                        <button
                          key={accent.value}
                          className={`accent-${accent.value} ${
                            slideDraft.accent === accent.value ? 'is-active' : ''
                          }`}
                          onClick={() => updateDraft('accent', accent.value)}
                          title={accent.label}
                          aria-label={accent.label}
                        />
                      ))}
                    </div>
                  </div>
                  <label className="field">
                    <span>画面停留</span>
                    <div className="input-with-suffix">
                      <input
                        type="number"
                        min={2}
                        max={180}
                        value={slideDraft.seconds}
                        onChange={(event) => updateDraft('seconds', Number(event.target.value) || 2)}
                      />
                      <span>秒</span>
                    </div>
                  </label>
                  <label className="field">
                    <span>讲述备注</span>
                    <textarea
                      rows={4}
                      value={slideDraft.note}
                      onChange={(event) => updateDraft('note', event.target.value)}
                    />
                  </label>
                </div>
              </div>
              <div className="slide-properties-actions">
                <span>
                  <Check size={14} />
                  修改会重置后续成片
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={saving ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}
                  loading={saving}
                  onClick={() => void save()}
                >
                  保存当前页
                </Button>
              </div>
            </section>
          )}
        </section>
      </div>
    </div>
  );
}
