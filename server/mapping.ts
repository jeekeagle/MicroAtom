import type {
  CourseProject,
  CourseScript,
  CourseSlide,
  ScriptSection,
  ScriptSectionRole,
  SlideLayout,
  SlideRole
} from '../src/types';

export const INTRO_SECTION_ID = 'intro';
export const OBJECTIVES_SECTION_ID = 'objectives';
export const CLOSE_SECTION_ID = 'close';

export const SECTION_ROLE_LABELS: Record<ScriptSectionRole, string> = {
  intro: '主题引入',
  objectives: '学习目标',
  body: '正文',
  close: '收束'
};

export const SLIDE_ROLE_LABELS: Record<SlideRole, string> = {
  cover: '封面',
  objectives: '学习目标',
  content: '内容',
  summary: '总结'
};

const INTRO_IDS = new Set(['intro', 'opening', 'topic', 'theme', 'lead']);
const OBJECTIVES_IDS = new Set(['objectives', 'objective', 'goals', 'aim', 'targets']);
const CLOSE_IDS = new Set(['close', 'closing', 'summary', 'ending', 'wrap', 'takeaway']);

const roleOf = (section: ScriptSection): ScriptSectionRole => {
  const declared = section.role as ScriptSectionRole | undefined;
  if (declared === 'intro' || declared === 'objectives' || declared === 'body' || declared === 'close') {
    return declared;
  }
  const id = (section.id || '').toLowerCase();
  if (INTRO_IDS.has(id) || /主题|引入|开场|点题|今天讲/.test(section.title || '')) return 'intro';
  if (OBJECTIVES_IDS.has(id) || /目标|学什么|带走/.test(section.title || '')) return 'objectives';
  if (CLOSE_IDS.has(id) || /收束|总结|结尾|回扣/.test(section.title || '')) return 'close';
  return 'body';
};

const clean = (value: string, fallback: string) => value.trim() || fallback;

export function buildIntroSection(script: CourseScript, topic: string): ScriptSection {
  const title = clean(script.title, clean(topic, '这节课'));
  const thesis = clean(script.thesis, '');
  return {
    id: INTRO_SECTION_ID,
    order: 1,
    role: 'intro',
    title: '这节课讲什么',
    purpose: '点明本课主题与要解决的问题，让听众知道这节课要到哪里去',
    narration: `今天这节课，我们一起看看「${title}」${thesis ? `。${thesis}` : ''}先别急着给答案，我们从一个具体的问题出发，一步一步把证据找出来。`,
    slideBrief: '封面只放课程标题与一句核心主张，不要堆要点',
    valueNote: '开场就把判断标准亮出来：先看证据，再下结论',
    durationSeconds: 20
  };
}

const countWords = ['', '一', '二', '三', '四', '五'];

export function buildObjectivesSection(script: CourseScript): ScriptSection {
  const items = script.objectives.slice(0, 4).filter(Boolean);
  const spoken = items.length
    ? items.map((item, index) => `${index + 1}）${item}`).join('；')
    : '说清楚一个现象背后的机制，并且能用证据解释它';
  const count = countWords[items.length] ?? String(items.length);
  return {
    id: OBJECTIVES_SECTION_ID,
    order: 2,
    role: 'objectives',
    title: '学完这节课，你要能',
    purpose: '把学习目标说清楚，让学生知道这节课要带走什么',
    narration: `这节课结束之前，你要能带走${count}件事：${spoken}。学完之后，你能自己判断，也能把判断讲给别人听。`,
    slideBrief: '目标页最多四条，每条不超过 14 个汉字',
    valueNote: '目标要可检验，不要用“了解”“理解”这类无法验收的词',
    durationSeconds: 22
  };
}

export function buildCloseSection(script: CourseScript): ScriptSection {
  const summary = clean(script.summary, clean(script.thesis, '回到今天提出的那个问题'));
  return {
    id: CLOSE_SECTION_ID,
    order: 99,
    role: 'close',
    title: '收束与回扣',
    purpose: '回到开场的问题，收拢方法与价值',
    narration: `回到开头那个问题：${summary}。今天用的方法请记住：先提出可检验的猜想，再用证据说话，最后才下结论。`,
    slideBrief: '总结页只放关键词与一句结论，留白让人回看',
    valueNote: '结论要能落到具体判断或行动上，不能停在口号',
    durationSeconds: 20
  };
}

/**
 * 讲稿结构规整：开头必须有“主题引入”和“学习目标”，结尾必须有“收束”，
 * 中间是正文。这样课件的每一页都能对上讲稿的一段。
 */
