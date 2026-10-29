import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Cpu,
  Eye,
  EyeOff,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Zap
} from 'lucide-react';
import { api } from '../lib/api';
import type { ModelProfile, RuntimeSettings } from '../types';
import { Button } from './ui';

const providerPresets: Array<{
  value: string;
  label: string;
  baseUrl: string;
  protocol: 'chat' | 'responses';
  hint: string;
}> = [
  {
    value: 'openai-compatible',
    label: 'OpenAI 兼容（通用中转）',
    baseUrl: '',
    protocol: 'chat',
    hint: '任何兼容 /v1/chat/completions 的服务'
  },
  {
    value: 'OpenAI',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    protocol: 'chat',
    hint: 'sk- 开头的官方 Key'
  },
  {
    value: 'DeepSeek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    protocol: 'chat',
    hint: '深度求索官方接口'
  },
  {
    value: '智谱 GLM',
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    protocol: 'chat',
    hint: '智谱开放平台'
  },
  {
    value: '通义千问',
    label: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    protocol: 'chat',
    hint: '阿里云百炼'
  },
  {
    value: 'Moonshot',
    label: 'Moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    protocol: 'chat',
    hint: 'Kimi 开放平台'
  },
  {
    value: 'anthropic-compatible',
    label: 'Anthropic 兼容',
    baseUrl: 'https://api.anthropic.com/v1',
    protocol: 'chat',
    hint: 'Claude 兼容网关'
  },
  {
    value: 'Ollama',
    label: 'Ollama 本地',
    baseUrl: 'http://127.0.0.1:11434/v1',
    protocol: 'chat',
    hint: '本机大模型'
  },
  {
    value: 'local-proxy',
    label: '本地代理 / 中转',
    baseUrl: 'http://127.0.0.1:15721/v1',
    protocol: 'chat',
    hint: '本机 CC Switch 等代理'
  }
];

const emptyProfile = (): ModelProfile => ({
  id: '',
  name: '新连接',
  provider: 'openai-compatible',
  baseUrl: '',
  modelName: '',
  protocol: 'chat',
  temperature: 0.6,
  maxTokens: 2200
});

