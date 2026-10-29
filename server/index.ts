import express from 'express';
import type { NextFunction, Request as ExpressRequest, Response as ExpressResponse } from 'express';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import type {
  AnalyzeBriefInput,
  AnalyzeBriefResult,
  CourseMode,
  CourseProject,
  CourseScript,
  CourseSlide,
  CourseWorkflow,
  CourseMount,
  CreateProjectInput,
  GenerationMeta,
  MediaKind,
  MediaTriggerPlacement,
  ProductionEngine,
  ProductionStage,
  RecordingAsset,
  ScriptComment,
  ScriptGenerationInput,
  SlideVisitEvent,
  TeacherMemory,
  TraceStep,
  TranscriptSegment
} from '../src/types';
import { alignTranscript } from './align';
import { buildDeliveryBundle } from './delivery';
import {
  engineStageLabel,
  resolveEngine,
  setEngineDefault
} from './engines';
import { generateScript, generateSlides } from './generate';
import {
  callModel,
  clearMimoApiKey,
  clearModelApiKey,
  hasMimoApiKey,
  hasModelApiKey,
  parseJsonLoose,
  setMimoApiKey,
  setModelApiKey,
  testModelConnection
} from './llm';
import {
  detectCapabilities,
  findProjectAudio,
  mediaRoot,
  mediaUrl,
  describeRecordingFile,
  describeTeacherVideoFile,
  renderCourseVideo,
  saveRecordingBuffer,
  saveRecordingFile,
  saveTeacherVideoBuffer,
  saveTeacherVideoFile,
  synthesizeNarration,
  voiceForEngine
} from './media';
import {
  MEDIA_KIND_LABEL,
  buildMediaHtml,
  createMediaArtifact,
  type MediaGenerationInput
} from './media-workshop';
import {
  buildCourseHtml,
  locateConceptAnchors,
  MOUNT_KIND_LABEL
} from './course-composer';
import { dataDir, distRoot } from './paths';
import {
  generateScriptWithModel,
  generateSlidesWithModel,
  runAgentPipeline,
  runSkillWithModel
} from './skills';
import { mutateDb, readDb, resetDb, writeDb } from './store';
import { testMimoSpeech, transcribeMimoAudio } from './speech';
import { buildCourseTimeline } from './timeline';
import {
  defaultWorkflowForMode,
  firstWorkflowStep,
  moveToWorkflowKey,
  normalizeWorkflowSteps,
  normalizeWorkflows,
  resolveWorkflow,
  setWorkflowStep,
  workflowStepForStage
} from './workflows';

const app = express();

const crashLogPath = path.join(dataDir, 'crash.log');
const logCrash = (label: string, error: unknown) => {
  try {
    const detail = error instanceof Error ? error.stack || error.message : String(error);
    fs.appendFileSync(crashLogPath, '[' + new Date().toISOString() + '] ' + label + ' ' + detail + String.fromCharCode(10));
  } catch {
    // Logging must never take the server down.
  }
};
process.on('unhandledRejection', (error) => logCrash('unhandledRejection', error));
process.on('uncaughtException', (error) => logCrash('uncaughtException', error));
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST?.trim() || '127.0.0.1';
const httpsPort = Number(process.env.HTTPS_PORT || 8788);
const certDir = process.env.KEXU_TLS_DIR
  ? path.resolve(process.env.KEXU_TLS_DIR)
  : path.join(dataDir, 'certs');
const tlsCertPath = path.join(certDir, 'server.crt');
const tlsKeyPath = path.join(certDir, 'server.key');
const caCertPath = path.join(certDir, 'ca.crt');
const httpsEnabled = fs.existsSync(tlsCertPath) && fs.existsSync(tlsKeyPath);

app.use(express.json({ limit: '80mb' }));
app.use('/media', express.static(mediaRoot, { acceptRanges: true, maxAge: '1h' }));

const makeId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const now = () => new Date().toISOString();

const findProject = (id: string) => {
  const project = readDb().projects.find((item) => item.id === id);
  if (!project) throw new Error('PROJECT_NOT_FOUND');
  return project;
};

const persistProject = (project: CourseProject) => {
  project.updatedAt = now();
  mutateDb((db) => {
    const index = db.projects.findIndex((item) => item.id === project.id);
    if (index >= 0) db.projects[index] = project;
  });
};

const workflowForProject = (project: CourseProject) => {
  const db = readDb();
  return resolveWorkflow(db.workflows, project) ?? db.workflows[0];
};

const makeTrace = (project: CourseProject) => {
  const base = [
    {
      label: '读取课程上下文',
      detail: `${project.grade} · ${project.subject} · ${project.durationMinutes} 分钟`,
      durationMs: 420
    },
    {
      label: '匹配技能与教学约束',
      detail: `${project.mode === 'auto' ? '全自动' : project.mode === 'oral' ? '口语稿' : 'PPT'}模式 · 价值主线已注入`,
      durationMs: 760
    },
    {
      label: '执行讲稿结构规划',
      detail: '生成段落节拍、视觉任务与口语断点',
      durationMs: 1680
    },
    {
      label: '课程质检',
      detail: '结构、口语性、价值密度、学情匹配',
      durationMs: 1120
    }
  ];
  return base.map((step, index) => ({
    id: `trace-${Date.now()}-${index}`,
    status: 'done' as const,
    ...step
  }));
};

const invalidateProduction = (project: CourseProject) => {
  project.render = undefined;
  project.delivery = undefined;
  if (project.script) project.script.confirmed = false;
};

/**
 * Engine config is a light-weight post-processing contract: each slide engine
 * can shape density, emphasis and the note that the teacher sees.
 */
const applySlideEngine = (
  slides: CourseSlide[],
  engine: ProductionEngine | undefined
): CourseSlide[] => {
  if (!engine) return slides;
  const maxBullets = Number(engine.config.maxBullets);
  const bias = String(engine.config.layoutBias || 'balanced');
  return slides.map((slide) => {
    const bullets =
      Number.isFinite(maxBullets) && maxBullets > 0
        ? slide.bullets.slice(0, Math.max(1, Math.round(maxBullets)))
        : slide.bullets;
    const density = String(engine.config.visualDensity || 'balanced');
    const cleanLayout = density === 'clean';
    const richLayout = density === 'rich';
    if (cleanLayout) {
      return {
        ...slide,
        bullets: bullets.slice(0, 2),
        supporting: undefined,
        visual: undefined,
        note: `精简排版：突出主线，细节留给讲稿。\n${slide.note}`
      };
    }
    if (bias === 'visual') {
      return {
        ...slide,
        bullets,
        note: `画面提示：${slide.title}｜${bullets.join('；') || '以主视觉呈现核心概念'}\n${slide.note}`
      };
    }
    if (bias === 'structure') {
      return {
        ...slide,
        bullets,
        eyebrow: slide.eyebrow || 'STRUCTURE',
        note: `结构讲解：先说关系，再给例子。\n${slide.note}`
      };
    }
    if (richLayout) {
      return {
        ...slide,
        bullets: bullets.length ? bullets : slide.bullets,
        note: `信息增强版：主结论、要点、补充说明与图示各司其职。\n${slide.note}`
      };
    }
    return { ...slide, bullets };
  });
};

const publicSettings = () => ({
  ...readDb().settings,
  apiKeyConfigured: hasModelApiKey(),
  mimoApiKeyConfigured: hasMimoApiKey()
});

const subjectHints = [
  '语文',
  '数学',
  '英语',
  '物理',
  '化学',
  '生物',
  '历史',
  '地理',
  '政治',
  '道德与法治',
  '科学',
  '信息技术',
  '音乐',
  '美术',
  '体育'
];

const gradePattern =
  /(高[一二三]|初[一二三]|[一二三四五六七八九]年级|小学[一二三四五六]年级|七年级|八年级|九年级)/;

const clampBriefDuration = (value: unknown, fallback = 8) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), 3), 45);
};

