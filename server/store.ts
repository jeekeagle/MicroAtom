import fs from 'node:fs';
import path from 'node:path';
import type {
  ActivityEvent,
  AgentProfile,
  AgentSkill,
  CourseProject,
  CourseWorkflow,
  ProductionEngine,
  RuntimeSettings,
  TeacherMemory
} from '../src/types';
import { DEFAULT_ENGINES, normalizeEngines, setEngineDefault } from './engines';
import {
  DEFAULT_WORKFLOWS,
  defaultWorkflowForMode,
  normalizeWorkflows,
  workflowStepForStage
} from './workflows';
import {
  seedActivity,
  seedAgents,
  seedProjects,
  seedSettings,
  seedSkills,
  seedTeacherMemory
} from './seed';
import { dataDir } from './paths';
import { reconcileProjectMapping } from './mapping';
import { buildDeckSlideHtml, writeDeck } from './deck';

/**
 * 课件版式版本：版式或渲染器一改，旧项目里存着的单页 HTML 就落后了，
 * 预览与成片会对不上。启动时按这个版本号一次性重建，老师不用手动点"重建"。
 */
const DECK_RENDER_VERSION = 5;

/**
 * 内置智能体的专业档案版本。智能体的专长、方法与硬约束会进生成提示，
 * 升级时要把老 store 里那几份"说明性描述"换成新的专业档案，
 * 但运行时数据（启用状态、运行次数、最近运行）必须保留。
 */
const AGENT_PROFILE_VERSION = 2;

/**
 * 教师档案的领域版本：把示例用的初中物理档案换成智能体课程的默认档案。
 * 只替换老师还没改过的字段，改过的原样保留。
 */
const MEMORY_DOMAIN_VERSION = 1;

/** 上一版内置教师档案，用于判断哪些字段还是原样没动。 */
const legacyMemory: Partial<TeacherMemory> = {
  school: '杭州市行知中学',
  subject: '物理',
  grade: '八年级',
  yearsExperience: 9,
  teachingStyle: '口语化、问题驱动，先给真实情境再收束概念',
  experience:
    '长期负责初中物理概念课与实验课，习惯用生活器材搭桥，再让学生用证据解释现象。',
  insights:
    '八年级学生最容易被术语吓住。先让他们预测，再制造认知冲突，最后用一个可迁移的小任务收尾，比直接讲定义有效。'
};


export interface Database {
  projects: CourseProject[];
  agents: AgentProfile[];
  skills: AgentSkill[];
  engines: ProductionEngine[];
  workflows: CourseWorkflow[];
  memory: TeacherMemory;
  settings: RuntimeSettings;
  activity: ActivityEvent[];
  /** 数据文件版本标记，用于一次性迁移。 */
  meta?: {
    deckEngineAdopted?: boolean;
    engineDefaultsVersion?: number;
    [key: string]: unknown;
  };
}

const storePath = path.join(dataDir, 'store.json');

const seedDatabase = (): Database => ({
  projects: seedProjects,
  agents: seedAgents,
  skills: seedSkills,
  engines: normalizeEngines(DEFAULT_ENGINES),
  workflows: normalizeWorkflows(DEFAULT_WORKFLOWS),
  memory: seedTeacherMemory,
  settings: seedSettings,
  activity: seedActivity
});

let database: Database | null = null;

function ensureStore() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, JSON.stringify(seedDatabase(), null, 2), 'utf8');
  }
}

