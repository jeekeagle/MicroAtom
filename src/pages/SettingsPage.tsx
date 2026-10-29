import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Chrome,
  CircleDashed,
  Cpu,
  Database,
  Headphones,
  LoaderCircle,
  Mic2,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Volume2,
  Wrench
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import type { Capabilities, RuntimeSettings } from '../types';
import { Button, SectionLabel } from '../components/ui';
import { VideoFrameSettings } from '../components/VideoFrameSettings';

const voiceOptions = [
  ['zh-CN-XiaoxiaoNeural', '晓晓 · 温暖女声'],
  ['zh-CN-XiaoyiNeural', '晓伊 · 清亮女声'],
  ['zh-CN-YunxiNeural', '云希 · 沉稳男声'],
  ['zh-CN-YunjianNeural', '云健 · 叙述男声'],
  ['zh-CN-YunyangNeural', '云扬 · 新闻男声']
];

const cloneSettings = (settings: RuntimeSettings): RuntimeSettings => ({ ...settings });

type SettingsTab = 'model' | 'voice' | 'runtime' | 'frame' | 'system';

const settingsTabs: Array<{ id: SettingsTab; label: string; hint: string }> = [
  { id: 'model', label: '模型配置', hint: '推理与视觉模型' },
  { id: 'voice', label: 'TTS / ASR', hint: '旁白与转写' },
  { id: 'runtime', label: '生产环境', hint: '本机能力与录制' },
  { id: 'frame', label: '视频边框', hint: '形状、边框与方案' },
  { id: 'system', label: '系统默认', hint: '重试、兜底与重置' }
];