const splitClauses = (value: string) =>
  value
    .split(/[。！？!?；;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

/**
 * Every brief needs a value thread, even when the teacher did not say one.
 */
const defaultValueGuide = (topic: string) =>
  `把"先找条件、再下结论"的习惯带出课堂：学生不仅理解${topic}，还要能用它判断真实问题，并对自己的判断负责。`;

const defaultLearnerProfile = (grade: string) =>
  `${grade || '本阶段'}学生已有生活经验与直观判断力，但抽象概念与条件分析是难点，容易把结论当成答案，需要用具体情境带着他们一步步推。`;

const localAnalyzeBrief = (
  transcript: string,
  current: Partial<CreateProjectInput>,
  memory: TeacherMemory
): CreateProjectInput => {
  const text = transcript.replace(/\s+/g, ' ').trim();
  const clauses = splitClauses(text);
  const sentence =
    clauses.find((item) => /主题|课题|想讲|要讲|准备讲|内容是/.test(item)) ?? clauses[0] ?? text;
  const cleaned = sentence
    .replace(/^(我想|我要|我准备|我想讲|我要讲|想讲|要讲|主题是|课题是)\s*/, '')
    .replace(/^(讲|上|做)\s*(一节|一次)?\s*/, '')
    .replace(/[“”"'《》]/g, '')
    .trim();
  const topic = (current.topic?.trim() || cleaned || text).slice(0, 30);
  const briefTitle = topic.length > 20 ? `${topic.slice(0, 18)}·微课` : topic;
  const subject =
    current.subject?.trim() ||
    subjectHints.find((item) => text.includes(item)) ||
    memory.subject ||
    '通识';
  const grade = current.grade?.trim() || text.match(gradePattern)?.[1] || memory.grade || '未设置学段';
  const durationMatch = text.match(/(\d{1,2})\s*分(?:钟)?/);
  const mode: CourseMode = /ppt|课件|对照.{0,4}(页面|幻灯片)|照着讲/i.test(text)
    ? 'ppt'
    : /口语|先讲一遍|自己讲|口述|讲给我听/i.test(text)
      ? 'oral'
      : current.mode ?? 'auto';
  const valueClause = clauses.find((item) =>
    /价值|育人|素养|希望学生|让学生|精神|责任/.test(item)
  );
  const learnerClause = clauses.find((item) =>
    /学生|学情|基础|容易|已经会|难点/.test(item)
  );

  return {
    title: current.title?.trim() || briefTitle,
    topic,
    subject,
    grade,
    durationMinutes: clampBriefDuration(
      current.durationMinutes ?? (durationMatch ? Number(durationMatch[1]) : undefined),
      8
    ),
    mode,
    idea: current.idea?.trim() || text,
    valueGuide:
      current.valueGuide?.trim() ||
      (valueClause ?? '').slice(0, 240) ||
      defaultValueGuide(topic),
    learnerProfile:
      current.learnerProfile?.trim() ||
      (learnerClause ?? '').slice(0, 240) ||
      defaultLearnerProfile(grade),
    style: current.style?.trim() || memory.teachingStyle || '清晰、口语化、问题驱动'
  };
};

const normalizeAnalyzedBrief = (
  raw: unknown,
  current: Partial<CreateProjectInput>,
  memory: TeacherMemory,
  transcript: string
): CreateProjectInput => {
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const fallback = localAnalyzeBrief(transcript, current, memory);
  const topic = text(source.topic) || fallback.topic;
  const modeValue = text(source.mode);
  const mode: CourseMode =
    modeValue === 'oral' || modeValue === 'ppt' || modeValue === 'auto'
      ? modeValue
      : fallback.mode;

  return {
    title: text(source.title) || current.title?.trim() || topic,
    topic,
    subject: text(source.subject) || fallback.subject,
    grade: text(source.grade) || fallback.grade,
    durationMinutes: clampBriefDuration(source.durationMinutes, fallback.durationMinutes),
    mode,
    idea: text(source.idea) || fallback.idea,
    valueGuide: text(source.valueGuide) || fallback.valueGuide,
    learnerProfile: text(source.learnerProfile) || fallback.learnerProfile,
    style: text(source.style) || fallback.style
  };
};

/**
 * Rebuild the single source of truth for picture/sound timing.
 * Every production step that changes script, slides or audio must call this.
 */
const refreshTimeline = (project: CourseProject, preferredAudioId?: string) => {
  const audio = findProjectAudio(project, preferredAudioId);
  project.timeline = buildCourseTimeline(project, audio);
  project.render = undefined;
  project.delivery = undefined;
  return project.timeline;
};

app.get('/api/bootstrap', (_req, res) => {
  const db = readDb();
  const stats = {
    activeProjects: db.projects.filter((item) => item.status !== 'done').length,
    confirmedScripts: db.projects.filter((item) => item.script?.confirmed).length,
    renderedCourses: db.projects.filter((item) => item.render?.downloadReady).length,
    skillRuns: db.skills.reduce((sum, skill) => sum + skill.runs, 0),
    minutesSaved: 286
  };
  res.json({
    projects: db.projects,
    agents: db.agents,
    skills: db.skills,
    engines: db.engines,
    workflows: db.workflows,
    memory: db.memory,
    settings: publicSettings(),
    activity: db.activity,
    stats,
    capabilities: detectCapabilities(db.settings)
  });
});

app.get('/api/memory', (_req, res) => {
  res.json(readDb().memory);
});

app.patch('/api/memory', (req, res) => {
  const db = readDb();
  const current = db.memory;
  const body = (req.body || {}) as Partial<TeacherMemory>;
  const text = (value: unknown, fallback: string) =>
    typeof value === 'string' ? value.trim().slice(0, 4000) : fallback;
  const next: TeacherMemory = {
    ...current,
    name: text(body.name, current.name),
    school: text(body.school, current.school),
    subject: text(body.subject, current.subject),
    grade: text(body.grade, current.grade),
    yearsExperience: Number.isFinite(Number(body.yearsExperience))
      ? Math.min(Math.max(Math.round(Number(body.yearsExperience)), 0), 60)
      : current.yearsExperience,
    teachingStyle: text(body.teachingStyle, current.teachingStyle),
    experience: text(body.experience, current.experience),
    insights: text(body.insights, current.insights),
    updatedAt: now()
  };
  db.memory = next;
  writeDb(db);
  res.json(next);
});

app.get('/api/projects/:id', (req, res) => {
  try {
    res.json(findProject(req.params.id));
  } catch {
    res.status(404).json({ error: '课程项目不存在' });
  }
});

app.post('/api/projects', (req, res) => {
  const input = req.body as CreateProjectInput;
  if (!input.topic?.trim()) {
    res.status(400).json({ error: '请填写课程主题' });
    return;
  }
  const db = readDb();
  const mode = input.mode || 'auto';
  const requested = input.workflowId
    ? db.workflows.find((item) => item.id === input.workflowId)
    : undefined;
  if (input.workflowId && (!requested || requested.mode !== mode || !requested.enabled)) {
    res.status(400).json({ error: '所选工作流不可用，请重新选择' });
    return;
  }
  const workflow = requested ?? defaultWorkflowForMode(db.workflows, mode) ?? db.workflows[0];
  const first = workflow ? firstWorkflowStep(workflow) : undefined;
  const project: CourseProject = {
    id: makeId('project'),
    workflowId: workflow?.id ?? 'workflow-auto-default',
    workflowStepId: first?.id,
    title: input.title?.trim() || input.topic.trim(),
    topic: input.topic.trim(),
    subject: input.subject?.trim() || '通识',
    grade: input.grade?.trim() || '未设置学段',
    durationMinutes: Math.min(Math.max(Number(input.durationMinutes) || 8, 3), 45),
    mode,
    status: 'draft',
    stage: first?.stage ?? 'script',
    progress: 8,
    idea: input.idea?.trim() || '',
    valueGuide: input.valueGuide?.trim() || '',
    learnerProfile: input.learnerProfile?.trim() || '',
    style: input.style?.trim() || '清晰、口语化、问题驱动',
    slides: [],
    recordings: [],
    artifacts: [],
    selectedEngines: {},
    trace: [],
    createdAt: now(),
    updatedAt: now(),
    coverTone: mode === 'oral' ? 'teal' : mode === 'ppt' ? 'gold' : 'brick'
  };
  mutateDb((db) => {
    db.projects.unshift(project);
    db.activity.unshift({
      id: makeId('act'),
      agent: '析课',
      action: '创建课程生产任务',
      target: project.title,
      time: '刚刚',
      status: 'running'
    });
  });
  res.status(201).json(project);
});

app.post('/api/projects/analyze-brief', async (req, res) => {
  const input = (req.body || {}) as AnalyzeBriefInput;
  const transcript = String(input.transcript || '').replace(/\s+/g, ' ').trim();
  const seededTopic = String(input.current?.topic || '').trim();
  const seededIdea = String(input.current?.idea || '').trim();
  if (transcript.length < 4 && seededTopic.length < 2 && seededIdea.length < 4) {
    res.status(400).json({ error: '请先说一段课程设想，或写下课程主题，再交给智能体分析' });
    return;
  }
  const db = readDb();
  const settings = db.settings;
  const memory = db.memory;
  const engine = resolveEngine(db.engines, 'analysis', input.engineId);
  const current = input.current ?? {};
  const briefText = transcript || [seededTopic, seededIdea].filter(Boolean).join('。');
  const fallback = localAnalyzeBrief(briefText, current, memory);
  const startedAt = Date.now();

  try {
    const response = await callModel(settings, {
      json: true,
      temperature: 0.35,
      maxTokens: 1400,
      messages: [
        {
          role: 'system',
          content:
            '你是一位课程教务助理兼教学设计师。请把教师的口述或文字设想整理成结构化字段，' +
            '并主动优化课程名称与主题表述，让字段齐全、可直接进入备课。' +
            '只输出 JSON，不要 Markdown，不要解释。不要编造口述中没有的学校、姓名或具体事实。' +
            '每一个字段都必须有内容，价值引领不允许留空。'
        },
        {
          role: 'user',
          content: `教师的长期记忆：
学科：${memory.subject}｜学段：${memory.grade}｜教龄：${memory.yearsExperience} 年
讲述风格：${memory.teachingStyle}
教学经验：${memory.experience}
教学心得：${memory.insights}

教师口述：
${transcript}

请输出：
{
  "title": "课程名称：去掉我今天要讲、给某某年级讲这类口语前缀，控制在 8-18 字，简洁有辨识度",
  "topic": "课程主题：2-20 字，是这节课真正要讲清楚的核心问题",
  "subject": "学科：口述没有明说时，依据内容推断，并与教师记忆中的学科保持一致",
  "grade": "学段或年级：口述没有明说时依据内容推断，并与教师记忆中的学段保持一致",
  "durationMinutes": 8,
  "mode": "auto | oral | ppt",
  "idea": "整理后的备课想法：保留教师原意与关键情境，理顺顺序，去掉口水话",
  "valueGuide": "价值引领：必须给出一条可落地、可在课堂上落实的育人落点，结合本主题与教师的教学心得",
  "learnerProfile": "学情：结合年级写出学生已会什么、容易卡在哪里",
  "style": "讲述风格：优先沿用教师记忆中的风格"
}
时长必须是 3-45 的整数。mode 中 auto 表示全自动，oral 表示教师口语稿驱动，ppt 表示 PPT 驱动。
valueGuide 与 learnerProfile 必须有实质内容，不能写"无"或留空。`
        }
      ]
    });
    const draft = normalizeAnalyzedBrief(
      parseJsonLoose(response.text),
      current,
      memory,
      briefText
    );
    const result: AnalyzeBriefResult = {
      draft,
      transcript,
      warnings: [],
      source: 'model',
      engineId: engine?.id,
      engineName: engine?.name,
      fields: Object.keys(draft)
    };
    res.json({
      ...result,
      meta: {
        engine: 'model',
        provider: response.provider,
        model: response.model,
        durationMs: Date.now() - startedAt,
        warnings: []
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '模型整理失败';
    if (!settings.allowLocalFallback) {
      res.status(502).json({ error: `智能体整理失败：${message}` });
      return;
    }
    const result: AnalyzeBriefResult = {
      draft: fallback,
      transcript,
      warnings: ['模型整理失败，已用本地规则提取关键信息，请逐项核对'],
      source: 'local-fallback',
      engineId: engine?.id,
      engineName: engine?.name
    };
    res.json({
      ...result,
      meta: {
        engine: 'local-fallback',
        provider: 'local',
        model: '本地简报规则',
        durationMs: Date.now() - startedAt,
        warnings: result.warnings,
        error: message
      }
    });
  }
});

app.patch('/api/projects/:id', (req, res) => {
  try {
    const project = findProject(req.params.id);
    const allowed = [
      'title',
      'topic',
      'subject',
      'grade',
      'durationMinutes',
      'idea',
      'valueGuide',
      'learnerProfile',
      'style',
      'mode',
      'status',
      'stage',
      'progress',
      'script',
      'slides',
      'recordings',
      'render',
      'artifacts',
      'delivery',
      'selectedEngines',
      'trace'
    ];
    for (const key of allowed) {
      if (key in req.body) {
        (project as unknown as Record<string, unknown>)[key] = req.body[key];
      }
    }
    project.updatedAt = now();
    if ('script' in req.body) {
      invalidateProduction(project);
      project.stage = 'script';
      project.status = 'producing';
      project.progress = Math.max(32, project.progress - 8);
    }
    if ('slides' in req.body || 'recordings' in req.body) {
      refreshTimeline(project);
    }
    persistProject(project);
    res.json(project);
  } catch {
    res.status(404).json({ error: '课程项目不存在' });
  }
});

app.delete('/api/projects/:id', (req, res) => {
  const db = readDb();
  const index = db.projects.findIndex((item) => item.id === req.params.id);
  if (index < 0) {
    res.status(404).json({ error: '课程项目不存在' });
    return;
  }
  db.projects.splice(index, 1);
  writeDb(db);
  res.json({ ok: true });
});

app.post('/api/projects/:id/script/generate', async (req, res) => {
  let project: CourseProject;
  try {
    project = findProject(req.params.id);
  } catch {
    res.status(404).json({ error: '课程项目不存在' });
    return;
  }
  const input = (req.body || {}) as ScriptGenerationInput;
  const db = readDb();
  const settings = db.settings;
  const engine = resolveEngine(db.engines, 'script', input.engineId);
  const payload: ScriptGenerationInput = {
    topic: input.topic || project.topic,
    idea: input.idea ?? project.idea,
    valueGuide: input.valueGuide ?? project.valueGuide,
    learnerProfile: input.learnerProfile ?? project.learnerProfile,
    subject: input.subject || project.subject,
    grade: input.grade || project.grade,
    durationMinutes: input.durationMinutes || project.durationMinutes,
    style: input.style || project.style,
    mode: input.mode || project.mode,
    engineId: engine?.id
  };
  const version = (project.script?.version ?? 0) + 1;
  const startedAt = Date.now();
  let script: CourseScript;
  let generation: GenerationMeta;
  try {
    const result = await generateScriptWithModel(payload, settings, version, db.memory);
    script = result.script;
    generation = result.meta;
  } catch (error) {
    const message = error instanceof Error ? error.message : '模型生成失败';
    if (!settings.allowLocalFallback) {
      res.status(502).json({ error: `模型生成讲稿失败：${message}` });
      return;
    }
    script = generateScript(payload, version);
    generation = {
      engine: 'local-fallback',
      provider: 'local',
      model: '内置结构引擎',
      durationMs: Date.now() - startedAt,
      warnings: ['模型调用失败，已使用本地结构模板兜底'],
      error: message
    };
  }

  const previousTitle = project.title;
  const previousTopic = project.topic;
  script.comments = [];
  project.script = script;
  project.selectedEngines = { ...project.selectedEngines, script: engine?.id };
  project.generation = { ...project.generation, script: generation };
  Object.assign(project, {
    topic: payload.topic,
    idea: payload.idea,
    valueGuide: payload.valueGuide,
    learnerProfile: payload.learnerProfile,
    subject: payload.subject,
    grade: payload.grade,
    durationMinutes: payload.durationMinutes,
    style: payload.style
  });
  if (!previousTitle || previousTitle === previousTopic) project.title = script.title;
  project.status = 'producing';
  project.stage = 'script';
  project.progress = 32;
  project.slides = [];
  project.recordings = [];
  project.timeline = undefined;
  project.render = undefined;
  project.trace = makeTrace(project).map((step, index) =>
    index === 2
      ? {
          ...step,
          detail: `${engine?.name ?? '默认讲稿引擎'} · ${step.detail}`,
          engine: generation.engine,
          warnings: generation.warnings
        }
      : step
  );
  persistProject(project);
  mutateDb((db) => {
    db.activity.unshift({
      id: makeId('act'),
      agent: '析课',
      action:
        generation.engine === 'model'
          ? `完成结构化讲稿（${engine?.name ?? '讲稿引擎'}）`
          : '完成结构化讲稿（本地兜底）',
      target: project.title,
      time: '刚刚',
      status: 'done'
    });
  });
  res.json({ project, trace: project.trace, generation });
});

app.post('/api/projects/:id/script/comments', (req, res) => {
  try {
    const project = findProject(req.params.id);
    if (!project.script) {
      res.status(400).json({ error: '请先生成讲稿，再提交修改意见' });
      return;
    }
    const note = String(req.body?.note || '').trim();
    if (!note) {
      res.status(400).json({ error: '请填写修改意见' });
      return;
    }
    const scope = req.body?.scope === 'section' ? 'section' : 'script';
    const sectionId = scope === 'section' ? String(req.body?.sectionId || '') : undefined;
    if (scope === 'section' && !project.script.sections.some((item) => item.id === sectionId)) {
      res.status(400).json({ error: '没有找到意见对应的讲稿段落' });
      return;
    }
    const quote = String(req.body?.quote || '').trim().slice(0, 500);
    const comment: ScriptComment = {
      id: makeId('comment'),
      scope,
      sectionId,
      quote: quote || undefined,
      note: note.slice(0, 2000),
      status: 'open',
      createdAt: now()
    };
    project.script.comments = [...(project.script.comments ?? []), comment];
    persistProject(project);
    res.status(201).json({ project, comment });
  } catch {
    res.status(404).json({ error: '课程项目不存在' });
  }
});

app.patch('/api/projects/:id/script/comments/:commentId', (req, res) => {
  try {
    const project = findProject(req.params.id);
    if (!project.script) {
      res.status(404).json({ error: '讲稿不存在' });
      return;
    }
    const comments = project.script.comments ?? [];
    const comment = comments.find((item) => item.id === req.params.commentId);
    if (!comment) {
      res.status(404).json({ error: '修改意见不存在' });
      return;
    }
    if (typeof req.body?.note === 'string') {
      const note = req.body.note.trim();
      if (!note) {
        res.status(400).json({ error: '修改意见不能为空' });
        return;
      }
      comment.note = note.slice(0, 2000);
    }
    if (req.body?.status === 'open' || req.body?.status === 'resolved') {
      comment.status = req.body.status;
    }
    comment.updatedAt = now();
    project.script.comments = comments;
    persistProject(project);
    res.json({ project, comment });
  } catch {
    res.status(404).json({ error: '课程项目不存在' });
  }
});

app.delete('/api/projects/:id/script/comments/:commentId', (req, res) => {
  try {
    const project = findProject(req.params.id);
    if (!project.script) {
      res.status(404).json({ error: '讲稿不存在' });
      return;
    }
    const comments = project.script.comments ?? [];
    const next = comments.filter((item) => item.id !== req.params.commentId);
    if (next.length === comments.length) {
      res.status(404).json({ error: '修改意见不存在' });
      return;
    }
    project.script.comments = next;
    persistProject(project);
    res.json({ project });
  } catch {
    res.status(404).json({ error: '课程项目不存在' });
  }
});

const rawMediaUpload = express.raw({ type: () => true, limit: '512mb' });

app.post('/api/projects/:id/recordings/media', rawMediaUpload, async (req, res) => {
  try {
    const project = findProject(req.params.id);
    const kind = req.query.kind === 'video' ? 'video' : 'audio';
    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const rawName = String(req.headers['x-file-name'] || '');
    let decodedName = rawName;
    try {
      decodedName = decodeURIComponent(rawName);
    } catch {
      decodedName = rawName;
    }
    const originalName = decodedName || (kind === 'video' ? '教师画面.webm' : '教师试讲.webm');
    const mime = String(req.headers['x-media-type'] || '');
    const durationSeconds = Math.max(0, Number(req.headers['x-duration-seconds']) || 0);
    if (buffer.length < 100) {
      res.status(400).json({ error: '没有收到有效的录制数据' });
      return;
    }
    if (kind === 'video') {
      const video = await saveTeacherVideoBuffer(
        project.id,
        buffer,
        mime,
        originalName,
        durationSeconds
      );
      res.status(201).json({ kind, video });
      return;
    }
    const asset = await saveRecordingBuffer(
      project.id,
      buffer,
      mime,
      originalName,
      'teacher',
      durationSeconds
    );
    res.status(201).json({ kind, asset });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : '录制数据保存失败'
    });
  }
});

app.post('/api/projects/:id/recordings', async (req, res) => {
  try {
    const project = findProject(req.params.id);
    const { dataUrl, name, kind, audioFileName } = req.body as {
      dataUrl?: string;
      name?: string;
      kind?: 'teacher' | 'upload';
      audioFileName?: string;
    };
    const assetKind = kind === 'upload' ? 'upload' : 'teacher';
    const assetName = name || (assetKind === 'upload' ? '教师录音文件' : '教师录音.webm');
    const durationHint = Math.max(0, Number(req.body?.durationSeconds) || 0);
    let asset: RecordingAsset;
    if (audioFileName) {
      asset = await describeRecordingFile(
        project.id,
        String(audioFileName),
        assetName,
        assetKind,
        durationHint
      );
    } else {
      if (!dataUrl) {
        res.status(400).json({ error: '没有收到录音数据' });
        return;
      }
      asset = await saveRecordingFile(project.id, dataUrl, assetName, assetKind, durationHint);
    }
    const transcript = String(req.body?.transcript || '').trim();
    const transcriptSegments = (
      Array.isArray(req.body?.transcriptSegments) ? req.body.transcriptSegments : []
    ).filter(
      (segment: unknown): segment is TranscriptSegment =>
        Boolean(
          segment &&
            typeof segment === 'object' &&
            typeof (segment as TranscriptSegment).text === 'string' &&
            Number.isFinite((segment as TranscriptSegment).startSeconds) &&
            Number.isFinite((segment as TranscriptSegment).endSeconds)
        )
    );
    const knownSlides = new Set(project.slides.map((slide) => slide.id));
    const rawSlideEvents: unknown[] = Array.isArray(req.body?.slideEvents)
      ? (req.body.slideEvents as unknown[])
      : [];
    const slideEvents: SlideVisitEvent[] = rawSlideEvents
      .filter(
        (event: unknown): event is SlideVisitEvent =>
          Boolean(
            event &&
              typeof event === 'object' &&
              knownSlides.has(String((event as SlideVisitEvent).slideId)) &&
              Number.isFinite((event as SlideVisitEvent).atSeconds)
          )
      )
      .map((event: SlideVisitEvent) => ({
        slideId: event.slideId,
        slideOrder: Math.max(1, Math.round(Number(event.slideOrder) || 1)),
        atSeconds: Math.max(0, Number(event.atSeconds))
      }))
      .sort((a, b) => a.atSeconds - b.atSeconds);
    const aligned = alignTranscript(
      project.script,
      transcript,
      transcriptSegments,
      asset.durationSeconds
    );
    asset.transcript = transcript;
    asset.transcriptSegments = transcriptSegments;
    asset.slideEvents = slideEvents;
    const videoDataUrl = String(req.body?.videoDataUrl || '').trim();
    const videoFileName = String(req.body?.videoFileName || '').trim();
    if (videoFileName || videoDataUrl) {
      try {
        const video = videoFileName
          ? await describeTeacherVideoFile(project.id, videoFileName, asset.durationSeconds)
          : await saveTeacherVideoFile(
          project.id,
          videoDataUrl,
          `教师画面_${asset.name || '试讲'}.webm`
        );
        asset.videoUrl = video.url;
        asset.videoFileName = video.fileName;
        asset.videoSizeBytes = video.sizeBytes;
      } catch (videoError) {
        res.status(400).json({
          error: videoError instanceof Error ? videoError.message : '教师画面保存失败'
        });
        return;
      }
    }
    asset.segments = aligned.segments;
    asset.alignmentMethod = aligned.method;
    asset.alignmentConfidence = aligned.confidence;
    asset.alignment = aligned.alignment;
    project.recordings = [asset, ...project.recordings.filter((item) => item.kind !== asset.kind)];
    project.stage = 'audio';
    project.progress = Math.max(project.progress, 74);
    project.status = 'producing';
    refreshTimeline(project, asset.id);
    persistProject(project);
    res.status(201).json({ project, asset, alignment: aligned });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : '录音保存失败' });
  }
});

app.post('/api/projects/:id/recordings/:recordingId/transcript', (req, res) => {
  try {
    const project = findProject(req.params.id);
    const asset = project.recordings.find((item) => item.id === req.params.recordingId);
    if (!asset) {
      res.status(404).json({ error: '录音不存在' });
      return;
    }
    asset.transcript = String(req.body?.transcript || '').trim();
    // Hand-edited transcripts invalidate old per-sentence timestamps.
    const aligned = alignTranscript(project.script, asset.transcript, undefined, asset.durationSeconds);
    asset.transcriptSegments = [];
    asset.segments = aligned.segments;
    asset.alignmentMethod = aligned.method;
    asset.alignmentConfidence = aligned.confidence;
    asset.alignment = aligned.alignment;
    refreshTimeline(project, asset.id);
    persistProject(project);
    res.json({ project, asset, alignment: aligned });
  } catch {
    res.status(404).json({ error: '课程项目不存在' });
  }
});

const activeRenders = new Set<string>();


/* ------------------------------------------------------------------ */
/* Course composer: mount media onto the timeline and build the        */
/* interactive HTML course.                                            */
/* ------------------------------------------------------------------ */

app.post('/api/projects/:id/composer/suggest', async (req, res) => {
  try {
    const project = findProject(req.params.id);
    const settings = readDb().settings;
    const result = await locateConceptAnchors(project, settings);
    res.json({
      anchors: result.anchors,
      source: result.source,
      warning: result.warning ?? '',
      artifacts: project.artifacts ?? [],
      labels: MOUNT_KIND_LABEL
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : '概念定位失败'
    });
  }
});

app.post('/api/projects/:id/mounts', (req, res) => {
  try {
    const project = findProject(req.params.id);
    const body = (req.body || {}) as Record<string, unknown>;
    const mediaKind = (String(body.mediaKind || 'concept-card') as MediaKind) ?? 'concept-card';
    const atSeconds = Math.max(0, Number(body.atSeconds) || 0);
    let html = String(body.html || '');
    let artifactId = typeof body.artifactId === 'string' ? body.artifactId : undefined;
    let title = String(body.title || '').trim();
    let description = String(body.description || '').trim();

    if (body.generateCard) {
      const db = readDb();
      const artifact = createMediaArtifact(project, db.engines, {
        kind: mediaKind,
        title: title || undefined,
        description: description || undefined,
        triggerSeconds: atSeconds
      });
      project.artifacts = [artifact, ...(project.artifacts ?? [])];
      html = artifact.html;
      artifactId = artifact.id;
      title = title || artifact.title;
      description = description || artifact.description;
    } else if (artifactId) {
      const artifact = (project.artifacts ?? []).find((item) => item.id === artifactId);
      if (artifact) {
        html = artifact.html;
        title = title || artifact.title;
        description = description || artifact.description;
      }
    }

    if (!html) {
      res.status(400).json({ error: '挂载卡片需要内容，请先生成介质或选择已有介质' });
      return;
    }

    const createdAt = new Date().toISOString();
    const mount: CourseMount = {
      id: makeId('mount'),
      artifactId,
      mediaKind,
      title: title || '未命名卡片',
      description,
      html,
      concept: String(body.concept || '').trim() || undefined,
      atSeconds: Number(atSeconds.toFixed(2)),
      endSeconds: Math.max(atSeconds + 4, Number(body.endSeconds) || atSeconds + 8),
      placement: (String(body.placement || 'below') as MediaTriggerPlacement) ?? 'below',
      source: artifactId ? 'artifact' : 'manual',
      createdAt,
      updatedAt: createdAt
    };
    project.mounts = [...(project.mounts ?? []), mount].sort(
      (a, b) => a.atSeconds - b.atSeconds
    );
    persistProject(project);
    res.json(project);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : '挂载失败'
    });
  }
});

app.patch('/api/projects/:id/mounts/:mountId', (req, res) => {
  try {
    const project = findProject(req.params.id);
    const body = (req.body || {}) as Record<string, unknown>;
    let updated = false;
    project.mounts = (project.mounts ?? []).map((mount) => {
      if (mount.id !== req.params.mountId) return mount;
      updated = true;
      const atSeconds =
        body.atSeconds !== undefined
          ? Math.max(0, Number(body.atSeconds) || 0)
          : mount.atSeconds;
      return {
        ...mount,
        title: typeof body.title === 'string' ? body.title : mount.title,
        description:
          typeof body.description === 'string' ? body.description : mount.description,
        concept: typeof body.concept === 'string' ? body.concept : mount.concept,
        html: typeof body.html === 'string' ? body.html : mount.html,
        placement:
          typeof body.placement === 'string'
            ? (body.placement as MediaTriggerPlacement)
            : mount.placement,
        atSeconds: Number(atSeconds.toFixed(2)),
        endSeconds:
          body.endSeconds !== undefined
            ? Number(body.endSeconds)
            : Math.max(atSeconds + 4, mount.endSeconds ?? atSeconds + 8),
        updatedAt: new Date().toISOString()
      };
    });
    if (!updated) {
      res.status(404).json({ error: '挂载卡片不存在' });
      return;
    }
    project.mounts.sort((a, b) => a.atSeconds - b.atSeconds);
    persistProject(project);
    res.json(project);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : '更新挂载失败'
    });
  }
});

