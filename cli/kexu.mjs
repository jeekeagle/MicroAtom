#!/usr/bin/env node
/**
 * kexu - Agent-driven micro-course production CLI.
 *
 * Zero runtime dependencies. It talks to the local course studio API and is
 * designed to be driven by Codex or any other agent:
 *   - --json keeps stdout machine readable, progress goes to stderr
 *   - stable exit codes (0 ok, 1 runtime error, 2 usage error)
 *   - "kexu schema" describes every command without reading source code
 */
import { parseArgs } from 'node:util';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const VERSION = '0.1.0';
const DEFAULT_BASE_URL = 'http://127.0.0.1:8787';

const state = {
  baseUrl: DEFAULT_BASE_URL,
  json: false,
  quiet: false,
  timeoutMs: 300_000,
  color: Boolean(process.stdout.isTTY) && !process.env.NO_COLOR
};

class CliError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'CliError';
    this.code = options.code ?? 1;
    this.status = options.status;
    this.details = options.details;
  }
}

const paint = (code, text) => (state.color ? `\u001b[${code}m${text}\u001b[0m` : String(text));
const bold = (text) => paint('1', text);
const dim = (text) => paint('2', text);
const cyan = (text) => paint('36', text);
const green = (text) => paint('32', text);
const yellow = (text) => paint('33', text);
const red = (text) => paint('31', text);

function textOut(text = '') {
  process.stdout.write(`${text}\n`);
}

