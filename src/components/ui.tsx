import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { LoaderCircle, X } from 'lucide-react';
import type { CourseMode, ProjectStatus } from '../types';
import { modeShortLabel, statusLabel } from '../lib/format';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'dark' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  loading,
  icon,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`button button-${variant} button-${size} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <LoaderCircle size={16} className="spin" /> : icon}
      <span>{children}</span>
    </button>
  );
}

export function IconButton({
  label,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button className={`icon-button ${className}`} aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span className={`status-badge status-${status}`}>
      <span className="status-dot" />
      {statusLabel[status]}
    </span>
  );
}

export function ModeBadge({ mode, verbose = false }: { mode: CourseMode; verbose?: boolean }) {
  return (
    <span className={`mode-badge mode-${mode}`}>
      <span className="mode-mark" />
      {verbose ? (mode === 'auto' ? '全自动生成' : mode === 'oral' ? '口语稿驱动' : 'PPT 驱动') : modeShortLabel[mode]}
    </span>
  );
}

export function ProgressBar({
  value,
  tone = 'brick',
  compact = false
}: {
  value: number;
  tone?: 'brick' | 'teal' | 'gold' | 'ink';
  compact?: boolean;
}) {
  return (
    <div className={`progress-track ${compact ? 'is-compact' : ''} tone-${tone}`}>
      <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  wide = false
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className={`modal ${wide ? 'modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <IconButton label="关闭" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function SectionLabel({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="section-label">
      <span>{children}</span>
      {aside}
    </div>
  );
}

export function SkeletonBlock({ height = 120 }: { height?: number }) {
  return <div className="skeleton" style={{ height }} />;
}
