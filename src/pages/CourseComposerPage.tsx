import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CircleDot,
  Clock3,
  Film,
  Layers3,
  LoaderCircle,
  Maximize2,
  Minimize2,
  MonitorPlay,
  Pause,
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
  quiz: '问答题',
  flashcard: '术语速记卡',
  checklist: '掌握自检卡',
  counterexample: '反例辨析卡',
  challenge: '迁移挑战卡'
};

const kindTone: Record<MediaKind, string> = {
  'knowledge-graph': 'teal',
  'cognitive-map': 'brick',
  'concept-card': 'gold',
  infographic: 'ink',
  timeline: 'brick',
  quiz: 'teal',
  flashcard: 'ink',
  checklist: 'teal',
  counterexample: 'brick',
  challenge: 'gold'
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/** 和导出页归档轨上的圆点用的是同一套颜色，两边对得上。 */
const kindColor: Record<MediaKind, string> = {
  'knowledge-graph': '#0e6f63',
  'cognitive-map': '#9f3d2f',
  'concept-card': '#9b6a18',
  infographic: '#23588a',
  timeline: '#6c4b3b',
  quiz: '#3d5c4d',
  flashcard: '#2f5d8c',
  checklist: '#1f7a6d',
  counterexample: '#a2452f',
  challenge: '#8a5a12'
};

/** 没显式设置过时，按类型推一个默认的出现方式。 */
const defaultHold = (kind: MediaKind) =>
  kind === 'quiz' ||
  kind === 'checklist' ||
  kind === 'challenge' ||
  kind === 'counterexample';

const formatClock = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

const formatPrecise = (seconds: number) => {
  const total = Math.max(0, seconds);
  return `${formatClock(total)}.${Math.floor((total % 1) * 10)}`;
};

/** 介质卡片有两种形态：独立 HTML 文档，或一段 HTML 片段。按情况决定要不要套壳。 */
const MOUNT_FIT = `<style>
/* 叠在画面上时，省掉和视频重复的课程页眉，把空间留给卡片本身 */
html,body{background:#fff}
body{padding:13px 15px}
.card{max-width:none}
.card-head{display:none}
.card-face{border:none;box-shadow:none;padding:0;border-radius:0}
</style>`;

const mountDocument = (body: string) => {
  if (/<!doctype/i.test(body) || /<html[\s>]/i.test(body)) return body + MOUNT_FIT;
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<style>
html,body{margin:0;background:#fff;color:#16202b}
body{padding:16px 18px;font-family:"Microsoft YaHei UI","PingFang SC","Noto Sans SC",sans-serif;-webkit-font-smoothing:antialiased}
*{box-sizing:border-box;max-width:100%}
h1{font-size:18px;margin:0 0 8px;line-height:1.4}
h2{font-size:16px;margin:0 0 8px;line-height:1.4}
h3{font-size:14px;margin:0 0 6px;line-height:1.4}
h4{font-size:13px;margin:0 0 4px}
p,li{font-size:12.5px;line-height:1.7;color:#2b3641;margin:0 0 6px}
ul,ol{padding-left:17px;margin:5px 0}
strong{color:#16202b}
svg{max-width:100%;height:auto;display:block}
table{width:100%;border-collapse:collapse;font-size:12px}
td,th{border-bottom:1px solid #e6eaee;padding:5px 6px;text-align:left}
</style></head><body>${body}</body></html>`;
};

const mountWindow = (mount: CourseMount) => {
  const start = Number(mount.atSeconds) || 0;
  const rawEnd = Number(mount.endSeconds);
  const end = Number.isFinite(rawEnd) && rawEnd > start ? rawEnd : start + 8;
  return { start, end };
};

/** 独立路由版：/projects/:id/course，全屏一张编辑台。 */
export function CourseComposerPage() {
  const { projectId = '' } = useParams();
  return <CourseComposer projectId={projectId} />;
}

export interface CourseComposerProps {
  projectId: string;
  /** 嵌进「挂载与交互」阶段时收掉页面头，动作按钮保留。 */
  embedded?: boolean;
  /** 把内部加载/修改后的项目回抛给外层的课程工作台。 */
  onProject?: (project: CourseProject) => void;
}

/** 成片编辑台主体：路由页与挂载阶段共用同一套时间轴与卡片面板。 */
export function CourseComposer({ projectId, embedded = false, onProject }: CourseComposerProps) {
  const navigate = useNavigate();
  const [project, setProject] = useState<CourseProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [suggesting, setSuggesting] = useState(false);
  const [building, setBuilding] = useState(false);
  const [anchors, setAnchors] = useState<ConceptAnchor[]>([]);
  const [anchorNote, setAnchorNote] = useState('');
  const [selectedMountId, setSelectedMountId] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [videoBroken, setVideoBroken] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [artifacts, setArtifacts] = useState<MediaArtifact[]>([]);
  const [newKind, setNewKind] = useState<MediaKind>('concept-card');
  const [cardKind, setCardKind] = useState<MediaKind>('quiz');
  const [cardCount, setCardCount] = useState(3);
  const [generatingCards, setGeneratingCards] = useState(false);
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const laneRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const dragRef = useRef<{ id: string; offset: number; span: number } | null>(null);
  /** 轨道的实际位置：左侧标签栏不算进时间轴，播放头只在这段宽度里换算。 */
  const [laneGeo, setLaneGeo] = useState({ offset: 0, width: 0 });

  // 回抛给外层：按对象引用判重，避免 setData → 重渲染 → 再回抛的死循环。
  const syncedRef = useRef<CourseProject | null>(null);
  useEffect(() => {
    if (!project || !onProject || syncedRef.current === project) return;
    syncedRef.current = project;
    onProject(project);
  }, [project, onProject]);

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

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === pageRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    const element = pageRef.current;
    if (!element || !element.requestFullscreen) return;
    void element.requestFullscreen().catch(() => {});
  };

  const recording = useMemo(() => {
    const list = project?.recordings ?? [];
    return list.find((asset) => asset.kind === 'tts') ?? list[list.length - 1];
  }, [project?.recordings]);

  /** 成片 MP4 是主画面；没有成片时退回课件直出，仍然可以调时间轴。 */
  const videoUrl =
    project?.render?.status === 'done' && project.render.downloadUrl && !videoBroken
      ? project.render.downloadUrl
      : undefined;
  const hasVideo = Boolean(videoUrl);

  const duration = Math.max(
    1,
    mediaDuration,
    Number(project?.render?.durationSeconds ?? 0),
    Number(recording?.durationSeconds ?? 0),
    Number(project?.timeline?.totalSeconds ?? 0)
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

  const mounts = useMemo(
    () => [...(project?.mounts ?? [])].sort((a, b) => a.atSeconds - b.atSeconds),
    [project?.mounts]
  );
  const shots = project?.timeline?.shots ?? [];
  const slides = project?.slides ?? [];
  const selectedMount = mounts.find((mount) => mount.id === selectedMountId) ?? null;

  /** 当前时刻落在哪一页课件上：优先用实测时间轴，没有就按时长均分。 */
  const activeSlideIndex = useMemo(() => {
    if (!slides.length) return -1;
    if (shots.length) {
      const hit = shots.find(
        (shot) => currentTime >= shot.startSeconds && currentTime < shot.endSeconds
      );
      if (hit) {
        const byId = slides.findIndex((slide) => slide.id === hit.slideId);
        if (byId >= 0) return byId;
        const byOrder = slides.findIndex((slide) => slide.title === hit.slideTitle);
        if (byOrder >= 0) return byOrder;
      }
    }
    const per = duration / slides.length;
    return clamp(Math.floor(currentTime / Math.max(0.001, per)), 0, slides.length - 1);
  }, [currentTime, duration, shots, slides]);

  const activeSlide = activeSlideIndex >= 0 ? slides[activeSlideIndex] : null;
  const activeShot = useMemo(() => {
    if (!slides.length || activeSlideIndex < 0) return null;
    const slide = slides[activeSlideIndex];
    return shots.find((shot) => shot.slideId === slide?.id) ?? shots[activeSlideIndex] ?? null;
  }, [activeSlideIndex, shots, slides]);

  /** 播放头命中哪张介质，就把它真实渲染到画面上。 */
  const liveMount = useMemo(() => {
    return (
      mounts.find((mount) => {
        const { start, end } = mountWindow(mount);
        return currentTime >= start && currentTime < end;
      }) ?? null
    );
  }, [currentTime, mounts]);

  const liveSegment = useMemo(
    () =>
      segments.find(
        (segment) => currentTime >= segment.startSeconds && currentTime < segment.endSeconds
      ) ?? null,
    [currentTime, segments]
  );

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

  const generateCards = async () => {
    setGeneratingCards(true);
    try {
      const result = await api.generateComposerCards(projectId, {
        mediaKind: cardKind,
        count: cardCount
      });
      setProject(result.project);
      if (result.warning) window.alert(result.warning);
      else window.alert(`已生成 ${result.count} 张${kindLabel[cardKind]}，并挂载到时间轴。`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '卡片生成失败');
    } finally {
      setGeneratingCards(false);
    }
  };

  const mountArtifact = async (artifact: MediaArtifact) => {
    try {
      const next = await api.createMount(projectId, {
        mediaKind: artifact.kind,
        artifactId: artifact.id,
        title: artifact.title,
        description: artifact.description,
        atSeconds: artifact.triggerSeconds ?? Math.round(currentTime)
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

  const seekTo = useCallback(
    (seconds: number) => {
      const target = clamp(seconds, 0, duration);
      const media = mediaRef.current;
      const limit = media ? Number(media.duration) : NaN;
      if (media && Number.isFinite(limit) && limit > 0) {
        media.currentTime = Math.min(target, limit);
        pendingSeekRef.current = null;
      } else if (media) {
        // 元数据还没加载完时直接写 currentTime 会被浏览器丢掉，
        // 表现就是"拖到 3 分钟，画面还停在开头"。先记下，等加载完再落位。
        pendingSeekRef.current = target;
      }
      setCurrentTime(target);
    },
    [duration]
  );

  /** 音视频元数据就绪：补上时长，并把加载前点的位置补落地。 */
  const handleMediaReady = useCallback(
    (event: React.SyntheticEvent<HTMLVideoElement | HTMLAudioElement>) => {
      const media = event.currentTarget;
      const length = Number(media.duration) || 0;
      if (length > 0) setMediaDuration(length);
      const pending = pendingSeekRef.current;
      if (pending != null && Number.isFinite(media.duration) && media.duration > 0) {
        media.currentTime = Math.min(pending, media.duration);
        pendingSeekRef.current = null;
      }
    },
    []
  );

  const togglePlay = useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;
    if (media.paused) void media.play().catch(() => setPlaying(false));
    else media.pause();
  }, []);

  /** 键盘：空格播放暂停，左右微调，Shift 加大步长，F 切全屏。 */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        togglePlay();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        seekTo(currentTime - (event.shiftKey ? 5 : 1));
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        seekTo(currentTime + (event.shiftKey ? 5 : 1));
      } else if (event.key === 'f' || event.key === 'F') {
        event.preventDefault();
        if (document.fullscreenElement) void document.exitFullscreen();
        else void pageRef.current?.requestFullscreen?.().catch(() => {});
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentTime, seekTo, togglePlay]);

  /**
   * 量出轨道相对容器的横向位置。
   * 左侧「成片轨 / 声音轨 / 课件轨」标签占用了一条固定的网格列，时间轴的 0 点
   * 是从轨道左边缘开始的，不是从整块容器左边缘开始的——播放头和点击定位都必须
   * 按这一段宽度换算，否则播放头会压到标签上，越往后偏差越大。
   */
  useEffect(() => {
    const track = trackRef.current;
    const lane = laneRef.current;
    if (!track || !lane) return;
    const measure = () => {
      const trackBox = track.getBoundingClientRect();
      const laneBox = lane.getBoundingClientRect();
      setLaneGeo({
        offset: laneBox.left - trackBox.left,
        width: laneBox.width
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    observer.observe(lane);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [duration, shots.length, mounts.length, hasVideo]);

  const onLanePointer = (event: React.MouseEvent<HTMLDivElement>) => {
    const lane = laneRef.current;
    if (!lane || duration <= 0) return;
    const rect = lane.getBoundingClientRect();
    // 点在标签栏（时间轴左侧那一列）上不该把进度打回 0。
    if (event.clientX < rect.left || event.clientX > rect.right) return;
    const ratio = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    seekTo(ratio * duration);
  };

  const startDrag = (event: React.MouseEvent, mount: CourseMount) => {
    event.stopPropagation();
    const lane = laneRef.current;
    if (!lane) return;
    const rect = lane.getBoundingClientRect();
    const { start, end } = mountWindow(mount);
    dragRef.current = {
      id: mount.id,
      offset: (event.clientX - rect.left) / rect.width - start / duration,
      span: Math.max(2, end - start)
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
                mount.id === drag.id
                  ? { ...mount, atSeconds: at, endSeconds: Number((at + drag.span).toFixed(2)) }
                  : mount
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
          void api.updateMount(projectId, mount.id, {
            atSeconds: mount.atSeconds,
            endSeconds: mount.endSeconds
          });
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
  const pct = (seconds: number) => clamp((seconds / duration) * 100, 0, 100);

  return (
    <div
      className={`page composer-page${embedded ? ' is-embedded' : ''}${
        fullscreen ? ' is-fullscreen' : ''
      }`}
      ref={pageRef}
    >
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
            <span className="eyebrow">COURSE COMPOSER / SYNC TIMELINE</span>
            <h1>成片编辑台</h1>
            <p>
              {project.title} · {project.subject} {project.grade} · 时长 {formatClock(duration)} ·
              {' '}
              {mounts.length} 张介质卡
            </p>
          </div>
        </div>
        <div className="composer-actions">
          <button
            className="composer-fullscreen"
            type="button"
            onClick={toggleFullscreen}
            title={fullscreen ? '退出全屏（Esc）' : '全屏编辑（F）'}
            aria-label={fullscreen ? '退出全屏' : '全屏编辑'}
          >
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            <span>{fullscreen ? '退出全屏' : '全屏'}</span>
          </button>
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
            导出 HTML 课程
          </Button>
        </div>
      </div>

      <div className="composer-body">
        <div className="composer-main">
          <section className="composer-monitor">
            <div className="monitor-bar">
              <span className={`monitor-badge ${hasVideo ? 'is-ready' : 'is-draft'}`}>
                {hasVideo ? '成片视频 1920×1080' : '课件直出 · 成片未渲染'}
              </span>
              <span className="monitor-clock">
                {formatPrecise(currentTime)} / {formatClock(duration)}
              </span>
              {!hasVideo && (
                <button
                  className="monitor-link"
                  onClick={() => navigate(`/projects/${project.id}?stage=render`)}
                >
                  去渲染成片
                </button>
              )}
              <span className="monitor-hit">
                {liveMount
                  ? `介质 · ${kindLabel[liveMount.mediaKind]}「${liveMount.title}」`
                  : activeSlide
                    ? `课件 · 第 ${activeSlideIndex + 1} 页「${activeSlide.title}」`
                    : '暂无画面'}
              </span>
            </div>

            <div className={`monitor-stage${playing ? ' is-playing' : ''}`}>
              {hasVideo ? (
                <video
                  key={videoUrl}
                  ref={(element) => {
                    mediaRef.current = element;
                  }}
                  src={videoUrl}
                  poster={project.render?.posterUrl}
                  playsInline
                  preload="auto"
                  onLoadedMetadata={handleMediaReady}
                  onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onEnded={() => setPlaying(false)}
                  onError={() => setVideoBroken(true)}
                />
              ) : activeSlide?.html ? (
                <iframe
                  key={activeSlide.id}
                  title={activeSlide.title}
                  srcDoc={activeSlide.html}
                  sandbox="allow-scripts allow-same-origin"
                />
              ) : (
                <div className="monitor-blank">
                  <MonitorPlay size={22} />
                  <span>
                    {project.render?.status === 'running'
                      ? '成片正在渲染，完成后这里会自动切到视频'
                      : '还没有可预览的画面：先生成课件，或去渲染成片'}
                  </span>
                </div>
              )}

              {liveMount && (
                <div
                  className={`monitor-mount is-${liveMount.placement ?? 'below'}${
                    (liveMount.hold ?? defaultHold(liveMount.mediaKind)) ? ' is-hold' : ''
                  }`}
                  style={
                    {
                      '--mount-accent': kindColor[liveMount.mediaKind]
                    } as React.CSSProperties
                  }
                >
                  <div className="monitor-mount-head">
                    <span className="monitor-mount-kind">
                      {kindLabel[liveMount.mediaKind]}
                    </span>
                    <strong>{liveMount.title}</strong>
                    <span className="monitor-mount-mode">
                      {(liveMount.hold ?? defaultHold(liveMount.mediaKind))
                        ? '停一下看'
                        : '边看边讲'}
                    </span>
                    <em>{mountWindow(liveMount).start.toFixed(1)}s</em>
                    <button
                      className="monitor-mount-zoom"
                      title="在画面居中放大，看清整张卡片"
                      onClick={() =>
                        void patchMount(liveMount.id, {
                          placement: liveMount.placement === 'focus' ? 'below' : 'focus'
                        })
                      }
                    >
                      {liveMount.placement === 'focus' ? '还原' : '放大'}
                    </button>
                  </div>
                  <iframe
                    title={liveMount.title}
                    srcDoc={mountDocument(liveMount.html)}
                    sandbox="allow-scripts"
                  />
                </div>
              )}
            </div>

            <div className="monitor-caption">
              {liveSegment?.text ?? '此刻没有旁白'}
            </div>

            {!hasVideo && recording?.audioUrl && (
              <audio
                ref={(element) => {
                  if (!hasVideo) mediaRef.current = element;
                }}
                src={recording.audioUrl}
                onLoadedMetadata={handleMediaReady}
                onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
              />
            )}
          </section>

          <section className="composer-timeline">
            <div className="composer-transport">
              <button className="composer-play" aria-label="播放" onClick={togglePlay}>
                {playing ? <Pause size={15} /> : <Play size={16} />}
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
            </div>

            <div className="composer-track" ref={trackRef} onClick={onLanePointer}>
              <div className="track-row">
                <span className="track-label">
                  <Film size={12} /> 成片轨
                </span>
                <div className="track-lane">
                  <div
                    className={`lane-block lane-video${hasVideo ? '' : ' is-empty'}`}
                    style={{ left: 0, width: '100%' }}
                  >
                    {hasVideo
                      ? `${project.render?.format ?? 'MP4 / H.264'} · 已烧录课件与讲师画面`
                      : '尚未渲染成片，主画面改用课件直出'}
                  </div>
                </div>
              </div>

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
                  <Layers3 size={12} /> 课件轨
                </span>
                <div className="track-lane">
                  {shots.length
                    ? shots.map((shot) => (
                        <button
                          key={shot.slideId}
                          className={`lane-block lane-slide${
                            currentTime >= shot.startSeconds && currentTime < shot.endSeconds
                              ? ' is-live'
                              : ''
                          }`}
                          style={{
                            left: `${pct(shot.startSeconds)}%`,
                            width: `${clamp(
                              pct(shot.endSeconds) - pct(shot.startSeconds),
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
                      ))
                    : slides.map((slide, index) => (
                        <button
                          key={slide.id}
                          className={`lane-block lane-slide${
                            index === activeSlideIndex ? ' is-live' : ''
                          }`}
                          style={{
                            left: `${(index / Math.max(1, slides.length)) * 100}%`,
                            width: `${100 / Math.max(1, slides.length)}%`
                          }}
                          onClick={(event) => {
                            event.stopPropagation();
                            seekTo((index / Math.max(1, slides.length)) * duration);
                          }}
                        >
                          {slide.title}
                        </button>
                      ))}
                </div>
              </div>

              <div className="track-row is-media">
                <span className="track-label">
                  <Plus size={12} /> 介质轨
                </span>
                <div className="track-lane">
                  {mounts.map((mount) => {
                    const { start, end } = mountWindow(mount);
                    return (
                      <button
                        key={mount.id}
                        className={`lane-card lane-${kindTone[mount.mediaKind]}${
                          mount.id === selectedMountId ? ' is-active' : ''
                        }${liveMount?.id === mount.id ? ' is-live' : ''}`}
                        style={{
                          left: `${pct(start)}%`,
                          width: `${Math.max(9, pct(end) - pct(start))}%`
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
                        <em>
                          {start.toFixed(1)}s → {end.toFixed(1)}s
                        </em>
                      </button>
                    );
                  })}
                  {!mounts.length && (
                    <span className="lane-empty">还没有挂载介质，先让智能体定位概念</span>
                  )}
                </div>
              </div>

              <div className="track-row">
                <span className="track-label">
                  <Clock3 size={12} /> 字幕轨
                </span>
                <div className="track-lane">
                  {segments.map((segment, index) => (
                    <button
                      key={`${segment.startSeconds}-${index}`}
                      className={`lane-block lane-text${
                        currentTime >= segment.startSeconds && currentTime < segment.endSeconds
                          ? ' is-live'
                          : ''
                      }`}
                      style={{
                        left: `${pct(segment.startSeconds)}%`,
                        width: `${clamp(
                          pct(segment.endSeconds) - pct(segment.startSeconds),
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

              <div
                className="composer-playhead"
                style={
                  laneGeo.width > 0
                    ? {
                        left: `${laneGeo.offset + (playheadPercent / 100) * laneGeo.width}px`,
                        opacity: 1
                      }
                    : { left: 0, opacity: 0 }
                }
              />
            </div>
          </section>
        </div>

        <aside className="composer-panel">
          <section className="composer-card">
            <div className="composer-card-head">
              <strong>此刻画面</strong>
              <small>{formatPrecise(currentTime)}</small>
            </div>
            <div className="composer-now">
              <div>
                <span>课件</span>
                <strong>
                  {activeSlide ? `${activeSlideIndex + 1}. ${activeSlide.title}` : '无'}
                </strong>
                {activeShot && (
                  <small>
                    {formatClock(activeShot.startSeconds)} – {formatClock(activeShot.endSeconds)}
                  </small>
                )}
              </div>
              <div>
                <span>介质</span>
                <strong>{liveMount ? liveMount.title : '此刻没有卡片'}</strong>
                {liveMount && (
                  <small>
                    {mountWindow(liveMount).start.toFixed(1)}s →{' '}
                    {mountWindow(liveMount).end.toFixed(1)}s
                  </small>
                )}
              </div>
            </div>
            <p className="composer-empty">
              拖动播放头，主画面会跟着切到那一刻的视频与课件，命中的介质卡片同时浮上来。
            </p>
          </section>

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
                <p className="composer-empty">
                  点击右上角“智能体定位概念”，逐字稿中的关键概念会出现在这里。
                </p>
              )}
            </div>
          </section>

          <section className="composer-card">
            <div className="composer-card-head">
              <strong>生成互动卡片</strong>
              <small>洞察智能体</small>
            </div>
            <p className="composer-empty">
              洞察智能体会通读逐字稿，按卡片类型写内容并直接挂到时间轴：随堂快问、术语速记、掌握自检、反例辨析与迁移挑战。
            </p>
            <div className="composer-add">
              <select
                value={cardKind}
                onChange={(event) => setCardKind(event.target.value as MediaKind)}
              >
                <option value="quiz">随堂快问</option>
                <option value="flashcard">术语速记卡</option>
                <option value="checklist">掌握自检卡</option>
                <option value="counterexample">反例辨析卡</option>
                <option value="challenge">迁移挑战卡</option>
              </select>
              <select
                value={cardCount}
                onChange={(event) => setCardCount(Number(event.target.value) || 3)}
              >
                {[1, 2, 3, 4, 5].map((count) => (
                  <option value={count} key={count}>
                    {count} 张
                  </option>
                ))}
              </select>
              <Button
                variant="primary"
                size="sm"
                icon={<Sparkles size={14} />}
                loading={generatingCards}
                onClick={() => void generateCards()}
              >
                生成并挂载
              </Button>
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
                <p className="composer-empty">
                  介质工坊生成的卡片会出现在这里，可以直接挂到时间轴上。
                </p>
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
                在当前时刻新建
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
                <div className="composer-pair">
                  <label className="field">
                    <span>出现时刻（秒）</span>
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
                  </label>
                  <label className="field">
                    <span>停留（秒）</span>
                    <input
                      type="number"
                      min={2}
                      step={1}
                      value={Math.round(
                        mountWindow(selectedMount).end - mountWindow(selectedMount).start
                      )}
                      onChange={(event) => {
                        const span = Math.max(2, Number(event.target.value) || 8);
                        setProject((current) =>
                          current
                            ? {
                                ...current,
                                mounts: (current.mounts ?? []).map((mount) =>
                                  mount.id === selectedMount.id
                                    ? { ...mount, endSeconds: mount.atSeconds + span }
                                    : mount
                                )
                              }
                            : current
                        );
                      }}
                      onBlur={(event) => {
                        const span = Math.max(2, Number(event.target.value) || 8);
                        void patchMount(selectedMount.id, {
                          endSeconds: selectedMount.atSeconds + span
                        });
                      }}
                    />
                  </label>
                </div>
                <label className="field">
                  <span>出现位置</span>
                  <select
                    value={selectedMount.placement}
                    onChange={(event) =>
                      void patchMount(selectedMount.id, { placement: event.target.value })
                    }
                  >
                    <option value="below">右下方叠层</option>
                    <option value="side">右侧叠层</option>
                    <option value="focus">居中放大</option>
                  </select>
                </label>
                <label className="field">
                  <span>出现方式</span>
                  <select
                    value={
                      (selectedMount.hold ?? defaultHold(selectedMount.mediaKind))
                        ? 'hold'
                        : 'flow'
                    }
                    onChange={(event) =>
                      void patchMount(selectedMount.id, {
                        hold: event.target.value === 'hold'
                      })
                    }
                  >
                    <option value="hold">停下 · 视频暂停，看完再继续</option>
                    <option value="flow">不停 · 卡片旁出，视频照走</option>
                  </select>
                </label>
                <div className="composer-preview">
                  <span>卡片预览</span>
                  <iframe
                    title={selectedMount.title}
                    srcDoc={mountDocument(selectedMount.html)}
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
              <strong>导出说明</strong>
              <Clock3 size={14} />
            </div>
            <p className="composer-empty">
              导出的 HTML 课程把成片视频、课件页与这些卡片绑在同一条时间轴上：播放时视频往前走，命中的卡片自动浮出，可以停、可以点开看。
            </p>
            <Button
              variant="secondary"
              size="sm"
              icon={<Save size={14} />}
              loading={building}
              onClick={() => void buildHtml()}
            >
              导出并预览
            </Button>
          </section>
        </aside>
      </div>
    </div>
  );
}
