import { useRef, useState } from 'react';
import { Check, Plus, Save, Trash2 } from 'lucide-react';
import type {
  VideoFrameBorderStyle,
  VideoFrameConfig,
  VideoFrameScheme,
  VideoFrameShape
} from '../types';
import { Button } from './ui';

const SHAPES: Array<{ id: VideoFrameShape; label: string }> = [
  { id: 'rect', label: '矩形' },
  { id: 'rounded', label: '圆角' },
  { id: 'circle', label: '圆形' },
  { id: 'oval', label: '椭圆' }
];

const BORDERS: Array<{ id: VideoFrameBorderStyle; label: string }> = [
  { id: 'none', label: '无边框' },
  { id: 'solid', label: '实线' },
  { id: 'double', label: '双线' },
  { id: 'dashed', label: '虚线' },
  { id: 'glow', label: '光晕' }
];

const cloneScheme = (scheme: VideoFrameScheme): VideoFrameScheme => ({ ...scheme });
const makeId = () => 'frame-' + Date.now().toString(36);

const radiusFor = (shape: VideoFrameShape) => {
  if (shape === 'rounded') return '14%';
  if (shape === 'circle' || shape === 'oval') return '50%';
  return '0';
};

const borderCss = (scheme: VideoFrameScheme) => {
  const width = Math.max(0, Math.round(scheme.borderWidth));
  const color = scheme.borderColor || '#F2EEE3';
  if (scheme.borderStyle === 'none' || width === 0) return 'none';
  if (scheme.borderStyle === 'double') return `${Math.max(2, width)}px double ${color}`;
  if (scheme.borderStyle === 'dashed') return `${width}px dashed ${color}`;
  return `${width}px solid ${color}`;
};

const shadowFor = (scheme: VideoFrameScheme) => {
  if (scheme.borderStyle === 'glow') {
    return `0 0 18px ${scheme.borderColor || '#F2EEE3'}`;
  }
  return scheme.shadow ? '0 12px 30px rgba(0,0,0,.34)' : 'none';
};

interface Props {
  value: VideoFrameConfig;
  onChange: (next: VideoFrameConfig) => void;
}

