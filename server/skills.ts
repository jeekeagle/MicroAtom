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
  SlideTone,
  SlideVisual,
  SlideVisualKind,
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
  'summary',
  'split',
  'steps',
  'case'
];
const visualKinds: SlideVisualKind[] = [
  'diagram',
  'steps',
  'chart',
  'cycle',
  'timeline',
  'matrix',
  'image'
];
const visualTones: SlideTone[] = ['brick', 'teal', 'gold', 'ink'];
const accents: CourseSlide['accent'][] = ['brick', 'teal', 'gold', 'ink'];

export function buildSlideMessages(
  script: CourseScript,
  options: { visualKinds?: string[]; density?: string } = {}
) {
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

${options.visualKinds?.length ? `本套课件优先使用这些视觉类型：${options.visualKinds.join('、')}。` : ''}
${options.density === 'rich' ? '信息密度要求高：bullets 给 3 条，supporting 给 2 条，除封面与收束页外每页都必须有 visual。' : ''}
${options.density === 'clean' ? '信息密度要求低：bullets 最多 2 条，supporting 最多 1 条，页面保持简洁，visual 可选。' : ''}

要求：
1. 讲稿与页面必须一一对应，段落顺序就是页面顺序，不能多页也不能少页。
2. 第一页对应 role=intro 的段落，layout=cover，只放标题与一句核心主张。
3. 第二页对应 role=objectives 的段落，layout=objectives，最多 4 条学习目标。
4. 中间页对应 role=body 的段落，layout 取 statement / concept / compare / split / steps / case，sectionId 等于该段 id。
5. 最后一页对应 role=close 的段落，layout=summary，sectionId 等于该段 id。
6. layout 只能取：cover, objectives, statement, concept, compare, quote, summary, split, steps, case。
7. accent 只能取：brick, teal, gold, ink。
8. seconds 为正整数，与对应段落的口播时长相当；封面与目标页不要短于口播时长。
9. 文字分层，让课堂课件信息量足够：
   - title 用结论式短句（不超过 20 字），不要写成名词短语；
   - keyPoint 一句主结论（20-38 字）；
   - bullets 2-3 条关键要点，每条不超过 24 字；
   - supporting 0-2 条补充说明，每条不超过 30 字；
   - ask 一句课堂提问，可为空字符串；
   - takeaway 一句"一句话带走"，可为空字符串。
10. 视觉层：除封面与收束页外，每页都必须给出 visual，图文并茂是课堂课件的基本要求。
   - visual.kind 只能取：diagram, steps, chart, cycle, timeline, matrix, image；
   - diagram：nodes 2-5 个，每个 {label, detail, tone}，tone 取 brick/teal/gold/ink；links 用 {from,to,label} 描述关系，from 与 to 是 nodes 的下标；
   - steps：3-4 步，每步 {label, detail}；
   - chart：series 2-5 项，每项 {label, value, note}，value 必须是数字；
   - cycle：nodes 3-4 个，表示闭环环节；
   - timeline：nodes 2-5 个，按时间或流程先后排列；
   - matrix：columns 2-4 列，rows 2-4 行，每行 {cells, highlight}，cells 的数量与 columns 一致，highlight 是重点列的下标；
   - image：只写 imagePrompt 描述插图画面，不要编造图片链接。
11. 视觉必须服务于本段讲稿，不要为了好看而编造数据；note 写给教师或渲染器的提示。

只输出 JSON：{"slides":[{"id":"slide-intro","order":1,"title":"...","eyebrow":"MICRO COURSE / 微课","layout":"cover","keyPoint":"...","bullets":["..."],"supporting":["..."],"ask":"...","takeaway":"...","visual":{"kind":"diagram","title":"...","caption":"...","nodes":[{"label":"...","detail":"...","tone":"brick"}],"links":[{"from":0,"to":1,"label":"..."}]},"note":"...","accent":"brick","sectionId":"intro","seconds":20}]}`
    }
  ];
}

﻿const normalizeVisual = (raw: unknown): SlideVisual | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const source = raw as Record<string, unknown>;
  const kind = visualKinds.includes(source.kind as SlideVisualKind)
    ? (source.kind as SlideVisualKind)
    : undefined;
  if (!kind) return undefined;
  const visual: SlideVisual = { kind, source: 'model' };
  const title = text(source.title).slice(0, 40);
  if (title) visual.title = title;
  const caption = text(source.caption).slice(0, 60);
  if (caption) visual.caption = caption;

  if (kind === 'diagram' || kind === 'cycle' || kind === 'timeline') {
    const nodes = Array.isArray(source.nodes)
      ? source.nodes
          .slice(0, 6)
          .map((item) => {
            const node = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
            const tone = visualTones.includes(node.tone as SlideTone)
              ? (node.tone as SlideTone)
              : undefined;
            return {
              label: text(node.label).slice(0, 18),
              detail: text(node.detail).slice(0, 34),
              ...(tone ? { tone } : {})
            };
          })
          .filter((node) => node.label)
      : [];
    if (nodes.length >= 2) visual.nodes = nodes;
  }

  if (kind === 'diagram' && Array.isArray(source.links)) {
    const nodeCount = visual.nodes?.length ?? 0;
    const links = source.links
      .slice(0, 10)
      .map((item) => {
        const link = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
        const from = Math.round(Number(link.from));
        const to = Math.round(Number(link.to));
        if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
        if (from < 0 || to < 0 || from >= nodeCount || to >= nodeCount || from === to) return null;
        const label = text(link.label).slice(0, 12);
        return { from, to, ...(label ? { label } : {}) };
      })
      .filter((link): link is { from: number; to: number; label?: string } => Boolean(link));
    if (links.length) visual.links = links;
  }

  if (kind === 'steps' && Array.isArray(source.steps)) {
    const steps = source.steps
      .slice(0, 5)
      .map((item) => {
        const step = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
        return {
          label: text(step.label).slice(0, 20),
          detail: text(step.detail).slice(0, 32)
        };
      })
      .filter((step) => step.label);
    if (steps.length >= 2) visual.steps = steps;
  }

  if (kind === 'chart' && Array.isArray(source.series)) {
    const series = source.series
      .slice(0, 6)
      .map((item) => {
        const entry = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
        const value = Number(entry.value);
        return {
          label: text(entry.label).slice(0, 14),
          value: Number.isFinite(value) ? value : 0,
          note: text(entry.note).slice(0, 26)
        };
      })
      .filter((entry) => entry.label);
    if (series.length >= 2) visual.series = series;
  }

  if (kind === 'matrix') {
    const columns = strings(source.columns, 4).map((column) => column.slice(0, 12));
    const rows = Array.isArray(source.rows)
      ? source.rows
          .slice(0, 5)
          .map((item) => {
            const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
            const cells = strings(row.cells, 4).map((cell) => cell.slice(0, 26));
            if (!cells.length) return null;
            const highlight = Math.round(Number(row.highlight));
            return {
              cells,
              ...(Number.isFinite(highlight) && highlight >= 0 && highlight < cells.length
                ? { highlight }
                : {})
            };
          })
          .filter((row): row is { cells: string[]; highlight?: number } => Boolean(row))
      : [];
    if (columns.length >= 2 && rows.length) {
      visual.columns = columns;
      visual.rows = rows;
    }
  }

  if (kind === 'image') {
    const prompt = text(source.imagePrompt).slice(0, 160);
    const url = text(source.imageUrl).slice(0, 400);
    if (prompt) visual.imagePrompt = prompt;
    if (url) visual.imageUrl = url;
    if (!prompt && !url) return undefined;
  }

  return visual;
};

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
      const normalized: Omit<CourseSlide, 'role'> = {
        id,
        order: index + 1,
        title: text(slide.title, `第 ${index + 1} 页`).slice(0, 48),
        eyebrow: text(slide.eyebrow, `PART ${String(index + 1).padStart(2, '0')}`).slice(0, 40),
        layout,
        bullets: strings(slide.bullets, 4).map((bullet) => bullet.slice(0, 60)),
        keyPoint: text(slide.keyPoint).slice(0, 60),
        supporting: strings(slide.supporting, 3).map((item) => item.slice(0, 40)),
        ask: text(slide.ask).slice(0, 60),
        takeaway: text(slide.takeaway).slice(0, 60),
        visual: normalizeVisual(slide.visual),
        note: text(slide.note, ''),
        accent: accents.includes(slide.accent as CourseSlide['accent'])
          ? (slide.accent as CourseSlide['accent'])
          : accents[index % accents.length],
        sectionId: sectionIds.has(requestedSection) ? requestedSection : fallbackSection,
        seconds: clamp(Math.round(number(slide.seconds, 60)), 2, 300)
      };
      if (!normalized.keyPoint) delete normalized.keyPoint;
      if (!normalized.supporting?.length) delete normalized.supporting;
      if (!normalized.ask) delete normalized.ask;
      if (!normalized.takeaway) delete normalized.takeaway;
      if (!normalized.visual) delete normalized.visual;
      return normalized;
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
  settings: RuntimeSettings,
  options: { visualKinds?: string[]; density?: string } = {}
): Promise<{ slides: CourseSlide[]; meta: GenerationMeta }> {
  const startedAt = Date.now();
  const response = await callModel(settings, {
    messages: buildSlideMessages(script, options),
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

const WHITE_SLIDE_RULES = `画布与排版规范（必须严格遵守）：
1. 画布 1920×1080，纯白背景 #ffffff，不使用深色背景、渐变、投影或装饰插画。
2. 顶部一行：左侧写课程名（22-24px，深灰 #16202b），右侧写「学段 · 学科」（22-24px，浅灰 #939ea8）。
3. 标题写在左上角：56-68px，结论句而不是名词短语；下方紧跟一句副标题或主结论（30-34px，灰色 #64707c）。
4. 正文要点 30-36px、行高 1.6，最多 4 条；补充说明 26-28px 浅灰；页面留白充足，模块间距不小于 56px。
5. 需要图示时用简洁的内联 SVG：线条 2-4px，节点用浅色填充 + 一条彩色竖条，不要渐变与阴影。
6. 页脚：左侧页码（两位数）+ 一条细线 + 段落名。
7. 每页只讲一件事；文字不得溢出画布，不得出现半截内容。
8. 输出必须是完整、自包含的 HTML 文档：<!doctype html> 开头，含 <meta charset="utf-8"> 与内联 <style>，不要引用外部资源。
9. 尺寸必须自适应：画布用 width:100%;height:100%，所有字号与间距用 vw 表示（1920px 视口下 1vw = 19.2px，例如 64px 的标题写成 3.33vw，正文 34px 写成 1.77vw），这样在缩略预览与 1080p 放映中都能等比呈现、不溢出。`;

const buildHtmlSlideMessages = (
  script: CourseScript,
  options: { interactive?: boolean }
) => {
  const sectionText = script.sections
    .map(
      (section) =>
        `- ${section.id} | ${section.title} | 目的：${section.purpose} | 视觉任务：${section.slideBrief} | 口播：${section.narration.slice(0, 200)}`
    )
    .join('\n');
  const interactive = options.interactive;
  return [
    {
      role: 'system' as const,
      content:
        '你是一位擅长白底课堂课件的设计者，把讲稿转成可以直接放映的 HTML 课件页。' +
        '只输出 JSON，不要 Markdown，不要解释。'
    },
    {
      role: 'user' as const,
      content: `课程：${script.title}
主张：${script.thesis}
学习目标：${script.objectives.join('；')}

讲稿段落：
${sectionText}

${WHITE_SLIDE_RULES}
${
  interactive
    ? `交互要求：在白底规范之上加入可交互层——要点用 <details> 分层展开，页面上留一个「课堂提问」区块，必要时给出可点击揭示的答案。但首屏必须完整呈现核心信息，不能依赖点击才能看懂。
`
    : '保持静态排版，不要使用交互元素。'
}
讲稿与页面必须一一对应，段落顺序就是页面顺序。sectionId 必须等于对应段落的 id。

只输出 JSON：{"slides":[{"id":"slide-1","order":1,"sectionId":"intro","title":"页面标题","html":"<!doctype html><html>...</html>"}]}`
    }
  ];
};

const normalizeHtmlSlides = (
  raw: unknown,
  script: CourseScript
): CourseSlide[] => {
  const source =
    raw && typeof raw === 'object' && Array.isArray((raw as { slides?: unknown }).slides)
      ? ((raw as { slides: unknown[] }).slides ?? [])
      : Array.isArray(raw)
        ? raw
        : [];
  const sectionIds = new Set(script.sections.map((section) => section.id));
  const slides: CourseSlide[] = [];
  source.slice(0, 16).forEach((item, index) => {
    const entry = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const html = text(entry.html).trim();
    if (!html.includes('<html')) return;
    const requestedSection = text(entry.sectionId);
    slides.push({
      id: text(entry.id, `slide-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '-') || `slide-${index + 1}`,
      order: index + 1,
      role:
        index === 0
          ? 'cover'
          : index === script.sections.length - 1
            ? 'summary'
            : 'content',
      title: text(entry.title, script.sections[index]?.title ?? `第 ${index + 1} 页`).slice(0, 48),
      eyebrow:
        index === 0
          ? 'MICRO COURSE / 微课'
          : `PART ${String(index + 1).padStart(2, '0')} / ${String(script.sections.length).padStart(2, '0')}`,
      layout: index === 0 ? 'cover' : index === script.sections.length - 1 ? 'summary' : 'concept',
      bullets: script.sections[index]?.slideBrief
        .split(/[；。]/)
        .map((bullet) => bullet.trim())
        .filter(Boolean)
        .slice(0, 3) ?? [],
      keyPoint: script.sections[index]?.purpose,
      html,
      note: script.sections[index]?.purpose ?? '',
      accent: (['brick', 'teal', 'gold', 'ink'] as const)[index % 4],
      sectionId: sectionIds.has(requestedSection)
        ? requestedSection
        : script.sections[index]?.id ?? script.sections[0].id,
      seconds: Math.max(3, Math.round(script.sections[index]?.durationSeconds ?? 30))
    });
  });
  return slides;
};

/**
 * Generates classroom courseware pages as self-contained HTML. This is the
 * white-background courseware path, not a quick export.
 */
export async function generateHtmlSlidesWithModel(
  script: CourseScript,
  settings: RuntimeSettings,
  options: { interactive?: boolean } = {}
): Promise<{ slides: CourseSlide[]; meta: GenerationMeta }> {
  const startedAt = Date.now();
  const response = await callModel(settings, {
    messages: buildHtmlSlideMessages(script, options),
    json: true,
    temperature: 0.45,
    maxTokens: 8000
  });
  const slides = normalizeHtmlSlides(parseJsonLoose(response.text), script);
  if (!slides.length) throw new Error('模型没有返回可用的 HTML 课件页');
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