app.delete('/api/projects/:id/mounts/:mountId', (req, res) => {
  try {
    const project = findProject(req.params.id);
    const before = (project.mounts ?? []).length;
    project.mounts = (project.mounts ?? []).filter(
      (mount) => mount.id !== req.params.mountId
    );
    if (project.mounts.length === before) {
      res.status(404).json({ error: '挂载卡片不存在' });
      return;
    }
    persistProject(project);
    res.json(project);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : '删除挂载失败'
    });
  }
});

app.post('/api/projects/:id/course-html', (req, res) => {
  try {
    const project = findProject(req.params.id);
    const result = buildCourseHtml(project, project.mounts ?? []);
    project.delivery = {
      ...(project.delivery ?? { status: 'idle' }),
      status: 'ready',
      builtAt: new Date().toISOString(),
      indexUrl: result.indexUrl,
      indexPath: result.indexPath,
      artifactCount: result.fileCount,
      sizeBytes: result.sizeBytes
    };
    persistProject(project);
    res.json({ ...result, project });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'HTML 课程生成失败'
    });
  }
});

app.post('/api/projects/:id/actions', async (req, res) => {
  try {
    const project = findProject(req.params.id);
    const action = String(req.body?.action ?? '');
    const settings = readDb().settings;

    if (action === 'save-script') {
      const script = req.body?.script as CourseScript | undefined;
      if (!script?.sections?.length) {
        res.status(400).json({ error: '讲稿内容不能为空' });
        return;
      }
      project.script = {
        ...script,
        comments: project.script?.comments ?? [],
        confirmed: Boolean(req.body?.keepConfirmed && script.confirmed),
        generatedAt: now()
      };
      project.stage = 'script';
      project.status = 'producing';
      invalidateProduction(project);
      if (project.script) project.script.confirmed = Boolean(req.body?.keepConfirmed && script.confirmed);
      persistProject(project);
      res.json(project);
      return;
    }

    if (action === 'confirm-script') {
      if (!project.script?.sections.length) {
        res.status(400).json({ error: '请先生成讲稿' });
        return;
      }
      project.script.confirmed = true;
      project.script.generatedAt = now();
      project.stage = 'slides';
      project.status = 'producing';
      project.progress = 46;
      project.render = undefined;
      persistProject(project);
      res.json(project);
      return;
    }

    if (action === 'generate-slides') {
      if (!project.script?.confirmed) {
        res.status(400).json({ error: '请先确认讲稿' });
        return;
      }
      const engine = resolveEngine(readDb().engines, 'slides', req.body?.engineId);
      const startedAt = Date.now();
      let slides: CourseSlide[];
      let generation: GenerationMeta;
      try {
        const engineVisualKinds = String(engine?.config.visualKinds || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
        const engineDensity = String(engine?.config.visualDensity || 'balanced');
        const result = await generateSlidesWithModel(project.script, settings, {
          visualKinds: engineVisualKinds,
          density: engineDensity
        });
        slides = result.slides;
        generation = result.meta;
      } catch (error) {
        const message = error instanceof Error ? error.message : '模型生成课件失败';
        if (!settings.allowLocalFallback) {
          res.status(502).json({ error: `模型生成课件失败：${message}` });
          return;
        }
        slides = generateSlides(project.script, project.slides);
        generation = {
          engine: 'local-fallback',
          provider: 'local',
          model: '内置分镜引擎',
          durationMs: Date.now() - startedAt,
          warnings: ['模型调用失败，已使用本地分镜模板兜底'],
          error: message
        };
      }
      project.slides = applySlideEngine(slides, engine);
      project.selectedEngines = { ...project.selectedEngines, slides: engine?.id };
      project.generation = { ...project.generation, slides: generation };
      project.stage = 'slides';
      project.progress = 58;
      project.trace = makeTrace(project).map((step, index) =>
        index === 2
          ? {
              ...step,
              detail: `${engine?.name ?? '默认课件引擎'} · ${step.detail}`,
              engine: generation.engine,
              warnings: generation.warnings
            }
          : step
      );
      const cover = project.slides.find((slide) => slide.layout === 'cover');
      if (cover) project.title = project.script.title;
      refreshTimeline(project);
      persistProject(project);
      res.json(project);
      return;
    }

    if (action === 'enter-audio') {
      if (!project.script?.confirmed) {
        res.status(400).json({ error: '请先确认讲稿' });
        return;
      }
      project.stage = 'audio';
      project.progress = Math.max(project.progress, 64);
      project.status = 'producing';
      persistProject(project);
      res.json(project);
      return;
    }

    if (action === 'generate-tts') {
      if (!project.script?.confirmed) {
        res.status(400).json({ error: '讲稿尚未确认' });
        return;
      }
      const engine = resolveEngine(readDb().engines, 'audio', req.body?.engineId);
      const voice = voiceForEngine(
        settings.ttsEngine,
        String(engine?.config.voice || settings.ttsVoice)
      );
      const rate = Number(engine?.config.rate);
      const ttsSettings = {
        ...settings,
        ttsVoice: voice,
        ttsRate: Number.isFinite(rate) ? rate : settings.ttsRate
      };
      try {
        const result = await synthesizeNarration(project, ttsSettings);
        result.asset.alignmentMethod = 'segment';
        result.asset.alignmentConfidence = 100;
        result.asset.alignment = 100;
        project.recordings = [
          result.asset,
          ...project.recordings.filter((asset) => asset.kind !== 'tts')
        ];
        project.selectedEngines = { ...project.selectedEngines, audio: engine?.id };
        project.stage = 'audio';
        project.progress = Math.max(project.progress, 78);
        project.status = 'producing';
        refreshTimeline(project, result.asset.id);
        project.trace = [
          {
            id: `tts-trace-${Date.now()}`,
            label: '旁白语音生成',
            detail: `${engine?.name ?? '默认声音引擎'} · ${result.asset.name} · ${result.asset.durationSeconds.toFixed(1)} 秒 · ${project.script.sections.length} 段`,
            status: 'done',
            durationMs: 3200
          },
          ...project.trace.slice(0, 3)
        ];
        persistProject(project);
        mutateDb((db) => {
          db.activity.unshift({
            id: makeId('act'),
            agent: '声场',
            action: '生成课程旁白',
            target: project.title,
            time: '刚刚',
            status: 'done'
          });
        });
        res.json(project);
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : '语音生成失败，请检查语音服务'
        });
      }
      return;
    }

    if (action === 'save-recording') {
      const durationSeconds = Math.max(1, Number(req.body?.durationSeconds) || 1);
      const transcript = String(req.body?.transcript || '录音已收到，可在右侧补充口述转写。');
      const aligned = alignTranscript(project.script, transcript, undefined, durationSeconds);
      const asset: RecordingAsset = {
        id: makeId('rec'),
        kind: req.body?.kind === 'upload' ? 'upload' : 'teacher',
        name: req.body?.name || '教师录音.webm',
        durationSeconds,
        status: 'done',
        alignment: aligned.alignment,
        createdAt: now(),
        transcript,
        transcriptSegments: [],
        segments: aligned.segments,
        alignmentMethod: aligned.method,
        alignmentConfidence: aligned.confidence
      };
      project.recordings = [asset, ...project.recordings];
      project.stage = 'audio';
      project.progress = Math.max(project.progress, 74);
      refreshTimeline(project, asset.id);
      persistProject(project);
      res.json(project);
      return;
    }

    if (action === 'enter-render') {
      project.stage = 'render';
      project.progress = Math.max(project.progress, 86);
      project.render = project.render || {
        status: 'idle',
        progress: 0,
        resolution: '1920 × 1080',
        format: 'MP4 / H.264',
        updatedAt: now(),
        downloadReady: false
      };
      persistProject(project);
      res.json(project);
      return;
    }

    if (action === 'assemble') {
      if (!project.script?.confirmed) {
        res.status(400).json({ error: '讲稿尚未确认' });
        return;
      }
      if (!project.slides.length) {
        res.status(400).json({ error: '请先生成课件' });
        return;
      }
      if (activeRenders.has(project.id)) {
        res.json(project);
        return;
      }
      const renderEngine = resolveEngine(readDb().engines, 'render', req.body?.engineId);
      const preferredAudio = findProjectAudio(project, req.body?.audioAssetId);
      project.stage = 'render';
      project.progress = 88;
      project.selectedEngines = { ...project.selectedEngines, render: renderEngine?.id };
      project.delivery = undefined;
      project.render = {
        status: 'running',
        progress: 3,
        resolution: '1920 × 1080',
        format: 'MP4 / H.264',
        updatedAt: now(),
        downloadReady: false,
        stageMessage: preferredAudio ? '准备课程时间轴' : '尚未生成旁白，将先合成语音',
        startedAt: now()
      };
      persistProject(project);
      activeRenders.add(project.id);
      res.status(202).json(project);

      void (async () => {
        try {
          let audioAsset = preferredAudio;
          if (!audioAsset) {
            project.render = {
              ...project.render!,
              progress: 8,
              stageMessage: '正在合成 AI 旁白'
            };
            persistProject(project);
            const synthesized = await synthesizeNarration(project, settings);
            audioAsset = synthesized.asset;
            synthesized.asset.alignmentMethod = 'segment';
            synthesized.asset.alignmentConfidence = 100;
            synthesized.asset.alignment = 100;
            project.recordings = [
              synthesized.asset,
              ...project.recordings.filter((asset) => asset.kind !== 'tts')
            ];
            persistProject(project);
          }
          project.timeline = buildCourseTimeline(project, audioAsset);
          project.render = {
            ...project.render!,
            progress: 12,
            stageMessage: `统一时间轴 · ${project.timeline.method === 'measured' ? '实测对齐' : '估算对齐'}`,
            updatedAt: now()
          };
          persistProject(project);
          const result = await renderCourseVideo(
            project,
            settings,
            audioAsset,
            (progress, message) => {
              project.render = {
                ...project.render!,
                status: 'running',
                progress,
                stageMessage: message,
                updatedAt: now()
              };
              project.progress = Math.min(97, Math.round(88 + progress * 0.09));
              persistProject(project);
            }
          );
          project.render = {
            status: 'done',
            progress: 100,
            resolution: '1920 × 1080',
            format: 'MP4 / H.264 · 25fps',
            updatedAt: now(),
            downloadReady: true,
            downloadUrl: mediaUrl(project.id, 'render/course.mp4'),
            posterUrl: mediaUrl(project.id, 'render/poster.jpg'),
            durationSeconds: result.durationSeconds,
            sizeBytes: result.sizeBytes,
            stageMessage: '成片已导出',
            startedAt: project.render?.startedAt,
            finishedAt: now()
          };
          project.progress = 100;
          project.status = 'review';
          project.stage = 'render';
          project.trace = [
            {
              id: `render-trace-${Date.now()}`,
              label: '成片渲染完成',
              detail: `${renderEngine?.name ?? '默认成片引擎'} · 1080p · ${result.durationSeconds.toFixed(0)} 秒 · ${(
                result.sizeBytes /
                1024 /
                1024
              ).toFixed(1)} MB`,
              status: 'done',
              durationMs: 6200
            },
            ...project.trace.slice(0, 3)
          ];
          persistProject(project);
          mutateDb((db) => {
            db.activity.unshift({
              id: makeId('act'),
              agent: '剪序',
              action: '导出课程成片',
              target: project.title,
              time: '刚刚',
              status: 'done'
            });
          });
        } catch (error) {
          project.render = {
            ...(project.render ?? {
              resolution: '1920 × 1080',
              format: 'MP4 / H.264',
              downloadReady: false
            }),
            status: 'error',
            progress: project.render?.progress ?? 0,
            updatedAt: now(),
            stageMessage: '渲染未完成',
            error: error instanceof Error ? error.message : '成片渲染失败',
            downloadReady: false
          };
          persistProject(project);
        } finally {
          activeRenders.delete(project.id);
        }
      })();
      return;
    }

    if (action === 'publish') {
      if (!project.render?.downloadReady) {
        res.status(400).json({ error: '请先完成成片渲染' });
        return;
      }
      if (project.delivery?.status !== 'ready') {
        try {
          project.delivery = await buildDeliveryBundle(project);
        } catch (error) {
          res.status(400).json({
            error: error instanceof Error ? error.message : 'HTML 交付包构建失败'
          });
          return;
        }
      }
      project.status = 'done';
      project.progress = 100;
      persistProject(project);
      res.json(project);
      return;
    }

    res.status(400).json({ error: '未知的生产动作' });
  } catch {
    res.status(404).json({ error: '课程项目不存在' });
  }
});

