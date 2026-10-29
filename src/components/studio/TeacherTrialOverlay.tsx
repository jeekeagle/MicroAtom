import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LoaderCircle,
  Mic,
  MonitorPlay,
  Play,
  Square,
  Video,
  VideoOff,
  X
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { api } from '../../lib/api';
import { formatDuration, sectionRoleLabel } from '../../lib/format';
import { insecureCaptureMessage, isSecureCaptureContext } from '../../lib/secureCapture';
import type {
  CourseProject,
  CourseSlide,
  ScriptSection,
  SlideVisitEvent,
  TranscriptSegment
} from '../../types';
import { SlideCanvas } from '../SlideCanvas';
import { Button } from '../ui';

interface SpeechResultEventLike {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const getSpeechRecognition = () => {
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
};

const stopRecorderSafely = (recorder: MediaRecorder | null) => {
  if (!recorder || recorder.state === 'inactive') return;
  try {
    recorder.stop();
  } catch {
    // The recorder may already be stopping; nothing else to clean up.
  }
};

const readAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('无法读取录制数据'));
    reader.readAsDataURL(blob);
  });

const clock = (milliseconds: number) => {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

export function TeacherTrialOverlay({
  project,
  onClose,
  onSaved,
  notify
}: {
  project: CourseProject;
  onClose: () => void;
  onSaved: (project: CourseProject) => void;
  notify: (message: string, tone?: 'success' | 'error' | 'info') => void;
}) {
  const { data } = useApp();
  const recordTeacherVideo = Boolean(data?.settings?.recordTeacherVideo);
  const slides = useMemo(
    () => [...project.slides].sort((a, b) => a.order - b.order),
    [project.slides]
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [phase, setPhase] = useState<'ready' | 'recording' | 'saving'>('ready');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [slideEvents, setSlideEvents] = useState<SlideVisitEvent[]>([]);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraSignal, setCameraSignal] = useState<'idle' | 'live' | 'blank'>('idle');

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraRecorderRef = useRef<MediaRecorder | null>(null);
  const cameraChunksRef = useRef<Blob[]>([]);
  const cameraPreviewRef = useRef<HTMLVideoElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const liveTranscriptRef = useRef('');
  const transcriptSegmentsRef = useRef<TranscriptSegment[]>([]);
  const slideEventsRef = useRef<SlideVisitEvent[]>([]);
  const scriptBodyRef = useRef<HTMLDivElement | null>(null);
  const scriptContentRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(true);
  const recognitionWantedRef = useRef(false);
  const recognitionRestartRef = useRef<number | null>(null);
  const recognitionFailuresRef = useRef(0);
  const asrWantedRef = useRef(false);
  const chunkRecorderRef = useRef<MediaRecorder | null>(null);
  const chunkTimerRef = useRef<number | null>(null);
  const asrQueueRef = useRef<Blob[]>([]);
  const asrBusyRef = useRef(false);

  const currentSlide = slides[Math.min(selectedIndex, Math.max(0, slides.length - 1))];
  const currentSections = useMemo(() => {
    if (!currentSlide) return [] as ScriptSection[];
    return (project.script?.sections ?? []).filter(
      (section) => section.id === currentSlide.sectionId
    );
  }, [currentSlide, project.script?.sections]);
  const asrEngine = data?.settings?.asrEngine ?? 'browser';
  const mimoAsrEnabled = asrEngine === 'mimo';
  const hasRecognizer = mimoAsrEnabled || Boolean(getSpeechRecognition());

  const scriptLines = useMemo(() => {
    if (currentSections.length) {
      return currentSections
        .map((section) => section.narration.trim())
        .filter((line) => line.length > 0);
    }
    const fallback = currentSlide?.note?.trim();
    return fallback ? [fallback] : ['按这一页的要点自然讲述即可。'];
  }, [currentSections, currentSlide?.note]);

  const scriptValueNote = useMemo(() => {
    const notes = currentSections
      .map((section) => section.valueNote?.trim())
      .filter((note): note is string => Boolean(note));
    return notes.length ? notes.join('；') : '';
  }, [currentSections]);

  // Only surface the most recent speech so the strip never grows unbounded.
  const displayTranscript = useMemo(() => {
    const full = (liveTranscript + interimTranscript).trim();
    if (full.length <= 260) return full;
    return full.slice(-260);
  }, [liveTranscript, interimTranscript]);

  const fitScript = useCallback(() => {
    const body = scriptBodyRef.current;
    const content = scriptContentRef.current;
    if (!body || !content) return;
    const style = window.getComputedStyle(body);
    const available =
      body.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    if (available <= 0) return;
    let size = 36;
    content.style.fontSize = `${size}px`;
    let guard = 0;
    while (content.scrollHeight > available && size > 16 && guard < 60) {
      size -= 1;
      content.style.fontSize = `${size}px`;
      guard += 1;
    }
  }, []);

  useEffect(() => {
    if (cameraSignal !== 'blank') return;
    setNotice(
      '摄像头已打开但没有画面：通常是被其他程序占用，或系统隐私设置没有放开。关闭占用程序后再试一次。'
    );
  }, [cameraSignal]);

  useEffect(() => {
    if (!recordTeacherVideo) return;
    let cancelled = false;
    const openCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setNotice(
          isSecureCaptureContext()
            ? '当前浏览器不支持摄像头采集，本次试讲只录制声音。'
            : insecureCaptureMessage()
        );
        return;
      }
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 360 },
            frameRate: { ideal: 24 }
          },
          audio: false
        });
        if (cancelled) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        const track = media.getVideoTracks()[0];
        cameraStreamRef.current = media;
        setCameraStream(media);
        setCameraActive(true);
        setCameraSignal(track && track.muted ? 'blank' : 'live');
        track?.addEventListener('ended', () => setCameraSignal('blank'));
      } catch {
        setNotice('没有检测到可用摄像头，本次试讲只录制声音。');
      }
    };
    void openCamera();
    return () => {
      cancelled = true;
      stopRecorderSafely(cameraRecorderRef.current);
      cameraRecorderRef.current = null;
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    };
  }, [recordTeacherVideo]);

  useEffect(() => {
    const preview = cameraPreviewRef.current;
    if (!preview || !cameraStream) return;
    preview.srcObject = cameraStream;
    const play = () => {
      void preview.play().catch(() => undefined);
    };
    preview.addEventListener('loadedmetadata', play);
    play();
    // A camera that is open but never delivers frames shows up as a black
    // window; detect it so the teacher knows what to check.
    const watchdog = window.setTimeout(() => {
      if (!preview.videoWidth) setCameraSignal('blank');
    }, 2500);
    return () => {
      window.clearTimeout(watchdog);
      preview.removeEventListener('loadedmetadata', play);
    };
  }, [cameraStream, cameraActive]);

  const disableCamera = () => {
    stopRecorderSafely(cameraRecorderRef.current);
    cameraRecorderRef.current = null;
    cameraChunksRef.current = [];
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraStream(null);
    setCameraActive(false);
    setCameraSignal('idle');
    setNotice('已关闭教师画面，本次试讲只保存声音。');
  };

  useLayoutEffect(() => {
    fitScript();
    const body = scriptBodyRef.current;
    if (!body || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => fitScript());
    observer.observe(body);
    return () => observer.disconnect();
  }, [fitScript, selectedIndex, currentSlide?.id]);

  useEffect(() => {
    mountedRef.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      mountedRef.current = false;
      document.body.style.overflow = previousOverflow;
      if (timerRef.current) window.clearInterval(timerRef.current);
      recognitionWantedRef.current = false;
      if (recognitionRestartRef.current) {
        window.clearTimeout(recognitionRestartRef.current);
        recognitionRestartRef.current = null;
      }
      try {
        recognitionRef.current?.stop();
      } catch {
        // Recognition may already be stopped.
      }
      asrWantedRef.current = false;
      if (chunkTimerRef.current) {
        window.clearTimeout(chunkTimerRef.current);
        chunkTimerRef.current = null;
      }
      try {
        chunkRecorderRef.current?.stop();
      } catch {
        // Chunk recorder may already be stopped.
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);


  useEffect(() => {
    if (phase !== 'recording') return;
    timerRef.current = window.setInterval(() => {
      setElapsedMs(Math.max(0, performance.now() - startedAtRef.current));
    }, 200);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [phase]);

  const goTo = (nextIndex: number) => {
    const target = Math.max(0, Math.min(slides.length - 1, nextIndex));
    if (target === selectedIndex || !slides[target]) return;
    setSelectedIndex(target);
    if (phase !== 'recording') return;
    const atSeconds = Number(
      Math.max(0, (performance.now() - startedAtRef.current) / 1000).toFixed(2)
    );
    const event: SlideVisitEvent = {
      slideId: slides[target].id,
      slideOrder: slides[target].order,
      atSeconds
    };
    slideEventsRef.current = [...slideEventsRef.current, event];
    setSlideEvents(slideEventsRef.current);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault();
        goTo(selectedIndex + 1);
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        goTo(selectedIndex - 1);
      } else if (event.key === ' ' && !(event.target as HTMLElement)?.closest('button')) {
        event.preventDefault();
        goTo(selectedIndex + 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const pumpAsrQueue = async () => {
    if (asrBusyRef.current) return;
    asrBusyRef.current = true;
    try {
      while (asrQueueRef.current.length) {
        const blob = asrQueueRef.current.shift();
        if (!blob || blob.size < 1200) continue;
        try {
          const result = await api.transcribeSpeech(blob);
          const text = (result.text || '').trim();
          if (!text) continue;
          const previous = transcriptSegmentsRef.current;
          const previousEnd = previous[previous.length - 1]?.endSeconds ?? 0;
          const elapsedSeconds = Math.max(
            0.2,
            (performance.now() - startedAtRef.current) / 1000
          );
          liveTranscriptRef.current = liveTranscriptRef.current + text;
          setLiveTranscript(liveTranscriptRef.current);
          transcriptSegmentsRef.current = [
            ...previous,
            {
              text,
              startSeconds: Number(previousEnd.toFixed(2)),
              endSeconds: Number(Math.max(previousEnd + 0.2, elapsedSeconds).toFixed(2))
            }
          ];
          if (mountedRef.current) {
            setNotice((current) => (current.startsWith('云端转写') ? '' : current));
          }
        } catch {
          if (mountedRef.current) {
            setNotice('云端转写暂时中断，录音会继续保存，结束后仍可手动校对。');
          }
        }
      }
    } finally {
      asrBusyRef.current = false;
    }
  };

  const queueAsrChunk = (blob: Blob) => {
    asrQueueRef.current.push(blob);
    void pumpAsrQueue();
  };

  const startMimoRecognition = (stream: MediaStream) => {
    asrWantedRef.current = true;
    const startChunk = () => {
      if (!asrWantedRef.current || !mountedRef.current) return;
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) =>
        MediaRecorder.isTypeSupported(type)
      );
      let chunkRecorder: MediaRecorder;
      try {
        chunkRecorder = mime
          ? new MediaRecorder(stream, { mimeType: mime })
          : new MediaRecorder(stream);
      } catch {
        if (mountedRef.current) {
          setNotice('云端转写未能启动，录音会继续保存。');
        }
        return;
      }
      const localChunks: Blob[] = [];
      chunkRecorder.ondataavailable = (event) => {
        if (event.data.size) localChunks.push(event.data);
      };
      chunkRecorder.onstop = () => {
        if (chunkRecorderRef.current === chunkRecorder) chunkRecorderRef.current = null;
        const blob = new Blob(localChunks, {
          type: chunkRecorder.mimeType || 'audio/webm'
        });
        if (blob.size > 1200) queueAsrChunk(blob);
        if (asrWantedRef.current && mountedRef.current) startChunk();
      };
      chunkRecorderRef.current = chunkRecorder;
      chunkRecorder.start();
      if (chunkTimerRef.current) window.clearTimeout(chunkTimerRef.current);
      chunkTimerRef.current = window.setTimeout(() => {
        chunkTimerRef.current = null;
        if (chunkRecorder.state !== 'inactive') stopRecorderSafely(chunkRecorder);
      }, 7000);
    };
    startChunk();
  };

  const stopMimoRecognition = () => {
    asrWantedRef.current = false;
    if (chunkTimerRef.current) {
      window.clearTimeout(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }
    const recorder = chunkRecorderRef.current;
    chunkRecorderRef.current = null;
    if (recorder && recorder.state !== 'inactive') stopRecorderSafely(recorder);
  };

  const waitForAsrQueue = async (timeoutMs = 12000) => {
    const started = performance.now();
    while (
      (asrBusyRef.current || asrQueueRef.current.length) &&
      performance.now() - started < timeoutMs
    ) {
      await new Promise((resolve) => window.setTimeout(resolve, 200));
    }
  };

  const beginRecognition = () => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition || !recognitionWantedRef.current || !mountedRef.current) return;
    if (recognitionRef.current) return;
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'zh-CN';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event) => {
        let finalText = '';
        let interim = '';
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          if (result.isFinal) finalText += result[0].transcript;
          else interim += result[0].transcript;
        }
        if (finalText) {
          liveTranscriptRef.current = liveTranscriptRef.current + finalText;
          setLiveTranscript(liveTranscriptRef.current);
          const elapsedSeconds = Math.max(
            0,
            (performance.now() - startedAtRef.current) / 1000
          );
          const previous = transcriptSegmentsRef.current;
          const previousEnd = previous[previous.length - 1]?.endSeconds ?? 0;
          transcriptSegmentsRef.current = [
            ...previous,
            {
              text: finalText.trim(),
              startSeconds: previousEnd,
              endSeconds: Math.max(previousEnd + 0.2, elapsedSeconds)
            }
          ];
        }
        setInterimTranscript(interim);
      };
      recognition.onstart = () => {
        recognitionFailuresRef.current = 0;
        if (mountedRef.current) {
          setNotice((current) => (current.startsWith('实时转写') ? '' : current));
        }
      };
      recognition.onerror = (event) => {
        const code = event?.error || '';
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          recognitionWantedRef.current = false;
          if (mountedRef.current) {
            setNotice('浏览器没有允许语音转写，录音与翻页记录仍会保存，之后可以手动校对转写。');
          }
          return;
        }
        recognitionFailuresRef.current += 1;
        if (mountedRef.current && recognitionWantedRef.current) {
          setNotice('实时转写短暂中断，正在自动续接，录音不会中断。');
        }
      };
      recognition.onend = () => {
        if (recognitionRef.current === recognition) recognitionRef.current = null;
        if (!recognitionWantedRef.current || !mountedRef.current) return;
        const delay = Math.min(2000, 250 * Math.max(1, recognitionFailuresRef.current));
        if (recognitionRestartRef.current) window.clearTimeout(recognitionRestartRef.current);
        recognitionRestartRef.current = window.setTimeout(() => {
          recognitionRestartRef.current = null;
          beginRecognition();
        }, delay);
      };
      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      recognitionRef.current = null;
      recognitionFailuresRef.current += 1;
      if (!recognitionWantedRef.current || !mountedRef.current) return;
      setNotice('实时转写暂时不可用，录音会继续，保存后可以手动校对转写。');
      if (recognitionRestartRef.current) window.clearTimeout(recognitionRestartRef.current);
      recognitionRestartRef.current = window.setTimeout(() => {
        recognitionRestartRef.current = null;
        beginRecognition();
      }, Math.min(3000, 400 * recognitionFailuresRef.current));
    }
  };

  const startTrial = async () => {
    if (!slides.length) return;
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError(
        isSecureCaptureContext()
          ? '当前浏览器不支持录音，请使用 Chrome 或 Edge 打开系统。'
          : insecureCaptureMessage()
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) =>
        MediaRecorder.isTypeSupported(type)
      );
      const recorder = preferred
        ? new MediaRecorder(stream, { mimeType: preferred })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      const cameraTrack = cameraStreamRef.current?.getVideoTracks()[0];
      if (cameraTrack) {
        const cameraMime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(
          (type) => MediaRecorder.isTypeSupported(type)
        );
        const cameraStream = new MediaStream([cameraTrack]);
        const cameraRecorder = cameraMime
          ? new MediaRecorder(cameraStream, {
              mimeType: cameraMime,
              videoBitsPerSecond: 900000
            })
          : new MediaRecorder(cameraStream);
        cameraChunksRef.current = [];
        cameraRecorder.ondataavailable = (event) => {
          if (event.data.size) cameraChunksRef.current.push(event.data);
        };
        cameraRecorderRef.current = cameraRecorder;
        cameraRecorder.start(1000);
      }
      transcriptSegmentsRef.current = [];
      liveTranscriptRef.current = '';
      slideEventsRef.current = [
        { slideId: slides[0].id, slideOrder: slides[0].order, atSeconds: 0 }
      ];
      setSlideEvents(slideEventsRef.current);
      setLiveTranscript('');
      setInterimTranscript('');
      setSelectedIndex(0);
      setElapsedMs(0);
      startedAtRef.current = performance.now();

      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        if (timerRef.current) window.clearInterval(timerRef.current);
        timerRef.current = null;
        const duration = Math.max(0, performance.now() - startedAtRef.current);
        setElapsedMs(duration);
        recognitionWantedRef.current = false;
        if (recognitionRestartRef.current) {
          window.clearTimeout(recognitionRestartRef.current);
          recognitionRestartRef.current = null;
        }
        const activeRecognition = recognitionRef.current;
        recognitionRef.current = null;
        try {
          activeRecognition?.stop();
        } catch {
          // Recognition may already be stopped.
        }
        if (mimoAsrEnabled) {
          stopMimoRecognition();
          await waitForAsrQueue(12000);
        }
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;

        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm'
        });
        if (blob.size < 100) {
          setPhase('ready');
          setError('录音内容为空，请检查麦克风权限后重试。');
          return;
        }

        const trialName = '教师试讲_' + new Date().toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit'
        }) + '.webm';
        if (!mountedRef.current) return;
        setPhase('saving');
        try {
          const audioUpload = await api.uploadRecordingMedia(
            project.id,
            'audio',
            blob,
            trialName,
            Number((duration / 1000).toFixed(2))
          );
          const audioFileName = 'asset' in audioUpload ? audioUpload.asset.fileName : '';
          let videoFileName: string | undefined;
          if (cameraChunksRef.current.length) {
            const cameraBlob = new Blob(cameraChunksRef.current, {
              type: cameraRecorderRef.current?.mimeType || 'video/webm'
            });
            if (cameraBlob.size >= 100) {
              const videoUpload = await api.uploadRecordingMedia(
                project.id,
                'video',
                cameraBlob,
                '教师画面_' + trialName,
                Number((duration / 1000).toFixed(2))
              );
              if ('video' in videoUpload) videoFileName = videoUpload.video.fileName;
            }
          }
          if (!audioFileName) throw new Error('录音文件上传失败，请重试。');
          const result = await api.uploadRecording(project.id, {
            audioFileName,
            videoFileName,
            name: trialName,
            kind: 'teacher',
            transcript: liveTranscriptRef.current.trim(),
            transcriptSegments: transcriptSegmentsRef.current,
            slideEvents: slideEventsRef.current,
            durationSeconds: Number((duration / 1000).toFixed(2))
          });
          onSaved(result.project);
          notify(
            '试讲已保存：记录 ' +
              slideEventsRef.current.length +
              ' 页翻页时间，画面会按真实讲述节奏合成'
          );
          onClose();
        } catch (uploadError) {
          if (!mountedRef.current) return;
          setPhase('ready');
          const message =
            uploadError instanceof Error ? uploadError.message : '试讲保存失败，请重试。';
          setError(
            uploadError instanceof TypeError
              ? '与本地服务连接中断，录制数据未能保存。请确认服务仍在运行后重新录制这一次。'
              : message
          );
        }

      };

      recorder.start(1000);
      setPhase('recording');
      if (mimoAsrEnabled) {
        startMimoRecognition(stream);
      } else {
        recognitionWantedRef.current = true;
        beginRecognition();
      }
    } catch (startError) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      const message =
        startError instanceof Error && startError.name === 'NotAllowedError'
          ? '麦克风权限被拒绝，请在浏览器设置中允许访问后重试。'
          : isSecureCaptureContext()
            ? '无法启动麦克风，请检查录音设备。'
            : insecureCaptureMessage();
      setError(message);
    }
  };

  const finishTrial = async () => {
    if (phase !== 'recording') return;
    setPhase('saving');
    const cameraRecorder = cameraRecorderRef.current;
    if (cameraRecorder && cameraRecorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        cameraRecorder.addEventListener('stop', () => resolve(), { once: true });
        stopRecorderSafely(cameraRecorder);
      });
    }
    cameraRecorderRef.current = null;
    recorderRef.current?.stop();
  };

  const closeOverlay = () => {
    if (phase === 'recording') {
      setError('正在录制。请点击“结束并保存”完成这次试讲。');
      return;
    }
    if (phase === 'saving') return;
    onClose();
  };

  if (!currentSlide) return null;

  return createPortal(
    <div className="trial-overlay" role="dialog" aria-modal="true" aria-label="教师试讲">
      <header className="trial-header">
        <div className="trial-brand">
          <span className="trial-brand-mark">
            <MonitorPlay size={19} />
          </span>
          <div>
            <span className="eyebrow">TEACHER REHEARSAL</span>
            <strong>{project.title}</strong>
          </div>
        </div>
        <div className={`trial-session ${phase === 'recording' ? 'is-live' : ''}`}>
          <span className="trial-session-dot" />
          <strong>
            {phase === 'recording' ? '录音中' : phase === 'saving' ? '正在保存' : '试讲准备'}
          </strong>
          <span className="trial-timer">{clock(elapsedMs)}</span>
        </div>
        <div className="trial-header-actions">
          {phase === 'recording' && (
            <span className="trial-event-count">已记录 {slideEvents.length} 页</span>
          )}
          <button
            className="trial-close"
            onClick={closeOverlay}
            aria-label="关闭试讲"
            title="关闭试讲"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="trial-main">
        <section className="trial-slide-zone">
          <div className="trial-slide-bar">
            <div className="trial-slide-meta">
              <span>
                SLIDE {String(selectedIndex + 1).padStart(2, '0')} /{' '}
                {String(slides.length).padStart(2, '0')}
              </span>
              <strong>{currentSlide.title}</strong>
            </div>
          </div>
          <div className="trial-stage-row">
            <div className="trial-slide-frame">
              <div className="trial-slide-canvas">
                <SlideCanvas slide={currentSlide} />
              </div>
              <div className="trial-slide-rail">
                <button
                  className="trial-rail-button"
                  onClick={() => goTo(selectedIndex - 1)}
                  disabled={selectedIndex <= 0}
                  aria-label="上一页"
                  title="上一页"
                >
                  <ChevronLeft size={30} />
                </button>
                <span className="trial-rail-count">
                  <strong>{selectedIndex + 1}</strong>
                  <em>/ {slides.length}</em>
                </span>
                <button
                  className="trial-rail-button"
                  onClick={() => goTo(selectedIndex + 1)}
                  disabled={selectedIndex >= slides.length - 1}
                  aria-label="下一页"
                  title="下一页"
                >
                  <ChevronRight size={30} />
                </button>
              </div>
            </div>
          </div>
          {cameraActive && (
            <div className="trial-camera">
              <video
                ref={cameraPreviewRef}
                className="trial-camera-video"
                autoPlay
                muted
                playsInline
              />
              {cameraSignal === 'blank' && (
                <div className="trial-camera-blank">
                  <VideoOff size={16} />
                  <span>摄像头没有画面</span>
                </div>
              )}
              <span className="trial-camera-badge">
                <span className="trial-camera-dot" />
                {phase === 'recording' ? '画面录制中' : '画面预览'}
              </span>
              <button
                className="trial-camera-off"
                onClick={disableCamera}
                aria-label="关闭教师画面"
                title="关闭教师画面"
              >
                <VideoOff size={14} />
              </button>
            </div>
          )}
        </section>

        <section className="trial-prompt-zone">
          <div className="trial-prompt-head">
            <div>
              <span className="eyebrow">
                SPEAKING SCRIPT · {currentSections[0] ? sectionRoleLabel[currentSections[0].role] : '正文'}
              </span>
              <strong>
                {currentSections.length
                  ? currentSections.map((section) => section.title).join(' · ')
                  : '本页讲述提示'}
              </strong>
            </div>
            <div className="trial-prompt-cues">
              <span>
                <Clock3 size={13} />
                {formatDuration(currentSlide.seconds)}
              </span>
              {currentSections[0]?.purpose && <span>{currentSections[0].purpose}</span>}
            </div>
          </div>
          <div className="trial-script-body" ref={scriptBodyRef}>
            <div className="trial-script-content" ref={scriptContentRef}>
              {scriptLines.map((line, index) => (
                <p className="trial-script-line" key={`${currentSlide.id}-${index}`}>
                  {line}
                </p>
              ))}
              {scriptValueNote && (
                <p className="trial-script-value">价值落点 · {scriptValueNote}</p>
              )}
            </div>
          </div>
          <div className={`trial-live-transcript ${liveTranscript ? 'is-active' : ''}`}>
            <span>{mimoAsrEnabled ? '云端转写' : hasRecognizer ? '实时转写' : '转写'}</span>
            <p>
              {displayTranscript || '开始录音后，这里会同步显示你的讲述文字。'}
            </p>
          </div>
          {notice && <div className="trial-notice">{notice}</div>}
          {error && <div className="trial-error">{error}</div>}
        </section>
      </div>

      <footer className="trial-footer">
        <div className="trial-footer-info">
          <span className={phase === 'recording' ? 'is-live' : ''}>
            <Mic size={14} />
            {phase === 'recording' ? '麦克风已开启' : '麦克风待开启'}
          </span>
          {cameraActive && (
            <span className={phase === 'recording' ? 'is-live' : ''}>
              <Video size={14} />
              {phase === 'recording' ? '教师画面录制中' : '教师画面已就绪'}
            </span>
          )}
          <span>
            <Check size={14} />
            翻页时间随录音保存
          </span>
        </div>
        <div className="trial-footer-actions">
          {phase === 'ready' && (
            <Button variant="primary" icon={<Play size={16} />} onClick={() => void startTrial()}>
              开始试讲
            </Button>
          )}
          {phase === 'recording' && (
            <Button
              variant="danger"
              icon={<Square size={15} fill="currentColor" />}
              onClick={finishTrial}
            >
              结束并保存
            </Button>
          )}
          {phase === 'saving' && (
            <Button variant="secondary" loading>
              正在保存试讲
            </Button>
          )}
          {phase !== 'recording' && phase !== 'saving' && (
            <Button variant="ghost" onClick={closeOverlay}>
              取消
            </Button>
          )}
        </div>
      </footer>
    </div>,
    document.body
  );
}
