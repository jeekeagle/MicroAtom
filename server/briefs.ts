import type { AgentProfile, TeacherMemory } from '../src/types';

/**
 * 教师记忆与智能体档案都要进提示词。以前这两块散落在 skills.ts 与 index.ts 里
 * 各写一份，字段一多就会漏。这里统一出两个构造器：所有生成入口都从这里取文字。
 */

const line = (label: string, value?: string) => {
  const text = (value ?? '').trim();
  return text ? `- ${label}：${text}` : '';
};

/**
 * 教师长期档案。只输出有内容的字段，避免提示里出现一串"未填写"。
 * @param compact 生成短任务（如概念定位）时只取风格与口径，省 token。
 */
export function memoryBrief(memory?: TeacherMemory, compact = false): string {
  if (!memory) return '';
  const head = line(
    '任教学科与学段',
    [memory.subject, memory.grade].filter(Boolean).join(' · ')
  );
  const rows = compact
    ? [
        head,
        line('讲述风格', memory.teachingStyle),
        line('术语口径与边界', memory.boundaries)
      ]
    : [
        head,
        memory.yearsExperience ? `- 教龄：${memory.yearsExperience} 年` : '',
        line('讲述风格', memory.teachingStyle),
        line('课程主线', memory.methodology),
        line('常用案例与素材', memory.casePool),
        line('术语口径与边界', memory.boundaries),
        line('备课经验', memory.experience),
        line('学生常见误区', memory.insights),
        line('作业与评价', memory.assessment)
      ];
  const body = rows.filter(Boolean).join('\n');
  if (!body) return '';
  return `教师长期档案（稳定的教学约束，不是要念出来的内容）：
${body}
请在不改变本节目标的前提下贴近这套判断与表达；不要把档案原文写进讲稿，也不要编造档案里没有的学校、姓名与数据。`;
}

/** 智能体的专业档案：告诉模型"这一环由谁负责、按什么标准做、什么不许做"。 */
export function agentBrief(
  agents: AgentProfile[] | undefined,
  id: string,
  fallback = ''
): string {
  const agent = agents?.find((item) => item.id === id);
  if (!agent) return fallback;
  const rows = [
    `- 当前环节负责人：${agent.name} · ${agent.role}`,
    agent.description ? `- 职责边界：${agent.description}` : '',
    agent.expertise?.length ? `- 专业判断依据：${agent.expertise.join('、')}` : '',
    agent.method ? `- 工作方法：${agent.method}` : '',
    agent.constraints?.length
      ? `- 硬约束（违反即退回重做）：\n${agent.constraints
          .map((item, index) => `  ${index + 1}) ${item}`)
          .join('\n')}`
      : ''
  ].filter(Boolean);
  return `本环节由编排台中的专项智能体负责，请按它的专业标准交付：
${rows.join('\n')}`;
}

/** 智能体试运行：把角色、方法与约束拼成一张执行卡。 */
export function agentRunBrief(agent: AgentProfile): string {
  return [
    `智能体：${agent.name} · ${agent.role}`,
    `职责：${agent.description}`,
    agent.expertise?.length ? `专长：${agent.expertise.join('、')}` : '',
    agent.method ? `工作方法：${agent.method}` : '',
    agent.constraints?.length
      ? `硬约束：\n${agent.constraints.map((item, index) => `${index + 1}. ${item}`).join('\n')}`
      : ''
  ]
    .filter(Boolean)
    .join('\n');
}
