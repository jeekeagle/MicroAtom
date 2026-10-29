import { useMemo, useState } from 'react';
import {
  Cpu,
  LoaderCircle,
  Play,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import type { EngineKind, ProductionEngine, ProductionStage } from '../types';
import { Button, Modal } from '../components/ui';

const STAGES: Array<{ id: ProductionStage; label: string; description: string }> = [
  { id: 'analysis', label: '析课引擎', description: '备课意图解析、学情对齐与教学约束提取' },
  { id: 'script', label: '讲稿引擎', description: '结构化讲稿规划、口语化润色与价值主线' },
  { id: 'slides', label: '课件引擎', description: '文字、结构、文生图提示词与分镜排版' },
  { id: 'audio', label: '声音引擎', description: '神经旁白合成、教师试讲对齐与时间轴' },
  { id: 'render', label: '成片引擎', description: '1080p 画面合成、字幕对齐与视频编码' },
  { id: 'media', label: '介质引擎', description: '知识图谱、认知地图、概念卡等单文件 HTML 介质' }
];

const KINDS: Array<{ id: EngineKind; label: string }> = [
  { id: 'analysis', label: '意图分析' },
  { id: 'text', label: '文字驱动' },
  { id: 'structure', label: '结构分镜' },
  { id: 'image', label: '文生图 / 画面' },
  { id: 'voice', label: '神经语音 / 对齐' },
  { id: 'video', label: '视频组装' },
  { id: 'media', label: '课程介质' }
];

export function EnginesPage() {
  const { data, showToast, refresh } = useApp();
  const [currentStage, setCurrentStage] = useState<ProductionStage>('slides');
  const [query, setQuery] = useState('');
  const [selectedEngineId, setSelectedEngineId] = useState<string>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [running, setRunning] = useState(false);
  const [runInput, setRunInput] = useState('杠杆原理：核心是动力臂与阻力臂平衡，学生容易混淆支点位置。');
  const [runOutput, setRunOutput] = useState('');

  const [formName, setFormName] = useState('');
  const [formStage, setFormStage] = useState<ProductionStage>('slides');
  const [formKind, setFormKind] = useState<EngineKind>('structure');
  const [formDescription, setFormDescription] = useState('');
  const [formAgentId, setFormAgentId] = useState('');
  const [formSkills, setFormSkills] = useState<string[]>([]);
  const [formConfigJson, setFormConfigJson] = useState(
    '{\n  "mode": "model-first",\n  "layoutBias": "structure"\n}'
  );
  const [formMakeDefault, setFormMakeDefault] = useState(false);

  const engines = useMemo(() => data?.engines ?? [], [data?.engines]);

  const stageEngines = useMemo(() => {
    const q = query.trim().toLowerCase();
    return engines.filter((item) => {
      const matchStage = item.stage === currentStage;
      const matchQ =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q);
      return matchStage && matchQ;
    });
  }, [engines, currentStage, query]);

  const selectedEngine = useMemo(() => {
    return engines.find((item) => item.id === selectedEngineId) ?? stageEngines[0] ?? engines[0];
  }, [engines, selectedEngineId, stageEngines]);

  const activeAgent = useMemo(
    () => data?.agents.find((agent) => agent.id === selectedEngine?.agentId),
    [data?.agents, selectedEngine?.agentId]
  );

  const activeSkills = useMemo(() => {
    const ids = selectedEngine?.skillIds ?? [];
    return (data?.skills ?? []).filter((skill) => ids.includes(skill.id));
  }, [data?.skills, selectedEngine?.skillIds]);

  const handleMakeDefault = async (engine: ProductionEngine) => {
    try {
      await api.setDefaultEngine(engine.id);
      await refresh();
      showToast(`已将「${engine.name}」设为当前阶段默认引擎`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '设置默认失败', 'error');
    }
  };

  const handleToggleEnabled = async (engine: ProductionEngine) => {
    try {
      await api.updateEngine(engine.id, { enabled: !engine.enabled });
      await refresh();
      showToast(engine.enabled ? `已停用「${engine.name}」` : `已启用「${engine.name}」`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '操作失败', 'error');
    }
  };

  const handleDelete = async (engine: ProductionEngine) => {
    if (engine.builtIn) {
      showToast('内置引擎不可删除', 'error');
      return;
    }
    if (!window.confirm(`确定删除引擎「${engine.name}」吗？`)) return;
    try {
      await api.deleteEngine(engine.id);
      await refresh();
      showToast('引擎已删除');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除失败', 'error');
    }
  };

  const handleRun = async () => {
    if (!selectedEngine) return;
    setRunning(true);
    setRunOutput('');
    try {
      const result = await api.runEngine(selectedEngine.id, runInput);
      setRunOutput(result.output);
      await refresh();
      showToast(`引擎「${selectedEngine.name}」试运行完成`);
    } catch (error) {
      setRunOutput(error instanceof Error ? error.message : '运行失败');
      showToast(error instanceof Error ? error.message : '运行失败', 'error');
    } finally {
      setRunning(false);
    }
  };

  const handleCreate = async () => {
    if (!formName.trim()) {
      showToast('请填写引擎名称', 'error');
      return;
    }
    let config: Record<string, string | number | boolean> = {};
    if (formConfigJson.trim()) {
      try {
        config = JSON.parse(formConfigJson) as Record<string, string | number | boolean>;
      } catch {
        showToast('配置 JSON 格式不合法', 'error');
        return;
      }
    }
    setCreating(true);
    try {
      const result = await api.createEngine({
        name: formName.trim(),
        stage: formStage,
        kind: formStage === 'media' ? 'media' : formKind,
        description: formDescription.trim(),
        agentId: formAgentId || undefined,
        skillIds: formSkills,
        config,
        makeDefault: formMakeDefault
      });
      await refresh();
      setSelectedEngineId(result.engine.id);
      setCurrentStage(formStage);
      setCreateOpen(false);
      showToast(`引擎「${result.engine.name}」已创建`);
      setFormName('');
      setFormDescription('');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '创建失败', 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="page engines-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">ENGINE WORKSHOP / 解耦架构</span>
          <h1>引擎工坊</h1>
          <p>
            所有生产环节全面解耦：默认引擎驱动基础流程，支持新建文字、结构、文生图等专属引擎，并灵活绑定智能体与 Skill。
          </p>
        </div>
        <div className="page-intro-actions">
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => {
              setFormStage(currentStage);
              setFormKind(currentStage === 'slides' ? 'structure' : currentStage === 'media' ? 'media' : 'text');
              setFormAgentId(data?.agents[0]?.id ?? '');
              setCreateOpen(true);
            }}
          >
            新建引擎
          </Button>
        </div>
      </div>

      <div className="stage-switch-bar">
        {STAGES.map((item) => {
          const count = engines.filter((e) => e.stage === item.id).length;
          const active = currentStage === item.id;
          return (
            <button
              key={item.id}
              className={`stage-switch-tab ${active ? 'is-active' : ''}`}
              onClick={() => {
                setCurrentStage(item.id);
                const stageFirst = engines.find((e) => e.stage === item.id);
                if (stageFirst) setSelectedEngineId(stageFirst.id);
              }}
            >
              <strong>{item.label}</strong>
              <small>{count} 个引擎</small>
            </button>
          );
        })}
      </div>

      <div className="engines-layout">
        <section className="engines-list-pane">
          <div className="engines-search">
            <Search size={15} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`在 ${STAGES.find((s) => s.id === currentStage)?.label} 中搜索...`}
            />
          </div>

          <div className="engines-cards">
            {stageEngines.map((item) => {
              const isSelected = selectedEngine?.id === item.id;
              return (
                <div
                  key={item.id}
                  className={`engine-item-card ${isSelected ? 'is-selected' : ''} ${
                    !item.enabled ? 'is-disabled' : ''
                  }`}
                  onClick={() => setSelectedEngineId(item.id)}
                >
                  <div className="engine-card-top">
                    <div className="engine-card-badges">
                      {item.isDefault && (
                        <span className="engine-default-pill">
                          <Star size={11} fill="currentColor" /> 默认引擎
                        </span>
                      )}
                      <span className="engine-kind-pill">{item.kind}</span>
                    </div>
                    <span className="engine-run-badge">{item.runs} 次运行</span>
                  </div>
                  <h3>{item.name}</h3>
                  <p>{item.description || '内置微课生产管道。'}</p>
                  <div className="engine-card-foot">
                    <span>
                      {item.skillIds.length ? `${item.skillIds.length} 个 Skill` : '内置规则'}
                    </span>
                    <small>{item.lastRun}</small>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {selectedEngine && (
          <section className="engine-detail-pane">
            <div className="engine-detail-head">
              <div>
                <div className="engine-title-badges">
                  <span className="eyebrow">ENGINE / {selectedEngine.stage.toUpperCase()}</span>
                  {selectedEngine.isDefault && (
                    <span className="engine-default-pill">当前阶段默认</span>
                  )}
                  {!selectedEngine.enabled && <span className="badge-paused">已停用</span>}
                </div>
                <h2>{selectedEngine.name}</h2>
                <p>{selectedEngine.description}</p>
              </div>
              <div className="engine-detail-actions">
                {!selectedEngine.isDefault && selectedEngine.enabled && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Star size={14} />}
                    onClick={() => void handleMakeDefault(selectedEngine)}
                  >
                    设为默认
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleToggleEnabled(selectedEngine)}
                >
                  {selectedEngine.enabled ? '停用' : '启用'}
                </Button>
                {!selectedEngine.builtIn && (
                  <Button
                    variant="danger"
                    size="sm"
                    icon={<Trash2 size={14} />}
                    onClick={() => void handleDelete(selectedEngine)}
                  >
                    删除
                  </Button>
                )}
              </div>
            </div>

            <div className="engine-specs-grid">
              <div className="spec-item">
                <span>所属阶段</span>
                <strong>{STAGES.find((s) => s.id === selectedEngine.stage)?.label}</strong>
              </div>
              <div className="spec-item">
                <span>引擎类别</span>
                <strong>{selectedEngine.kind}</strong>
              </div>
              <div className="spec-item">
                <span>绑定智能体</span>
                <strong>{activeAgent ? activeAgent.name : '系统内置'}</strong>
              </div>
              <div className="spec-item">
                <span>累计运行</span>
                <strong>{selectedEngine.runs} 次</strong>
              </div>
            </div>

            <div className="engine-section">
              <div className="section-head">
                <Sparkles size={16} />
                <strong>绑定的 Skill 管道</strong>
              </div>
              {activeSkills.length ? (
                <div className="engine-skills-list">
                  {activeSkills.map((skill) => (
                    <div key={skill.id} className="engine-skill-tag">
                      <span>{skill.name}</span>
                      <small>
                        {skill.category} · {skill.model}
                      </small>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-sub">该引擎目前直接运行内置管道规则，未挂载独立 Skill。</p>
              )}
            </div>

            <div className="engine-section">
              <div className="section-head">
                <Cpu size={16} />
                <strong>引擎运行配置 (Config)</strong>
              </div>
              <pre className="engine-config-code">{JSON.stringify(selectedEngine.config, null, 2)}</pre>
            </div>

            <div className="engine-section">
              <div className="section-head">
                <Play size={16} />
                <strong>引擎试运行测试台</strong>
              </div>
              <div className="engine-runner">
                <label className="field">
                  <span>输入样本</span>
                  <textarea
                    rows={3}
                    value={runInput}
                    onChange={(e) => setRunInput(e.target.value)}
                    placeholder="输入教学主题或待处理段落..."
                  />
                </label>
                <div className="runner-actions">
                  <Button
                    variant="primary"
                    size="sm"
                    icon={running ? <LoaderCircle size={14} className="spin" /> : <Play size={14} />}
                    loading={running}
                    onClick={handleRun}
                  >
                    执行试运行
                  </Button>
                </div>
                {runOutput && (
                  <div className="runner-output-box">
                    <span className="eyebrow">PIPELINE OUTPUT</span>
                    <pre>{runOutput}</pre>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </div>

      <Modal
        open={createOpen}
        title="新建生产引擎"
        description="为特定生产阶段创建可替换引擎，并接入指定智能体与 Skill 链路。"
        onClose={() => setCreateOpen(false)}
        wide
      >
        <div className="form-modal-body">
          <div className="form-grid two">
            <label className="field">
              <span>引擎名称 *</span>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="例如：视觉意象课件引擎"
              />
            </label>
            <label className="field">
              <span>生产阶段 *</span>
              <select
                value={formStage}
                onChange={(e) => setFormStage(e.target.value as ProductionStage)}
              >
                {STAGES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="form-grid two">
            <label className="field">
              <span>引擎类型 *</span>
              <select value={formKind} onChange={(e) => setFormKind(e.target.value as EngineKind)}>
                {KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label} ({k.id})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>绑定智能体</span>
              <select value={formAgentId} onChange={(e) => setFormAgentId(e.target.value)}>
                <option value="">（不绑定特定智能体）</option>
                {data?.agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.role})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span>描述说明</span>
            <textarea
              rows={2}
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="描述此引擎的专长、适用场景或输出特征..."
            />
          </label>

          <div className="field">
            <span>绑定 Skill (多选)</span>
            <div className="skill-picker-grid">
              {data?.skills.map((skill) => {
                const checked = formSkills.includes(skill.id);
                return (
                  <label key={skill.id} className={`skill-picker-item ${checked ? 'is-checked' : ''}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFormSkills([...formSkills, skill.id]);
                        } else {
                          setFormSkills(formSkills.filter((id) => id !== skill.id));
                        }
                      }}
                    />
                    <div>
                      <strong>{skill.name}</strong>
                      <small>{skill.category}</small>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <label className="field">
            <span>引擎参数配置 (JSON)</span>
            <textarea
              rows={3}
              value={formConfigJson}
              onChange={(e) => setFormConfigJson(e.target.value)}
              className="code-font"
            />
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={formMakeDefault}
              onChange={(e) => setFormMakeDefault(e.target.checked)}
            />
            <span>创建后立即设为当前阶段的默认引擎</span>
          </label>

          <div className="modal-actions">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button variant="primary" loading={creating} onClick={handleCreate}>
              创建引擎
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