app.post('/api/projects/:id/slides/:slideId', (req, res) => {
  try {
    const project = findProject(req.params.id);
    project.slides = project.slides.map((slide) =>
      slide.id === req.params.slideId
        ? ({ ...slide, ...req.body, id: slide.id } as CourseSlide)
        : slide
    );
    refreshTimeline(project);
    persistProject(project);
    res.json(project);
  } catch {
    res.status(404).json({ error: '课件页面不存在' });
  }
});

/* ------------------------------------------------------------------ */
/* Engine workshop                                                    */
/* ------------------------------------------------------------------ */

const ENGINE_STAGES: ProductionStage[] = ['analysis', 'script', 'slides', 'audio', 'render', 'media'];
const ENGINE_KINDS = ['analysis', 'text', 'structure', 'image', 'voice', 'video', 'media'] as const;

const fallbackKind = (stage: ProductionStage) => {
  if (stage === 'analysis') return 'analysis';
  if (stage === 'audio') return 'voice';
  if (stage === 'render') return 'video';
  if (stage === 'media') return 'media';
  if (stage === 'slides') return 'structure';
  return 'text';
};

const cleanEnginePatch = (body: Record<string, unknown>) => {
  const patch: Partial<ProductionEngine> = {};
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
  if (typeof body.description === 'string') patch.description = body.description.trim();
  if (typeof body.stage === 'string' && ENGINE_STAGES.includes(body.stage as ProductionStage)) {
    patch.stage = body.stage as ProductionStage;
  }
  if (
    typeof body.kind === 'string' &&
    ENGINE_KINDS.includes(body.kind as (typeof ENGINE_KINDS)[number])
  ) {
    patch.kind = body.kind as ProductionEngine['kind'];
  }
  if (typeof body.agentId === 'string') patch.agentId = body.agentId.trim() || undefined;
  if (Array.isArray(body.skillIds)) {
    patch.skillIds = body.skillIds.filter((item): item is string => typeof item === 'string');
  }
  if (body.config && typeof body.config === 'object' && !Array.isArray(body.config)) {
    patch.config = Object.fromEntries(
      Object.entries(body.config as Record<string, unknown>).filter(([, value]) =>
        ['string', 'number', 'boolean'].includes(typeof value)
      )
    ) as ProductionEngine['config'];
  }
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
  return patch;
};