export function VideoFrameSettings({ value, onChange }: Props) {
  const config = value;
  const active =
    config.schemes.find((item) => item.id === config.activeSchemeId) ?? config.schemes[0];
  const [draft, setDraft] = useState<VideoFrameScheme>(() =>
    cloneScheme(
      active ?? {
        id: makeId(),
        name: '新方案',
        shape: 'rect',
        borderStyle: 'solid',
        borderWidth: 4,
        borderColor: '#F2EEE3',
        scale: 0.26,
        x: 0.72,
        y: 0.7,
        shadow: true
      }
    )
  );
  const [name, setName] = useState(draft.name);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const updateDraft = (patch: Partial<VideoFrameScheme>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

  const onPointerDown = (event: React.PointerEvent) => {
    draggingRef.current = true;
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const size = draft.scale;
    const x = clamp((event.clientX - rect.left) / rect.width - size / 2, 0, 1 - size);
    const y = clamp((event.clientY - rect.top) / rect.height - size / 2, 0, 1 - size);
    setDraft((current) => ({ ...current, x, y }));
  };

  const onPointerUp = () => {
    draggingRef.current = false;
  };

  const persist = (next: VideoFrameConfig) => onChange({ ...next });

  const saveScheme = () => {
    const trimmed = name.trim() || draft.name || '新方案';
    const saved: VideoFrameScheme = { ...draft, name: trimmed, id: draft.id || makeId() };
    const exists = config.schemes.some((item) => item.id === saved.id);
    const schemes = exists
      ? config.schemes.map((item) => (item.id === saved.id ? saved : item))
      : [...config.schemes, saved];
    setDraft(cloneScheme(saved));
    setName(trimmed);
    persist({ ...config, schemes, activeSchemeId: saved.id });
  };

  const applyScheme = (scheme: VideoFrameScheme) => {
    setDraft(cloneScheme(scheme));
    setName(scheme.name);
    persist({ ...config, activeSchemeId: scheme.id });
  };

  const setDefault = (scheme: VideoFrameScheme) => {
    persist({ ...config, activeSchemeId: scheme.id, defaultSchemeId: scheme.id });
  };

  const addScheme = () => {
    const fresh: VideoFrameScheme = { ...draft, id: makeId(), name: '新方案' };
    setDraft(cloneScheme(fresh));
    setName('新方案');
    persist({ ...config, activeSchemeId: fresh.id });
  };

  const removeScheme = (scheme: VideoFrameScheme) => {
    const schemes = config.schemes.filter((item) => item.id !== scheme.id);
    const activeSchemeId =
      config.activeSchemeId === scheme.id ? (schemes[0]?.id ?? '') : config.activeSchemeId;
    const defaultSchemeId =
      config.defaultSchemeId === scheme.id ? (schemes[0]?.id ?? '') : config.defaultSchemeId;
    persist({ ...config, schemes, activeSchemeId, defaultSchemeId });
    if (draft.id === scheme.id && schemes[0]) {
      setDraft(cloneScheme(schemes[0]));
      setName(schemes[0].name);
    }
  };

  return (
    <div className="frame-settings">
      <div className="frame-stage-wrap">
        <div
          className="frame-preview"
          ref={previewRef}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <span className="frame-slide-hint">课件画面 · 拖动教师画面调整位置</span>
          <div
            className="frame-cam"
            style={{
              left: `${draft.x * 100}%`,
              top: `${draft.y * 100}%`,
              width: `${draft.scale * 100}%`,
              borderRadius: radiusFor(draft.shape),
              border: borderCss(draft),
              boxShadow: shadowFor(draft)
            }}
            onPointerDown={onPointerDown}
          >
            <div className="frame-cam-inner">教师画面</div>
          </div>
        </div>
        <p className="frame-note">
          方案会同时作用于教师试讲预览与最终成片中的画中画。位置与大小按课件比例保存。
        </p>
      </div>

      <div className="frame-panel">
        <div className="frame-group">
          <span>画面形状</span>
          <div className="frame-chips">
            {SHAPES.map((item) => (
              <button
                key={item.id}
                className={`frame-chip ${draft.shape === item.id ? 'is-active' : ''}`}
                onClick={() => updateDraft({ shape: item.id })}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="frame-group">
          <span>边框样式</span>
          <div className="frame-chips">
            {BORDERS.map((item) => (
              <button
                key={item.id}
                className={`frame-chip ${draft.borderStyle === item.id ? 'is-active' : ''}`}
                onClick={() => updateDraft({ borderStyle: item.id })}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="frame-row">
          <label className="frame-field">
            <span>边框粗细 · {draft.borderWidth}px</span>
            <input
              type="range"
              min={0}
              max={16}
              value={draft.borderWidth}
              onChange={(event) => updateDraft({ borderWidth: Number(event.target.value) })}
            />
          </label>
          <label className="frame-field frame-color">
            <span>边框颜色</span>
            <input
              type="color"
              value={draft.borderColor}
              onChange={(event) => updateDraft({ borderColor: event.target.value })}
            />
          </label>
        </div>

        <label className="frame-field">
          <span>画面大小 · {Math.round(draft.scale * 100)}%</span>
          <input
            type="range"
            min={12}
            max={50}
            value={Math.round(draft.scale * 100)}
            onChange={(event) => updateDraft({ scale: Number(event.target.value) / 100 })}
          />
        </label>

        <label className="toggle-row frame-toggle">
          <input
            type="checkbox"
            checked={draft.shadow}
            onChange={(event) => updateDraft({ shadow: event.target.checked })}
          />
          <span className="toggle-ui" />
          <span>
            <strong>投影</strong>
            <small>为教师画面添加一层柔和阴影</small>
          </span>
        </label>

        <div className="frame-save-row">
          <label className="frame-field">
            <span>方案名称</span>
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <Button
            variant="primary"
            icon={<Save size={15} />}
            onClick={saveScheme}
          >
            保存方案
          </Button>
        </div>

        <div className="frame-schemes">
          <div className="frame-schemes-head">
            <span>已保存方案</span>
            <Button size="sm" icon={<Plus size={14} />} onClick={addScheme}>
              新建
            </Button>
          </div>
          {config.schemes.length === 0 && (
            <p className="frame-empty">还没有方案，调整上方预览后点击“保存方案”。</p>
          )}
          {config.schemes.map((scheme) => (
            <div
              key={scheme.id}
              className={`frame-scheme ${
                scheme.id === config.activeSchemeId ? 'is-active' : ''
              } ${scheme.id === config.defaultSchemeId ? 'is-default' : ''}`}
            >
              <span className="frame-scheme-name">{scheme.name}</span>
              {scheme.id === config.defaultSchemeId && (
                <span className="frame-badge">默认</span>
              )}
              <button className="frame-link" onClick={() => applyScheme(scheme)}>
                应用
              </button>
              <button className="frame-link" onClick={() => setDefault(scheme)}>
                设为默认
              </button>
              {config.schemes.length > 1 && (
                <button
                  className="frame-icon-btn"
                  title="删除方案"
                  onClick={() => removeScheme(scheme)}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>

        <label className="toggle-row frame-toggle">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(event) => persist({ ...config, enabled: event.target.checked })}
          />
          <span className="toggle-ui" />
          <span>
            <strong>启用视频边框方案</strong>
            <small>关闭后成片中的教师画面使用系统默认样式</small>
          </span>
        </label>
        <span className="frame-saved-hint">
          <Check size={13} /> 调整会即时反映在预览；记得点击页面右下角保存运行设置。
        </span>
      </div>
    </div>
  );
}
