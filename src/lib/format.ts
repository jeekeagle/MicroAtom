import type {
  CourseMode,
  ProjectStatus,
  ScriptSectionRole,
  SlideRole,
  StageKey
} from '../types';

export const modeLabel: Record<CourseMode, string> = {
  oral: '口语稿驱动',
  auto: '全自动生成',
  ppt: 'PPT 驱动'
};

export const modeShortLabel: Record<CourseMode, string> = {
  oral: '口语稿',
  auto: '全自动',
  ppt: 'PPT'
};

export const sectionRoleLabel: Record<ScriptSectionRole, string> = {
  intro: '主题引入',
  objectives: '学习目标',
  body: '正文',
  close: '收束'
};

export const slideRoleLabel: Record<SlideRole, string> = {
  cover: '封面',
  objectives: '学习目标',
  content: '内容',
  summary: '总结'
};

export const stageLabel: Record<StageKey, string> = {
  script: '讲稿',
  slides: '课件',
  audio: '声音与录制',
  render: '成片'
};

export const statusLabel: Record<ProjectStatus, string> = {
  draft: '草稿',
  producing: '制作中',
  review: '待审核',
  done: '已完成'
};

export const formatDuration = (seconds: number) => {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
};

export const formatDate = (iso: string) => {
  const date = new Date(iso);
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
};

export const relativeTime = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
};

export const initials = (name: string) => name.trim().slice(0, 1).toUpperCase();
