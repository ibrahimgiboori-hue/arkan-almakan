'use client';

// تأكيد الإجراءات الخطرة داخل النظام نفسه، لا عبر window.confirm.
//
// السبب ليس شكليًا: window.confirm نافذة نظام تشغيل — لا تحمل سياق البند ولا
// اسم المنفّذ، ولا يمكن أن تعرض تحذيرًا مفصّلًا لما سيُحذف، ولا أن تُظهر «جارٍ…»
// أثناء التنفيذ، ولا أن تعرض خطأ الخادم في مكانه. وهي تختلف شكلًا وسلوكًا عن
// بقية حوارات النظام، فيفقد المستخدم القدرة على تمييز «هذا سؤال من البرنامج».
//
// مبني على ConstitutionDialog لا بجواره: نفس الخلفية ونفس Escape ونفس إدارة
// التركيز — هذا غلاف يضيف طبقة التأكيد فقط.

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
