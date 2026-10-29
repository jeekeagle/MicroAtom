import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  Capabilities,
  CourseProject,
  CourseSlide,
  RecordingAsset,
  RuntimeSettings,
  ScriptSection
} from '../src/types';
import { describeModelConfig, hasMimoApiKey } from './llm';
import { mediaRoot, serverScriptsRoot } from './paths';
import { MIMO_VOICES, synthesizeMimoAudio } from './speech';
import { buildCourseTimeline } from './timeline';

export { mediaRoot } from './paths';

const ffmpegCandidates = [
  process.env.FFMPEG_PATH,
  'ffmpeg',
  'C:\\Users\\wyg\\AppData\\Roaming\\LobsterAI\\huashu-motion\\tools\\ffmpeg\\bin\\ffmpeg.exe'
].filter(Boolean) as string[];

const ffprobeCandidates = [
  process.env.FFPROBE_PATH,
  'ffprobe',
  ffmpegCandidates[2]?.replace(/ffmpeg\.exe$/i, 'ffprobe.exe')
].filter(Boolean) as string[];

const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean) as string[];

const edgeVoices: Record<string, string> = {
  'zh-CN-XiaoxiaoNeural': '晓晓 · 温暖女声',
  'zh-CN-XiaoyiNeural': '晓伊 · 清亮女声',
  'zh-CN-YunxiNeural': '云希 · 沉稳男声',
  'zh-CN-YunjianNeural': '云健 · 叙述男声',
  'zh-CN-YunyangNeural': '云扬 · 新闻男声'
};

export const ttsVoiceOptions = Object.entries(edgeVoices).map(([id, label]) => ({ id, label }));
export const mimoVoiceOptions = MIMO_VOICES.map((voice) => ({ id: voice.id, label: voice.label }));

const edgeVoiceIds = new Set<string>(ttsVoiceOptions.map((voice) => voice.id));
const mimoVoiceIds = new Set<string>(mimoVoiceOptions.map((voice) => voice.id));

/** Keeps a stored voice compatible with the engine that is about to speak. */
export function voiceForEngine(engine: RuntimeSettings['ttsEngine'], requested?: string) {
  const voice = (requested || '').trim();
  if (engine === 'mimo') return mimoVoiceIds.has(voice) ? voice : 'mimo_default';
  if (engine === 'edge' || engine === 'sapi') {
    return edgeVoiceIds.has(voice) ? voice : 'zh-CN-XiaoxiaoNeural';
  }
  return voice;
}

const exists = (candidate: string) => {
  if (!candidate.includes(path.sep) && !candidate.includes('/') && !candidate.endsWith('.exe')) {
    return true;
  }
  return fs.existsSync(candidate);
};

export function detectCapabilities(settings: RuntimeSettings): Capabilities {
  const chrome = chromeCandidates.find((candidate) => fs.existsSync(candidate)) ?? '';
  const ffmpeg = ffmpegCandidates.find((candidate) => exists(candidate) && candidate !== 'ffmpeg') ?? ffmpegCandidates[0];
  const model = describeModelConfig(settings);
  return {
    tts: settings.ttsEngine === 'mimo' ? hasMimoApiKey() : settings.ttsEngine !== 'none',
    ttsEngine: settings.ttsEngine,
    ttsVoice: settings.ttsVoice,
    asrEngine: settings.asrEngine,
    mimoConfigured: hasMimoApiKey(),
    ffmpeg: Boolean(ffmpeg),
    chrome: Boolean(chrome),
    browserAsr: true,
    mediaRoot: '/media',
    modelConfigured: model.configured
  };
}

const safeSegment = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-');

export function projectMediaDir(projectId: string) {
  const dir = path.join(mediaRoot, safeSegment(projectId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function mediaUrl(projectId: string, relativePath: string) {
  return `/media/${safeSegment(projectId)}/${relativePath.split(path.sep).join('/')}`;
}

const runProcess = (
  command: string,
  args: string[],
  options: { cwd?: string; onLine?: (line: string) => void } = {}
) =>
  new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });
    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      output += text;
      options.onLine?.(text);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      errorOutput += text;
      options.onLine?.(text);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(errorOutput.trim() || `${command} exited with ${code}`));
      }
    });
  });

const findExecutable = (candidates: string[], versionFlag = '-version') =>
  candidates.find((candidate) => {
    if (candidate === 'ffmpeg' || candidate === 'ffprobe') return true;
    return fs.existsSync(candidate) && candidate.toLowerCase().includes(path.sep)
      ? true
      : fs.existsSync(candidate);
  }) ?? candidates[0];

