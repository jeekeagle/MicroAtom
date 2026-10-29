import type {
  ActivityEvent,
  AgentProfile,
  AgentSkill,
  CourseProject,
  RuntimeSettings,
  VideoFrameScheme,
  TeacherMemory
} from '../src/types';
import { generateScript, generateSlides } from './generate';

const leverInput = {
  topic: '杠杆原理',
  idea: '从搬石头的真实情境出发，让学生找到支点、画出力臂，再用开瓶器和人体动作验证。',
  valueGuide: '科学精神、证据意识与用结构解决问题的责任感',
  learnerProfile: '八年级学生，已经学过力的基本概念，但容易把力臂等同于杠杆长度。',
  subject: '物理',
  grade: '八年级',
  durationMinutes: 8,
  style: '口语化、问题驱动、少术语多情境'
};

const poetryInput = {
  topic: '《定风波》中的逆境选择',
  idea: '从“莫听穿林打叶声”的声音情境进入，分析苏轼如何把自然风雨转化为人生风雨。',
  valueGuide: '在不确定中保持清醒、从容与行动力',
  learnerProfile: '高二学生，具备诗词鉴赏基础，但对情感转折的分析容易停留在标签。',
  subject: '语文',
  grade: '高二',
  durationMinutes: 10,
  style: '文学鉴赏、朗读驱动、层层追问'
};

const cellInput = {
  topic: '细胞里的物流系统',
  idea: '把细胞膜、囊泡与高尔基体想象成一座有分拣中心的城市物流系统。',
  valueGuide: '理解生命系统的精密协作，养成系统思维',
  learnerProfile: '高一学生，正在学习细胞器结构与功能。',
  subject: '生物',
  grade: '高一',
  durationMinutes: 7,
  style: '类比清晰、节奏轻快、图示驱动'
};

const leverScript = generateScript(leverInput);
const poetryScript = generateScript(poetryInput);
const cellScript = generateScript(cellInput);
poetryScript.confirmed = true;
cellScript.confirmed = true;

export const seedProjects: CourseProject[] = [
  {
    id: 'p-lever',
    workflowId: 'workflow-auto-default',
    workflowStepId: 'auto-script',
    title: '撬动世界的支点：杠杆原理',
    topic: '杠杆原理',
    subject: '物理',
    grade: '八年级',
    durationMinutes: 8,
    mode: 'auto',
    status: 'producing',
    stage: 'script',
    progress: 36,
    idea: leverInput.idea,
    valueGuide: leverInput.valueGuide,
    learnerProfile: leverInput.learnerProfile,
    style: leverInput.style,
    script: leverScript,
    slides: [],
    recordings: [],
    artifacts: [],
    trace: [
      {
        id: 'trace-1',
        label: '备课意图分析',
        detail: '识别核心难点：力臂与杠杆长度的混淆',
        status: 'done',
        durationMs: 820
      },
      {
        id: 'trace-2',
        label: '讲稿结构规划',
        detail: '生成 5 段落、8 分钟的问题链',
        status: 'done',
        durationMs: 1680
      },
      {
        id: 'trace-3',
        label: '价值主线编织',
        detail: '求真 → 边界 → 行动',
        status: 'done',
        durationMs: 940
      }
    ],
    createdAt: '2026-10-26T09:20:00+08:00',
    updatedAt: '2026-10-28T09:42:00+08:00',
    coverTone: 'brick'
  },
  {
    id: 'p-poetry',
    workflowId: 'workflow-oral-default',
    workflowStepId: 'oral-align',
    title: '一蓑烟雨任平生：《定风波》细读',
    topic: '《定风波》中的逆境选择',
    subject: '语文',
    grade: '高二',
    durationMinutes: 10,
    mode: 'oral',
    status: 'producing',
    stage: 'audio',
    progress: 61,
    idea: poetryInput.idea,
    valueGuide: poetryInput.valueGuide,
    learnerProfile: poetryInput.learnerProfile,
    style: poetryInput.style,
    script: poetryScript,
    slides: generateSlides(poetryScript),
    recordings: [
      {
        id: 'rec-poetry-1',
        kind: 'teacher',
        name: '林老师_定风波_口述.m4a',
        durationSeconds: 412,
        status: 'done',
        alignment: 68,
        createdAt: '2026-10-27T20:16:00+08:00',
        transcript: '我们先把“穿林打叶声”听成一场突然到来的雨……'
      }
    ],
    artifacts: [],
    trace: [
      {
        id: 'trace-p1',
        label: '口语稿结构识别',
        detail: '切分为 14 个语义段落',
        status: 'done',
        durationMs: 1320
      },
      {
        id: 'trace-p2',
        label: '语音转写与讲稿定位',
        detail: '已对齐至第 3 页，置信度 94%',
        status: 'done',
        durationMs: 2860
      },
      {
        id: 'trace-p3',
        label: '课件节奏生成',
        detail: '根据语气停顿调整 3 处翻页点',
        status: 'running',
        durationMs: 1680
      }
    ],
    createdAt: '2026-10-24T15:10:00+08:00',
    updatedAt: '2026-10-27T20:18:00+08:00',
    coverTone: 'teal'
  },
  {
    id: 'p-cell',
    workflowId: 'workflow-ppt-default',
    workflowStepId: 'ppt-record',
    title: '细胞里的物流系统',
    topic: '细胞里的物流系统',
    subject: '生物',
    grade: '高一',
    durationMinutes: 7,
    mode: 'ppt',
    status: 'review',
    stage: 'audio',
    progress: 74,
    idea: cellInput.idea,
    valueGuide: cellInput.valueGuide,
    learnerProfile: cellInput.learnerProfile,
    style: cellInput.style,
    script: cellScript,
    slides: generateSlides(cellScript).map((slide) => ({
      ...slide,
      accent: slide.accent === 'brick' ? 'teal' : slide.accent
    })),
    recordings: [],
    artifacts: [],
    trace: [
      {
        id: 'trace-c1',
        label: '课件结构生成',
        detail: '7 页，物流中心视觉系统',
        status: 'done',
        durationMs: 2260
      },
      {
        id: 'trace-c2',
        label: '版式与可读性检查',
        detail: '修正 2 处小字号与超载文本',
        status: 'done',
        durationMs: 1180
      }
    ],
    createdAt: '2026-10-22T11:30:00+08:00',
    updatedAt: '2026-10-27T16:08:00+08:00',
    coverTone: 'gold'
  }
];