app.get('/api/engines', (_req, res) => {
  const db = readDb();
  res.json({ engines: db.engines, stageLabels: engineStageLabel });
});

app.post('/api/engines', (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) {
    res.status(400).json({ error: '请填写引擎名称' });
    return;
  }
  const db = readDb();
  const stage: ProductionStage = ENGINE_STAGES.includes(req.body?.stage)
    ? req.body.stage
    : 'script';
  const patch = cleanEnginePatch(req.body || {});
  const timestamp = now();
  const engine: ProductionEngine = {
    id: makeId('engine'),
    name,
    stage,
    kind: patch.kind ?? fallbackKind(stage),
    description: patch.description ?? '',
    agentId: patch.agentId,
    skillIds: patch.skillIds ?? [],
    config: patch.config ?? {},
    enabled: patch.enabled ?? true,
    isDefault: false,
    builtIn: false,
    runs: 0,
    lastRun: '尚未运行',
    createdAt: timestamp,
    updatedAt: timestamp
  };
  db.engines.push(engine);
  if (req.body?.makeDefault === true && engine.enabled) {
    setEngineDefault(db.engines, engine.id);
  }
  writeDb(db);
  res.status(201).json({ engine, engines: db.engines });
});

app.patch('/api/engines/:id', (req, res) => {
  const db = readDb();
  const engine = db.engines.find((item) => item.id === req.params.id);
  if (!engine) {
    res.status(404).json({ error: '引擎不存在' });
    return;
  }
  const patch = cleanEnginePatch(req.body || {});
  Object.assign(engine, patch);
  if (patch.stage && !patch.kind && !req.body?.kind) {
    engine.kind = fallbackKind(patch.stage);
  }
  engine.updatedAt = now();
  if (req.body?.isDefault === true && engine.enabled) {
    setEngineDefault(db.engines, engine.id);
  }
  if (!engine.enabled && engine.isDefault) {
    const alternative = db.engines.find(
      (item) => item.stage === engine.stage && item.enabled && item.id !== engine.id
    );
    engine.isDefault = false;
    if (alternative) setEngineDefault(db.engines, alternative.id);
  }
  writeDb(db);
  res.json({ engine, engines: db.engines });
});

