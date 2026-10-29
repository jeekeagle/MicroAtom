import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Bot,
  Check,
  CircleDashed,
  Clock3,
  Cpu,
  Edit3,
  FlaskConical,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  Sparkles,
  UsersRound
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import type { AgentProfile, TraceStep } from '../types';
import { Button, Modal, ProgressBar, SectionLabel } from '../components/ui';

const emptyForm = {
  name: '',
  role: '',
  description: '',
  model: '教学推理模型',
  skillIds: [] as string[]
};

const colorFor = (index: number): AgentProfile['color'] =>
  (['brick', 'teal', 'gold', 'ink'] as const)[index % 4];

function TraceList({ trace }: { trace: TraceStep[] }) {
  return (
    <div className="agent-run-trace">
      {trace.map((step, index) => (
        <div className="agent-run-step" key={step.id}>
          <span className="agent-run-node">
            <Check size={11} />
          </span>
          <div>
            <strong>{step.label}</strong>
            <small>{step.detail}</small>
          </div>
          <em>{step.durationMs ? `${(step.durationMs / 1000).toFixed(1)}s` : 'ready'}</em>
          {index < trace.length - 1 && <span className="agent-run-line" />}
        </div>
      ))}
    </div>
  );
}

export function AgentsPage() {
  const { data, refresh, showToast } = useApp();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AgentProfile | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState<AgentProfile | null>(null);
  const [runInput, setRunInput] = useState('用 8 分钟给八年级学生讲清杠杆原理，并突出证据意识。');
  const [runLoading, setRunLoading] = useState(false);
  const [runOutput, setRunOutput] = useState('');
  const [runTrace, setRunTrace] = useState<TraceStep[]>([]);
  const [togglingId, setTogglingId] = useState('');

  const agents = data?.agents ?? [];
  const skills = data?.skills ?? [];
  const activeCount = agents.filter((agent) => agent.status === 'active').length;
  const totalRuns = agents.reduce((sum, agent) => sum + agent.runs, 0);

  const agentSkills = useMemo(
    () =>
      new Map(
        agents.map((agent) => [
          agent.id,
          skills.filter((skill) => agent.skillIds.includes(skill.id))
        ])
      ),
    [agents, skills]
  );

  if (!data) return null;

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setRunOutput('');
    setRunTrace([]);
    setEditorOpen(true);
  };

  const openEdit = (agent: AgentProfile) => {
    setEditing(agent);
    setForm({
      name: agent.name,
      role: agent.role,
      description: agent.description,
      model: agent.model,
      skillIds: [...agent.skillIds]
    });
    setRunOutput('');
    setRunTrace([]);
    setEditorOpen(true);
  };

  const saveAgent = async () => {
    if (!form.name.trim() || !form.role.trim()) {
      showToast('请填写智能体名称和职责', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.updateAgent(editing.id, form);
      } else {
        await api.createAgent({ ...form, color: colorFor(agents.length) });
      }
      await refresh();
      setEditorOpen(false);
      showToast(editing ? '智能体配置已更新' : '智能体已加入编排台');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存智能体失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleAgent = async (agent: AgentProfile) => {
    setTogglingId(agent.id);
    try {
      await api.updateAgent(agent.id, {
        status: agent.status === 'active' ? 'paused' : 'active'
      });
      await refresh();
      showToast(agent.status === 'active' ? '智能体已暂停' : '智能体已启用', 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '状态更新失败', 'error');
    } finally {
      setTogglingId('');
    }
  };

  const startRun = (agent: AgentProfile) => {
    setRunning(agent);
    setRunOutput('');
    setRunTrace([]);
  };

  const runAgent = async () => {
    if (!running) return;
    if (!runInput.trim()) {
      showToast('请先填写一段试运行任务', 'error');
      return;
    }
    setRunLoading(true);
    try {
      const result = await api.runAgent(running.id, runInput);
      setRunTrace(result.trace);
      setRunOutput(result.output);
      await refresh();
      showToast('试运行完成，执行轨迹已写入运行记录');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '智能体试运行失败', 'error');
    } finally {
      setRunLoading(false);
    }
  };

  const toggleSkill = (skillId: string) => {
    setForm((current) => ({
      ...current,
      skillIds: current.skillIds.includes(skillId)
        ? current.skillIds.filter((id) => id !== skillId)
        : [...current.skillIds, skillId]
    }));
  };

  return (
    <div className="page agents-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">AGENT ORCHESTRATION / 智能体平台</span>
          <h1>让每个生产环节有清晰的负责人</h1>
          <p>
            从备课意图到成片交付，智能体按职责串联 Skill；每个动作都留下可追踪的执行轨迹。
          </p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>
          新建智能体
        </Button>
      </div>

      <section className="agent-metrics">
        <div>
          <span className="agent-metric-icon brick">
            <UsersRound size={17} />
          </span>
          <strong>{agents.length}</strong>
          <small>编排中的智能体</small>
        </div>
        <div>
          <span className="agent-metric-icon teal">
            <Play size={17} />
          </span>
          <strong>{activeCount}</strong>
          <small>当前启用</small>
        </div>
        <div>
          <span className="agent-metric-icon gold">
            <Cpu size={17} />
          </span>
          <strong>{totalRuns}</strong>
          <small>累计执行</small>
        </div>
        <div>
          <span className="agent-metric-icon ink">
            <Sparkles size={17} />
          </span>
          <strong>{skills.filter((skill) => skill.enabled).length}</strong>
          <small>可用 Skill</small>
        </div>
      </section>

      <section className="agent-pipeline">
        <div className="section-heading compact">
          <div>
            <span className="eyebrow">PRODUCTION LINE</span>
            <h2>一节微课如何被编排</h2>
          </div>
          <span className="section-aside">从意图到 MP4，不在同一处黑箱完成</span>
        </div>
        <div className="agent-pipeline-track">
          {agents.map((agent, index) => (
            <div className="pipeline-agent" key={agent.id}>
              <span className={`pipeline-orb tone-${agent.color}`}>{agent.name.slice(0, 1)}</span>
              <div>
                <strong>{agent.name}</strong>
                <small>{agent.role}</small>
              </div>
              {index < agents.length - 1 && <ArrowRight size={15} className="pipeline-arrow" />}
            </div>
          ))}
        </div>
      </section>

      <div className="agents-layout">
        <section className="agents-list-panel">
          <SectionLabel aside={<span className="section-aside">{agents.length} 个角色</span>}>
            编排角色
          </SectionLabel>
          <div className="agent-card-list">
            {agents.map((agent) => {
              const linkedSkills = agentSkills.get(agent.id) ?? [];
              const isPaused = agent.status === 'paused';
              return (
                <article className={`agent-card ${isPaused ? 'is-paused' : ''}`} key={agent.id}>
                  <div className="agent-card-head">
                    <span className={`agent-orb tone-${agent.color}`}>{agent.name.slice(0, 1)}</span>
                    <div className="agent-card-title">
                      <div>
                        <h3>{agent.name}</h3>
                        <span className={`agent-state ${isPaused ? 'is-paused' : ''}`}>
                          <span />
                          {isPaused ? 'PAUSED' : 'ACTIVE'}
                        </span>
                      </div>
                      <p>{agent.role}</p>
                    </div>
                    <div className="agent-card-actions">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Edit3 size={14} />}
                        onClick={() => openEdit(agent)}
                      >
                        编辑
                      </Button>
                      <button
                        className={`status-switch ${isPaused ? '' : 'is-on'}`}
                        aria-label={isPaused ? '启用智能体' : '暂停智能体'}
                        onClick={() => void toggleAgent(agent)}
                        disabled={togglingId === agent.id}
                      >
                        {togglingId === agent.id ? <LoaderCircle size={13} className="spin" /> : null}
                      </button>
                    </div>
                  </div>
                  <p className="agent-description">{agent.description}</p>
                  <div className="agent-skill-line">
                    <span className="agent-skill-label">SKILL CHAIN</span>
                    <div>
                      {linkedSkills.length ? (
                        linkedSkills.map((skill) => <span key={skill.id}>{skill.name}</span>)
                      ) : (
                        <em>尚未绑定 Skill</em>
                      )}
                    </div>
                  </div>
                  <div className="agent-card-foot">
                    <span>
                      <Cpu size={13} />
                      {agent.model}
                    </span>
                    <span>
                      <Clock3 size={13} />
                      {agent.lastRun}
                    </span>
                    <span>{agent.runs} 次运行</span>
                    <Button
                      variant="dark"
                      size="sm"
                      icon={<FlaskConical size={14} />}
                      onClick={() => startRun(agent)}
                      disabled={isPaused}
                    >
                      试运行
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="agents-aside">
          <section className="agent-aside-block">
            <SectionLabel aside={<span className="live-inline"><span /> LIVE</span>}>运行原则</SectionLabel>
            <div className="principle-list">
              <div>
                <span>01</span>
                <p>每个智能体只拥有完成当前职责所需的 Skill，减少越权修改。</p>
              </div>
              <div>
                <span>02</span>
                <p>生产动作先产出结构化结果，再由下一环节读取，不直接覆盖上游。</p>
              </div>
              <div>
                <span>03</span>
                <p>所有试运行和真实生产都会记录执行轨迹，便于复核与回退。</p>
              </div>
            </div>
          </section>
          <section className="agent-aside-block agent-capacity">
            <SectionLabel>当前负载</SectionLabel>
            <div className="capacity-row">
              <span>生产队列</span>
              <strong>{data.stats.activeProjects} 门课</strong>
            </div>
            <ProgressBar value={Math.min(100, data.stats.activeProjects * 18)} tone="teal" compact />
            <div className="capacity-row">
              <span>Skill 调用</span>
              <strong>{data.stats.skillRuns} 次</strong>
            </div>
            <div className="capacity-note">
              <CircleDashed size={14} />
              运行模式：本地编排 + 可配置模型服务
            </div>
          </section>
          <section className="agent-aside-block agent-callout">
            <Bot size={19} />
            <div>
              <strong>从 Skill 库开始扩展能力</strong>
              <p>先定义输入、输出和失败处理，再把 Skill 绑定到智能体。</p>
            </div>
          </section>
        </aside>
      </div>

      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? `编辑 ${editing.name}` : '新建智能体'}
        description="智能体的职责边界会决定它可以调用哪些 Skill，以及能修改哪些生产环节。"
        wide
      >
        <div className="modal-form">
          <div className="form-grid two">
            <label className="field">
              <span>智能体名称</span>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="例如：析课"
                autoFocus
              />
            </label>
            <label className="field">
              <span>职责</span>
              <input
                value={form.role}
                onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
                placeholder="例如：教学设计智能体"
              />
            </label>
          </div>
          <label className="field">
            <span>职责说明</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="说明它读取什么、输出什么、不应做什么。"
            />
          </label>
          <label className="field">
            <span>执行模型</span>
            <input
              value={form.model}
              onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
              placeholder="教学推理模型"
            />
          </label>
          <div className="field">
            <span>
              绑定 Skill
              <small>按执行顺序勾选；同一智能体内的 Skill 会串行运行</small>
            </span>
            <div className="skill-check-grid">
              {skills.map((skill) => (
                <label
                  className={`skill-check ${form.skillIds.includes(skill.id) ? 'is-checked' : ''}`}
                  key={skill.id}
                >
                  <input
                    type="checkbox"
                    checked={form.skillIds.includes(skill.id)}
                    onChange={() => toggleSkill(skill.id)}
                  />
                  <span className="skill-check-mark">{form.skillIds.includes(skill.id) && <Check size={11} />}</span>
                  <span>
                    <strong>{skill.name}</strong>
                    <small>{skill.category} · {skill.outputHint}</small>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="modal-actions">
            <Button variant="ghost" onClick={() => setEditorOpen(false)}>
              取消
            </Button>
            <Button variant="primary" loading={saving} onClick={() => void saveAgent()}>
              {editing ? '保存配置' : '加入编排台'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(running)}
        onClose={() => {
          if (!runLoading) setRunning(null);
        }}
        title={running ? `试运行 ${running.name}` : '试运行'}
        description="试运行不会改动课程项目，只验证 Skill 串联、输出结构与运行轨迹。"
        wide
      >
        <div className="run-modal">
          <label className="field">
            <span>输入一段生产任务</span>
            <textarea
              rows={4}
              value={runInput}
              onChange={(event) => setRunInput(event.target.value)}
              placeholder="例如：为八年级学生设计一节 8 分钟的杠杆原理微课。"
            />
          </label>
          <div className="run-modal-meta">
            <span>
              <Cpu size={14} />
              {running?.model}
            </span>
            <span>
              <Sparkles size={14} />
              {running?.skillIds.length ?? 0} 个 Skill 串联
            </span>
          </div>
          {runTrace.length > 0 && (
            <div className="run-result">
              <div className="run-result-head">
                <span>
                  <Check size={14} />
                  执行轨迹
                </span>
                <small>{runTrace.length} 个步骤</small>
              </div>
              <TraceList trace={runTrace} />
            </div>
          )}
          {runOutput && (
            <div className="run-output">
              <span className="eyebrow">STRUCTURED OUTPUT</span>
              <pre>{runOutput}</pre>
            </div>
          )}
          <div className="modal-actions">
            <Button variant="ghost" onClick={() => setRunning(null)} disabled={runLoading}>
              关闭
            </Button>
            <Button
              variant="primary"
              icon={<FlaskConical size={15} />}
              loading={runLoading}
              onClick={() => void runAgent()}
            >
              开始试运行
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
