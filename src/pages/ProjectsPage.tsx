import { useMemo, useState } from 'react';
import {
  ChevronRight,
  FilePenLine,
  Filter,
  Layers3,
  Plus,
  Search,
  SlidersHorizontal
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { formatDate, modeLabel, stageLabel, statusLabel } from '../lib/format';
import type { CourseMode, StageKey } from '../types';
import { Button, ModeBadge, ProgressBar, StatusBadge } from '../components/ui';

const stageNames: Record<StageKey, string> = {
  script: '讲稿工坊',
  slides: '课件工坊',
  audio: '声音与录制',
  render: '成片交付'
};

const stageDescriptions: Record<StageKey, string> = {
  script: '把主题、想法与价值引领收束成可确认的课程讲稿。',
  slides: '让已确认的讲稿驱动分镜与课件页面。',
  audio: '生成旁白、录制教师声音，并完成语音与页面定位。',
  render: '检查音画同步，组装字幕并导出课程成片。'
};

export function ProjectsPage() {
  const { data, openCreateProject } = useApp();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<'all' | CourseMode>('all');
  const navigate = useNavigate();
  if (!data) return null;

  const stage = params.get('stage') as StageKey | null;

  const projects = useMemo(() => {
    return data.projects.filter((project) => {
      const matchesStage = !stage || project.stage === stage;
      const matchesMode = modeFilter === 'all' || project.mode === modeFilter;
      const q = query.trim().toLowerCase();
      const matchesQuery =
        !q ||
        project.title.toLowerCase().includes(q) ||
        project.topic.toLowerCase().includes(q) ||
        project.subject.toLowerCase().includes(q);
      return matchesStage && matchesMode && matchesQuery;
    });
  }, [data.projects, modeFilter, query, stage]);

  return (
    <div className="page projects-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">{stage ? `WORKSHOP / ${stage.toUpperCase()}` : 'COURSE LIBRARY'}</span>
          <h1>{stage ? stageNames[stage] : '课程项目'}</h1>
          <p>{stage ? stageDescriptions[stage] : '集中查看每门课程的制作阶段、模式与待处理环节。'}</p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => openCreateProject()}>
          新建微课
        </Button>
      </div>

      {stage && (
        <div className="workshop-banner">
          <div className="workshop-banner-icon">
            {stage === 'script' ? <FilePenLine size={20} /> : <Layers3 size={20} />}
          </div>
          <div>
            <strong>{projects.length} 门课程停留在{stageNames[stage]}</strong>
            <p>项目进入下一环节后会自动离开当前工坊，生产记录仍保留在课程中。</p>
          </div>
          <button className="text-link" onClick={() => setParams({})}>
            查看全部课程
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      <div className="library-toolbar">
        <div className="library-tabs">
          <button className={modeFilter === 'all' ? 'is-active' : ''} onClick={() => setModeFilter('all')}>
            全部 <span>{data.projects.length}</span>
          </button>
          {(['auto', 'oral', 'ppt'] as CourseMode[]).map((mode) => (
            <button
              key={mode}
              className={modeFilter === mode ? 'is-active' : ''}
              onClick={() => setModeFilter(mode)}
            >
              {modeLabel[mode]}
              <span>{data.projects.filter((project) => project.mode === mode).length}</span>
            </button>
          ))}
        </div>
        <label className="library-search">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索课程" />
        </label>
      </div>

      <div className="library-head">
        <span>课程</span>
        <span>模式</span>
        <span>当前环节</span>
        <span>讲稿状态</span>
        <span>完成度</span>
        <span>更新时间</span>
      </div>

      <div className="library-list">
        {projects.map((project) => (
          <button
            className="library-row"
            key={project.id}
            onClick={() => navigate(`/projects/${project.id}`)}
          >
            <span className="library-course">
              <span className={`library-cover tone-${project.coverTone}`}>
                <span>{project.subject.slice(0, 1)}</span>
              </span>
              <span>
                <strong>{project.title}</strong>
                <small>
                  {project.subject} · {project.grade} · {project.durationMinutes} 分钟
                </small>
              </span>
            </span>
            <span>
              <ModeBadge mode={project.mode} />
            </span>
            <span className="library-stage">
              <StatusBadge status={project.status} />
              <small>{stageLabel[project.stage]}</small>
            </span>
            <span className={project.script?.confirmed ? 'script-confirmed' : 'script-pending'}>
              {project.script?.confirmed ? '已确认' : project.script ? '待确认' : '未生成'}
            </span>
            <span className="library-progress">
              <ProgressBar value={project.progress} compact tone={project.coverTone} />
              <small>{project.progress}%</small>
            </span>
            <span className="library-time">
              {formatDate(project.updatedAt)}
              <ChevronRight size={15} />
            </span>
          </button>
        ))}
        {!projects.length && (
          <div className="library-empty">
            <Filter size={24} />
            <h3>没有符合条件的课程</h3>
            <p>调整筛选条件，或从新项目开始。</p>
            <Button variant="secondary" size="sm" onClick={() => openCreateProject()}>
              新建微课
            </Button>
          </div>
        )}
      </div>

      <div className="library-foot">
        <span>
          <SlidersHorizontal size={14} />
          {projects.length} 门课程
        </span>
        <span>数据存储于本地课程库</span>
      </div>
    </div>
  );
}
