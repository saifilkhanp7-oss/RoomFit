import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  /** Show as a bottom sheet on phones (default true) */
  sheet?: boolean;
}

export function Dialog({ title, subtitle, onClose, children, sheet = true }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // focus first input for keyboard users (not on touch, to avoid popping the keyboard)
    if (window.matchMedia('(pointer: fine)').matches) {
      ref.current?.querySelector<HTMLElement>('input, select, button.btn-primary')?.focus();
    }
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className={`overlay${sheet ? ' sheet-on-mobile' : ''}`}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <h2>{title}</h2>
        {subtitle ? <p className="sub">{subtitle}</p> : <div style={{ height: 14 }} />}
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog(props: {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog title={props.title} subtitle={props.message} onClose={props.onClose}>
      <div className="dialog-actions">
        <button className="btn" onClick={props.onClose}>
          Cancel
        </button>
        <button
          className={`btn ${props.danger ? 'btn-danger' : 'btn-primary'}`}
          onClick={() => {
            props.onConfirm();
            props.onClose();
          }}
        >
          {props.confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