export function SettingsPage() {
  const { data, refresh, showToast } = useApp();
  const [form, setForm] = useState<RuntimeSettings | null>(() =>
    data ? cloneSettings(data.settings) : null
  );
  const [capabilities, setCapabilities] = useState<Capabilities | null>(data?.capabilities ?? null);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [tab, setTab] = useState<SettingsTab>('model');

  useEffect(() => {
    if (data) setForm(cloneSettings(data.settings));
  }, [data?.settings]);

  const changed = useMemo(() => {
    if (!data || !form) return false;
    return JSON.stringify(form) !== JSON.stringify(data.settings);
  }, [data, form]);

  if (!data || !form) return null;

  const set = <K extends keyof RuntimeSettings>(key: K, value: RuntimeSettings[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  };

  const save = async () => {
    setSaving(true);
    try {
      const next = await api.updateSettings(form);
      setForm(cloneSettings(next));
      await refresh();
      showToast('运行设置已保存');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '设置保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const checkHealth = async () => {
    setChecking(true);
    try {
      const result = await api.health();
      setCapabilities(result.capabilities);
      showToast('环境探测完成');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '环境探测失败', 'error');
    } finally {
      setChecking(false);
    }
  };

  const reset = async () => {
    if (!window.confirm('重置会恢复初始课程、智能体和 Skill 配置，并删除当前课程库中的修改。确定继续吗？')) {
      return;
    }
    setResetting(true);
    try {
      await api.resetSystem();
      await refresh();
      showToast('系统已恢复到初始状态', 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '系统重置失败', 'error');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="page settings-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">RUNTIME SETTINGS / 运行设置</span>
          <h1>把生产环境说清楚</h1>
          <p>模型、语音、存储与重试策略会直接影响课程生成的稳定性。设置保存在本地工作区。</p>
        </div>
      </div>

      <nav className="settings-tabs" role="tablist" aria-label="运行设置分类">
        {settingsTabs.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'is-active' : ''}
            onClick={() => setTab(item.id)}
          >
            <strong>{item.label}</strong>
            <small>{item.hint}</small>
          </button>
        ))}
      </nav>

      <div className="settings-layout">
        <div className="settings-main">
          {tab === 'model' && (
          <section className="settings-section">
            <div className="settings-section-head">
              <span className="settings-section-icon">
                <Cpu size={18} />
              </span>
              <div>
                <h2>智能体模型</h2>
                <p>教学推理与视觉分镜使用独立的模型配置，可分别替换。</p>
              </div>
              <span className="settings-section-state">
                <span />
                本地配置
              </span>
            </div>
            <div className="settings-form-grid">
              <label className="field">
                <span>教学推理模型</span>
                <input
                  value={form.reasoningModel}
                  onChange={(event) => set('reasoningModel', event.target.value)}
                  placeholder="模型名称或服务标识"
                />
                <small>用于讲稿、教学诊断、价值主线与质检。</small>
              </label>
              <label className="field">
                <span>视觉与课件模型</span>
                <input
                  value={form.visualModel}
                  onChange={(event) => set('visualModel', event.target.value)}
                  placeholder="例如：本地分镜引擎"
                />
                <small>用于分镜规划与页面版式生成。</small>
              </label>
            </div>
            <div className="settings-form-grid">
              <label className="field">
                <span>模型名称</span>
                <input
                  value={form.modelName}
                  onChange={(event) => set('modelName', event.target.value)}
                  placeholder="例如：deepseek-v4.1-flash"
                />
                <small>模型服务实际提供的模型标识。</small>
              </label>
              <label className="field">
                <span>模型服务地址</span>
                <input
                  value={form.modelBaseUrl}
                  onChange={(event) => set('modelBaseUrl', event.target.value)}
                  placeholder="http://127.0.0.1:15721/v1"
                />
                <small>OpenAI 兼容接口地址，换电脑后需要重填。</small>
              </label>
              <label className="field">
                <span>接口协议</span>
                <select
                  value={form.modelProtocol}
                  onChange={(event) =>
                    set('modelProtocol', event.target.value as RuntimeSettings['modelProtocol'])
                  }
                >
                  <option value="chat">chat/completions</option>
                  <option value="responses">responses</option>
                </select>
              </label>
            </div>
            <div className="settings-form-grid">
              <label className="field">
                <span>API Base</span>
                <input
                  value={form.apiBase}
                  onChange={(event) => set('apiBase', event.target.value)}
                  placeholder="http://127.0.0.1:8787/api"
                />
                <small>系统自身接口地址，供 CLI 与 Agent 调用。</small>
              </label>
            </div>
          </section>
          )}

          {tab === 'voice' && (
          <section className="settings-section">
            <div className="settings-section-head">
              <span className="settings-section-icon teal">
                <Headphones size={18} />
              </span>
              <div>
                <h2>声音与转写</h2>
                <p>旁白合成与教师口述转写是两套不同的能力，分别配置。</p>
              </div>
              <span className={`settings-section-state ${capabilities?.tts ? 'is-online' : ''}`}>
                <span />
                {capabilities?.tts ? 'TTS 可用' : '待配置'}
              </span>
            </div>
            <div className="settings-form-grid three">
              <label className="field">
                <span>TTS 引擎</span>
                <select
                  value={form.ttsEngine}
                  onChange={(event) => set('ttsEngine', event.target.value as RuntimeSettings['ttsEngine'])}
                >
                  <option value="edge">Edge 神经语音</option>
                  <option value="sapi">Windows 本机语音</option>
                  <option value="none">关闭</option>
                </select>
                <small>Edge 不可用时，媒体流程会尝试回退本机语音。</small>
              </label>
              <label className="field">
                <span>旁白音色</span>
                <select
                  value={form.ttsVoice}
                  onChange={(event) => set('ttsVoice', event.target.value)}
                >
                  {voiceOptions.map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>旁白模型</span>
                <input
                  value={form.ttsModel}
                  onChange={(event) => set('ttsModel', event.target.value)}
                />
              </label>
            </div>
            <div className="settings-form-grid">
              <label className="field">
                <span>转写 / ASR</span>
                <input
                  value={form.asrModel}
                  onChange={(event) => set('asrModel', event.target.value)}
                />
                <small>浏览器实时转写或外部 ASR 服务。</small>
              </label>
              <div className="range-field">
                <div>
                  <span>旁白语速</span>
                  <strong>{form.ttsRate > 0 ? '+' : ''}{form.ttsRate}%</strong>
                </div>
                <input
                  type="range"
                  min={-30}
                  max={30}
                  step={5}
                  value={form.ttsRate}
                  onChange={(event) => set('ttsRate', Number(event.target.value))}
                />
                <div className="range-scale">
                  <span>更慢</span>
                  <span>常态</span>
                  <span>更快</span>
                </div>
              </div>
            </div>
          </section>
          )}

          {tab === 'runtime' && (
          <section className="settings-section">
            <div className="settings-section-head">
              <span className="settings-section-icon gold">
                <Wrench size={18} />
              </span>
              <div>
                <h2>生产环境</h2>
                <p>这些能力由本机运行时提供，失败时会在课程工作台明确提示。</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                icon={<RefreshCw size={14} />}
                loading={checking}
                onClick={() => void checkHealth()}
              >
                重新探测
              </Button>
            </div>
            <div className="capability-grid">
              <div className={`capability-item ${capabilities?.tts ? 'is-ready' : ''}`}>
                <span className="capability-icon">
                  <Volume2 size={17} />
                </span>
                <div>
                  <strong>语音合成</strong>
                  <small>{capabilities?.tts ? 'Edge / 本机回退' : '不可用'}</small>
                </div>
                {capabilities?.tts ? <Check size={15} /> : <AlertTriangle size={15} />}
              </div>
              <div className={`capability-item ${capabilities?.ffmpeg ? 'is-ready' : ''}`}>
                <span className="capability-icon">
                  <SlidersHorizontal size={17} />
                </span>
                <div>
                  <strong>FFmpeg</strong>
                  <small>{capabilities?.ffmpeg ? '1080p 编码可用' : '未找到编码器'}</small>
                </div>
                {capabilities?.ffmpeg ? <Check size={15} /> : <AlertTriangle size={15} />}
              </div>
              <div className={`capability-item ${capabilities?.chrome ? 'is-ready' : ''}`}>
                <span className="capability-icon">
                  <Chrome size={17} />
                </span>
                <div>
                  <strong>课件画面</strong>
                  <small>{capabilities?.chrome ? 'Headless Chrome 可用' : '未找到浏览器'}</small>
                </div>
                {capabilities?.chrome ? <Check size={15} /> : <AlertTriangle size={15} />}
              </div>
              <div className={`capability-item ${capabilities?.browserAsr ? 'is-ready' : ''}`}>
                <span className="capability-icon">
                  <Mic2 size={17} />
                </span>
                <div>
                  <strong>教师转写</strong>
                  <small>{capabilities?.browserAsr ? '浏览器转写可用' : '请手动提供转写'}</small>
                </div>
                {capabilities?.browserAsr ? <Check size={15} /> : <CircleDashed size={15} />}
              </div>
            </div>
            <div className="settings-inline-options">
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={form.recordTeacherVideo}
                  onChange={(event) => set('recordTeacherVideo', event.target.checked)}
                />
                <span className="toggle-ui" />
                <span>
                  <strong>试讲时录制教师画面</strong>
                  <small>
                    同步采集摄像头画面，与讲稿、翻页时刻一起保存，合成成片时叠在课件右下角
                  </small>
                </span>
              </label>
            </div>
            <div className="storage-line">
              <Database size={15} />
              <span>课程与媒体保存在本地工作区</span>
              <code>{capabilities?.mediaRoot ?? '/media'}</code>
            </div>
          </section>
          )}

          {tab === 'frame' && (
          <section className="settings-section">
            <div className="settings-section-head">
              <span className="settings-section-icon teal">
                <SlidersHorizontal size={18} />
              </span>
              <div>
                <h2>视频边框方案</h2>
                <p>配置教师画面的形状、边框与位置，可保存多套方案并指定默认。</p>
              </div>
            </div>
            <VideoFrameSettings
              value={form.videoFrame}
              onChange={(next) => set('videoFrame', next)}
            />
          </section>
          )}

          {tab === 'system' && (
          <section className="settings-section">
            <div className="settings-section-head">
              <span className="settings-section-icon ink">
                <SlidersHorizontal size={18} />
              </span>
              <div>
                <h2>系统默认</h2>
                <p>重试、兜底与可追溯性等全局行为，默认影响所有课程。</p>
              </div>
            </div>
            <div className="settings-inline-options">
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={form.autoRetry}
                  onChange={(event) => set('autoRetry', event.target.checked)}
                />
                <span className="toggle-ui" />
                <span>
                  <strong>自动重试</strong>
                  <small>模型调用短暂失败时重试一次</small>
                </span>
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={form.saveTrace}
                  onChange={(event) => set('saveTrace', event.target.checked)}
                />
                <span className="toggle-ui" />
                <span>
                  <strong>保存执行轨迹</strong>
                  <small>保留每次智能体运行的可追踪记录</small>
                </span>
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={form.allowLocalFallback}
                  onChange={(event) => set('allowLocalFallback', event.target.checked)}
                />
                <span className="toggle-ui" />
                <span>
                  <strong>允许本地兜底</strong>
                  <small>模型不可用时用本地模板生成讲稿与课件</small>
                </span>
              </label>
            </div>
          </section>
          )}

          {tab === 'system' && (
          <section className="settings-section settings-danger">
            <div className="settings-section-head">
              <span className="settings-section-icon danger">
                <RotateCcw size={18} />
              </span>
              <div>
                <h2>重置演示数据</h2>
                <p>恢复三门前置课程、默认智能体与 Skill 清单。已生成的真实媒体文件不会自动删除。</p>
              </div>
              <Button
                variant="danger"
                size="sm"
                icon={<RotateCcw size={14} />}
                loading={resetting}
                onClick={() => void reset()}
              >
                重置系统
              </Button>
            </div>
          </section>
          )}
        </div>

        <aside className="settings-aside">
          <section className="settings-summary">
            <span className="eyebrow">CONFIG SNAPSHOT</span>
            <h3>当前运行画像</h3>
            <div className="settings-summary-list">
              <div>
                <span>推理模型</span>
                <strong>{form.reasoningModel}</strong>
              </div>
              <div>
                <span>视觉模型</span>
                <strong>{form.visualModel}</strong>
              </div>
              <div>
                <span>TTS</span>
                <strong>{form.ttsEngine === 'edge' ? 'Edge 神经语音' : form.ttsEngine === 'sapi' ? 'Windows 本机' : '关闭'}</strong>
              </div>
              <div>
                <span>工作目录</span>
                <strong className="mono">{form.apiBase}</strong>
              </div>
            </div>
            {changed ? (
              <div className="settings-unsaved">
                <span />
                有未保存的更改
              </div>
            ) : (
              <div className="settings-saved">
                <Check size={14} />
                配置已同步
              </div>
            )}
          </section>
          <section className="settings-aside-note">
            <ShieldCheck size={18} />
            <div>
              <strong>模型密钥不写入课程数据</strong>
              <p>如在外部服务上运行，请通过环境变量注入密钥；课程库只保存运行配置标识。</p>
            </div>
          </section>
          <section className="settings-aside-note muted">
            <Cpu size={18} />
            <div>
              <strong>模型替换策略</strong>
              <p>替换推理模型后，建议先用 Skill 库试运行讲稿规划，再进入真实课程生产。</p>
            </div>
          </section>
          <button className="settings-doc-link">
            <span>
              <strong>查看运行说明</strong>
              <small>本地媒体与智能体调用链</small>
            </span>
            <ChevronRight size={15} />
          </button>
        </aside>
      </div>

      <div className="settings-footer">
        <span className="settings-footer-state">
          {changed ? (
            <>
              <span className="is-dot" />
              有未保存的更改
            </>
          ) : (
            <>
              <Check size={14} />
              配置已同步
            </>
          )}
        </span>
        <Button
          variant="primary"
          icon={<Save size={16} />}
          loading={saving}
          disabled={!changed}
          onClick={() => void save()}
        >
          {changed ? '保存更改' : '已保存'}
        </Button>
      </div>
    </div>
  );
}
