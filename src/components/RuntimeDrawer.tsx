import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  AudioLines,
  Check,
  ChevronRight,
  CircleDashed,
  Clapperboard,
  Cpu,
  FilePenLine,
  Layers3,
  ListChecks,
  LoaderCircle,
  Radio,
  ServerCog,
  Sparkles,
  X
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { formatDuration, modeLabel, relativeTime, stageLabel, statusLabel } from '../lib/format';
import {
  currentWorkflowStep,
  isWorkflowStepDone,
  nextWorkflowStep,
  workflowForProject,
  workflowProgress
} from '../lib/workflows';
import type {
  ActivityEvent,
  CourseProject,
  JobStatus,
  StageKey,
  TraceStep
} from '../types';
import { ModeBadge, ProgressBar } from './ui';

type RuntimeTab = 'activity' | 'status' | 'dispatch';
type RuntimeTone = 'live' | 'idle' | 'done' | 'error';

const stageAgent: Record<StageKey, string> = {
  script: 'agent-design',
  slides: 'agent-slides',
  audio: 'agent-voice',
  render: 'agent-edit'
};

const stageIcon: Record<StageKey, typeof FilePenLine> = {
  script: FilePenLine,
  slides: Layers3,
  audio: AudioLines,
  render: Clapperboard
};

const jobStatusLabel: Record<JobStatus, string> = {
  idle: '待命',
  queued: '排队中',
  running: '运行中',
  done: '已完成',
  error: '异常'
};

interface DrawerEvent {
  id: string;
  agent: string;
  action: string;
  detail: string;
  meta: string;
  scope: string;
  status: ActivityEvent['status'];
}

const traceToEvent = (
  trace: TraceStep,
  agentName: string
): DrawerEvent => ({
  id: trace.id,
  agent: agentName,
  action: trace.label,
  detail: trace.detail,
  meta: trace.durationMs > 0 ? `${(trace.durationMs / 1000).toFixed(1)}s` : '刚刚',
  scope: '本项目',
  status: trace.status
});

const activityToEvent = (
  event: ActivityEvent,
  projectTitle?: string
): DrawerEvent => ({
  id: event.id,
  agent: event.agent,
  action: event.action,
  detail: event.target,
  meta: event.time,
  scope: projectTitle && event.target === projectTitle ? '本项目' : '平台',
  status: event.status
});

const tabLabel: Record<RuntimeTab, string> = {
  activity: '智能体',
  status: '运行',
  dispatch: '调度'
};

