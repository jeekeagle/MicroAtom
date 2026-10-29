import type {
  CourseMode,
  CourseProject,
  CourseWorkflow,
  ProductionStage,
  StageKey,
  WorkflowStep
} from '../src/types';

const BUILT_AT = '2026-10-29T00:00:00.000Z';
const MODES: CourseMode[] = ['auto', 'oral', 'ppt'];
const STAGES: StageKey[] = ['script', 'slides', 'audio', 'render'];
const ENGINE_STAGES: ProductionStage[] = [
  'analysis',
  'script',
  'slides',
  'audio',
  'render',
  'media'
];

const step = (
  id: string,
  key: string,
  label: string,
  shortLabel: string,
  stage: StageKey,
  engineStage: ProductionStage,
  description: string,
  required = true,
  dependsOn: string[] = []
): WorkflowStep => ({
  id,
  key,
  label,
  shortLabel,
  stage,
  engineStage,
  description,
  required,
  dependsOn
});

const workflow = (
  id: string,
  name: string,
  mode: CourseMode,
  description: string,
  steps: WorkflowStep[]
): CourseWorkflow => ({
  id,
  name,
  mode,
  description,
  steps,
  enabled: true,
  builtIn: true,
  isDefault: true,
  createdAt: BUILT_AT,
  updatedAt: BUILT_AT
});

export const DEFAULT_WORKFLOWS: CourseWorkflow[] = [
  workflow('workflow-auto-default', '全自动标准流程', 'auto', '主题进入后连续完成讲稿、课件、旁白与成片，教师只在关键节点确认。', [
    step('auto-intent', 'intent', '备课意图', '意图', 'script', 'analysis', '读取主题、学情与价值引领，形成教学约束。', true),
    step('auto-script', 'script', '结构化讲稿', '讲稿', 'script', 'script', '生成段落节拍、视觉任务与口语断点。', true, ['intent']),
    step('auto-confirm', 'confirm', '讲稿确认', '确认', 'script', 'script', '教师确认结构、表达与价值主线后锁定讲稿。', true, ['script']),
    step('auto-slides', 'slides', '课件分镜', '课件', 'slides', 'slides', '把每个讲稿段落转成可编辑的视觉页面。', true, ['confirm']),
    step('auto-narration', 'narration', 'AI 旁白合成', '旁白', 'audio', 'audio', '按讲稿逐段合成旁白；成片渲染时也会自动补齐。', false, ['slides']),
    step('auto-render', 'render', '画面与音画渲染', '渲染', 'render', 'render', '统一时间轴并导出 1080p 微课成片。', true, ['slides']),
    step('auto-delivery', 'delivery', '介质与交付包', '交付', 'render', 'media', '打包视频、课程介质与可跳转的 HTML 学习页。', true, ['render'])
  ]),
  workflow('workflow-oral-default', '口语稿驱动流程', 'oral', '教师先按教学设想讲一遍，系统转写、定位语义段落，再生成对应课件与成片。', [
    step('oral-script', 'script', '讲述骨架规划', '骨架', 'script', 'script', '先形成讲述骨架与关键提问，不预设课件页面。', true),
    step('oral-confirm', 'confirm', '讲述骨架确认', '确认', 'script', 'script', '教师确认讲述顺序、重点与价值落点。', true, ['script']),
    step('oral-record', 'record', '教师口述录音', '口述', 'audio', 'audio', '教师按骨架完整讲述，系统保留声音与口述转写。', true, ['confirm']),
    step('oral-align', 'align', '语音转写与语义定位', '定位', 'audio', 'audio', '把口述内容切分并定位到讲稿段落，形成对齐依据。', false, ['record']),
    step('oral-slides', 'slides', '课件生成与对齐', '课件', 'slides', 'slides', '按教师实际讲述顺序与语义位置生成课件页面。', true, ['align']),
    step('oral-render', 'render', '成片渲染', '渲染', 'render', 'render', '用教师原声与对齐后的课件画面合成成片。', true, ['slides']),
    step('oral-delivery', 'delivery', '介质与交付包', '交付', 'render', 'media', '输出视频与配套课程介质。', true, ['render'])
  ]),
  workflow('workflow-ppt-default', 'PPT 驱动流程', 'ppt', '先确认讲稿并精修课件，教师再对照页面试讲录制，最后对齐音画成片。', [
    step('ppt-script', 'script', '备课意图与讲稿', '讲稿', 'script', 'script', '从主题与教学设想生成结构化讲稿。', true),
    step('ppt-confirm', 'confirm', '讲稿确认', '确认', 'script', 'script', '确认讲稿后进入课件生成。', true, ['script']),
    step('ppt-slides', 'slides', '课件生成与精修', '课件', 'slides', 'slides', '生成页面并在课件工坊逐页精修。', true, ['confirm']),
    step('ppt-record', 'record', '对照 PPT 试讲录制', '试讲', 'audio', 'audio', '全屏试讲台上方课件、下方讲稿，同步记录声音与翻页。', true, ['slides']),
    step('ppt-align', 'align', '音画时间轴对齐', '对齐', 'audio', 'audio', '用翻页事件与转写校准每页停留时间。', false, ['record']),
    step('ppt-render', 'render', '成片渲染', '渲染', 'render', 'render', '按试讲时间轴导出成片。', true, ['align']),
    step('ppt-delivery', 'delivery', '介质与交付包', '交付', 'render', 'media', '输出视频与配套课程介质。', true, ['render'])
  ])
];

