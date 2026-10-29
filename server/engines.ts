import type {
  EngineKind,
  MediaKind,
  ProductionEngine,
  ProductionStage
} from '../src/types';

const BUILT_AT = '2026-10-29T00:00:00.000Z';

const engine = (
  id: string,
  name: string,
  stage: ProductionStage,
  kind: EngineKind,
  description: string,
  agentId: string,
  skillIds: string[],
  config: Record<string, string | number | boolean> = {},
  isDefault = false
): ProductionEngine => ({
  id,
  name,
  stage,
  kind,
  description,
  agentId,
  skillIds,
  config,
  enabled: true,
  isDefault,
  builtIn: true,
  runs: 0,
  lastRun: '尚未运行',
  createdAt: BUILT_AT,
  updatedAt: BUILT_AT
});

export const DEFAULT_ENGINES: ProductionEngine[] = [
  engine(
    'engine-analysis-default',
    '备课意图分析引擎',
    'analysis',
    'analysis',
    '读取主题、学情与价值引领，提炼难点、认知冲突和教学主线。',
    'agent-design',
    ['brief-analyze', 'value-thread', 'script-eval'],
    { depth: 'standard' },
    true
  ),
  engine(
    'engine-script-default',
    '讲稿结构引擎',
    'script',
    'text',
    '当前默认讲稿链路：模型结构规划、价值主线编织与口语化润色。',
    'agent-design',
    ['script-architect', 'value-thread', 'oral-polish', 'script-eval'],
    { fallback: true, version: 'current' },
    true
  ),
  engine(
    'engine-slides-default',
    '讲稿分镜引擎',
    'slides',
    'structure',
    '当前默认课件链路，从已确认讲稿生成封面、概念页、对照页与收束页。',
    'agent-slides',
    ['slide-outline', 'slide-layout', 'visual-audit'],
    {
      mode: 'model-first',
      layoutBias: 'balanced',
      visualDensity: 'rich',
      visualKinds: 'diagram,steps,chart,timeline,matrix'
    },
    true
  ),
  engine(
    'engine-slides-white',
    '白底课件引擎',
    'slides',
    'structure',
    '按白底课堂课件规范生成 1920×1080 HTML 课件页：顶部课程名、左上结论式标题、正文不小于 30px。',
    'agent-slides',
    ['slide-outline', 'slide-whiteprint', 'visual-audit'],
    { mode: 'html-white', layoutBias: 'white', visualDensity: 'rich', whiteCanvas: true }
  ),
  engine(
    'engine-slides-html',
    'HTML 课件引擎',
    'slides',
    'structure',
    '在白底课件规范上叠加可交互层：分层要点、课堂提问与点击揭示，适合讲台演示与课后自学。',
    'agent-slides',
    ['slide-outline', 'slide-interactive', 'visual-audit'],
    { mode: 'html-interactive', layoutBias: 'html', visualDensity: 'rich', whiteCanvas: true }
  ),
  engine(
    'engine-slides-visual',
    '图示课件引擎',
    'slides',
    'structure',
    '每页都配结构图、流程图或数据图表，信息密度高，适合概念讲解与方法拆解。',
    'agent-slides',
    ['slide-outline', 'slide-layout', 'visual-audit'],
    {
      mode: 'model-first',
      layoutBias: 'visual',
      visualDensity: 'rich',
      visualKinds: 'diagram,steps,cycle,timeline,chart,matrix'
    }
  ),
  engine(
    'engine-slides-text',
    '文字课件引擎',
    'slides',
    'text',
    '强化标题、要点与讲述提示，适合以文字信息为主的课程。',
    'agent-slides',
    ['slide-outline', 'slide-layout'],
    { mode: 'model-first', layoutBias: 'text', maxBullets: 3, visualDensity: 'clean' }
  ),
  engine(
    'engine-slides-structure',
    '结构课件引擎',
    'slides',
    'structure',
    '用对照、层级和结构图组织知识关系，适合概念辨析与方法拆解。',
    'agent-slides',
    ['slide-outline', 'slide-layout', 'visual-audit'],
    {
      mode: 'model-first',
      layoutBias: 'structure',
      maxBullets: 4,
      visualDensity: 'rich',
      visualKinds: 'diagram,matrix,cycle'
    }
  ),
  engine(
    'engine-slides-image',
    '文生图课件引擎',
    'slides',
    'image',
    '将每页视觉任务整理为可生成的画面提示词；未配置视觉模型时使用视觉提示词模式。',
    'agent-slides',
    ['slide-outline', 'slide-layout', 'visual-audit'],
    {
      mode: 'visual-brief',
      imageGeneration: false,
      layoutBias: 'visual',
      visualDensity: 'rich',
      visualKinds: 'image,diagram'
    }
  ),
  engine(
    'engine-audio-default',
    '神经旁白引擎',
    'audio',
    'voice',
    '按讲稿段落合成可对齐的 AI 旁白，并生成逐段语音时间。',
    'agent-voice',
    ['tts-synthesize', 'caption-sync'],
    { provider: 'edge', voice: 'zh-CN-XiaoxiaoNeural', rate: 0 },
    true
  ),
  engine(
    'engine-audio-trial',
    '教师试讲对齐引擎',
    'audio',
    'voice',
    '记录教师试讲、翻页事件与口述转写，建立教师声音的段落定位。',
    'agent-voice',
    ['asr-align', 'caption-sync'],
    { source: 'teacher', alignment: 'slide-events' }
  ),
  engine(
    'engine-render-default',
    '标准成片引擎',
    'render',
    'video',
    '当前默认成片链路：1080p 课件截图、旁白时间轴、H.264/AAC 编码。',
    'agent-edit',
    ['timeline-compose', 'render-video', 'caption-sync'],
    { resolution: '1920x1080', fps: 25, format: 'mp4' },
    true
  ),
  engine(
    'engine-media-default',
    '课程介质编排引擎',
    'media',
    'media',
    '读取课程结构与关键概念，按视频时间点编排课程介质。',
    'agent-design',
    ['script-eval'],
    { container: 'html', delivery: 'html-package' },
    true
  ),
  engine(
    'engine-media-knowledge-graph',
    '知识图谱介质引擎',
    'media',
    'media',
    '把课程概念、关系与层级生成为可交互知识图谱。',
    'agent-design',
    ['script-architect'],
    { mediaKind: 'knowledge-graph', container: 'html' }
  ),
  engine(
    'engine-media-cognitive-map',
    '认知地图介质引擎',
    'media',
    'media',
    '把学习路径组织为从已知到未知的认知地图。',
    'agent-design',
    ['brief-analyze', 'script-architect'],
    { mediaKind: 'cognitive-map', container: 'html' }
  ),
  engine(
    'engine-media-concept-card',
    '概念卡介质引擎',
    'media',
    'media',
    '为关键概念生成定义、边界、例子与常见误区的卡片。',
    'agent-design',
    ['script-architect', 'script-eval'],
    { mediaKind: 'concept-card', container: 'html' }
  ),
  engine(
    'engine-media-infographic',
    '一图读懂介质引擎',
    'media',
    'media',
    '把整节课压缩成一张可扫读的信息图。',
    'agent-design',
    ['script-architect', 'value-thread'],
    { mediaKind: 'infographic', container: 'html' }
  ),
  engine(
    'engine-media-timeline',
    '课程时间线介质引擎',
    'media',
    'media',
    '把事件、步骤或论证推进组织成时间线。',
    'agent-design',
    ['script-architect'],
    { mediaKind: 'timeline', container: 'html' }
  ),
  engine(
    'engine-media-quiz',
    '问答题介质引擎',
    'media',
    'media',
    '围绕课程目标生成可展开答案的形成性问题。',
    'agent-review',
    ['script-eval'],
    { mediaKind: 'quiz', container: 'html' }
  )
];