export function ModelConnectionPanel({
  settings,
  onSettings,
  notify
}: {
  settings: RuntimeSettings;
  onSettings: (settings: RuntimeSettings) => void;
  notify: (message: string, tone?: 'success' | 'error' | 'info') => void;
}) {
  const profiles = settings.modelProfiles ?? [];
  const [selectedId, setSelectedId] = useState(
    settings.activeModelId || profiles[0]?.id || ''
  );
  const [draft, setDraft] = useState<ModelProfile | null>(
    profiles.find((item) => item.id === selectedId) ?? profiles[0] ?? null
  );
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [testResult, setTestResult] = useState('');

  useEffect(() => {
    const next = profiles.find((item) => item.id === selectedId) ?? profiles[0] ?? null;
    setDraft(next);
    setModels([]);
    setTestResult('');
  }, [selectedId, settings.modelProfiles]);

  const activeId = settings.activeModelId;

  const applyProfiles = (next: ModelProfile[], activeModelId?: string) => {
    const active = activeModelId ?? settings.activeModelId;
    const activeProfile = next.find((item) => item.id === active);
    onSettings({
      ...settings,
      modelProfiles: next,
      activeModelId: active,
      // The reasoning model follows the active connection unless the teacher
      // typed a different name for the course pipeline.
      reasoningModel:
        activeProfile && settings.reasoningModel === draft?.modelName
          ? activeProfile.modelName
          : settings.reasoningModel
    });
  };

  const patchDraft = (patch: Partial<ModelProfile>) =>
    setDraft((current) => (current ? { ...current, ...patch } : current));

  const save = async () => {
    if (!draft) return;
    if (!draft.baseUrl.trim() || !draft.modelName.trim()) {
      notify('服务地址与模型名称都要填写', 'error');
      return;
    }
    setBusy('save');
    try {
      const isNew = !profiles.some((item) => item.id === draft.id);
      if (isNew) {
        const created = await api.createModelProfile(draft);
        const createdId = created.profiles[created.profiles.length - 1]?.id ?? '';
        setSelectedId(createdId);
        applyProfiles(created.profiles);
        setDraft(created.profiles[created.profiles.length - 1] ?? null);
      } else {
        const updated = await api.updateModelProfile(draft.id, draft);
        applyProfiles(updated.profiles, updated.activeModelId);
        setDraft(updated.profiles.find((item) => item.id === draft.id) ?? null);
      }
      notify('连接已保存');
    } catch (error) {
      notify(error instanceof Error ? error.message : '连接保存失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const activate = async () => {
    if (!draft) return;
    setBusy('activate');
    try {
      const updated = await api.updateModelProfile(draft.id, { active: true });
      applyProfiles(updated.profiles, updated.activeModelId);
      notify('已设为当前使用的模型连接');
    } catch (error) {
      notify(error instanceof Error ? error.message : '切换失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const remove = async () => {
    if (!draft) return;
    if (!window.confirm(`删除连接「${draft.name}」？对应的 API Key 会一起清除。`)) return;
    setBusy('remove');
    try {
      const result = await api.deleteModelProfile(draft.id);
      applyProfiles(result.profiles, result.activeModelId);
      const nextId = result.profiles[0]?.id ?? '';
      setSelectedId(nextId);
      notify('连接已删除');
    } catch (error) {
      notify(error instanceof Error ? error.message : '删除失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const saveKey = async () => {
    if (!draft) return;
    if (!key.trim()) {
      notify('请先填写 API Key', 'error');
      return;
    }
    setBusy('key');
    try {
      const result = await api.setProfileKey(draft.id, key.trim());
      applyProfiles(result.profiles);
      setKey('');
      notify('API Key 已保存到本机');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'API Key 保存失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const clearKey = async () => {
    if (!draft) return;
    setBusy('key');
    try {
      const result = await api.clearProfileKey(draft.id);
      applyProfiles(result.profiles);
      notify('API Key 已清除', 'info');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'API Key 清除失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const test = async () => {
    if (!draft) return;
    setBusy('test');
    setTestResult('');
    try {
      const result = await api.testModelProfile(draft.id);
      setTestResult(
        result.ok
          ? `连接正常 · ${result.provider} · ${result.model} · ${result.latencyMs}ms`
          : result.error || result.message || '连接失败'
      );
      notify(result.ok ? '模型连接正常' : '模型连接失败', result.ok ? 'info' : 'error');
    } catch (error) {
      const message = error instanceof Error ? error.message : '测试失败';
      setTestResult(message);
      notify(message, 'error');
    } finally {
      setBusy('');
    }
  };

  const discover = async () => {
    if (!draft?.baseUrl.trim()) {
      notify('先填写服务地址再探测模型', 'error');
      return;
    }
    setBusy('discover');
    setModels([]);
    try {
      const result = await api.discoverModels({
        baseUrl: draft.baseUrl,
        apiKey: key.trim() || undefined,
        profileId: draft.id || undefined
      });
      if (result.error) {
        notify(`探测失败：${result.error}`, 'error');
        setTestResult(result.error);
      } else {
        setModels(result.models);
        notify(result.models.length ? `服务提供 ${result.models.length} 个模型` : '服务没有返回模型列表');
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : '探测失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const preset = useMemo(
    () => providerPresets.find((item) => item.value === draft?.provider),
    [draft?.provider]
  );

  return (
    <div className="model-panel">
      <div className="model-profile-list">
        <div className="model-profile-list-head">
          <span>模型连接</span>
          <Button
            variant="ghost"
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => {
              const fresh = emptyProfile();
              setSelectedId('');
              setDraft(fresh);
              setModels([]);
              setTestResult('');
            }}
          >
            新建连接
          </Button>
        </div>
        {profiles.map((profile) => (
          <button
            key={profile.id}
            className={`model-profile-item ${profile.id === selectedId ? 'is-active' : ''}`}
            onClick={() => setSelectedId(profile.id)}
          >
            <span className="model-profile-dot">
              {profile.id === activeId ? <Check size={12} /> : <Cpu size={12} />}
            </span>
            <div>
              <strong>{profile.name}</strong>
              <small>
                {profile.provider} · {profile.modelName || '未填模型'}
              </small>
            </div>
            {profile.id === activeId && <em>当前</em>}
          </button>
        ))}
      </div>

      <div className="model-profile-editor">
        {!draft ? (
          <p className="model-empty">左侧选择一个连接，或新建一个连接开始配置。</p>
        ) : (
          <>
            <div className="model-editor-grid">
              <label className="field">
                <span>连接名称</span>
                <input
                  value={draft.name}
                  onChange={(event) => patchDraft({ name: event.target.value })}
                  placeholder="例如：本地代理"
                />
              </label>
              <label className="field">
                <span>服务类型</span>
                <select
                  value={draft.provider}
                  onChange={(event) => {
                    const next = providerPresets.find(
                      (item) => item.value === event.target.value
                    );
                    patchDraft({
                      provider: event.target.value,
                      ...(next && next.baseUrl ? { baseUrl: next.baseUrl } : {}),
                      ...(next ? { protocol: next.protocol } : {})
                    });
                  }}
                >
                  {providerPresets.map((item) => (
                    <option value={item.value} key={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <small>{preset?.hint ?? '任意兼容服务'}</small>
              </label>
              <label className="field">
                <span>服务地址</span>
                <input
                  value={draft.baseUrl}
                  onChange={(event) => patchDraft({ baseUrl: event.target.value })}
                  placeholder="https://api.example.com/v1"
                />
                <small>填到 /v1 为止，系统自动拼接接口路径。</small>
              </label>
              <label className="field">
                <span>模型名称</span>
                <div className="model-model-field">
                  <input
                    value={draft.modelName}
                    onChange={(event) => patchDraft({ modelName: event.target.value })}
                    placeholder="例如：gpt-4o-mini"
                    list="model-name-options"
                  />
                  <datalist id="model-name-options">
                    {models.map((model) => (
                      <option value={model} key={model} />
                    ))}
                  </datalist>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<RefreshCw size={13} />}
                    loading={busy === 'discover'}
                    onClick={() => void discover()}
                  >
                    探测模型
                  </Button>
                </div>
                <small>
                  {models.length
                    ? `服务返回 ${models.length} 个模型，已填入建议列表。`
                    : '不知道模型名？点“探测模型”让服务自己报。'}
                </small>
              </label>
              <label className="field">
                <span>接口协议</span>
                <select
                  value={draft.protocol}
                  onChange={(event) =>
                    patchDraft({ protocol: event.target.value as ModelProfile['protocol'] })
                  }
                >
                  <option value="chat">chat/completions</option>
                  <option value="responses">responses</option>
                </select>
              </label>
              <label className="field">
                <span>温度</span>
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  max={2}
                  value={draft.temperature}
                  onChange={(event) =>
                    patchDraft({ temperature: Number(event.target.value) || 0 })
                  }
                />
              </label>
            </div>

            <div className="model-key-row">
              <label className="field">
                <span>API Key</span>
                <div className="secret-input">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={key}
                    autoComplete="off"
                    placeholder={
                      draft.apiKeyConfigured ? '已保存，如需更换请重新填写' : '粘贴任意厂商的 API Key'
                    }
                    onChange={(event) => setKey(event.target.value)}
                  />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={showKey ? '隐藏密钥' : '显示密钥'}
                    title={showKey ? '隐藏密钥' : '显示密钥'}
                    onClick={() => setShowKey((value) => !value)}
                  >
                    {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <small>
                  {draft.apiKeyConfigured
                    ? '本连接已配置密钥，保存后只写入本机，不回传页面。'
                    : '任何支持 OpenAI 兼容协议的厂商都可以填在这里。'}
                </small>
              </label>
              <div className="model-key-actions">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Save size={14} />}
                  loading={busy === 'key'}
                  onClick={() => void saveKey()}
                >
                  保存 Key
                </Button>
                {draft.apiKeyConfigured && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 size={14} />}
                    loading={busy === 'key'}
                    onClick={() => void clearKey()}
                  >
                    清除
                  </Button>
                )}
              </div>
            </div>

            <div className="model-editor-actions">
              <Button
                variant="secondary"
                size="sm"
                icon={<Save size={14} />}
                loading={busy === 'save'}
                onClick={() => void save()}
              >
                保存连接
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={<Zap size={14} />}
                loading={busy === 'activate'}
                disabled={draft.id === activeId}
                onClick={() => void activate()}
              >
                {draft.id === activeId ? '正在使用' : '设为当前使用'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<Check size={14} />}
                loading={busy === 'test'}
                onClick={() => void test()}
              >
                测试连接
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 size={14} />}
                loading={busy === 'remove'}
                onClick={() => void remove()}
              >
                删除
              </Button>
            </div>
            {testResult && <p className="model-test-result">{testResult}</p>}
          </>
        )}
      </div>
    </div>
  );
}
