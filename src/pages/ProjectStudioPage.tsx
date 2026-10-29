import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Check,
  Clapperboard,
  FilePenLine,
  Layers3,
  LoaderCircle,
  MoreHorizontal,
  Trash2
} from 'lucide-react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import { formatDate, formatDuration, modeLabel, stageLabel, statusLabel } from '../lib/format';
import type { CourseProject, StageKey } from '../types';
import { ModeBadge, ProgressBar, StatusBadge } from '../components/ui';
import { AudioStage } from '../components/studio/AudioStage';
import { RenderStage } from '../components/studio/RenderStage';
import { ScriptStage } from '../components/studio/ScriptStage';
import { SlidesStage } from '../components/studio/SlidesStage';

const stages: Array<{ id: StageKey; label: string; short: string; icon: typeof FilePenLine }> = [
  { id: 'script', label: '讲稿工坊', short: '讲稿', icon: FilePenLine },
  { id: 'slides', label: '课件工坊', short: '课件', icon: Layers3 },
  { id: 'audio', label: '声音与录制', short: '声音', icon: AudioLines },
  { id: 'render', label: '成片交付', short: '成片', icon: Clapperboard }
];

const stageIndex = (stage: StageKey) => stages.findIndex((item) => item.id === stage);

const isStageUnlocked = (project: CourseProject, stage: StageKey) => {
  if (stage === 'script') return true;
  if (stage === 'slides') return Boolean(project.script?.confirmed);
  if (stage === 'audio') return Boolean(project.script?.confirmed);
  return Boolean(project.slides.length && project.script?.confirmed);
};