const productionStages: ProductionStage[] = ['analysis', 'script', 'slides', 'audio', 'render'];

const safeString = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : fallback;

const safeConfig = (value: unknown): Record<string, string | number | boolean> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value as Record<string, unknown>).filter(([, item]) => {
          return ['string', 'number', 'boolean'].includes(typeof item);
        })
      ) as Record<string, string | number | boolean>
    : {};

export function normalizeEngines(input: unknown): ProductionEngine[] {
  const existing = Array.isArray(input) ? (input as ProductionEngine[]) : [];
  const byId = new Map<string, ProductionEngine>();

  for (const item of existing) {
    if (!item || typeof item !== 'object' || !safeString(item.id)) continue;
    byId.set(item.id, {
      id: item.id,
      name: safeString(item.name, '未命名引擎'),
      stage: ['analysis', 'script', 'slides', 'audio', 'render', 'media'].includes(item.stage)
        ? item.stage
        : 'script',
      kind: ['analysis', 'text', 'structure', 'image', 'voice', 'video', 'media'].includes(item.kind)
        ? item.kind
        : 'text',
      description: safeString(item.description),
      agentId: safeString(item.agentId) || undefined,
      skillIds: Array.isArray(item.skillIds) ? item.skillIds.filter((id) => typeof id === 'string') : [],
      config: safeConfig(item.config),
      enabled: item.enabled !== false,
      isDefault: Boolean(item.isDefault),
      builtIn: Boolean(item.builtIn),
      runs: Number.isFinite(Number(item.runs)) ? Number(item.runs) : 0,
      lastRun: safeString(item.lastRun, '尚未运行'),
      createdAt: safeString(item.createdAt, new Date().toISOString()),
      updatedAt: safeString(item.updatedAt, new Date().toISOString())
    });
  }

  for (const fallback of DEFAULT_ENGINES) {
    if (!byId.has(fallback.id)) byId.set(fallback.id, { ...fallback, config: { ...fallback.config } });
  }

  const engines = [...byId.values()];
  for (const stage of productionStages) {
    if (engines.some((item) => item.stage === stage && item.isDefault)) continue;
    const fallback = DEFAULT_ENGINES.find((item) => item.stage === stage && item.isDefault);
    const target = fallback ? engines.find((item) => item.id === fallback.id) : undefined;
    if (target) target.isDefault = true;
  }
  return engines;
}

