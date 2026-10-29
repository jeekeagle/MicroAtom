import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Chrome,
  CircleDashed,
  Cpu,
  Database,
  Eye,
  EyeOff,
  Headphones,
  ImagePlus,
  KeyRound,
  LoaderCircle,
  Mic2,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Volume2,
  Wrench
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import type { Capabilities, RuntimeSettings } from '../types';
import { Button, SectionLabel } from '../components/ui';
import { ModelConnectionPanel } from '../components/ModelConnectionPanel';
import { VideoFrameSettings } from '../components/VideoFrameSettings';

const edgeVoiceOptions = [
  ['zh-CN-XiaoxiaoNeural', '晓晓 · 温暖女声'],
  ['zh-CN-XiaoyiNeural', '晓伊 · 清亮女声'],
  ['zh-CN-YunxiNeural', '云希 · 沉稳男声'],
  ['zh-CN-YunjianNeural', '云健 · 叙述男声'],
  ['zh-CN-YunyangNeural', '云扬 · 新闻男声']
];

const mimoVoiceOptions = [
  ['mimo_default', 'MiMo 默认 · 自然课堂'],
  ['冰糖', '冰糖 · 清甜女声'],
  ['茉莉', '茉莉 · 温柔女声'],
  ['苏打', '苏打 · 清爽青年'],
  ['白桦', '白桦 · 沉稳男声'],
  ['Mia', 'Mia · 英文女声'],
  ['Chloe', 'Chloe · 英文女声'],
  ['Milo', 'Milo · 英文男声'],
  ['Dean', 'Dean · 英文男声']
];