export function reconcileScript(script: CourseScript, topic: string): CourseScript {
  const source = script.sections.map((section, index) => ({ ...section, order: index + 1 }));
  const intro = source.find((section) => roleOf(section) === 'intro');
  const objectives = source.find((section) => roleOf(section) === 'objectives');
  const close = source.find((section) => roleOf(section) === 'close');
  const body = source.filter(
    (section) => section !== intro && section !== objectives && section !== close
  );

  const ordered: ScriptSection[] = [
    intro ?? buildIntroSection(script, topic),
    objectives ?? buildObjectivesSection(script),
    ...body,
    close ?? buildCloseSection(script)
  ];

  // Auto-written paragraphs stay in sync with the course title and objectives;
  // anything the teacher rewrote by hand is left untouched.
  const refreshed = ordered.map((section, index) => {
    const narration = section.narration || '';
    if (section.role === 'intro' && narration.includes('今天这节课')) {
      return { ...section, narration: buildIntroSection(script, topic).narration };
    }
    if (section.role === 'objectives' && narration.includes('这节课结束之前')) {
      return { ...section, narration: buildObjectivesSection(script).narration };
    }
    if (section.role === 'close' && narration.includes('回到开头那个问题')) {
      return { ...section, narration: buildCloseSection(script).narration };
    }
    return section;
  });

  const sections = refreshed.map((section, index) => ({
    ...section,
    order: index + 1,
    role:
      index === 0
        ? ('intro' as ScriptSectionRole)
        : index === 1
          ? ('objectives' as ScriptSectionRole)
          : index === ordered.length - 1
            ? ('close' as ScriptSectionRole)
            : ('body' as ScriptSectionRole)
  }));

  return { ...script, sections };
}

const layoutForRole = (role: SlideRole, index: number, total: number): SlideLayout => {
  if (role === 'cover') return 'cover';
  if (role === 'objectives') return 'objectives';
  if (role === 'summary') return 'summary';
  if (index === 0) return 'statement';
  if (index === total - 1) return 'concept';
  return index % 2 === 0 ? 'compare' : 'concept';
};

const accents: CourseSlide['accent'][] = ['brick', 'teal', 'gold', 'ink'];

/**
 * 课件结构规整：封面 → 学习目标 → 正文页 → 总结页，
 * 每页绑定唯一一段讲稿，页面顺序与讲稿顺序严格一致。
 */
export function reconcileSlides(
  slides: CourseSlide[],
  script: CourseScript,
  options: { topic?: string; title?: string } = {}
): CourseSlide[] {
  const topic = options.topic ?? script.title;
  const title = options.title ?? script.title ?? topic;
  const cover = slides.find((slide) => slide.layout === 'cover');
  const objectiveSlide = slides.find((slide) => slide.layout === 'objectives');
  const summary = slides.find((slide) => slide.layout === 'quote' || slide.layout === 'summary');
  // Structural pages are matched by role, not by section, otherwise the cover
  // would steal the page of the first body section.
  const structuralIds = new Set(
    [cover?.id, objectiveSlide?.id, summary?.id].filter((id): id is string => Boolean(id))
  );
  const bySectionId = new Map<string, CourseSlide>();
  for (const slide of slides) {
    if (structuralIds.has(slide.id)) continue;
    if (!bySectionId.has(slide.sectionId)) bySectionId.set(slide.sectionId, slide);
  }

  const result: CourseSlide[] = [];
  let order = 0;

  for (const section of script.sections) {
    order += 1;
    const role: SlideRole =
      section.role === 'intro'
        ? 'cover'
        : section.role === 'objectives'
          ? 'objectives'
          : section.role === 'close'
            ? 'summary'
            : 'content';
    const source =
      bySectionId.get(section.id) ??
      (role === 'cover' ? cover : role === 'objectives' ? objectiveSlide : role === 'summary' ? summary : undefined);
    const bullets =
      source?.bullets?.length
        ? source.bullets
        : section.slideBrief
            .split(/[；。]/)
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 3);
    const layout =
      role === 'cover'
        ? 'cover'
        : role === 'objectives'
          ? 'objectives'
          : role === 'summary'
            ? 'summary'
            : (source?.layout ?? layoutForRole(role, order, script.sections.length));
    result.push({
      id: source?.id ?? `slide-${section.id}`,
      order,
      role,
      title: source?.title ?? section.title,
      eyebrow:
        role === 'cover'
          ? 'MICRO COURSE / 微课'
          : role === 'objectives'
            ? 'LEARNING OBJECTIVES'
            : role === 'summary'
              ? 'TAKEAWAY'
              : `PART ${String(section.order).padStart(2, '0')} / ${String(script.sections.length).padStart(2, '0')}`,
      layout,
      bullets,
      note: source?.note ?? section.purpose,
      accent:
        source?.accent ??
        accents[(script.sections.indexOf(section) + (role === 'cover' ? 0 : 1)) % accents.length],
      sectionId: section.id,
      seconds: Math.max(3, Math.round(section.durationSeconds || 10))
    });
  }

  return result;
}

/**
 * 同时规整讲稿与课件，保证两者的对应关系成立。
 */
export function reconcileProjectMapping(project: CourseProject): CourseProject {
  if (!project.script) return project;
  const script = reconcileScript(project.script, project.topic);
  const slides = project.slides.length
    ? reconcileSlides(project.slides, script, {
        topic: project.topic,
        title: project.title
      })
    : project.slides;
  return { ...project, script, slides };
}