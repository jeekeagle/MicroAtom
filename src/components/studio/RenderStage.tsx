import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clapperboard,
  Download,
  ExternalLink,
  Film,
  Layers3,
  LoaderCircle,
  Play,
  RefreshCw,
  Send,
  Sparkles
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { api } from '../../lib/api';
import { formatDuration } from '../../lib/format';
import type { CourseSlide, RecordingAsset } from '../../types';
import { Button, ProgressBar } from '../ui';
import type { StageProps } from './types';

export function RenderStage({ project, onProject, notify, onStage }: StageProps) {
  const { data } = useApp();
  const [selectedAudioId, setSelectedAudioId] = useState(
    project.recordings.find((asset) => asset.kind === 'tts')?.id ??
      project.recordings[0]?.id ??
      ''
  );
  const [publishing, setPublishing] = useState(false);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<number | null>(null);

  const isRendering = project.render?.status === 'running';
  const isDone = project.render?.status === 'done' && Boolean(project.render.downloadUrl);
  const hasError = project.render?.status === 'error';

  useEffect(() => {
    const next =
      project.recordings.find((asset) => asset.id === selectedAudioId) ??
      project.recordings.find((asset) => asset.kind === 'tts') ??
      project.recordings[0];
    if (next) setSelectedAudioId(next.id);
  }, [project.recordings, selectedAudioId]);

  useEffect(() => {
    if (isRendering) {
      pollRef.current = window.setInterval(async () => {
        try {
          const next = await api.project(project.id);
          onProject(next);
          if (next.render?.status === 'done') {
            notify('微课视频渲染完成');
          }
          if (next.render?.status === 'error') {
            notify(next.render.error || '渲染未完成', 'error');
          }
        } catch {
          // Retry on next cycle.
        }
      }, 1600);
    }
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [isRendering, onProject, project.id, notify]);

  const startAssemble = async () => {
    if (!project.script?.confirmed) {
      notify('请先在讲稿工坊中确认讲稿', 'error');
      return;
    }
    if (!project.slides.length) {
      notify('课件为空，请先在课件工坊生成页面', 'error');
      return;
    }
    setStarting(true);
    try {
      const next = await api.projectAction(project.id, 'assemble', {
        audioAssetId: selectedAudioId || undefined
      });
      onProject(next);
      notify('已提交渲染任务，正在生成 1080p 成片');
    } catch (error) {
      notify(error instanceof Error ? error.message : '启动渲染失败', 'error');
    } finally {
      setStarting(false);
    }
  };

  const publish = async () => {
    setPublishing(true);
    try {
      const next = await api.projectAction(project.id, 'publish');
      onProject(next);
      notify('微课已发布，归入已完成课程');
    } catch (error) {
      notify(error instanceof Error ? error.message : '发布失败', 'error');
    } finally {
      setPublishing(false);
    }
  };

  const activeAudio =
    project.recordings.find((asset) => asset.id === selectedAudioId) ??
    project.recordings.find((asset) => asset.kind === 'tts') ??
    project.recordings[0];

  const timeline = project.timeline;
  const timelineShots = timeline?.shots ?? [];
  const slidesDuration = project.slides.reduce((sum, slide) => sum + slide.seconds, 0);
  const durationEstimate =
    project.render?.durationSeconds ??
    timeline?.totalSeconds ??
    activeAudio?.durationSeconds ??
    slidesDuration ??
    project.durationMinutes * 60;

  return (
    <div className="stage-page">
      <div className="stage-toolbar">
        <div className="stage-title">
          <span className="stage-icon">
            <Clapperboard size={19} />
          </span>
          <div>
            <span className="eyebrow">FINAL CUT & EXPORT / 04</span>
            <h2>成片交付</h2>
            <p>
              检查音画时间轴，组装 1080p 课件画面、旁白音轨与课程元数据，完成最终微课。
            </p>
          </div>
        </div>
        <div className="stage-toolbar-actions">
          <Button
            variant="primary"
            size="sm"
            icon={isRendering ? <LoaderCircle size={15} className="spin" /> : <Film size={15} />}
            loading={isRendering || starting}
            disabled={!project.slides.length || !project.script?.confirmed}
            onClick={startAssemble}
          >
            {isDone ? '重新渲染' : isRendering ? '正在渲染' : '开始渲染成片'}
          </Button>
        </div>
      </div>

      {(!project.script?.confirmed || !project.slides.length) && (
        <div className="inline-notice is-warning">
          <AlertTriangle size={16} />
          <div>
            <strong>成片前置条件未满足</strong>
            <span>
              {!project.script?.confirmed ? '讲稿尚未确认；' : ''}
              {!project.slides.length ? '课件尚未生成；' : ''}
              成片需要讲稿与课件同时就绪。
            </span>
          </div>
          <button onClick={() => onStage(!project.script?.confirmed ? 'script' : 'slides')}>
            去处理
          </button>
        </div>
      )}

      <div className="render-overview-grid">
        <section className="render-main-panel">
          {isDone && project.render?.downloadUrl ? (
            <div className="render-player-card">
              <div className="render-video-frame">
                <video
                  controls
                  playsInline
                  poster={project.render.posterUrl}
                  src={project.render.downloadUrl}
                />
              </div>
              <div className="render-card-head">
                <div>
                  <span className="eyebrow">1080P MASTER / 已完成</span>
                  <h3>{project.title}</h3>
                  <p>
                    {project.render.format} · {project.render.resolution} ·{' '}
                    {project.render.durationSeconds
                      ? formatDuration(project.render.durationSeconds)
                      : '时长就绪'}
                    {project.render.sizeBytes
                      ? ` · ${(project.render.sizeBytes / 1024 / 1024).toFixed(1)} MB`
                      : ''}
                  </p>
                </div>
                <div className="render-card-actions">
                  <a
                    className="button button-secondary button-md"
                    href={project.render.downloadUrl}
                    download={`${project.title}.mp4`}
                  >
                    <Download size={16} />
                    下载 MP4
                  </a>
                  <Button
                    variant="primary"
                    size="md"
                    icon={<Send size={16} />}
                    loading={publishing}
                    onClick={publish}
                  >
                    {project.status === 'done' ? '已发布微课' : '发布微课'}
                  </Button>
                </div>
              </div>
            </div>
          ) : isRendering ? (
            <div className="render-running-card">
              <span className="render-spinner">
                <LoaderCircle size={28} className="spin" />
              </span>
              <span className="eyebrow">ASSEMBLING / 剪序编排中</span>
              <h3>正在组装 1080p 课程成片</h3>
              <p>{project.render?.stageMessage ?? '计算画面与音轨时间轴...'}</p>
              <div className="render-running-progress">
                <ProgressBar value={project.render?.progress ?? 10} tone="brick" />
                <span>{project.render?.progress ?? 10}%</span>
              </div>
              <div className="render-pipeline-steps">
                <span>01 生成 1080p 课件</span>
                <span>02 旁白时间轴</span>
                <span>03 H.264 编码</span>
              </div>
            </div>
          ) : (
            <div className="render-standby-card">
              <span className="standby-icon">
                <Clapperboard size={30} />
              </span>
              <span className="eyebrow">MASTERING DESK</span>
              <h3>一切就绪，随时可以合成为 MP4 成片</h3>
              <p>
                后台会调用 Headless 视觉渲染与 FFmpeg 引擎，将 {project.slides.length || 0} 页课件画面与{' '}
                {activeAudio ? activeAudio.name : '旁白音轨'} 严格对齐，生成广播级 1080p 课程视频。
              </p>
              <div className="standby-actions">
                <Button
                  variant="primary"
                  icon={<Play size={16} />}
                  loading={starting}
                  disabled={!project.slides.length || !project.script?.confirmed}
                  onClick={startAssemble}
                >
                  开始合成成片
                </Button>
              </div>
            </div>
          )}

          {hasError && (
            <div className="inline-notice is-error">
              <AlertTriangle size={16} />
              <div>
                <strong>渲染未成功完成</strong>
                <span>{project.render?.error || '成片生成遇到异常，请检查系统日志。'}</span>
              </div>
              <button onClick={startAssemble}>重试渲染</button>
            </div>
          )}

          <section className="timeline-breakdown">
            <div className="timeline-head">
              <div>
                <span className="eyebrow">TIMELINE / {formatDuration(durationEstimate)}</span>
                <strong>课程时间轴分段</strong>
              </div>
              <span>
                {timeline?.method === 'measured' ? '实测对齐' : '估算对齐'} ·{' '}
                {timelineShots.length || project.slides.length} 个镜头
              </span>
            </div>
            {timeline?.warnings?.length ? (
              <ul className="timeline-warnings">
                {timeline.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
            <div className="timeline-grid">
              {timelineShots.length
                ? timelineShots.map((shot, index) => (
                    <div className="timeline-block" key={`${shot.slideId}-${index}`}>
                      <span className="timeline-index">{String(index + 1).padStart(2, '0')}</span>
                      <div>
                        <strong>{shot.slideTitle}</strong>
                        <span>
                          {shot.audioRole === 'intro'
                            ? '开场'
                            : shot.audioRole === 'outro'
                              ? '收束'
                              : '旁白段'}
                        </span>
                        <small>
                          {formatDuration(shot.startSeconds)} → {formatDuration(shot.endSeconds)}
                        </small>
                      </div>
                      <span className="timeline-seconds">{shot.durationSeconds.toFixed(1)}s</span>
                    </div>
                  ))
                : project.slides.map((slide, index) => {
                    const section = project.script?.sections.find(
                      (item) => item.id === slide.sectionId
                    );
                    return (
                      <div className="timeline-block" key={slide.id}>
                        <span className="timeline-index">{String(index + 1).padStart(2, '0')}</span>
                        <div>
                          <strong>{slide.title}</strong>
                          <span>{slide.eyebrow}</span>
                          <small>{section?.purpose ?? slide.note}</small>
                        </div>
                        <span className="timeline-seconds">{formatDuration(slide.seconds)}</span>
                      </div>
                    );
                  })}
            </div>
          </section>
        </section>

        <aside className="render-sidebar">
          <div className="render-config-card">
            <span className="eyebrow">ASSEMBLY CONFIG</span>
            <h4>组装参数</h4>
            <div className="config-line">
              <span>分辨率</span>
              <strong>1920 × 1080 (16:9)</strong>
            </div>
            <div className="config-line">
              <span>编码</span>
              <strong>H.264 / AAC 25fps</strong>
            </div>
            <div className="config-line">
              <span>页面数量</span>
              <strong>{project.slides.length} 页</strong>
            </div>
            <div className="config-line">
              <span>时间轴</span>
              <strong className={timeline?.method === 'measured' ? 'state-ok' : 'state-wait'}>
                {timeline
                  ? `${timeline.method === 'measured' ? '实测对齐' : '估算对齐'} · ${formatDuration(timeline.totalSeconds)}`
                  : '待生成'}
              </strong>
            </div>
            <div className="config-line">
              <span>音轨选择</span>
              <strong>{activeAudio?.name ?? '自动合成旁白'}</strong>
            </div>
            <div className="config-line">
              <span>环境支持</span>
              <strong className={data?.capabilities.ffmpeg ? 'state-ok' : 'state-wait'}>
                {data?.capabilities.ffmpeg ? 'FFmpeg 在线' : '未检测到 FFmpeg'}
              </strong>
            </div>
          </div>

          <div className="render-audio-picker">
            <span className="eyebrow">AUDIO TRACK</span>
            <h4>用于成片的音轨</h4>
            <div className="picker-list">
              {project.recordings.map((asset) => (
                <label key={asset.id} className="picker-option">
                  <input
                    type="radio"
                    name="renderAudio"
                    checked={selectedAudioId === asset.id}
                    onChange={() => setSelectedAudioId(asset.id)}
                  />
                  <div>
                    <strong>{asset.name}</strong>
                    <small>
                      {asset.kind === 'tts' ? 'AI 旁白' : '教师录音'} ·{' '}
                      {formatDuration(asset.durationSeconds)}
                    </small>
                  </div>
                </label>
              ))}
              {!project.recordings.length && (
                <p className="picker-empty">
                  尚未生成旁白或录音。开始渲染时系统会自动为这门课合成 AI 旁白。
                </p>
              )}
            </div>
          </div>

          <div className="render-package-card">
            <span className="eyebrow">DELIVERY PACKAGE</span>
            <h4>交付资产</h4>
            <ul>
              <li>
                <Check size={14} />
                完整讲稿 (Markdown / 结构化)
              </li>
              <li>
                <Check size={14} />
                1080p 课件页面 ({project.slides.length} 张)
              </li>
              <li>
                <Check size={14} />
                分段音频与旁白音轨
              </li>
              <li>
                <Check size={14} />
                MP4 微课视频 (广播级)
              </li>
            </ul>
          </div>
        </aside>
      </div>

      <div className="stage-actionbar">
        <div className="actionbar-status">
          <span className={isDone ? 'is-ready' : 'is-draft'}>
            {isDone ? <Check size={13} /> : <Clapperboard size={13} />}
            {isDone ? '微课成片已生成' : '等待成片渲染'}
          </span>
          <small>
            {isDone ? '可下载成片或直接发布。' : '点击“开始渲染成片”执行异步流水线。'}
          </small>
        </div>
        <div className="stage-actionbar-buttons">
          <Button
            variant="secondary"
            icon={<Layers3 size={16} />}
            onClick={() => onStage('slides')}
          >
            返回课件
          </Button>
          {isDone && project.render?.downloadUrl ? (
            <a
              className="button button-primary button-md"
              href={project.render.downloadUrl}
              download={`${project.title}.mp4`}
            >
              <Download size={16} />
              下载微课 MP4
            </a>
          ) : (
            <Button
              variant="primary"
              icon={<Play size={16} />}
              loading={isRendering || starting}
              disabled={!project.slides.length || !project.script?.confirmed}
              onClick={startAssemble}
            >
              合成 1080p 成片
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
