import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  FileCheck2,
  FilePenLine,
  LoaderCircle,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  WandSparkles
} from 'lucide-react';
import { api } from '../../lib/api';
import { formatDuration, modeLabel, sectionRoleLabel } from '../../lib/format';
import type {
  CourseProject,
  CourseScript,
  ScriptGenerationInput,
  ScriptSection
} from '../../types';
import { Button, ProgressBar } from '../ui';
import type { StageProps } from './types';

const cloneScript = (script?: CourseScript): CourseScript | undefined =>
  script
    ? {
        ...script,
        objectives: [...script.objectives],
        keywords: [...script.keywords],
        valueThread: script.valueThread.map((item) => ({ ...item })),
        sections: script.sections.map((section) => ({ ...section })),
        quality: { ...script.quality }
      }
    : undefined;

const modeHint = {
  auto: '全自动模式会在确认讲稿后连续完成课件、旁白与成片。',
  oral: '口语稿模式先保留讲述骨架，完整口述可在声音与录制环节采集并定位。',
  ppt: 'PPT 模式会先精修课件，再对照页面录制声音与教师画面。'
} as const;

const qualityItems: Array<{
  key: keyof Pick<CourseScript['quality'], 'structure' | 'oral' | 'value' | 'fit'>;
  label: string;
}> = [
  { key: 'structure', label: '结构' },
  { key: 'oral', label: '口语性' },
  { key: 'value', label: '价值密度' },
  { key: 'fit', label: '学情匹配' }
];

