import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  AudioLines,
  Brain,
  Check,
  Layers3,
  LoaderCircle,
  Mic2,
  RefreshCw,
  Sparkles,
  Square,
  WandSparkles
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import { insecureCaptureMessage, isSecureCaptureContext } from '../lib/secureCapture';
import type { CourseMode, CreateProjectInput, TeacherMemory } from '../types';
import { Button, Modal } from './ui';

const modeOptions: Array<{
  id: CourseMode;
  title: string;
  description: string;
  icon: typeof WandSparkles;
}> = [
  {
    id: 'auto',
    title: '全自动生成',
    description: '主题进入，讲稿、课件、语音与成片连续完成。',
    icon: WandSparkles
  },
  {
    id: 'oral',
    title: '口语稿驱动',
    description: '教师先讲，系统按语音定位生成对应课件。',
    icon: AudioLines
  },
  {
    id: 'ppt',
    title: 'PPT 驱动',
    description: '先确认课件，再对照页面录制声音与画面。',
    icon: Layers3
  }
];

interface SpeechAlternative {
  transcript: string;
}

interface SpeechResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechAlternative;
}

interface SpeechResultList {
  readonly length: number;
  [index: number]: SpeechResult;
}

interface SpeechEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechResultList;
}

interface SpeechRecognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
}

type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognizer;
  webkitSpeechRecognition?: new () => SpeechRecognizer;
};

type BriefPhase = 'idle' | 'recording' | 'analyzing' | 'done';

const getSpeechConstructor = () => {
  const target = window as SpeechWindow;
  return target.SpeechRecognition ?? target.webkitSpeechRecognition;
};

const emptyForm: CreateProjectInput = {
  title: '',
  topic: '',
  subject: '',
  grade: '',
  durationMinutes: 8,
  mode: 'auto',
  idea: '',
  valueGuide: '',
  learnerProfile: '',
  style: '清晰、口语化、问题驱动'
};

const buildInitialForm = (memory: TeacherMemory | undefined): CreateProjectInput => ({
  ...emptyForm,
  subject: memory?.subject ?? '',
  grade: memory?.grade ?? '',
  style: memory?.teachingStyle || emptyForm.style
});

const formatClock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