const cloneSettings = (settings: RuntimeSettings): RuntimeSettings =>
  JSON.parse(JSON.stringify(settings)) as RuntimeSettings;

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
  const [mimoKey, setMimoKey] = useState('');
  const [showMimoKey, setShowMimoKey] = useState(false);
  const [mimoConfigured, setMimoConfigured] = useState(
    Boolean(data?.capabilities.mimoConfigured)
  );
  const [mimoBusy, setMimoBusy] = useState<'save' | 'clear' | 'test' | ''>('');
  const [mimoResult, setMimoResult] = useState('');
  const [logoError, setLogoError] = useState('');
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (data) setForm(cloneSettings(data.settings));
  }, [data?.settings]);

  useEffect(() => {
    if (data) setMimoConfigured(Boolean(data.capabilities.mimoConfigured));
  }, [data?.capabilities.mimoConfigured]);

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

  const saveMimoKey = async () => {
    if (!mimoKey.trim()) {
      showToast('请先填入 MiMo API Key', 'error');
      return;
    }
    setMimoBusy('save');
    try {
      await api.setMimoApiKey(mimoKey.trim());
      setMimoKey('');
      setMimoConfigured(true);
      setMimoResult('');
      await refresh();
      showToast('MiMo API Key 已保存到本机');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'MiMo Key 保存失败', 'error');
    } finally {
      setMimoBusy('');
    }
  };

  const clearMimoKey = async () => {
    setMimoBusy('clear');
    try {
      await api.clearMimoApiKey();
      setMimoConfigured(false);
      setMimoResult('');
      await refresh();
      showToast('MiMo API Key 已清除', 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'MiMo Key 清除失败', 'error');
    } finally {
      setMimoBusy('');
    }
  };

  const testMimo = async () => {
    setMimoBusy('test');
    setMimoResult('');
    try {
      const result = await api.testMimoSpeech();
      setMimoResult(
        result.ok
          ? `连接正常 · TTS ${result.ttsMs}ms · ASR ${result.asrMs}ms · 识别为「${result.transcript || '（空）'}」`
          : result.message
      );
      showToast(result.ok ? 'MiMo 语音链路正常' : result.message, result.ok ? 'info' : 'error');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'MiMo 测试失败';
      setMimoResult(message);
      showToast(message, 'error');
    } finally {
      setMimoBusy('');
    }
  };

  const setBrand = (patch: Partial<RuntimeSettings['brand']>) => {
    setForm((current) =>
      current ? { ...current, brand: { ...current.brand, ...patch } } : current
    );
  };

  const pickLogo = (file: File | undefined) => {
    setLogoError('');
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setLogoError('请选择 PNG、JPG 或 SVG 图片');
      return;
    }
    if (file.size > 1024 * 1024) {
      setLogoError('图片需小于 1MB，建议先压缩');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (result) setBrand({ logoDataUrl: result });
    };
    reader.onerror = () => setLogoError('图片读取失败，请重试');
    reader.readAsDataURL(file);
  };

  const changeTtsEngine = (engine: RuntimeSettings['ttsEngine']) => {
    setForm((current) => {
      if (!current) return current;
      const pool = engine === 'mimo' ? mimoVoiceOptions : edgeVoiceOptions;
      const voice = pool.some(([id]) => id === current.ttsVoice)
        ? current.ttsVoice
        : engine === 'mimo'
          ? 'mimo_default'
          : 'zh-CN-XiaoxiaoNeural';
      return { ...current, ttsEngine: engine, ttsVoice: voice };
    });
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
                <small>用于讲稿、教学诊断、价值主线与质检，默认跟随当前模型连接。</small>
              </label>
              <label className="field">
                <span>视觉与课件模型</span>
                <input
                  value={form.visualModel}
                  onChange={(event) => set('visualModel', event.target.value)}
                  placeholder="例如：本地分镜引擎"
                />
                <small>用于分镜规划与页面版式生成，留空则跟随当前模型连接。</small>
              </label>
            </div>
            <ModelConnectionPanel
              settings={form}
              onSettings={(next) => setForm(next)}
              notify={showToast}
            />
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
          <>
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
                  onChange={(event) =>
                    changeTtsEngine(event.target.value as RuntimeSettings['ttsEngine'])
                  }
                >
                  <option value="edge">Edge 神经语音</option>
                  <option value="sapi">Windows 本机语音</option>
                  <option value="mimo">MiMo 云端语音</option>
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
                  {(form.ttsEngine === 'mimo' ? mimoVoiceOptions : edgeVoiceOptions).map(
                    ([value, label]) => (
                      <option value={value} key={value}>
                        {label}
                      </option>
                    )
                  )}
                </select>
                <small>
                  {form.ttsEngine === 'mimo'
                    ? '音色由 MiMo 云端生成，支持中英文。'
                    : '本机或 Edge 神经音色。'}
                </small>
              </label>
              <label className="field">
                <span>{form.ttsEngine === 'mimo' ? 'TTS 模型' : '旁白模型'}</span>
                <input
                  value={form.ttsModel}
                  onChange={(event) => set('ttsModel', event.target.value)}
                />
              </label>
            </div>
            {form.ttsEngine === 'mimo' && (
              <div className="settings-form-grid">
                <label className="field">
                  <span>MiMo 风格提示词</span>
                  <textarea
                    rows={2}
                    value={form.mimoStylePrompt}
                    onChange={(event) => set('mimoStylePrompt', event.target.value)}
                    placeholder="例如：温暖、清晰、语速适中的课堂讲解语气"
                  />
                  <small>作为 TTS 的 system 语气描述，不替代讲稿正文。</small>
                </label>
              </div>
            )}
            <div className="settings-form-grid three">
              <label className="field">
                <span>转写 / ASR 引擎</span>
                <select
                  value={form.asrEngine}
                  onChange={(event) =>
                    set('asrEngine', event.target.value as RuntimeSettings['asrEngine'])
                  }
                >
                  <option value="browser">浏览器实时转写</option>
                  <option value="mimo">MiMo 语音识别</option>
                  <option value="none">关闭转写</option>
                </select>
                <small>
                  MiMo 模式按分片上传，适合 Edge 之外的浏览器或需要更高准确率的场景。
                </small>
              </label>
              <label className="field">
                <span>ASR 模型</span>
                <input
                  value={form.asrModel}
                  onChange={(event) => set('asrModel', event.target.value)}
                />
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
          <section className="settings-section">
            <div className="settings-section-head">
              <span className="settings-section-icon teal">
                <Sparkles size={18} />
              </span>
              <div>
                <h2>MiMo 云端语音</h2>
                <p>TTS 与 ASR 共用一把 API Key，保存在本机工作区。</p>
              </div>
              <span
                className={`settings-section-state ${mimoConfigured ? 'is-online' : ''}`}
              >
                <span />
                {mimoConfigured ? '已配置' : '未配置'}
              </span>
            </div>
            <div className="settings-form-grid three">
              <label className="field">
                <span>API Key</span>
                <div className="secret-input">
                  <input
                    type={showMimoKey ? 'text' : 'password'}
                    value={mimoKey}
                    autoComplete="off"
                    placeholder={mimoConfigured ? '已保存，如需更换请重新填写' : 'sk-...'}
                    onChange={(event) => setMimoKey(event.target.value)}
                  />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={showMimoKey ? '隐藏密钥' : '显示密钥'}
                    title={showMimoKey ? '隐藏密钥' : '显示密钥'}
                    onClick={() => setShowMimoKey((value) => !value)}
                  >
                    {showMimoKey ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <small>密钥只写入本机 data/secrets.json，不会回传浏览器或进入课程数据。</small>
              </label>
              <div className="field">
                <span>连接与校验</span>
                <div className="inline-actions">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<KeyRound size={14} />}
                    loading={mimoBusy === 'save'}
                    onClick={() => void saveMimoKey()}
                  >
                    保存 Key
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Sparkles size={14} />}
                    loading={mimoBusy === 'test'}
                    onClick={() => void testMimo()}
                  >
                    测试链路
                  </Button>
                  {mimoConfigured && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 size={14} />}
                      loading={mimoBusy === 'clear'}
                      onClick={() => void clearMimoKey()}
                    >
                      清除
                    </Button>
                  )}
                </div>
                <small className={mimoResult && !mimoResult.includes('正常') ? 'is-error' : ''}>
                  {mimoResult || '测试会合成一句示例语音，再用 ASR 回读校验。'}
                </small>
              </div>
            </div>
          </section>
          </>
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
          <section className="settings-section">
            <div className="settings-section-head">
              <span className="settings-section-icon ink">
                <ImagePlus size={18} />
              </span>
              <div>
                <h2>品牌标识</h2>
                <p>控制侧栏、顶栏与浏览器标题的品牌展示，也可以换成自己的 Logo。</p>
              </div>
              <span
                className={`settings-section-state ${form.brand.visible ? 'is-online' : ''}`}
              >
                <span />
                {form.brand.visible ? '展示中' : '已隐藏'}
              </span>
            </div>
            <div className="settings-inline-options">
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={form.brand.visible}
                  onChange={(event) => setBrand({ visible: event.target.checked })}
                />
                <span className="toggle-ui" />
                <span>
                  <strong>显示品牌</strong>
                  <small>关闭后侧栏品牌区与顶栏品牌名一起隐藏</small>
                </span>
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={form.brand.showMark}
                  onChange={(event) => setBrand({ showMark: event.target.checked })}
                />
                <span className="toggle-ui" />
                <span>
                  <strong>显示标识图形</strong>
                  <small>没有上传图片时显示默认双柱标</small>
                </span>
              </label>
            </div>
            <div className="settings-form-grid">
              <label className="field">
                <span>主标题</span>
                <input
                  value={form.brand.title}
                  maxLength={24}
                  onChange={(event) => setBrand({ title: event.target.value })}
                  placeholder="课序"
                />
                <small>显示在侧栏与顶栏，留空时使用“课序”。</small>
              </label>
              <label className="field">
                <span>副标题</span>
                <input
                  value={form.brand.subtitle}
                  maxLength={40}
                  onChange={(event) => setBrand({ subtitle: event.target.value })}
                  placeholder="COURSE SEQUENCE"
                />
                <small>侧栏品牌下方的小字，留空时使用默认英文名。</small>
              </label>
            </div>
            <div className="brand-logo-editor">
              <div className="brand-logo-preview" data-empty={!form.brand.logoDataUrl}>
                {!form.brand.showMark ? (
                  <small>标识图形已隐藏</small>
                ) : form.brand.logoDataUrl ? (
                  <img src={form.brand.logoDataUrl} alt="品牌 Logo 预览" />
                ) : (
                  <span className="brand-mark" aria-hidden="true">
                    <span />
                    <span />
                  </span>
                )}
              </div>
              <div className="brand-logo-actions">
                <strong>品牌 Logo</strong>
                <small>支持 PNG、JPG、SVG 或 WebP，建议 1:1，大小不超过 1MB。</small>
                <div className="inline-actions">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<ImagePlus size={14} />}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    上传图片
                  </Button>
                  {form.brand.logoDataUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 size={14} />}
                      onClick={() => setBrand({ logoDataUrl: '' })}
                    >
                      移除
                    </Button>
                  )}
                </div>
                {logoError && <small className="is-error">{logoError}</small>}
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  hidden
                  onChange={(event) => {
                    pickLogo(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
              </div>
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
                <strong>
                  {form.ttsEngine === 'edge'
                    ? 'Edge 神经语音'
                    : form.ttsEngine === 'sapi'
                      ? 'Windows 本机'
                      : form.ttsEngine === 'mimo'
                        ? 'MiMo 云端语音'
                        : '关闭'}
                </strong>
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
