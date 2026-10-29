import type {
  AgentProfile,
  AgentSkill,
  CourseScript,
  CourseSlide,
  GenerationMeta,
  RuntimeSettings,
  ScriptGenerationInput,
  ScriptSection,
  ScriptSectionRole,
  SlideLayout,
  SlideRole,
  TeacherMemory,
  ValueDimension
} from '../src/types';
import { callModel, parseJsonLoose } from './llm';
import { reconcileScript, reconcileSlides } from './mapping';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const text = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value.trim() : fallback;

const strings = (value: unknown, limit = 8) =>
  Array.isArray(value)
    ? value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
        .slice(0, limit)
    : [];

const number = (value: unknown, fallback: number) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const modeInstruction: Record<string, string> = {
  auto: '全自动模式：讲稿要能被后续 AI 直接用于课件、旁白与成片。',
  oral: '口语稿模式：段落边界必须清楚，方便教师完整口述后按语义定位；每段可略短，留出自然停顿。',
  ppt: 'PPT 驱动模式：每段要对应一个明确的画面任务，教师会对照页面录制。'
};

const scriptSchema = `{
  "title": "课程标题",
  "thesis": "一句话核心主张",
  "openingHook": "开场第一句口播",
  "objectives": ["学习目标1", "学习目标2", "学习目标3", "学习目标4"],
  "valueThread": [{"label": "价值关键词", "content": "价值落点"}],
  "sections": [
    {
      "id": "英文短标识，如 open",
      "order": 1,
      "role": "intro 或 objectives 或 body 或 close",
      "title": "该段标题",
      "purpose": "教学任务",
      "narration": "可直接朗读的口播稿，不要出现舞台提示",
      "slideBrief": "该段课件的视觉任务",
      "valueNote": "该段价值落点",
      "durationSeconds": 70
    }
  ],
  "summary": "收束语",
  "keywords": ["关键词1", "关键词2", "关键词3"],
  "quality": {"structure": 92, "oral": 90, "value": 89, "fit": 91, "note": "一句质检建议"}
}`;

export function buildScriptMessages(input: ScriptGenerationInput, memory?: TeacherMemory) {
  const duration = clamp(Number(input.durationMinutes) || 8, 3, 45) * 60;
  const memoryBlock = memory
    ? `
教师记忆（长期档案，作为稳定的教学约束）：
- 任教学科与学段：${memory.subject || '未填写'} · ${memory.grade || '未填写'}
- 教龄：${memory.yearsExperience || 0} 年
- 常见讲述风格：${memory.teachingStyle || '未填写'}
- 备课经验：${memory.experience || '未填写'}
- 教学心得：${memory.insights || '未填写'}
请在不改变课程目标的前提下，贴近这位教师的表达习惯与经验判断；不要把这些档案原文写进讲稿。`
    : '';
  return [
    {
      role: 'system' as const,
      content:
        '你是一位资深课程设计师与微课讲稿作者。你的输出必须严格是 JSON，不要 Markdown，不要解释。' +
        '讲稿要口语化、可朗读、有认知冲突和迁移，不堆砌术语。每个段落只承担一个教学任务。' +
        '价值引领必须落在具体判断或行动上，不能只写口号。'
    },
    {
      role: 'user' as const,
      content: `请为下面这门微课生成完整讲稿。

课程主题：${input.topic}
学科与学段：${input.subject} · ${input.grade}
目标时长：${duration} 秒（各段 durationSeconds 合计应接近这个数字）
教师想法草稿：${input.idea || '教师未提供，请自行设计一条从情境到迁移的路径'}
价值引领：${input.valueGuide || '求真、责任与行动'}
学情：${input.learnerProfile || '未提供，请按该学段常见认知水平处理'}
讲述风格：${input.style || '清晰、口语化、问题驱动'}
生产模式：${modeInstruction[input.mode ?? 'auto'] ?? modeInstruction.auto}
${memoryBlock}

要求：
1. 段落结构固定为：第 1 段 role=intro（主题引入，60-110 字，讲清这节课的主题与要解决的问题）；
   第 2 段 role=objectives（学习目标，60-110 字，把学习目标说成可检验的收获）；
   中间 3-5 段 role=body，形成完整问题链：情境钩子 → 拆解 → 概念/机制 → 证据或案例 → 迁移；
   最后 1 段 role=close（收束，60-110 字，回扣开场的问题并收拢方法与价值）。
2. 每一段都会对应课件中的一页，讲稿与页面必须一一对应，段落顺序就是页面顺序。
3. 每段 narration 60-260 个汉字，句子短，可直接朗读；不要写“（停顿）”“画面显示”等提示。
4. id 使用英文短标识且全课唯一；order 从 1 连续递增；role 只能是 intro、objectives、body、close。
5. 所有 durationSeconds 为正整数，合计接近 ${duration} 秒。
6. quality 四项为 0-100 的整数。

只输出符合以下结构的 JSON：
${scriptSchema}`
    }
  ];
}

