import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  Eye,
  Layers3,
  LoaderCircle,
  PanelsTopLeft,
  Plus,
  Sparkles,
  Trash2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import type { MediaArtifact, MediaKind } from '../types';
import { Button } from '../components/ui';

const kindCatalog: Array<{ kind: MediaKind; label: string; hint: string }> = [
  { kind: 'knowledge-graph', label: '知识图谱', hint: '概念之间的层级与关系网' },
  { kind: 'cognitive-map', label: '认知地图', hint: '从已知到未知的学习路径' },
  { kind: 'concept-card', label: '概念卡', hint: '定义、边界、例子与误区' },
  { kind: 'infographic', label: '一图读懂', hint: '把整节课压成一张信息图' },
  { kind: 'timeline', label: '课程时间线', hint: '事件、步骤或论证推进' },
  { kind: 'quiz', label: '随堂快问', hint: '带选项、判分与解析的问答' },
  { kind: 'flashcard', label: '术语速记卡', hint: '正反面记忆与记忆钩子' },
  { kind: 'checklist', label: '掌握自检卡', hint: '可勾选的达标自查表' },
  { kind: 'counterexample', label: '反例辨析卡', hint: '常见误区与事实并排对照' },
  { kind: 'challenge', label: '迁移挑战卡', hint: '新情境任务与分级提示' }
];

const toneFor = (kind: MediaKind) => {
  switch (kind) {
    case 'knowledge-graph':
      return 'teal';
    case 'cognitive-map':
      return 'brick';
    case 'concept-card':
      return 'gold';
    case 'infographic':
      return 'ink';
    case 'timeline':
      return 'brick';
    case 'quiz':
      return 'teal';
    case 'flashcard':
      return 'ink';
    case 'checklist':
      return 'teal';
    case 'counterexample':
      return 'brick';
    default:
      return 'gold';
  }
};

export function MediaWorkshopPage() {
  const { data } = useApp();
  const navigate = useNavigate();
  const projects = useMemo(
    () => (data?.projects ?? []).filter((project) => project.script?.confirmed),
    [data?.projects]
  );
  const [projectId, setProjectId] = useState('');
  const [artifacts, setArtifacts] = useState<MediaArtifact[]>([]);
  const [sections, setSections] = useState<Array<{ id: string; title: string }>>([]);
  const [busy, setBusy] = useState('');
  const [preview, setPreview] = useState<MediaArtifact | null>(null);

  useEffect(() => {
    if (!projectId && projects.length) setProjectId(projects[0].id);
  }, [projectId, projects]);

  const load = async () => {
    if (!projectId) return;
    try {
      const result = await api.projectArtifacts(projectId);
      setArtifacts(result.artifacts ?? []);
      setSections(result.sections ?? []);
    } catch {
      setArtifacts([]);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const create = async (kind: MediaKind) => {
    if (!projectId) return;
    setBusy(kind);
    try {
      await api.createArtifact(projectId, { kind });
      await load();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '生成失败');
    } finally {
      setBusy('');
    }
  };

  const mount = async (artifact: MediaArtifact) => {
    try {
      await api.createMount(projectId, {
        mediaKind: artifact.kind,
        artifactId: artifact.id,
        title: artifact.title,
        description: artifact.description,
        atSeconds: artifact.triggerSeconds ?? 0
      });
      window.alert('已挂载到成片编辑台的时间轴。');
      navigate(`/projects/${projectId}/course`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '挂载失败');
    }
  };

  return (
    <div className="page media-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">MEDIA WORKSHOP / 介质工坊</span>
          <h1>把课程做成可以点开的介质</h1>
          <p>
            每一种介质都是一个 HTML 卡片，生成后可以挂到成片编辑台的时间轴上，
            讲到对应概念时自动出现。
          </p>
        </div>
        <select
          className="media-project-select"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
        >
          {projects.map((project) => (
            <option value={project.id} key={project.id}>
              {project.title}
            </option>
          ))}
        </select>
      </div>

      <section className="media-kind-grid">
        {kindCatalog.map((item) => (
          <button
            key={item.kind}
            className={`media-kind is-${toneFor(item.kind)}`}
            onClick={() => void create(item.kind)}
            disabled={busy === item.kind || !projectId}
          >
            <span className="media-kind-icon">
              {busy === item.kind ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <PanelsTopLeft size={17} />
              )}
            </span>
            <strong>{item.label}</strong>
            <small>{item.hint}</small>
          </button>
        ))}
      </section>

      <section className="media-list-section">
        <div className="media-list-head">
          <div>
            <span className="eyebrow">ARTIFACTS</span>
            <strong>已生成的介质（{artifacts.length}）</strong>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={<Sparkles size={14} />}
            onClick={() => navigate(`/projects/${projectId}/course`)}
          >
            打开成片编辑台
          </Button>
        </div>
        <div className="media-list">
          {artifacts.map((artifact) => (
            <article className="media-item" key={artifact.id}>
              <div className="media-item-head">
                <span className={`media-chip is-${toneFor(artifact.kind)}`}>
                  {kindCatalog.find((item) => item.kind === artifact.kind)?.label ?? artifact.kind}
                </span>
                <strong>{artifact.title}</strong>
                <small>{artifact.triggerSeconds ?? 0}s</small>
              </div>
              <p>{artifact.description}</p>
              <div className="media-item-actions">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Eye size={14} />}
                  onClick={() => setPreview(artifact)}
                >
                  预览
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Layers3 size={14} />}
                  onClick={() => void mount(artifact)}
                >
                  挂载到时间轴
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 size={14} />}
                  onClick={async () => {
                    await api.deleteArtifact(projectId, artifact.id);
                    await load();
                  }}
                >
                  删除
                </Button>
              </div>
            </article>
          ))}
          {!artifacts.length && (
            <p className="media-empty">还没有生成介质。选一门已确认讲稿的课程，点上面任意一种介质开始。</p>
          )}
        </div>
      </section>

      {preview && (
        <div className="media-preview" role="dialog" aria-modal="true">
          <div className="media-preview-panel">
            <div className="media-preview-head">
              <div>
                <span className="eyebrow">PREVIEW</span>
                <strong>{preview.title}</strong>
              </div>
              <button className="icon-button" onClick={() => setPreview(null)} aria-label="关闭">
                ×
              </button>
            </div>
            <iframe title={preview.title} srcDoc={preview.html} sandbox="allow-same-origin" />
          </div>
        </div>
      )}

      <div className="media-foot-note">
        <Check size={14} />
        介质内容来自已确认的讲稿，生成后可在成片编辑台里调整出现时刻。
      </div>
    </div>
  );
}
