'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './bulk-attendance.module.css';

const LABOR_CLASS = { worker: 'عامل', technician: 'صنايعي', foreman: 'فورمان' };

export default function BulkAttendanceList({ workers, busy, onMarkWorker, onMarkSelected }) {
  const [selected, setSelected] = useState(() => new Set());

  const workerIds = useMemo(() => new Set(workers.map((worker) => worker.id)), [workers]);
  const selectedWorkers = useMemo(
    () => workers.filter((worker) => selected.has(worker.id)),
    [workers, selected],
  );

  useEffect(() => {
    setSelected((current) => {
      const next = new Set([...current].filter((id) => workerIds.has(id)));
      if (next.size === current.size && [...next].every((id) => current.has(id))) return current;
      return next;
    });
  }, [workerIds]);

  function toggle(id) {
    if (busy) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (busy) return;
    setSelected((current) => {
      const allSelected = workers.length > 0 && workers.every((worker) => current.has(worker.id));
      return allSelected ? new Set() : new Set(workers.map((worker) => worker.id));
    });
  }

  async function applySelected(status) {
    if (!selectedWorkers.length || busy) return;
    const ok = await onMarkSelected(selectedWorkers, status);
    if (ok) setSelected(new Set());
  }

  const allSelected = workers.length > 0 && workers.every((worker) => selected.has(worker.id));
  const someSelected = selectedWorkers.length > 0;

  if (workers.length === 0) {
    return (
      <div className={styles.completeState}>
        <strong>اكتمل تسجيل هذه القائمة</strong>
        <span>يمكن مراجعة المسجلين أو الانتقال لليوم التالي.</span>
      </div>
    );
  }

  return (
    <div className={styles.table}>
      <div className={`${styles.row} ${styles.head}`}>
        <label className={styles.checkWrap} title={allSelected ? 'إلغاء تحديد الظاهر' : 'تحديد كل الظاهر'}>
          <input
            type="checkbox"
            checked={allSelected}
            ref={(node) => { if (node) node.indeterminate = someSelected && !allSelected; }}
            onChange={toggleAll}
            disabled={Boolean(busy)}
          />
          <span className={styles.fakeCheck} />
        </label>
        <span>#</span>
        <span>العامل</span>
        <span>الصفة</span>
        <span>الحالة</span>
      </div>

      <div className={`${styles.bulkBar} ${someSelected ? styles.bulkBarOpen : ''}`} aria-hidden={!someSelected}>
        <div className={styles.bulkCount}>
          <strong>{selectedWorkers.length}</strong>
          <span>محدد</span>
        </div>
        <button type="button" className={styles.selectVisible} onClick={toggleAll} disabled={Boolean(busy)}>
          {allSelected ? 'إلغاء تحديد الظاهر' : 'تحديد الظاهر'}
        </button>
        <div className={styles.bulkActions}>
          <button type="button" className={styles.full} onClick={() => applySelected('full')} disabled={Boolean(busy)}>كامل</button>
          <button type="button" className={styles.half} onClick={() => applySelected('half')} disabled={Boolean(busy)}>نصف يوم</button>
          <button type="button" className={styles.absent} onClick={() => applySelected('absent')} disabled={Boolean(busy)}>غياب</button>
        </div>
        <button type="button" className={styles.clear} onClick={() => setSelected(new Set())} disabled={Boolean(busy)}>إلغاء التحديد</button>
      </div>

      {workers.map((worker, index) => {
        const isSelected = selected.has(worker.id);
        return (
          <div className={`${styles.row} ${isSelected ? styles.selected : ''}`} key={worker.id}>
            <label className={styles.checkWrap} title={isSelected ? 'إلغاء التحديد' : 'تحديد العامل'}>
              <input type="checkbox" checked={isSelected} onChange={() => toggle(worker.id)} disabled={Boolean(busy)} />
              <span className={styles.fakeCheck} />
            </label>
            <span className={styles.rowNo}>{String(index + 1).padStart(2, '0')}</span>
            <button type="button" className={styles.identity} onClick={() => toggle(worker.id)} disabled={Boolean(busy)}>
              <strong>{worker.full_name}</strong>
              <small>{worker.trade || LABOR_CLASS[worker.labor_class] || '—'}</small>
            </button>
            <span className={styles.workerClass}>{LABOR_CLASS[worker.labor_class] || worker.labor_class || '—'}</span>
            <div className={styles.statusButtons}>
              <button className={styles.full} disabled={Boolean(busy)} onClick={() => onMarkWorker(worker, 'full')}>كامل</button>
              <button className={styles.half} disabled={Boolean(busy)} onClick={() => onMarkWorker(worker, 'half')}>نصف يوم</button>
              <button className={styles.absent} disabled={Boolean(busy)} onClick={() => onMarkWorker(worker, 'absent')}>غياب</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
