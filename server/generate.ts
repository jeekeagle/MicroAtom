import type {
  CourseScript,
  CourseSlide,
  ScriptGenerationInput,
  ScriptSection,
  SlideLayout
} from '../src/types';
import { reconcileScript, reconcileSlides } from './mapping';

type DraftSection = Omit<ScriptSection, 'role'>;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const clean = (value: string, fallback: string) => value.trim() || fallback;

const isLeverTopic = (topic: string) => /杠杆|支点|力矩/.test(topic);

const leverSections = (input: ScriptGenerationInput): DraftSection[] => {
  const value = clean(input.valueGuide, '科学精神与责任意识');
  return [
    {
      id: 'lever-open',
      order: 1,
      title: '一根木棍，为什么能撬起巨石？',
      purpose: '用反常识现象建立问题意识，引出杠杆。',
      narration:
        '先看一个熟悉的画面：一个人面对一块搬不动的石头，他没有继续用力，而是找来一根长木棍，在下面垫一块小石头。轻轻一压，石头动了。这里真正起作用的，不是“木棍很神奇”，而是木棍、支点和力的位置共同组成了一套简单机械。今天，我们就沿着这根木棍，找到让力量被放大的条件。',
      slideBrief: '全屏情境图：长木棍撬动石块，只保留“支点在哪里”一个问题。',
      valueNote: `从“蛮力”转向“找规律”，回应${value}。`,
      durationSeconds: 62
    },
    {
      id: 'lever-investigate',
      order: 2,
      title: '先别急着下结论：把杠杆拆成三个位置',
      purpose: '建立杠杆五要素中的关键位置关系。',
      narration:
        '要研究杠杆，先别急着背定义。我们把画面拆开，只找三个位置：支点、动力作用点和阻力作用点。支点是杠杆绕着转动的固定点；动力是我们施加力的位置；阻力是重物压住杠杆的位置。把这三个点找准，杠杆就不再是一根模糊的木棍，而变成了一张可以分析的力学图。',
      slideBrief: '三段式动画依次点亮支点、动力点、阻力点，并出现对应力臂。',
      valueNote: '用可检验的观察替代直觉判断。',
      durationSeconds: 68
    },
    {
      id: 'lever-model',
      order: 3,
      title: '力臂不是棍子长度，而是“点到线的距离”',
      purpose: '澄清力臂概念，建立力矩模型。',
      narration:
        '很多同学会把力臂画成杠杆上一段现成的长度，其实不一定。力臂是支点到力的作用线的垂直距离。注意两个关键词：力的作用线、垂直距离。只要力的方向变了，力的作用线就变了，力臂也会跟着变。于是我们得到关系式：动力乘动力臂，等于阻力乘阻力臂。省力并不是凭空获得能量，而是用更长的动力臂换取更小的动力。',
      slideBrief: '左右对照：错误画法与正确垂线画法；底部出现 M = F × L。',
      valueNote: '区分直觉与证据，理解“省力”的边界。',
      durationSeconds: 80
    },
    {
      id: 'lever-transfer',
      order: 4,
      title: '从开瓶器到人体：杠杆藏在哪里',
      purpose: '迁移到生活器物与人体结构。',
      narration:
        '现在把模型带到生活里。开瓶器的支点在边缘，手在长柄末端施力；剪刀的支点在转轴，两个刀口分别承担动力和阻力；我们抬起脚跟时，脚掌前端近似支点，小腿肌肉提供动力。它们看起来完全不同，但都可以先找支点，再画力臂。模型的价值，不是让你记住更多图片，而是让你在新情境里迅速找到同一套关系。',
      slideBrief: '三物件横向排列，点击每个物件都以线框标注支点与两条力臂。',
      valueNote: '看见知识在真实世界中的作用。',
      durationSeconds: 75
    },
    {
      id: 'lever-close',
      order: 5,
      title: '给我们一个支点：知识如何改变行动',
      purpose: '回收价值主线并形成可迁移总结。',
      narration:
        '回到开头那块石头。真正改变结果的，不只是多了那根木棍，而是人开始寻找支点、估计距离、判断力该放在哪里。学习杠杆，也是在练习一种做事方式：遇到问题，先找结构，再找可以发力的位置。阿基米德说，给我一个支点，我就能撬动地球。今天我们知道，地球不会被真的撬动，但一个清晰的模型，确实能改变我们面对问题的方式。',
      slideBrief: '回到开场画面，叠加三个关键词：找支点、量距离、选发力点。',
      valueNote: `把${value}落到“用结构解决问题”的行动上。`,
      durationSeconds: 70
    }
  ];
};