export const seedSkills: AgentSkill[] = [
  {
    id: 'brief-analyze',
    name: '备课意图分析',
    category: '讲稿',
    description: '从主题、草稿和价值引领中识别学习难点、认知起点与课程主线。',
    enabled: true,
    version: '1.4.2',
    model: '教学推理模型',
    latencyMs: 820,
    runs: 128,
    inputHint: '主题 / 草稿 / 学情',
    outputHint: '教学诊断 + 难点假设',
    origin: 'built-in'
  },
  {
    id: 'script-architect',
    name: '讲稿结构规划',
    category: '讲稿',
    description: '按目标时长生成问题链、段落节拍与口语化讲述路径。',
    enabled: true,
    version: '2.1.0',
    model: '教学推理模型',
    latencyMs: 1680,
    runs: 96,
    inputHint: '教学诊断 / 时长 / 风格',
    outputHint: '结构化口播讲稿',
    origin: 'built-in'
  },
  {
    id: 'value-thread',
    name: '价值主线编织',
    category: '讲稿',
    description: '把价值引领转成课程中的判断、选择与行动，而非额外口号。',
    enabled: true,
    version: '1.2.3',
    model: '教学推理模型',
    latencyMs: 940,
    runs: 81,
    inputHint: '价值关键词 / 案例',
    outputHint: '价值节点与回响句',
    origin: 'built-in'
  },
  {
    id: 'oral-polish',
    name: '口播感润色',
    category: '讲稿',
    description: '降低书面语密度，处理停顿、重音与长句，保留教师个人语气。',
    enabled: true,
    version: '1.7.1',
    model: '语言模型',
    latencyMs: 620,
    runs: 154,
    inputHint: '段落讲稿',
    outputHint: '可直接朗读版本',
    origin: 'built-in'
  },
  {
    id: 'slide-outline',
    name: '课件分镜规划',
    category: '课件',
    description: '依据讲稿语义与语速分配页面，保证每页只承担一个表达任务。',
    enabled: true,
    version: '2.0.4',
    model: '视觉推理模型',
    latencyMs: 1380,
    runs: 88,
    inputHint: '已确认讲稿',
    outputHint: '分镜与页面任务',
    origin: 'built-in'
  },
  {
    id: 'slide-layout',
    name: '版式生成',
    category: '课件',
    description: '根据内容类型选择封面、概念、对照、引语等课件版式。',
    enabled: true,
    version: '1.9.0',
    model: '视觉生成模型',
    latencyMs: 2460,
    runs: 73,
    inputHint: '分镜 / 品牌主题',
    outputHint: '可编辑 PPT 结构',
    origin: 'built-in'
  },
  {
    id: 'visual-audit',
    name: '课件可读性检查',
    category: '质检',
    description: '检查页面文本密度、字号、对比度与讲稿-视觉一致性。',
    enabled: true,
    version: '1.3.5',
    model: '视觉推理模型',
    latencyMs: 1120,
    runs: 66,
    inputHint: '课件页面',
    outputHint: '问题清单与修订建议',
    origin: 'built-in'
  },
  {
    id: 'tts-synthesize',
    name: '语音合成',
    category: '声音',
    description: '按段落、停顿与情绪标记生成课程旁白，支持音色与速度预设。',
    enabled: true,
    version: '3.0.1',
    model: 'TTS · 待接入',
    latencyMs: 4200,
    runs: 52,
    inputHint: '已确认讲稿 / 音色参数',
    outputHint: '分段音频 + 时间轴',
    origin: 'built-in'
  },
  {
    id: 'asr-align',
    name: '语音转写与讲稿定位',
    category: '声音',
    description: '识别教师口述内容，把语音段落对应到讲稿与课件页。',
    enabled: true,
    version: '1.8.2',
    model: 'ASR · 待接入',
    latencyMs: 3100,
    runs: 39,
    inputHint: '教师录音 / 讲稿',
    outputHint: '语义对齐时间轴',
    origin: 'built-in'
  },
  {
    id: 'caption-sync',
    name: '字幕同步',
    category: '声音',
    description: '按语义断句生成字幕，并在画面底部保持稳定阅读节奏。',
    enabled: true,
    version: '1.2.2',
    model: '语言模型',
    latencyMs: 760,
    runs: 48,
    inputHint: '音频时间轴 / 讲稿',
    outputHint: 'SRT 字幕',
    origin: 'built-in'
  },
  {
    id: 'timeline-compose',
    name: '时间轴编排',
    category: '成片',
    description: '将课件页、旁白、字幕和翻页点组织为可预览的课程时间轴。',
    enabled: true,
    version: '2.3.0',
    model: '编排引擎',
    latencyMs: 880,
    runs: 57,
    inputHint: '课件 / 音频 / 对齐数据',
    outputHint: '课程时间轴',
    origin: 'built-in'
  },
  {
    id: 'render-video',
    name: '成片渲染',
    category: '成片',
    description: '合成 1080p 课程视频，并生成封面、字幕与课程元数据。',
    enabled: true,
    version: '1.6.4',
    model: '渲染引擎',
    latencyMs: 6200,
    runs: 44,
    inputHint: '课程时间轴',
    outputHint: 'MP4 成片 + 导出包',
    origin: 'built-in'
  },
  {
    id: 'script-eval',
    name: '讲稿质量评审',
    category: '质检',
    description: '从结构、口语性、价值密度和学情匹配四个维度给出诊断。',
    enabled: true,
    version: '1.5.0',
    model: '评审模型',
    latencyMs: 1440,
    runs: 71,
    inputHint: '讲稿 / 课程目标',
    outputHint: '评分与修订建议',
    origin: 'built-in'
  }
];

