'use client';

import styles from './bulk-attendance.module.css';

const LABOR_CLASS = { worker: 'عامل', technician: 'صنايعي', foreman: 'فورمان' };
const STATUS = {
  full: 'كامل',
  half: 'نصف يوم',
  stopped: 'متوقف — حالة محفوظة',
  leave: 'إجازة — حالة محفوظة',
};
const PROTECTED = new Set(['stopped', 'leave']);

function dotColor(state, pending) {
  if (pending) return '#8a6d2f';
  if (state === 'full') return 'var(--green)';
  if (state === 'half') return 'var(--blue)';
  return '#7a6b55';
}

export default function RegisteredAttendanceList({ workers, marks, busy, onMarkWorker, onRemove }) {
  if (workers.length === 0) {
    return (
      <div className={styles.completeState}>
        <strong>لا يوجد مسجلون بعد</strong>
        <span>عند تسجيل كامل أو نصف يوم ينتقل العامل إلى هذه القائمة فورًا.</span>
      </div>
    );
  }

  return (
    <div className={styles.table}>
      <div className={`${styles.row} ${styles.head}`}>
        <span />
        <span>#</span>
        <span>العامل</span>
        <span>الصفة</span>
        <span>الحالة / التعديل</span>
      </div>

      {workers.map((worker, index) => {
        const mark = marks[worker.id] || {};
        const state = mark.status || 'full';
        const protectedState = mark.protected || PROTECTED.has(state);
        const pending = Boolean(mark.pending);
        const locked = Boolean(busy) || protectedState || pending;
        return (
          <div className={styles.row} key={worker.id}>
            <span aria-hidden="true" style={{width:10,height:10,borderRadius:'50%',background:dotColor(state,pending),justifySelf:'center'}} />
            <span className={styles.rowNo}>{String(index + 1).padStart(2, '0')}</span>
            <div className={styles.identity}>
              <strong>{worker.full_name}</strong>
              <small>{worker.trade || LABOR_CLASS[worker.labor_class] || '—'} · {pending ? 'بانتظار المزامنة' : (STATUS[state] || state)}</small>
            </div>
            <span className={styles.workerClass}>{LABOR_CLASS[worker.labor_class] || worker.labor_class || '—'}</span>
            <div className={styles.statusButtons}>
              <button className={styles.full} type="button" disabled={locked || state === 'full'} onClick={() => onMarkWorker(worker, 'full')}>كامل</button>
              <button className={styles.half} type="button" disabled={locked || state === 'half'} onClick={() => onMarkWorker(worker, 'half')}>نصف يوم</button>
              <button className={styles.absent} type="button" disabled={locked} onClick={() => onRemove(worker)}>{pending ? 'في الانتظار' : protectedState ? 'محفوظة' : 'إلغاء'}</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
