import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readSecrets } from './llm';

const MIMO_ENDPOINT =
  process.env.KEXU_MIMO_BASE_URL?.replace(/\/+$/, '') ||
  'https://api.xiaomimimo.com/v1/chat/completions';
const MIMO_TTS_MODEL = process.env.KEXU_MIMO_TTS_MODEL || 'mimo-v2.5-tts';
const MIMO_ASR_MODEL = process.env.KEXU_MIMO_ASR_MODEL || 'mimo-v2.5-asr';
const MIMO_MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export const MIMO_VOICES = [
  { id: 'mimo_default', label: 'MiMo 默认 · 自然课堂' },
  { id: '冰糖', label: '冰糖 · 清甜女声' },
  { id: '茉莉', label: '茉莉 · 温柔女声' },
  { id: '苏打', label: '苏打 · 清爽青年' },
  { id: '白桦', label: '白桦 · 沉稳男声' },
  { id: 'Mia', label: 'Mia · 英文女声' },
  { id: 'Chloe', label: 'Chloe · 英文女声' },
  { id: 'Milo', label: 'Milo · 英文男声' },
  { id: 'Dean', label: 'Dean · 英文男声' }
] as const;

export interface MimoSpeechConfig {
  apiKey: string;
  endpoint: string;
  ttsModel: string;
  asrModel: string;
}

export function resolveMimoConfig(): MimoSpeechConfig {
  const apiKey = (process.env.KEXU_MIMO_API_KEY || readSecrets().mimoApiKey || '').trim();
  return {
    apiKey,
    endpoint: MIMO_ENDPOINT,
    ttsModel: MIMO_TTS_MODEL,
    asrModel: MIMO_ASR_MODEL
  };
}

export function mimoConfigured() {
  return Boolean(resolveMimoConfig().apiKey);
}

const errorDetail = (payload: unknown, fallback: string) => {
  if (!payload || typeof payload !== 'object') return fallback;
  const value = (payload as { error?: unknown }).error;
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const message = (value as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  const message = (payload as { message?: unknown }).message;
  return typeof message === 'string' && message.trim() ? message : fallback;
};

async function callMimo(
  config: MimoSpeechConfig,
  body: Record<string, unknown>,
  timeoutMs = 180_000
) {
  if (!config.apiKey) {
    throw new Error('尚未配置 MiMo API Key，请先在运行设置中填写并保存。');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'api-key': config.apiKey
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const raw = await response.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // The status check below produces the useful error for non-JSON replies.
    }
    if (!response.ok) {
      throw new Error(
        `MiMo 语音服务返回 ${response.status}：${errorDetail(payload, raw.slice(0, 500) || response.statusText)}`
      );
    }
    if (!payload || typeof payload !== 'object') {
      throw new Error('MiMo 语音服务返回了无法解析的响应。');
    }
    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`MiMo 语音服务调用超时（${Math.round(timeoutMs / 1000)} 秒）。`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

const firstMessage = (payload: Record<string, unknown>) => {
  const choices = payload.choices;
  if (!Array.isArray(choices) || !choices.length) return null;
  return (choices[0] as { message?: Record<string, unknown> }).message ?? null;
};

export async function synthesizeMimoAudio(
  text: string,
  outputFile: string,
  options: { voice?: string; style?: string; format?: 'mp3' | 'wav' } = {}
) {
  const config = resolveMimoConfig();
  const content = text.trim();
  if (!content) throw new Error('MiMo TTS 文本为空。');
  const payload = await callMimo(config, {
    model: config.ttsModel,
    messages: [
      {
        role: 'user',
        content: (options.style || '温暖、清晰、语速适中的课堂讲解语气').trim()
      },
      { role: 'assistant', content }
    ],
    audio: {
      format: options.format || 'mp3',
      voice: options.voice || 'mimo_default'
    }
  });
  const message = firstMessage(payload);
  const audio = message?.audio as { data?: unknown; transcript?: unknown } | undefined;
  const encoded = typeof audio?.data === 'string' ? audio.data : '';
  if (!encoded) throw new Error('MiMo TTS 没有返回音频数据。');
  const buffer = Buffer.from(encoded, 'base64');
  if (buffer.length < 100) throw new Error('MiMo TTS 返回的音频为空。');
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, buffer);
  return {
    file: outputFile,
    bytes: buffer.length,
    transcript: typeof audio?.transcript === 'string' ? audio.transcript : ''
  };
}

const ffmpegCandidates = [
  process.env.FFMPEG_PATH,
  'ffmpeg',
  'C:\\Users\\wyg\\AppData\\Roaming\\LobsterAI\\huashu-motion\\tools\\ffmpeg\\bin\\ffmpeg.exe'
].filter(Boolean) as string[];

const runProcess = (command: string, args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.split('\n').slice(-5).join('\n') || `ffmpeg exited with ${code}`));
    });
  });

