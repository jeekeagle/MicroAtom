import type { CourseProject, StageKey } from '../../types';

export interface StageProps {
  project: CourseProject;
  onProject: (project: CourseProject) => void;
  notify: (message: string, tone?: 'success' | 'error' | 'info') => void;
  onStage: (stage: StageKey) => void;
}