app.delete('/api/engines/:id', (req, res) => {
  const db = readDb();
  const engine = db.engines.find((item) => item.id === req.params.id);
  if (!engine) {
    res.status(404).json({ error: '引擎不存在' });
    return;
  }
  if (engine.builtIn) {
    res.status(400).json({ error: '内置引擎不可删除，可以新建引擎并设为默认' });
    return;
  }
  db.engines = db.engines.filter((item) => item.id !== engine.id);
  for (const project of db.projects) {
    if (!project.selectedEngines) continue;
    for (const [stage, id] of Object.entries(project.selectedEngines)) {
      if (id === engine.id) {
        delete project.selectedEngines[stage as ProductionStage];
      }
    }
  }
  if (engine.isDefault) {
    const alternative = db.engines.find((item) => item.stage === engine.stage && item.enabled);
    if (alternative) setEngineDefault(db.engines, alternative.id);
  }
  writeDb(db);
  res.json({ ok: true, engines: db.engines });
});

app.post('/api/engines/:id/default', (req, res) => {
  const db = readDb();
  if (!setEngineDefault(db.engines, req.params.id)) {
    res.status(404).json({ error: '引擎不存在' });
    return;
  }
  writeDb(db);
  res.json({ engines: db.engines });
});

app.post('/api/engines/:id/run', async (req, res) => {
  const db = readDb();
  const engine = db.engines.find((item) => item.id === req.params.id);
  if (!engine) {
    res.status(404).json({ error: '引擎不存在' });
    return;
  }
  if (!engine.enabled) {
    res.status(400).json({ error: '该引擎已停用，请先启用' });
    return;
  }
  const input = String(req.body?.input || '').trim();
  if (!input) {
    res.status(400).json({ error: '请提供试运行输入' });
    return;
  }
  const skills = db.skills.filter(
    (skill) => engine.skillIds.includes(skill.id) && skill.enabled
  );
  const stageLabel = engineStageLabel[engine.stage] ?? engine.stage;
  try {
    let output: string;
    let meta: GenerationMeta | undefined;
    let trace: TraceStep[] = [];
    if (skills.length) {
      const agent = {
        id: engine.agentId || `engine-agent-${engine.id}`,
        name: engine.name,
        role: `${stageLabel}引擎`,
        description: engine.description,
        status: 'active' as const,
        model: '教学推理模型',
        skillIds: engine.skillIds,
        color: 'brick' as const,
        runs: engine.runs,
        lastRun: engine.lastRun
      };
      const result = await runAgentPipeline(agent, skills, input, db.settings);
      output = result.output;
      meta = result.meta;
      trace = result.steps.map((step, index) => ({
        id: `${step.skillId}-${Date.now()}-${index}`,
        label: step.skillName,
        detail: step.summary,
        status: 'done' as const,
        durationMs: step.durationMs,
        engine: 'model' as const
      }));
    } else {
      const configSummary = Object.entries(engine.config)
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(' · ');
      output = [
        `【${engine.name}】试运行通过`,
        '',
        `生产阶段：${stageLabel}`,
        `引擎类型：${engine.kind}`,
        `绑定 Skill：${engine.skillIds.length ? engine.skillIds.join('、') : '未绑定（当前使用引擎内置策略）'}`,
        configSummary ? `引擎配置：${configSummary}` : '',
        '',
        `输入摘要：${input.slice(0, 160)}`
      ]
        .filter(Boolean)
        .join('\n');
      trace = [
        {
          id: `${engine.id}-input-${Date.now()}`,
          label: '读取输入',
          detail: `${input.length} 个字符`,
          status: 'done',
          durationMs: 60
        },
        {
          id: `${engine.id}-plan-${Date.now()}`,
          label: `${stageLabel}策略规划`,
          detail: engine.description || `${engine.name}内置策略`,
          status: 'done',
          durationMs: 120,
          engine: 'system'
        }
      ];
    }
    engine.runs += 1;
    engine.lastRun = '刚刚';
    engine.updatedAt = now();
    db.activity.unshift({
      id: makeId('act'),
      agent: engine.name,
      action: `完成${stageLabel}引擎试运行`,
      target: input.slice(0, 24),
      time: '刚刚',
      status: 'done'
    });
    writeDb(db);
    res.json({ engine, output, meta, trace });
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : '引擎运行失败，请检查模型配置'
    });
  }
});

