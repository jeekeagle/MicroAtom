import fs from 'node:fs';
import type { ModelProfile, ModelProtocol, RuntimeSettings } from '../src/types';
import { dataDir, secretsPath } from './paths';

export interface SecretsFile {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  protocol?: string;
  mimoApiKey?: string;
  profileKeys?: Record<string, string>;
}

export interface ModelConfig {
  baseUrl: string;
  model: string;
  protocol: ModelProtocol;
  apiKey: string;
  timeoutMs: number;
  maxRetries: number;
  autoRetry: boolean;
  provider: string;
}

export interface ModelResponse {
  text: string;
  model: string;
  provider: string;
  durationMs: number;
  usage?: Record<string, unknown>;
}

export class ModelError extends Error {
  status?: number;
  code: string;

  constructor(message: string, code = 'MODEL_ERROR', status?: number) {
    super(message);
    this.name = 'ModelError';
    this.code = code;
    this.status = status;
  }
}

export const readSecrets = (): SecretsFile => {
  try {
    if (!fs.existsSync(secretsPath)) return {};
    const parsed = JSON.parse(fs.readFileSync(secretsPath, 'utf8')) as SecretsFile;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const writeSecrets = (next: SecretsFile) => {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(secretsPath, JSON.stringify(next, null, 2), 'utf8');
};

export const setModelApiKey = (apiKey: string) => {
  const trimmed = apiKey.trim();
  if (!trimmed) throw new ModelError('API Key 不能为空', 'INVALID_API_KEY');
  writeSecrets({ ...readSecrets(), apiKey: trimmed });
};

export const clearModelApiKey = () => {
  const next = { ...readSecrets() };
  delete next.apiKey;
  writeSecrets(next);
};

export const hasModelApiKey = () => Boolean(readSecrets().apiKey?.trim());

export const setProfileApiKey = (profileId: string, apiKey: string) => {
  const trimmed = apiKey.trim();
  if (!trimmed) throw new ModelError('API Key 不能为空', 'INVALID_API_KEY');
  const secrets = readSecrets();
  writeSecrets({
    ...secrets,
    profileKeys: { ...(secrets.profileKeys ?? {}), [profileId]: trimmed }
  });
};

export const clearProfileApiKey = (profileId: string) => {
  const secrets = readSecrets();
  const next = { ...secrets, profileKeys: { ...(secrets.profileKeys ?? {}) } };
  delete next.profileKeys?.[profileId];
  writeSecrets(next);
};

export const readProfileKey = (profileId: string) =>
  (process.env.KEXU_MODEL_API_KEY || readSecrets().profileKeys?.[profileId] || '').trim();

export const hasProfileApiKey = (profileId: string) =>
  Boolean((process.env.KEXU_MODEL_API_KEY || readSecrets().profileKeys?.[profileId] || '').trim());

export const setMimoApiKey = (apiKey: string) => {
  const trimmed = apiKey.trim();
  if (!trimmed) throw new ModelError('MiMo API Key 不能为空', 'INVALID_API_KEY');
  writeSecrets({ ...readSecrets(), mimoApiKey: trimmed });
};

export const clearMimoApiKey = () => {
  const next = { ...readSecrets() };
  delete next.mimoApiKey;
  writeSecrets(next);
};

export const hasMimoApiKey = () =>
  Boolean((process.env.KEXU_MIMO_API_KEY || readSecrets().mimoApiKey || '').trim());

const normalizeBaseUrl = (value: string) => {
  let url = value.trim().replace(/\/+$/, '');
  url = url.replace(/\/(chat\/completions|responses)$/i, '');
  if (!/^https?:\/\//i.test(url)) {
    throw new ModelError('模型服务地址必须以 http:// 或 https:// 开头', 'INVALID_BASE_URL');
  }
  return url;
};

const normalizeProtocol = (value?: string): ModelProtocol =>
  value === 'responses' ? 'responses' : 'chat';

const KNOWN_PROVIDERS: Array<{ match: string; name: string }> = [
  { match: 'openai.com', name: 'OpenAI' },
  { match: 'api.openai', name: 'OpenAI' },
  { match: 'deepseek.com', name: 'DeepSeek' },
  { match: 'open.bigmodel.cn', name: '智谱 GLM' },
  { match: 'dashscope', name: '通义千问' },
  { match: 'moonshot.cn', name: 'Moonshot' },
  { match: 'xiaomimimo.com', name: 'MiMo' },
  { match: 'anthropic.com', name: 'Anthropic' },
  { match: 'localhost', name: '本地服务' },
  { match: '127.0.0.1', name: '本地代理' }
];

const providerLabel = (baseUrl: string, declared?: string) => {
  const declaredName = (declared ?? '').trim();
  if (declaredName && declaredName !== 'openai-compatible' && declaredName !== 'custom') {
    return declaredName;
  }
  try {
    const host = new URL(baseUrl).host.toLowerCase();
    const hit = KNOWN_PROVIDERS.find((item) => host.includes(item.match));
    if (hit) return hit.name;
    if (declaredName === 'custom') return '自定义服务';
    return host || 'OpenAI-compatible';
  } catch {
    return declaredName || 'OpenAI-compatible';
  }
};

export function resolveModelConfig(
  settings: RuntimeSettings,
  profileId?: string
): ModelConfig {
  const secrets = readSecrets();
  const profiles = settings.modelProfiles ?? [];
  const wanted = profileId ?? settings.activeModelId;
  const profile: ModelProfile | undefined =
    profiles.find((item) => item.id === wanted) ?? profiles[0];
  const baseUrl = normalizeBaseUrl(
    process.env.KEXU_MODEL_BASE_URL ||
      profile?.baseUrl ||
      secrets.baseUrl ||
      settings.modelBaseUrl ||
      'http://127.0.0.1:15721/v1'
  );
  const model = (
    process.env.KEXU_MODEL_NAME ||
      profile?.modelName ||
      secrets.model ||
      settings.modelName ||
      settings.reasoningModel ||
      'deepseek-v4.1-flash'
  ).trim();
  const protocol = normalizeProtocol(
    process.env.KEXU_MODEL_PROTOCOL || profile?.protocol || secrets.protocol || settings.modelProtocol
  );
  const apiKey =
    process.env.KEXU_MODEL_API_KEY ||
    (profile ? secrets.profileKeys?.[profile.id] ?? '' : '') ||
    secrets.apiKey ||
    '';
  const timeoutMs = Math.min(
    Math.max(Number(process.env.KEXU_MODEL_TIMEOUT_MS || settings.requestTimeoutMs) || 120_000, 5_000),
    600_000
  );
  const maxRetries = Math.min(Math.max(Number(settings.maxRetries) || 0, 0), 5);

  return {
    baseUrl,
    model,
    protocol,
    apiKey,
    timeoutMs,
    maxRetries,
    autoRetry: settings.autoRetry !== false,
    provider: providerLabel(baseUrl)
  };
}

export function describeModelConfig(settings: RuntimeSettings) {
  try {
    const config = resolveModelConfig(settings);
    return {
      baseUrl: config.baseUrl,
      model: config.model,
      protocol: config.protocol,
      provider: config.provider,
      apiKeyConfigured: Boolean(config.apiKey),
      configured: Boolean(config.baseUrl && config.model)
    };
  } catch {
    return {
      baseUrl: settings.modelBaseUrl,
      model: settings.modelName,
      protocol: settings.modelProtocol,
      provider: 'unconfigured',
      apiKeyConfigured: false,
      configured: false
    };
  }
}

const isRetryable = (error: unknown) => {
  if (error instanceof ModelError) {
    if (!error.status) return true;
    return error.status === 408 || error.status === 409 || error.status === 429 || error.status >= 500;
  }
  return true;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const extractResponsesText = (payload: Record<string, unknown>) => {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text;
  }
  const output = payload.output;
  if (!Array.isArray(output)) return '';
  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      const text = (block as { text?: unknown }).text;
      if (typeof text === 'string' && text.trim()) parts.push(text);
    }
  }
  return parts.join('\n');
};

