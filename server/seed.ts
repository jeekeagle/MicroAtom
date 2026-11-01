import type {
  ModelProfile,  ActivityEvent,
  AgentProfile,
  AgentSkill,
  CourseProject,
  RuntimeSettings,
  VideoFrameScheme,
  TeacherMemory
} from '../src/types';
import { generateScript, generateSlides } from './generate';

const toolInput = {
  topic: '工具调用为什么会翻车',
  idea: '先让学生跑一个会失败的智能体：它把工具参数编错了，还一本正经地给出结论。再回头看日志，分清是模型、工具还是任务定义的问题。',
  valueGuide: '对自动化保持证据意识：敢用，也知道什么时候不该用',
  learnerProfile: '本科三年级学生，用过对话式大模型，但没写过工具调用，容易把模型说的话当成系统真实执行的结果。',
  subject: '人工智能（智能体方向）',
  grade: '本科·三年级',
  durationMinutes: 8,
  style: '案例先行、读日志、少术语多判断'
};

const reactInput = {
  topic: 'ReAct 循环：想—做—看',
  idea: '把一次完整的智能体任务拆成思考、调用、观察三步，用同一个任务对照“有循环”和“没循环”的结果差异。',
  valueGuide: '理解机制而不是崇拜能力，接受试错与校验的代价',
  learnerProfile: '本科三年级学生，知道 prompt 与函数调用的基本写法，但对“为什么要循环”缺少直觉。',
  subject: '人工智能（智能体方向）',
  grade: '本科·三年级',
  durationMinutes: 9,
  style: '结构图驱动、逐步追问'
};

const boundaryInput = {
  topic: '该不该交给智能体：一张判断表',
  idea: '给出五个真实任务，让学生判断哪些该交给智能体、哪些必须留给人，并把判断理由写成可复查的表格。',
  valueGuide: '在效率与责任之间作出清醒取舍',
  learnerProfile: '本科三年级学生，已经能搭出简单智能体，倾向把所有任务都自动化。',
  subject: '人工智能（智能体方向）',
  grade: '本科·三年级',
  durationMinutes: 7,
  style: '判断题驱动、对照表收束'
};

const toolScript = generateScript(toolInput);
const reactScript = generateScript(reactInput);
const boundaryScript = generateScript(boundaryInput);
reactScript.confirmed = true;
boundaryScript.confirmed = true;