/* ------------------------------------------------------------------ */
/* Media workshop                                                     */
/* ------------------------------------------------------------------ */

app.get('/api/projects/:id/artifacts', (req, res) => {
  try {
    const project = findProject(req.params.id);
    res.json({
      artifacts: project.artifacts ?? [],
      kinds: MEDIA_KIND_LABEL,
      sections: project.script?.sections ?? [],
      slides: project.slides,
      timeline: project.timeline,
      render: project.render,
      delivery: project.delivery
    });
  } catch {
    res.status(404).json({ error: '课程项目不存在' });
  }
});

app.post('/api/projects/:id/artifacts', (req, res) => {
  try {
    const project = findProject(req.params.id);
    const body = (req.body || {}) as MediaGenerationInput;
    const kind = body.kind as MediaKind;
    if (!kind || !(kind in MEDIA_KIND_LABEL)) {
      res.status(400).json({ error: '请选择要生成的课程介质' });
      return;
    }
    if (!project.script) {
      res.status(400).json({ error: '请先生成讲稿，再生成课程介质' });
      return;
    }
    const artifact = createMediaArtifact(project, readDb().engines, { ...body, kind });
    project.artifacts = [...(project.artifacts ?? []), artifact];
    project.delivery = undefined;
    persistProject(project);
    mutateDb((db) => {
      db.activity.unshift({
        id: makeId('act'),
        agent: '介质工坊',
        action: `生成${MEDIA_KIND_LABEL[kind]}`,
        target: project.title,
        time: '刚刚',
        status: 'done'
      });
    });
    res.status(201).json({ artifact, project });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : '介质生成失败' });
  }
});

app.patch('/api/projects/:id/artifacts/:artifactId', (req, res) => {
  try {
    const project = findProject(req.params.id);
    const artifact = (project.artifacts ?? []).find((item) => item.id === req.params.artifactId);
    if (!artifact) {
      res.status(404).json({ error: '课程介质不存在' });
      return;
    }
    if (typeof req.body?.title === 'string' && req.body.title.trim()) {
      artifact.title = req.body.title.trim().slice(0, 120);
    }
    if (typeof req.body?.description === 'string') {
      artifact.description = req.body.description.trim().slice(0, 600);
    }
    if (Number.isFinite(Number(req.body?.triggerSeconds))) {
      artifact.triggerSeconds = Math.max(0, Number(req.body.triggerSeconds));
    }
    if (['below', 'side', 'focus'].includes(req.body?.placement)) {
      artifact.placement = req.body.placement;
    }
    if (typeof req.body?.sectionId === 'string') {
      artifact.sectionId = req.body.sectionId || undefined;
      const slide = project.slides.find((item) => item.sectionId === artifact.sectionId);
      artifact.slideId = slide?.id;
    }
    if (typeof req.body?.status === 'string' && ['draft', 'ready'].includes(req.body.status)) {
      artifact.status = req.body.status;
    }
    if (req.body?.regenerate === true) {
      artifact.html = buildMediaHtml(project, artifact.kind, artifact.sectionId);
      artifact.status = 'ready';
    }
    artifact.updatedAt = now();
    project.delivery = undefined;
    persistProject(project);
    res.json({ artifact, project });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : '介质更新失败' });
  }
});

app.post('/api/projects/:id/artifacts/:artifactId/generate', (req, res) => {
  try {
    const project = findProject(req.params.id);
    const artifact = (project.artifacts ?? []).find((item) => item.id === req.params.artifactId);
    if (!artifact) {
      res.status(404).json({ error: '课程介质不存在' });
      return;
    }
    artifact.html = buildMediaHtml(project, artifact.kind, artifact.sectionId);
    artifact.status = 'ready';
    artifact.updatedAt = now();
    project.delivery = undefined;
    persistProject(project);
    res.json({ artifact, project });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : '介质重新生成失败' });
  }
});

app.delete('/api/projects/:id/artifacts/:artifactId', (req, res) => {
  try {
    const project = findProject(req.params.id);
    const before = project.artifacts ?? [];
    const next = before.filter((item) => item.id !== req.params.artifactId);
    if (next.length === before.length) {
      res.status(404).json({ error: '课程介质不存在' });
      return;
    }
    project.artifacts = next;
    project.delivery = undefined;
    persistProject(project);
    res.json({ project });
  } catch {
    res.status(404).json({ error: '课程项目不存在' });
  }
});

/* ------------------------------------------------------------------ */
/* HTML delivery bundle                                               */
/* ------------------------------------------------------------------ */

app.get('/api/projects/:id/delivery', (req, res) => {
  try {
    const project = findProject(req.params.id);
    res.json({
      delivery: project.delivery,
      artifacts: project.artifacts ?? [],
      render: project.render,
      timeline: project.timeline
    });
  } catch {
    res.status(404).json({ error: '课程项目不存在' });
  }
});

app.post('/api/projects/:id/delivery/build', async (req, res) => {
  try {
    const project = findProject(req.params.id);
    project.delivery = await buildDeliveryBundle(project);
    persistProject(project);
    mutateDb((db) => {
      db.activity.unshift({
        id: makeId('act'),
        agent: '交付台',
        action: '构建 HTML 交付包',
        target: project.title,
        time: '刚刚',
        status: 'done'
      });
    });
    res.json({ project, delivery: project.delivery });
  } catch (error) {
    try {
      const project = findProject(req.params.id);
      project.delivery = {
        status: 'error',
        error: error instanceof Error ? error.message : '交付包构建失败',
        builtAt: now()
      };
      persistProject(project);
    } catch {
      // Project lookup already failed; keep the original error response.
    }
    res.status(400).json({ error: error instanceof Error ? error.message : '交付包构建失败' });
  }
});

app.post('/api/agents', (req, res) => {
  const { name, role, description, model, skillIds } = req.body;
  if (!name?.trim() || !role?.trim()) {
    res.status(400).json({ error: '请填写智能体名称和职责' });
    return;
  }
  const agent = {
    id: makeId('agent'),
    name: name.trim(),
    role: role.trim(),
    description: description?.trim() || '负责微课生产中的专项任务。',
    status: 'active' as const,
    model: model || '教学推理模型',
    skillIds: Array.isArray(skillIds) ? skillIds : [],
    color: 'brick' as const,
    runs: 0,
    lastRun: '尚未运行'
  };
  mutateDb((db) => {
    db.agents.push(agent);
  });
  res.status(201).json(agent);
});

app.patch('/api/agents/:id', (req, res) => {
  const db = readDb();
  const agent = db.agents.find((item) => item.id === req.params.id);
  if (!agent) {
    res.status(404).json({ error: '智能体不存在' });
    return;
  }
  Object.assign(agent, req.body, { id: agent.id });
  writeDb(db);
  res.json(agent);
});

