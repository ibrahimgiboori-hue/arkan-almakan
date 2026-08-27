'use client';

import styles from './approval-guidance-row.module.css';

const STATUS = Object.freeze({
  pending: 'قيد الاعتماد',
  approved: 'معتمدة',
  rejected: 'مرفوضة',
  returned: 'معادة للتعديل',
  cancelled: 'ملغاة',
  draft: 'مسودة',
});

function ageLabel(value) {
  if (!value) return '—';
  const diff = Date.now() - new Date(value).getTime();
  const days = Math.max(0, Math.floor(diff / 86400000));
  if (days === 0) return 'اليوم';
  if (days === 1) return 'منذ يوم';
  if (days === 2) return 'منذ يومين';
  if (days <= 10) return `منذ ${days} أيام`;
  return `منذ ${days} يومًا`;
}

function statusTone(status) {
  if (status === 'approved') return styles.ok;
  if (status === 'rejected' || status === 'returned') return styles.warn;
  if (status === 'pending') return styles.pending;
  return styles.neutral;
}

export default function ApprovalGuidanceRow({ guidance, compact = false }) {
  if (!guidance) return null;

  const status = guidance.workflow_status || 'draft';
  const pending = status === 'pending';
  const actor = guidance.responsible_name || guidance.decision_name || '';
  const group = guidance.target_group_label || '';
  const responsible = pending
    ? [group ? `لدى ${group}` : 'لدى الجهة المختصة', actor ? `— ${actor}` : ''].filter(Boolean).join(' ')
    : [guidance.decision_name ? `بواسطة ${guidance.decision_name}` : (group ? `بواسطة ${group}` : 'تم اتخاذ القرار')].filter(Boolean).join(' ');
  const note = pending ? 'بانتظار الإجراء' : (guidance.decision_note || 'لا توجد ملاحظة مسجلة');
  const since = pending
    ? guidance.submitted_at
    : (guidance.acted_at || guidance.finalized_at || guidance.submitted_at);

  return (
    <div className={`${styles.row} ${compact ? styles.compact : ''}`} data-approval-guidance="true">
      <div className={styles.transaction} title={guidance.source_label || guidance.workflow_no}>
        <strong>{guidance.source_label || 'معاملة'}</strong>
        <small>{guidance.workflow_no || '—'}</small>
      </div>
      <div className={`${styles.status} ${statusTone(status)}`}>{STATUS[status] || status}</div>
      <div className={styles.owner} title={responsible}>{responsible}</div>
      <div className={styles.age}>{ageLabel(since)}</div>
      <div className={`${styles.note} ${!guidance.decision_note && !pending ? styles.missing : ''}`} title={note}>{note}</div>
    </div>
  );
}