const extractChatText = (payload: Record<string, unknown>) => {
  const choices = payload.choices;
  if (!Array.isArray(choices) || !choices.length) return '';
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'
          ? ((part as { text: string }).text ?? '')
          : ''
      )
      .join('');
  }
  return '';
};

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ModelRequest {
  messages: ChatMessage[];
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
}

async function requestOnce(config: ModelConfig, request: ModelRequest): Promise<ModelResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const startedAt = Date.now();
  const base = config.baseUrl;
  const isResponses = config.protocol === 'responses';
  const url = isResponses ? `${base}/responses` : `${base}/chat/completions`;
  const body = isResponses
    ? {
        model: config.model,
        input: request.messages.map((message) => ({
          role: message.role,
          content: [{ type: message.role === 'assistant' ? 'output_text' : 'input_text', text: message.content }]
        })),
        max_output_tokens: request.maxTokens ?? 2200,
        ...(request.json ? { text: { format: { type: 'json_object' } } } : {})
      }
    : {
        model: config.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 2200,
        stream: false,
        ...(request.json ? { response_format: { type: 'json_object' } } : {})
      };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {})
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const raw = await response.text();
    if (!response.ok) {
      let detail = raw.slice(0, 600);
      try {
        const parsed = JSON.parse(raw) as { error?: { message?: string } | string };
        detail =
          typeof parsed.error === 'string'
            ? parsed.error
            : parsed.error?.message || JSON.stringify(parsed).slice(0, 600);
      } catch {
        // Keep the raw snippet.
      }
      throw new ModelError(
        `模型服务返回 ${response.status}：${detail || response.statusText}`,
        'MODEL_HTTP_ERROR',
        response.status
      );
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new ModelError('模型服务返回了无法解析的响应', 'MODEL_BAD_PAYLOAD');
    }

    const text = isResponses ? extractResponsesText(payload) : extractChatText(payload);
    if (!text.trim()) {
      throw new ModelError('模型返回了空内容', 'MODEL_EMPTY_RESPONSE');
    }

    return {
      text,
      model: typeof payload.model === 'string' ? payload.model : config.model,
      provider: config.provider,
      durationMs: Date.now() - startedAt,
      usage:
        payload.usage && typeof payload.usage === 'object'
          ? (payload.usage as Record<string, unknown>)
          : undefined
    };
  } catch (error) {
    if (error instanceof ModelError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ModelError(`模型调用超时（${config.timeoutMs} ms）`, 'MODEL_TIMEOUT');
    }
    throw new ModelError(
      error instanceof Error ? `无法连接模型服务：${error.message}` : '无法连接模型服务',
      'MODEL_NETWORK_ERROR'
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function callModel(
  settings: RuntimeSettings,
  request: ModelRequest,
  profileId?: string
): Promise<ModelResponse> {
  const config = resolveModelConfig(settings, profileId);
  const attempts = 1 + (config.autoRetry ? config.maxRetries : 0);
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await requestOnce(config, request);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts - 1 || !isRetryable(error)) break;
      await wait(500 * (attempt + 1));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new ModelError('模型调用失败', 'MODEL_ERROR');
}

export function parseJsonLoose<T = unknown>(text: string): T {
  let content = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(content);
  if (fence) content = fence[1].trim();

  try {
    return JSON.parse(content) as T;
  } catch {
    // Fall through to bracket extraction.
  }

  const objectStart = content.indexOf('{');
  const arrayStart = content.indexOf('[');
  const start =
    objectStart < 0 ? arrayStart : arrayStart < 0 ? objectStart : Math.min(objectStart, arrayStart);
  if (start < 0) {
    throw new ModelError('模型输出中没有 JSON 内容', 'MODEL_JSON_MISSING');
  }
  const open = content[start];
  const close = open === '{' ? '}' : ']';
  const end = content.lastIndexOf(close);
  if (end <= start) {
    throw new ModelError('模型输出的 JSON 不完整', 'MODEL_JSON_TRUNCATED');
  }
  try {
    return JSON.parse(content.slice(start, end + 1)) as T;
  } catch (error) {
    throw new ModelError(
      `模型输出的 JSON 无法解析：${error instanceof Error ? error.message : '未知错误'}`,
      'MODEL_JSON_INVALID'
    );
  }
}

export async function testModelConnection(settings: RuntimeSettings, profileId?: string) {
  const startedAt = Date.now();
  try {
    const config = resolveModelConfig(settings, profileId);
    const response = await callModel(settings, {
      messages: [
        { role: 'system', content: '你是连通性检查助手。' },
        { role: 'user', content: '只回复两个字：正常' }
      ],
      temperature: 0,
      maxTokens: 24
    }, profileId);
    return {
      ok: true,
      latencyMs: Date.now() - startedAt,
      model: response.model,
      provider: response.provider,
      protocol: config.protocol,
      message: response.text.trim().slice(0, 80)
    };
  } catch (error) {
    const config = (() => {
      try {
        return resolveModelConfig(settings, profileId);
      } catch {
        return null;
      }
    })();
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      model: config?.model ?? settings.modelName,
      provider: config?.provider ?? 'unconfigured',
      protocol: config?.protocol ?? settings.modelProtocol,
      message: error instanceof Error ? error.message : '模型连接失败'
    };
  }
}