function jsonOut(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function logLine(text = '') {
  if (state.quiet) return;
  process.stderr.write(`${text}\n`);
}

function usageError(message) {
  throw new CliError(message, { code: 2 });
}

function toNumber(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pick(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncate(text, length = 90) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

function fmtSeconds(value) {
  const total = Number(value);
  if (!Number.isFinite(total)) return '—';
  const seconds = Math.max(0, Math.round(total));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function fmtBytes(value) {
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) return '—';
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function progressBar(value) {
  const percent = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  const filled = Math.round((percent / 100) * 20);
  return cyan(`[${'#'.repeat(filled)}${'-'.repeat(20 - filled)}] ${String(percent).padStart(3)}%`);
}

const projectStatusLabel = {
  draft: '草稿',
  producing: '制作中',
  review: '待审',
  done: '已完成'
};

const stageLabelMap = {
  script: '讲稿',
  slides: '课件',
  audio: '声音',
  render: '成片'
};

const modeLabelMap = {
  auto: '全自动',
  oral: '口语稿驱动',
  ppt: 'PPT 驱动'
};

const projectStatus = (value) => projectStatusLabel[value] ?? value ?? '—';
const stageLabel = (value) => stageLabelMap[value] ?? value ?? '—';
const modeLabel = (value) => modeLabelMap[value] ?? value ?? '—';

function normalizeBaseUrl(value) {
  return String(value).trim().replace(/\/+$/, '') || DEFAULT_BASE_URL;
}

function absoluteUrl(url) {
  if (!url) return undefined;
  try {
    return new URL(url, `${state.baseUrl}/`).toString();
  } catch {
    return url;
  }
}

/* ------------------------------------------------------------------ */
/* CLI options                                                        */
/* ------------------------------------------------------------------ */

const opt = (name, type, description, extra = {}) => ({
  name,
  flag: extra.short ? `-${extra.short}, --${name}` : `--${name}`,
  type,
  description,
  short: extra.short
});

const OPT = {
  baseUrl: opt('base-url', 'string', 'API 地址，默认 http://127.0.0.1:8787，也可用 KEXU_BASE_URL'),
  json: opt('json', 'boolean', '输出机器可读 JSON；stdout 只包含 JSON', { short: 'j' }),
  quiet: opt('quiet', 'boolean', '不输出进度信息', { short: 'q' }),
  help: opt('help', 'boolean', '显示帮助', { short: 'h' }),
  version: opt('version', 'boolean', '显示版本', { short: 'v' }),
  noColor: opt('no-color', 'boolean', '禁用 ANSI 颜色'),
  timeout: opt('timeout', 'string', '单次 HTTP 请求超时毫秒数（默认 300000）'),
  wait: opt('wait', 'boolean', '等待异步任务完成'),
  interval: opt('interval', 'string', '轮询间隔秒数（默认 2）'),
  waitTimeout: opt('wait-timeout', 'string', '等待渲染超时秒数（默认 1800）'),
  out: opt('out', 'string', '输出文件路径', { short: 'o' }),
  force: opt('force', 'boolean', '覆盖已存在的输出文件'),
  topic: opt('topic', 'string', '课程主题'),
  title: opt('title', 'string', '课程标题，默认与主题一致'),
  subject: opt('subject', 'string', '学科'),
  grade: opt('grade', 'string', '学段'),
  duration: opt('duration', 'string', '课程时长（分钟）'),
  mode: opt('mode', 'string', '课程模式：auto / oral / ppt'),
  idea: opt('idea', 'string', '备课想法草稿'),
  ideaFile: opt('idea-file', 'string', '从文本文件读取备课想法（- 表示 stdin）'),
  valueGuide: opt('value-guide', 'string', '价值引领'),
  learnerProfile: opt('learner-profile', 'string', '学情说明'),
  style: opt('style', 'string', '表达风格'),
  file: opt('file', 'string', '输入文件（- 表示 stdin）', { short: 'f' }),
  note: opt('note', 'string', '修改意见正文（- 表示 stdin）'),
  section: opt('section', 'string', '意见对应的讲稿段落 ID'),
  quote: opt('quote', 'string', '意见引用的原文'),
  status: opt('status', 'string', '按状态筛选：open / resolved / all'),
  bullets: opt('bullets', 'string', '课件要点，用 ;; 分隔'),
  layout: opt('layout', 'string', '课件版式'),
  accent: opt('accent', 'string', '课件强调色：brick / teal / gold / ink'),
  seconds: opt('seconds', 'string', '课件页时长（秒）'),
  eyebrow: opt('eyebrow', 'string', '课件眉题'),
  transcript: opt('transcript', 'string', '录音转写文本'),
  transcriptFile: opt('transcript-file', 'string', '从文件读取录音转写（- 表示 stdin）'),
  events: opt('events', 'string', '翻页事件 JSON 文件'),
  name: opt('name', 'string', '录音名称'),
  kind: opt('kind', 'string', '录音类型：teacher / upload'),
  mime: opt('mime', 'string', '录音 MIME 类型，默认按扩展名推断'),
  audio: opt('audio', 'string', '指定用于渲染的录音 ID'),
  input: opt('input', 'string', '智能体 / Skill 的试运行输入（- 表示 stdin）'),
  regenerate: opt('regenerate', 'boolean', '强制重新生成讲稿'),
  regenerateSlides: opt('regenerate-slides', 'boolean', '强制重新生成课件'),
  skipAudio: opt('skip-audio', 'boolean', '跳过声音生成（渲染时由服务端处理）'),
  noWait: opt('no-wait', 'boolean', '只启动渲染，不等待完成'),
  publish: opt('publish', 'boolean', '成片就绪后发布课程'),
  until: opt('until', 'string', '推进到指定阶段：script / slides / audio / render'),
  keepConfirmed: opt('keep-confirmed', 'boolean', '保存讲稿时保留已确认状态'),
  modelName: opt('model-name', 'string', '模型名称'),
  modelBaseUrl: opt('model-base-url', 'string', '模型 API 地址'),
  apiKey: opt('api-key', 'string', '模型 API Key（只写入服务端，不回显）'),
  ttsEngine: opt('tts-engine', 'string', 'TTS 引擎：edge / sapi / none'),
  ttsVoice: opt('tts-voice', 'string', 'TTS 音色'),
  ttsRate: opt('tts-rate', 'string', 'TTS 语速调整（百分比）'),
  recordTeacherVideo: opt('record-teacher-video', 'string', '试讲时录制教师画面：on / off')
};

const PARSE_OPTIONS = {};
for (const item of Object.values(OPT)) {
  PARSE_OPTIONS[item.name] = {
    type: item.type,
    ...(item.short ? { short: item.short } : {})
  };
}

const GLOBAL_OPTIONS = [
  OPT.baseUrl,
  OPT.json,
  OPT.quiet,
  OPT.timeout,
  OPT.noColor,
  OPT.help,
  OPT.version
];

/* ------------------------------------------------------------------ */
/* IO helpers                                                         */
/* ------------------------------------------------------------------ */

async function readStdinText() {
  if (process.stdin.isTTY) {
    usageError('需要从 stdin 读取内容，但当前是交互终端');
  }
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function readStdinBuffer() {
  if (process.stdin.isTTY) {
    usageError('需要从 stdin 读取录音数据，但当前是交互终端');
  }
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function readText(file, label = '文件') {
  if (file === '-') return readStdinText();
  try {
    return await readFile(path.resolve(file), 'utf8');
  } catch (error) {
    throw new CliError(`${label}读取失败：${file}（${error.message}）`);
  }
}

async function readJson(file, label = 'JSON') {
  const text = await readText(file, label);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new CliError(`${file === '-' ? 'stdin' : file} 不是合法 JSON：${error.message}`);
  }
}

const MIME_BY_EXT = {
  '.webm': 'audio/webm',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.wav': 'audio/wav',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac'
};

function inferMime(file) {
  if (!file || file === '-') return 'audio/webm';
  return MIME_BY_EXT[path.extname(file).toLowerCase()] ?? 'audio/webm';
}

/* ------------------------------------------------------------------ */
/* API client                                                         */
/* ------------------------------------------------------------------ */

async function api(method, apiPath, body, options = {}) {
  const url = new URL(apiPath, `${state.baseUrl}/`);
  const timeoutMs = options.timeoutMs ?? state.timeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!response.ok) {
      const message =
        (data && typeof data === 'object' && data.error) ||
        `HTTP ${response.status} ${response.statusText}`;
      throw new CliError(String(message), { status: response.status, details: data });
    }
    return data;
  } catch (error) {
    if (error instanceof CliError) throw error;
    if (error?.name === 'AbortError') {
      throw new CliError(`请求超时（${timeoutMs} ms）：${method} ${apiPath}`);
    }
    throw new CliError(
      `无法连接 API：${state.baseUrl}（${error?.cause?.code ?? error?.message ?? error}）`,
      { details: { method, path: apiPath } }
    );
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* Domain helpers                                                     */
/* ------------------------------------------------------------------ */

const STAGE_RANK = { script: 1, slides: 2, audio: 3, render: 4 };

function normalizeMode(value) {
  const mode = String(value ?? 'auto').trim();
  if (!['auto', 'oral', 'ppt'].includes(mode)) {
    usageError(`模式必须是 auto / oral / ppt，收到：${mode}`);
  }
  return mode;
}

function normalizeUntil(value) {
  const until = String(value ?? 'render').trim();
  if (!['script', 'slides', 'audio', 'render'].includes(until)) {
    usageError(`--until 必须是 script / slides / audio / render，收到：${until}`);
  }
  return until;
}

function summarizeProject(project) {
  const comments = project.script?.comments ?? [];
  return {
    id: project.id,
    title: project.title,
    topic: project.topic,
    subject: project.subject,
    grade: project.grade,
    mode: project.mode,
    status: project.status,
    stage: project.stage,
    progress: project.progress,
    script: project.script
      ? {
          version: project.script.version,
          confirmed: project.script.confirmed,
          sections: project.script.sections.length,
          openComments: comments.filter((comment) => comment.status === 'open').length
        }
      : null,
    slides: project.slides.length,
    recordings: project.recordings.map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      name: asset.name,
      durationSeconds: asset.durationSeconds
    })),
    render: project.render
      ? {
          status: project.render.status,
          progress: project.render.progress,
          downloadReady: project.render.downloadReady,
          downloadUrl: project.render.downloadUrl
        }
      : null,
    updatedAt: project.updatedAt
  };
}

function actionStage(action) {
  if (action === 'generate-script' || action === 'confirm-script') return 'script';
  if (action === 'generate-slides') return 'slides';
  if (action === 'generate-tts' || action === 'needs-teacher-audio') return 'audio';
  return 'render';
}

const ACTION_LABEL = {
  'generate-script': '生成讲稿',
  'confirm-script': '确认讲稿',
  'generate-slides': '生成课件',
  'generate-tts': '生成 AI 旁白',
  'needs-teacher-audio': '等待教师试讲录音',
  'start-render': '启动成片渲染',
  'wait-render': '等待成片渲染',
  done: '流程完成',
  stop: '到达指定阶段'
};

function scriptOverrides(opts, fromFile = {}) {
  const payload = { ...fromFile };
  const fields = [
    ['topic', 'topic'],
    ['idea', 'idea'],
    ['value-guide', 'valueGuide'],
    ['learner-profile', 'learnerProfile'],
    ['subject', 'subject'],
    ['grade', 'grade'],
    ['style', 'style'],
    ['duration', 'durationMinutes'],
    ['mode', 'mode']
  ];
  for (const [flag, key] of fields) {
    if (opts[flag] !== undefined) {
      payload[key] = opts[flag];
    }
  }
  if (payload.durationMinutes !== undefined) {
    payload.durationMinutes = Math.min(
      45,
      Math.max(3, toNumber(payload.durationMinutes, 8))
    );
  }
  if (payload.mode !== undefined) payload.mode = normalizeMode(payload.mode);
  return payload;
}

async function resolveTranscript(opts, label = '录音转写') {
  if (opts['transcript-file']) return (await readText(opts['transcript-file'], label)).trim();
  if (opts.transcript === '-') return (await readStdinText()).trim();
  if (opts.transcript !== undefined) return String(opts.transcript).trim();
  return undefined;
}

async function waitForRender(projectId, opts) {
  const intervalMs = Math.max(500, toNumber(opts.interval, 2) * 1000);
  const timeoutMs = Math.max(10_000, toNumber(opts['wait-timeout'], 1800) * 1000);
  const startedAt = Date.now();
  let lastLine = '';
  let finalProject = null;

  for (;;) {
    const project = await api('GET', `/api/projects/${projectId}`);
    const render = project.render;
    if (!render) {
      throw new CliError('尚未开始渲染，请先执行 kexu render start <id>');
    }
    finalProject = project;
    if (!state.json) {
      const line = `${render.status} ${render.progress ?? 0} ${render.stageMessage ?? ''}`;
      if (line !== lastLine) {
        logLine(`${dim('渲染')} ${renderStatusText(render)}${render.stageMessage ? ` ${render.stageMessage}` : ''}`);
        lastLine = line;
      }
    }
    if (render.downloadReady || render.status === 'done') return project;
    if (render.status === 'error') {
      throw new CliError(`渲染失败：${render.error || render.stageMessage || '未知错误'}`, {
        details: render
      });
    }
    if (render.status === 'idle') {
      throw new CliError('渲染尚未开始，请先执行 kexu render start <id>');
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new CliError(
        `等待渲染超时（${Math.round(timeoutMs / 1000)} 秒）。可先查看 kexu render status ${projectId}`
      );
    }
    await sleep(intervalMs);
  }
}

function renderStatusText(render) {
  if (!render) return '未开始';
  if (render.status === 'running') {
    return `${progressBar(render.progress)} 渲染中`;
  }
  if (render.status === 'queued') return '排队中';
  if (render.status === 'done') return `${green('已完成')} · ${fmtSeconds(render.durationSeconds)} · ${fmtBytes(render.sizeBytes)}`;
  if (render.status === 'error') return red('失败');
  return '等待开始';
}

/* ------------------------------------------------------------------ */
/* Human output                                                       */
/* ------------------------------------------------------------------ */

function printProjectRow(project) {
  const flags = [];
  if (project.script) {
    flags.push(project.script.confirmed ? '讲稿已确认' : '讲稿待确认');
  } else {
    flags.push('无讲稿');
  }
  if (project.slides.length) flags.push(`${project.slides.length} 页课件`);
  if (project.recordings.length) flags.push(`${project.recordings.length} 条录音`);
  if (project.render?.downloadReady) flags.push(green('已出片'));
  textOut(`${cyan(`[${project.stage} ${project.progress}%]`)} ${bold(project.title)}`);
  textOut(`  ${dim(project.id)} · ${flags.join(' · ')}`);
}

function printProject(project, options = {}) {
  const lines = [];
  const openComments = (project.script?.comments ?? []).filter(
    (comment) => comment.status === 'open'
  );
  lines.push(bold(project.title));
  lines.push(`${dim('ID')}      ${project.id}`);
  lines.push(
    `${dim('状态')}    ${projectStatus(project.status)} · ${stageLabel(project.stage)} · ${project.progress}%`
  );
  lines.push(
    `${dim('配置')}    ${project.grade} · ${project.subject} · ${project.durationMinutes} 分钟 · ${modeLabel(project.mode)}`
  );
  if (project.script) {
    lines.push(
      `${dim('讲稿')}    v${project.script.version} · ${project.script.sections.length} 段 · ${
        project.script.confirmed ? green('已确认') : yellow('待确认')
      }${openComments.length ? ` · ${openComments.length} 条待处理意见` : ''}`
    );
    if (options.withSections) {
      for (const section of project.script.sections) {
        lines.push(
          `          ${String(section.order).padStart(2, '0')} ${section.title} ${dim(
            `(${fmtSeconds(section.durationSeconds)})`
          )}`
        );
      }
    }
  } else {
    lines.push(`${dim('讲稿')}    未生成`);
  }
  lines.push(`${dim('课件')}    ${project.slides.length ? `${project.slides.length} 页` : '未生成'}`);
  if (project.recordings.length) {
    const audioText = project.recordings
      .map(
        (asset) =>
          `${asset.kind === 'tts' ? 'AI 旁白' : asset.kind === 'upload' ? '导入录音' : '教师录音'} ${fmtSeconds(
            asset.durationSeconds
          )}`
      )
      .join(' · ');
    lines.push(`${dim('录音')}    ${audioText}`);
  } else {
    lines.push(`${dim('录音')}    无`);
  }
  const render = project.render;
  if (!render) {
    lines.push(`${dim('成片')}    未开始`);
  } else if (render.status === 'error') {
    lines.push(`${dim('成片')}    ${red('失败')} ${render.error ?? ''}`);
  } else if (render.downloadReady) {
    lines.push(
      `${dim('成片')}    ${green('已就绪')} · ${fmtSeconds(render.durationSeconds)} · ${fmtBytes(render.sizeBytes)}`
    );
    lines.push(`${dim('下载')}    ${absoluteUrl(render.downloadUrl)}`);
  } else {
    lines.push(`${dim('成片')}    ${renderStatusText(render)} ${render.stageMessage ?? ''}`);
  }
  textOut(lines.join('\n'));
}

function printScript(script, projectId) {
  const total = script.sections.reduce(
    (sum, section) => sum + (Number(section.durationSeconds) || 0),
    0
  );
  const lines = [];
  lines.push(bold(script.title));
  lines.push(`${dim('课程')}  ${projectId}`);
  lines.push(
    `${dim('版本')}  v${script.version} · ${script.confirmed ? green('已确认') : yellow('待确认')} · ${
      script.sections.length
    } 段 · ${fmtSeconds(total)}`
  );
  lines.push('');
  lines.push(`${dim('核心主张')} ${script.thesis}`);
  lines.push(`${dim('开场钩子')} ${script.openingHook}`);
  if (script.objectives?.length) {
    lines.push(dim('学习目标'));
    script.objectives.forEach((item, index) => lines.push(`  ${index + 1}. ${item}`));
  }
  if (script.valueThread?.length) {
    lines.push(dim('价值主线'));
    for (const item of script.valueThread) lines.push(`  · ${bold(item.label)}：${item.content}`);
  }
  lines.push('');
  lines.push(dim('段落'));
  for (const section of script.sections) {
    lines.push(
      `${bold(`${String(section.order).padStart(2, '0')}. ${section.title}`)} ${dim(
        `${fmtSeconds(section.durationSeconds)} · ${section.id}`
      )}`
    );
    lines.push(`    ${dim('目的')} ${section.purpose}`);
    lines.push(`    ${dim('旁白')} ${section.narration}`);
    lines.push(`    ${dim('画面')} ${section.slideBrief}`);
    if (section.valueNote) lines.push(`    ${dim('价值')} ${section.valueNote}`);
    lines.push('');
  }
  if (script.summary) lines.push(`${dim('收束')} ${script.summary}`);
  if (script.keywords?.length) lines.push(`${dim('关键词')} ${script.keywords.join(' / ')}`);
  if (script.quality) {
    lines.push(
      `${dim('质检')} 结构 ${script.quality.structure} · 口语 ${script.quality.oral} · 价值 ${script.quality.value} · 学情 ${script.quality.fit}`
    );
    if (script.quality.note) lines.push(`      ${dim(script.quality.note)}`);
  }
  const openComments = (script.comments ?? []).filter((comment) => comment.status === 'open');
  if (openComments.length) {
    lines.push('');
    lines.push(yellow(`待处理意见 ${openComments.length} 条`));
    for (const comment of openComments) {
      const where = comment.sectionId ? `段落 ${comment.sectionId}` : '全篇';
      lines.push(`  · [${where}] ${comment.note} ${dim(`(${comment.id})`)}`);
    }
  }
  textOut(lines.join('\n'));
}

function printSlides(slides) {
  if (!slides.length) {
    textOut('暂无课件，请先执行 kexu slides generate <id>');
    return;
  }
  const lines = [];
  for (const slide of slides) {
    lines.push(
      `${String(slide.order).padStart(2, '0')}. ${bold(slide.title)} ${dim(
        `[${slide.layout} · ${fmtSeconds(slide.seconds)} · ${slide.id}]`
      )}`
    );
    if (slide.bullets?.length) lines.push(`    ${slide.bullets.join(' / ')}`);
    if (slide.note) lines.push(`    ${dim('备注')} ${slide.note}`);
  }
  textOut(lines.join('\n'));
}

function printRecordings(recordings) {
  if (!recordings.length) {
    textOut('暂无录音。可执行 kexu audio tts <id>，或在前端完成教师试讲。');
    return;
  }
  const lines = [];
  for (const asset of recordings) {
    const kind =
      asset.kind === 'tts' ? 'AI 旁白' : asset.kind === 'upload' ? '导入录音' : '教师录音';
    lines.push(
      `${bold(kind)} · ${asset.name} · ${fmtSeconds(asset.durationSeconds)} ${dim(`[${asset.id}]`)}`
    );
    if (asset.alignmentMethod) {
      lines.push(
        `    ${dim('对齐')} ${asset.alignmentMethod} · 置信度 ${Math.round(
          Number(asset.alignmentConfidence ?? asset.alignment ?? 0)
        )}%`
      );
    }
    if (asset.transcript) lines.push(`    ${dim('转写')} ${truncate(asset.transcript, 90)}`);
  }
  textOut(lines.join('\n'));
}

function printTimeline(timeline) {
  if (!timeline) return;
  textOut(
    `${dim('时间轴')}  ${timeline.method === 'measured' ? '实测对齐' : '估算对齐'} · ${
      timeline.shots.length
    } 个镜头 · ${fmtSeconds(timeline.totalSeconds)}`
  );
  for (const shot of timeline.shots) {
    textOut(
      `          ${String(shot.slideOrder).padStart(2, '0')} ${shot.slideTitle} ${dim(
        `${fmtSeconds(shot.startSeconds)}-${fmtSeconds(shot.endSeconds)}`
      )}`
    );
  }
  if (timeline.warnings?.length) {
    for (const warning of timeline.warnings) textOut(`          ${yellow('!')} ${warning}`);
  }
}

/* ------------------------------------------------------------------ */
/* Command: health / doctor / schema                                  */
/* ------------------------------------------------------------------ */

async function cmdHealth() {
  const data = await api('GET', '/api/health');
  if (state.json) {
    jsonOut(data);
    return;
  }
  const caps = data.capabilities ?? {};
  textOut(
    [
      `${green('OK')} 微课 API 在线 · ${state.baseUrl}`,
      `${dim('时间')} ${data.time}`,
      `${dim('模型')} ${caps.modelConfigured ? '已配置' : '未配置（脚本将使用本地兜底）'}`,
      `${dim('TTS')} ${caps.tts ? `可用（${caps.ttsEngine} / ${caps.ttsVoice}）` : '不可用'}`,
      `${dim('FFmpeg')} ${caps.ffmpeg ? '可用' : '缺失（无法渲染成片）'}`,
      `${dim('Chrome')} ${caps.chrome ? '可用' : '缺失（无法渲染课件画面）'}`,
      `${dim('语音识别')} ${caps.browserAsr ? '浏览器端可用' : '不可用'}`
    ].join('\n')
  );
}

async function cmdDoctor() {
  const checks = [];
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  checks.push({
    name: 'Node.js',
    level: nodeMajor >= 20 ? 'ok' : 'fail',
    detail: `${process.version}${nodeMajor >= 20 ? '' : '（需要 20 或更高版本）'}`
  });

  let health = null;
  try {
    health = await api('GET', '/api/health');
    checks.push({ name: 'API', level: 'ok', detail: state.baseUrl });
  } catch (error) {
    checks.push({ name: 'API', level: 'fail', detail: error.message });
  }

  if (health) {
    const caps = health.capabilities ?? {};
    checks.push({
      name: '模型',
      level: caps.modelConfigured ? 'ok' : 'warn',
      detail: caps.modelConfigured ? '已配置' : '未配置，将使用本地结构兜底'
    });
    checks.push({
      name: 'TTS',
      level: caps.tts ? 'ok' : 'warn',
      detail: caps.tts ? `${caps.ttsEngine} / ${caps.ttsVoice}` : '不可用，需教师试讲录音'
    });
    checks.push({
      name: 'FFmpeg',
      level: caps.ffmpeg ? 'ok' : 'fail',
      detail: caps.ffmpeg ? '可用' : '缺失，无法渲染 MP4'
    });
    checks.push({
      name: 'Chrome',
      level: caps.chrome ? 'ok' : 'fail',
      detail: caps.chrome ? '可用' : '缺失，无法渲染课件画面'
    });
    checks.push({
      name: '浏览器语音识别',
      level: caps.browserAsr ? 'ok' : 'warn',
      detail: caps.browserAsr ? '可用' : '不可用（可在服务端补转写）'
    });
    checks.push({
      name: '媒体目录',
      level: 'ok',
      detail: caps.mediaRoot ?? '/media'
    });
  }

  const ok = checks.every((check) => check.level !== 'fail');
  if (state.json) {
    jsonOut({ ok, baseUrl: state.baseUrl, checks });
    process.exitCode = ok ? 0 : 1;
    return;
  }
  const lines = checks.map((check) => {
    const mark =
      check.level === 'ok' ? green('[ok]') : check.level === 'warn' ? yellow('[warn]') : red('[fail]');
    return `${mark} ${check.name.padEnd(8)} ${check.detail}`;
  });
  lines.push('');
  lines.push(ok ? green('环境可以开始生产微课') : red('存在阻塞项，请先修复后再运行'));
  textOut(lines.join('\n'));
  process.exitCode = ok ? 0 : 1;
}

function cmdSchema() {
  jsonOut({
    name: 'kexu',
    version: VERSION,
    description:
      'Agent-driven micro-course production CLI. Wraps the local course studio HTTP API.',
    baseUrl: {
      flag: '--base-url',
      env: ['KEXU_BASE_URL', 'KEXU_API'],
      default: DEFAULT_BASE_URL
    },
    output: {
      jsonFlag: '--json',
      stdout: 'machine-readable JSON only',
      stderr: 'progress and errors',
      env: { KEXU_JSON: '1' }
    },
    exitCodes: {
      0: 'success',
      1: 'runtime error (API failure, render failure, missing project)',
      2: 'usage error (unknown command, missing or invalid argument)'
    },
    globalOptions: GLOBAL_OPTIONS.map((item) => ({
      flag: item.flag,
      name: item.name,
      type: item.type,
      description: item.description
    })),
    env: [
      { name: 'KEXU_BASE_URL', description: 'API base URL' },
      { name: 'KEXU_JSON', description: 'Set to 1 to force JSON output' },
      { name: 'KEXU_QUIET', description: 'Set to 1 to suppress progress output' }
    ],
    commands: ROUTES.map((route) => ({
      command: usageOf(route),
      path: route.path,
      summary: route.summary,
      args: route.args.map((name) => ({ name, required: true })),
      options: route.options.map((item) => ({
        flag: item.flag,
        name: item.name,
        type: item.type,
        description: item.description
      })),
      api: route.api ?? [],
      examples: route.examples ?? []
    })),
    workflows: {
      manual: [
        'kexu health --json',
        'kexu projects create --topic "..." --grade 初中 --subject 物理 --json',
        'kexu script generate <id> --json',
        'kexu script confirm <id> --json',
        'kexu slides generate <id> --json',
        'kexu audio tts <id> --json',
        'kexu render start <id> --wait --json'
      ],
      oneShot: ['kexu run <id> --json', 'kexu render download <id> --out ./course.mp4 --json'],
      teacherAudio: [
        'kexu run <id> --until slides --json',
        '# teacher records in the browser (Trial mode)',
        'kexu run <id> --skip-audio --json'
      ]
    }
  });
}

/* ------------------------------------------------------------------ */
/* Command: projects                                                  */
/* ------------------------------------------------------------------ */

async function cmdProjectsList(opts) {
  const boot = await api('GET', '/api/bootstrap');
  if (state.json) {
    jsonOut({
      projects: boot.projects.map(summarizeProject),
      stats: boot.stats
    });
    return;
  }
  if (!boot.projects.length) {
    textOut('还没有课程项目。运行 kexu projects create --topic "..." 开始。');
    return;
  }
  for (const project of boot.projects) printProjectRow(project);
  const stats = boot.stats ?? {};
  textOut(
    dim(
      `\n共 ${boot.projects.length} 个课程 · ${stats.activeProjects ?? 0} 个进行中 · ${
        stats.renderedCourses ?? 0
      } 个已出片 · ${stats.confirmedScripts ?? 0} 份已确认讲稿`
    )
  );
}

async function cmdProjectsShow(args, opts) {
  const [id] = args;
  const project = await api('GET', `/api/projects/${id}`);
  if (state.json) {
    jsonOut(project);
    return;
  }
  printProject(project, { withSections: true });
  if (opts.wait) {
    const waited = await waitForRender(id, opts);
    textOut('');
    printProject(waited, { withSections: true });
  }
}

async function cmdProjectsCreate(args, opts) {
  const fromFile = opts.file ? await readJson(opts.file, '课程 JSON') : {};
  const positionalTopic = args.join(' ').trim();
  const topic = String(
    pick(opts.topic, fromFile.topic, positionalTopic) ?? ''
  ).trim();
  if (!topic) {
    usageError('缺少课程主题：请使用 --topic "主题"，或把主题作为位置参数');
  }
  const idea = opts['idea-file']
    ? (await readText(opts['idea-file'], '备课想法')).trim()
    : String(pick(opts.idea, fromFile.idea, '')).trim();
  const input = {
    title: String(pick(opts.title, fromFile.title, topic)).trim(),
    topic,
    subject: String(pick(opts.subject, fromFile.subject, '通识')).trim(),
    grade: String(pick(opts.grade, fromFile.grade, '未设置学段')).trim(),
    durationMinutes: Math.min(45, Math.max(3, toNumber(pick(opts.duration, fromFile.durationMinutes), 8))),
    mode: normalizeMode(pick(opts.mode, fromFile.mode, 'auto')),
    idea,
    valueGuide: String(pick(opts['value-guide'], fromFile.valueGuide, '')).trim(),
    learnerProfile: String(pick(opts['learner-profile'], fromFile.learnerProfile, '')).trim(),
    style: String(pick(opts.style, fromFile.style, '清晰、口语化、问题驱动')).trim()
  };
  const project = await api('POST', '/api/projects', input);
  if (state.json) {
    jsonOut(project);
    return;
  }
  textOut(`${green('已创建课程')} ${bold(project.title)}`);
  textOut(`${dim('ID')}      ${project.id}`);
  textOut(`${dim('配置')}    ${project.grade} · ${project.subject} · ${project.durationMinutes} 分钟 · ${modeLabel(project.mode)}`);
  textOut(`${dim('下一步')}  kexu script generate ${project.id}`);
}

async function cmdProjectsUpdate(args, opts) {
  const [id] = args;
  const patch = opts.file ? { ...(await readJson(opts.file, '更新 JSON')) } : {};
  const fields = [
    ['title', 'title'],
    ['topic', 'topic'],
    ['subject', 'subject'],
    ['grade', 'grade'],
    ['idea', 'idea'],
    ['value-guide', 'valueGuide'],
    ['learner-profile', 'learnerProfile'],
    ['style', 'style'],
    ['mode', 'mode']
  ];
  for (const [flag, key] of fields) {
    if (opts[flag] !== undefined) patch[key] = opts[flag];
  }
  if (opts.duration !== undefined) {
    patch.durationMinutes = Math.min(45, Math.max(3, toNumber(opts.duration, 8)));
  }
  if (patch.mode !== undefined) patch.mode = normalizeMode(patch.mode);
  if (!Object.keys(patch).length) usageError('没有提供要更新的字段（使用 --file 或具体选项）');
  const project = await api('PATCH', `/api/projects/${id}`, patch);
  if (state.json) {
    jsonOut(project);
    return;
  }
  textOut(`${green('已更新课程')} ${bold(project.title)} ${dim(`(${project.id})`)}`);
}

async function cmdProjectsDelete(args) {
  const [id] = args;
  const project = await api('GET', `/api/projects/${id}`);
  await api('DELETE', `/api/projects/${id}`);
  if (state.json) {
    jsonOut({ ok: true, id, title: project.title });
    return;
  }
  textOut(`${green('已删除课程')} ${project.title} ${dim(`(${id})`)}`);
}

/* ------------------------------------------------------------------ */
/* Command: script                                                    */
/* ------------------------------------------------------------------ */

async function cmdScriptShow(args) {
  const [id] = args;
  const project = await api('GET', `/api/projects/${id}`);
  if (!project.script) {
    throw new CliError('该课程还没有讲稿，请先执行 kexu script generate <id>');
  }
  if (state.json) {
    jsonOut({ projectId: id, script: project.script });
    return;
  }
  printScript(project.script, id);
}

async function cmdScriptGenerate(args, opts) {
  const [id] = args;
  const fromFile = opts.file ? await readJson(opts.file, '生成参数 JSON') : {};
  const payload = scriptOverrides(opts, fromFile);
  if (opts['idea-file']) {
    payload.idea = (await readText(opts['idea-file'], '备课想法')).trim();
  }
  const result = await api('POST', `/api/projects/${id}/script/generate`, payload);
  if (state.json) {
    jsonOut(result);
    return;
  }
  const script = result.project.script;
  textOut(`${green('讲稿已生成')} ${bold(result.project.title)}`);
  textOut(`${dim('ID')}      ${result.project.id}`);
  textOut(`${dim('版本')}    v${script.version} · ${script.sections.length} 段`);
  if (result.generation) {
    textOut(
      `${dim('引擎')}    ${result.generation.engine} · ${result.generation.provider}/${result.generation.model} · ${(
        result.generation.durationMs / 1000
      ).toFixed(1)}s`
    );
    for (const warning of result.generation.warnings ?? []) {
      textOut(`${dim('提示')}    ${yellow(warning)}`);
    }
  }
  textOut(`${dim('下一步')}  kexu script show ${id}  或  kexu script confirm ${id}`);
}

async function cmdScriptSave(args, opts) {
  const [id] = args;
  const file = opts.file ?? '-';
  const raw = await readJson(file, '讲稿 JSON');
  const script = raw?.script && Array.isArray(raw.script.sections) ? raw.script : raw;
  if (!Array.isArray(script?.sections) || !script.sections.length) {
    usageError('讲稿 JSON 必须包含非空 sections 数组');
  }
  const project = await api('POST', `/api/projects/${id}/actions`, {
    action: 'save-script',
    script,
    keepConfirmed: Boolean(opts['keep-confirmed'])
  });
  if (state.json) {
    jsonOut(project);
    return;
  }
  textOut(`${green('讲稿已保存')} v${project.script.version} · ${project.script.sections.length} 段`);
  textOut(
    `${dim('状态')}    ${project.script.confirmed ? '已确认' : '待确认（保存会重置后续生产）'}`
  );
}

async function cmdScriptConfirm(args) {
  const [id] = args;
  const project = await api('POST', `/api/projects/${id}/actions`, {
    action: 'confirm-script'
  });
  if (state.json) {
    jsonOut(project);
    return;
  }
  textOut(`${green('讲稿已确认')} ${bold(project.script.title)}`);
  textOut(`${dim('下一步')}  kexu slides generate ${id}`);
}

async function cmdScriptComment(args, opts) {
  const [id] = args;
  const fromFile = opts.file ? await readJson(opts.file, '意见 JSON') : {};
  const note = String(pick(opts.note, fromFile.note, '') ?? '').trim() === '-'
    ? (await readStdinText()).trim()
    : String(pick(opts.note, fromFile.note, '') ?? '').trim();
  if (!note) usageError('缺少修改意见：请使用 --note "..." 或 --file');
  const sectionId = pick(opts.section, fromFile.sectionId);
  const payload = {
    note,
    scope: sectionId ? 'section' : fromFile.scope === 'section' ? 'section' : 'script',
    sectionId,
    quote: String(pick(opts.quote, fromFile.quote, '') ?? '')
  };
  const result = await api('POST', `/api/projects/${id}/script/comments`, payload);
  if (state.json) {
    jsonOut(result);
    return;
  }
  textOut(`${green('已记录修改意见')} ${dim(result.comment.id)}`);
  textOut(`  ${result.comment.note}`);
  textOut(`${dim('下一步')}  kexu script comments ${id}`);
}

async function cmdScriptComments(args, opts) {
  const [id] = args;
  const status = String(opts.status ?? 'all');
  if (!['all', 'open', 'resolved'].includes(status)) {
    usageError('--status 必须是 open / resolved / all');
  }
  const project = await api('GET', `/api/projects/${id}`);
  if (!project.script) throw new CliError('该课程还没有讲稿');
  const comments = (project.script.comments ?? []).filter(
    (comment) => status === 'all' || comment.status === status
  );
  if (state.json) {
    jsonOut({ projectId: id, comments });
    return;
  }
  if (!comments.length) {
    textOut(status === 'all' ? '暂无修改意见' : `暂无 ${status} 状态的修改意见`);
    return;
  }
  const lines = [dim(`${comments.length} 条修改意见`)];
  for (const comment of comments) {
    const mark = comment.status === 'open' ? yellow('待处理') : green('已解决');
    const where = comment.sectionId ? `段落 ${comment.sectionId}` : '全篇';
    lines.push('');
    lines.push(`${mark} ${dim(comment.id)} · ${where}`);
    if (comment.quote) lines.push(`  ${dim('引用')} “${comment.quote}”`);
    lines.push(`  ${comment.note}`);
  }
  textOut(lines.join('\n'));
}

async function cmdScriptResolve(args, opts) {
  const [id, commentId] = args;
  const status = opts.status === 'open' ? 'open' : 'resolved';
  const result = await api('PATCH', `/api/projects/${id}/script/comments/${commentId}`, {
    status
  });
  if (state.json) {
    jsonOut(result);
    return;
  }
  textOut(
    `${green(status === 'resolved' ? '意见已标记为已解决' : '意见已重新打开')} ${dim(commentId)}`
  );
}

async function cmdScriptDeleteComment(args) {
  const [id, commentId] = args;
  const project = await api('DELETE', `/api/projects/${id}/script/comments/${commentId}`);
  if (state.json) {
    jsonOut({ ok: true, projectId: id, commentId, project });
    return;
  }
  textOut(`${green('已删除修改意见')} ${dim(commentId)}`);
}

/* ------------------------------------------------------------------ */
/* Command: slides                                                    */
/* ------------------------------------------------------------------ */

async function cmdSlidesList(args) {
  const [id] = args;
  const project = await api('GET', `/api/projects/${id}`);
  if (state.json) {
    jsonOut({ projectId: id, slides: project.slides });
    return;
  }
  printSlides(project.slides);
}

async function cmdSlidesGenerate(args) {
  const [id] = args;
  const project = await api('POST', `/api/projects/${id}/actions`, {
    action: 'generate-slides'
  });
  if (state.json) {
    jsonOut(project);
    return;
  }
  textOut(`${green('课件已生成')} ${project.slides.length} 页`);
  const generation = project.generation?.slides;
  if (generation) {
    textOut(
      `${dim('引擎')}    ${generation.engine} · ${generation.provider}/${generation.model} · ${(
        generation.durationMs / 1000
      ).toFixed(1)}s`
    );
    for (const warning of generation.warnings ?? []) {
      textOut(`${dim('提示')}    ${yellow(warning)}`);
    }
  }
  textOut(`${dim('下一步')}  kexu audio tts ${id}  或  kexu slides list ${id}`);
}

async function cmdSlidesUpdate(args, opts) {
  const [id, slideId] = args;
  const patch = opts.file ? { ...(await readJson(opts.file, '课件 JSON')) } : {};
  for (const key of ['title', 'eyebrow', 'note', 'layout', 'accent']) {
    if (opts[key] !== undefined) patch[key] = opts[key];
  }
  if (opts.seconds !== undefined) patch.seconds = toNumber(opts.seconds, 30);
  if (opts.bullets !== undefined) {
    patch.bullets = String(opts.bullets)
      .split(';;')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (!Object.keys(patch).length) {
    usageError('没有提供要修改的字段（使用 --file 或 --title/--note/--bullets 等）');
  }
  const project = await api('POST', `/api/projects/${id}/slides/${slideId}`, patch);
  if (state.json) {
    jsonOut(project);
    return;
  }
  const slide = project.slides.find((item) => item.id === slideId);
  textOut(`${green('课件页已更新')} ${slide ? slide.title : slideId} ${dim(`(${slideId})`)}`);
}

/* ------------------------------------------------------------------ */
/* Command: audio                                                     */
/* ------------------------------------------------------------------ */

async function cmdAudioList(args) {
  const [id] = args;
  const project = await api('GET', `/api/projects/${id}`);
  if (state.json) {
    jsonOut({ projectId: id, recordings: project.recordings });
    return;
  }
  printRecordings(project.recordings);
}

async function cmdAudioTts(args) {
  const [id] = args;
  logLine(`${dim('→')} 生成 AI 旁白（可能需要数十秒）`);
  const project = await api('POST', `/api/projects/${id}/actions`, {
    action: 'generate-tts'
  });
  const asset = project.recordings.find((item) => item.kind === 'tts');
  if (state.json) {
    jsonOut(project);
    return;
  }
  textOut(`${green('AI 旁白已生成')} ${asset ? `${fmtSeconds(asset.durationSeconds)} · ${asset.name}` : ''}`);
  if (asset) textOut(`${dim('ID')}      ${asset.id}`);
  textOut(`${dim('下一步')}  kexu render start ${id} --wait`);
}

async function cmdAudioUpload(args, opts) {
  const [id] = args;
  if (!opts.file) {
    usageError('缺少录音文件：--file <path|->');
  }
  let transcript = await resolveTranscript(opts);
  if (opts.file === '-' && opts['transcript-file'] === '-') {
    usageError('--file - 与 --transcript-file - 不能同时使用');
  }
  const buffer =
    opts.file === '-' ? await readStdinBuffer() : await readFile(path.resolve(opts.file));
  if (!buffer.length) usageError('录音文件为空');
  if (buffer.length > 55 * 1024 * 1024) {
    logLine(`${yellow('提示')} 录音超过 55 MB，base64 后可能超过服务端 80 MB 限制`);
  }
  const mime = opts.mime || inferMime(opts.file);
  const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
  let slideEvents = [];
  if (opts.events) {
    const raw = await readJson(opts.events, '翻页事件 JSON');
    const candidate = Array.isArray(raw) ? raw : raw.slideEvents ?? raw.events;
    if (!Array.isArray(candidate)) {
      usageError('翻页事件 JSON 必须是数组，或包含 slideEvents 数组');
    }
    slideEvents = candidate;
  }
  const kind = opts.kind === 'upload' ? 'upload' : 'teacher';
  const name =
    opts.name || (opts.file === '-' ? '教师录音.webm' : path.basename(opts.file));
  const result = await api('POST', `/api/projects/${id}/recordings`, {
    dataUrl,
    name,
    kind,
    transcript,
    durationSeconds: Math.max(0, toNumber(opts.duration, 0)),
    slideEvents
  });
  if (state.json) {
    jsonOut(result);
    return;
  }
  const asset = result.asset;
  textOut(`${green('录音已保存')} ${asset.name} · ${fmtSeconds(asset.durationSeconds)}`);
  textOut(`${dim('ID')}      ${asset.id}`);
  if (asset.alignmentMethod) {
    textOut(
      `${dim('对齐')}    ${asset.alignmentMethod} · 置信度 ${Math.round(
        Number(asset.alignmentConfidence ?? asset.alignment ?? 0)
      )}%`
    );
  }
  textOut(`${dim('下一步')}  kexu render start ${id} --wait`);
}

async function cmdAudioTranscript(args, opts) {
  const [id, recordingId] = args;
  let transcript = await resolveTranscript(opts);
  if (transcript === undefined) {
    usageError('缺少转写文本：--transcript "..." / --transcript-file <path|->');
  }
  const result = await api(
    'POST',
    `/api/projects/${id}/recordings/${recordingId}/transcript`,
    { transcript }
  );
  if (state.json) {
    jsonOut(result);
    return;
  }
  textOut(`${green('转写已更新')} ${recordingId}`);
  textOut(`${dim('对齐')}    ${result.asset.alignmentMethod ?? '—'}`);
}

/* ------------------------------------------------------------------ */
/* Command: render                                                    */
/* ------------------------------------------------------------------ */

async function cmdRenderStart(args, opts) {
  const [id] = args;
  const body = { action: 'assemble' };
  if (opts.audio) body.audioAssetId = opts.audio;
  const project = await api('POST', `/api/projects/${id}/actions`, body);
  if (state.json && (opts['no-wait'] || !opts.wait)) {
    jsonOut(project);
    return;
  }
  if (opts.wait) {
    const finished = await waitForRender(id, opts);
    if (state.json) {
      jsonOut(finished);
      return;
    }
    printProject(finished);
    return;
  }
  if (state.json) {
    jsonOut(project);
    return;
  }
  textOut(`${green('渲染已启动')} ${bold(project.title)}`);
  textOut(`${dim('状态')}    ${renderStatusText(project.render)}`);
  textOut(`${dim('下一步')}  kexu render status ${id} --wait`);
}

async function cmdRenderStatus(args, opts) {
  const [id] = args;
  const project = opts.wait ? await waitForRender(id, opts) : await api('GET', `/api/projects/${id}`);
  const render = project.render;
  if (state.json) {
    jsonOut({
      id,
      title: project.title,
      render: render ?? null,
      timeline: project.timeline ?? null,
      downloadReady: Boolean(render?.downloadReady),
      downloadUrl: absoluteUrl(render?.downloadUrl)
    });
    return;
  }
  textOut(bold(project.title));
  if (!render) {
    textOut(`${dim('状态')}    未开始，请执行 kexu render start ${id}`);
    return;
  }
  textOut(`${dim('状态')}    ${renderStatusText(render)} ${render.stageMessage ?? ''}`.trim());
  textOut(`${dim('格式')}    ${render.resolution} · ${render.format}`);
  if (render.error) textOut(`${dim('错误')}    ${red(render.error)}`);
  if (render.downloadReady) {
    textOut(`${dim('下载')}    ${absoluteUrl(render.downloadUrl)}`);
    textOut(`${dim('导出')}    kexu render download ${id} --out ./${id}.mp4`);
  }
  printTimeline(project.timeline);
}

async function cmdRenderWait(args, opts) {
  const [id] = args;
  const project = await waitForRender(id, opts);
  if (state.json) {
    jsonOut(project);
    return;
  }
  printProject(project);
}

async function cmdRenderDownload(args, opts) {
  const [id] = args;
  const project = await api('GET', `/api/projects/${id}`);
  const render = project.render;
  if (!render?.downloadReady || !render.downloadUrl) {
    throw new CliError(
      render?.status === 'running'
        ? '成片仍在渲染，请使用 kexu render status <id> --wait 等待完成'
        : '成片尚未就绪，请先执行 kexu render start <id> --wait'
    );
  }
  const url = absoluteUrl(render.downloadUrl);
  const remoteName = (() => {
    try {
      return path.basename(new URL(url).pathname) || 'course.mp4';
    } catch {
      return 'course.mp4';
    }
  })();
  let out = opts.out || `${id}.mp4`;
  if (opts.out && (opts.out.endsWith('/') || opts.out.endsWith('\\'))) {
    out = path.join(opts.out, remoteName);
  }
  const target = path.resolve(out);
  if (!opts.force) {
    try {
      await stat(target);
      throw new CliError(`文件已存在：${target}（如需覆盖请加 --force）`);
    } catch (error) {
      if (error instanceof CliError) throw error;
      if (error.code !== 'ENOENT') throw error;
    }
  }
  logLine(`${dim('下载')} ${url}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new CliError(`下载失败：HTTP ${response.status} ${response.statusText}`);
  }
  await mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.part`;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temp));
  await rename(temp, target);
  const info = await stat(target);
  if (!info.size) throw new CliError('下载完成的文件为空');
  if (state.json) {
    jsonOut({ ok: true, projectId: id, path: target, bytes: info.size, url });
    return;
  }
  textOut(`${green('成片已下载')} ${target} · ${fmtBytes(info.size)}`);
}

async function cmdRenderPublish(args) {
  const [id] = args;
  const project = await api('POST', `/api/projects/${id}/actions`, { action: 'publish' });
  if (state.json) {
    jsonOut(project);
    return;
  }
  textOut(`${green('课程已发布')} ${bold(project.title)}`);
}

/* ------------------------------------------------------------------ */
/* Command: run / advance                                             */
/* ------------------------------------------------------------------ */

function nextActionFor(project, opts, ctx) {
  if (ctx.regenerateScript) return { action: 'generate-script' };
  if (!project.script?.sections?.length) return { action: 'generate-script' };
  if (!project.script.confirmed) return { action: 'confirm-script' };
  if (ctx.regenerateSlides) return { action: 'generate-slides' };
  if (!project.slides.length) return { action: 'generate-slides' };

  if (!opts['skip-audio']) {
    const preferred = opts.audio
      ? project.recordings.find((asset) => asset.id === opts.audio)
      : null;
    if (opts.audio && !preferred) throw new CliError(`录音不存在：${opts.audio}`);
    const hasTts = project.recordings.some((asset) => asset.kind === 'tts' && asset.fileName);
    const hasTeacher = project.recordings.some(
      (asset) => asset.kind !== 'tts' && asset.fileName
    );
    if (!preferred) {
      if (project.mode === 'auto') {
        if (!hasTts) return { action: 'generate-tts' };
      } else if (!hasTts && !hasTeacher) {
        return { action: 'needs-teacher-audio' };
      }
    }
  }

  if (project.render?.downloadReady) return null;
  if (project.render?.status === 'running') return { action: 'wait-render' };
  return { action: 'start-render' };
}

async function performAction(action, project, opts, ctx) {
  switch (action) {
    case 'generate-script': {
      ctx.regenerateScript = false;
      const payload = scriptOverrides(opts, {});
      if (opts['idea-file']) {
        payload.idea = (await readText(opts['idea-file'], '备课想法')).trim();
      }
      const result = await api('POST', `/api/projects/${project.id}/script/generate`, payload);
      return { project: result.project, generation: result.generation };
    }
    case 'confirm-script':
      return {
        project: await api('POST', `/api/projects/${project.id}/actions`, {
          action: 'confirm-script'
        })
      };
    case 'generate-slides': {
      ctx.regenerateSlides = false;
      return {
        project: await api('POST', `/api/projects/${project.id}/actions`, {
          action: 'generate-slides'
        })
      };
    }
    case 'generate-tts':
      return {
        project: await api('POST', `/api/projects/${project.id}/actions`, {
          action: 'generate-tts'
        })
      };
    case 'start-render': {
      const body = { action: 'assemble' };
      if (opts.audio) body.audioAssetId = opts.audio;
      const started = await api('POST', `/api/projects/${project.id}/actions`, body);
      if (opts['no-wait']) return { project: started };
      return { project: await waitForRender(project.id, opts) };
    }
    case 'wait-render':
      return { project: await waitForRender(project.id, opts) };
    default:
      throw new CliError(`未知生产动作：${action}`);
  }
}

async function advanceOnce(id, opts) {
  const ctx = {
    regenerateScript: Boolean(opts.regenerate),
    regenerateSlides: Boolean(opts['regenerate-slides'])
  };
  const project = await api('GET', `/api/projects/${id}`);
  const next = nextActionFor(project, opts, ctx);
  if (!next) {
    return { project, action: null, next: null };
  }
  if (next.action === 'needs-teacher-audio') {
    return { project, action: null, next };
  }
  logLine(`${dim('→')} ${ACTION_LABEL[next.action] ?? next.action}`);
  const result = await performAction(next.action, project, opts, ctx);
  const after = nextActionFor(result.project, opts, ctx);
  return {
    project: result.project,
    action: next.action,
    generation: result.generation,
    next: after
  };
}

async function cmdAdvance(args, opts) {
  const [id] = args;
  const result = await advanceOnce(id, opts);
  const status = result.next?.action === 'needs-teacher-audio'
    ? 'blocked'
    : result.action
    ? 'advanced'
    : 'completed';
  if (state.json) {
    jsonOut({
      ok: true,
      status,
      action: result.action,
      next: result.next?.action ?? null,
      project: result.project
    });
    return;
  }
  if (!result.action) {
    if (result.next?.action === 'needs-teacher-audio') {
      textOut(yellow('需要教师试讲录音，请在前端「教师试讲」中完成录制后再继续'));
      return;
    }
    textOut(green('该课程已经完成全部生产步骤'));
    printProject(result.project);
    return;
  }
  textOut(`${green('已完成')} ${ACTION_LABEL[result.action] ?? result.action}`);
  printProject(result.project);
  if (result.next?.action === 'needs-teacher-audio') {
    textOut(yellow('下一步需要教师试讲录音（前端全屏试讲）'));
  } else if (result.next) {
    textOut(`${dim('下一步')}  kexu projects advance ${id}`);
  }
}

async function cmdRun(args, opts) {
  const [id] = args;
  const until = normalizeUntil(opts.until);
  const ctx = {
    regenerateScript: Boolean(opts.regenerate),
    regenerateSlides: Boolean(opts['regenerate-slides'])
  };
  const steps = [];
  let status = 'completed';
  let finalProject = await api('GET', `/api/projects/${id}`);

  for (let index = 0; index < 12; index += 1) {
    const project = await api('GET', `/api/projects/${id}`);
    finalProject = project;
    const next = nextActionFor(project, opts, ctx);
    if (!next) {
      steps.push({ action: 'done', at: new Date().toISOString() });
      break;
    }
    if (next.action === 'needs-teacher-audio') {
      steps.push({
        action: 'needs-teacher-audio',
        at: new Date().toISOString(),
        message: '该模式需要教师试讲录音，请在前端完成录制'
      });
      status = 'blocked';
      break;
    }
    if (STAGE_RANK[actionStage(next.action)] > STAGE_RANK[until]) {
      steps.push({
        action: 'stop',
        at: new Date().toISOString(),
        message: `已到达 --until ${until}`
      });
      status = 'stopped';
      break;
    }
    logLine(`${dim('→')} ${ACTION_LABEL[next.action] ?? next.action}`);
    const result = await performAction(next.action, project, opts, ctx);
    finalProject = result.project;
    steps.push({ action: next.action, at: new Date().toISOString() });
    if (next.action === 'start-render' && opts['no-wait']) {
      status = 'started';
      break;
    }
  }

  if (opts.publish && finalProject.render?.downloadReady) {
    finalProject = await api('POST', `/api/projects/${id}/actions`, { action: 'publish' });
    steps.push({ action: 'publish', at: new Date().toISOString() });
  }

  if (state.json) {
    jsonOut({ ok: true, status, steps, project: finalProject });
    return;
  }
  printProject(finalProject);
  if (status === 'blocked') {
    textOut(yellow('\n需要教师试讲录音：请在前端打开「教师试讲」，完成录制后运行 kexu run <id> --skip-audio'));
  } else if (status === 'stopped') {
    textOut(dim(`\n已停在 ${until} 阶段，可继续运行 kexu run ${id} --until ${until === 'script' ? 'slides' : 'render'}`));
  } else if (status === 'started') {
    textOut(dim(`\n渲染已在后台启动，查看进度：kexu render status ${id} --wait`));
  } else if (finalProject.render?.downloadReady) {
    textOut(dim(`\n下载成片：kexu render download ${id} --out ./${id}.mp4`));
  }
}

/* ------------------------------------------------------------------ */
/* Command: agents / skills / settings / model                        */
/* ------------------------------------------------------------------ */

async function findBootstrapItem(kind, id) {
  const boot = await api('GET', '/api/bootstrap');
  const item = boot[kind].find((entry) => entry.id === id);
  if (!item) throw new CliError(`${kind === 'agents' ? '智能体' : 'Skill'}不存在：${id}`, { status: 404 });
  return { boot, item };
}

async function cmdAgentsList() {
  const boot = await api('GET', '/api/bootstrap');
  if (state.json) {
    jsonOut({ agents: boot.agents });
    return;
  }
  const lines = [];
  for (const agent of boot.agents) {
    lines.push(
      `${bold(agent.name)} ${dim(`[${agent.id}]`)} · ${agent.role} · ${
        agent.status === 'active' ? green('启用') : yellow('暂停')
      }`
    );
    lines.push(
      `  ${dim('技能')} ${agent.skillIds.length} · ${dim('运行')} ${agent.runs} 次 · ${dim('最近')} ${agent.lastRun}`
    );
  }
  textOut(lines.join('\n') || '暂无智能体');
}

async function cmdAgentsShow(args) {
  const [id] = args;
  const { item } = await findBootstrapItem('agents', id);
  if (state.json) {
    jsonOut(item);
    return;
  }
  textOut(`${bold(item.name)} ${dim(`[${item.id}]`)}`);
  textOut(`${dim('职责')}    ${item.role}`);
  textOut(`${dim('说明')}    ${item.description}`);
  textOut(`${dim('状态')}    ${item.status === 'active' ? green('启用') : yellow('暂停')}`);
  textOut(`${dim('模型')}    ${item.model}`);
  textOut(`${dim('技能')}    ${item.skillIds.join(' / ') || '无'}`);
  textOut(`${dim('运行')}    ${item.runs} 次 · ${item.lastRun}`);
}

async function cmdAgentsRun(args, opts) {
  const [id] = args;
  const input =
    opts.input === '-'
      ? (await readStdinText()).trim()
      : opts.input !== undefined
      ? String(opts.input).trim()
      : opts.file
      ? (await readText(opts.file, '试运行输入')).trim()
      : '';
  if (!input) usageError('缺少试运行输入：--input "..." 或 --file <path|->');
  logLine(`${dim('→')} 运行智能体 ${id}`);
  const result = await api('POST', `/api/agents/${id}/run`, { input });
  if (state.json) {
    jsonOut(result);
    return;
  }
  textOut(`${green('智能体运行完成')} ${bold(result.agent.name)}`);
  for (const step of result.trace ?? []) {
    textOut(`  ${dim('·')} ${step.label} ${dim(`(${step.durationMs}ms)`)}`);
  }
  textOut('');
  textOut(result.output);
}

async function cmdSkillsList() {
  const boot = await api('GET', '/api/bootstrap');
  if (state.json) {
    jsonOut({ skills: boot.skills });
    return;
  }
  const lines = [];
  for (const skill of boot.skills) {
    lines.push(
      `${bold(skill.name)} ${dim(`[${skill.id}]`)} · ${skill.category} · ${
        skill.enabled ? green('启用') : yellow('停用')
      }`
    );
    lines.push(`  ${dim('输入')} ${skill.inputHint} → ${dim('输出')} ${skill.outputHint}`);
  }
  textOut(lines.join('\n') || '暂无 Skill');
}

async function cmdSkillsShow(args) {
  const [id] = args;
  const { item } = await findBootstrapItem('skills', id);
  if (state.json) {
    jsonOut(item);
    return;
  }
  textOut(`${bold(item.name)} ${dim(`[${item.id}]`)}`);
  textOut(`${dim('分类')}    ${item.category}`);
  textOut(`${dim('说明')}    ${item.description}`);
  textOut(`${dim('状态')}    ${item.enabled ? green('启用') : yellow('停用')}`);
  textOut(`${dim('版本')}    ${item.version} · ${item.model}`);
  textOut(`${dim('输入')}    ${item.inputHint}`);
  textOut(`${dim('输出')}    ${item.outputHint}`);
  textOut(`${dim('运行')}    ${item.runs} 次 · ${item.latencyMs}ms`);
}

async function cmdSkillsRun(args, opts) {
  const [id] = args;
  const input =
    opts.input === '-'
      ? (await readStdinText()).trim()
      : opts.input !== undefined
      ? String(opts.input).trim()
      : opts.file
      ? (await readText(opts.file, '试运行输入')).trim()
      : '';
  if (!input) usageError('缺少试运行输入：--input "..." 或 --file <path|->');
  logLine(`${dim('→')} 运行 Skill ${id}`);
  const result = await api('POST', `/api/skills/${id}/run`, { input });
  if (state.json) {
    jsonOut(result);
    return;
  }
  textOut(`${green('Skill 运行完成')} ${bold(result.skill.name)}`);
  textOut('');
  textOut(result.output);
}

async function cmdSettingsShow() {
  const boot = await api('GET', '/api/bootstrap');
  if (state.json) {
    jsonOut({ settings: boot.settings, capabilities: boot.capabilities });
    return;
  }
  const settings = boot.settings;
  textOut(bold('运行设置'));
  textOut(
    `${dim('模型')}      ${settings.modelName} · ${settings.modelProtocol} · ${settings.modelBaseUrl}`
  );
  textOut(`${dim('密钥')}      ${settings.apiKeyConfigured ? green('已配置') : yellow('未配置')}`);
  textOut(
    `${dim('超时')}      ${Math.round(settings.requestTimeoutMs / 1000)}s · 重试 ${settings.maxRetries} 次`
  );
  textOut(`${dim('兜底')}      ${settings.allowLocalFallback ? '允许本地兜底' : '禁用本地兜底'}`);
  textOut(
    `${dim('TTS')}       ${settings.ttsEngine} · ${settings.ttsVoice} · ${settings.ttsRate > 0 ? '+' : ''}${settings.ttsRate}%`
  );
  textOut(`${dim('试讲画面')}  ${settings.recordTeacherVideo ? '录制教师画面' : '仅录制声音'}`);
  textOut(`${dim('媒体目录')}  ${boot.capabilities.mediaRoot}`);
}

async function cmdSettingsUpdate(_args, opts) {
  const payload = opts.file ? { ...(await readJson(opts.file, '设置 JSON')) } : {};
  if (opts['model-name']) payload.modelName = opts['model-name'];
  if (opts['model-base-url']) payload.modelBaseUrl = opts['model-base-url'];
  if (opts['api-key']) payload.apiKey = opts['api-key'];
  if (opts['tts-engine']) payload.ttsEngine = opts['tts-engine'];
  if (opts['tts-voice']) payload.ttsVoice = opts['tts-voice'];
  if (opts['tts-rate'] !== undefined) payload.ttsRate = toNumber(opts['tts-rate'], 0);
  if (opts['record-teacher-video'] !== undefined) {
    const value = String(opts['record-teacher-video']).toLowerCase();
    if (!['on', 'off', 'true', 'false', '1', '0'].includes(value)) {
      usageError('--record-teacher-video 只接受 on / off');
    }
    payload.recordTeacherVideo = ['on', 'true', '1'].includes(value);
  }
  if (!Object.keys(payload).length) usageError('没有提供要更新的设置（使用 --file 或具体选项）');
  const settings = await api('PATCH', '/api/settings', payload);
  if (state.json) {
    jsonOut(settings);
    return;
  }
  textOut(`${green('设置已更新')} · ${settings.modelName} · ${settings.apiKeyConfigured ? '密钥已配置' : '密钥未配置'}`);
}

async function cmdModelTest(_args, opts) {
  const payload = opts.file ? await readJson(opts.file, '模型测试 JSON') : {};
  logLine(`${dim('→')} 测试模型连接`);
  const result = await api('POST', '/api/settings/model/test', payload);
  if (state.json) {
    jsonOut(result);
    return;
  }
  textOut(
    `${result.ok ? green('连接正常') : red('连接失败')} · ${result.provider}/${result.model} · ${result.latencyMs}ms`
  );
  textOut(`  ${result.message}`);
}

/* ------------------------------------------------------------------ */
/* Routes                                                             */
/* ------------------------------------------------------------------ */

const ROUTES = [
  {
    path: 'health',
    summary: '检查 API 服务与能力',
    args: [],
    options: [],
    api: ['GET /api/health'],
    examples: ['kexu health', 'kexu health --json'],
    run: cmdHealth
  },
  {
    path: 'doctor',
    summary: '诊断环境、模型、TTS 与渲染依赖',
    args: [],
    options: [],
    api: ['GET /api/health'],
    examples: ['kexu doctor', 'kexu doctor --json'],
    run: cmdDoctor
  },
  {
    path: 'schema',
    summary: '输出完整命令规格 JSON（供 Agent 自描述）',
    args: [],
    options: [],
    api: [],
    examples: ['kexu schema'],
    run: cmdSchema
  },
  {
    path: 'projects list',
    summary: '列出课程项目',
    args: [],
    options: [],
    api: ['GET /api/bootstrap'],
    examples: ['kexu projects list --json'],
    run: cmdProjectsList
  },
  {
    path: 'projects show',
    summary: '查看课程详情',
    args: ['id'],
    options: [OPT.wait, OPT.interval, OPT.waitTimeout],
    api: ['GET /api/projects/:id'],
    examples: ['kexu projects show project-xxx'],
    run: cmdProjectsShow
  },
  {
    path: 'projects create',
    summary: '创建课程项目',
    args: [],
    allowExtra: true,
    options: [
      OPT.topic,
      OPT.title,
      OPT.subject,
      OPT.grade,
      OPT.duration,
      OPT.mode,
      OPT.idea,
      OPT.ideaFile,
      OPT.valueGuide,
      OPT.learnerProfile,
      OPT.style,
      OPT.file
    ],
    api: ['POST /api/projects'],
    examples: [
      'kexu projects create --topic "为什么天空是蓝色的" --grade 初中 --subject 物理',
      'kexu projects create "杠杆原理" --mode ppt --json'
    ],
    run: cmdProjectsCreate
  },
  {
    path: 'projects update',
    summary: '修改课程基础信息',
    args: ['id'],
    options: [
      OPT.title,
      OPT.topic,
      OPT.subject,
      OPT.grade,
      OPT.duration,
      OPT.mode,
      OPT.idea,
      OPT.valueGuide,
      OPT.learnerProfile,
      OPT.style,
      OPT.file
    ],
    api: ['PATCH /api/projects/:id'],
    examples: ['kexu projects update project-xxx --grade 高中'],
    run: cmdProjectsUpdate
  },
  {
    path: 'projects delete',
    summary: '删除课程项目',
    args: ['id'],
    options: [],
    api: ['DELETE /api/projects/:id'],
    examples: ['kexu projects delete project-xxx'],
    run: cmdProjectsDelete
  },
  {
    path: 'projects advance',
    summary: '执行下一个待完成的生产步骤',
    args: ['id'],
    options: [
      OPT.regenerate,
      OPT.regenerateSlides,
      OPT.skipAudio,
      OPT.audio,
      OPT.noWait,
      OPT.interval,
      OPT.waitTimeout,
      OPT.topic,
      OPT.idea,
      OPT.ideaFile,
      OPT.valueGuide,
      OPT.learnerProfile,
      OPT.subject,
      OPT.grade,
      OPT.duration,
      OPT.style,
      OPT.mode
    ],
    api: ['GET /api/projects/:id', 'POST /api/projects/:id/actions'],
    examples: ['kexu projects advance project-xxx --json'],
    run: cmdAdvance
  },
  {
    path: 'script show',
    summary: '查看完整讲稿',
    args: ['id'],
    options: [],
    api: ['GET /api/projects/:id'],
    examples: ['kexu script show project-xxx', 'kexu script show project-xxx --json'],
    run: cmdScriptShow
  },
  {
    path: 'script generate',
    summary: '基于主题与想法生成结构化讲稿',
    args: ['id'],
    options: [
      OPT.topic,
      OPT.idea,
      OPT.ideaFile,
      OPT.valueGuide,
      OPT.learnerProfile,
      OPT.subject,
      OPT.grade,
      OPT.duration,
      OPT.style,
      OPT.mode,
      OPT.file
    ],
    api: ['POST /api/projects/:id/script/generate'],
    examples: [
      'kexu script generate project-xxx --topic "杠杆原理" --grade 初中',
      'Get-Content idea.md -Raw | kexu script generate project-xxx --idea-file -'
    ],
    run: cmdScriptGenerate
  },
  {
    path: 'script save',
    summary: '保存教师修改后的讲稿',
    args: ['id'],
    options: [OPT.file, OPT.keepConfirmed],
    api: ['POST /api/projects/:id/actions (save-script)'],
    examples: [
      'kexu script save project-xxx --file script.json',
      'Get-Content script.json -Raw | kexu script save project-xxx --file -'
    ],
    run: cmdScriptSave
  },
  {
    path: 'script confirm',
    summary: '确认讲稿，进入课件阶段',
    args: ['id'],
    options: [],
    api: ['POST /api/projects/:id/actions (confirm-script)'],
    examples: ['kexu script confirm project-xxx'],
    run: cmdScriptConfirm
  },
  {
    path: 'script comment',
    summary: '提交一条讲稿修改意见',
    args: ['id'],
    options: [OPT.note, OPT.section, OPT.quote, OPT.file],
    api: ['POST /api/projects/:id/script/comments'],
    examples: [
      'kexu script comment project-xxx --note "开场再口语一些"',
      'kexu script comment project-xxx --section section-2 --quote "..." --note "换一个例子"'
    ],
    run: cmdScriptComment
  },
  {
    path: 'script comments',
    summary: '查看讲稿修改意见',
    args: ['id'],
    options: [OPT.status],
    api: ['GET /api/projects/:id'],
    examples: ['kexu script comments project-xxx --status open'],
    run: cmdScriptComments
  },
  {
    path: 'script resolve',
    summary: '把修改意见标记为已解决（--status open 可重新打开）',
    args: ['id', 'commentId'],
    options: [OPT.status],
    api: ['PATCH /api/projects/:id/script/comments/:commentId'],
    examples: ['kexu script resolve project-xxx comment-xxx'],
    run: cmdScriptResolve
  },
  {
    path: 'script reopen',
    summary: '重新打开一条修改意见',
    args: ['id', 'commentId'],
    options: [],
    api: ['PATCH /api/projects/:id/script/comments/:commentId'],
    examples: ['kexu script reopen project-xxx comment-xxx'],
    run: async (args, opts) => cmdScriptResolve(args, { ...opts, status: 'open' })
  },
  {
    path: 'script delete-comment',
    summary: '删除一条修改意见',
    args: ['id', 'commentId'],
    options: [],
    api: ['DELETE /api/projects/:id/script/comments/:commentId'],
    examples: ['kexu script delete-comment project-xxx comment-xxx'],
    run: cmdScriptDeleteComment
  },
  {
    path: 'slides list',
    summary: '查看课件页面',
    args: ['id'],
    options: [],
    api: ['GET /api/projects/:id'],
    examples: ['kexu slides list project-xxx'],
    run: cmdSlidesList
  },
  {
    path: 'slides generate',
    summary: '根据已确认讲稿生成 PPT 课件',
    args: ['id'],
    options: [],
    api: ['POST /api/projects/:id/actions (generate-slides)'],
    examples: ['kexu slides generate project-xxx --json'],
    run: cmdSlidesGenerate
  },
  {
    path: 'slides update',
    summary: '修改单页课件',
    args: ['id', 'slideId'],
    options: [OPT.file, OPT.title, OPT.eyebrow, OPT.note, OPT.layout, OPT.accent, OPT.seconds, OPT.bullets],
    api: ['POST /api/projects/:id/slides/:slideId'],
    examples: ['kexu slides update project-xxx slide-1 --title "新标题" --note "..."'],
    run: cmdSlidesUpdate
  },
  {
    path: 'audio list',
    summary: '查看录音与对齐信息',
    args: ['id'],
    options: [],
    api: ['GET /api/projects/:id'],
    examples: ['kexu audio list project-xxx'],
    run: cmdAudioList
  },
  {
    path: 'audio tts',
    summary: '生成 AI 旁白',
    args: ['id'],
    options: [],
    api: ['POST /api/projects/:id/actions (generate-tts)'],
    examples: ['kexu audio tts project-xxx'],
    run: cmdAudioTts
  },
  {
    path: 'audio upload',
    summary: '上传教师录音（可带转写与翻页事件）',
    args: ['id'],
    options: [
      OPT.file,
      OPT.name,
      OPT.kind,
      OPT.mime,
      OPT.transcript,
      OPT.transcriptFile,
      OPT.events,
      OPT.duration
    ],
    api: ['POST /api/projects/:id/recordings'],
    examples: [
      'kexu audio upload project-xxx --file take.webm --transcript "..." --events events.json',
      'kexu audio upload project-xxx --file - --mime audio/webm < take.webm'
    ],
    run: cmdAudioUpload
  },
  {
    path: 'audio transcript',
    summary: '更新录音转写并重新对齐',
    args: ['id', 'recordingId'],
    options: [OPT.transcript, OPT.transcriptFile],
    api: ['POST /api/projects/:id/recordings/:recordingId/transcript'],
    examples: ['kexu audio transcript project-xxx rec-xxx --transcript "..."'],
    run: cmdAudioTranscript
  },
  {
    path: 'render start',
    summary: '启动成片渲染（可等待完成）',
    args: ['id'],
    options: [OPT.audio, OPT.wait, OPT.interval, OPT.waitTimeout],
    api: ['POST /api/projects/:id/actions (assemble)'],
    examples: ['kexu render start project-xxx --wait'],
    run: cmdRenderStart
  },
  {
    path: 'render status',
    summary: '查看渲染进度与时间轴',
    args: ['id'],
    options: [OPT.wait, OPT.interval, OPT.waitTimeout],
    api: ['GET /api/projects/:id'],
    examples: ['kexu render status project-xxx', 'kexu render status project-xxx --wait --json'],
    run: cmdRenderStatus
  },
  {
    path: 'render wait',
    summary: '等待渲染完成',
    args: ['id'],
    options: [OPT.interval, OPT.waitTimeout],
    api: ['GET /api/projects/:id'],
    examples: ['kexu render wait project-xxx'],
    run: cmdRenderWait
  },
  {
    path: 'render download',
    summary: '下载 MP4 成片',
    args: ['id'],
    options: [OPT.out, OPT.force],
    api: ['GET /api/projects/:id', 'GET /media/...'],
    examples: ['kexu render download project-xxx --out ./course.mp4'],
    run: cmdRenderDownload
  },
  {
    path: 'render publish',
    summary: '发布已渲染的课程',
    args: ['id'],
    options: [],
    api: ['POST /api/projects/:id/actions (publish)'],
    examples: ['kexu render publish project-xxx'],
    run: cmdRenderPublish
  },
  {
    path: 'run',
    summary: '一键推进：讲稿 → 确认 → 课件 → 声音 → 成片',
    args: ['id'],
    options: [
      OPT.until,
      OPT.regenerate,
      OPT.regenerateSlides,
      OPT.skipAudio,
      OPT.audio,
      OPT.noWait,
      OPT.publish,
      OPT.interval,
      OPT.waitTimeout,
      OPT.topic,
      OPT.idea,
      OPT.ideaFile,
      OPT.valueGuide,
      OPT.learnerProfile,
      OPT.subject,
      OPT.grade,
      OPT.duration,
      OPT.style,
      OPT.mode
    ],
    api: ['GET /api/projects/:id', 'POST /api/projects/:id/actions'],
    examples: [
      'kexu run project-xxx --json',
      'kexu run project-xxx --until slides',
      'kexu run project-xxx --skip-audio --publish'
    ],
    run: cmdRun
  },
  {
    path: 'agents list',
    summary: '列出智能体',
    args: [],
    options: [],
    api: ['GET /api/bootstrap'],
    examples: ['kexu agents list'],
    run: cmdAgentsList
  },
  {
    path: 'agents show',
    summary: '查看智能体',
    args: ['id'],
    options: [],
    api: ['GET /api/bootstrap'],
    examples: ['kexu agents show agent-xxx'],
    run: cmdAgentsShow
  },
  {
    path: 'agents run',
    summary: '试运行智能体',
    args: ['id'],
    options: [OPT.input, OPT.file],
    api: ['POST /api/agents/:id/run'],
    examples: ['kexu agents run agent-xxx --input "设计一节 8 分钟微课"'],
    run: cmdAgentsRun
  },
  {
    path: 'skills list',
    summary: '列出 Skill',
    args: [],
    options: [],
    api: ['GET /api/bootstrap'],
    examples: ['kexu skills list --json'],
    run: cmdSkillsList
  },
  {
    path: 'skills show',
    summary: '查看 Skill',
    args: ['id'],
    options: [],
    api: ['GET /api/bootstrap'],
    examples: ['kexu skills show skill-xxx'],
    run: cmdSkillsShow
  },
  {
    path: 'skills run',
    summary: '试运行 Skill',
    args: ['id'],
    options: [OPT.input, OPT.file],
    api: ['POST /api/skills/:id/run'],
    examples: ['kexu skills run skill-xxx --input "..."'],
    run: cmdSkillsRun
  },
  {
    path: 'settings show',
    summary: '查看运行设置与能力',
    args: [],
    options: [],
    api: ['GET /api/bootstrap'],
    examples: ['kexu settings show --json'],
    run: cmdSettingsShow
  },
  {
    path: 'settings update',
    summary: '更新模型 / TTS / 兜底设置',
    args: [],
    options: [
      OPT.file,
      OPT.modelName,
      OPT.modelBaseUrl,
      OPT.apiKey,
      OPT.ttsEngine,
      OPT.ttsVoice,
      OPT.ttsRate,
      OPT.recordTeacherVideo
    ],
    api: ['PATCH /api/settings'],
    examples: [
      'kexu settings update --tts-voice zh-CN-YunxiNeural',
      'kexu settings update --record-teacher-video on'
    ],
    run: cmdSettingsUpdate
  },
  {
    path: 'model test',
    summary: '测试模型连通性',
    args: [],
    options: [OPT.file],
    api: ['POST /api/settings/model/test'],
    examples: ['kexu model test', 'kexu model test --json'],
    run: cmdModelTest
  }
];

const ALIASES = {
  project: 'projects',
  agent: 'agents',
  skill: 'skills',
  slide: 'slides'
};

const GROUP_DESCRIPTIONS = {
  projects: '课程项目',
  script: '讲稿工坊',
  slides: '课件',
  audio: '声音与录音',
  render: '成片渲染',
  agents: '智能体',
  skills: '技能',
  settings: '运行设置',
  model: '模型连通性'
};

const STANDALONE = ['health', 'doctor', 'run', 'schema'];

function usageOf(route) {
  return `kexu ${route.path}${route.args.map((arg) => ` <${arg}>`).join('')}`;
}

function resolveRoute(positionals) {
  let best = null;
  for (const route of ROUTES) {
    const parts = route.path.split(' ');
    if (parts.length > positionals.length) continue;
    if (!parts.every((part, index) => part === positionals[index])) continue;
    if (!best || parts.length > best.parts.length) best = { route, parts };
  }
  if (!best) return null;
  return { route: best.route, rest: positionals.slice(best.parts.length) };
}

/* ------------------------------------------------------------------ */
/* Help                                                               */
/* ------------------------------------------------------------------ */

function printOptions(options) {
  const lines = [];
  const width = Math.min(
    28,
    Math.max(...options.map((item) => item.flag.length), 0) + 2
  );
  for (const item of options) {
    lines.push(`  ${item.flag.padEnd(width)}${item.description}`);
  }
  return lines;
}

function printGlobalOptions() {
  textOut(dim('全局选项'));
  textOut(printOptions(GLOBAL_OPTIONS).join('\n'));
}

function printRootHelp() {
  const lines = [];
  lines.push(`${bold('kexu')} ${VERSION} — 微课生产 CLI（Codex / 任意 Agent 可驱动）`);
  lines.push('');
  lines.push('用法');
  lines.push('  kexu <命令> [参数] [选项]');
  lines.push('');
  lines.push('命令');
  for (const name of STANDALONE) {
    const route = ROUTES.find((item) => item.path === name);
    if (route) lines.push(`  ${name.padEnd(12)}${route.summary}`);
  }
  for (const [group, description] of Object.entries(GROUP_DESCRIPTIONS)) {
    const subs = ROUTES.filter((route) => route.path.startsWith(`${group} `)).map((route) =>
      route.path.slice(group.length + 1)
    );
    lines.push(`  ${group.padEnd(12)}${description}（${subs.join(' / ')}）`);
  }
  lines.push('');
  lines.push(dim('全局选项'));
  lines.push(printOptions(GLOBAL_OPTIONS).join('\n'));
  lines.push('');
  lines.push(dim('示例'));
  lines.push('  kexu health --json');
  lines.push('  kexu projects create --topic "为什么天空是蓝色的" --grade 初中 --subject 物理');
  lines.push('  kexu run project-xxx --json');
  lines.push('  kexu render download project-xxx --out ./course.mp4');
  lines.push('  kexu schema');
  lines.push('');
  lines.push(dim('提示'));
  lines.push('  * --json 时 stdout 只输出 JSON，进度写入 stderr。');
  lines.push('  * 需要先启动 API：npm run dev 或 npm start。');
  lines.push('  * kexu schema 输出完整命令规格，Agent 可直接读取。');
  textOut(lines.join('\n'));
}

function printGroupHelp(group) {
  const routes = ROUTES.filter((route) => route.path.startsWith(`${group} `));
  if (!routes.length) return false;
  const lines = [];
  lines.push(`${bold(`kexu ${group}`)} — ${GROUP_DESCRIPTIONS[group] ?? ''}`);
  lines.push('');
  lines.push('用法');
  lines.push(`  kexu ${group} <子命令> [参数] [选项]`);
  lines.push('');
  lines.push('子命令');
  for (const route of routes) {
    const sub = route.path.slice(group.length + 1);
    const suffix = route.args.map((arg) => ` <${arg}>`).join('');
    lines.push(`  ${(sub + suffix).padEnd(30)}${route.summary}`);
  }
  textOut(lines.join('\n'));
  return true;
}

function printRouteHelp(route) {
  const lines = [];
  lines.push(`${bold(usageOf(route))}`);
  lines.push('');
  lines.push(route.summary);
  if (route.args.length) {
    lines.push('');
    lines.push(dim('参数'));
    for (const arg of route.args) lines.push(`  <${arg}>`);
  }
  if (route.options.length) {
    lines.push('');
    lines.push(dim('选项'));
    lines.push(printOptions(route.options).join('\n'));
  }
  lines.push('');
  lines.push(dim('全局选项'));
  lines.push(printOptions(GLOBAL_OPTIONS).join('\n'));
  if (route.api?.length) {
    lines.push('');
    lines.push(dim('对应 API'));
    for (const item of route.api) lines.push(`  ${item}`);
  }
  if (route.examples?.length) {
    lines.push('');
    lines.push(dim('示例'));
    for (const item of route.examples) lines.push(`  ${item}`);
  }
  textOut(lines.join('\n'));
}

/* ------------------------------------------------------------------ */
/* Entry                                                              */
/* ------------------------------------------------------------------ */

async function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: PARSE_OPTIONS,
      allowPositionals: true,
      strict: true
    });
  } catch (error) {
    throw new CliError(error.message, { code: 2 });
  }

  const opts = parsed.values;
  state.json = Boolean(opts.json) || process.env.KEXU_JSON === '1';
  state.quiet = Boolean(opts.quiet) || process.env.KEXU_QUIET === '1';
  state.color = state.color && !opts['no-color'];
  state.baseUrl = normalizeBaseUrl(
    opts['base-url'] || process.env.KEXU_BASE_URL || process.env.KEXU_API || DEFAULT_BASE_URL
  );
  state.timeoutMs = Math.max(1000, toNumber(opts.timeout, 300_000));

  if (opts.version) {
    textOut(`kexu ${VERSION}`);
    return;
  }

  const positionals = parsed.positionals.map((value, index) =>
    index === 0 ? ALIASES[value] ?? value : value
  );

  if (!positionals.length) {
    printRootHelp();
    return;
  }

  const resolved = resolveRoute(positionals);
  if (!resolved) {
    if (positionals.length === 1 && GROUP_DESCRIPTIONS[positionals[0]]) {
      printGroupHelp(positionals[0]);
      return;
    }
    throw new CliError(`未知命令：${positionals.join(' ')}`, { code: 2 });
  }

  if (opts.help) {
    printRouteHelp(resolved.route);
    return;
  }

  const { route, rest } = resolved;
  if (rest.length < route.args.length) {
    usageError(
      `缺少参数：${route.args.slice(rest.length).map((arg) => `<${arg}>`).join(' ')}`
    );
  }
  if (rest.length > route.args.length && !route.allowExtra) {
    usageError(`多余的参数：${rest.slice(route.args.length).join(' ')}`);
  }

  await route.run(rest, opts);
}

main(process.argv.slice(2)).catch((error) => {
  const cliError = error instanceof CliError ? error : new CliError(error?.message ?? String(error));
  const payload = { ok: false, error: cliError.message };
  if (cliError.status) payload.status = cliError.status;
  if (cliError.details !== undefined) payload.details = cliError.details;
  if (state.json) {
    process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stderr.write(`${red('错误')} ${cliError.message}\n`);
    if (cliError.code === 2) {
      process.stderr.write(`${dim('提示')} 运行 kexu --help 查看命令\n`);
    }
  }
  process.exitCode = cliError.code;
});