export function normalizeScript(
  raw: unknown,
  input: ScriptGenerationInput,
  version: number
): CourseScript {
  if (!raw || typeof raw !== 'object') throw new Error('模型没有返回讲稿对象');
  const source = raw as Record<string, unknown>;
  const rawSections = Array.isArray(source.sections) ? source.sections : [];
  const usedIds = new Set<string>();
  const sections: ScriptSection[] = rawSections
    .slice(0, 8)
    .map((item, index) => {
      const section = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      const narration = text(section.narration);
      if (!narration) return null;
      let id = text(section.id, `section-${index + 1}`)
        .replace(/[^a-zA-Z0-9_-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      if (!id) id = `section-${index + 1}`;
      while (usedIds.has(id)) id = `${id}-${index + 1}`;
      usedIds.add(id);
      const rawRole = text(section.role).toLowerCase();
      const role: ScriptSectionRole =
        rawRole === 'intro' || rawRole === 'objectives' || rawRole === 'close'
          ? rawRole
          : 'body';
      return {
        id,
        order: index + 1,
        role,
        title: text(section.title, `第 ${index + 1} 段`),
        purpose: text(section.purpose, '完成本段教学任务'),
        narration,
        slideBrief: text(section.slideBrief, '用一个核心视觉承载本段信息'),
        valueNote: text(section.valueNote, ''),
        durationSeconds: clamp(Math.round(number(section.durationSeconds, 70)), 15, 300)
      } satisfies ScriptSection;
    })
    .filter((section): section is ScriptSection => Boolean(section));

  if (sections.length < 2) throw new Error('模型返回的讲稿段落不足，至少需要 2 段');

  const targetSeconds = clamp(Number(input.durationMinutes) || 8, 3, 45) * 60;
  const currentTotal = sections.reduce((sum, section) => sum + section.durationSeconds, 0);
  if (currentTotal > 0 && Math.abs(currentTotal - targetSeconds) / targetSeconds > 0.12) {
    const ratio = targetSeconds / currentTotal;
    sections.forEach((section) => {
      section.durationSeconds = clamp(Math.round(section.durationSeconds * ratio), 15, 300);
    });
  }

  const rawValueThread = Array.isArray(source.valueThread) ? source.valueThread : [];
  const valueThread: ValueDimension[] = rawValueThread
    .slice(0, 4)
    .map((item) => {
      const entry = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      return { label: text(entry.label), content: text(entry.content) };
    })
    .filter((item) => item.label && item.content);

  const qualitySource =
    source.quality && typeof source.quality === 'object'
      ? (source.quality as Record<string, unknown>)
      : {};
  const narrationLength = sections.reduce(
    (sum, section) => sum + section.narration.replace(/\s/g, '').length,
    0
  );
  const averageLength = narrationLength / sections.length;
  const oralScore = clamp(Math.round(100 - Math.abs(averageLength - 160) / 4), 70, 98);

  const script: CourseScript = {
    title: text(source.title, input.topic),
    thesis: text(source.thesis, `理解${input.topic}，要从具体情境走向可检验的结构。`),
    openingHook: text(source.openingHook, sections[0].narration.slice(0, 120)),
    objectives: strings(source.objectives, 5).length
      ? strings(source.objectives, 5)
      : [
          `能用自己的话说清${input.topic}的核心问题。`,
          '能从情境中提取条件、对象与结果。',
          '能用案例检验自己的理解。',
          '能把分析框架迁移到新问题。'
        ],
    valueThread: valueThread.length
      ? valueThread
      : [
          { label: '求真', content: '先观察证据，再形成结论。' },
          { label: '边界', content: '理解模型成立的条件。' },
          { label: '行动', content: input.valueGuide || '让知识回到真实问题。' }
        ],
    sections,
    summary: text(source.summary, '把方法带回真实问题，带走一套可复用的分析框架。'),
    keywords: strings(source.keywords, 6).length
      ? strings(source.keywords, 6)
      : [input.topic, '结构', '证据', '迁移'],
    quality: {
      structure: clamp(Math.round(number(qualitySource.structure, 90)), 0, 100),
      oral: clamp(Math.round(number(qualitySource.oral, oralScore)), 0, 100),
      value: clamp(Math.round(number(qualitySource.value, 88)), 0, 100),
      fit: clamp(Math.round(number(qualitySource.fit, 90)), 0, 100),
      note: text(qualitySource.note, '模型已按讲稿结构生成，确认前建议完整朗读一遍。')
    },
    version,
    confirmed: false,
    generatedAt: new Date().toISOString()
  };
  return reconcileScript(script, input.topic);
}

export async function generateScriptWithModel(
  input: ScriptGenerationInput,
  settings: RuntimeSettings,
  version: number,
  memory?: TeacherMemory
): Promise<{ script: CourseScript; meta: GenerationMeta }> {
  const startedAt = Date.now();
  const response = await callModel(settings, {
    messages: buildScriptMessages(input, memory),
    json: true,
    temperature: 0.75,
    maxTokens: 5200
  });
  const raw = parseJsonLoose(response.text);
  const script = normalizeScript(raw, input, version);
  return {
    script,
    meta: {
      engine: 'model',
      provider: response.provider,
      model: response.model,
      durationMs: Date.now() - startedAt,
      warnings: []
    }
  };
}

const layouts: SlideLayout[] = [
  'cover',
  'objectives',
  'statement',
  'concept',
  'compare',
  'quote',
  'summary'
];
const accents: CourseSlide['accent'][] = ['brick', 'teal', 'gold', 'ink'];

export function buildSlideMessages(script: CourseScript) {
  const sectionText = script.sections
    .map(
      (section) =>
        `- ${section.id} | role=${section.role} | ${section.title} | 时长 ${section.durationSeconds}s | 视觉任务：${section.slideBrief} | 口播：${section.narration.slice(0, 220)}`
    )
    .join('\n');

  return [
    {
      role: 'system' as const,
      content:
        '你是一位课程视觉设计师，负责把讲稿转成 16:9 微课分镜。输出必须严格是 JSON，不要 Markdown，不要解释。' +
        '每页只承担一个表达任务，标题短，要点不超过 3 条，每条不超过 26 个汉字。不要把整段讲稿搬上屏幕。'
    },
    {
      role: 'user' as const,
      content: `请为下面这门微课生成课件页面。

课程标题：${script.title}
核心主张：${script.thesis}
学习目标：${script.objectives.join('；')}
关键词：${script.keywords.join('、')}

讲稿段落：
${sectionText}

要求：
1. 讲稿与页面必须一一对应，段落顺序就是页面顺序，不能多页也不能少页。
2. 第一页对应 role=intro 的段落，layout=cover，只放标题与一句核心主张。
3. 第二页对应 role=objectives 的段落，layout=objectives，最多 4 条学习目标。
4. 中间页对应 role=body 的段落，layout 取 statement / concept / compare，sectionId 等于该段 id。
5. 最后一页对应 role=close 的段落，layout=summary，sectionId 等于该段 id。
6. layout 只能取：cover, objectives, statement, concept, compare, quote, summary。
7. accent 只能取：brick, teal, gold, ink。
8. seconds 为正整数，与对应段落的口播时长相当；封面与目标页不要短于口播时长。
9. bullets 每页 1-3 条，短句；note 写给教师或渲染器的提示。

只输出 JSON：{"slides":[{"id":"slide-intro","order":1,"title":"...","eyebrow":"MICRO COURSE / 微课","layout":"cover","bullets":["..."],"note":"...","accent":"brick","sectionId":"intro","seconds":20}]}`
    }
  ];
}

export function normalizeSlides(raw: unknown, script: CourseScript): CourseSlide[] {
  const source =
    raw && typeof raw === 'object' && Array.isArray((raw as { slides?: unknown }).slides)
      ? ((raw as { slides: unknown[] }).slides ?? [])
      : Array.isArray(raw)
        ? raw
        : [];
  if (!source.length) throw new Error('模型没有返回课件页面');

  const sectionIds = new Set(script.sections.map((section) => section.id));
  const usedIds = new Set<string>();
  const slides: Array<Omit<CourseSlide, 'role'>> = source
    .slice(0, 16)
    .map((item, index) => {
      const slide = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      let id = text(slide.id, `slide-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '-');
      if (!id) id = `slide-${index + 1}`;
      while (usedIds.has(id)) id = `${id}-${index + 1}`;
      usedIds.add(id);
      const layout = layouts.includes(slide.layout as SlideLayout)
        ? (slide.layout as SlideLayout)
        : 'concept';
      const requestedSection = text(slide.sectionId);
      const fallbackSection =
        script.sections[Math.min(index, script.sections.length - 1)]?.id ?? script.sections[0].id;
      return {
        id,
        order: index + 1,
        title: text(slide.title, `第 ${index + 1} 页`).slice(0, 48),
        eyebrow: text(slide.eyebrow, `PART ${String(index + 1).padStart(2, '0')}`).slice(0, 40),
        layout,
        bullets: strings(slide.bullets, 4).map((bullet) => bullet.slice(0, 60)),
        note: text(slide.note, ''),
        accent: accents.includes(slide.accent as CourseSlide['accent'])
          ? (slide.accent as CourseSlide['accent'])
          : accents[index % accents.length],
        sectionId: sectionIds.has(requestedSection) ? requestedSection : fallbackSection,
        seconds: clamp(Math.round(number(slide.seconds, 60)), 2, 300)
      } satisfies Omit<CourseSlide, 'role'>;
    })
    .filter((slide) => slide.title && slide.bullets.length);

  if (!slides.length) throw new Error('模型返回的课件页面缺少有效标题或要点');

  if (!slides.some((slide) => slide.layout === 'cover')) {
    slides.unshift({
      id: 'slide-cover',
      order: 1,
      title: script.title,
      eyebrow: 'MICRO COURSE / 微课',
      layout: 'cover',
      bullets: [script.thesis],
      note: '开场命题',
      accent: 'brick',
      sectionId: script.sections[0].id,
      seconds: 4
    });
  }
  if (!slides.some((slide) => slide.layout === 'objectives')) {
    slides.splice(1, 0, {
      id: 'slide-objectives',
      order: 2,
      title: '这节课，我们带走四件事',
      eyebrow: 'LEARNING OBJECTIVES',
      layout: 'objectives',
      bullets: script.objectives.slice(0, 4),
      note: '学习目标',
      accent: 'teal',
      sectionId: script.sections[0].id,
      seconds: 7
    });
  }

  const covered = new Set(slides.map((slide) => slide.sectionId));
  script.sections.forEach((section, index) => {
    if (covered.has(section.id)) return;
    slides.push({
      id: `slide-${section.id}`,
      order: slides.length + 1,
      title: section.title,
      eyebrow: `PART ${String(index + 1).padStart(2, '0')} / ${String(script.sections.length).padStart(2, '0')}`,
      layout: 'concept',
      bullets: section.slideBrief
        .split(/[；。]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 3),
      note: section.purpose,
      accent: accents[index % accents.length],
      sectionId: section.id,
      seconds: section.durationSeconds
    });
  });

  const lastSectionId = script.sections.at(-1)?.id ?? script.sections[0].id;
  if (!slides.some((slide) => slide.layout === 'quote' || slide.layout === 'summary')) {
    slides.push({
      id: 'slide-summary',
      order: slides.length + 1,
      title: script.summary,
      eyebrow: 'TAKEAWAY',
      layout: 'quote',
      bullets: script.keywords.slice(0, 3),
      note: '收束',
      accent: 'ink',
      sectionId: lastSectionId,
      seconds: 4
    });
  }

  const ordered = slides
    .sort((a, b) => a.order - b.order)
    .map((slide, index) => ({
      ...slide,
      id: usedIds.has(slide.id) ? slide.id : `slide-${index + 1}`,
      order: index + 1,
      role:
        slide.layout === 'cover'
          ? ('cover' as SlideRole)
          : slide.layout === 'objectives'
            ? ('objectives' as SlideRole)
            : slide.layout === 'quote' || slide.layout === 'summary'
              ? ('summary' as SlideRole)
              : ('content' as SlideRole)
    }));
  // The deck and the script must stay in step: one page per section, in order.
  return reconcileSlides(ordered, script, { title: script.title });
}

export async function generateSlidesWithModel(
  script: CourseScript,
  settings: RuntimeSettings
): Promise<{ slides: CourseSlide[]; meta: GenerationMeta }> {
  const startedAt = Date.now();
  const response = await callModel(settings, {
    messages: buildSlideMessages(script),
    json: true,
    temperature: 0.6,
    maxTokens: 4200
  });
  const raw = parseJsonLoose(response.text);
  const slides = normalizeSlides(raw, script);
  return {
    slides,
    meta: {
      engine: 'model',
      provider: response.provider,
      model: response.model,
      durationMs: Date.now() - startedAt,
      warnings: []
    }
  };
}

export interface SkillRunOutput {
  summary: string;
  keyPoints: string[];
  cautions: string[];
  result: string;
}

export function buildSkillMessages(skill: AgentSkill, input: string, upstream?: string) {
  return [
    {
      role: 'system' as const,
      content:
        '你是微课生产平台中的专项 Skill。只输出 JSON，不要 Markdown，不要解释。' +
        '你要给出可执行、可进入下一生产环节的结果，避免空话。'
    },
    {
      role: 'user' as const,
      content: `Skill：${skill.name}
类别：${skill.category}
职责：${skill.description}
输入约定：${skill.inputHint}
输出约定：${skill.outputHint}

本次输入：
${input}

${upstream ? `上游 Skill 输出：\n${upstream}\n` : ''}
只输出 JSON：
{"summary":"一句话结论","keyPoints":["要点1","要点2","要点3"],"cautions":["需要人工复核的点"],"result":"可直接进入下一环节的结构化结果"}`
    }
  ];
}

export async function runSkillWithModel(
  skill: AgentSkill,
  input: string,
  settings: RuntimeSettings,
  upstream?: string
): Promise<{ output: SkillRunOutput; meta: GenerationMeta; rawText: string }> {
  const startedAt = Date.now();
  const response = await callModel(settings, {
    messages: buildSkillMessages(skill, input, upstream),
    json: true,
    temperature: 0.6,
    maxTokens: 1400
  });
  let parsed: Record<string, unknown>;
  try {
    parsed = parseJsonLoose<Record<string, unknown>>(response.text);
  } catch {
    parsed = { summary: response.text.slice(0, 200), result: response.text };
  }
  const output: SkillRunOutput = {
    summary: text(parsed.summary, `${skill.name} 已完成`),
    keyPoints: strings(parsed.keyPoints, 6),
    cautions: strings(parsed.cautions, 4),
    result: text(parsed.result, '').slice(0, 4000)
  };
  return {
    output,
    rawText: response.text,
    meta: {
      engine: 'model',
      provider: response.provider,
      model: response.model,
      durationMs: Date.now() - startedAt,
      warnings: []
    }
  };
}

export interface AgentStepResult {
  skillId: string;
  skillName: string;
  summary: string;
  durationMs: number;
  engine: 'model';
}

export async function runAgentPipeline(
  agent: AgentProfile,
  skills: AgentSkill[],
  input: string,
  settings: RuntimeSettings
): Promise<{ steps: AgentStepResult[]; output: string; meta: GenerationMeta }> {
  const startedAt = Date.now();
  const enabled = skills.filter((skill) => skill.enabled);
  if (!enabled.length) throw new Error('该智能体没有可用的 Skill');

  const steps: AgentStepResult[] = [];
  let upstream = '';
  let lastMeta: GenerationMeta | null = null;

  for (const skill of enabled) {
    const result = await runSkillWithModel(skill, input, settings, upstream);
    lastMeta = result.meta;
    upstream = result.output.result || result.output.summary;
    steps.push({
      skillId: skill.id,
      skillName: skill.name,
      summary: result.output.summary,
      durationMs: result.meta.durationMs,
      engine: 'model'
    });
  }

  return {
    steps,
    output: upstream || `${agent.name} 已完成 ${steps.length} 个 Skill 的串联执行。`,
    meta: {
      engine: 'model',
      provider: lastMeta?.provider ?? 'unknown',
      model: lastMeta?.model ?? settings.modelName,
      durationMs: Date.now() - startedAt,
      warnings: []
    }
  };
}
