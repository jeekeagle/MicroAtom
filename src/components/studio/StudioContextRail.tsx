import {
  ArrowUpRight,
  AudioLines,
  Check,
  CircleDashed,
  Clapperboard,
  FilePenLine,
  Layers3,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { formatDuration, stageLabel } from '../../lib/format';
import type { CourseProject, StageKey } from '../../types';

const stageAgent: Record<StageKey, string> = {
  script: 'agent-design',
  slides: 'agent-slides',
  audio: 'agent-voice',
  render: 'agent-edit'
};

const stageAdvice: Record<StageKey, string> = {
  script: '先朗读开头与概念段，确认句子能在一次呼吸内读完。',
  slides: '逐页检查画面是否只承担一个任务，避免把讲稿整段搬进页面。',
  audio: '优先保证口述转写完整，再执行对齐；专有名词请人工校对。',
  render: '渲染前确认所选音轨；首次导出建议保留默认 1080p 参数。'
};

const stageIcon: Record<StageKey, typeof FilePenLine> = {
  script: FilePenLine,
  slides: Layers3,
  audio: AudioLines,
  render: Clapperboard
};

function CheckRow({ done, label, detail }: { done: boolean; label: string; detail: string }) {
  return (
    <div className={`context-check ${done ? 'is-done' : ''}`}>
      <span>{done ? <Check size={12} /> : <CircleDashed size={12} />}</span>
      <div>
        <strong>{label}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

export function StudioContextRail({
  project,
  stage,
  compact = false
}: {
  project: CourseProject;
  stage: StageKey;
  compact?: boolean;
}) {
  const { data } = useApp();
  const agent = data?.agents.find((item) => item.id === stageAgent[stage]);
  const skills = data?.skills.filter((skill) => agent?.skillIds.includes(skill.id)) ?? [];
  const StageIcon = stageIcon[stage];
  const tts = project.recordings.find((asset) => asset.kind === 'tts');
  const teacher = project.recordings.find((asset) => asset.kind !== 'tts');
  const activeRecording = teacher ?? tts;
  const trace = project.trace.length
    ? project.trace.slice(0, 5)
    : [
        {
          id: `context-${stage}`,
          label: `等待${stageLabel[stage]}任务`,
          detail: '操作后会在这里显示智能体执行轨迹。',
          status: 'queued' as const,
          durationMs: 0
        }
      ];

  return (
    <aside className={`studio-context ${compact ? 'is-compact' : ''}`}>
      <section className="context-agent">
        <div className="context-label">
          <span>当前智能体</span>
          <span className="context-live">
            <span />
            READY
          </span>
        </div>
        <div className="context-agent-profile">
          <span className={`context-agent-orb tone-${agent?.color ?? 'brick'}`}>
            {agent?.name.slice(0, 1) ?? '课'}
          </span>
          <div>
            <strong>{agent?.name ?? '课程编排'}</strong>
            <span>{agent?.role ?? '微课生产智能体'}</span>
          </div>
          <StageIcon size={18} />
        </div>
        <p>{agent?.description ?? '负责当前生产环节的智能体协作。'}</p>
        <div className="context-agent-meta">
          <span>{agent?.model ?? '教学推理模型'}</span>
          <span>{data?.settings.reasoningModel ?? '默认模型'}</span>
        </div>
      </section>

      <section className="context-section">
        <div className="context-section-head">
          <span>执行轨迹</span>
          <small>{trace.filter((step) => step.status === 'done').length} 步完成</small>
        </div>
        <div className="trace-list">
          {trace.map((step, index) => (
            <div key={step.id} className={`trace-item is-${step.status}`}>
              <span className="trace-node">
                {step.status === 'done' ? <Check size={10} /> : index + 1}
              </span>
              <div>
                <strong>{step.label}</strong>
                <small>{step.detail}</small>
                {step.durationMs > 0 && <em>{(step.durationMs / 1000).toFixed(1)}s</em>}
              </div>
              {index < trace.length - 1 && <span className="trace-line" />}
            </div>
          ))}
        </div>
      </section>

      <section className="context-section">
        <div className="context-section-head">
          <span>生产检查</span>
          <ShieldCheck size={14} />
        </div>
        <div className="context-check-list">
          <CheckRow
            done={Boolean(project.script)}
            label="结构化讲稿"
            detail={
              project.script
                ? `${project.script.sections.length} 段 · v${project.script.version}`
                : '尚未生成'
            }
          />
          <CheckRow
            done={Boolean(project.script?.confirmed)}
            label="讲稿确认"
            detail={project.script?.confirmed ? '已锁定，可进入后续' : '等待教师确认'}
          />
          <CheckRow
            done={project.slides.length > 0}
            label="视觉课件"
            detail={project.slides.length ? `${project.slides.length} 页 · 16:9` : '尚未生成'}
          />
          <CheckRow
            done={Boolean(activeRecording)}
            label="课程声音"
            detail={
              activeRecording
                ? `${activeRecording.kind === 'tts' ? 'AI 旁白' : '教师录音'} · ${formatDuration(
                    activeRecording.durationSeconds
                  )}`
                : '等待旁白或录音'
            }
          />
          <CheckRow
            done={Boolean(project.render?.downloadReady)}
            label="成片交付"
            detail={project.render?.downloadReady ? 'MP4 已就绪' : '尚未渲染'}
          />
        </div>
      </section>

      <section className="context-advice">
        <span className="context-advice-icon">
          <Sparkles size={16} />
        </span>
        <div>
          <span>本阶段建议</span>
          <p>{stageAdvice[stage]}</p>
        </div>
      </section>

      {skills.length > 0 && (
        <section className="context-section context-skills">
          <div className="context-section-head">
            <span>本轮可用 Skill</span>
            <small>{skills.length}</small>
          </div>
          <div className="context-skill-tags">
            {skills.slice(0, 4).map((skill) => (
              <span key={skill.id}>{skill.name}</span>
            ))}
          </div>
        </section>
      )}

      <Link to="/agents" className="context-agent-link">
        <span>
          <strong>智能体平台</strong>
          <small>查看编排、技能与运行记录</small>
        </span>
        <ArrowUpRight size={16} />
      </Link>
    </aside>
  );
}