export function ProjectStudioPage() {
  const { projectId = '' } = useParams();
  const { data, setData, showToast } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const queryStage = params.get('stage') as StageKey | null;
  const initialProject = data?.projects.find((item) => item.id === projectId);
  const [project, setProject] = useState<CourseProject | null>(initialProject ?? null);
  const [loading, setLoading] = useState(!initialProject);
  const [notFound, setNotFound] = useState(false);
  const [stage, setStage] = useState<StageKey>(
    queryStage && stages.some((item) => item.id === queryStage)
      ? queryStage
      : (initialProject?.stage ?? 'script')
  );

  const updateProject = useCallback(
    (next: CourseProject) => {
      setProject(next);
      if (data) {
        setData({
          ...data,
          projects: data.projects.map((item) => (item.id === next.id ? next : item))
        });
      }
    },
    [data, setData]
  );

  const notify = useCallback(
    (message: string, tone: 'success' | 'error' | 'info' = 'success') => {
      showToast(message, tone);
    },
    [showToast]
  );

  useEffect(() => {
    let live = true;
    setLoading(!project);
    void api
      .project(projectId)
      .then((next) => {
        if (!live) return;
        setProject(next);
        setNotFound(false);
        if (!queryStage) setStage(next.stage);
      })
      .catch(() => {
        if (!live) return;
        if (!initialProject) setNotFound(true);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
    // The project id is the identity of this workspace. Local edits are kept in state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!project) return;
    if (queryStage && stages.some((item) => item.id === queryStage)) {
      setStage(queryStage);
      return;
    }
    if (!queryStage) setStage(project.stage);
  }, [project?.stage, queryStage]);

  const changeStage = useCallback(
    (next: StageKey) => {
      setStage(next);
      setParams({ stage: next }, { replace: true });
    },
    [setParams]
  );

  const handleDelete = async () => {
    if (!project) return;
    if (!window.confirm(`确定删除《${project.title}》吗？课程素材与成片记录会一并移除。`)) return;
    try {
      await api.deleteProject(project.id);
      if (data) {
        setData({
          ...data,
          projects: data.projects.filter((item) => item.id !== project.id)
        });
      }
      showToast('课程项目已删除');
      navigate('/projects');
    } catch (error) {
      notify(error instanceof Error ? error.message : '删除失败', 'error');
    }
  };

  const stageProgress = useMemo(() => {
    if (!project) return 0;
    const current = stageIndex(stage);
    return Math.round(((current + (project.progress >= 90 ? 1 : project.progress / 100)) / stages.length) * 100);
  }, [project, stage]);

  if (loading && !project) {
    return (
      <div className="studio-loading">
        <LoaderCircle className="spin" size={22} />
        <span>正在打开课程工作台</span>
      </div>
    );
  }

  if (notFound || !project) {
    return (
      <div className="studio-not-found">
        <span className="eyebrow">COURSE NOT FOUND</span>
        <h1>这门课程不在当前课程库中</h1>
        <p>它可能已被删除，或当前浏览器打开的是旧链接。</p>
        <Link to="/projects" className="button button-primary button-md">
          <ArrowLeft size={16} />
          返回课程项目
        </Link>
      </div>
    );
  }

  const currentStageIndex = stageIndex(stage);

  return (
    <div className="studio-page">
      <div className="studio-project-head">
        <button className="back-link" onClick={() => navigate('/projects')}>
          <ArrowLeft size={15} />
          课程项目
        </button>
        <div className="studio-project-identity">
          <span className={`project-emblem tone-${project.coverTone}`}>
            {project.subject.slice(0, 1)}
          </span>
          <div className="studio-project-copy">
            <div className="studio-title-line">
              <h1>{project.title}</h1>
              <StatusBadge status={project.status} />
            </div>
            <p>
              {project.subject} · {project.grade} · {project.durationMinutes} 分钟 · 更新于{' '}
              {formatDate(project.updatedAt)}
            </p>
          </div>
        </div>
        <div className="studio-project-side">
          <ModeBadge mode={project.mode} verbose />
          <div className="studio-progress">
            <span>整体进度</span>
            <strong>{project.progress}%</strong>
            <ProgressBar value={project.progress} compact tone={project.coverTone} />
          </div>
          <button className="icon-button" title="更多课程操作" aria-label="更多课程操作">
            <MoreHorizontal size={18} />
          </button>
          <button
            className="icon-button danger-hover"
            title="删除课程"
            aria-label="删除课程"
            onClick={() => void handleDelete()}
          >
            <Trash2 size={17} />
          </button>
        </div>
      </div>

      <nav className="studio-stage-nav" aria-label="课程生产阶段">
        {stages.map((item, index) => {
          const Icon = item.icon;
          const unlocked = isStageUnlocked(project, item.id);
          const done =
            (item.id === 'script' && project.script?.confirmed) ||
            (item.id === 'slides' && project.slides.length > 0 && currentStageIndex > index) ||
            (item.id === 'audio' && project.recordings.length > 0 && currentStageIndex > index) ||
            (item.id === 'render' && Boolean(project.render?.downloadReady));
          return (
            <button
              key={item.id}
              className={`studio-stage-step ${stage === item.id ? 'is-active' : ''} ${
                done ? 'is-done' : ''
              } ${!unlocked ? 'is-locked' : ''}`}
              onClick={() => {
                if (!unlocked) {
                  notify(
                    item.id === 'slides'
                      ? '请先确认讲稿，再打开课件工坊'
                      : '请先完成前置环节',
                    'info'
                  );
                  return;
                }
                changeStage(item.id);
              }}
            >
              <span className="stage-step-node">
                {done ? <Check size={14} /> : <Icon size={15} />}
              </span>
              <span>
                <strong>{item.short}</strong>
                <small>{done ? '已完成' : stage === item.id ? '当前环节' : unlocked ? '待处理' : '未解锁'}</small>
              </span>
              {index < stages.length - 1 && <span className="stage-step-line" />}
            </button>
          );
        })}
      </nav>

      <div className="studio-layout">
        <div className="studio-main">
          {stage === 'script' && (
            <ScriptStage
              project={project}
              onProject={updateProject}
              notify={notify}
              onStage={changeStage}
            />
          )}
          {stage === 'slides' && (
            <SlidesStage
              project={project}
              onProject={updateProject}
              notify={notify}
              onStage={changeStage}
            />
          )}
          {stage === 'audio' && (
            <AudioStage
              project={project}
              onProject={updateProject}
              notify={notify}
              onStage={changeStage}
            />
          )}
          {stage === 'render' && (
            <RenderStage
              project={project}
              onProject={updateProject}
              notify={notify}
              onStage={changeStage}
            />
          )}
          <div className="studio-stage-foot">
            <span>当前阶段：{stageLabel[stage]}</span>
            <span>阶段推进 {stageProgress}%</span>
            <ArrowRight size={13} />
          </div>
        </div>

      </div>
    </div>
  );
}
