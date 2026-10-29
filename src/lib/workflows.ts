import type { CourseProject, CourseWorkflow, WorkflowStep } from '../types';

export function workflowForProject(
  workflows: CourseWorkflow[],
  project?: CourseProject
): CourseWorkflow | undefined {
  if (!project) return undefined;
  return (
    workflows.find((item) => item.id === project.workflowId && item.mode === project.mode) ??
    workflows.find((item) => item.mode === project.mode && item.enabled && item.isDefault) ??
    workflows.find((item) => item.mode === project.mode && item.enabled) ??
    workflows.find((item) => item.mode === project.mode)
  );
}

export function currentWorkflowStep(
  workflow: CourseWorkflow | undefined,
  project?: CourseProject
): WorkflowStep | undefined {
  if (!workflow || !project) return undefined;
  return (
    workflow.steps.find((step) => step.id === project.workflowStepId) ??
    workflow.steps.find((step) => step.stage === project.stage) ??
    workflow.steps[0]
  );
}

export function nextWorkflowStep(
  workflow: CourseWorkflow | undefined,
  current?: WorkflowStep
): WorkflowStep | undefined {
  if (!workflow || !current) return undefined;
  const index = workflow.steps.findIndex((step) => step.id === current.id);
  return index >= 0 ? workflow.steps[index + 1] : workflow.steps[0];
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
      if (step.stage === 'script') return Boolean(project.script);
      if (step.stage === 'slides') return project.slides.length > 0;
      if (step.stage === 'audio') return project.recordings.length > 0;
      return Boolean(project.render?.downloadReady);
  }
}

export function workflowProgress(
  workflow: CourseWorkflow | undefined,
  project?: CourseProject
): number {
  if (!workflow?.steps.length || !project) return 0;
  const done = workflow.steps.filter((step) => isWorkflowStepDone(step, project)).length;
  return Math.round((done / workflow.steps.length) * 100);
}