export const seedAgents: AgentProfile[] = [
  {
    id: 'agent-design',
    name: '析课',
    role: '教学设计智能体',
    description: '把教师草稿转为有学习路径、有口语节拍、有价值回响的课程讲稿。',
    status: 'active',
    model: '教学推理模型',
    skillIds: ['brief-analyze', 'script-architect', 'value-thread', 'oral-polish', 'script-eval'],
    color: 'brick',
    runs: 186,
    lastRun: '3 分钟前'
  },
  {
    id: 'agent-slides',
    name: '构页',
    role: '课件设计智能体',
    description: '从讲稿中识别视觉任务，生成分镜、版式与可编辑课件结构。',
    status: 'active',
    model: '视觉推理模型',
    skillIds: ['slide-outline', 'slide-layout', 'visual-audit'],
    color: 'teal',
    runs: 104,
    lastRun: '18 分钟前'
  },
  {
    id: 'agent-voice',
    name: '声场',
    role: '声音导演智能体',
    description: '负责语音合成、教师录音转写、语义定位与字幕节奏。',
    status: 'active',
    model: '语音编排模型',
    skillIds: ['tts-synthesize', 'asr-align', 'caption-sync'],
    color: 'gold',
    runs: 82,
    lastRun: '昨天 20:16'
  },
  {
    id: 'agent-edit',
    name: '剪序',
    role: '成片编排智能体',
    description: '把课件、声音和字幕组合为课程时间轴，完成渲染与导出。',
    status: 'active',
    model: '编排引擎',
    skillIds: ['timeline-compose', 'render-video', 'caption-sync'],
    color: 'ink',
    runs: 67,
    lastRun: '昨天 17:40'
  },
  {
    id: 'agent-review',
    name: '校尺',
    role: '课程质量智能体',
    description: '独立检查讲稿、课件与音画对齐，在发布前暴露风险。',
    status: 'active',
    model: '评审模型',
    skillIds: ['script-eval', 'visual-audit', 'caption-sync'],
    color: 'teal',
    runs: 58,
    lastRun: '今天 09:36'
  }
];

