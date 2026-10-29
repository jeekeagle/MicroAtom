import type {
  AgentProfile,
  AgentSkill,
  AnalyzeBriefInput,
  AnalyzeBriefResult,
  BootstrapData,
  Capabilities,
  ConceptAnchor,
  CourseProject,
  CreateProjectInput,
  DeliveryBundle,
  GenerationMeta,
  MediaArtifact,
  MediaKind,
  MediaTriggerPlacement,
  ModelProfile,
  ProductionEngine,
  ProductionStage,
  RuntimeSettings,
  ScriptComment,
  ScriptGenerationInput,
  SlideVisitEvent,
  TeacherMemory,
  TranscriptSegment,
  TraceStep
} from '../types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers
    }
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || `请求失败 (${response.status})`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  bootstrap: () => request<BootstrapData>('/api/bootstrap'),

  memory: () => request<TeacherMemory>('/api/memory'),

  updateMemory: (payload: Partial<TeacherMemory>) =>
    request<TeacherMemory>('/api/memory', {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),

  analyzeBrief: (input: AnalyzeBriefInput) =>
    request<AnalyzeBriefResult & { meta?: GenerationMeta }>('/api/projects/analyze-brief', {
      method: 'POST',
      body: JSON.stringify(input)
    }),

  project: (id: string) => request<CourseProject>(`/api/projects/${id}`),

  createProject: (input: CreateProjectInput) =>
    request<CourseProject>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(input)
    }),

  updateProject: (id: string, patch: Partial<CourseProject>) =>
    request<CourseProject>(`/api/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch)
    }),

  deleteProject: (id: string) =>
    request<{ ok: boolean }>(`/api/projects/${id}`, {
      method: 'DELETE'
    }),

  generateScript: (id: string, input: ScriptGenerationInput) =>
    request<{ project: CourseProject; trace: TraceStep[]; generation: GenerationMeta }>(
      `/api/projects/${id}/script/generate`,
      {
        method: 'POST',
        body: JSON.stringify(input)
      }
    ),

  projectAction: (id: string, action: string, payload?: Record<string, unknown>) =>
    request<CourseProject>(`/api/projects/${id}/actions`, {
      method: 'POST',
      body: JSON.stringify({ action, ...payload })
    }),

  updateSlide: (projectId: string, slideId: string, payload: Record<string, unknown>) =>
    request<CourseProject>(`/api/projects/${projectId}/slides/${slideId}`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  uploadRecording: (
    projectId: string,
    payload: {
      dataUrl?: string;
      audioFileName?: string;
      videoFileName?: string;
      name: string;
      kind: 'teacher' | 'upload';
      transcript?: string;
      transcriptSegments?: TranscriptSegment[];
      slideEvents?: SlideVisitEvent[];
      durationSeconds?: number;
      videoDataUrl?: string;
    }
  ) =>
    request<{ project: CourseProject; asset: import('../types').RecordingAsset }>(
      `/api/projects/${projectId}/recordings`,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    ),

  uploadRecordingMedia: async (
    projectId: string,
    kind: 'audio' | 'video',
    blob: Blob,
    name: string,
    durationSeconds: number
  ) => {
    const response = await fetch(
      '/api/projects/' + projectId + '/recordings/media?kind=' + kind,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-File-Name': encodeURIComponent(name),
          'X-Media-Type': blob.type || (kind === 'video' ? 'video/webm' : 'audio/webm'),
          'X-Duration-Seconds': String(Math.max(0, Number(durationSeconds) || 0))
        },
        body: blob
      }
    );
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error || '录制文件上传失败 (' + response.status + ')');
    }
    return response.json() as Promise<
      | { kind: 'audio'; asset: import('../types').RecordingAsset }
      | { kind: 'video'; video: { fileName: string; url: string; sizeBytes: number } }
    >;
  },

  updateTranscript: (projectId: string, recordingId: string, transcript: string) =>
    request<{ project: CourseProject; asset: import('../types').RecordingAsset }>(
      `/api/projects/${projectId}/recordings/${recordingId}/transcript`,
      {
        method: 'POST',
        body: JSON.stringify({ transcript })
      }
    ),

  addScriptComment: (
    projectId: string,
    payload: {
      note: string;
      scope: 'script' | 'section';
      sectionId?: string;
      quote?: string;
    }
  ) =>
    request<{ project: CourseProject; comment: ScriptComment }>(
      `/api/projects/${projectId}/script/comments`,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    ),

  updateScriptComment: (
    projectId: string,
    commentId: string,
    payload: { note?: string; status?: 'open' | 'resolved' }
  ) =>
    request<{ project: CourseProject; comment: ScriptComment }>(
      `/api/projects/${projectId}/script/comments/${commentId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload)
      }
    ),

  deleteScriptComment: (projectId: string, commentId: string) =>
    request<{ project: CourseProject }>(
      `/api/projects/${projectId}/script/comments/${commentId}`,
      {
        method: 'DELETE'
      }
    ),

  createAgent: (payload: Record<string, unknown>) =>
    request<AgentProfile>('/api/agents', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  updateAgent: (id: string, payload: Record<string, unknown>) =>
    request<AgentProfile>(`/api/agents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),

  runAgent: (id: string, input: string) =>
    request<{
      agent: AgentProfile;
      trace: TraceStep[];
      output: string;
      meta?: GenerationMeta;
    }>(`/api/agents/${id}/run`, {
      method: 'POST',
      body: JSON.stringify({ input })
    }),

  createSkill: (payload: Record<string, unknown>) =>
    request<AgentSkill>('/api/skills', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  updateSkill: (id: string, payload: Record<string, unknown>) =>
    request<AgentSkill>(`/api/skills/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),

  runSkill: (id: string, input: string) =>
    request<{
      skill: AgentSkill;
      output: string;
      trace: TraceStep[];
      meta?: GenerationMeta;
      structured?: {
        summary: string;
        keyPoints: string[];
        cautions: string[];
        result?: string;
      };
    }>(`/api/skills/${id}/run`, {
      method: 'POST',
      body: JSON.stringify({ input })
    }),

  engines: () =>
    request<{ engines: ProductionEngine[]; stageLabels: Record<ProductionStage, string> }>(
      '/api/engines'
    ),

  createEngine: (payload: Record<string, unknown>) =>
    request<{ engine: ProductionEngine; engines: ProductionEngine[] }>('/api/engines', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  updateEngine: (id: string, payload: Record<string, unknown>) =>
    request<{ engine: ProductionEngine; engines: ProductionEngine[] }>(`/api/engines/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),

  deleteEngine: (id: string) =>
    request<{ ok: boolean; engines: ProductionEngine[] }>(`/api/engines/${id}`, {
      method: 'DELETE'
    }),

  setDefaultEngine: (id: string) =>
    request<{ engines: ProductionEngine[] }>(`/api/engines/${id}/default`, {
      method: 'POST',
      body: JSON.stringify({})
    }),

  runEngine: (id: string, input: string) =>
    request<{
      engine: ProductionEngine;
      output: string;
      meta?: GenerationMeta;
      trace: TraceStep[];
    }>(`/api/engines/${id}/run`, {
      method: 'POST',
      body: JSON.stringify({ input })
    }),

  projectArtifacts: (projectId: string) =>
    request<{
      artifacts: MediaArtifact[];
      kinds: Record<MediaKind, string>;
      sections: import('../types').ScriptSection[];
      slides: import('../types').CourseSlide[];
      timeline?: import('../types').CourseTimeline;
      render?: import('../types').RenderJob;
      delivery?: DeliveryBundle;
    }>(`/api/projects/${projectId}/artifacts`),

  createArtifact: (
    projectId: string,
    payload: {
      kind: MediaKind;
      title?: string;
      description?: string;
      sectionId?: string;
      slideId?: string;
      triggerSeconds?: number;
      placement?: MediaTriggerPlacement;
      engineId?: string;
    }
  ) =>
    request<{ artifact: MediaArtifact; project: CourseProject }>(
      `/api/projects/${projectId}/artifacts`,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    ),

  updateArtifact: (
    projectId: string,
    artifactId: string,
    payload: {
      title?: string;
      description?: string;
      triggerSeconds?: number;
      placement?: MediaTriggerPlacement;
      sectionId?: string;
      status?: 'draft' | 'ready';
      regenerate?: boolean;
    }
  ) =>
    request<{ artifact: MediaArtifact; project: CourseProject }>(
      `/api/projects/${projectId}/artifacts/${artifactId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload)
      }
    ),

  regenerateArtifact: (projectId: string, artifactId: string) =>
    request<{ artifact: MediaArtifact; project: CourseProject }>(
      `/api/projects/${projectId}/artifacts/${artifactId}/generate`,
      {
        method: 'POST',
        body: JSON.stringify({})
      }
    ),

  deleteArtifact: (projectId: string, artifactId: string) =>
    request<{ project: CourseProject }>(
      `/api/projects/${projectId}/artifacts/${artifactId}`,
      {
        method: 'DELETE'
      }
    ),

  buildDelivery: (projectId: string) =>
    request<{ project: CourseProject; delivery: DeliveryBundle }>(
      `/api/projects/${projectId}/delivery/build`,
      {
        method: 'POST',
        body: JSON.stringify({})
      }
    ),

  delivery: (projectId: string) =>
    request<{
      delivery?: DeliveryBundle;
      artifacts: MediaArtifact[];
      render?: import('../types').RenderJob;
      timeline?: import('../types').CourseTimeline;
    }>(`/api/projects/${projectId}/delivery`),

  updateSettings: (
    payload: Partial<RuntimeSettings> & { apiKey?: string; clearApiKey?: boolean }
  ) =>
    request<RuntimeSettings>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),

  testModel: (payload: Partial<RuntimeSettings>) =>
    request<{
      ok: boolean;
      latencyMs: number;
      model: string;
      provider: string;
      protocol: string;
      message: string;
    }>('/api/settings/model/test', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  setModelApiKey: (apiKey: string) =>
    request<{ ok: boolean; apiKeyConfigured: boolean }>('/api/settings/model/api-key', {
      method: 'POST',
      body: JSON.stringify({ apiKey })
    }),

  clearModelApiKey: () =>
    request<{ ok: boolean; apiKeyConfigured: boolean }>('/api/settings/model/api-key', {
      method: 'DELETE'
    }),

  setMimoApiKey: (apiKey: string) =>
    request<{ ok: boolean; mimoApiKeyConfigured: boolean }>('/api/settings/mimo/api-key', {
      method: 'POST',
      body: JSON.stringify({ apiKey })
    }),

  clearMimoApiKey: () =>
    request<{ ok: boolean; mimoApiKeyConfigured: boolean }>('/api/settings/mimo/api-key', {
      method: 'DELETE'
    }),

  testMimoSpeech: () =>
    request<{
      ok: boolean;
      latencyMs: number;
      ttsMs: number;
      asrMs: number;
      bytes: number;
      model: string;
      asrModel: string;
      transcript: string;
      message: string;
    }>('/api/settings/mimo/test', {
      method: 'POST',
      body: JSON.stringify({})
    }),

  transcribeSpeech: async (blob: Blob) => {
    const response = await fetch('/api/speech/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Media-Type': blob.type || 'audio/webm'
      },
      body: blob
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error || `语音识别失败 (${response.status})`);
    }
    return response.json() as Promise<{ text: string; durationMs: number; model: string }>;
  },

  suggestComposer: (projectId: string) =>
    request<{
      anchors: ConceptAnchor[];
      source: 'model' | 'local-fallback';
      warning: string;
      artifacts: MediaArtifact[];
      labels: Record<MediaKind, string>;
    }>(`/api/projects/${projectId}/composer/suggest`, {
      method: 'POST',
      body: JSON.stringify({})
    }),

  generateComposerCards: (projectId: string, payload: { mediaKind: MediaKind; count?: number }) =>
    request<{
      project: CourseProject;
      source: 'model' | 'local-fallback';
      warning: string;
      count: number;
    }>(`/api/projects/${projectId}/composer/cards`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  createMount: (
    projectId: string,
    payload: {
      mediaKind: MediaKind;
      title?: string;
      description?: string;
      atSeconds: number;
      concept?: string;
      endSeconds?: number;
      artifactId?: string;
      html?: string;
      placement?: MediaTriggerPlacement;
      generateCard?: boolean;
    }
  ) =>
    request<CourseProject>(`/api/projects/${projectId}/mounts`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  updateMount: (
    projectId: string,
    mountId: string,
    payload: Partial<{
      title: string;
      description: string;
      concept: string;
      html: string;
      atSeconds: number;
      endSeconds: number;
      placement: MediaTriggerPlacement;
    }>
  ) =>
    request<CourseProject>(`/api/projects/${projectId}/mounts/${mountId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),

  deleteMount: (projectId: string, mountId: string) =>
    request<CourseProject>(`/api/projects/${projectId}/mounts/${mountId}`, {
      method: 'DELETE'
    }),

  buildCourseHtml: (projectId: string) =>
    request<{
      indexUrl: string;
      fileCount: number;
      sizeBytes: number;
      durationSeconds: number;
      project: CourseProject;
    }>(`/api/projects/${projectId}/course-html`, {
      method: 'POST',
      body: JSON.stringify({})
    }),

  modelProfiles: () =>
    request<{ profiles: ModelProfile[] }>('/api/models/profiles'),

  createModelProfile: (payload: Partial<ModelProfile>) =>
    request<{ profiles: ModelProfile[] }>('/api/models/profiles', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  updateModelProfile: (id: string, payload: Partial<ModelProfile> & { active?: boolean }) =>
    request<{ profiles: ModelProfile[]; activeModelId: string }>(
      `/api/models/profiles/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload)
      }
    ),

  deleteModelProfile: (id: string) =>
    request<{ profiles: ModelProfile[]; activeModelId: string }>(
      `/api/models/profiles/${id}`,
      { method: 'DELETE' }
    ),

  setProfileKey: (id: string, apiKey: string) =>
    request<{ profiles: ModelProfile[] }>(`/api/models/profiles/${id}/api-key`, {
      method: 'POST',
      body: JSON.stringify({ apiKey })
    }),

  clearProfileKey: (id: string) =>
    request<{ profiles: ModelProfile[] }>(`/api/models/profiles/${id}/api-key`, {
      method: 'DELETE'
    }),

  testModelProfile: (id: string) =>
    request<{
      ok: boolean;
      latencyMs: number;
      model: string;
      provider: string;
      protocol: string;
      message: string;
      error?: string;
    }>(`/api/models/profiles/${id}/test`, {
      method: 'POST',
      body: JSON.stringify({})
    }),

  discoverModels: (payload: { baseUrl?: string; apiKey?: string; profileId?: string }) =>
    request<{ models: string[]; provider: string; error?: string }>('/api/models/discover', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  resetSystem: () =>
    request<{ ok: boolean }>('/api/system/reset', {
      method: 'POST',
      body: JSON.stringify({})
    }),

  health: () =>
    request<{ ok: boolean; capabilities: Capabilities; time: string }>('/api/health')
};
