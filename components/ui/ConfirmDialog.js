'use client';

// تأكيد الإجراءات الخطرة داخل النظام نفسه، لا عبر window.confirm.
// الجلد المرئي يقرأ data-ui-*، بينما منطق القرار يبقى هنا بلا اقتران بالتصميم.

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
      {error ? <div className="msg err" data-ui-part="dialog-error" role="alert">{error}</div> : null}
      <div className={styles.confirmActions} data-ui-part="dialog-actions" data-ui-state={busy ? 'busy' : 'ready'}>
        <button
          type="button"
          className={`btn ${danger ? styles.confirmDanger : ''}`}
          disabled={busy}
          onClick={onConfirm}
          data-ui-control="confirm"
          data-ui-tone={danger ? 'danger' : 'primary'}
        >
          {busy ? busyLabel : confirmLabel}
        </button>
        <button type="button" className="btn ghost" disabled={busy} onClick={onCancel} data-ui-control="cancel">
          {cancelLabel}
        </button>
      </div>
    </ConstitutionDialog>
  );
}
