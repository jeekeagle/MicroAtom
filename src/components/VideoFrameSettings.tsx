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
  const draftRef = useRef<VideoFrameScheme>(draft);

  const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

  // 预览按课件 16:9 画出；圆形方案裁成正方形，纵向占位比 scale 更高，
  // 不按这个算，圆形方案拖到底部会溢出一截。
  const heightFraction = (scale: number, shape: VideoFrameShape) =>
    shape === 'circle' ? scale * (16 / 9) : scale;

  /** 把改动同步回"当前方案"，拖动一次就生效，不必再点保存方案。 */
  const syncToActiveScheme = (next: VideoFrameScheme) => {
    draftRef.current = next;
    setDraft(next);
    if (!config.schemes.some((item) => item.id === next.id)) return;
    onChange({ ...config, schemes: config.schemes.map((item) => (item.id === next.id ? { ...item, ...next } : item)) });
  };

  const updateDraft = (patch: Partial<VideoFrameScheme>) => {
    const next = { ...draftRef.current, ...patch };
    // 改了大小之后原位置可能把画面顶出框外，按新尺寸收回来。
    const size = clamp(Number(next.scale) || 0.25, 0.05, 1);
    next.scale = size;
    next.x = clamp(Number(next.x) || 0, 0, 1 - size);
    next.y = clamp(Number(next.y) || 0, 0, 1 - heightFraction(size, next.shape));
    syncToActiveScheme(next);
  };

  const onPointerDown = (event: React.PointerEvent) => {
    draggingRef.current = true;
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const size = draftRef.current.scale;
    const hFrac = heightFraction(size, draftRef.current.shape);
    const x = clamp((event.clientX - rect.left) / rect.width - size / 2, 0, 1 - size);
    const y = clamp((event.clientY - rect.top) / rect.height - hFrac / 2, 0, 1 - hFrac);
    const next = { ...draftRef.current, x, y };
    draftRef.current = next;
    setDraft(next);
  };

  const onPointerUp = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    // 松手才写回方案，拖动过程中不反复刷新设置。
    syncToActiveScheme(draftRef.current);
  };

  const placeAt = (corner: 'tl' | 'tr' | 'bl' | 'br') => {
    const size = draftRef.current.scale;
    const hFrac = heightFraction(size, draftRef.current.shape);
    updateDraft({
      x: corner === 'tl' || corner === 'bl' ? 0 : 1 - size,
      y: corner === 'tl' || corner === 'tr' ? 0 : 1 - hFrac
    });
  };

  const persist = (next: VideoFrameConfig) => onChange({ ...next });

  const saveScheme = () => {
    const current = draftRef.current;
    const trimmed = name.trim() || current.name || '新方案';
    const saved: VideoFrameScheme = { ...current, name: trimmed, id: current.id || makeId() };
    const exists = config.schemes.some((item) => item.id === saved.id);
    const schemes = exists
      ? config.schemes.map((item) => (item.id === saved.id ? saved : item))
      : [...config.schemes, saved];
    draftRef.current = saved;
    setDraft(cloneScheme(saved));
    setName(trimmed);
    persist({ ...config, schemes, activeSchemeId: saved.id });
  };

  const applyScheme = (scheme: VideoFrameScheme) => {
    draftRef.current = cloneScheme(scheme);
    setDraft(cloneScheme(scheme));
    setName(scheme.name);
    persist({ ...config, activeSchemeId: scheme.id });
  };

  const setDefault = (scheme: VideoFrameScheme) => {
    persist({ ...config, activeSchemeId: scheme.id, defaultSchemeId: scheme.id });
  };

  const addScheme = () => {
    const fresh: VideoFrameScheme = { ...draftRef.current, id: makeId(), name: '新方案' };
    draftRef.current = cloneScheme(fresh);
    setDraft(cloneScheme(fresh));
    setName('新方案');
    // 新方案要真的进列表，否则 activeSchemeId 指向一个不存在的方案，
    // 预览会回落到第一个方案，看起来"怎么调都没用"。
    persist({ ...config, schemes: [...config.schemes, fresh], activeSchemeId: fresh.id });
  };

  const removeScheme = (scheme: VideoFrameScheme) => {
    const schemes = config.schemes.filter((item) => item.id !== scheme.id);
    const activeSchemeId =
      config.activeSchemeId === scheme.id ? (schemes[0]?.id ?? '') : config.activeSchemeId;
    const defaultSchemeId =
      config.defaultSchemeId === scheme.id ? (schemes[0]?.id ?? '') : config.defaultSchemeId;
    persist({ ...config, schemes, activeSchemeId, defaultSchemeId });
    if (draftRef.current.id === scheme.id && schemes[0]) {
      draftRef.current = cloneScheme(schemes[0]);
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
              aspectRatio: draft.shape === 'circle' ? '1 / 1' : '16 / 9',
              borderRadius: radiusFor(draft.shape),
              border: borderCss(draft),
              boxShadow: shadowFor(draft)
            }}
            onPointerDown={onPointerDown}
          >
            <div className="frame-cam-inner">教师画面</div>
          </div>
        </div>
        <div className="frame-corners">
          <span>快速定位</span>
          <div className="frame-chips">
            <button className="frame-chip" onClick={() => placeAt('tl')}>
              左上
            </button>
            <button className="frame-chip" onClick={() => placeAt('tr')}>
              右上
            </button>
            <button className="frame-chip" onClick={() => placeAt('bl')}>
              左下
            </button>
            <button className="frame-chip" onClick={() => placeAt('br')}>
              右下
            </button>
          </div>
        </div>
        <p className="frame-note">
          拖动或点角位即写入当前方案，位置按课件画面比例保存，成片与这里看到的一致。
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
          <Check size={13} /> 拖动与角位会直接写入当前方案，成片按这里的位置合成；确认后点页面右下角“保存运行设置”落盘。
        </span>
      </div>
    </div>
  );
}
