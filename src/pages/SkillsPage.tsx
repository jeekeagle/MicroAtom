import { useMemo, useState } from 'react';
import {
  Boxes,
  Check,
  ChevronDown,
  ChevronUp,
  CircleDashed,
  Clock3,
  Code2,
  FlaskConical,
  Gauge,
  LoaderCircle,
  Plus,
  Search,
  Sparkles,
  TerminalSquare
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import type { AgentSkill, TraceStep } from '../types';
import { Button, Modal, SectionLabel } from '../components/ui';

const categories = ['全部', '讲稿', '课件', '声音', '成片', '质检'];

const emptyForm = {
  name: '',
  category: '讲稿',
  description: '',
  model: '教学推理模型',
  inputHint: '任务输入',
  outputHint: '结构化输出'
};

export function SkillsPage() {
  const { data, refresh, showToast } = useApp();
  const [category, setCategory] = useState('全部');
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState('');
  const [running, setRunning] = useState<AgentSkill | null>(null);
  const [runInput, setRunInput] = useState('八年级物理，杠杆原理，8 分钟，突出证据意识。');
  const [runLoading, setRunLoading] = useState(false);
  const [runOutput, setRunOutput] = useState('');
  const [runTrace, setRunTrace] = useState<TraceStep[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState('');

  const skills = data?.skills ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return skills.filter((skill) => {
      const matchesCategory = category === '全部' || skill.category === category;
      const matchesQuery =
        !q ||
        skill.name.toLowerCase().includes(q) ||
        skill.description.toLowerCase().includes(q) ||
        skill.outputHint.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [skills, category, query]);

  if (!data) return null;

  const openRun = (skill: AgentSkill) => {
    setRunning(skill);
    setRunInput('');
    setRunOutput('');
    setRunTrace([]);
  };

  const runSkill = async () => {
    if (!running) return;
    if (!runInput.trim()) {
      showToast('请先填写一段任务输入', 'error');
      return;
    }
    setRunLoading(true);
    try {
      const result = await api.runSkill(running.id, runInput);
      setRunTrace(result.trace);
      setRunOutput(result.output);
      await refresh();
      showToast('Skill 试运行完成');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Skill 试运行失败', 'error');
    } finally {
      setRunLoading(false);
    }
  };

  const toggleSkill = async (skill: AgentSkill) => {
    setTogglingId(skill.id);
    try {
      await api.updateSkill(skill.id, { enabled: !skill.enabled });
      await refresh();
      showToast(skill.enabled ? 'Skill 已停用' : 'Skill 已启用', 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '状态更新失败', 'error');
    } finally {
      setTogglingId('');
    }
  };

  const createSkill = async () => {
    if (!form.name.trim()) {
      showToast('请填写 Skill 名称', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.createSkill(form);
      await refresh();
      setEditorOpen(false);
      setForm(emptyForm);
      showToast('自定义 Skill 已加入技能库');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '创建 Skill 失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const activeRuns = skills.reduce((sum, skill) => sum + skill.runs, 0);
  const averageLatency = skills.length
    ? Math.round(skills.reduce((sum, skill) => sum + skill.latencyMs, 0) / skills.length)
    : 0;

  return (
    <div className="page skills-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">SKILL REGISTRY / 能力登记处</span>
          <h1>Skill 是可组合的生产力</h1>
          <p>
            每一个 Skill 只负责一类转换：讲稿、课件、声音、成片或质检。明确输入输出后，智能体才能可靠串联。
          </p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditorOpen(true)}>
          新建 Skill
        </Button>
      </div>

      <section className="skill-metric-strip">
        <div>
          <span className="skill-stat-icon">
            <Boxes size={17} />
          </span>
          <strong>{skills.length}</strong>
          <small>已登记 Skill</small>
        </div>
        <div>
          <span className="skill-stat-icon teal">
            <Check size={17} />
          </span>
          <strong>{skills.filter((skill) => skill.enabled).length}</strong>
          <small>启用中</small>
        </div>
        <div>
          <span className="skill-stat-icon gold">
            <Gauge size={17} />
          </span>
          <strong>{activeRuns}</strong>
          <small>累计调用</small>
        </div>
        <div>
          <span className="skill-stat-icon ink">
            <Clock3 size={17} />
          </span>
          <strong>{(averageLatency / 1000).toFixed(1)}s</strong>
          <small>平均耗时</small>
        </div>
      </section>

      <div className="skill-toolbar">
        <div className="skill-tabs">
          {categories.map((item) => (
            <button
              key={item}
              className={category === item ? 'is-active' : ''}
              onClick={() => setCategory(item)}
            >
              {item}
              <span>
                {item === '全部' ? skills.length : skills.filter((skill) => skill.category === item).length}
              </span>
            </button>
          ))}
        </div>
        <label className="library-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索名称、输出或用途"
          />
        </label>
      </div>

      <div className="skills-layout">
        <section className="skill-list-panel">
          <div className="skill-list-head">
            <span>能力</span>
            <span>输入 / 输出</span>
            <span>模型</span>
            <span>运行</span>
            <span />
          </div>
          <div className="skill-list">
            {filtered.map((skill) => {
              const expanded = expandedId === skill.id;
              return (
                <div className={`skill-row-wrap ${expanded ? 'is-expanded' : ''}`} key={skill.id}>
                  <div className={`skill-row ${!skill.enabled ? 'is-disabled' : ''}`}>
                    <div className="skill-identity">
                      <span className={`skill-category-mark category-${skill.category}`}>
                        {skill.category.slice(0, 1)}
                      </span>
                      <div>
                        <div className="skill-title-line">
                          <strong>{skill.name}</strong>
                          <span className="skill-version">v{skill.version}</span>
                          {skill.origin === 'custom' && <span className="skill-custom">自定义</span>}
                        </div>
                        <small>{skill.description}</small>
                      </div>
                    </div>
                    <div className="skill-io">
                      <span>{skill.inputHint}</span>
                      <i>→</i>
                      <strong>{skill.outputHint}</strong>
                    </div>
                    <div className="skill-model">
                      <span>{skill.model}</span>
                      <small>{(skill.latencyMs / 1000).toFixed(1)}s</small>
                    </div>
                    <div className="skill-runs">
                      <strong>{skill.runs}</strong>
                      <small>次</small>
                    </div>
                    <div className="skill-row-actions">
                      <button
                        className={`status-switch ${skill.enabled ? 'is-on' : ''}`}
                        onClick={() => void toggleSkill(skill)}
                        disabled={togglingId === skill.id}
                        aria-label={skill.enabled ? '停用 Skill' : '启用 Skill'}
                      >
                        {togglingId === skill.id && <LoaderCircle size={13} className="spin" />}
                      </button>
                      <button
                        className="row-expand"
                        onClick={() => setExpandedId(expanded ? '' : skill.id)}
                        aria-label={expanded ? '收起详情' : '展开详情'}
                      >
                        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>
                  {expanded && (
                    <div className="skill-row-detail">
                      <div>
                        <span className="eyebrow">INPUT CONTRACT</span>
                        <p>{skill.inputHint}</p>
                      </div>
                      <div>
                        <span className="eyebrow">OUTPUT CONTRACT</span>
                        <p>{skill.outputHint}</p>
                      </div>
                      <div>
                        <span className="eyebrow">FAILURE HANDLING</span>
                        <p>超时自动重试一次；仍失败时保留上游输入并阻断后续环节。</p>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<FlaskConical size={14} />}
                        onClick={() => openRun(skill)}
                        disabled={!skill.enabled}
                      >
                        试运行
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
            {!filtered.length && (
              <div className="skill-empty">
                <Search size={22} />
                <h3>没有匹配的 Skill</h3>
                <p>换一个关键词或分类，也可以登记新的能力。</p>
              </div>
            )}
          </div>
        </section>

        <aside className="skill-aside">
          <section className="skill-aside-block">
            <SectionLabel>Skill 约定</SectionLabel>
            <div className="skill-contract-list">
              <div>
                <span>输入</span>
                <p>只接收完成当前转换所必需的结构化上下文。</p>
              </div>
              <div>
                <span>输出</span>
                <p>必须可被下一环节读取，并能定位到课程或页面。</p>
              </div>
              <div>
                <span>失败</span>
                <p>保留完整输入与错误信息，不以空结果继续生产。</p>
              </div>
            </div>
          </section>
          <section className="skill-aside-block skill-catalog-summary">
            <SectionLabel>分类分布</SectionLabel>
            {categories.slice(1).map((item) => {
              const count = skills.filter((skill) => skill.category === item).length;
              return (
                <div className="skill-distribution" key={item}>
                  <span>{item}</span>
                  <div>
                    <span style={{ width: `${(count / Math.max(1, skills.length)) * 100}%` }} />
                  </div>
                  <strong>{count}</strong>
                </div>
              );
            })}
          </section>
          <section className="skill-aside-block skill-run-note">
            <TerminalSquare size={18} />
            <div>
              <strong>试运行是契约测试</strong>
              <p>它验证输入是否足够、输出是否可解析，并产生一条可追踪的运行轨迹。</p>
            </div>
          </section>
        </aside>
      </div>

      <Modal
        open={Boolean(running)}
        onClose={() => {
          if (!runLoading) setRunning(null);
        }}
        title={running ? `试运行 ${running.name}` : 'Skill 试运行'}
        description="只验证这一个 Skill 的输入输出契约，不会修改课程项目。"
        wide
      >
        <div className="run-modal">
          <div className="skill-run-context">
            <span className={`skill-category-mark category-${running?.category ?? '讲稿'}`}>
              {running?.category.slice(0, 1)}
            </span>
            <div>
              <strong>{running?.outputHint}</strong>
              <small>{running?.model} · 通常需要 {((running?.latencyMs ?? 0) / 1000).toFixed(1)} 秒</small>
            </div>
          </div>
          <label className="field">
            <span>输入</span>
            <textarea
              rows={5}
              value={runInput}
              onChange={(event) => setRunInput(event.target.value)}
              placeholder="把当前 Skill 需要的上下文放进来。"
              autoFocus
            />
          </label>
          {runTrace.length > 0 && (
            <div className="run-result">
              <div className="run-result-head">
                <span>
                  <Check size={14} />
                  契约校验
                </span>
                <small>{runTrace.length} 个步骤</small>
              </div>
              <div className="skill-run-trace">
                {runTrace.map((step) => (
                  <div key={step.id}>
                    <span className="trace-node"><Check size={10} /></span>
                    <div>
                      <strong>{step.label}</strong>
                      <small>{step.detail}</small>
                    </div>
                    <em>{step.durationMs}ms</em>
                  </div>
                ))}
              </div>
            </div>
          )}
          {runOutput && (
            <div className="run-output">
              <span className="eyebrow">OUTPUT</span>
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
              onClick={() => void runSkill()}
            >
              运行 Skill
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title="登记新 Skill"
        description="先写清输入与输出契约，再让智能体开始调用。"
        wide
      >
        <div className="modal-form">
          <div className="form-grid two">
            <label className="field">
              <span>名称</span>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="例如：学情风险扫描"
                autoFocus
              />
            </label>
            <label className="field">
              <span>分类</span>
              <select
                value={form.category}
                onChange={(event) =>
                  setForm((current) => ({ ...current, category: event.target.value }))
                }
              >
                {categories.slice(1).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>能力说明</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="它具体完成哪一种转换？"
            />
          </label>
          <label className="field">
            <span>执行模型</span>
            <input
              value={form.model}
              onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
            />
          </label>
          <div className="form-grid two">
            <label className="field">
              <span>输入契约</span>
              <input
                value={form.inputHint}
                onChange={(event) =>
                  setForm((current) => ({ ...current, inputHint: event.target.value }))
                }
                placeholder="例如：讲稿 + 学情 + 时长"
              />
            </label>
            <label className="field">
              <span>输出契约</span>
              <input
                value={form.outputHint}
                onChange={(event) =>
                  setForm((current) => ({ ...current, outputHint: event.target.value }))
                }
                placeholder="例如：风险清单 + 修订建议"
              />
            </label>
          </div>
          <div className="modal-actions">
            <Button variant="ghost" onClick={() => setEditorOpen(false)}>
              取消
            </Button>
            <Button variant="primary" loading={saving} onClick={() => void createSkill()}>
              加入 Skill 库
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