export function RuntimeDrawer() {
  const { data } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<RuntimeTab>('status');

  const project = useMemo(() => {
    if (!data?.projects.length) return undefined;
    const match = location.pathname.match(/^\/projects\/([^/]+)/);
    if (match) {
      const id = decodeURIComponent(match[1]);
      return data.projects.find((item) => item.id === id);
    }
    return [...data.projects].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )[0];
  }, [data?.projects, location.pathname]);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const workflow = useMemo(
    () => workflowForProject(data?.workflows ?? [], project),
    [data?.workflows, project]
  );
  const currentStep = useMemo(
    () => currentWorkflowStep(workflow, project),
    [workflow, project]
  );
  const nextStep = useMemo(
    () => nextWorkflowStep(workflow, currentStep),
    [workflow, currentStep]
  );
  const progress = workflowProgress(workflow, project);
  const currentStage = currentStep?.stage ?? project?.stage ?? 'script';
  const activeAgent = data?.agents.find((item) => item.id === stageAgent[currentStage]);
  const agentSkills =
    data?.skills.filter((skill) => activeAgent?.skillIds.includes(skill.id)) ?? [];

  const events = useMemo<DrawerEvent[]>(() => {
    const agentName = activeAgent?.name ?? '课程编排';
    const traceEvents = (project?.trace ?? []).slice(0, 5).map((item) =>
      traceToEvent(item, agentName)
    );
    const related = (data?.activity ?? [])
      .filter((item) => project && item.target === project.title)
      .slice(0, 3)
      .map((item) => activityToEvent(item, project?.title));
    const platform = (data?.activity ?? [])
      .filter((item) => !project || item.target !== project.title)
      .slice(0, 4)
      .map((item) => activityToEvent(item, project?.title));
    return [...traceEvents, ...related, ...platform];
  }, [activeAgent?.name, data?.activity, project]);

  const pendingSteps =
    workflow?.steps.filter(
      (step) => step.required && project && !isWorkflowStepDone(step, project)
    ) ?? [];
  const activeAudio =
    project?.recordings.find((item) => item.kind === 'teacher') ??
    project?.recordings.find((item) => item.kind === 'tts');
  const renderStatus = project?.render?.status ?? 'idle';
  const busy =
    renderStatus === 'running' ||
    Boolean(
      data?.activity.some(
        (item) => item.status === 'running' && item.target === project?.title
      )
    );
  const stateTone: RuntimeTone = busy
    ? 'live'
    : renderStatus === 'error'
      ? 'error'
      : project?.status === 'done'
        ? 'done'
        : 'idle';
  const stateLabel = busy
    ? '任务运行中'
    : renderStatus === 'error'
      ? '运行异常'
      : project?.status === 'done'
        ? '已完成'
        : project
          ? '待命，可继续'
          : '系统待命';

  const runtimeRows = [
    {
      label: '教学模型',
      detail:
        data?.settings.modelName ||
        data?.settings.reasoningModel ||
        '等待配置模型',
      value: data?.settings.apiKeyConfigured
        ? '已连接'
        : data?.capabilities.modelConfigured
          ? '本地可用'
          : '待配置',
      tone:
        data?.settings.apiKeyConfigured || data?.capabilities.modelConfigured
          ? 'ok'
          : 'wait',
      icon: Cpu
    },
    {
      label: '语音合成',
      detail: data?.capabilities.tts
        ? `${data.settings.ttsEngine} · ${data.settings.ttsVoice}`
        : '未检测到可用语音引擎',
      value: data?.capabilities.tts ? '可用' : '待配置',
      tone: data?.capabilities.tts ? 'ok' : 'wait',
      icon: AudioLines
    },
    {
      label: '视频渲染',
      detail: data?.capabilities.ffmpeg ? 'FFmpeg 已就绪' : '未检测到 FFmpeg',
      value: data?.capabilities.ffmpeg ? '可用' : '待安装',
      tone: data?.capabilities.ffmpeg ? 'ok' : 'wait',
      icon: Clapperboard
    }
  ] as const;

  const productionChecks = project
    ? [
        {
          label: '讲稿',
          detail: project.script
            ? `v${project.script.version} · ${project.script.sections.length} 段`
            : '尚未生成',
          value: project.script?.confirmed ? '已确认' : project.script ? '待确认' : '未生成',
          done: Boolean(project.script?.confirmed),
          stage: 'script' as StageKey
        },
        {
          label: '课件',
          detail: project.slides.length ? `${project.slides.length} 页 · 16:9` : '尚未生成',
          value: project.slides.length ? '已生成' : '未生成',
          done: project.slides.length > 0,
          stage: 'slides' as StageKey
        },
        {
          label: '声音',
          detail: activeAudio
            ? `${activeAudio.kind === 'tts' ? 'AI 旁白' : '教师录音'} · ${formatDuration(
                activeAudio.durationSeconds
              )}`
            : '尚未录制或合成',
          value: activeAudio ? '已就绪' : '待处理',
          done: Boolean(activeAudio),
          stage: 'audio' as StageKey
        },
        {
          label: '成片',
          detail: project.render?.downloadReady
            ? `${project.render.durationSeconds ? formatDuration(project.render.durationSeconds) : '已完成'} · ${project.render.resolution}`
            : project.render?.stageMessage || '尚未渲染',
          value: project.render?.downloadReady ? '已交付' : jobStatusLabel[renderStatus],
          done: Boolean(project.render?.downloadReady),
          stage: 'render' as StageKey
        }
      ]
    : [];

  const openProject = () => {
    if (project) {
      navigate(`/projects/${project.id}?stage=${currentStep?.stage ?? project.stage}`);
    } else {
      navigate('/projects');
    }
    setOpen(false);
  };

  const openStep = (stage: StageKey) => {
    if (!project) return;
    navigate(`/projects/${project.id}?stage=${stage}`);
    setOpen(false);
  };

  const counts: Record<RuntimeTab, number> = {
    activity: events.length,
    status: productionChecks.filter((item) => !item.done).length,
    dispatch: pendingSteps.length
  };

  return (
    <>
      {!open && (
        <button
          className="runtime-drawer-trigger"
          type="button"
          onClick={() => setOpen(true)}
          aria-label="打开智能体与运行面板"
          aria-expanded="false"
          aria-controls="runtime-drawer"
          title="打开智能体与运行面板"
        >
          <Activity size={16} />
          <span className="runtime-trigger-label">运行面板</span>
          {busy && <span className="runtime-trigger-live" aria-hidden="true" />}
        </button>
      )}

      {open && (
        <>
          <button
            type="button"
            className="runtime-drawer-scrim"
            aria-label="关闭智能体与运行面板"
            onClick={() => setOpen(false)}
          />
          <aside
            id="runtime-drawer"
            className="runtime-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="智能体与运行面板"
          >
            <header className="runtime-drawer-head">
              <div className="runtime-drawer-title">
                <span className="eyebrow">RUNTIME CONTROL</span>
                <h2>智能体与运行</h2>
                <p>{project?.title ?? '当前没有正在制作的课程'}</p>
              </div>
              <button
                type="button"
                className="runtime-drawer-close"
                aria-label="关闭运行面板"
                title="关闭运行面板"
                onClick={() => setOpen(false)}
              >
                <X size={18} />
              </button>
            </header>

            <div className="runtime-drawer-snapshot">
              <span className={`runtime-state is-${stateTone}`}>
                <span />
                {stateLabel}
              </span>
              <span>{workflow?.name ?? '默认工作流'}</span>
              <span>
                {currentStep?.shortLabel ?? '待开始'} · {workflow?.steps.length ?? 0} 个节点
              </span>
            </div>

            <nav className="runtime-drawer-tabs" aria-label="运行面板分类">
              {(Object.keys(tabLabel) as RuntimeTab[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={tab === item ? 'is-active' : ''}
                  aria-selected={tab === item}
                  onClick={() => setTab(item)}
                >
                  {item === 'activity' ? (
                    <Activity size={14} />
                  ) : item === 'status' ? (
                    <ServerCog size={14} />
                  ) : (
                    <ListChecks size={14} />
                  )}
                  <span>{tabLabel[item]}</span>
                  {counts[item] > 0 && <em>{counts[item]}</em>}
                </button>
              ))}
            </nav>

            <div className="runtime-drawer-scroll">
              {tab === 'activity' && (
                <section className="runtime-panel" aria-label="智能体动态">
                  <div className="runtime-agent-card">
                    <span className={`runtime-agent-mark tone-${activeAgent?.color ?? 'brick'}`}>
                      {activeAgent?.name.slice(0, 1) ?? '课'}
                    </span>
                    <div className="runtime-agent-copy">
                      <strong>{activeAgent?.name ?? '课程编排'}</strong>
                      <span>{activeAgent?.role ?? '微课生产智能体'}</span>
                    </div>
                    <span className="runtime-agent-model">
                      {activeAgent?.model ?? data?.settings.reasoningModel ?? '教学模型'}
                    </span>
                  </div>

                  <div className="runtime-section-head">
                    <span>智能体动态</span>
                    <small>{events.length} 条记录</small>
                  </div>
                  <div className="runtime-event-list">
                    {events.length ? (
                      events.map((event) => (
                        <div key={event.id} className={`runtime-event is-${event.status}`}>
                          <span className="runtime-event-node">
                            {event.status === 'done' ? (
                              <Check size={11} />
                            ) : event.status === 'running' ? (
                              <span />
                            ) : (
                              <CircleDashed size={11} />
                            )}
                          </span>
                          <div className="runtime-event-copy">
                            <p>
                              <strong>{event.agent}</strong>
                              <span>{event.action}</span>
                            </p>
                            <small>{event.detail}</small>
                            <em>
                              {event.scope} · {event.meta}
                            </em>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="runtime-empty">
                        <Radio size={18} />
                        <strong>还没有运行记录</strong>
                        <span>课程动作开始后会在这里汇入动态。</span>
                      </div>
                    )}
                  </div>

                  {agentSkills.length > 0 && (
                    <div className="runtime-skill-block">
                      <span>本轮可用 Skill</span>
                      <div>
                        {agentSkills.slice(0, 4).map((skill) => (
                          <em key={skill.id}>{skill.name}</em>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}

              {tab === 'status' && (
                <section className="runtime-panel" aria-label="运行状态">
                  <div className="runtime-section-head">
                    <span>运行环境</span>
                    <small>本机与模型服务</small>
                  </div>
                  <div className="runtime-env-list">
                    {runtimeRows.map((row) => {
                      const Icon = row.icon;
                      return (
                        <div key={row.label} className={`runtime-env-row is-${row.tone}`}>
                          <span className="runtime-env-icon">
                            <Icon size={15} />
                          </span>
                          <div>
                            <strong>{row.label}</strong>
                            <small>{row.detail}</small>
                          </div>
                          <em>{row.value}</em>
                        </div>
                      );
                    })}
                  </div>

                  <div className="runtime-section-head">
                    <span>当前工作流</span>
                    <small>{progress}%</small>
                  </div>
                  <div className="runtime-flow-card">
                    <div className="runtime-flow-head">
                      {project && <ModeBadge mode={project.mode} />}
                      <strong>{workflow?.name ?? '尚未选择工作流'}</strong>
                    </div>
                    <ProgressBar value={progress} compact tone={project?.coverTone ?? 'brick'} />
                    <div className="runtime-flow-steps">
                      <div>
                        <span>当前节点</span>
                        <strong>{currentStep?.label ?? '等待任务'}</strong>
                      </div>
                      <ChevronRight size={14} />
                      <div>
                        <span>下一步</span>
                        <strong>{nextStep?.label ?? '交付完成'}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="runtime-section-head">
                    <span>生产状态</span>
                    <small>{project ? statusLabel[project.status] : '无课程'}</small>
                  </div>
                  <div className="runtime-check-list">
                    {productionChecks.length ? (
                      productionChecks.map((item) => {
                        const Icon = stageIcon[item.stage];
                        return (
                          <button
                            key={item.label}
                            type="button"
                            className={`runtime-check-row ${item.done ? 'is-done' : ''}`}
                            onClick={() => openStep(item.stage)}
                          >
                            <span className="runtime-check-icon">
                              {item.done ? <Check size={12} /> : <Icon size={13} />}
                            </span>
                            <span>
                              <strong>{item.label}</strong>
                              <small>{item.detail}</small>
                            </span>
                            <em>{item.value}</em>
                            <ChevronRight size={13} />
                          </button>
                        );
                      })
                    ) : (
                      <div className="runtime-empty">
                        <FilePenLine size={18} />
                        <strong>暂无课程上下文</strong>
                        <span>打开一门课程后会显示完整生产状态。</span>
                      </div>
                    )}
                  </div>

                  {project?.generation?.script?.engine === 'local-fallback' && (
                    <div className="runtime-notice">
                      <AlertTriangle size={14} />
                      <span>最近一次讲稿由本地规则生成，建议教师复核后再确认。</span>
                    </div>
                  )}
                </section>
              )}

              {tab === 'dispatch' && (
                <section className="runtime-panel" aria-label="调度任务">
                  <div className="runtime-queue-summary">
                    <div>
                      <span>当前任务</span>
                      <strong>{currentStep?.label ?? '暂无调度'}</strong>
                      <small>
                        {currentStep
                          ? stageLabel[currentStep.stage]
                          : project
                            ? stageLabel[project.stage]
                            : '等待新建课程'}
                      </small>
                    </div>
                    <div>
                      <span>下一项</span>
                      <strong>{nextStep?.label ?? '等待交付'}</strong>
                      <small>
                        {nextStep ? stageLabel[nextStep.stage] : '流程末端'}
                      </small>
                    </div>
                  </div>

                  <div className="runtime-section-head">
                    <span>工作流调度</span>
                    <small>{pendingSteps.length} 个必需节点待完成</small>
                  </div>
                  <div className="runtime-step-list">
                    {workflow?.steps.length ? (
                      workflow.steps.map((step, index) => {
                        const done = Boolean(project && isWorkflowStepDone(step, project));
                        const current = step.id === currentStep?.id;
                        return (
                          <button
                            key={step.id}
                            type="button"
                            className={`runtime-step-row ${done ? 'is-done' : ''} ${
                              current ? 'is-current' : ''
                            }`}
                            onClick={() => openStep(step.stage)}
                          >
                            <span className="runtime-step-node">
                              {done ? <Check size={11} /> : index + 1}
                            </span>
                            <span className="runtime-step-copy">
                              <strong>{step.label}</strong>
                              <small>{step.description}</small>
                            </span>
                            <em>
                              {current ? '当前' : done ? '完成' : step.required ? '待执行' : '可选'}
                            </em>
                          </button>
                        );
                      })
                    ) : (
                      <div className="runtime-empty">
                        <ListChecks size={18} />
                        <strong>暂无工作流</strong>
                        <span>选择课程后即可查看调度节点。</span>
                      </div>
                    )}
                  </div>

                  <div className="runtime-section-head">
                    <span>阻塞项</span>
                    <small>{pendingSteps.length ? '需要处理' : '没有阻塞'}</small>
                  </div>
                  <div className="runtime-blocker-list">
                    {pendingSteps.length ? (
                      pendingSteps.slice(0, 5).map((step) => (
                        <button
                          key={step.id}
                          type="button"
                          className="runtime-blocker"
                          onClick={() => openStep(step.stage)}
                        >
                          <AlertTriangle size={14} />
                          <span>
                            <strong>{step.label}</strong>
                            <small>{step.description}</small>
                          </span>
                          <ChevronRight size={13} />
                        </button>
                      ))
                    ) : (
                      <div className="runtime-ready">
                        <Check size={14} />
                        <span>当前必需节点均已完成</span>
                      </div>
                    )}
                  </div>

                  {project?.render && (
                    <>
                      <div className="runtime-section-head">
                        <span>渲染任务</span>
                        <small>{jobStatusLabel[renderStatus]}</small>
                      </div>
                      <div className={`runtime-render-card is-${renderStatus}`}>
                        <div>
                          {renderStatus === 'running' ? (
                            <LoaderCircle size={16} className="spin" />
                          ) : (
                            <Clapperboard size={16} />
                          )}
                          <strong>{project.render.stageMessage || '成片渲染'}</strong>
                          <em>{project.render.progress}%</em>
                        </div>
                        <ProgressBar
                          value={project.render.progress}
                          compact
                          tone={project.coverTone}
                        />
                        <small>
                          {project.render.resolution} · {project.render.format} ·{' '}
                          {relativeTime(project.render.updatedAt)}
                        </small>
                      </div>
                    </>
                  )}
                </section>
              )}
            </div>

            <footer className="runtime-drawer-foot">
              <button type="button" onClick={openProject}>
                <span className="runtime-foot-icon">
                  {project ? <Sparkles size={16} /> : <FilePenLine size={16} />}
                </span>
                <span>
                  <strong>{project ? '打开课程工作台' : '查看课程项目'}</strong>
                  <small>
                    {project
                      ? `${modeLabel[project.mode]} · ${project.progress}%`
                      : '从课程队列进入生产'}
                  </small>
                </span>
                <ArrowUpRight size={15} />
              </button>
            </footer>
          </aside>
        </>
      )}
    </>
  );
}