export const seedProjects: CourseProject[] = [
  {
    id: 'p-toolcall',
    workflowId: 'workflow-auto-default',
    workflowStepId: 'auto-script',
    title: '工具调用为什么会翻车：智能体的三类失败',
    topic: '工具调用为什么会翻车',
    subject: '人工智能（智能体方向）',
    grade: '本科·三年级',
    durationMinutes: 8,
    mode: 'auto',
    status: 'producing',
    stage: 'script',
    progress: 36,
    idea: toolInput.idea,
    valueGuide: toolInput.valueGuide,
    learnerProfile: toolInput.learnerProfile,
    style: toolInput.style,
    script: toolScript,
    slides: [],
    recordings: [],
    artifacts: [],
    trace: [
      {
        id: 'trace-1',
        label: '备课意图分析',
        detail: '识别核心难点：把模型输出当成系统执行结果',
        status: 'done',
        durationMs: 820
      },
      {
        id: 'trace-2',
        label: '讲稿结构规划',
        detail: '生成失败案例 → 日志定位 → 三类归因的问题链',
        status: 'done',
        durationMs: 1680
      },
      {
        id: 'trace-3',
        label: '判断标准收束',
        detail: '留下一条可复查的归因顺序',
        status: 'done',
        durationMs: 940
      }
    ],
    createdAt: '2026-10-26T09:20:00+08:00',
    updatedAt: '2026-11-01T18:42:00+08:00',
    coverTone: 'brick'
  },
  {
    id: 'p-react',
    workflowId: 'workflow-ppt-default',
    workflowStepId: 'ppt-script',
    title: 'ReAct 循环：智能体怎样“想—做—看”',
    topic: 'ReAct 循环：想—做—看',
    subject: '人工智能（智能体方向）',
    grade: '本科·三年级',
    durationMinutes: 9,
    mode: 'ppt',
    status: 'producing',
    stage: 'audio',
    progress: 61,
    idea: reactInput.idea,
    valueGuide: reactInput.valueGuide,
    learnerProfile: reactInput.learnerProfile,
    style: reactInput.style,
    script: reactScript,
    slides: generateSlides(reactScript),
    recordings: [
      {
        id: 'rec-react-1',
        kind: 'teacher',
        name: '林老师_ReAct_课堂讲解.m4a',
        durationSeconds: 486,
        status: 'done',
        alignment: 71,
        createdAt: '2026-10-31T20:16:00+08:00',
        transcript: '先别急着看架构，我们把同一个任务跑两遍：一遍只让模型想，一遍让它想完就动手……'
      }
    ],
    artifacts: [],
    trace: [
      {
        id: 'trace-r1',
        label: '口语稿结构识别',
        detail: '切分为 11 个语义段落',
        status: 'done',
        durationMs: 1320
      },
      {
        id: 'trace-r2',
        label: '语音转写与讲稿定位',
        detail: '已对齐至第 4 页，置信度 92%',
        status: 'done',
        durationMs: 2860
      },
      {
        id: 'trace-r3',
        label: '机制图生成',
        detail: '按语气停顿调整 2 处翻页点',
        status: 'running',
        durationMs: 1680
      }
    ],
    createdAt: '2026-10-30T15:10:00+08:00',
    updatedAt: '2026-10-31T20:18:00+08:00',
    coverTone: 'teal'
  },
  {
    id: 'p-boundary',
    workflowId: 'workflow-oral-default',
    workflowStepId: 'oral-align',
    title: '该不该交给智能体：一张判断表',
    topic: '该不该交给智能体',
    subject: '人工智能（智能体方向）',
    grade: '本科·三年级',
    durationMinutes: 7,
    mode: 'oral',
    status: 'review',
    stage: 'audio',
    progress: 74,
    idea: boundaryInput.idea,
    valueGuide: boundaryInput.valueGuide,
    learnerProfile: boundaryInput.learnerProfile,
    style: boundaryInput.style,
    script: boundaryScript,
    slides: generateSlides(boundaryScript).map((slide) => ({
      ...slide,
      accent: slide.accent === 'brick' ? 'gold' : slide.accent
    })),
    recordings: [],
    artifacts: [],
    trace: [
      {
        id: 'trace-b1',
        label: '课件结构生成',
        detail: '7 页，判断表为主视觉',
        status: 'done',
        durationMs: 2260
      },
      {
        id: 'trace-b2',
        label: '版式与可读性检查',
        detail: '修正 2 处小字号与超载文本',
        status: 'done',
        durationMs: 1180
      }
    ],
    createdAt: '2026-10-22T11:30:00+08:00',
    updatedAt: '2026-10-31T16:08:00+08:00',
    coverTone: 'gold'
  }
];