const safeString = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value.trim() : fallback;

const safeMode = (value: unknown, fallback: CourseMode = 'auto'): CourseMode =>
  MODES.includes(value as CourseMode) ? (value as CourseMode) : fallback;

const safeStage = (value: unknown, fallback: StageKey = 'script'): StageKey =>
  STAGES.includes(value as StageKey) ? (value as StageKey) : fallback;

const safeEngineStage = (
  value: unknown,
  fallback: ProductionStage = 'script'
): ProductionStage =>
  ENGINE_STAGES.includes(value as ProductionStage)
    ? (value as ProductionStage)
    : fallback;

export const workflowStepId = () =>
  `step-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export function normalizeWorkflowSteps(input: unknown): WorkflowStep[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const normalizeStep = (raw: unknown, index: number): WorkflowStep | null => {
    if (!raw || typeof raw !== 'object') return null;
    const item = raw as Partial<WorkflowStep>;
    const label = safeString(item.label);
    if (!label) return null;
    let id = safeString(item.id);
    if (!id || seen.has(id)) id = workflowStepId();
    seen.add(id);
    return {
      id,
      key: safeString(item.key) || `step-${index + 1}`,
      label,
      shortLabel: safeString(item.shortLabel) || label.slice(0, 4),
      stage: safeStage(item.stage),
      engineStage: safeEngineStage(item.engineStage),
      description: safeString(item.description),
      required: item.required !== false,
      dependsOn: Array.isArray(item.dependsOn)
        ? item.dependsOn.filter((key): key is string => typeof key === 'string')
        : []
    };
  };
  return input
    .map((raw, index) => normalizeStep(raw, index))
    .filter((item): item is WorkflowStep => Boolean(item));
}

export function normalizeWorkflows(input: unknown): CourseWorkflow[] {
  const existing = Array.isArray(input) ? (input as CourseWorkflow[]) : [];
  const byId = new Map<string, CourseWorkflow>();

  for (const item of existing) {
    if (!item || typeof item !== 'object' || !safeString(item.id)) continue;
    const mode = safeMode(item.mode);
    const fallback = DEFAULT_WORKFLOWS.find((flow) => flow.mode === mode) ?? DEFAULT_WORKFLOWS[0];
    const steps = normalizeWorkflowSteps(item.steps);
    byId.set(item.id, {
      id: item.id,
      name: safeString(item.name) || fallback.name,
      mode,
      description: safeString(item.description),
      steps: steps.length ? steps : normalizeWorkflowSteps(fallback.steps),
      enabled: item.enabled !== false,
      builtIn: Boolean(item.builtIn),
      isDefault: Boolean(item.isDefault),
      createdAt: safeString(item.createdAt, BUILT_AT),
      updatedAt: safeString(item.updatedAt, BUILT_AT)
    });
  }

  for (const fallback of DEFAULT_WORKFLOWS) {
    if (!byId.has(fallback.id)) {
      byId.set(fallback.id, {
        ...fallback,
        steps: fallback.steps.map((item) => ({ ...item, dependsOn: [...(item.dependsOn ?? [])] }))
      });
    }
  }

  const workflows = [...byId.values()];
  for (const mode of MODES) {
    const candidates = workflows.filter((item) => item.mode === mode);
    const current = candidates.find((item) => item.isDefault && item.enabled);
    if (current) {
      for (const item of candidates) item.isDefault = item.id === current.id;
      continue;
    }
    const fallback =
      candidates.find((item) => item.builtIn) ?? candidates.find((item) => item.enabled) ?? candidates[0];
    if (fallback) {
      fallback.isDefault = true;
      fallback.enabled = true;
    }
  }
  return workflows;
}

export function defaultWorkflowForMode(
  workflows: CourseWorkflow[],
  mode: CourseMode
): CourseWorkflow | undefined {
  return (
    workflows.find((item) => item.mode === mode && item.enabled && item.isDefault) ??
    workflows.find((item) => item.mode === mode && item.enabled) ??
    workflows.find((item) => item.mode === mode)
  );
}

export function resolveWorkflow(
  workflows: CourseWorkflow[],
  project: Pick<CourseProject, 'workflowId' | 'mode'>
): CourseWorkflow | undefined {
  const selected = project.workflowId
    ? workflows.find((item) => item.id === project.workflowId && item.mode === project.mode)
    : undefined;
  return selected ?? defaultWorkflowForMode(workflows, project.mode);
}

export function workflowStepForStage(
  workflow: CourseWorkflow,
  stage: StageKey
): WorkflowStep | undefined {
  return workflow.steps.find((item) => item.stage === stage);
}

export function workflowStepById(
  workflow: CourseWorkflow,
  stepId?: string
): WorkflowStep | undefined {
  return stepId ? workflow.steps.find((item) => item.id === stepId) : undefined;
}

export function nextWorkflowStep(
  workflow: CourseWorkflow,
  stepId?: string
): WorkflowStep | undefined {
  const index = workflow.steps.findIndex((item) => item.id === stepId);
  if (index < 0) return workflow.steps[0];
  return workflow.steps[index + 1];
}

export function firstWorkflowStep(workflow: CourseWorkflow): WorkflowStep | undefined {
  return workflow.steps[0];
}

export function setWorkflowStep(
  project: CourseProject,
  workflow: CourseWorkflow,
  step?: WorkflowStep
) {
  if (!step) return;
  project.workflowId = workflow.id;
  project.workflowStepId = step.id;
  project.stage = step.stage;
}

export function moveToWorkflowKey(
  project: CourseProject,
  workflow: CourseWorkflow,
  key: string
): WorkflowStep | undefined {
  const target = workflow.steps.find((item) => item.key === key);
  if (target) setWorkflowStep(project, workflow, target);
  return target;
}

export function advanceWorkflow(
  project: CourseProject,
  workflow: CourseWorkflow
): WorkflowStep | undefined {
  const next = nextWorkflowStep(workflow, project.workflowStepId);
  if (next) setWorkflowStep(project, workflow, next);
  return next;
}

export function isWorkflowStepDone(step: WorkflowStep, project: CourseProject): boolean {
  switch (step.key) {
    case 'intent':
      return true;
    case 'script':
      return Boolean(project.script?.sections.length);
    case 'confirm':
      return Boolean(project.script?.confirmed);
    case 'slides':
    case 'slides-align':
      return project.slides.length > 0;
    case 'narration':
      return project.recordings.some((asset) => asset.kind === 'tts');
    case 'record':
      return project.recordings.some((asset) => asset.kind === 'teacher');
    case 'align':
      return project.recordings.some(
        (asset) =>
          asset.kind === 'teacher' &&
          (asset.alignment > 0 || (asset.transcriptSegments?.length ?? 0) > 0)
      );
    case 'render':
      return Boolean(project.render?.downloadReady);
    case 'delivery':
      return project.delivery?.status === 'ready';
    default:
      return step.stage === 'script'
        ? Boolean(project.script)
        : step.stage === 'slides'
          ? project.slides.length > 0
          : step.stage === 'audio'
            ? project.recordings.length > 0
            : Boolean(project.render?.downloadReady);
  }
}

export function workflowProgress(workflow: CourseWorkflow, project: CourseProject): number {
  if (!workflow.steps.length) return 0;
  const done = workflow.steps.filter((item) => isWorkflowStepDone(item, project)).length;
  return Math.round((done / workflow.steps.length) * 100);
}
