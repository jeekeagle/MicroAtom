export type CourseMode = 'oral' | 'auto' | 'ppt';
export type StageKey = 'script' | 'slides' | 'audio' | 'render';
export type ProductionStage = 'analysis' | 'script' | 'slides' | 'audio' | 'render' | 'media';
export type EngineKind = 'analysis' | 'text' | 'structure' | 'image' | 'voice' | 'video' | 'media';
export type MediaKind =
  | 'knowledge-graph'
  | 'cognitive-map'
  | 'concept-card'
  | 'infographic'
  | 'timeline'
  | 'quiz'
  | 'flashcard'
  | 'checklist'
  | 'counterexample'
  | 'challenge';
export type MediaTriggerPlacement = 'below' | 'side' | 'focus';
export type ProjectStatus = 'draft' | 'producing' | 'review' | 'done';
export type JobStatus = 'idle' | 'queued' | 'running' | 'done' | 'error';
export type TtsEngine = 'edge' | 'sapi' | 'mimo' | 'none';
export type AsrEngine = 'browser' | 'mimo' | 'none';
export type ModelProtocol = 'chat' | 'responses';

/**
 * A reusable model connection. Any OpenAI-compatible service (or a Responses
 * API endpoint) can be saved as a profile with its own key and switched at will.
 */
export interface ModelProfile {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  modelName: string;
  protocol: ModelProtocol;
  temperature: number;
  maxTokens: number;
  apiKeyConfigured?: boolean;
}
export type GenerationEngine = 'model' | 'local-fallback' | 'media' | 'system';
export type AlignmentMethod = 'segment' | 'text' | 'estimated' | 'none';

export interface WorkflowStep {
  id: string;
  key: string;
  label: string;
  shortLabel: string;
  stage: StageKey;
  engineStage: ProductionStage;
  description: string;
  required: boolean;
  dependsOn?: string[];
}