export function ScriptStage({ project, onProject, notify, onStage }: StageProps) {
  const [draft, setDraft] = useState<CourseScript | undefined>(() => cloneScript(project.script));
  const [selectedId, setSelectedId] = useState(project.script?.sections[0]?.id ?? '');
  const [briefOpen, setBriefOpen] = useState(!project.script);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [brief, setBrief] = useState<ScriptGenerationInput>({
    topic: project.topic,
    idea: project.idea,
    valueGuide: project.valueGuide,
    learnerProfile: project.learnerProfile,
    subject: project.subject,
    grade: project.grade,
    durationMinutes: project.durationMinutes,
    style: project.style
  });

  useEffect(() => {
    setDraft(cloneScript(project.script));
    setSelectedId((current) =>
      project.script?.sections.some((section) => section.id === current)
        ? current
        : (project.script?.sections[0]?.id ?? '')
    );
    setBrief({
      topic: project.topic,
      idea: project.idea,
      valueGuide: project.valueGuide,
      learnerProfile: project.learnerProfile,
      subject: project.subject,
      grade: project.grade,
      durationMinutes: project.durationMinutes,
      style: project.style
    });
  }, [project.id, project.script?.generatedAt, project.script?.confirmed]);

  const selected = draft?.sections.find((section) => section.id === selectedId) ?? draft?.sections[0];
  const totalDuration = useMemo(
    () => draft?.sections.reduce((sum, section) => sum + section.durationSeconds, 0) ?? 0,
    [draft]
  );
  const narrationLength =
    draft?.sections.reduce((sum, section) => sum + section.narration.replace(/\s/g, '').length, 0) ?? 0;
  const pageBySection = useMemo(
    () => new Map(project.slides.map((slide) => [slide.sectionId, slide.order])),
    [project.slides]
  );

  const setBriefField = <K extends keyof ScriptGenerationInput>(
    key: K,
    value: ScriptGenerationInput[K]
  ) => setBrief((current) => ({ ...current, [key]: value }));

  const updateSection = <K extends keyof ScriptSection>(key: K, value: ScriptSection[K]) => {
    if (!selected) return;
    setDraft((current) =>
      current
        ? {
            ...current,
            confirmed: false,
            sections: current.sections.map((section) =>
              section.id === selected.id ? { ...section, [key]: value } : section
            )
          }
        : current
    );
  };

  const updateScriptField = <K extends keyof CourseScript>(key: K, value: CourseScript[K]) => {
    setDraft((current) => (current ? { ...current, [key]: value, confirmed: false } : current));
  };

  const generate = async () => {
    if (!brief.topic.trim()) {
      notify('请先填写课程主题', 'error');
      return;
    }
    setGenerating(true);
    try {
      const result = await api.generateScript(project.id, brief);
      onProject(result.project);
      setDraft(cloneScript(result.project.script));
      setSelectedId(result.project.script?.sections[0]?.id ?? '');
      setBriefOpen(false);
      notify(result.project.script ? '讲稿已生成，请逐段校对' : '讲稿已更新');
    } catch (error) {
      notify(error instanceof Error ? error.message : '讲稿生成失败', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    if (!draft) return null;
    setSaving(true);
    try {
      const next = await api.projectAction(project.id, 'save-script', {
        script: draft,
        keepConfirmed: false
      });
      onProject(next);
      setDraft(cloneScript(next.script));
      notify('讲稿草稿已保存');
      return next;
    } catch (error) {
      notify(error instanceof Error ? error.message : '保存失败', 'error');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const confirm = async () => {
    if (!draft) return;
    const empty = draft.sections.find((section) => !section.narration.trim());
    if (empty) {
      setSelectedId(empty.id);
      notify(`第 ${empty.order} 段还没有口播内容`, 'error');
      return;
    }
    setConfirming(true);
    try {
      const saved = await api.projectAction(project.id, 'save-script', {
        script: draft,
        keepConfirmed: false
      });
      const next = await api.projectAction(project.id, 'confirm-script');
      onProject(next);
      setDraft(cloneScript(next.script));
      notify('讲稿已确认，可以进入课件工坊');
      onStage('slides');
    } catch (error) {
      notify(error instanceof Error ? error.message : '讲稿确认失败', 'error');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="stage-page">
      <div className="stage-toolbar">
        <div className="stage-title">
          <span className="stage-icon">
            <FilePenLine size={19} />
          </span>
          <div>
            <span className="eyebrow">SCRIPT WORKSHOP / 01</span>
            <h2>讲稿工坊</h2>
            <p>{modeHint[project.mode]}</p>
          </div>
        </div>
        <div className="stage-toolbar-actions">
          {project.mode === 'oral' && (
            <Button
              variant="ghost"
              size="sm"
              icon={<ArrowRight size={15} />}
              onClick={() => onStage('audio')}
            >
              口播采集
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            icon={briefOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            onClick={() => setBriefOpen((open) => !open)}
          >
            备课约束
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<RefreshCw size={15} />}
            loading={generating}
            onClick={generate}
          >
            {draft ? '重新生成' : '生成讲稿'}
          </Button>
        </div>
      </div>

      {briefOpen && (
        <section className="brief-panel">
          <div className="brief-panel-head">
            <div>
              <strong>交给智能体的教学约束</strong>
              <span>
                {modeLabel[project.mode]} · {brief.durationMinutes} 分钟 · {brief.grade}
              </span>
            </div>
            <span className="brief-agent">
              <span className="agent-orb tone-brick">析</span>
              析课 / 教学设计智能体
            </span>
          </div>
          <div className="form-grid three">
            <label className="field">
              <span>课程主题</span>
              <input
                value={brief.topic}
                onChange={(event) => setBriefField('topic', event.target.value)}
                placeholder="例如：杠杆原理"
              />
            </label>
            <label className="field">
              <span>学科</span>
              <input
                value={brief.subject}
                onChange={(event) => setBriefField('subject', event.target.value)}
                placeholder="物理"
              />
            </label>
            <label className="field">
              <span>学段 / 目标时长</span>
              <div className="split-input">
                <input
                  value={brief.grade}
                  onChange={(event) => setBriefField('grade', event.target.value)}
                  placeholder="八年级"
                />
                <div className="input-with-suffix compact">
                  <input
                    type="number"
                    min={3}
                    max={45}
                    value={brief.durationMinutes}
                    onChange={(event) =>
                      setBriefField('durationMinutes', Number(event.target.value) || 8)
                    }
                  />
                  <span>分</span>
                </div>
              </div>
            </label>
          </div>
          <div className="form-grid two">
            <label className="field">
              <span>想法草稿</span>
              <textarea
                rows={4}
                value={brief.idea}
                onChange={(event) => setBriefField('idea', event.target.value)}
                placeholder="从一个真实情境、认知冲突或学生常见错误进入。"
              />
            </label>
            <label className="field">
              <span>价值引领</span>
              <textarea
                rows={4}
                value={brief.valueGuide}
                onChange={(event) => setBriefField('valueGuide', event.target.value)}
                placeholder="希望学生在知识之外形成怎样的判断与行动？"
              />
            </label>
          </div>
          <div className="form-grid two">
            <label className="field">
              <span>学情</span>
              <textarea
                rows={3}
                value={brief.learnerProfile}
                onChange={(event) => setBriefField('learnerProfile', event.target.value)}
                placeholder="学生已经会什么，容易卡在哪里？"
              />
            </label>
            <label className="field">
              <span>讲述风格</span>
              <textarea
                rows={3}
                value={brief.style}
                onChange={(event) => setBriefField('style', event.target.value)}
                placeholder="清晰、口语化、问题驱动"
              />
            </label>
          </div>
          <div className="brief-panel-foot">
            <span>
              <ShieldCheck size={14} />
              生成会创建新版本；已确认的讲稿需要重新确认。
            </span>
            <Button
              variant="dark"
              size="sm"
              icon={<Sparkles size={15} />}
              loading={generating}
              onClick={generate}
            >
              交给析课生成
            </Button>
          </div>
        </section>
      )}

      {!draft ? (
        <section className="stage-empty large">
          <span className="empty-seal">
            <WandSparkles size={26} />
          </span>
          <span className="eyebrow">BLANK COURSE BRIEF</span>
          <h3>先建立一份能被确认的课程讲稿</h3>
          <p>
            智能体会读取备课主题、草稿、学情与价值引领，输出带段落任务、课件提示与质量诊断的口播稿。
          </p>
          <div className="empty-facts">
            <span>
              <FilePenLine size={15} />
              5 段问题链
            </span>
            <span>
              <Clock3 size={15} />
              {project.durationMinutes} 分钟
            </span>
            <span>
              <ShieldCheck size={15} />
              价值主线嵌入
            </span>
          </div>
          <Button
            variant="primary"
            icon={<WandSparkles size={16} />}
            loading={generating}
            onClick={generate}
          >
            生成第一版讲稿
          </Button>
        </section>
      ) : (
        <>
          <section className="script-overview">
            <div className="script-thesis">
              <div className="script-thesis-head">
                <span className="eyebrow">COURSE THESIS</span>
                <span className={`confirmation-state ${draft.confirmed ? 'is-confirmed' : ''}`}>
                  {draft.confirmed ? <Check size={13} /> : <span />}
                  {draft.confirmed ? '已确认' : '待确认'}
                </span>
              </div>
              <textarea
                className="thesis-input"
                rows={2}
                value={draft.thesis}
                onChange={(event) => updateScriptField('thesis', event.target.value)}
                aria-label="课程核心主张"
              />
              <div className="thesis-facts">
                <span>
                  <FileCheck2 size={14} />
                  {draft.sections.length} 个段落
                </span>
                <span>
                  <Clock3 size={14} />
                  {formatDuration(totalDuration)}
                </span>
                <span>{narrationLength} 字</span>
                <span>版本 v{draft.version}</span>
              </div>
            </div>
            <div className="quality-strip">
              <div className="quality-strip-head">
                <span>讲稿质检</span>
                <strong>
                  {Math.round(
                    qualityItems.reduce((sum, item) => sum + draft.quality[item.key], 0) /
                      qualityItems.length
                  )}
                  <small>/100</small>
                </strong>
              </div>
              {qualityItems.map((item) => (
                <div className="quality-row" key={item.key}>
                  <span>{item.label}</span>
                  <ProgressBar value={draft.quality[item.key]} compact tone="teal" />
                  <strong>{draft.quality[item.key]}</strong>
                </div>
              ))}
            </div>
            <div className="value-thread">
              <span className="eyebrow">VALUE THREAD</span>
              <div className="value-thread-list">
                {draft.valueThread.map((item, index) => (
                  <div key={`${item.label}-${index}`}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{item.label}</strong>
                    <p>{item.content}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="script-workspace">
            <aside className="script-outline">
              <div className="script-outline-head">
                <span>讲稿结构</span>
                <small>{draft.sections.length} 段</small>
              </div>
              <div className="script-outline-list">
                {draft.sections.map((section) => (
                  <button
                    key={section.id}
                    className={section.id === selected?.id ? 'is-active' : ''}
                    onClick={() => setSelectedId(section.id)}
                  >
                    <span className="outline-index">
                      {String(section.order).padStart(2, '0')}
                    </span>
                    <span className="outline-copy">
                      <strong>{section.title}</strong>
                      <small>
                        {sectionRoleLabel[section.role] ?? '正文'} ·{' '}
                        {pageBySection.has(section.id)
                          ? `第 ${pageBySection.get(section.id)} 页`
                          : '未配页'}
                      </small>
                    </span>
                    <span className="outline-state">
                      {section.narration.trim() ? <Check size={12} /> : <span />}
                    </span>
                  </button>
                ))}
              </div>
              <div className="script-outline-foot">
                <span>核心关键词</span>
                <div>
                  {draft.keywords.slice(0, 4).map((keyword) => (
                    <span key={keyword}>{keyword}</span>
                  ))}
                </div>
              </div>
            </aside>

            {selected && (
              <section className="script-editor">
                <div className="script-editor-head">
                  <div>
                    <span className="eyebrow">
                      SECTION {String(selected.order).padStart(2, '0')} /{' '}
                      {String(draft.sections.length).padStart(2, '0')}
                    </span>
                    <input
                      className="section-title-input"
                      value={selected.title}
                      onChange={(event) => updateSection('title', event.target.value)}
                      aria-label="段落标题"
                    />
                  </div>
                  <label className="duration-control">
                    <Clock3 size={14} />
                    <input
                      type="number"
                      min={8}
                      max={300}
                      value={selected.durationSeconds}
                      onChange={(event) =>
                        updateSection('durationSeconds', Number(event.target.value) || 10)
                      }
                    />
                    <span>秒</span>
                  </label>
                </div>

                <label className="field narration-field">
                  <span>
                    口播讲稿
                    <small>建议每段 80–180 字，读到句号时可自然停顿</small>
                  </span>
                  <textarea
                    rows={11}
                    value={selected.narration}
                    onChange={(event) => updateSection('narration', event.target.value)}
                  />
                  <span className="field-counter">
                    {selected.narration.replace(/\s/g, '').length} 字 · 约{' '}
                    {Math.max(1, Math.round(selected.narration.replace(/\s/g, '').length / 4.2))} 秒
                  </span>
                </label>

                <div className="form-grid two">
                  <label className="field">
                    <span>本段教学任务</span>
                    <textarea
                      rows={3}
                      value={selected.purpose}
                      onChange={(event) => updateSection('purpose', event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>价值落点</span>
                    <textarea
                      rows={3}
                      value={selected.valueNote}
                      onChange={(event) => updateSection('valueNote', event.target.value)}
                    />
                  </label>
                </div>

                <label className="field">
                  <span>
                    视觉任务
                    <small>这段讲稿交由构页生成课件时的画面约束</small>
                  </span>
                  <textarea
                    rows={3}
                    value={selected.slideBrief}
                    onChange={(event) => updateSection('slideBrief', event.target.value)}
                  />
                </label>

                <div className="quality-note">
                  <span className="quality-note-icon">
                    <ShieldCheck size={16} />
                  </span>
                  <div>
                    <strong>校尺建议</strong>
                    <p>{draft.quality.note}</p>
                  </div>
                </div>
              </section>
            )}
          </div>

          <div className="stage-actionbar">
            <div className="actionbar-status">
              <span className={draft.confirmed ? 'is-ready' : 'is-draft'}>
                {draft.confirmed ? <Check size={13} /> : <FilePenLine size={13} />}
                {draft.confirmed ? '讲稿已确认' : '有未确认的修改'}
              </span>
              <small>确认后，构页会按段落任务生成课件。</small>
            </div>
            <div className="stage-actionbar-buttons">
              <Button
                variant="secondary"
                icon={saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}
                loading={saving}
                onClick={() => void save()}
              >
                保存草稿
              </Button>
              <Button
                variant="primary"
                icon={<ArrowRight size={16} />}
                loading={confirming}
                onClick={() => void confirm()}
              >
                确认讲稿，进入课件
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
