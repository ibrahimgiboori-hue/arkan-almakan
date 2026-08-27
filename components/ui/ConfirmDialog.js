'use client';

// تأكيد الإجراءات الخطرة داخل النظام نفسه، لا عبر window.confirm.
// نافذة التأكيد تبقى صغيرة ومركزة؛ «رجوع» واحد فقط في صف الإجراءات.

import ConstitutionDialog from './ConstitutionDialog';
import styles from './constitution-dialog.module.css';

export default function ConfirmDialog({
  title,
  description,
  confirmLabel = 'تأكيد',
  cancelLabel = 'رجوع',
  busyLabel = 'جارٍ…',
  danger = false,
  busy = false,
  error = '',
  onConfirm,
  onCancel,
  children,
}) {
  return (
    <ConstitutionDialog
      title={title}
      description={description}
      size="compact"
      showBack={false}
      onClose={busy ? () => {} : onCancel}
    >
      {children}
      {error ? <div className="msg err" style={{ marginTop: 10 }}>{error}</div> : null}
      <div className={styles.confirmActions}>
        <button
          type="button"
          className={`btn ${danger ? styles.confirmDanger : ''}`}
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? busyLabel : confirmLabel}
        </button>
        <button type="button" className="btn ghost" disabled={busy} onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </ConstitutionDialog>
  );
}