/**
 * Lists the models a service exposes. Works with any OpenAI-compatible
 * endpoint and is the fastest way to pick a working model name.
 */
export async function listServiceModels(
  baseUrl: string,
  apiKey?: string
): Promise<{ models: string[]; provider: string; error?: string }> {
  const base = baseUrl.trim().replace(/\/+$/, '').replace(/\/(chat\/completions|responses)$/i, '');
  if (!/^https?:\/\//i.test(base)) {
    return { models: [], provider: '', error: '服务地址必须以 http:// 或 https:// 开头' };
  }
  try {
    const response = await fetch(`${base}/models`, {
      headers: {
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      }
    });
    const raw = await response.text();
    if (!response.ok) {
      return {
        models: [],
        provider: providerLabel(base),
        error: `服务返回 ${response.status}：${raw.slice(0, 200)}`
      };
    }
    const payload = JSON.parse(raw) as {
      data?: Array<{ id?: string; name?: string; slug?: string }>;
      models?: Array<{ id?: string; slug?: string; display_name?: string; name?: string }>;
    };
    const extracted = new Set<string>();
    for (const item of payload.data ?? []) {
      const val = (item?.id || item?.slug || item?.name || '').trim();
      if (val) extracted.add(val);
    }
    for (const item of payload.models ?? []) {
      const val = (item?.slug || item?.id || item?.display_name || item?.name || '').trim();
      if (val) extracted.add(val);
    }
    const models = Array.from(extracted).sort();
    return { models, provider: providerLabel(base) };
  } catch (error) {
    return {
      models: [],
      provider: providerLabel(base),
      error: error instanceof Error ? error.message : '无法读取模型列表'
    };
  }
}