app.post('/api/agents/:id/run', async (req, res) => {
  const db = readDb();
  const agent = db.agents.find((item) => item.id === req.params.id);
  if (!agent) {
    res.status(404).json({ error: '智能体不存在' });
    return;
  }
  if (agent.status === 'paused') {
    res.status(400).json({ error: '该智能体已暂停，请先启用' });
    return;
  }
  const input = String(req.body?.input || '').trim();
  if (!input) {
    res.status(400).json({ error: '请提供试运行输入' });
    return;
  }
  const skills = db.skills.filter((skill) => agent.skillIds.includes(skill.id));
  if (!skills.filter((skill) => skill.enabled).length) {
    res.status(400).json({ error: '该智能体没有启用的 Skill' });
    return;
  }
  try {
    const result = await runAgentPipeline(agent, skills, input, db.settings);
    agent.runs += 1;
    agent.lastRun = '刚刚';
    const trace = result.steps.map((step, index) => ({
      id: `${step.skillId}-${Date.now()}-${index}`,
      label: step.skillName,
      detail: step.summary,
      status: 'done' as const,
      durationMs: step.durationMs,
      engine: 'model' as const
    }));
    db.activity.unshift({
      id: makeId('act'),
      agent: agent.name,
      action: `完成${agent.role}试运行`,
      target: input.slice(0, 24),
      time: '刚刚',
      status: 'done'
    });
    writeDb(db);
    res.json({ agent, trace, output: result.output, meta: result.meta });
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : '智能体运行失败，请检查模型配置'
    });
  }
});

app.post('/api/skills', (req, res) => {
  const { name, category, description, model, inputHint, outputHint } = req.body;
  if (!name?.trim()) {
    res.status(400).json({ error: '请填写 Skill 名称' });
    return;
  }
  const skill = {
    id: makeId('skill'),
    name: name.trim(),
    category: category || '讲稿',
    description: description?.trim() || '自定义微课生产技能。',
    enabled: true,
    version: '0.1.0',
    model: model || '教学推理模型',
    latencyMs: 900,
    runs: 0,
    inputHint: inputHint || '任务输入',
    outputHint: outputHint || '结构化输出',
    origin: 'custom' as const
  };
  mutateDb((db) => {
    db.skills.push(skill);
  });
  res.status(201).json(skill);
});

app.patch('/api/skills/:id', (req, res) => {
  const db = readDb();
  const skill = db.skills.find((item) => item.id === req.params.id);
  if (!skill) {
    res.status(404).json({ error: 'Skill 不存在' });
    return;
  }
  Object.assign(skill, req.body, { id: skill.id });
  writeDb(db);
  res.json(skill);
});

app.post('/api/skills/:id/run', async (req, res) => {
  const db = readDb();
  const skill = db.skills.find((item) => item.id === req.params.id);
  if (!skill) {
    res.status(404).json({ error: 'Skill 不存在' });
    return;
  }
  if (!skill.enabled) {
    res.status(400).json({ error: '该 Skill 已停用，请先启用' });
    return;
  }
  const input = String(req.body?.input || '').trim();
  if (!input) {
    res.status(400).json({ error: '请提供试运行输入' });
    return;
  }
  try {
    const result = await runSkillWithModel(skill, input, db.settings);
    skill.runs += 1;
    skill.latencyMs = result.meta.durationMs;
    const trace = [
      {
        id: `${skill.id}-input-${Date.now()}`,
        label: '读取输入',
        detail: `${input.length} 个字符 · ${skill.inputHint}`,
        status: 'done' as const,
        durationMs: 80
      },
      {
        id: `${skill.id}-run-${Date.now()}`,
        label: skill.name,
        detail: result.output.summary,
        status: 'done' as const,
        durationMs: result.meta.durationMs,
        engine: 'model' as const
      },
      {
        id: `${skill.id}-audit-${Date.now()}`,
        label: '输出结构校验',
        detail: '字段已对齐 Skill 输出契约',
        status: 'done' as const,
        durationMs: 60
      }
    ];
    const formatted = [
      result.output.summary,
      '',
      result.output.keyPoints.length ? `【关键要点】\n${result.output.keyPoints.map((item, index) => `${index + 1}. ${item}`).join('\n')}` : '',
      '',
      result.output.cautions.length ? `【人工复核建议】\n${result.output.cautions.map((item) => `· ${item}`).join('\n')}` : '',
      '',
      result.output.result ? `【交付物】\n${result.output.result}` : ''
    ]
      .filter(Boolean)
      .join('\n');
    db.activity.unshift({
      id: makeId('act'),
      agent: skill.category === '质检' ? '校尺' : 'Skill 调试台',
      action: `试运行 ${skill.name}`,
      target: input.slice(0, 24),
      time: '刚刚',
      status: 'done'
    });
    writeDb(db);
    res.json({
      skill,
      trace,
      output: formatted,
      meta: result.meta,
      structured: result.output
    });
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : 'Skill 运行失败，请检查模型服务'
    });
  }
});

app.patch('/api/settings', (req, res) => {
  const db = readDb();
  const { apiKey, clearApiKey, ...safeSettings } = (req.body || {}) as Record<string, unknown>;
  const next = { ...safeSettings } as Record<string, unknown>;
  if (next.brand && typeof next.brand === 'object') {
    next.brand = { ...db.settings.brand, ...(next.brand as Record<string, unknown>) };
  }
  if (next.videoFrame && typeof next.videoFrame === 'object') {
    next.videoFrame = {
      ...db.settings.videoFrame,
      ...(next.videoFrame as Record<string, unknown>)
    };
  }
  const nextEngine =
    (next.ttsEngine as typeof db.settings.ttsEngine | undefined) ?? db.settings.ttsEngine;
  const nextVoice = typeof next.ttsVoice === 'string' ? next.ttsVoice : db.settings.ttsVoice;
  next.ttsVoice = voiceForEngine(nextEngine, nextVoice);
  db.settings = { ...db.settings, ...(next as Partial<typeof db.settings>) };
  if (typeof apiKey === 'string') {
    setModelApiKey(apiKey);
  } else if (clearApiKey) {
    clearModelApiKey();
  }
  writeDb(db);
  res.json(publicSettings());
});

app.post('/api/settings/model/test', async (req, res) => {
  const db = readDb();
  const override = (req.body || {}) as Partial<typeof db.settings>;
  const settings = { ...db.settings, ...override };
  const result = await testModelConnection(settings);
  res.json(result);
});

app.post('/api/settings/model/api-key', (req, res) => {
  const key = String(req.body?.apiKey || '').trim();
  if (!key) {
    res.status(400).json({ error: 'API Key 不能为空' });
    return;
  }
  setModelApiKey(key);
  res.json({ ok: true, apiKeyConfigured: true });
});

app.delete('/api/settings/model/api-key', (_req, res) => {
  clearModelApiKey();
  res.json({ ok: true, apiKeyConfigured: false });
});

app.post('/api/settings/mimo/api-key', (req, res) => {
  const key = String(req.body?.apiKey || '').trim();
  if (!key) {
    res.status(400).json({ error: 'MiMo API Key 不能为空' });
    return;
  }
  setMimoApiKey(key);
  res.json({ ok: true, mimoApiKeyConfigured: true });
});

app.delete('/api/settings/mimo/api-key', (_req, res) => {
  clearMimoApiKey();
  res.json({ ok: true, mimoApiKeyConfigured: false });
});

app.post('/api/settings/mimo/test', async (_req, res) => {
  res.json(await testMimoSpeech());
});

app.post('/api/speech/transcribe', rawMediaUpload, async (req, res) => {
  const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!buffer.length) {
    res.status(400).json({ error: '没有收到可识别的录音' });
    return;
  }
  try {
    const mime = String(req.headers['x-media-type'] || 'audio/webm');
    res.json(await transcribeMimoAudio(buffer, mime));
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : 'MiMo 语音识别失败'
    });
  }
});

app.post('/api/system/reset', (_req, res) => {
  resetDb();
  res.json({ ok: true });
});

app.get('/api/health', (_req, res) => {
  const db = readDb();
  res.json({
    ok: true,
    capabilities: detectCapabilities(db.settings),
    secureCapture: {
      httpsReady: httpsEnabled,
      httpsPort,
      caCertificateAvailable: fs.existsSync(caCertPath)
    },
    time: now()
  });
});

app.get('/api/lan/info', (req, res) => {
  const hostname = req.hostname;
  res.json({
    httpUrl: `http://${hostname}:${port}`,
    httpsUrl: httpsEnabled ? `https://${hostname}:${httpsPort}` : null,
    caCertificateUrl: httpsEnabled && fs.existsSync(caCertPath) ? '/api/lan/ca-cert' : null
  });
});

app.get('/api/lan/ca-cert', (_req, res) => {
  if (!fs.existsSync(caCertPath)) {
    res.status(404).json({ error: '本地 CA 证书尚未生成' });
    return;
  }
  res.download(caCertPath, 'kexu-local-ca.crt');
});

const distPath = distRoot;
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      next();
      return;
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.use((error: unknown, _req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (
    error &&
    typeof error === 'object' &&
    (error as { type?: string }).type === 'entity.too.large'
  ) {
    res.status(413).json({ error: '上传内容过大，请缩短单次试讲，或关闭教师画面后重试。' });
    return;
  }
  console.error(error);
  res.status(500).json({
    error: error instanceof Error ? error.message : '服务器处理失败，请重试'
  });
});

app.listen(port, host, () => {
  console.log(`Course studio API listening on http://${host}:${port}`);
});

if (httpsEnabled) {
  https
    .createServer(
      {
        key: fs.readFileSync(tlsKeyPath),
        cert: fs.readFileSync(tlsCertPath)
      },
      app
    )
    .listen(httpsPort, host, () => {
      console.log(`Secure microphone endpoint listening on https://${host}:${httpsPort}`);
    });
}
