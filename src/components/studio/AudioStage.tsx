import { useEffect, useState } from 'react';
import {
  ArrowRight,
  AudioLines,
  Check,
  FileAudio,
  LoaderCircle,
  Mic,
  Pause,
  Play,
  Presentation,
  Radio,
  Sparkles,
  Volume2,
  WandSparkles,
  Waves
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { api } from '../../lib/api';
import { formatDate, formatDuration } from '../../lib/format';
import type { RecordingAsset } from '../../types';
import { Button } from '../ui';
import { TeacherTrialOverlay } from './TeacherTrialOverlay';
import type { StageProps } from './types';

type SpeechRecognitionConstructor = new () => unknown;

const getSpeechRecognition = () => {
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
};

const kindLabel: Record<RecordingAsset['kind'], string> = {
  tts: 'AI 旁白',
  teacher: '教师试讲',
  upload: '历史导入'
};

const kindIcon: Record<RecordingAsset['kind'], typeof AudioLines> = {
  tts: AudioLines,
  teacher: Mic,
  upload: FileAudio
};

const waveform = [18, 38, 24, 54, 32, 62, 42, 73, 31, 56, 22, 47, 66, 29, 51, 36, 69, 27, 44, 58, 30, 49];

export function AudioStage({ project, onProject, notify, onStage }: StageProps) {
  const navigate = useNavigate();
  const { data } = useApp();
  const [activeId, setActiveId] = useState(
    project.recordings.find((asset) => asset.kind === 'tts')?.id ??
      project.recordings[0]?.id ??
      ''
  );
  const [transcript, setTranscript] = useState('');
  const [ttsLoading, setTtsLoading] = useState(false);
  const [savingTranscript, setSavingTranscript] = useState(false);
  const [entering, setEntering] = useState(false);
  const [trialOpen, setTrialOpen] = useState(false);

  const activeAsset =
    project.recordings.find((asset) => asset.id === activeId) ?? project.recordings[0];
  const hasSpeechRecognition = Boolean(getSpeechRecognition());
  const trialTake = project.recordings.find(
    (asset) => asset.kind === 'teacher' && (asset.slideEvents?.length ?? 0) > 0
  );
  const trialPageCount = trialTake?.slideEvents?.length ?? 0;

  useEffect(() => {
    setTranscript(activeAsset?.transcript ?? '');
  }, [activeAsset?.id, activeAsset?.transcript]);

  const generateTts = async () => {
    if (!project.script?.confirmed) {
      notify('请先确认讲稿，再生成 AI 旁白', 'error');
      return;
    }
    setTtsLoading(true);
    try {
      const next = await api.projectAction(project.id, 'generate-tts');
      onProject(next);
      const asset = next.recordings.find((item) => item.kind === 'tts');
      if (asset) setActiveId(asset.id);
      notify(asset ? `${asset.name} 已生成` : '旁白已生成');
    } catch (error) {
      notify(error instanceof Error ? error.message : '旁白生成失败', 'error');
    } finally {
      setTtsLoading(false);
    }
  };

  const saveTranscript = async () => {
    if (!activeAsset) return null;
    if (!transcript.trim()) {
      notify('请先输入或录制口述转写', 'error');
      return null;
    }
    setSavingTranscript(true);
    try {
      const result = await api.updateTranscript(project.id, activeAsset.id, transcript);
      onProject(result.project);
      notify(`转写已保存，对齐度 ${result.asset.alignment}%`);
      return result.project;
    } catch (error) {
      notify(error instanceof Error ? error.message : '对齐失败', 'error');
      return null;
    } finally {
      setSavingTranscript(false);
    }
  };

  const enterRender = async () => {
    if (!project.recordings.length) {
      notify('请先生成旁白或保存一段教师试讲', 'error');
      return;
    }
    setEntering(true);
    try {
      const next = await api.projectAction(project.id, 'enter-render');
      onProject(next);
      notify('声音已就绪，进入成片交付');
      onStage('render');
    } catch (error) {
      notify(error instanceof Error ? error.message : '无法进入成片环节', 'error');
    } finally {
      setEntering(false);
    }
  };

  return (
    <div className="stage-page">
      <div className="stage-toolbar">
        <div className="stage-title">
          <span className="stage-icon">
            <AudioLines size={19} />
          </span>
          <div>
            <span className="eyebrow">VOICE & RECORDING / 03</span>
            <h2>声音与录制</h2>
            <p>生成 AI 旁白，或进入全屏试讲台边讲边翻页，翻页时刻会随录音一并保存。</p>
          </div>
        </div>
        <div className="stage-toolbar-actions">
          <div className="stage-action-pair">
            <Button
              variant="primary"
              size="sm"
              icon={<ArrowRight size={15} />}
              loading={entering}
              onClick={enterRender}
            >
              进入成片
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<WandSparkles size={15} />}
              onClick={() => navigate(`/projects/${project.id}/course`)}
            >
              编辑成片
            </Button>
          </div>
        </div>
      </div>

      {!project.script?.confirmed && (
        <div className="inline-notice is-warning">
          <Radio size={16} />
          <div>
            <strong>讲稿尚未确认</strong>
            <span>可以先采集试讲素材；正式生成课件和成片前需要返回讲稿工坊确认。</span>
          </div>
          <button onClick={() => onStage('script')}>返回讲稿</button>
        </div>
      )}

      <div className="audio-source-grid">
        <section className="audio-source tts-source">
          <div className="audio-source-head">
            <span className="audio-source-icon">
              <Sparkles size={19} />
            </span>
            <span className="source-number">01</span>
          </div>
          <h3>AI 旁白</h3>
          <p>按已确认讲稿逐段合成，中文语音、自然停顿，自动生成段落时间轴。</p>
          <div className="audio-source-meta">
            <span>{data?.settings.ttsVoice ?? 'zh-CN-XiaoxiaoNeural'}</span>
            <span>{data?.settings.ttsRate === 0 ? '常态语速' : `语速 ${data?.settings.ttsRate}%`}</span>
            <span className={data?.capabilities.tts ? 'is-online' : ''}>
              {data?.capabilities.tts ? '引擎在线' : '引擎离线'}
            </span>
          </div>
          <Button
            variant="dark"
            size="sm"
            icon={ttsLoading ? <LoaderCircle size={15} className="spin" /> : <Volume2 size={15} />}
            loading={ttsLoading}
            disabled={!data?.capabilities.tts || !project.script?.confirmed}
            onClick={generateTts}
          >
            {project.recordings.some((asset) => asset.kind === 'tts') ? '重新生成旁白' : '生成全部旁白'}
          </Button>
        </section>

        <section className="audio-source trial-source">
          <div className="audio-source-head">
            <span className="audio-source-icon">
              <Presentation size={19} />
            </span>
            <span className="source-number">02</span>
          </div>
          <h3>教师试讲</h3>
          <p>
            全屏进入试讲台：上方课件、下方讲稿，对着课件自然讲解并翻页，录音和翻页时刻同步记录。
          </p>
          <div className="audio-source-meta trial-source-meta">
            <span>{project.slides.length} 页课件</span>
            {data?.settings.recordTeacherVideo && <span>教师画面同步录制</span>}
            <span>
              {trialTake
                ? `上次试讲记录 ${trialPageCount} 页 · ${formatDuration(trialTake.durationSeconds)}`
                : '尚未试讲'}
            </span>
          </div>
          <Button
            variant="primary"
            size="sm"
            icon={<Mic size={15} />}
            disabled={!project.slides.length}
            onClick={() => setTrialOpen(true)}
          >
            {trialTake ? '重新试讲' : '进入试讲'}
          </Button>
          <div className="source-footnote">
            {project.slides.length ? (
              <>
                <Waves size={13} />
                结束时自动保存录音与翻页时间轴
              </>
            ) : (
              <>
                <Radio size={13} />
                请先在课件工坊生成课件页面
              </>
            )}
          </div>
        </section>
      </div>

      <div className="audio-workspace">
        <section className="audio-library">
          <div className="audio-section-head">
            <div>
              <span className="eyebrow">TAKES</span>
              <strong>声音素材</strong>
            </div>
            <span>{project.recordings.length} 条</span>
          </div>
          <div className="take-list">
            {project.recordings.map((asset) => {
              const Icon = kindIcon[asset.kind];
              const pages = asset.slideEvents?.length ?? 0;
              return (
                <button
                  key={asset.id}
                  className={asset.id === activeAsset?.id ? 'is-active' : ''}
                  onClick={() => setActiveId(asset.id)}
                >
                  <span className={`take-icon is-${asset.kind}`}>
                    <Icon size={15} />
                  </span>
                  <span className="take-copy">
                    <strong>{asset.name}</strong>
                    <small>
                      {kindLabel[asset.kind]}
                      {pages > 0 ? ` · ${pages} 页翻页记录` : ''} ·{' '}
                      {formatDuration(asset.durationSeconds)} · {formatDate(asset.createdAt)}
                    </small>
                  </span>
                  <span className="take-state">
                    {asset.alignment > 0 ? `${asset.alignment}%` : '未对齐'}
                  </span>
                </button>
              );
            })}
            {!project.recordings.length && (
              <div className="take-empty">
                <AudioLines size={20} />
                <span>还没有声音素材</span>
                <small>先生成 AI 旁白，或进入试讲台录一段。</small>
              </div>
            )}
          </div>
        </section>

        <section className="audio-player-panel">
          {activeAsset ? (
            <>
              <div className="audio-player-head">
                <div>
                  <span className="eyebrow">{kindLabel[activeAsset.kind]}</span>
                  <h3>{activeAsset.name}</h3>
                  <p>
                    {formatDuration(activeAsset.durationSeconds)} · {activeAsset.source ?? 'local'} ·{' '}
                    {activeAsset.sizeBytes
                      ? `${(activeAsset.sizeBytes / 1024 / 1024).toFixed(1)} MB`
                      : '本地素材'}
                  </p>
                </div>
                <span className={`alignment-badge ${activeAsset.alignment >= 80 ? 'is-high' : ''}`}>
                  {activeAsset.alignment > 0 ? `${activeAsset.alignment}% 对齐` : '尚未对齐'}
                </span>
              </div>
              {activeAsset.audioUrl ? (
                <div className="audio-player">
                  <audio controls preload="metadata" src={activeAsset.audioUrl} />
                  <div className="audio-waveform" aria-hidden="true">
                    {waveform.map((height, index) => (
                      <span
                        key={index}
                        className={index < waveform.length * 0.36 ? 'is-played' : ''}
                        style={{ height: `${height}%` }}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="audio-missing-file">
                  <FileAudio size={19} />
                  <div>
                    <strong>示例素材没有本地音频文件</strong>
                    <span>可重新生成旁白或录制新素材，渲染时会使用真实音频。</span>
                  </div>
                </div>
              )}
              <div className="transcript-editor">
                <div className="transcript-editor-head">
                  <div>
                    <span>口述转写与段落定位</span>
                    <small>
                      {activeAsset.kind === 'tts'
                        ? 'AI 旁白按已确认讲稿生成，无需转写'
                        : hasSpeechRecognition
                          ? '试讲时自动转写；可修改后重新对齐'
                          : '手动粘贴或输入转写，再执行段落对齐'}
                    </small>
                  </div>
                  {activeAsset.kind !== 'tts' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Waves size={15} />}
                      loading={savingTranscript}
                      onClick={() => void saveTranscript()}
                    >
                      保存并对齐
                    </Button>
                  )}
                </div>
                <textarea
                  rows={7}
                  value={transcript}
                  readOnly={activeAsset.kind === 'tts'}
                  onChange={(event) => setTranscript(event.target.value)}
                  placeholder="教师口述转写会出现在这里。"
                />
              </div>
            </>
          ) : (
            <div className="player-empty">
              <Play size={24} />
              <h3>选择或创建一段声音素材</h3>
              <p>旁白与试讲录音都会在这里显示时间、对齐度和可编辑转写。</p>
            </div>
          )}
        </section>
      </div>

      {activeAsset?.segments?.length ? (
        <section className="segment-timeline">
          <div className="audio-section-head">
            <div>
              <span className="eyebrow">ALIGNMENT MAP</span>
              <strong>段落定位</strong>
            </div>
            <span>语义对齐 · 可人工复核</span>
          </div>
          <div className="segment-row">
            {activeAsset.segments.map((segment, index) => {
              const section = project.script?.sections.find((item) => item.id === segment.sectionId);
              return (
                <div className="segment-item" key={segment.sectionId}>
                  <span className="segment-index">{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{section?.title ?? segment.sectionId}</strong>
                    <span>
                      {formatDuration(segment.startSeconds)} – {formatDuration(segment.endSeconds)}
                    </span>
                  </div>
                  <span
                    className="segment-width"
                    style={{
                      width: `${Math.max(
                        18,
                        Math.min(100, ((segment.endSeconds - segment.startSeconds) / Math.max(activeAsset.durationSeconds, 1)) * 100)
                      )}%`
                    }}
                  />
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="stage-actionbar">
        <div className="actionbar-status">
          <span className={project.recordings.length ? 'is-ready' : 'is-draft'}>
            {project.recordings.length ? <Check size={13} /> : <AudioLines size={13} />}
            {project.recordings.length ? `${project.recordings.length} 条声音素材` : '等待声音素材'}
          </span>
          <small>点击进入成片后，可试听、检查时间轴并渲染 1080p 视频。</small>
        </div>
        <div className="stage-actionbar-buttons">
          <Button
            variant="secondary"
            icon={<Pause size={16} />}
            disabled={!activeAsset?.audioUrl}
            onClick={() => {
              const audio = document.querySelector<HTMLAudioElement>('.audio-player audio');
              if (!audio) return;
              if (audio.paused) void audio.play();
              else audio.pause();
            }}
          >
            试听当前素材
          </Button>
          <div className="stage-action-pair">
            <Button
              variant="primary"
              icon={<ArrowRight size={16} />}
              loading={entering}
              onClick={enterRender}
            >
              进入成片
            </Button>
            <Button
              variant="secondary"
              icon={<WandSparkles size={16} />}
              onClick={() => navigate(`/projects/${project.id}/course`)}
            >
              编辑成片
            </Button>
          </div>
        </div>
      </div>

      {trialOpen && (
        <TeacherTrialOverlay
          project={project}
          notify={notify}
          onClose={() => setTrialOpen(false)}
          onSaved={(next) => {
            onProject(next);
            const trial = next.recordings.find((asset) => asset.kind === 'teacher');
            if (trial) setActiveId(trial.id);
          }}
        />
      )}
    </div>
  );
}