export function getFfmpegPath() {
  return findExecutable(ffmpegCandidates);
}

export function getFfprobePath() {
  return findExecutable(ffprobeCandidates);
}

export async function probeDuration(filePath: string, fallback = 0) {
  try {
    const output = await runProcess(getFfprobePath(), [
      '-v',
      'error',
      '-show_entries',
      'format=duration:stream=duration',
      '-of',
      'json',
      filePath
    ]);
    const parsed = JSON.parse(output) as {
      format?: { duration?: string };
      streams?: Array<{ duration?: string }>;
    };
    const candidates = [
      parsed.format?.duration,
      ...(parsed.streams ?? []).map((stream) => stream.duration)
    ];
    for (const candidate of candidates) {
      const duration = Number.parseFloat(String(candidate));
      if (Number.isFinite(duration) && duration > 0) return duration;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

async function synthesizeWithEdge(
  projectDir: string,
  section: ScriptSection,
  settings: RuntimeSettings,
  index: number
) {
  const output = path.join(projectDir, 'tts', `section-${String(index + 1).padStart(2, '0')}.mp3`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const rate = Math.round(settings.ttsRate ?? 0);
  const rateArg = `${rate >= 0 ? '+' : ''}${rate}%`;
  await runProcess('python', [
    '-m',
    'edge_tts',
    '--voice',
    voiceForEngine('edge', settings.ttsVoice),
    `--rate=${rateArg}`,
    '--text',
    section.narration,
    '--write-media',
    output
  ]);
  return output;
}

async function synthesizeWithSapi(
  projectDir: string,
  sections: ScriptSection[],
  index: number
) {
  const output = path.join(projectDir, 'tts', `section-${String(index + 1).padStart(2, '0')}.wav`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const jobFile = path.join(projectDir, 'tts', `sapi-${index + 1}.json`);
  fs.writeFileSync(
    jobFile,
    JSON.stringify({
      voice: 'Microsoft Huihui Desktop',
      rate: 0,
      segments: [{ text: sections[index].narration, output }]
    }),
    'utf8'
  );
  const scriptPath = path.join(serverScriptsRoot, 'synthesize.ps1');
  await runProcess('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath,
    '-InputFile',
    jobFile
  ]);
  return output;
}

async function synthesizeWithMimo(
  projectDir: string,
  section: ScriptSection,
  settings: RuntimeSettings,
  index: number
) {
  const output = path.join(projectDir, 'tts', `section-${String(index + 1).padStart(2, '0')}.mp3`);
  await synthesizeMimoAudio(section.narration, output, {
    voice: voiceForEngine('mimo', settings.ttsVoice),
    style: settings.mimoStylePrompt,
    format: 'mp3'
  });
  return output;
}

export interface SynthesisResult {
  asset: RecordingAsset;
  sectionFiles: Array<{ sectionId: string; file: string; durationSeconds: number }>;
}

export async function synthesizeNarration(
  project: CourseProject,
  settings: RuntimeSettings
): Promise<SynthesisResult> {
  if (!project.script?.sections.length) throw new Error('讲稿为空，无法生成语音');
  const projectDir = projectMediaDir(project.id);
  const ttsDir = path.join(projectDir, 'tts');
  fs.mkdirSync(ttsDir, { recursive: true });

  const sections = project.script.sections;
  const results: Array<{ sectionId: string; file: string; durationSeconds: number }> = [];
  const engine = {
    source: (settings.ttsEngine === 'sapi'
      ? 'sapi'
      : settings.ttsEngine === 'mimo'
        ? 'mimo'
        : 'edge') as 'edge' | 'sapi' | 'mimo'
  };
  let engineError = '';

  const worker = async (section: ScriptSection, index: number) => {
    let file = '';
    try {
      if (settings.ttsEngine === 'none') {
        throw new Error('旁白语音引擎已关闭');
      }
      if (settings.ttsEngine === 'sapi') {
        file = await synthesizeWithSapi(projectDir, sections, index);
      } else if (settings.ttsEngine === 'mimo') {
        file = await synthesizeWithMimo(projectDir, section, settings, index);
      } else {
        file = await synthesizeWithEdge(projectDir, section, settings, index);
      }
    } catch (error) {
      const primaryError = error instanceof Error ? error.message : '语音服务不可用';
      if (settings.allowLocalFallback === false) throw error;
      engineError = primaryError;
      if (settings.ttsEngine !== 'edge') {
        try {
          file = await synthesizeWithEdge(projectDir, section, settings, index);
          engine.source = 'edge';
        } catch {
          file = await synthesizeWithSapi(projectDir, sections, index);
          engine.source = 'sapi';
        }
      } else {
        file = await synthesizeWithSapi(projectDir, sections, index);
        engine.source = 'sapi';
      }
    }
    const duration = await probeDuration(file, section.durationSeconds);
    return { sectionId: section.id, file, durationSeconds: duration };
  };

  const limit = 3;
  let cursor = 0;
  const runNext = async (): Promise<void> => {
    const index = cursor;
    cursor += 1;
    if (index >= sections.length) return;
    results[index] = await worker(sections[index], index);
    await runNext();
  };
  await Promise.all(Array.from({ length: Math.min(limit, sections.length) }, () => runNext()));

  const activeResults = results.filter(Boolean);
  const extension = path.extname(activeResults[0]?.file ?? '.mp3');
  const narrationFile = path.join(ttsDir, `narration${extension}`);
  const listPath = path.join(ttsDir, 'narration-list.txt');
  fs.writeFileSync(
    listPath,
    activeResults
      .map((item) => `file '${item.file.split(path.sep).join('/').replace(/'/g, "'\\''")}'`)
      .join('\n'),
    'utf8'
  );
  await runProcess(getFfmpegPath(), [
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listPath,
    '-c:a',
    extension === '.mp3' ? 'libmp3lame' : 'pcm_s16le',
    '-q:a',
    '4',
    narrationFile
  ]);

  let cursorSeconds = 0;
  const segments = activeResults.map((item) => {
    const segment = {
      sectionId: item.sectionId,
      startSeconds: Number(cursorSeconds.toFixed(2)),
      endSeconds: Number((cursorSeconds + item.durationSeconds).toFixed(2))
    };
    cursorSeconds += item.durationSeconds;
    return segment;
  });
  const totalDuration = activeResults.reduce((sum, item) => sum + item.durationSeconds, 0);
  const fingerprint = crypto
    .createHash('sha1')
    .update(
      JSON.stringify({
        sections: sections.map((section) => section.narration),
        voice: settings.ttsVoice,
        rate: settings.ttsRate,
        source: engine.source,
        style: settings.mimoStylePrompt
      })
    )
    .digest('hex')
    .slice(0, 16);

  const asset: RecordingAsset = {
    id: `tts-${fingerprint}`,
    kind: 'tts',
    name: `${
      [...ttsVoiceOptions, ...mimoVoiceOptions].find((voice) => voice.id === settings.ttsVoice)?.label ??
      'AI 旁白'
    }`,
    durationSeconds: Number(totalDuration.toFixed(2)),
    status: 'done',
    alignment: 100,
    createdAt: new Date().toISOString(),
    transcript: sections.map((section) => section.narration).join('\n\n'),
    audioUrl: mediaUrl(project.id, path.relative(projectDir, narrationFile)),
    fileName: path.basename(narrationFile),
    sizeBytes: fs.statSync(narrationFile).size,
    fingerprint,
    source: engine.source,
    segments
  };

  if (engineError && asset.source === 'sapi') {
    asset.name = '本机语音 · 慧慧';
  } else if (engineError && asset.source === 'edge') {
    asset.name = 'Edge 神经语音 · 已回退';
  }

  return { asset, sectionFiles: activeResults };
}

export async function saveRecordingFile(
  projectId: string,
  dataUrl: string,
  originalName: string,
  kind: 'teacher' | 'upload',
  durationHint = 0
): Promise<RecordingAsset> {
  // Browsers report MediaRecorder types with parameters, e.g.
  // "data:audio/webm;codecs=opus;base64,...", so split the header at the comma.
  const match = /^data:([^,]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) throw new Error('录音数据格式不正确');
  const mime = (match[1].split(';')[0] || 'application/octet-stream').toLowerCase();
  const buffer = Buffer.from(match[2], 'base64');
  return saveRecordingBuffer(projectId, buffer, mime, originalName, kind, durationHint);
}

export async function saveRecordingBuffer(
  projectId: string,
  buffer: Buffer,
  mimeHint: string,
  originalName: string,
  kind: 'teacher' | 'upload',
  durationHint = 0
): Promise<RecordingAsset> {
  if (buffer.length < 100) throw new Error('录音内容为空');
  const mime = (mimeHint || 'application/octet-stream').toLowerCase();
  const extFromName = path.extname(originalName).replace('.', '').toLowerCase();
  const extFromMime = mime.includes('webm') ? 'webm' : mime.includes('mp4') ? 'm4a' : mime.includes('wav') ? 'wav' : '';
  const ext = extFromMime || extFromName || 'webm';
  const projectDir = projectMediaDir(projectId);
  const fileName = kind + '-' + Date.now() + '-' + crypto.randomBytes(2).toString('hex') + '.' + ext;
  fs.writeFileSync(path.join(projectDir, fileName), buffer);
  return describeRecordingFile(projectId, fileName, originalName, kind, durationHint);
}

export async function describeRecordingFile(
  projectId: string,
  fileName: string,
  originalName: string,
  kind: 'teacher' | 'upload',
  durationHint = 0
): Promise<RecordingAsset> {
  if (!/^[a-zA-Z0-9._-]+$/.test(fileName) || fileName.includes('..')) {
    throw new Error('录音文件名不合法');
  }
  const target = path.join(projectMediaDir(projectId), fileName);
  if (!fs.existsSync(target)) throw new Error('录音文件不存在，请重新录制');
  const duration = await probeDuration(
    target,
    Number.isFinite(durationHint) && durationHint > 0 ? durationHint : 0
  );
  return {
    id: 'rec-' + Date.now().toString(36),
    kind,
    name: originalName,
    durationSeconds: Number(duration.toFixed(2)),
    status: 'done',
    alignment: 0,
    createdAt: new Date().toISOString(),
    transcript: '',
    audioUrl: mediaUrl(projectId, fileName),
    fileName,
    sizeBytes: fs.statSync(target).size
  };
}

export interface TeacherVideoFile {
  fileName: string;
  url: string;
  sizeBytes: number;
  durationSeconds: number;
}

export async function saveTeacherVideoFile(
  projectId: string,
  dataUrl: string,
  originalName: string
): Promise<TeacherVideoFile> {
  const match = /^data:([^,]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) throw new Error('教师画面数据格式不正确');
  const mime = (match[1].split(';')[0] || 'video/webm').toLowerCase();
  const buffer = Buffer.from(match[2], 'base64');
  return saveTeacherVideoBuffer(projectId, buffer, mime, originalName);
}

export async function saveTeacherVideoBuffer(
  projectId: string,
  buffer: Buffer,
  mimeHint: string,
  originalName: string,
  durationHint = 0
): Promise<TeacherVideoFile> {
  if (buffer.length < 100) throw new Error('教师画面内容为空');
  const mime = (mimeHint || 'video/webm').toLowerCase();
  const ext = mime.includes('webm') ? 'webm' : mime.includes('mp4') ? 'mp4' : 'webm';
  const projectDir = projectMediaDir(projectId);
  const fileName = 'teacher-video-' + Date.now() + '-' + crypto.randomBytes(2).toString('hex') + '.' + ext;
  fs.writeFileSync(path.join(projectDir, fileName), buffer);
  return describeTeacherVideoFile(projectId, fileName, durationHint);
}

export async function describeTeacherVideoFile(
  projectId: string,
  fileName: string,
  durationHint = 0
): Promise<TeacherVideoFile> {
  if (!/^[a-zA-Z0-9._-]+$/.test(fileName) || fileName.includes('..')) {
    throw new Error('教师画面文件名不合法');
  }
  const target = path.join(projectMediaDir(projectId), fileName);
  if (!fs.existsSync(target)) throw new Error('教师画面文件不存在，请重新录制');
  const duration = await probeDuration(
    target,
    Number.isFinite(durationHint) && durationHint > 0 ? durationHint : 0
  );
  return {
    fileName,
    url: mediaUrl(projectId, fileName),
    sizeBytes: fs.statSync(target).size,
    durationSeconds: Number(duration.toFixed(2))
  };
}
const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const accentColors: Record<CourseSlide['accent'], string> = {
  brick: '#c95132',
  teal: '#28766c',
  gold: '#b8812f',
  ink: '#1b2721'
};

function slideBody(slide: CourseSlide) {
  const bullets = slide.bullets.map(escapeHtml);
  if (slide.layout === 'cover') {
    return `<div class="cover">
      <span class="kicker">MICRO COURSE</span>
      <h1>${escapeHtml(slide.title)}</h1>
      <p>${bullets[0] ?? ''}</p>
      <div class="cover-foot"><span>课程讲稿 · 视觉分镜</span><b>01</b></div>
    </div>`;
  }
  if (slide.layout === 'objectives') {
    return `<div class="standard"><h1>${escapeHtml(slide.title)}</h1>
      <div class="objectives">${bullets
        .map(
          (bullet, index) =>
            `<div><span>${String(index + 1).padStart(2, '0')}</span><p>${bullet}</p></div>`
        )
        .join('')}</div></div>`;
  }
  if (slide.layout === 'compare') {
    return `<div class="standard"><h1>${escapeHtml(slide.title)}</h1>
      <div class="compare">${bullets
        .slice(0, 2)
        .map(
          (bullet, index) =>
            `<div><span>${index === 0 ? 'A / 观察' : 'B / 判断'}</span><p>${bullet}</p></div>`
        )
        .join('')}</div></div>`;
  }
  if (slide.layout === 'quote') {
    return `<div class="standard quote"><span class="quote-mark">“</span>
      <h1>${escapeHtml(slide.title)}</h1>
      <div class="keywords">${bullets.map((bullet) => `<span>${bullet}</span>`).join('')}</div>
    </div>`;
  }
  return `<div class="standard"><span class="key-label">KEY IDEA</span>
    <h1>${escapeHtml(slide.title)}</h1>
    <div class="points">${bullets
      .map((bullet) => `<div><span></span><p>${bullet}</p></div>`)
      .join('')}</div></div>`;
}

function buildSlideHtml(slide: CourseSlide) {
  const accent = accentColors[slide.accent];
  const dark = slide.layout === 'cover';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{width:1920px;height:1080px;overflow:hidden}
    body{font-family:"Microsoft YaHei UI","PingFang SC",sans-serif;background:${dark ? '#17231e' : '#fbfaf6'};color:${dark ? '#f4f0e7' : '#1d211d'}}
    .slide{position:relative;width:1920px;height:1080px;padding:78px 110px 72px;background:${dark ? '#17231e' : '#fbfaf6'};overflow:hidden}
    .slide:before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(29,33,29,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(29,33,29,.035) 1px,transparent 1px);background-size:60px 60px;pointer-events:none}
    .dark:before{background-image:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px)}
    .topline{position:relative;display:flex;justify-content:space-between;font-size:20px;letter-spacing:.08em;text-transform:uppercase;color:${dark ? 'rgba(244,240,231,.62)' : '#73776f'};font-weight:600}
    .rule{position:relative;width:96px;height:7px;background:${accent};margin-top:26px}
    .cover{position:relative;display:flex;flex-direction:column;justify-content:center;height:780px;max-width:1480px}
    .kicker{font-size:20px;letter-spacing:.2em;color:${accent};font-weight:700;margin-bottom:32px}
    h1{font-family:"Songti SC","STSong","Noto Serif CJK SC",serif;font-size:86px;line-height:1.18;font-weight:600;letter-spacing:0}
    .cover h1{font-size:108px;max-width:1440px}
    .cover p{font-size:34px;line-height:1.6;color:rgba(244,240,231,.78);max-width:1180px;margin-top:42px}
    .cover-foot{display:flex;justify-content:space-between;align-items:flex-end;margin-top:84px;color:rgba(244,240,231,.56);font-size:20px}
    .cover-foot b{font-family:Georgia,serif;font-size:64px;color:${accent};font-weight:400}
    .standard{position:relative;padding-top:120px;height:780px}
    .standard h1{font-size:68px;max-width:1500px}
    .key-label{display:block;font-size:18px;letter-spacing:.2em;color:${accent};font-weight:700;margin-bottom:28px}
    .objectives{display:grid;grid-template-columns:1fr 1fr;gap:30px 56px;margin-top:72px}
    .objectives>div{display:flex;gap:24px;border-top:2px solid rgba(29,33,29,.16);padding-top:24px}
    .objectives span{font-family:Georgia,serif;font-size:28px;color:${accent};min-width:44px}
    .objectives p{font-size:30px;line-height:1.48;color:#333a33}
    .points{margin-top:60px;display:grid;gap:30px;max-width:1480px}
    .points>div{display:flex;align-items:flex-start;gap:26px;border-top:1px solid rgba(29,33,29,.14);padding-top:24px}
    .points span{width:58px;height:4px;background:${accent};margin-top:20px;flex:none}
    .points p{font-size:32px;line-height:1.5;color:#333a33}
    .compare{display:grid;grid-template-columns:1fr 1fr;gap:56px;margin-top:70px}
    .compare>div{border-top:3px solid ${accent};padding-top:30px;min-height:260px}
    .compare span{font-size:19px;letter-spacing:.12em;color:${accent};font-weight:700}
    .compare p{font-size:34px;line-height:1.5;margin-top:26px;color:#333a33}
    .quote-mark{position:absolute;right:0;top:40px;font-family:Georgia,serif;font-size:300px;line-height:1;color:${accent};opacity:.12}
    .quote h1{font-size:62px;line-height:1.45;max-width:1530px;margin-top:76px}
    .keywords{display:flex;gap:16px;margin-top:58px;flex-wrap:wrap}
    .keywords span{border:1px solid ${accent};color:${accent};padding:12px 24px;font-size:22px;border-radius:4px;background:${dark ? '#17231e' : '#fbfaf6'}}
    .footer{position:absolute;left:110px;right:110px;bottom:50px;display:flex;align-items:center;gap:22px;color:${dark ? 'rgba(244,240,231,.5)' : '#8a8e86'};font-size:18px;letter-spacing:.08em}
    .footer i{display:block;width:72px;height:1px;background:${dark ? 'rgba(244,240,231,.24)' : 'rgba(29,33,29,.24)'}
  </style></head><body><div class="slide ${dark ? 'dark' : ''}">
    <div class="topline"><span>${escapeHtml(slide.eyebrow)}</span><span>课序 / KEXU</span></div>
    <div class="rule"></div>
    ${slideBody(slide)}
    <div class="footer"><span>${String(slide.order).padStart(2, '0')}</span><i></i><span>${escapeHtml(
      slide.eyebrow.split('/')[0]
    )}</span></div>
  </div></body></html>`;
}

async function renderSlideImages(project: CourseProject, projectDir: string) {
  const chrome = chromeCandidates.find((candidate) => fs.existsSync(candidate));
  if (!chrome) throw new Error('未找到可用于生成画面的 Chrome 或 Edge');
  const slideDir = path.join(projectDir, 'slides');
  fs.mkdirSync(slideDir, { recursive: true });
  const output: Array<{ slide: CourseSlide; file: string }> = [];

  for (const [index, slide] of project.slides.entries()) {
    const htmlPath = path.join(slideDir, `slide-${String(index + 1).padStart(2, '0')}.html`);
    const pngPath = path.join(slideDir, `slide-${String(index + 1).padStart(2, '0')}.png`);
    fs.writeFileSync(htmlPath, buildSlideHtml(slide), 'utf8');
    const userDataDir = path.join(slideDir, `.chrome-${index}`);
    try {
      await runProcess(chrome, [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        '--window-size=1920,1080',
        `--user-data-dir=${userDataDir}`,
        `--screenshot=${pngPath}`,
        `file:///${htmlPath.split(path.sep).join('/')}`
      ]).catch(() => {
        // Chrome writes the screenshot before returning a non-zero status in some versions.
      });
    } finally {
      // The headless profile can hold Windows file locks briefly after Chrome exits.
      try {
        fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
      } catch {
        // A leftover profile is harmless; the next render uses a fresh index.
      }
    }
    if (!fs.existsSync(pngPath)) {
      throw new Error(`第 ${index + 1} 页课件画面生成失败`);
    }
    output.push({ slide, file: pngPath });
  }
  return output;
}

const writeConcatFile = (filePath: string, entries: string[]) => {
  fs.writeFileSync(filePath, entries.join('\n'), 'utf8');
};

const ffPath = (value: string) => value.split(path.sep).join('/').replace(/'/g, "'\\''");

export interface RenderResult {
  file: string;
  poster: string;
  durationSeconds: number;
  sizeBytes: number;
}

interface FrameLike {
  shape: string;
  borderStyle: string;
  borderWidth: number;
  borderColor: string;
  scale: number;
  x: number;
  y: number;
}

// Build the picture-in-picture filter for the teacher camera using the
// active video-frame scheme. Falls back to the classic bottom-right frame.
function buildCameraFilter(frame: RuntimeSettings['videoFrame'], teacherIndex: number) {
  const active = frame?.enabled ? frame?.schemes.find((s) => s.id === frame.activeSchemeId) : undefined;
  if (!active) {
    return [
      '[0:v]scale=1920:1080,fps=25,format=yuv420p[bg]',
      `[${teacherIndex}:v]scale=480:-2,pad=iw+8:ih+8:4:4:0xF2EEE3,format=yuv420p[cam]`,
      '[bg][cam]overlay=W-w-40:H-h-40[vout]'
    ].join(';');
  }
  const scheme = active as FrameLike;
  const camW = Math.max(120, Math.round(1920 * (scheme.scale || 0.25)));
  const bw = scheme.borderStyle === 'none' ? 0 : Math.max(0, Math.round(scheme.borderWidth || 0));
  const hex = ('000000' + String(scheme.borderColor || '#F2EEE3').replace('#', '').toUpperCase()).slice(-6);
  const colorHex = '0x' + hex;
  const steps = [`scale=${camW}:-2`];
  if (bw > 0) steps.push(`pad=iw+${bw * 2}:ih+${bw * 2}:${bw}:${bw}:${colorHex}`);
  steps.push('format=rgba');
  if (scheme.shape === 'rounded' || scheme.shape === 'circle' || scheme.shape === 'oval') {
    if (scheme.shape === 'circle') steps.unshift("crop='min(iw,ih)':'min(iw,ih)'");
    const radius = scheme.shape === 'rounded' ? 'max(2,min(w,h)*0.12)' : null;
    const alphaExpr = radius
      ? `if(lte(hypot(max(abs(X-(w-1)/2)-(w/2-${radius}),0),max(abs(Y-(h-1)/2)-(h/2-${radius}),0)),${radius}),alpha(X,Y),0)`
      : 'if(lte(pow((X-(w-1)/2)/(w/2),2)+pow((Y-(h-1)/2)/(h/2),2),1),alpha(X,Y),0)';
    steps.push(`geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${alphaExpr}'`);
  }
  const xPos = Math.min(Math.max(Number(scheme.x) || 0, 0), 1);
  const yPos = Math.min(Math.max(Number(scheme.y) || 0, 0), 1);
  return [
    '[0:v]scale=1920:1080,fps=25,format=yuv420p[bg]',
    `[${teacherIndex}:v]${steps.join(',')}[cam]`,
    `[bg][cam]overlay=x=${xPos}*(main_w-overlay_w):y=${yPos}*(main_h-overlay_h)[vout]`
  ].join(';');
}

export async function renderCourseVideo(
  project: CourseProject,
  settings: RuntimeSettings,
  audioAsset: RecordingAsset,
  onProgress: (progress: number, message: string) => void
): Promise<RenderResult> {
  const projectDir = projectMediaDir(project.id);
  const renderDir = path.join(projectDir, 'render');
  fs.mkdirSync(renderDir, { recursive: true });

  onProgress(12, '清理上一次渲染');
  for (const name of ['visuals.txt', 'audio.txt', 'course.mp4']) {
    const target = path.join(renderDir, name);
    if (fs.existsSync(target)) fs.unlinkSync(target);
  }

  if (!project.slides.length) throw new Error('课件为空，无法组装成片');
  if (!project.script?.sections.length) throw new Error('讲稿为空，无法组装成片');

  onProgress(22, '生成 1080p 课件画面');
  const images = await renderSlideImages(project, projectDir);
  onProgress(48, '构建统一音画时间轴');

  const timeline = buildCourseTimeline(project, audioAsset);
  project.timeline = timeline;
  const imageBySlideId = new Map(images.map((item) => [item.slide.id, item.file]));
  const visualEntries: string[] = [];
  for (const shot of timeline.shots) {
    const filePath = imageBySlideId.get(shot.slideId) ?? images[0]?.file;
    if (!filePath) throw new Error(`未找到镜头对应画面：${shot.slideTitle}`);
    visualEntries.push(`file '${ffPath(filePath)}'`, `duration ${shot.durationSeconds.toFixed(3)}`);
  }
  if (timeline.shots.length) {
    const lastShot = timeline.shots[timeline.shots.length - 1];
    const lastFile = imageBySlideId.get(lastShot.slideId) ?? images[images.length - 1].file;
    visualEntries.push(`file '${ffPath(lastFile)}'`);
  }
  writeConcatFile(path.join(renderDir, 'visuals.txt'), visualEntries);
  const visualDuration = timeline.totalSeconds;

  onProgress(58, '拼接旁白音轨');
  const audioSources: string[] = [];
  const makeSilence = async (fileName: string, seconds: number) => {
    const target = path.join(renderDir, fileName);
    await runProcess(getFfmpegPath(), [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'anullsrc=r=44100:cl=mono',
      '-t',
      seconds.toFixed(3),
      '-c:a',
      'pcm_s16le',
      target
    ]);
    return target;
  };

  if (audioAsset.kind === 'tts') {
    if (timeline.leadInSeconds > 0.01) {
      const introSilence = await makeSilence('silence-intro.wav', timeline.leadInSeconds);
      audioSources.push(introSilence);
    }
    const narrationFile = path.join(projectDir, 'tts', audioAsset.fileName || 'narration.mp3');
    if (!fs.existsSync(narrationFile)) {
      throw new Error(`找不到 TTS 旁白音频：${narrationFile}`);
    }
    audioSources.push(narrationFile);
    if (timeline.leadOutSeconds > 0.01) {
      const outroSilence = await makeSilence('silence-outro.wav', timeline.leadOutSeconds);
      audioSources.push(outroSilence);
    }
  } else {
    const source = path.join(projectDir, audioAsset.fileName ?? '');
    if (!fs.existsSync(source)) throw new Error('找不到教师录音文件');
    audioSources.push(source);
    const tail = Number((visualDuration - audioAsset.durationSeconds).toFixed(3));
    if (tail > 0.05) {
      const outroSilence = await makeSilence('silence-outro.wav', tail);
      audioSources.push(outroSilence);
    }
  }
  if (!audioSources.length) throw new Error('音轨为空，无法组装成片');

  const teacherVideoFile = audioAsset.videoFileName
    ? path.join(projectDir, audioAsset.videoFileName)
    : '';
  const hasTeacherVideo = Boolean(teacherVideoFile && fs.existsSync(teacherVideoFile));
  const teacherVideoIndex = 1 + audioSources.length;
  const teacherVideoInput = hasTeacherVideo ? ['-i', teacherVideoFile] : [];
  // The concat demuxer emits one frame per slide, so the fps filter has to
  // expand them into a constant frame rate timeline. Without it the encoder
  // only writes the first frame and the exported video collapses to a still.
  const videoFilter = hasTeacherVideo
    ? buildCameraFilter(settings.videoFrame, teacherVideoIndex)
    : '[0:v]scale=1920:1080,fps=25,format=yuv420p[vout]';

  const audioInputs = audioSources.flatMap((file) => ['-i', file]);
  const audioFilter = [
    ...audioSources.map(
      (_, index) =>
        `[${index + 1}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=mono[a${index}]`
    ),
    `${audioSources.map((_, index) => `[a${index}]`).join('')}concat=n=${
      audioSources.length
    }:v=0:a=1,apad[aout]`
  ].join(';');

  onProgress(68, '渲染 1080p 课程成片');
  const outputPath = path.join(renderDir, 'course.mp4');
  let lastProgress = 68;
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      getFfmpegPath(),
      [
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        path.join(renderDir, 'visuals.txt'),
        ...audioInputs,
        ...teacherVideoInput,
        '-filter_complex',
        `${videoFilter};${audioFilter}`,
        '-map',
        '[vout]',
        '-map',
        '[aout]',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '21',
        '-r',
        '25',
        '-c:a',
        'aac',
        '-b:a',
        '160k',
        '-t',
        visualDuration.toFixed(3),
        '-movflags',
        '+faststart',
        '-progress',
        'pipe:1',
        '-nostats',
        outputPath
      ],
      { windowsHide: true }
    );
    let errorOutput = '';
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      const matches = text.matchAll(/out_time_ms=(\d+)/g);
      for (const match of matches) {
        const seconds = Number(match[1]) / 1_000_000;
        const ratio = Math.min(1, seconds / Math.max(visualDuration, 1));
        const next = Math.max(lastProgress, Math.round(68 + ratio * 30));
        if (next > lastProgress) {
          lastProgress = next;
          onProgress(next, `编码画面与音轨 ${next}%`);
        }
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      errorOutput += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(errorOutput.split('\n').slice(-6).join('\n') || `ffmpeg exited with ${code}`));
    });
  });

  if (!fs.existsSync(outputPath)) throw new Error('成片文件没有生成');
  const poster = path.join(renderDir, 'poster.jpg');
  const cover = images.find((item) => item.slide.layout === 'cover') ?? images[0];
  if (cover) {
    await runProcess(getFfmpegPath(), ['-y', '-i', cover.file, '-vf', 'scale=960:540', '-q:v', '3', poster]);
  }
  onProgress(99, '写入课程元数据');
  return {
    file: outputPath,
    poster,
    durationSeconds: Number(visualDuration.toFixed(2)),
    sizeBytes: fs.statSync(outputPath).size
  };
}

export function findProjectAudio(project: CourseProject, preferredId?: string) {
  if (preferredId) {
    const preferred = project.recordings.find((item) => item.id === preferredId);
    if (preferred?.fileName) return preferred;
  }
  const tts = project.recordings.find((item) => item.kind === 'tts' && item.fileName);
  if (tts) return tts;
  return project.recordings.find((item) => item.kind !== 'tts' && item.fileName);
}