const seedVideoFrameSchemes: VideoFrameScheme[] = [
  {
    id: 'frame-classic',
    name: '经典方框',
    shape: 'rect',
    borderStyle: 'solid',
    borderWidth: 4,
    borderColor: '#F2EEE3',
    scale: 0.26,
    x: 0.72,
    y: 0.7,
    shadow: true
  },
  {
    id: 'frame-rounded',
    name: '圆角画中画',
    shape: 'rounded',
    borderStyle: 'solid',
    borderWidth: 3,
    borderColor: '#F2EEE3',
    scale: 0.24,
    x: 0.735,
    y: 0.71,
    shadow: true
  }
];

export const seedSettings: RuntimeSettings = {
  reasoningModel: 'deepseek-v4.1-flash',
  visualModel: '本地分镜引擎',
  ttsModel: 'Edge 神经语音',
  asrModel: '浏览智听 / 未配置',
  apiBase: 'http://127.0.0.1:8787/api',
  modelBaseUrl: 'http://127.0.0.1:15721/v1',
  modelName: 'deepseek-v4.1-flash',
  modelProtocol: 'chat',
  requestTimeoutMs: 120000,
  maxRetries: 2,
  allowLocalFallback: true,
  autoRetry: true,
  saveTrace: true,
  ttsEngine: 'edge',
  ttsVoice: 'zh-CN-XiaoxiaoNeural',
  ttsRate: 0,
  recordTeacherVideo: false,
  videoFrame: {
    enabled: true,
    schemes: seedVideoFrameSchemes,
    activeSchemeId: 'frame-classic',
    defaultSchemeId: 'frame-classic'
  }
};

export const seedTeacherMemory: TeacherMemory = {
  id: 'teacher-memory-default',
  name: '林老师',
  school: '杭州市行知中学',
  subject: '物理',
  grade: '八年级',
  yearsExperience: 9,
  teachingStyle: '口语化、问题驱动，先给真实情境再收束概念',
  experience:
    '长期负责初中物理概念课与实验课，习惯用生活器材搭桥，再让学生用证据解释现象。',
  insights:
    '八年级学生最容易被术语吓住。先让他们预测，再制造认知冲突，最后用一个可迁移的小任务收尾，比直接讲定义有效。',
  updatedAt: '2026-10-28T09:00:00+08:00'
};

export const seedActivity: ActivityEvent[] = [
  {
    id: 'act-1',
    agent: '校尺',
    action: '完成讲稿评审',
    target: '《定风波》细读',
    time: '刚刚',
    status: 'done'
  },
  {
    id: 'act-2',
    agent: '析课',
    action: '正在规划价值主线',
    target: '杠杆原理',
    time: '2 分钟前',
    status: 'running'
  },
  {
    id: 'act-3',
    agent: '构页',
    action: '生成 7 页课件',
    target: '细胞里的物流系统',
    time: '18 分钟前',
    status: 'done'
  },
  {
    id: 'act-4',
    agent: '声场',
    action: '等待语音对齐',
    target: '《定风波》细读',
    time: '20 分钟前',
    status: 'queued'
  }
];