export function defaultEngineForStage(
  engines: ProductionEngine[],
  stage: ProductionStage
): ProductionEngine | undefined {
  return (
    engines.find((item) => item.stage === stage && item.enabled && item.isDefault) ??
    engines.find((item) => item.stage === stage && item.enabled)
  );
}

export function resolveEngine(
  engines: ProductionEngine[],
  stage: ProductionStage,
  engineId?: string
): ProductionEngine | undefined {
  if (engineId) {
    const selected = engines.find((item) => item.id === engineId && item.stage === stage);
    if (selected) return selected;
  }
  return defaultEngineForStage(engines, stage);
}

export function mediaEngineForKind(
  engines: ProductionEngine[],
  kind: MediaKind
): ProductionEngine | undefined {
  return (
    engines.find(
      (item) => item.stage === 'media' && item.enabled && item.config.mediaKind === kind
    ) ?? defaultEngineForStage(engines, 'media')
  );
}

export function setEngineDefault(engines: ProductionEngine[], engineId: string): boolean {
  const target = engines.find((item) => item.id === engineId);
  if (!target) return false;
  for (const item of engines) {
    if (item.stage === target.stage) item.isDefault = item.id === target.id;
  }
  target.enabled = true;
  target.updatedAt = new Date().toISOString();
  return true;
}

export const engineStageLabel: Record<ProductionStage, string> = {
  analysis: '析课',
  script: '讲稿',
  slides: '课件',
  audio: '声音',
  render: '成片',
  media: '介质'
};