export function readDb(): Database {
  if (database) return database;
  ensureStore();
  try {
    database = JSON.parse(fs.readFileSync(storePath, 'utf8')) as Database;
    // Normalize stores created by earlier versions.
    const storedSettings = database.settings ?? seedSettings;
    database.settings = {
      ...seedSettings,
      ...storedSettings,
      videoFrame: {
        ...seedSettings.videoFrame,
        ...(storedSettings.videoFrame ?? {})
      },
      brand: {
        ...seedSettings.brand,
        ...(storedSettings.brand ?? {})
      },
      modelProfiles:
        storedSettings.modelProfiles?.length
          ? storedSettings.modelProfiles
          : seedSettings.modelProfiles,
      activeModelId: storedSettings.activeModelId || seedSettings.activeModelId
    };
    database.memory = {
      ...seedTeacherMemory,
      ...(database.memory ?? {})
    };
    database.meta = database.meta ?? {};
    let profileChanged = false;
    // 教师档案的领域升级：只动老师没改过的字段，改过的一律尊重原值。
    if (Number(database.meta.memoryDomainVersion ?? 0) < MEMORY_DOMAIN_VERSION) {
      const memory = database.memory;
      for (const [key, oldValue] of Object.entries(legacyMemory) as Array<
        [keyof TeacherMemory, unknown]
      >) {
        if (memory[key] === oldValue) {
          (memory as unknown as Record<string, unknown>)[key as string] = (
            seedTeacherMemory as unknown as Record<string, unknown>
          )[key as string];
          profileChanged = true;
        }
      }
      // 新增的专业字段为空时补默认值，老师已经写过的保留。
      for (const key of ['methodology', 'casePool', 'boundaries', 'assessment'] as const) {
        if (!(memory[key] ?? '').trim()) {
          memory[key] = seedTeacherMemory[key];
          profileChanged = true;
        }
      }
      database.meta.memoryDomainVersion = MEMORY_DOMAIN_VERSION;
      profileChanged = true;
    }
    database.engines = normalizeEngines(database.engines);
    // 授课放映课件成为默认课件链路，只在升级后的首次启动切换一次，
    // 之后老师自己改的默认引擎不会被覆盖。
    let enginesChanged = false;
    // 默认引擎版本：2 起以授课放映课件为默认课件链路。
    const defaultsVersion = Number(database.meta.engineDefaultsVersion ?? 0);
    if (defaultsVersion < 3) {
      if (database.engines.some((item) => item.id === 'engine-slides-deck')) {
        setEngineDefault(database.engines, 'engine-slides-deck');
        enginesChanged = true;
      }
      database.meta.engineDefaultsVersion = 3;
      database.meta.deckEngineAdopted = true;
    }
    // Built-in skills and agents are added to older stores so new capabilities
    // show up without wiping the teacher's own configuration.
    const storedSkillIds = new Set((database.skills ?? []).map((skill) => skill.id));
    database.skills = [
      ...seedSkills.filter((skill) => !storedSkillIds.has(skill.id)),
      ...(database.skills ?? [])
    ];
    const storedAgentIds = new Set((database.agents ?? []).map((agent) => agent.id));
    database.agents = [
      ...seedAgents.filter((agent) => !storedAgentIds.has(agent.id)),
      ...(database.agents ?? [])
    ];
    // 内置智能体的专业档案升级：换掉职责说明、专长、方法与硬约束，
    // 保留老师自己改的启用状态与运行记录；自定义智能体一律不动。
    if (Number(database.meta.agentProfileVersion ?? 0) < AGENT_PROFILE_VERSION) {
      const byId = new Map(seedAgents.map((agent) => [agent.id, agent]));
      database.agents = database.agents.map((agent) => {
        const preset = byId.get(agent.id);
        if (!preset) return agent;
        return {
          ...agent,
          name: preset.name,
          role: preset.role,
          description: preset.description,
          model: preset.model,
          skillIds: preset.skillIds,
          color: preset.color,
          expertise: preset.expertise,
          method: preset.method,
          constraints: preset.constraints
        };
      });
      // 顺带把内置智能体按生产链顺序排好，自定义的接在后面。
      const order = new Map(seedAgents.map((agent, index) => [agent.id, index]));
      database.agents = [...database.agents].sort((a, b) => {
        const left = order.get(a.id);
        const right = order.get(b.id);
        if (left !== undefined && right !== undefined) return left - right;
        if (left !== undefined) return -1;
        if (right !== undefined) return 1;
        return 0;
      });
      database.meta.agentProfileVersion = AGENT_PROFILE_VERSION;
      profileChanged = true;
    }
    database.workflows = normalizeWorkflows(database.workflows);
    const workflows = database.workflows;
    const projectsBefore = JSON.stringify(database.projects);
    database.projects = database.projects.map((project) => {
      const selected =
        workflows.find(
          (flow) => flow.id === project.workflowId && flow.mode === project.mode
        ) ?? defaultWorkflowForMode(workflows, project.mode);
      const step =
        selected?.steps.find((item) => item.id === project.workflowStepId) ??
        (selected ? workflowStepForStage(selected, project.stage) : undefined) ??
        selected?.steps[0];
      const normalized: CourseProject = {
        ...project,
        workflowId: selected?.id ?? 'workflow-auto-default',
        workflowStepId: step?.id,
        artifacts: Array.isArray(project.artifacts) ? project.artifacts : [],
        delivery: project.delivery,
        selectedEngines: project.selectedEngines ?? {},
        script: project.script
          ? {
              ...project.script,
              comments: Array.isArray(project.script.comments) ? project.script.comments : []
            }
          : undefined,
        recordings: (project.recordings ?? []).map((asset) => ({
          ...asset,
          alignment: asset.alignment ?? 0,
          alignmentMethod:
            asset.alignmentMethod ??
            (asset.segments?.length ? (asset.kind === 'tts' ? 'segment' : 'estimated') : 'none'),
          alignmentConfidence: asset.alignmentConfidence ?? asset.alignment ?? 0,
          transcriptSegments: asset.transcriptSegments ?? []
        }))
      };
      // Keep the script and the deck in step: every page maps to exactly one
      // script section, and the course opens with the topic and the objectives.
      return reconcileProjectMapping(normalized);
    });
    // Persist the repaired script/deck mapping once, so the data file and the
    // studio always agree on which page belongs to which paragraph.
    let deckRebuilt = false;
    if (Number(database.meta.deckRenderVersion ?? 0) < DECK_RENDER_VERSION) {
      for (const project of database.projects) {
        if (!project.slides?.length) continue;
        const total = project.slides.length;
        // 所有项目都换成同一套排版，逐页预览、放映与成片用的是同一份 HTML。
        project.slides = project.slides.map((slide) => ({
          ...slide,
          html: buildDeckSlideHtml(slide, project, total)
        }));
        if (project.deck) {
          const deck = writeDeck(project);
          project.deck = {
            ...project.deck,
            url: deck.url,
            slides: deck.slides,
            bytes: deck.bytes
          };
        }
        deckRebuilt = true;
      }
      database.meta.deckRenderVersion = DECK_RENDER_VERSION;
    }
    if (
      enginesChanged ||
      deckRebuilt ||
      profileChanged ||
      JSON.stringify(database.projects) !== projectsBefore
    ) {
      fs.writeFileSync(storePath, JSON.stringify(database, null, 2), 'utf8');
    }
  } catch {
    database = seedDatabase();
    writeDb(database);
  }
  return database;
}

export function writeDb(next: Database) {
  ensureStore();
  database = next;
  fs.writeFileSync(storePath, JSON.stringify(next, null, 2), 'utf8');
}

export function mutateDb(mutator: (db: Database) => void) {
  const db = readDb();
  mutator(db);
  writeDb(db);
  return db;
}

export function resetDb() {
  database = seedDatabase();
  writeDb(database);
}
