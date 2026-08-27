'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
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

export default function ApprovalGuidanceRow({ guidance, compact = false, onCommunicationCreated }) {
  const [composer, setComposer] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const status = guidance?.workflow_status || 'draft';
  const pending = status === 'pending';
  const actor = guidance?.responsible_name || guidance?.decision_name || '';
  const actorTitle = guidance?.responsible_title || guidance?.decision_title || '';
  const group = guidance?.target_group_label || '';
  const responsible = pending
    ? [group ? `لدى ${group}` : 'لدى الجهة المختصة', actor ? `— ${actor}` : ''].filter(Boolean).join(' ')
    : [guidance?.decision_name ? `بواسطة ${guidance.decision_name}` : (group ? `بواسطة ${group}` : 'تم اتخاذ القرار'), guidance?.decision_title ? `— ${guidance.decision_title}` : ''].filter(Boolean).join(' ');
  const reason = pending
    ? 'بانتظار الإجراء'
    : (guidance?.decision_note || 'لا توجد ملاحظة مسجلة');
  const since = pending ? guidance?.submitted_at : (guidance?.acted_at || guidance?.finalized_at || guidance?.submitted_at);

  const defaultText = useMemo(() => {
    if (!composer) return '';
    if (composer === 'action_request') return `نأمل اتخاذ الإجراء المطلوب على ${guidance?.source_label || 'المعاملة'} (${guidance?.workflow_no || '—'}) وموافاتنا بالنتيجة.`;
    return `نأمل توضيح حالة ${guidance?.source_label || 'المعاملة'} (${guidance?.workflow_no || '—'}) وسبب الإجراء المتخذ أو سبب التأخر إن وجد.`;
  }, [composer, guidance]);

  function openComposer(kind) {
    setComposer(kind);
    setNote('');
    setMessage('');
    setError('');
  }

  async function sendCommunication(e) {
    e.preventDefault();
    if (!guidance?.workflow_id) return;
    setBusy(true);
    setError('');
    setMessage('');
    const { data, error: rpcError } = await supabase.rpc('fn_create_approval_communication', {
      p_workflow_id: guidance.workflow_id,
      p_kind: composer,
      p_note: note.trim() || defaultText,
    });
    if (rpcError) {
      const friendly = rpcError.message?.includes('NO_APPROVAL_RECIPIENT')
        ? 'لا يوجد حاليًا مستخدم مخول يمكن توجيه الخطاب إليه في هذه المرحلة.'
        : rpcError.message || 'تعذر فتح المراسلة.';
      setError(friendly);
    } else {
      setMessage('تم فتح المراسلة وإضافتها إلى أعمال الأطراف المعنية.');
      onCommunicationCreated?.(data);
    }
    setBusy(false);
  }

  if (!guidance) return null;

  return (
    <>
      <div className={`${styles.row} ${compact ? styles.compact : ''}`} data-approval-guidance="true">
        <div className={styles.transaction} title={guidance.source_label || guidance.workflow_no}>
          <strong>{guidance.source_label || 'معاملة'}</strong>
          <small>{guidance.workflow_no || '—'}</small>
        </div>
        <div className={`${styles.status} ${statusTone(status)}`}>{STATUS[status] || status}</div>
        <div className={styles.owner} title={[responsible, actorTitle].filter(Boolean).join(' ')}>{responsible}</div>
        <div className={styles.age}>{ageLabel(since)}</div>
        <div className={`${styles.note} ${!guidance.decision_note && !pending ? styles.missing : ''}`} title={reason}>{reason}</div>
        <div className={styles.actions} data-entry-ignore="true">
          {pending ? <button type="button" onClick={() => openComposer('action_request')}>طلب إجراء</button> : null}
          <button type="button" onClick={() => openComposer('inquiry')}>استفسار</button>
        </div>
      </div>

      {composer ? (
        <div className={styles.overlay} role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setComposer(null); }}>
          <form className={styles.dialog} onSubmit={sendCommunication} data-entry-ignore="true">
            <div className={styles.dialogHead}>
              <div>
                <strong>{composer === 'action_request' ? 'طلب إجراء' : 'استفسار عن المعاملة'}</strong>
                <small>{responsible}</small>
              </div>
              <button type="button" className={styles.close} onClick={() => setComposer(null)} disabled={busy}>×</button>
            </div>
            <div className={styles.reference}>
              <span>{guidance.source_label || 'معاملة'}</span>
              <span>{guidance.workflow_no || '—'}</span>
              <span>{STATUS[status] || status}</span>
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={defaultText}
              rows={4}
              autoFocus
            />
            {error ? <div className={styles.error}>{error}</div> : null}
            {message ? <div className={styles.success}>{message}</div> : null}
            <div className={styles.dialogActions}>
              {message ? <Link href="/dashboard/today#my-work" className={styles.workLink}>فتح أعمالي</Link> : null}
              {!message ? <button type="submit" className={styles.primary} disabled={busy}>{busy ? 'جارٍ الإرسال…' : 'إرسال'}</button> : null}
              <button type="button" onClick={() => setComposer(null)} disabled={busy}>{message ? 'إغلاق' : 'إلغاء'}</button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
