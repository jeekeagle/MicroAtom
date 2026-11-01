import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileText, LoaderCircle, Sparkles, Upload } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import { Button, ProgressBar } from './ui';
import type { PdfInspectResult } from '../types';

/** 一次能转的页数上限，服务端同样限制。 */
const MAX_PAGES = 60;

export function PdfImportPanel({ onDone }: { onDone: (projectId: string) => void }) {
  const { data, showToast, refresh } = useApp();
  const memory = data?.memory;
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [stage, setStage] = useState<'pick' | 'config' | 'working'>('pick');
  const [inspecting, setInspecting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [info, setInfo] = useState<PdfInspectResult | null>(null);
  const [title, setTitle] = useState('');
  // PDF 导入多半不是记忆里那门课，学科学段默认留空，由老师按需填。
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(12);
  const [secondsPerPage, setSecondsPerPage] = useState(45);
  const [generateScript, setGenerateScript] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<{
    id: string;
    progress: number;
    message: string;
    status: 'running' | 'ready' | 'error';
    warnings?: string[];
  } | null>(null);

  const pageCount = info?.pageCount ?? 0;
  const selected = Math.max(0, to - from + 1);
  const pickedPages = useMemo(
    () => (info?.preview ?? []).filter((page) => page.index >= from && page.index <= to).slice(0, 14),
    [info, from, to]
  );
  const estimate = useMemo(() => {
    const seconds = selected * secondsPerPage;
    return `${Math.floor(seconds / 60)} 分 ${String(seconds % 60).padStart(2, '0')} 秒`;
  }, [selected, secondsPerPage]);

  const pickFile = async (file: File) => {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name)) {
      showToast('请选择 PDF 文件', 'error');
      return;
    }
    setInspecting(true);
    try {
      const result = await api.inspectPdf(file);
      setInfo(result);
      setTitle(result.fileName.replace(/\.pdf$/i, '').trim());
      // 页数以 PDF 实际情况为准：默认整份导入，不预设任何页数。
      // 只有在超过单次上限时才截断到上限，并把差额明确告诉老师。
      setFrom(1);
      setTo(Math.min(result.pageCount, MAX_PAGES));
      setStage('config');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'PDF 读取失败', 'error');
    } finally {
      setInspecting(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const start = async () => {
    if (!info) return;
    if (!title.trim()) {
      showToast('请填写课程名称', 'error');
      return;
    }
    if (selected < 1) {
      showToast('页码范围不正确', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const project = await api.importPdf({
        token: info.token,
        title: title.trim(),
        subject: subject.trim(),
        grade: grade.trim(),
        from,
        to,
        secondsPerPage,
        generateScript
      });
      setStage('working');
      setJob({ id: project.id, progress: 2, message: '排队中', status: 'running' });
      void refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '转换启动失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // 转换在后台跑，这里只负责把进度读回来。
  useEffect(() => {
    if (!job || job.status !== 'running') return;
    let cancelled = false;
    const tick = async () => {
      try {
        const project = await api.project(job.id);
        if (cancelled) return;
        const meta = project.pdfImport;
        if (!meta) return;
        setJob({
          id: job.id,
          progress: meta.progress,
          message: meta.message,
          status: meta.status,
          warnings: meta.warnings
        });
        if (meta.status === 'ready') {
          await refresh();
          showToast(`已生成 ${project.slides.length} 页课件`);
          onDone(project.id);
        } else if (meta.status === 'error') {
          showToast(meta.message || 'PDF 转换失败', 'error');
        }
      } catch {
        // 轮询期间偶发的网络抖动不打断流程。
      }
    };
    const timer = window.setInterval(tick, 1200);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [job?.id, job?.status]);

  if (stage === 'working' && job) {
    return (
      <div className="create-step pdf-import-step">
        <div className="pdf-progress-card">
          <div className={`pdf-progress-icon ${job.status === 'error' ? 'is-error' : ''}`}>
            {job.status === 'error' ? (
              <AlertTriangle size={20} />
            ) : (
              <LoaderCircle size={20} className="spin" />
            )}
          </div>
          <div className="pdf-progress-body">
            <strong>
              {job.status === 'error'
                ? '转换中断'
                : job.progress >= 100
                  ? '准备进入课件'
                  : '正在把 PDF 转成逐页课件'}
            </strong>
            <span>{job.message || '读取原页…'}</span>
            <ProgressBar value={job.progress} tone="teal" />
            <small>
              {selected} 页 · 每页约 {secondsPerPage} 秒 · 预计讲解 {estimate}
            </small>
          </div>
        </div>
        {job.warnings?.length ? (
          <div className="pdf-warning-list">
            {job.warnings.map((warning) => (
              <p key={warning}>
                <AlertTriangle size={13} /> {warning}
              </p>
            ))}
          </div>
        ) : null}
        {job.status === 'error' && (
          <div className="modal-actions">
            <Button variant="ghost" onClick={() => setStage('config')}>
              返回调整
            </Button>
            <Button variant="primary" onClick={() => void start()} loading={submitting}>
              重试一次
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (stage === 'config' && info) {
    return (
      <div className="create-step pdf-import-step">
        <div className="pdf-file-card">
          <span className="pdf-file-icon">
            <FileText size={18} />
          </span>
          <div>
            <strong>{info.fileName}</strong>
            <small>
              共 {info.pageCount} 页 · {(info.sizeBytes / 1024 / 1024).toFixed(1)} MB ·
              将生成 {selected} 页课件
            </small>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setStage('pick')}>
            换一份
          </Button>
        </div>

        <div className="form-grid three">
          <label className="field">
            <span>课程名称</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="默认使用文件名"
            />
          </label>
          <label className="field">
            <span>学科</span>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="可不填"
            />
          </label>
          <label className="field">
            <span>学段</span>
            <input
              value={grade}
              onChange={(event) => setGrade(event.target.value)}
              placeholder="可不填"
            />
          </label>
        </div>

        <div className="form-grid three">
          <label className="field">
            <span>起始页</span>
            <input
              type="number"
              min={1}
              max={pageCount}
              value={from}
              onChange={(event) => {
                const next = Math.min(pageCount, Math.max(1, Number(event.target.value) || 1));
                setFrom(next);
                setTo((prev) => Math.min(pageCount, Math.max(next, prev)));
              }}
            />
          </label>
          <label className="field">
            <span>结束页</span>
            <input
              type="number"
              min={from}
              max={Math.min(pageCount, from + MAX_PAGES - 1)}
              value={to}
              onChange={(event) => {
                const next = Number(event.target.value) || from;
                setTo(Math.min(Math.min(pageCount, from + MAX_PAGES - 1), Math.max(from, next)));
              }}
            />
          </label>
          <label className="field">
            <span>每页讲解</span>
            <div className="input-with-suffix">
              <input
                type="number"
                min={20}
                max={180}
                step={5}
                value={secondsPerPage}
                onChange={(event) =>
                  setSecondsPerPage(Math.min(180, Math.max(20, Number(event.target.value) || 45)))
                }
              />
              <span>秒</span>
            </div>
          </label>
        </div>

        <div className="pdf-range-bar">
          <span className="pdf-range-text">
            这份 PDF 共 <strong>{pageCount}</strong> 页，当前导入第 <strong>{from}</strong>–
            <strong>{to}</strong> 页（{selected} 页课件）
          </span>
          <button
            type="button"
            className="pdf-range-all"
            onClick={() => {
              setFrom(1);
              setTo(Math.min(pageCount, MAX_PAGES));
            }}
          >
            整份导入
          </button>
        </div>

        <label className="pdf-script-toggle">
          <input
            type="checkbox"
            checked={generateScript}
            onChange={(event) => setGenerateScript(event.target.checked)}
          />
          <span>
            <strong>同时写逐页口播稿</strong>
            <small>每页配一段可直接朗读的讲解词，关掉就只转页面</small>
          </span>
        </label>

        <div className="pdf-preview">
          <div className="pdf-preview-head">
            <span>即将导入的页面</span>
            <small>
              共 {selected} 页 · 讲解时长约 {estimate}
            </small>
          </div>
          {pickedPages.length ? (
            <ul>
              {pickedPages.map((page) => (
                <li key={page.index}>
                  <span className="pdf-preview-index">{page.index}</span>
                  <span className="pdf-preview-title">{page.title || '（无可提取文字）'}</span>
                  <span className="pdf-preview-chars">{page.chars} 字</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pdf-preview-empty">
              第 {from}-{to} 页超出标题预览范围，转换时会按原页处理
            </p>
          )}
        </div>

        {pageCount > MAX_PAGES && (
          <p className="pdf-hint">
            <AlertTriangle size={13} /> 这份 PDF 共 {pageCount} 页，单次上限是 {MAX_PAGES} 页。
            当前这次最多导入 {MAX_PAGES} 页，剩下的可以把起始页调到 {MAX_PAGES + 1} 再导一次。
          </p>
        )}

        <div className="modal-actions">
          <Button variant="ghost" onClick={() => setStage('pick')}>
            上一步
          </Button>
          <Button
            variant="primary"
            onClick={() => void start()}
            loading={submitting}
            disabled={selected < 1}
            icon={<Sparkles size={16} />}
          >
            开始转换
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="create-step pdf-import-step">
      <div
        className={`pdf-drop ${dragging ? 'is-dragging' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file) void pickFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
        }}
      >
        {inspecting ? (
          <>
            <LoaderCircle size={26} className="spin" />
            <strong>正在读取 PDF…</strong>
            <small>页数多的文件要等几秒</small>
          </>
        ) : (
          <>
            <Upload size={26} />
            <strong>把 PDF 拖进来，或点击选择文件</strong>
            <small>讲义、旧 PPT 导出的 PDF 都可以，每页会原样变成一页课件</small>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void pickFile(file);
          }}
        />
      </div>

      <div className="pdf-tips">
        <p>
          <strong>页面不重排。</strong>PDF 每一页按原样铺进 1920×1080 的课件，图表、公式、表格都不会走样。
        </p>
        <p>
          <strong>讲解按页配。</strong>识别每页文字后写一段口播稿，一页一段，录完即成片。
        </p>
        <p>
          <strong>页数可以挑。</strong>整本书只导其中一章就行，一次最多 {MAX_PAGES} 页。
        </p>
      </div>
    </div>
  );
}