const genericSections = (input: ScriptGenerationInput): DraftSection[] => {
  const topic = clean(input.topic, '这节微课');
  const idea = clean(input.idea, '从真实情境进入，再抽出核心概念，最后迁移到新的问题。');
  const value = clean(input.valueGuide, '求真、责任与行动');
  return [
    {
      id: 'open',
      order: 1,
      title: `从一个具体问题进入${topic}`,
      purpose: '用可感知的情境激活已有经验。',
      narration: `我们先不急着解释“${topic}”的定义。先看一个具体情境：${idea}。请留意，情境里真正让人困惑的地方是什么？把这个疑问留住，它会成为我们这节课的线索。`,
      slideBrief: '一个真实场景 + 一个核心疑问，避免提前给出结论。',
      valueNote: `从真实问题出发，埋下${value}的讨论入口。`,
      durationSeconds: 58
    },
    {
      id: 'analyze',
      order: 2,
      title: '把复杂问题拆成可观察的要素',
      purpose: '建立分析框架，降低认知负荷。',
      narration: `面对“${topic}”，我们先找三个要素：它发生在什么条件下，涉及哪些对象，变化的结果是什么。每找到一个要素，就把它放回情境中验证。这样，我们得到的不是一句抽象结论，而是一条可以复述、可以检验的分析路径。`,
      slideBrief: '三段式结构图，逐步出现条件、对象、结果。',
      valueNote: '用证据和结构替代凭感觉判断。',
      durationSeconds: 72
    },
    {
      id: 'concept',
      order: 3,
      title: '核心概念：它到底解决了什么问题',
      purpose: '给出概念、机制与适用边界。',
      narration: `现在给出核心概念。理解“${topic}”，要同时回答三件事：它是什么，它为什么成立，它在什么条件下不成立。前两个问题帮我们建立模型，最后一个问题帮我们避免过度使用模型。只有当你能说清边界，知识才真正属于你。`,
      slideBrief: '概念定义 + 机制箭头 + 一条明确的适用边界。',
      valueNote: `在边界意识中体现${value}。`,
      durationSeconds: 76
    },
    {
      id: 'case',
      order: 4,
      title: '用案例验证，而不是只记住结论',
      purpose: '通过案例检验概念，形成迁移能力。',
      narration: `我们用案例验证刚才的模型。先预测，再观察，最后解释差异。如果结果和预期一致，说明模型能解释这个案例；如果不一致，就回到条件里找原因。学习不是把结论背下来，而是不断用新证据修正自己的理解。`,
      slideBrief: '预测、观察、解释三栏对照，保留一处与预期不同的结果。',
      valueNote: '尊重事实，允许结论被证据修正。',
      durationSeconds: 72
    },
    {
      id: 'transfer',
      order: 5,
      title: '迁移到新情境，带走一套方法',
      purpose: '形成可复用的行动框架与价值回响。',
      narration: `最后，把方法带出课堂。遇到新的问题，先问：我要找的结构是什么？关键条件有哪些？我的判断能否被检验？回顾“${topic}”，我们真正要带走的，不是一个标准答案，而是一套面对复杂问题的做法，以及${value}所要求的责任。`,
      slideBrief: '三个问题组成收束卡，最后回到课程主题。',
      valueNote: `让${value}成为可执行的行动准则。`,
      durationSeconds: 64
    }
  ];
};

export function generateScript(input: ScriptGenerationInput, version = 1): CourseScript {
  const topic = clean(input.topic, '课程主题');
  const lever = isLeverTopic(topic);
  const draft = lever ? leverSections(input) : genericSections(input);
  const sections: ScriptSection[] = draft.map((section, index) => ({
    ...section,
    role: index === draft.length - 1 ? 'close' : 'body',
    order: index + 1
  }));
  const totalSeconds = sections.reduce((sum, section) => sum + section.durationSeconds, 0);
  const targetSeconds = clamp(input.durationMinutes || 8, 3, 45) * 60;
  const ratio = targetSeconds / totalSeconds;

  if (Math.abs(ratio - 1) > 0.08) {
    sections.forEach((section) => {
      section.durationSeconds = Math.round(section.durationSeconds * ratio);
    });
  }

  const script: CourseScript = {
    title: lever ? '撬动世界的支点：杠杆原理' : topic,
    thesis: lever
      ? '杠杆放大的不是能量，而是我们寻找结构与发力位置的能力。'
      : `理解${topic}，需要从具体情境走向可检验的结构，再回到真实行动。`,
    openingHook: sections[0].narration,
    objectives: lever
      ? [
          '能从真实器械中识别支点、动力作用点和阻力作用点。',
          '能画出力的作用线，并正确判断力臂。',
          '能用杠杆平衡条件解释省力与费力的差异。',
          '能把结构分析方法迁移到新的生活情境。'
        ]
      : [
          `能用自己的话说清${topic}的核心问题。`,
          '能从情境中提取条件、对象与结果。',
          '能用案例检验自己的理解。',
          '能把分析框架迁移到新问题。'
        ],
    valueThread: [
      { label: '求真', content: '先观察证据，再形成结论。' },
      { label: '边界', content: '理解模型成立的条件，不滥用结论。' },
      {
        label: '行动',
        content: clean(input.valueGuide, '让知识回到真实问题，承担判断的责任。')
      }
    ],
    sections,
    summary: lever
      ? '找支点、画力线、量距离、再判断。杠杆教我们的，是用结构改变发力方式。'
      : `先找结构，再找证据，最后把${topic}带回真实问题。`,
    keywords: lever ? ['杠杆', '支点', '力臂', '平衡条件', '结构思维'] : [topic, '结构', '证据', '迁移'],
    quality: {
      structure: 92,
      oral: input.style.includes('低龄') ? 88 : 90,
      value: 89,
      fit: 91,
      note: '开场有悬念，概念解释与案例之间衔接完整；确认前建议朗读一遍案例段落。'
    },
    version,
    confirmed: false,
    generatedAt: new Date().toISOString()
  };
  return reconcileScript(script, topic);
}

const slideLayoutForSection = (index: number, total: number): SlideLayout => {
  if (index === 1) return 'concept';
  if (index === 2) return 'compare';
  if (index === total) return 'summary';
  return index % 2 === 0 ? 'statement' : 'concept';
};

export function generateSlides(script: CourseScript, existing?: CourseSlide[]): CourseSlide[] {
  return reconcileSlides(existing ?? [], script, { title: script.title });
}