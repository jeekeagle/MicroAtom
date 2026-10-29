import {
  ArrowRight,
  AudioLines,
  Check,
  ChevronRight,
  Clapperboard,
  FilePenLine,
  Layers3,
  Plus,
  TimerReset,
  WandSparkles
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import {
  formatDate,
  formatDuration,
  modeLabel,
  modeShortLabel,
  relativeTime,
  stageLabel
} from '../lib/format';
import { Button, ModeBadge, ProgressBar, StatusBadge } from '../components/ui';
import type { StageKey } from '../types';

const stageIndex: Record<StageKey, number> = {
  script: 0,
  slides: 1,
  audio: 2,
  render: 3
};

const stages: Array<{ id: StageKey; label: string; icon: typeof FilePenLine }> = [
  { id: 'script', label: '讲稿', icon: FilePenLine },
  { id: 'slides', label: '课件', icon: Layers3 },
  { id: 'audio', label: '声音', icon: AudioLines },
  { id: 'render', label: '成片', icon: Clapperboard }
];

const launchModes = [
  {
    id: 'auto',
    title: '全自动生成',
    body: '输入主题与价值引领，让智能体连续完成课程生产。',
    icon: WandSparkles,
    meta: '最快 12 分钟'
  },
  {
    id: 'oral',
    title: '口语稿驱动',
    body: '教师按自己的口语稿讲授，系统识别进度并匹配课件。',
    icon: AudioLines,
    meta: '保留个人表达'
  },
  {
    id: 'ppt',
    title: 'PPT 驱动',
    body: '先确认课件，再对照页面录制声音与教师画面。',
    icon: Layers3,
    meta: '适合已有设计'
  }
];

const QUEUE_PREVIEW_COUNT = 6;

export function DashboardPage() {
  const { data, openCreateProject } = useApp();
  const navigate = useNavigate();
  const [queueExpanded, setQueueExpanded] = useState(false);
  if (!data) return null;

  const active = [...data.projects].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  const queued = queueExpanded ? active : active.slice(0, QUEUE_PREVIEW_COUNT);
  const hiddenCount = active.length - queued.length;
  const current = active[0];
  const currentStage = stageIndex[current.stage];
  const totalDuration = current.script?.sections.reduce((sum, item) => sum + item.durationSeconds, 0) ?? 0;
  const today = new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  }).format(new Date());

  return (
    <div className="page dashboard-page">
      <div className="page-intro dashboard-intro">
        <div>
          <span className="eyebrow">PRODUCTION DESK / {today}</span>
          <h1>今天，把一节课推到成片。</h1>
        </div>
        <div className="intro-actions">
          <Button variant="secondary" size="sm" icon={<Plus size={15} />} onClick={() => openCreateProject()}>
            新建课程
          </Button>
        </div>
      </div>

      <section className="workbench-hero">
        <div className="workbench-hero-main">
          <div className="hero-meta">
            <span className="live-tag">
              <span />
              CONTINUE / 继续制作
            </span>
            <ModeBadge mode={current.mode} verbose />
          </div>
          <h2>{current.title}</h2>
          <p>{current.script?.thesis || current.idea || '从课程意图开始建立这节课。'}</p>
          <div className="hero-facts">
            <span>{current.subject}</span>
            <span>{current.grade}</span>
            <span>{totalDuration ? formatDuration(totalDuration) : `${current.durationMinutes}:00`}</span>
            <span>更新于 {formatDate(current.updatedAt)}</span>
          </div>
          <div className="hero-actions">
            <Button
              variant="primary"
              icon={<ArrowRight size={17} />}
              onClick={() => navigate(`/projects/${current.id}`)}
            >
              进入{stageLabel[current.stage]}工作台
            </Button>
            <Link className="text-link on-dark" to={`/projects/${current.id}`}>
              查看生产记录
              <ChevronRight size={14} />
            </Link>
          </div>
        </div>
        <div className="hero-pipeline">
          <span className="hero-pipeline-label">制作流水线</span>
          {stages.map((stage, index) => {
            const Icon = stage.icon;
            const state = index < currentStage ? 'done' : index === currentStage ? 'active' : 'queued';
            return (
              <div key={stage.id} className={`hero-stage is-${state}`}>
                <span className="hero-stage-node">
                  {state === 'done' ? <Check size={14} /> : <Icon size={15} />}
                </span>
                <div>
                  <strong>{stage.label}</strong>
                  <small>
                    {state === 'done' ? '已完成' : state === 'active' ? '进行中' : '等待进入'}
                  </small>
                </div>
                {index < stages.length - 1 && <span className="hero-stage-line" />}
              </div>
            );
          })}
          <div className="hero-progress">
            <span>整门课程进度</span>
            <strong>{current.progress}%</strong>
            <ProgressBar value={current.progress} tone="brick" />
          </div>
        </div>
      </section>

      <section className="metric-strip" aria-label="生产概览">
        <div className="metric-cell">
          <span className="metric-icon">
            <FilePenLine size={16} />
          </span>
          <div>
            <strong>{data.stats.activeProjects}</strong>
            <span>进行中的课程</span>
          </div>
        </div>
        <div className="metric-cell">
          <span className="metric-icon teal">
            <Check size={16} />
          </span>
          <div>
            <strong>{data.stats.confirmedScripts}</strong>
            <span>已确认讲稿</span>
          </div>
        </div>
        <div className="metric-cell">
          <span className="metric-icon gold">
            <Clapperboard size={16} />
          </span>
          <div>
            <strong>{data.stats.renderedCourses}</strong>
            <span>已合成课程</span>
          </div>
        </div>
        <div className="metric-cell">
          <span className="metric-icon ink">
            <TimerReset size={16} />
          </span>
          <div>
            <strong>{data.stats.minutesSaved}</strong>
            <span>本月节省分钟</span>
          </div>
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="dashboard-main">
          <div className="section-heading">
            <div>
              <span className="eyebrow">COURSE QUEUE</span>
              <h2>课程队列</h2>
            </div>
            <Link to="/projects" className="text-link">
              全部课程
              <ArrowRight size={14} />
            </Link>
          </div>

          <div className="course-table" role="table" aria-label="课程队列">
            <div className="course-table-head" role="row">
              <span>课程</span>
              <span>模式</span>
              <span>当前环节</span>
              <span>进度</span>
              <span>最近更新</span>
              <span />
            </div>
            {queued.map((project) => (
              <button
                className="course-row"
                key={project.id}
                role="row"
                onClick={() => navigate(`/projects/${project.id}`)}
              >
                <span className="course-title-cell">
                  <span className={`course-tone tone-${project.coverTone}`} />
                  <span>
                    <strong>{project.title}</strong>
                    <small>
                      {project.subject} · {project.grade}
                    </small>
                  </span>
                </span>
                <span>
                  <ModeBadge mode={project.mode} />
                </span>
                <span className="stage-cell">{stageLabel[project.stage]}</span>
                <span className="progress-cell">
                  <ProgressBar value={project.progress} compact tone={project.coverTone} />
                  <small>{project.progress}%</small>
                </span>
                <span className="muted-cell">{relativeTime(project.updatedAt)}</span>
                <ChevronRight size={16} />
              </button>
            ))}
            {!active.length && (
              <div className="course-table-empty">还没有课程，从下方选择一种方式新建。</div>
            )}
          </div>
          {active.length > QUEUE_PREVIEW_COUNT && (
            <div className="course-table-foot">
              <span>共 {active.length} 门课程</span>
              <button
                type="button"
                className="text-link"
                onClick={() => setQueueExpanded((value) => !value)}
              >
                {queueExpanded ? '收起' : `展开全部（还有 ${hiddenCount} 门）`}
                <ChevronRight size={14} className={queueExpanded ? 'is-flipped' : ''} />
              </button>
            </div>
          )}

          <div className="section-heading launch-heading">
            <div>
              <span className="eyebrow">START A COURSE</span>
              <h2>从哪种方式进入</h2>
            </div>
            <span className="section-aside">同一流水线，不同起点</span>
          </div>
          <div className="launch-grid">
            {launchModes.map((mode) => {
              const Icon = mode.icon;
              return (
                <button
                  key={mode.id}
                  className="launch-item"
                  onClick={() => openCreateProject(mode.id as 'auto' | 'oral' | 'ppt')}
                >
                  <span className={`launch-icon tone-${mode.id}`}>
                    <Icon size={19} />
                  </span>
                  <span className="launch-copy">
                    <strong>{mode.title}</strong>
                    <span>{mode.body}</span>
                    <small>{mode.meta}</small>
                  </span>
                  <ArrowRight size={16} />
                </button>
              );
            })}
          </div>
        </section>

      </div>
    </div>
  );
}