export interface CourseWorkflow {
  id: string;
  name: string;
  mode: CourseMode;
  description: string;
  steps: WorkflowStep[];
  enabled: boolean;
  builtIn: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ValueDimension {
  label: string;
  content: string;
}

export type ScriptSectionRole = 'intro' | 'objectives' | 'body' | 'close';

export interface ScriptSection {
  id: string;
  order: number;
  role: ScriptSectionRole;
  title: string;
  purpose: string;
  narration: string;
  slideBrief: string;
  valueNote: string;
  durationSeconds: number;
}

export interface ScriptQuality {
  structure: number;
  oral: number;
  value: number;
  fit: number;
  note: string;
}

export type ScriptCommentScope = 'script' | 'section';

export interface ScriptComment {
  id: string;
  scope: ScriptCommentScope;
  sectionId?: string;
  quote?: string;
  note: string;
  status: 'open' | 'resolved';
  createdAt: string;
  updatedAt?: string;
}

export interface CourseScript {
  title: string;
  thesis: string;
  openingHook: string;
  objectives: string[];
  valueThread: ValueDimension[];
  sections: ScriptSection[];
  summary: string;
  keywords: string[];
  quality: ScriptQuality;
  version: number;
  confirmed: boolean;
  generatedAt: string;
  comments?: ScriptComment[];
}

export type EngineConfigValue = string | number | boolean;

export interface ProductionEngine {
  id: string;
  name: string;
  stage: ProductionStage;
  kind: EngineKind;
  description: string;
  agentId?: string;
  skillIds: string[];
  config: Record<string, EngineConfigValue>;
  enabled: boolean;
  isDefault: boolean;
  builtIn: boolean;
  runs: number;
  lastRun: string;
  createdAt: string;
  updatedAt: string;
}

export type SlideLayout =
  | 'cover'
  | 'objectives'
  | 'statement'
  | 'concept'
  | 'compare'
  | 'quote'
  | 'summary'
  | 'split'
  | 'steps'
  | 'case';

export type SlideVisualKind =
  | 'none'
  | 'diagram'
  | 'steps'
  | 'chart'
  | 'cycle'
  | 'timeline'
  | 'matrix'
  | 'image';

export type SlideTone = 'brick' | 'teal' | 'gold' | 'ink';

export interface SlideVisualNode {
  label: string;
  detail?: string;
  tone?: SlideTone;
}

export interface SlideVisualLink {
  from: number;
  to: number;
  label?: string;
}

export interface SlideVisualSeries {
  label: string;
  value: number;
  note?: string;
}

export interface SlideVisual {
  kind: SlideVisualKind;
  title?: string;
  caption?: string;
  nodes?: SlideVisualNode[];
  links?: SlideVisualLink[];
  series?: SlideVisualSeries[];
  steps?: Array<{ label: string; detail?: string }>;
  columns?: string[];
  rows?: Array<{ cells: string[]; highlight?: number }>;
  imageUrl?: string;
  imagePrompt?: string;
  source?: 'model' | 'template' | 'engine';
}

export type SlideRole = 'cover' | 'objectives' | 'content' | 'summary';

export interface CourseSlide {
  id: string;
  order: number;
  role: SlideRole;
  title: string;
  eyebrow: string;
  layout: SlideLayout;
  bullets: string[];
  keyPoint?: string;
  supporting?: string[];
  ask?: string;
  takeaway?: string;
  visual?: SlideVisual;
  html?: string;
  note: string;
  accent: 'brick' | 'teal' | 'gold' | 'ink';
  sectionId: string;
  seconds: number;
}

export interface RecordingAsset {
  id: string;
  kind: 'tts' | 'teacher' | 'upload';
  name: string;
  durationSeconds: number;
  status: JobStatus;
  alignment: number;
  createdAt: string;
  transcript?: string;
  audioUrl?: string;
  fileName?: string;
  sizeBytes?: number;
  fingerprint?: string;
  source?: 'edge' | 'sapi' | 'mimo' | 'browser' | 'file';
  alignmentMethod?: AlignmentMethod;
  alignmentConfidence?: number;
  transcriptSegments?: TranscriptSegment[];
  slideEvents?: SlideVisitEvent[];
  videoUrl?: string;
  videoFileName?: string;
  videoSizeBytes?: number;
  segments?: Array<{
    sectionId: string;
    startSeconds: number;
    endSeconds: number;
  }>;
}

export interface TranscriptSegment {
  text: string;
  startSeconds: number;
  endSeconds: number;
}

export interface SlideVisitEvent {
  slideId: string;
  slideOrder: number;
  atSeconds: number;
}

export interface TimelineShot {
  slideId: string;
  slideOrder: number;
  slideTitle: string;
  layout: SlideLayout;
  sectionId: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  audioRole: 'intro' | 'narration' | 'outro';
}

export interface CourseTimeline {
  shots: TimelineShot[];
  totalSeconds: number;
  audioDuration: number;
  leadInSeconds: number;
  leadOutSeconds: number;
  audioMode: 'tts' | 'teacher';
  method: 'measured' | 'estimated';
  warnings: string[];
  generatedAt: string;
}

export interface MediaArtifact {
  id: string;
  kind: MediaKind;
  title: string;
  description: string;
  html: string;
  status: 'draft' | 'ready';
  engineId?: string;
  skillId?: string;
  sectionId?: string;
  slideId?: string;
  triggerSeconds: number;
  placement: MediaTriggerPlacement;
  createdAt: string;
  updatedAt: string;
}

/**
 * A card pinned to a moment in the course. The composer aligns these to the
 * audio and transcript tracks, then bakes them into the HTML course.
 */
export interface CourseMount {
  id: string;
  artifactId?: string;
  mediaKind: MediaKind;
  title: string;
  description: string;
  html: string;
  concept?: string;
  atSeconds: number;
  endSeconds?: number;
  placement: MediaTriggerPlacement;
  source: 'agent' | 'manual' | 'artifact';
  createdAt: string;
  updatedAt: string;
}

export interface ConceptAnchor {
  concept: string;
  atSeconds: number;
  endSeconds: number;
  segmentIndex: number;
  note: string;
  kind: MediaKind;
}

export interface DeliveryCue {
  artifactId: string;
  kind: MediaKind;
  title: string;
  description: string;
  atSeconds: number;
  placement: MediaTriggerPlacement;
  file: string;
}

export interface DeliveryBundle {
  status: 'idle' | 'building' | 'ready' | 'error';
  builtAt?: string;
  indexPath?: string;
  indexUrl?: string;
  zipUrl?: string;
  artifactCount?: number;
  sizeBytes?: number;
  error?: string;
}

export interface RenderJob {
  status: JobStatus;
  progress: number;
  resolution: string;
  format: string;
  updatedAt: string;
  downloadReady: boolean;
  downloadUrl?: string;
  posterUrl?: string;
  durationSeconds?: number;
  sizeBytes?: number;
  error?: string;
  stageMessage?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface TraceStep {
  id: string;
  label: string;
  detail: string;
  status: 'done' | 'running' | 'queued';
  durationMs: number;
  engine?: GenerationEngine;
  warnings?: string[];
}

export interface CourseProject {
  id: string;
  workflowId: string;
  workflowStepId?: string;
  title: string;
  topic: string;
  subject: string;
  grade: string;
  durationMinutes: number;
  mode: CourseMode;
  status: ProjectStatus;
  stage: StageKey;
  progress: number;
  idea: string;
  valueGuide: string;
  learnerProfile: string;
  style: string;
  script?: CourseScript;
  slides: CourseSlide[];
  recordings: RecordingAsset[];
  render?: RenderJob;
  timeline?: CourseTimeline;
  artifacts: MediaArtifact[];
  mounts?: CourseMount[];
  delivery?: DeliveryBundle;
  selectedEngines?: Partial<Record<ProductionStage, string>>;
  generation?: ProjectGenerationMeta;
  trace: TraceStep[];
  createdAt: string;
  updatedAt: string;
  coverTone: 'brick' | 'teal' | 'gold' | 'ink';
}

export interface AgentSkill {
  id: string;
  name: string;
  category: string;
  description: string;
  enabled: boolean;
  version: string;
  model: string;
  latencyMs: number;
  runs: number;
  inputHint: string;
  outputHint: string;
  origin: 'built-in' | 'custom';
}

export interface AgentProfile {
  id: string;
  name: string;
  role: string;
  description: string;
  status: 'active' | 'paused';
  model: string;
  skillIds: string[];
  color: 'brick' | 'teal' | 'gold' | 'ink';
  runs: number;
  lastRun: string;
}

export type VideoFrameShape = 'rect' | 'rounded' | 'circle' | 'oval';
export type VideoFrameBorderStyle = 'none' | 'solid' | 'double' | 'dashed' | 'glow';

export interface VideoFrameScheme {
  id: string;
  name: string;
  shape: VideoFrameShape;
  borderStyle: VideoFrameBorderStyle;
  borderWidth: number;
  borderColor: string;
  scale: number;
  x: number;
  y: number;
  shadow: boolean;
}

export interface VideoFrameConfig {
  enabled: boolean;
  schemes: VideoFrameScheme[];
  activeSchemeId: string;
  defaultSchemeId: string;
}

export interface BrandConfig {
  visible: boolean;
  showMark: boolean;
  title: string;
  subtitle: string;
  logoDataUrl?: string;
}

export interface RuntimeSettings {
  reasoningModel: string;
  modelProfiles: ModelProfile[];
  activeModelId: string;
  visualModel: string;
  ttsModel: string;
  asrModel: string;
  apiBase: string;
  modelBaseUrl: string;
  modelName: string;
  modelProtocol: ModelProtocol;
  requestTimeoutMs: number;
  maxRetries: number;
  allowLocalFallback: boolean;
  apiKeyConfigured?: boolean;
  autoRetry: boolean;
  saveTrace: boolean;
  ttsEngine: TtsEngine;
  ttsVoice: string;
  ttsRate: number;
  asrEngine: AsrEngine;
  mimoStylePrompt: string;
  recordTeacherVideo: boolean;
  videoFrame: VideoFrameConfig;
  brand: BrandConfig;
}

export interface ActivityEvent {
  id: string;
  agent: string;
  action: string;
  target: string;
  time: string;
  status: 'done' | 'running' | 'queued';
}

export interface BootstrapData {
  projects: CourseProject[];
  agents: AgentProfile[];
  skills: AgentSkill[];
  engines: ProductionEngine[];
  workflows: CourseWorkflow[];
  memory: TeacherMemory;
  settings: RuntimeSettings;
  activity: ActivityEvent[];
  capabilities: Capabilities;
  stats: {
    activeProjects: number;
    confirmedScripts: number;
    renderedCourses: number;
    skillRuns: number;
    minutesSaved: number;
  };
}

export interface Capabilities {
  tts: boolean;
  ttsEngine: TtsEngine;
  ttsVoice: string;
  asrEngine: AsrEngine;
  mimoConfigured: boolean;
  ffmpeg: boolean;
  chrome: boolean;
  browserAsr: boolean;
  mediaRoot: string;
  modelConfigured: boolean;
}

export interface GenerationMeta {
  engine: 'model' | 'local-fallback';
  provider: string;
  model: string;
  durationMs: number;
  warnings: string[];
  error?: string;
}

export interface ProjectGenerationMeta {
  script?: GenerationMeta;
  slides?: GenerationMeta;
}

export interface CreateProjectInput {
  workflowId?: string;
  title: string;
  topic: string;
  subject: string;
  grade: string;
  durationMinutes: number;
  mode: CourseMode;
  idea: string;
  valueGuide: string;
  learnerProfile: string;
  style: string;
}

export interface TeacherMemory {
  id: string;
  name: string;
  school: string;
  subject: string;
  grade: string;
  yearsExperience: number;
  teachingStyle: string;
  experience: string;
  insights: string;
  updatedAt: string;
}

export interface AnalyzeBriefInput {
  transcript: string;
  current?: Partial<CreateProjectInput>;
  engineId?: string;
}

export interface AnalyzeBriefResult {
  draft: CreateProjectInput;
  transcript: string;
  warnings: string[];
  source: 'model' | 'local-fallback';
  engineId?: string;
  engineName?: string;
  fields?: string[];
}

export interface ScriptGenerationInput {
  topic: string;
  idea: string;
  valueGuide: string;
  learnerProfile: string;
  subject: string;
  grade: string;
  durationMinutes: number;
  style: string;
  mode?: CourseMode;
  engineId?: string;
}