export const seedSkills: AgentSkill[] = [
  {
    id: 'concept-scan',
    name: '概念时刻扫描',
    category: '智能体',
    description:
      '通读逐字稿，找出“学生必须停下来判断一次”的时刻：机制切换点、能力边界点、失败归因点，并给出精确时间。',
    enabled: true,
    version: '1.1.0',
    model: '教学推理模型',
    latencyMs: 1460,
    runs: 0,
    inputHint: '逐字稿 / 讲稿段落',
    outputHint: '判断时刻清单 + 时间点 + 建议卡片类型',
    origin: 'built-in'
  },
  {
    id: 'qa-author',
    name: '可判分问答编写',
    category: '智能体',
    description:
      '围绕判断时刻写随堂问答：题干用讲稿原话改写，干扰项取自真实误区，解析必须回到讲稿里那一句。',
    enabled: true,
    version: '1.1.0',
    model: '教学推理模型',
    latencyMs: 1520,
    runs: 0,
    inputHint: '判断时刻 / 讲稿段落',
    outputHint: '问答卡（题干 + 选项 + 答案 + 解析）',
    origin: 'built-in'
  },
  {
    id: 'card-compose',
    name: '介质卡片合成',
    category: '智能体',
    description:
      '按卡片类型组织内容：术语速记、边界自查清单、误区辨析、迁移挑战，一张卡只考一个判断。',
    enabled: true,
    version: '1.1.0',
    model: '教学推理模型',
    latencyMs: 1280,
    runs: 0,
    inputHint: '概念 / 讲稿 / 卡片类型',
    outputHint: '卡片结构化内容',
    origin: 'built-in'
  },
  {
    id: 'slide-whiteprint',
    name: '白底课件设计',
    category: '课件',
    description:
      '按白底课堂课件规范排版：顶部课程名、左上主标题、结论式标题与分层正文，保证后排可读。',
    enabled: true,
    version: '1.1.0',
    model: '视觉设计模型',
    latencyMs: 2100,
    runs: 0,
    inputHint: '已确认讲稿 / 页面任务',
    outputHint: '白底 HTML 课件页',
    origin: 'built-in'
  },
  {
    id: 'slide-interactive',
    name: '交互课件设计',
    category: '课件',
    description:
      '在白底课件规范上加入可交互层：点击揭示、分层要点、随堂判断，用于课堂现场对照学生答案。',
    enabled: true,
    version: '1.1.0',
    model: '视觉设计模型',
    latencyMs: 2380,
    runs: 0,
    inputHint: '已确认讲稿 / 页面任务',
    outputHint: '可交互 HTML 课件页',
    origin: 'built-in'
  },
  {
    id: 'brief-analyze',
    name: '备课意图分析',
    category: '讲稿',
    description:
      '从主题、草稿与学情中识别学生已有直觉、真实难点和这一讲要建立的判断，输出可执行的教学诊断。',
    enabled: true,
    version: '1.5.0',
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
    description:
      '按目标时长排判断链：失败案例 → 机制位置 → 适用条件 → 迁移检验，每段只承担一个教学任务。',
    enabled: true,
    version: '2.2.0',
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
    description:
      '把价值引领落成具体的取舍与责任判断（该不该用、出错谁承担），不做额外的口号段落。',
    enabled: true,
    version: '1.3.0',
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
    description:
      '压低书面语密度，处理停顿与重音；英文术语首次中英并读，之后统一中文，保留教师个人语气。',
    enabled: true,
    version: '1.8.0',
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
    description:
      '依据讲稿语义与语速分配页面与视觉任务，机制页给结构图，对比页给矩阵，保证一页一个判断。',
    enabled: true,
    version: '2.1.0',
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
    description:
      '按内容类型选择封面、概念、对照、流程、矩阵等版式，标题写成结论句，图形能独立解释页面。',
    enabled: true,
    version: '2.0.0',
    model: '视觉生成模型',
    latencyMs: 2460,
    runs: 73,
    inputHint: '分镜 / 品牌主题',
    outputHint: '可编辑课件结构',
    origin: 'built-in'
  },
  {
    id: 'visual-audit',
    name: '课件可读性检查',
    category: '质检',
    description:
      '检查文本密度、字号层级、图示自洽性与讲稿—页面一致性，逐条给出位置与修改建议。',
    enabled: true,
    version: '1.4.0',
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
    description:
      '按段落、停顿与重音标记生成旁白；机制段放慢，案例段加快，术语按口播规范读音。',
    enabled: true,
    version: '3.1.0',
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
    description:
      '识别教师口述内容，把语音段落对应到讲稿与课件页；不确定的专有名词标疑，不做猜测性改写。',
    enabled: true,
    version: '1.9.0',
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
    description:
      '按语义断句生成字幕，一句话不跨屏；英文缩写按首次出现给中文注释的规则处理。',
    enabled: true,
    version: '1.3.0',
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
    description:
      '把课件页、旁白、字幕与翻页点组织成时间轴；翻页落在语义边界，不按等长切分。',
    enabled: true,
    version: '2.4.0',
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
    description: '合成 1920×1080 课程视频，并生成封面、字幕与课程元数据；音画偏差超限先报警不出片。',
    enabled: true,
    version: '1.7.0',
    model: '渲染引擎',
    latencyMs: 6200,
    runs: 44,
    inputHint: '课程时间轴',
    outputHint: 'MP4 成片 + 导出包',
    origin: 'built-in'
  },
  {
    id: 'script-eval',
    name: '课程质量评审',
    category: '质检',
    description:
      '四把尺逐项过：概念是否准确、机制是否完整、边界是否讲清、迁移是否成立，每条意见必须可定位。',
    enabled: true,
    version: '1.6.0',
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
    description:
      '把教师草稿转成一条可推进的判断链：这一讲要让学生能作出什么判断，再由判断倒推讲稿骨架、案例与收尾检验。',
    status: 'active',
    model: '教学推理模型',
    skillIds: ['brief-analyze', 'script-architect', 'value-thread', 'oral-polish', 'script-eval'],
    color: 'brick',
    runs: 186,
    lastRun: '3 分钟前',
    expertise: ['智能体机制拆解', '判断链设计', '认知冲突编排', '边界与治理表达'],
    method:
      '先定“学生这节课结束能判断什么”，再倒推四步：失败案例 → 机制位置 → 适用条件 → 迁移检验。机制必须落到可观察的环节（输入—规划—工具调用—校验—回退），不写没有对应环节的空话。',
    constraints: [
      '一讲只推进一条主线，不把三个机制塞进 8 分钟',
      '禁用“赋能、颠覆、重塑”这类没有动作的词',
      '任何能力结论都要附使用条件与至少一个反例',
      '不编造产品指标、论文结论与未公开的功能'
    ]
  },
  {
    id: 'agent-slides',
    name: '构页',
    role: '课件设计智能体',
    description:
      '从讲稿中识别视觉任务，把抽象机制翻成结构图与对照矩阵，产出可编辑的授课放映课件。',
    status: 'active',
    model: '视觉推理模型',
    skillIds: ['slide-outline', 'slide-layout', 'visual-audit'],
    color: 'teal',
    runs: 104,
    lastRun: '18 分钟前',
    expertise: ['循环与时序结构图', '能力边界对照矩阵', '术语层级', '课堂可读性'],
    method:
      '能画成结构就不写成要点：循环画闭环、调用链画时序、能力对比画矩阵、失败路径画分支。一页只承担一个判断，标题写成结论句而不是名词短语。',
    constraints: [
      '不画装饰性插图，图必须能独立解释这一页的判断',
      '英文缩写首次出现要带中文注释，之后统一用中文',
      '单页要点不超过 3 条，每条不超过 26 字',
      '不把整段讲稿搬上屏幕'
    ]
  },
  {
    id: 'agent-voice',
    name: '声场',
    role: '声音导演智能体',
    description:
      '负责旁白合成、教师录音转写、语义定位与字幕节奏，按技术术语的读法规范统一口径。',
    status: 'active',
    model: '语音编排模型',
    skillIds: ['tts-synthesize', 'asr-align', 'caption-sync'],
    color: 'gold',
    runs: 82,
    lastRun: '昨天 20:16',
    expertise: ['术语口播规范', '缩写读法', '停顿与重音', '字幕断句'],
    method:
      '机制段放慢留白，案例段加快；英文术语首次中英并读、之后只用中文；字幕按语义断句，一句话不跨屏。',
    constraints: [
      '不把缩写念成字母串（ReAct 读作“React 循环”而不是 R-E-A-C-T）',
      '参数与代码不逐字符朗读，只读关键量级',
      '转写不确定的人名、产品名一律标疑，不猜'
    ]
  },
  {
    id: 'agent-edit',
    name: '剪序',
    role: '成片编排智能体',
    description:
      '把课件、声音与字幕组合成时间轴，确定翻页点与停顿位置，完成渲染与成片导出。',
    status: 'active',
    model: '编排引擎',
    skillIds: ['timeline-compose', 'render-video', 'caption-sync'],
    color: 'ink',
    runs: 67,
    lastRun: '昨天 17:40',
    expertise: ['翻页点判定', '节奏压缩', '音画同步', '导出参数'],
    method:
      '翻页点落在语义边界而不是等长切分；一个机制讲完才换页，失败案例可以连着走两页；渲染前核对音轨时长与课件页数是否匹配。',
    constraints: [
      '音频与课件的时长偏差超过 15% 时先报警，不出片',
      '不改动上游讲稿与课件的文字，只调整节奏与顺序',
      '导出固定 1920×1080，不擅自改变画幅'
    ]
  },
  {
    id: 'agent-insight',
    name: '洞察',
    role: '交互学习智能体',
    description:
      '在成片后定位值得停下来判断的概念时刻，编写可判分的随堂问答与误区辨析卡，挂载到学习工作台。',
    status: 'active',
    model: '教学推理模型',
    skillIds: ['concept-scan', 'qa-author', 'card-compose'],
    color: 'gold',
    runs: 0,
    lastRun: '尚未运行',
    expertise: ['概念时刻定位', '可判分问答', '误区辨析', '迁移任务设计'],
    method:
      '只考“会不会判断”，不考“记不记得”：每张卡都必须指向讲稿的一个精确时刻，错误选项取自真实误区而不是随机干扰，解析要回到讲稿里那句话。',
    constraints: [
      '不引入课程之外的新事实，题干用讲稿原话改写',
      '同一时刻不重复挂载两张同类型卡片',
      '卡片数量按讲稿密度给，宁少勿滥'
    ]
  },
  {
    id: 'agent-review',
    name: '校尺',
    role: '课程质量智能体',
    description:
      '在发布前独立过四把尺：概念是否准确、机制是否完整、边界是否讲清、迁移是否成立。不过尺就退回上一环节。',
    status: 'active',
    model: '评审模型',
    skillIds: ['script-eval', 'visual-audit', 'caption-sync'],
    color: 'teal',
    runs: 58,
    lastRun: '今天 09:36',
    expertise: ['概念准确性', '机制完整性', '边界清晰度', '迁移可检验性'],
    method:
      '四把尺逐项过：概念对不对（定义与所指是否一致）→ 机制全不全（缺哪个环节）→ 边界清不清（有没有给失效条件）→ 迁移成不成（换个场景还能不能用）。每条问题都要给出位置与修改建议。',
    constraints: [
      '不给“整体不错”这类空评价，每条意见必须可定位',
      '发现事实性错误要标出原句，不许泛泛提醒',
      '只评价，不直接改写上游内容'
    ]
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

export const seedModelProfiles: ModelProfile[] = [
  {
    id: 'model-default',
    name: '默认连接',
    provider: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:15721/v1',
    modelName: 'deepseek-v4.1-flash',
    protocol: 'chat',
    temperature: 0.6,
    maxTokens: 2200
  }
];

export const seedSettings: RuntimeSettings = {
  reasoningModel: 'deepseek-v4.1-flash',
  modelProfiles: seedModelProfiles,
  activeModelId: 'model-default',
  visualModel: '本地分镜引擎',
  ttsModel: 'Edge 神经语音',
  asrModel: 'MiMo 语音识别',
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
  asrEngine: 'browser',
  mimoStylePrompt: '温暖、清晰、语速适中的课堂讲解语气',
  recordTeacherVideo: false,
  videoFrame: {
    enabled: true,
    schemes: seedVideoFrameSchemes,
    activeSchemeId: 'frame-classic',
    defaultSchemeId: 'frame-classic'
  },
  brand: {
    visible: true,
    showMark: true,
    title: '课序',
    subtitle: 'COURSE SEQUENCE'
  }
};

export const seedTeacherMemory: TeacherMemory = {
  id: 'teacher-memory-default',
  name: '林老师',
  school: '智能计算学院',
  subject: '人工智能（智能体方向）',
  grade: '本科·三年级',
  yearsExperience: 8,
  teachingStyle:
    '先给一个会失败的真实任务，再拆机制；术语在用完之后才命名；每讲结尾留一条可检验的判断标准，学生能用它判断自己下次该不该把这事交给智能体。',
  experience:
    '长期讲授《智能体设计与应用》一类课程，按“机制—边界—评测—治理”组织每一讲：不先讲架构图，而是让学生先跑一个能跑通的智能体，再回头读它的日志，从日志里发现规划、工具调用与失败回退。验收用真实任务，不用名词解释。',
  insights:
    '学生最容易把“能对话”当成“能做事”，也容易把一次 demo 的成功当成可复现的能力。讲“智能体能做什么”之前，先让他们撞一次工具调用失败（参数幻觉、越权、超时无回退），再让他们判断这次失败该怪模型、怪工具、还是怪任务定义——这个判断练会了，后面的机制才听得进去。',
  methodology:
    '五阶主线，每讲至少走完三阶：① 判断阶——这件事该不该交给智能体，代价是什么；② 传递阶——人的意图怎样被拆成可执行的步骤与工具调用；③ 影响阶——谁被改变，出错时谁承担；④ 评测阶——用什么指标说明它真的做成了；⑤ 治理阶——权限、留痕、可回滚。主线服务于判断，不做名词巡礼。',
  casePool:
    'ReAct 循环的“想—做—看”；工具调用的三类失败（参数编造、越权访问、超时无回退）；上下文与记忆的分工（检索 vs 长期记忆 vs 会话上下文）；单体智能体与多智能体分工的真实成本；工作流自动化与自主智能体的边界；Agent 评测三件套（任务完成率、单位成本、可回滚性）。',
  boundaries:
    '智能体 ≠ 大模型 ≠ 工作流：前者强调目标—规划—执行—校验的闭环，只把 prompt 包一层就称智能体是最常见的错误。所有能力结论必须带适用条件，讲效果必须同时给失败案例。不预测 AGI 时间表，不引用未经核实的数据、论文与产品指标；英文缩写首次出现给中文解释。',
  assessment:
    '过程性为主：任务卡完成度、失败复盘日志（写清失败发生在哪一环）、边界判断选择题（给一个场景问该不该上智能体）。少考名词解释，多考“换一个场景还能不能判断”。',
  updatedAt: '2026-11-01T19:30:00+08:00'
};

export const seedActivity: ActivityEvent[] = [
  {
    id: 'act-1',
    agent: '校尺',
    action: '完成课程质量评审',
    target: 'ReAct 循环：想—做—看',
    time: '刚刚',
    status: 'done'
  },
  {
    id: 'act-2',
    agent: '析课',
    action: '正在排判断链',
    target: '工具调用为什么会翻车',
    time: '2 分钟前',
    status: 'running'
  },
  {
    id: 'act-3',
    agent: '构页',
    action: '生成 7 页课件',
    target: '该不该交给智能体',
    time: '18 分钟前',
    status: 'done'
  },
  {
    id: 'act-4',
    agent: '声场',
    action: '等待语音对齐',
    target: 'ReAct 循环：想—做—看',
    time: '20 分钟前',
    status: 'queued'
  }
];
