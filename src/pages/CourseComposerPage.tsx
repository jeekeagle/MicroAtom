import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CircleDot,
  Clock3,
  Film,
  Layers3,
  LoaderCircle,
  Play,
  Plus,
  Save,
  Sparkles,
  Trash2,
  WandSparkles
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import type {
  ConceptAnchor,
  CourseMount,
  CourseProject,
  MediaArtifact,
  MediaKind,
  TranscriptSegment
} from '../types';
import { Button } from '../components/ui';

const kindLabel: Record<MediaKind, string> = {
  'knowledge-graph': '知识图谱',
  'cognitive-map': '认知地图',
  'concept-card': '概念卡',
  infographic: '一图读懂',
  timeline: '课程时间线',
  quiz: '问答题'
};

const kindTone: Record<MediaKind, string> = {
  'knowledge-graph': 'teal',
  'cognitive-map': 'brick',
  'concept-card': 'gold',
  infographic: 'ink',
  timeline: 'brick',
  quiz: 'teal'
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const formatClock = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

export function CourseComposerPage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<CourseProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [suggesting, setSuggesting] = useState(false);
  const [building, setBuilding] = useState(false);
  const [anchors, setAnchors] = useState<ConceptAnchor[]>([]);
  const [anchorNote, setAnchorNote] = useState('');
  const [selectedMountId, setSelectedMountId] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [artifacts, setArtifacts] = useState<MediaArtifact[]>([]);
  const [newKind, setNewKind] = useState<MediaKind>('concept-card');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const laneRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ id: string; offset: number } | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const next = await api.project(projectId);
      setProject(next);
      setArtifacts(next.artifacts ?? []);
      setSelectedMountId((current) =>
        current && (next.mounts ?? []).some((mount) => mount.id === current)
          ? current
          : (next.mounts ?? [])[0]?.id ?? ''
      );
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '课程加载失败');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const recording = useMemo(() => {
    const list = project?.recordings ?? [];
    return list.find((asset) => asset.kind === 'tts') ?? list[list.length - 1];
  }, [project?.recordings]);

  const duration = Math.max(
    1,
    Number(recording?.durationSeconds ?? project?.timeline?.totalSeconds ?? 60)
  );

  const segments: TranscriptSegment[] = useMemo(() => {
    if (recording?.transcriptSegments?.length) return recording.transcriptSegments;
    const shots = project?.timeline?.shots ?? [];
    const sections = project?.script?.sections ?? [];
    return shots.map((shot, index) => ({
      text:
        sections.find((section) => section.id === shot.sectionId)?.narration ??
        sections[index]?.narration ??
        shot.slideTitle,
      startSeconds: shot.startSeconds,
      endSeconds: shot.endSeconds
    }));
  }, [recording?.transcriptSegments, project?.timeline?.shots, project?.script?.sections]);

  const mounts = project?.mounts ?? [];
  const selectedMount = mounts.find((mount) => mount.id === selectedMountId) ?? null;

  const suggest = async () => {
    setSuggesting(true);
    try {
      const result = await api.suggestComposer(projectId);
      setAnchors(result.anchors);
      setAnchorNote(result.warning);
      setArtifacts(result.artifacts);
      window.alert(
        result.anchors.length
          ? `智能体定位到 ${result.anchors.length} 个关键概念，可以逐个挂载成卡片。`
          : '没有在逐字稿里定位到概念，先确认录音带逐字稿。'
      );
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '概念定位失败');
    } finally {
      setSuggesting(false);
    }
  };

  const mountAnchor = async (anchor: ConceptAnchor) => {
    try {
      const next = await api.createMount(projectId, {
        mediaKind: anchor.kind,
        title: anchor.concept,
        description: anchor.note,
        concept: anchor.concept,
        atSeconds: anchor.atSeconds,
        endSeconds: anchor.endSeconds,
        generateCard: true
      });
      setProject(next);
      setArtifacts(next.artifacts ?? []);
      setSelectedMountId(next.mounts?.[next.mounts.length - 1]?.id ?? '');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '挂载失败');
    }
  };

  const mountArtifact = async (artifact: MediaArtifact) => {
    try {
      const next = await api.createMount(projectId, {
        mediaKind: artifact.kind,
        artifactId: artifact.id,
        title: artifact.title,
        description: artifact.description,
        atSeconds: artifact.triggerSeconds ?? 0
      });
      setProject(next);
      setSelectedMountId(next.mounts?.[next.mounts.length - 1]?.id ?? '');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '挂载失败');
    }
  };

  const addBlankMount = async () => {
    try {
      const next = await api.createMount(projectId, {
        mediaKind: newKind,
        title: '新的介质卡片',
        description: '由教师补写内容',
        atSeconds: Math.round(currentTime),
        html: `<div style="padding:6px 2px"><h3>新的介质卡片</h3><p>在右侧编辑挂载时间与内容，或重新生成一张卡片。</p></div>`
      });
      setProject(next);
      setSelectedMountId(next.mounts?.[next.mounts.length - 1]?.id ?? '');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '新增挂载失败');
    }
  };

  const patchMount = async (mountId: string, payload: Record<string, unknown>) => {
    try {
      const next = await api.updateMount(projectId, mountId, payload);
      setProject(next);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '更新失败');
    }
  };

  const removeMount = async (mountId: string) => {
    try {
      const next = await api.deleteMount(projectId, mountId);
      setProject(next);
      setSelectedMountId(next.mounts?.[0]?.id ?? '');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '删除失败');
    }
  };

  const buildHtml = async () => {
    setBuilding(true);
    try {
      const result = await api.buildCourseHtml(projectId);
      setProject(result.project);
      window.open(result.indexUrl, '_blank', 'noopener');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'HTML 课程生成失败');
    } finally {
      setBuilding(false);
    }
  };

  const seekTo = (seconds: number) => {
    const audio = audioRef.current;
    if (audio) audio.currentTime = clamp(seconds, 0, duration);
    setCurrentTime(clamp(seconds, 0, duration));
  };

  const onLanePointer = (event: React.MouseEvent<HTMLDivElement>) => {
    const lane = laneRef.current;
    if (!lane) return;
    const rect = lane.getBoundingClientRect();
    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    seekTo(ratio * duration);
  };

  const startDrag = (event: React.MouseEvent, mount: CourseMount) => {
    event.stopPropagation();
    const lane = laneRef.current;
    if (!lane) return;
    const rect = lane.getBoundingClientRect();
    dragRef.current = {
      id: mount.id,
      offset: (event.clientX - rect.left) / rect.width - mount.atSeconds / duration
    };
    setSelectedMountId(mount.id);
  };

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      const drag = dragRef.current;
      const lane = laneRef.current;
      if (!drag || !lane) return;
      const rect = lane.getBoundingClientRect();
      const ratio = clamp((event.clientX - rect.left) / rect.width - drag.offset, 0, 1);
      const at = Number((ratio * duration).toFixed(2));
      setProject((current) =>
        current
          ? {
              ...current,
              mounts: (current.mounts ?? []).map((mount) =>
                mount.id === drag.id ? { ...mount, atSeconds: at } : mount
              )
            }
          : current
      );
    };
    const onUp = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag) return;
      setProject((current) => {
        const mount = (current?.mounts ?? []).find((item) => item.id === drag.id);
        if (mount) {
          void api.updateMount(projectId, mount.id, { atSeconds: mount.atSeconds });
        }
        return current;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [duration, projectId]);

  if (loading || !project) {
    return (
      <div className="page composer-page">
        <div className="composer-loading">
          <LoaderCircle className="spin" size={20} />
          正在载入课程合成器
        </div>
      </div>
    );
  }

  const playheadPercent = clamp((currentTime / duration) * 100, 0, 100);

  return (
    <div className="page composer-page">
      <div className="composer-head">
        <div className="composer-title">
          <button
            className="icon-button"
            aria-label="返回课程工作台"
            onClick={() => navigate(`/projects/${project.id}`)}
          >
            <ArrowLeft size={17} />
          </button>
          <div>
            <span className="eyebrow">COURSE COMPOSER / HTML COURSE</span>
            <h1>成片编辑台</h1>
            <p>
              {project.title} · {project.subject} {project.grade} · 声音 {formatClock(duration)} ·
              {' '}{mounts.length} 张挂载卡片
            </p>
          </div>
        </div>
        <div className="composer-actions">
          <Button
            variant="secondary"
            size="sm"
            icon={<Sparkles size={15} />}
            loading={suggesting}
            onClick={() => void suggest()}
          >
            智能体定位概念
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<WandSparkles size={15} />}
            loading={building}
            onClick={() => void buildHtml()}
          >
            生成 HTML 课程
          </Button>
        </div>
      </div>

      <div className="composer-body">
        <section className="composer-timeline">
          <div className="composer-transport">
            <button
              className="composer-play"
              aria-label="播放"
              onClick={() => {
                const audio = audioRef.current;
                if (!audio) return;
                if (audio.paused) void audio.play();
                else audio.pause();
              }}
            >
              <Play size={16} />
            </button>
            <span className="composer-clock">{formatClock(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration}
              step={0.1}
              value={currentTime}
              onChange={(event) => seekTo(Number(event.target.value))}
            />
            <span className="composer-clock is-muted">{formatClock(duration)}</span>
            {recording?.audioUrl && (
              <audio
                ref={audioRef}
                src={recording.audioUrl}
                onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
              />
            )}
          </div>

          <div className="composer-track" onClick={onLanePointer}>
            <div className="track-row">
              <span className="track-label">
                <CircleDot size={12} /> 声音轨
              </span>
              <div className="track-lane" ref={laneRef}>
                <div className="lane-block lane-audio" style={{ left: 0, width: '100%' }}>
                  <span className="lane-wave" />
                  <em>{recording?.name ?? '旁白音轨'}</em>
                </div>
              </div>
            </div>

            <div className="track-row">
              <span className="track-label">
                <Layers3 size={12} /> 文字轨
              </span>
              <div className="track-lane">
                {segments.map((segment, index) => (
                  <button
                    key={`${segment.startSeconds}-${index}`}
                    className={`lane-block lane-text ${
                      currentTime >= segment.startSeconds && currentTime < segment.endSeconds
                        ? 'is-live'
                        : ''
                    }`}
                    style={{
                      left: `${clamp((segment.startSeconds / duration) * 100, 0, 100)}%`,
                      width: `${clamp(
                        ((segment.endSeconds - segment.startSeconds) / duration) * 100,
                        1.5,
                        100
                      )}%`
                    }}
                    title={segment.text}
                    onClick={(event) => {
                      event.stopPropagation();
                      seekTo(segment.startSeconds);
                    }}
                  >
                    {segment.text.slice(0, 28)}
                  </button>
                ))}
              </div>
            </div>

            <div className="track-row">
              <span className="track-label">
                <Film size={12} /> 课件轨
              </span>
              <div className="track-lane">
                {(project.timeline?.shots ?? []).map((shot) => (
                  <button
                    key={shot.slideId}
                    className="lane-block lane-slide"
                    style={{
                      left: `${clamp((shot.startSeconds / duration) * 100, 0, 100)}%`,
                      width: `${clamp(
                        ((shot.endSeconds - shot.startSeconds) / duration) * 100,
                        1.5,
                        100
                      )}%`
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      seekTo(shot.startSeconds);
                    }}
                  >
                    {shot.slideTitle}
                  </button>
                ))}
              </div>
            </div>

            <div className="track-row is-media">
              <span className="track-label">
                <Plus size={12} /> 介质轨
              </span>
              <div className="track-lane">
                {mounts.map((mount) => (
                  <button
                    key={mount.id}
                    className={`lane-card lane-${kindTone[mount.mediaKind]} ${
                      mount.id === selectedMountId ? 'is-active' : ''
                    }`}
                    style={{
                      left: `${clamp((mount.atSeconds / duration) * 100, 0, 100)}%`
                    }}
                    onMouseDown={(event) => startDrag(event, mount)}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedMountId(mount.id);
                      seekTo(mount.atSeconds);
                    }}
                  >
                    <span>{kindLabel[mount.mediaKind]}</span>
                    <strong>{mount.title}</strong>
                    <em>{mount.atSeconds.toFixed(1)}s</em>
                  </button>
                ))}
                {!mounts.length && (
                  <span className="lane-empty">还没有挂载介质，先让智能体定位概念</span>
                )}
              </div>
            </div>

            <div className="composer-playhead" style={{ left: `${playheadPercent}%` }} />
          </div>
        </section>

        <aside className="composer-panel">
          <section className="composer-card">
            <div className="composer-card-head">
              <strong>智能体建议的概念</strong>
              <small>{anchors.length ? `${anchors.length} 个待挂载` : '尚未定位'}</small>
            </div>
            {anchorNote && <p className="composer-note">{anchorNote}</p>}
            <div className="composer-list">
              {anchors.map((anchor) => (
                <div className="composer-item" key={`${anchor.concept}-${anchor.atSeconds}`}>
                  <div>
                    <strong>{anchor.concept}</strong>
                    <small>
                      {anchor.atSeconds.toFixed(1)}s · {kindLabel[anchor.kind]}
                    </small>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Plus size={13} />}
                    onClick={() => void mountAnchor(anchor)}
                  >
                    挂载
                  </Button>
                </div>
              ))}
              {!anchors.length && (
                <p className="composer-empty">点击右上角“智能体定位概念”，逐字稿中的关键概念会出现在这里。</p>
              )}
            </div>
          </section>

          <section className="composer-card">
            <div className="composer-card-head">
              <strong>已有介质</strong>
              <small>{artifacts.length} 个</small>
            </div>
            <div className="composer-list">
              {artifacts.map((artifact) => (
                <div className="composer-item" key={artifact.id}>
                  <div>
                    <strong>{artifact.title}</strong>
                    <small>{kindLabel[artifact.kind]}</small>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Plus size={13} />}
                    onClick={() => void mountArtifact(artifact)}
                  >
                    挂载
                  </Button>
                </div>
              ))}
              {!artifacts.length && (
                <p className="composer-empty">介质工坊生成的卡片会出现在这里，可以直接挂到时间轴上。</p>
              )}
            </div>
            <div className="composer-add">
              <select
                value={newKind}
                onChange={(event) => setNewKind(event.target.value as MediaKind)}
              >
                {(Object.keys(kindLabel) as MediaKind[]).map((kind) => (
                  <option value={kind} key={kind}>
                    {kindLabel[kind]}
                  </option>
                ))}
              </select>
              <Button variant="secondary" size="sm" onClick={() => void addBlankMount()}>
                新建空白挂载
              </Button>
            </div>
          </section>

          <section className="composer-card">
            <div className="composer-card-head">
              <strong>当前挂载</strong>
              <small>{selectedMount ? kindLabel[selectedMount.mediaKind] : '未选中'}</small>
            </div>
            {selectedMount ? (
              <div className="composer-mount-editor">
                <label className="field">
                  <span>卡片标题</span>
                  <input
                    value={selectedMount.title}
                    onChange={(event) =>
                      setProject((current) =>
                        current
                          ? {
                              ...current,
                              mounts: (current.mounts ?? []).map((mount) =>
                                mount.id === selectedMount.id
                                  ? { ...mount, title: event.target.value }
                                  : mount
                              )
                            }
                          : current
                      )
                    }
                    onBlur={(event) =>
                      void patchMount(selectedMount.id, { title: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>关联概念</span>
                  <input
                    value={selectedMount.concept ?? ''}
                    onChange={(event) =>
                      setProject((current) =>
                        current
                          ? {
                              ...current,
                              mounts: (current.mounts ?? []).map((mount) =>
                                mount.id === selectedMount.id
                                  ? { ...mount, concept: event.target.value }
                                  : mount
                              )
                            }
                          : current
                      )
                    }
                    onBlur={(event) =>
                      void patchMount(selectedMount.id, { concept: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>出现时刻（秒）</span>
                  <div className="input-with-suffix">
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={selectedMount.atSeconds}
                      onChange={(event) =>
                        setProject((current) =>
                          current
                            ? {
                                ...current,
                                mounts: (current.mounts ?? []).map((mount) =>
                                  mount.id === selectedMount.id
                                    ? { ...mount, atSeconds: Number(event.target.value) || 0 }
                                    : mount
                                )
                              }
                            : current
                        )
                      }
                      onBlur={(event) =>
                        void patchMount(selectedMount.id, {
                          atSeconds: Number(event.target.value) || 0
                        })
                      }
                    />
                    <span>秒</span>
                  </div>
                </label>
                <div className="composer-preview">
                  <span>卡片预览</span>
                  <iframe
                    title={selectedMount.title}
                    srcDoc={selectedMount.html}
                    sandbox="allow-same-origin"
                  />
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  icon={<Trash2 size={14} />}
                  onClick={() => void removeMount(selectedMount.id)}
                >
                  移除挂载
                </Button>
              </div>
            ) : (
              <p className="composer-empty">在时间轴上点一张卡片，这里会显示它的内容与出现时刻。</p>
            )}
          </section>

          <section className="composer-card is-note">
            <div className="composer-card-head">
              <strong>HTML 课程说明</strong>
              <Clock3 size={14} />
            </div>
            <p className="composer-empty">
              生成后得到一个独立 HTML 页面：上方播放课程视频与声音，下方随时间弹出命中的概念卡片，点击卡片展开到固定窗口查看。所有卡片内容都来自这里的挂载。
            </p>
            <Button
              variant="secondary"
              size="sm"
              icon={<Save size={14} />}
              loading={building}
              onClick={() => void buildHtml()}
            >
              生成并预览
            </Button>
          </section>
        </aside>
      </div>
    </div>
  );
}