export function CreateProjectModal() {
  const {
    data,
    createProjectOpen,
    setCreateProjectOpen,
    createMode,
    refresh,
    showToast
  } = useApp();
  const memory = data?.memory;
  const [form, setForm] = useState<CreateProjectInput>(() => buildInitialForm(memory));
  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<BriefPhase>('idle');
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [analysis, setAnalysis] = useState<{
    source: 'model' | 'local-fallback';
    engineName?: string;
    warnings: string[];
  } | null>(null);
  const [analyzedFields, setAnalyzedFields] = useState<string[]>([]);
  const [speechSupported, setSpeechSupported] = useState(true);

  const recognizerRef = useRef<SpeechRecognizer | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const transcriptRef = useRef('');
  const finalRef = useRef('');
  const endingRef = useRef(false);
  const analyzeRef = useRef<(text: string) => Promise<void>>(async () => {});

  const navigate = useNavigate();

  useEffect(() => {
    setSpeechSupported(Boolean(getSpeechConstructor()));
  }, []);

  const clearCapture = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    try {
      recorderRef.current?.stop();
    } catch {
      // Recorder may already be stopped.
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const resetCapture = () => {
    endingRef.current = true;
    try {
      recognizerRef.current?.abort?.();
      recognizerRef.current?.stop();
    } catch {
      // Recognition may already be closed.
    }
    recognizerRef.current = null;
    clearCapture();
    finalRef.current = '';
    transcriptRef.current = '';
    setTranscript('');
    setInterim('');
    setElapsed(0);
    setPhase('idle');
  };

  useEffect(() => {
    if (!createProjectOpen) {
      endingRef.current = true;
      try {
        recognizerRef.current?.abort?.();
        recognizerRef.current?.stop();
      } catch {
        // Ignore closed recognizers.
      }
      recognizerRef.current = null;
      clearCapture();
      finalRef.current = '';
      transcriptRef.current = '';
      setTranscript('');
      setInterim('');
      setElapsed(0);
      setPhase('idle');
      setAnalysis(null);
      setAnalyzedFields([]);
      setStep(1);
      setForm(buildInitialForm(memory));
    } else {
      setForm({ ...buildInitialForm(memory), mode: createMode });
    }
  }, [createProjectOpen, createMode, memory?.updatedAt]);

  useEffect(() => {
    return () => {
      endingRef.current = true;
      try {
        recognizerRef.current?.abort?.();
        recognizerRef.current?.stop();
      } catch {
        // Ignore closed recognizers.
      }
      clearCapture();
    };
  }, []);

  const set = <K extends keyof CreateProjectInput>(key: K, value: CreateProjectInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const analyze = async (text: string) => {
    const content = text.trim();
    if (content.length < 8) {
      setPhase('idle');
      showToast('还没有识别到足够的课程信息，可以改用下方文字输入', 'error');
      return;
    }
    setPhase('analyzing');
    try {
      const result = await api.analyzeBrief({
        transcript: content,
        current: { ...form }
      });
      setForm((current) => ({ ...current, ...result.draft }));
      setAnalysis({
        source: result.source,
        engineName: result.engineName,
        warnings: result.warnings
      });
      setAnalyzedFields(result.fields ?? []);
      setPhase('done');
      setStep(2);
      showToast(
        result.source === 'model'
          ? '智能体已完成课程简报，请确认信息'
          : '已用本地规则整理，请逐项核对'
      );
    } catch (error) {
      setPhase('idle');
      showToast(error instanceof Error ? error.message : '课程简报整理失败', 'error');
    }
  };
  analyzeRef.current = analyze;

  const finishFromRecognition = () => {
    const text = (finalRef.current + interim).trim() || transcriptRef.current.trim();
    clearCapture();
    setInterim('');
    if (text.length < 8) {
      setPhase('idle');
      showToast('没有识别到内容，可以检查麦克风或直接输入文字', 'error');
      return;
    }
    transcriptRef.current = text;
    setTranscript(text);
    void analyzeRef.current(text);
  };

  const startRecording = async () => {
    if (phase === 'analyzing') return;
    resetCapture();
    endingRef.current = false;
    setAnalysis(null);
    setPhase('recording');
    setElapsed(0);

    timerRef.current = window.setInterval(() => {
      setElapsed((current) => current + 1);
    }, 1000);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.start();
    } catch {
      // Speech recognition can still work without MediaRecorder.
      if (!isSecureCaptureContext()) {
        showToast(
          '麦克风未能启动。若浏览器权限已允许仍无效，可改用 HTTPS 地址；' +
            insecureCaptureMessage(),
          'error'
        );
      }
    }

    const Recognizer = getSpeechConstructor();
    if (!Recognizer) {
      setSpeechSupported(false);
      showToast('当前浏览器不支持语音转写，请直接输入文字后让智能体整理', 'error');
      return;
    }

    const recognizer = new Recognizer();
    recognizer.lang = 'zh-CN';
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.maxAlternatives = 1;
    recognizer.onresult = (event) => {
      let interimText = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result?.[0]?.transcript ?? '';
        if (result?.isFinal) {
          finalRef.current = `${finalRef.current}${text}`.replace(/\s+/g, ' ').trim();
        } else {
          interimText += text;
        }
      }
      setInterim(interimText);
      const merged = `${finalRef.current}${interimText ? ` ${interimText}` : ''}`.trim();
      transcriptRef.current = merged;
      setTranscript(finalRef.current);
    };
    recognizer.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        showToast('麦克风或语音识别权限未开启', 'error');
      }
    };
    recognizer.onend = () => {
      if (endingRef.current) return;
      finishFromRecognition();
    };
    recognizerRef.current = recognizer;
    try {
      recognizer.start();
    } catch {
      setPhase('idle');
      showToast('无法启动语音识别，请直接输入文字', 'error');
    }
  };

  const stopRecording = () => {
    const text = `${finalRef.current}${interim ? ` ${interim}` : ''}`.trim();
    endingRef.current = true;
    try {
      recognizerRef.current?.abort?.();
      recognizerRef.current?.stop();
    } catch {
      // Recognition may already be closed.
    }
    recognizerRef.current = null;
    clearCapture();
    setInterim('');
    const merged = text || transcriptRef.current.trim();
    if (merged.length < 8) {
      setPhase('idle');
      showToast('没有识别到内容，可以检查麦克风或直接输入文字', 'error');
      return;
    }
    transcriptRef.current = merged;
    setTranscript(merged);
    void analyze(merged);
  };

  const build = async () => {
    if (!form.topic.trim()) {
      showToast('请先填写课程主题', 'error');
      setStep(1);
      return;
    }
    setSubmitting(true);
    try {
      const project = await api.createProject({
        ...form,
        title: form.title || form.topic,
        durationMinutes: Number(form.durationMinutes)
      });
      await refresh();
      setCreateProjectOpen(false);
      showToast(
        analysis?.source === 'model' ? '课程已按确认的简报建立' : '课程项目已建立'
      );
      navigate(`/projects/${project.id}`, {
        state: { freshProject: true }
      });
    } catch (error) {
      showToast(error instanceof Error ? error.message : '创建失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const fieldLabel = (label: string, key: string) => (
    <span>
      {label}
      {analyzedFields.includes(key) && <em className="field-source">智能体</em>}
    </span>
  );

  const manualAnalyze = () => {
    const text = (transcript || `${finalRef.current}${interim}`).trim();
    if (!text && !form.topic.trim()) {
      showToast('请先输入一段课程设想，或写下课程主题', 'error');
      return;
    }
    if (!text) {
      setTranscript('');
      transcriptRef.current = '';
    }
    setTranscript(text);
    transcriptRef.current = text;
    void analyze(text);
  };

  return (
    <Modal
      open={createProjectOpen}
      onClose={() => setCreateProjectOpen(false)}
      title="新建微课"
      description={
        step === 1
          ? '可以口述课程设想，让智能体整理；也可以直接填写主题。'
          : '请确认智能体整理的信息，修改后建立课程。'
      }
      wide
    >
      <div className="wizard-steps">
        <span className={step === 1 ? 'is-active' : 'is-done'}>01 · 口述与模式</span>
        <span className={step === 2 ? 'is-active' : ''}>02 · 确认教学意图</span>
      </div>

      {step === 1 ? (
        <div className="create-step">
          <section className="voice-brief">
            <div className="voice-brief-head">
              <div className="voice-brief-title">
                <span className="voice-brief-icon">
                  <Mic2 size={17} />
                </span>
                <div>
                  <strong>口述课程设想</strong>
                  <small>说完后自动整理主题、学情与价值引领；原始录音不保存</small>
                </div>
              </div>
              {memory && (
                <span className="voice-memory-chip" title="智能体会读取教师记忆">
                  <Brain size={13} />
                  {memory.name} · {memory.grade}
                  {memory.subject}
                </span>
              )}
            </div>

            <div className={`voice-recorder is-${phase}`}>
              <button
                type="button"
                className="voice-record-button"
                onClick={phase === 'recording' ? stopRecording : startRecording}
                disabled={phase === 'analyzing'}
              >
                {phase === 'recording' ? <Square size={18} /> : <Mic2 size={18} />}
                <span>
                  {phase === 'recording'
                    ? '停止并整理'
                    : phase === 'analyzing'
                      ? '智能体整理中'
                      : phase === 'done'
                        ? '重新录音'
                        : '开始录音'}
                </span>
              </button>

              <div className={`voice-wave ${phase === 'recording' ? 'is-live' : ''}`}>
                {Array.from({ length: 18 }).map((_, index) => (
                  <span key={index} style={{ animationDelay: `${index * 70}ms` }} />
                ))}
              </div>

              <span className="voice-timer">
                {phase === 'recording' && <span className="record-dot" />}
                {formatClock(elapsed)}
              </span>
            </div>

            <label className="voice-transcript">
              <span>
                转写内容
                <small>
                  {phase === 'recording'
                    ? '正在聆听，可以直接修改识别文字'
                    : '识别不准时可以直接编辑，再交给智能体整理'}
                </small>
              </span>
              <textarea
                rows={4}
                value={interim ? `${transcript}${transcript ? ' ' : ''}${interim}` : transcript}
                onChange={(event) => {
                  setTranscript(event.target.value);
                  transcriptRef.current = event.target.value;
                }}
                placeholder="例如：我想给八年级学生讲杠杆原理，从搬石头开始，先让他们找支点，再发现力臂……"
              />
            </label>

            <div className="voice-brief-foot">
              <span>
                {speechSupported ? (
                  <>
                    <AudioLines size={14} />
                    浏览器语音识别 · 说完自动分析
                  </>
                ) : (
                  '当前浏览器不支持语音识别，请直接输入文字'
                )}
              </span>
              <Button
                variant="secondary"
                size="sm"
                icon={
                  phase === 'analyzing' ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    <Sparkles size={15} />
                  )
                }
                loading={phase === 'analyzing'}
                disabled={(!transcript.trim() && !form.topic.trim()) || phase === 'recording'}
                onClick={manualAnalyze}
              >
                智能体分析并填写字段
              </Button>
            </div>

            {analysis && (
              <div className={`brief-analysis-note ${analysis.warnings.length ? 'has-warning' : ''}`}>
                <Check size={15} />
                <div>
                  <strong>
                    {analysis.source === 'model' ? '智能体已整理' : '本地规则已整理'}
                  </strong>
                  <span>
                    {analysis.engineName || '析课引擎'} · 信息已填入第二步，请确认
                  </span>
                  {analysis.warnings.map((warning) => (
                    <small key={warning}>{warning}</small>
                  ))}
                </div>
                <button type="button" onClick={() => setStep(2)}>
                  查看结果 <ArrowRight size={13} />
                </button>
              </div>
            )}
          </section>

          <div className="mode-choice-grid">
            {modeOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  type="button"
                  key={option.id}
                  className={`mode-choice ${form.mode === option.id ? 'is-selected' : ''}`}
                  onClick={() => set('mode', option.id)}
                >
                  <span className={`mode-choice-icon tone-${option.id}`}>
                    <Icon size={20} />
                  </span>
                  <strong>{option.title}</strong>
                  <span>{option.description}</span>
                  <span className="mode-choice-check" />
                </button>
              );
            })}
          </div>
          <div className="form-grid two">
            <label className="field">
              <span>课程主题</span>
              <input
                value={form.topic}
                onChange={(event) => set('topic', event.target.value)}
                placeholder="例如：杠杆原理"
                autoFocus
              />
            </label>
            <label className="field">
              <span>课程名称</span>
              <input
                value={form.title}
                onChange={(event) => set('title', event.target.value)}
                placeholder="可不填，默认使用主题"
              />
            </label>
          </div>
          <div className="modal-actions">
            <Button variant="ghost" onClick={() => setCreateProjectOpen(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!analysis) {
                  showToast('先让智能体分析一次，再确认教学意图', 'error');
                  manualAnalyze();
                  return;
                }
                setStep(2);
              }}
              icon={<ArrowRight size={16} />}
            >
              {analysis ? '查看智能体结果' : '先分析再继续'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="create-step">
          {analysis && (
            <div className={`brief-analysis-note ${analysis.warnings.length ? 'has-warning' : ''}`}>
              <Sparkles size={15} />
              <div>
                <strong>来自口述的课程简报</strong>
                <span>
                  {analysis.engineName || '析课引擎'} ·{' '}
                  {analysis.source === 'model' ? '模型整理' : '本地规则兜底'} ·
                  以下信息可以逐项修改
                </span>
                {analysis.warnings.map((warning) => (
                  <small key={warning}>{warning}</small>
                ))}
              </div>
              <button type="button" onClick={() => setStep(1)}>
                <RefreshCw size={13} /> 返回录音
              </button>
            </div>
          )}

          <div className="form-grid two">
            <label className="field">
              {fieldLabel('课程主题', 'topic')}
              <input value={form.topic} onChange={(event) => set('topic', event.target.value)} />
            </label>
            <label className="field">
              {fieldLabel('课程名称', 'title')}
              <input
                value={form.title}
                onChange={(event) => set('title', event.target.value)}
                placeholder="默认使用主题"
              />
            </label>
          </div>
          <div className="form-grid three">
            <label className="field">
              {fieldLabel('学科', 'subject')}
              <input
                value={form.subject}
                onChange={(event) => set('subject', event.target.value)}
                placeholder="物理"
              />
            </label>
            <label className="field">
              {fieldLabel('学段', 'grade')}
              <input
                value={form.grade}
                onChange={(event) => set('grade', event.target.value)}
                placeholder="八年级"
              />
            </label>
            <label className="field">
              <span>目标时长</span>
              <div className="input-with-suffix">
                <input
                  type="number"
                  min={3}
                  max={45}
                  value={form.durationMinutes}
                  onChange={(event) =>
                    set('durationMinutes', Number(event.target.value) || 8)
                  }
                />
                <span>分钟</span>
              </div>
            </label>
          </div>
          <label className="field">
            {fieldLabel('想法草稿', 'idea')}
            <textarea
              rows={4}
              value={form.idea}
              onChange={(event) => set('idea', event.target.value)}
              placeholder="例如：从搬石头进入，让学生先找支点，再画出力臂……"
            />
          </label>
          <div className="form-grid two">
            <label className="field">
              {fieldLabel('价值引领', 'valueGuide')}
              <textarea
                rows={3}
                value={form.valueGuide}
                onChange={(event) => set('valueGuide', event.target.value)}
                placeholder="希望学生在知识之外获得什么？"
              />
            </label>
            <label className="field">
              {fieldLabel('学情', 'learnerProfile')}
              <textarea
                rows={3}
                value={form.learnerProfile}
                onChange={(event) => set('learnerProfile', event.target.value)}
                placeholder="学生已经会什么，容易卡在哪里？"
              />
            </label>
          </div>
          <label className="field">
            <span>讲述风格</span>
            <input value={form.style} onChange={(event) => set('style', event.target.value)} />
          </label>
          <div className="modal-actions">
            <Button variant="ghost" onClick={() => setStep(1)}>
              上一步
            </Button>
            <Button variant="primary" onClick={build} loading={submitting}>
              确认并建立课程
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