async function normalizeAudioForMimo(buffer: Buffer, mimeHint: string) {
  const mime = (mimeHint || 'application/octet-stream').toLowerCase();
  if (mime.includes('wav') || mime.includes('mpeg') || mime.includes('mp3')) {
    return {
      buffer,
      mime: mime.includes('wav') ? 'audio/wav' : 'audio/mpeg'
    };
  }
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kexu-asr-'));
  const input = path.join(tempDir, `input-${crypto.randomBytes(3).toString('hex')}.webm`);
  const output = path.join(tempDir, 'speech.wav');
  try {
    fs.writeFileSync(input, buffer);
    let lastError: unknown;
    for (const command of ffmpegCandidates) {
      try {
        await runProcess(command, [
          '-y',
          '-i',
          input,
          '-vn',
          '-ac',
          '1',
          '-ar',
          '16000',
          '-c:a',
          'pcm_s16le',
          output
        ]);
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) throw lastError;
    return { buffer: fs.readFileSync(output), mime: 'audio/wav' };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 });
  }
}

export async function transcribeMimoAudio(buffer: Buffer, mimeHint = 'audio/webm') {
  const config = resolveMimoConfig();
  if (!buffer.length) throw new Error('没有收到可识别的录音。');
  const normalized = await normalizeAudioForMimo(buffer, mimeHint);
  if (normalized.buffer.length > MIMO_MAX_AUDIO_BYTES) {
    throw new Error('单段录音超过 MiMo ASR 的 10MB 限制，请缩短试讲或分段保存。');
  }
  const startedAt = Date.now();
  const payload = await callMimo(config, {
    model: config.asrModel,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'input_audio',
            input_audio: {
              data: `data:${normalized.mime};base64,${normalized.buffer.toString('base64')}`
            }
          }
        ]
      }
    ],
    asr_options: { language: 'zh' }
  });
  const message = firstMessage(payload);
  const content = message?.content;
  const text =
    typeof content === 'string'
      ? content.trim()
      : Array.isArray(content)
        ? content
            .map((item) =>
              item && typeof item === 'object' && typeof (item as { text?: unknown }).text === 'string'
                ? (item as { text: string }).text
                : ''
            )
            .join('')
            .trim()
        : '';
  if (!text) throw new Error('MiMo ASR 没有返回识别文字。');
  return {
    text,
    durationMs: Date.now() - startedAt,
    model: config.asrModel
  };
}

export async function testMimoSpeech() {
  const startedAt = Date.now();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kexu-mimo-test-'));
  const audioFile = path.join(tempDir, 'test.mp3');
  try {
    const ttsStartedAt = Date.now();
    await synthesizeMimoAudio('同学们好，欢迎进入今天的微课。', audioFile, {
      voice: 'mimo_default',
      format: 'mp3'
    });
    const ttsMs = Date.now() - ttsStartedAt;
    const asrStartedAt = Date.now();
    const transcript = await transcribeMimoAudio(fs.readFileSync(audioFile), 'audio/mpeg');
    return {
      ok: true,
      latencyMs: Date.now() - startedAt,
      ttsMs,
      asrMs: Date.now() - asrStartedAt,
      bytes: fs.statSync(audioFile).size,
      model: MIMO_TTS_MODEL,
      asrModel: MIMO_ASR_MODEL,
      transcript: transcript.text,
      message: 'MiMo TTS 与 ASR 均已连通'
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      ttsMs: 0,
      asrMs: 0,
      bytes: 0,
      model: MIMO_TTS_MODEL,
      asrModel: MIMO_ASR_MODEL,
      transcript: '',
      message: error instanceof Error ? error.message : 'MiMo 语音服务连接失败'
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 });
  }
}
