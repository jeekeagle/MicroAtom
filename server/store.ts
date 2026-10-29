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
import { DEFAULT_ENGINES, normalizeEngines } from './engines';
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

export interface Database {
  projects: CourseProject[];
  agents: AgentProfile[];
  skills: AgentSkill[];
  engines: ProductionEngine[];
  workflows: CourseWorkflow[];
  memory: TeacherMemory;
  settings: RuntimeSettings;
  activity: ActivityEvent[];
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
      }
    };
    database.memory = {
      ...seedTeacherMemory,
      ...(database.memory ?? {})
    };
    database.engines = normalizeEngines(database.engines);
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
    if (JSON.stringify(database.projects) !== projectsBefore) {
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
