import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  /** Disables Confirm and swaps its label — e.g. while the delete is in flight. */
  busy?: boolean;
  busyLabel?: string;
  onConfirm(): void;
  onCancel(): void;
}

/**
 * In-app replacement for window.confirm(). Rendered through a portal so it
 * stacks above whatever opened it (the lead modal included) instead of being
 * clipped by that modal's overflow. Click events still bubble through the React
 * tree, so the backdrop stops its own click before a parent modal reads it as
 * "close me".
 */
export default function ConfirmDialog({
  title,
  children,
  confirmLabel = 'Delete',
  busy = false,
  busyLabel = 'Deleting…',
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);

  return createPortal(
    <div
      className="modal-backdrop"
      onClick={(e) => {
        e.stopPropagation();
        if (!busy) onCancel();
      }}
    >
      <div className="dialog dialog-confirm" role="alertdialog" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <div className="dialog-msg">{children}</div>
        <div className="dialog-actions">
          <button className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="btn btn-danger btn-danger-fill" onClick={onConfirm} disabled={busy} autoFocus>
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
