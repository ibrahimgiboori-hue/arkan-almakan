'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { todayIsoInRiyadh } from '@/lib/format';
import { receiptLabel } from '@/lib/operation-safety.mjs';
import { moveOperationalDate } from '@/lib/project-operation-context.mjs';
import { useProjectOperationContext } from '@/lib/use-project-operation-context';
import { projectAttendanceService } from '@/lib/application/project-attendance-service';
import {
  PROJECT_ATTENDANCE_STATUS,
  filterProjectAttendanceWorkers,
  groupProjectAttendanceByContractor,
  summarizeProjectAttendance,
} from '@/lib/project-attendance.mjs';
import BulkAttendanceList from './BulkAttendanceList';
import RegisteredAttendanceList from './RegisteredAttendanceList';
import styles from './operations.module.css';
import layoutStyles from './attendance-layout.module.css';

function dateLabel(value) {
  if (!value) return '—';
  const [y, m, d] = String(value).split('-').map(Number);
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(y, m - 1, d));
}

function queuedNotice(result, subject) {
  return result?.error
    ? `تعذّر حفظ ${subject} على الخادم الآن (${result.error.message || result.error}) — بقيت في انتظار إعادة المحاولة، فتحقّق قبل الاعتماد عليها.`
    : `حُفظت ${subject} على هذا الجهاز وتنتظر عودة الاتصال.`;
}

export default function AttendanceWorkspace() {
  const { id: projectId } = useParams();
  const {
    date,
    contractorId: activeContractor,
    ready: contextReady,
    setDate,
    setContractorId: setActiveContractor,
  } = useProjectOperationContext(projectId);

  const [contractors, setContractors] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [marks, setMarks] = useState({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [saveProof, setSaveProof] = useState(null);
  const [online, setOnline] = useState(true);
  const [pendingSync, setPendingSync] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const dateRef = useRef(date);
  const contractorRef = useRef(activeContractor);
  const loadSeqRef = useRef(0);

  useEffect(() => { dateRef.current = date; }, [date]);
  useEffect(() => { contractorRef.current = activeContractor; }, [activeContractor]);

  const load = useCallback(async () => {
    if (!contextReady || !projectId || !date) return;
    const requestDate = date;
    const requestSeq = ++loadSeqRef.current;
    setLoading(true);
    setLoadError('');
    try {
      const workspace = await projectAttendanceService.loadDay({ projectId, date: requestDate });
      if (requestSeq !== loadSeqRef.current || dateRef.current !== requestDate) return;

      setContractors(workspace.contractors);
      setWorkers(workspace.workers);
      setMarks(workspace.marks);

      const selectedId = contractorRef.current;
      const selectedStillExists = selectedId && workspace.contractors.some((contractor) => contractor.id === selectedId);
      if (!selectedStillExists) setActiveContractor(workspace.contractors[0]?.id || '');
    } catch (error) {
      if (requestSeq !== loadSeqRef.current || dateRef.current !== requestDate) return;
      const message = 'تعذر فتح حضور اليوم: ' + (error.message || error);
      setLoadError(message);
      setErr(message);
      setContractors([]);
      setWorkers([]);
      setMarks({});
    } finally {
      if (requestSeq === loadSeqRef.current && dateRef.current === requestDate) setLoading(false);
    }
  }, [contextReady, date, projectId, setActiveContractor]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const refresh = () => {
      setOnline(navigator.onLine !== false);
      setPendingSync(projectAttendanceService.pendingCount());
    };
    refresh();
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
    };
  }, []);

  async function writeAttendance(entries) {
    if (!entries.length) return null;
    const requestDate = dateRef.current;
    setSaveProof({ status: 'saving' });
    const result = await projectAttendanceService.saveEntries({
      projectId,
      date: requestDate,
      entries,
    });
    setPendingSync(result?.pendingCount || 0);

    if (dateRef.current !== requestDate) return { ...result, stale: true };

    if (result.status === 'verified') {
      setSaveProof({ status: 'verified', receipt: result.receipt });
    } else {
      setSaveProof({ status: 'queued', requestId: result.requestId });
    }
    setMarks((current) => ({ ...current, ...(result.marks || {}) }));
    return result;
  }

  async function markWorker(worker, status) {
    if (!PROJECT_ATTENDANCE_STATUS[status] || PROJECT_ATTENDANCE_STATUS[status].protected) return;
    const existing = marks[worker.id];
    if (existing?.protected) {
      setErr(`حالة ${worker.full_name} محفوظة تاريخيًا (${PROJECT_ATTENDANCE_STATUS[existing.status]?.label || existing.status}) ولا يجوز الكتابة فوقها من الإدخال السريع.`);
      return;
    }
    if (existing?.pending) {
      setErr(`حركة ${worker.full_name} ما زالت بانتظار المزامنة. لا تُنشئ حركة أخرى قبل اكتمالها.`);
      return;
    }
    setBusy(`worker-${worker.id}`);
    setErr('');
    setMsg('');
    try {
      const result = await writeAttendance([{ worker, status }]);
      if (result?.stale) return;
      if (result?.status === 'queued') setMsg(queuedNotice(result, `تسجيل ${worker.full_name}`));
      else if (result?.receipt) setMsg(`${worker.full_name} — ${PROJECT_ATTENDANCE_STATUS[status].label} · ${receiptLabel(result.receipt)}`);
    } catch (error) {
      setSaveProof({ status: 'error' });
      setErr(error.message || String(error));
    }
    setBusy('');
  }

  async function markSelected(selectedWorkers, status) {
    if (!selectedWorkers.length || !['full', 'half'].includes(status)) return false;
    setBusy('selection');
    setErr('');
    setMsg('');
    try {
      const result = await writeAttendance(selectedWorkers.map((worker) => ({ worker, status })));
      if (result?.stale) { setBusy(''); return false; }
      if (result?.status === 'verified') {
        setMsg(`تم تسجيل ${selectedWorkers.length} عاملًا — ${PROJECT_ATTENDANCE_STATUS[status].label} · ${receiptLabel(result.receipt)}`);
      } else {
        setMsg(queuedNotice(result, `${selectedWorkers.length} حركة ${PROJECT_ATTENDANCE_STATUS[status].label}`));
      }
      setBusy('');
      return true;
    } catch (error) {
      setSaveProof({ status: 'error' });
      setErr(error.message || String(error));
      setBusy('');
      return false;
    }
  }

  async function removeAttendance(worker) {
    const row = marks[worker.id];
    const requestDate = dateRef.current;
    if (!row) return;
    if (row.protected) {
      setErr(`الحالة الحالية لـ${worker.full_name} حالة تاريخية محفوظة ولا تُلغى من الإدخال السريع.`);
      return;
    }
    if (row.pending || !row.id) {
      setErr(`حركة ${worker.full_name} بانتظار المزامنة؛ لا يمكن إلغاؤها قبل أن يثبتها الخادم.`);
      return;
    }
    if (row.work_date && row.work_date !== requestDate) {
      setErr('تغيّر اليوم المعروض. أعد فتح اليوم قبل تعديل هذا السجل.');
      return;
    }
    setBusy(`undo-${worker.id}`);
    setErr('');
    try {
      await projectAttendanceService.removeEntry({ mark: row, date: requestDate });
      if (dateRef.current !== requestDate) return;
      setMarks((current) => {
        if (current[worker.id]?.id !== row.id) return current;
        const next = { ...current };
        delete next[worker.id];
        return next;
      });
      setMsg(`أُلغي تسجيل ${worker.full_name} وأصبح غائبًا تلقائيًا لهذا اليوم.`);
    } catch (error) {
      setErr('تعذر إلغاء التسجيل: ' + (error.message || error));
    }
    setBusy('');
  }

  async function retrySync() {
    if (syncing || !online || projectAttendanceService.pendingCount() === 0) return;
    setSyncing(true);
    setErr('');
    const result = await projectAttendanceService.syncPending(({ status, receipt }) => {
      if (status === 'verified') setSaveProof({ status: 'verified', receipt });
    });
    setPendingSync(result.pendingCount || 0);
    setSyncing(false);
    if (result.failed) setErr(`تعذرت مزامنة ${result.failed} حركة. ما زالت محفوظة على هذا الجهاز.`);
    if (result.synced) {
      setMsg(`تمت مزامنة ${result.synced} حركة.`);
      await load();
    }
  }

  const grouped = useMemo(() => groupProjectAttendanceByContractor(contractors, workers), [contractors, workers]);
  const visibleWorkers = useMemo(
    () => filterProjectAttendanceWorkers(workers, activeContractor, search),
    [activeContractor, search, workers],
  );
  const pendingWorkers = visibleWorkers.filter((worker) => !marks[worker.id]);
  const doneWorkers = visibleWorkers.filter((worker) => marks[worker.id]);
  const summary = useMemo(() => summarizeProjectAttendance(workers, marks), [workers, marks]);
  const activeContractorRow = grouped.find((contractor) => contractor.id === activeContractor);
  const activeContractorHasWorkers = Boolean(activeContractorRow?.workers?.length);

  const saveLabel = saveProof?.status === 'saving'
    ? 'جارٍ الحفظ…'
    : saveProof?.status === 'verified'
      ? 'آخر حركة محفوظة في الخادم'
      : saveProof?.status === 'queued'
        ? 'هناك حركة محفوظة على الجهاز'
        : saveProof?.status === 'error'
          ? 'آخر محاولة لم تثبت'
          : 'الحفظ الموثق جاهز';

  if (!contextReady) return <div className={styles.loading}>جارٍ فتح سياق المشروع…</div>;

  return (
    <div className={styles.root} dir="rtl" data-project-attendance-workspace="engineered-v1">
      <section className={styles.controlBar}>
        <div className={styles.modeTitle}><span>التشغيل اليومي</span><strong>الحضور</strong></div>
        <div className={styles.dateNav} aria-label="التنقل بين الأيام">
          <button type="button" onClick={() => setDate((current) => moveOperationalDate(current, 1))} aria-label="اليوم التالي">←</button>
          <div className={styles.dateCenter}>
            <strong>{dateLabel(date)}</strong>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-label="اختيار التاريخ" />
          </div>
          <button type="button" onClick={() => setDate((current) => moveOperationalDate(current, -1))} aria-label="اليوم السابق">→</button>
        </div>
        <button type="button" className={styles.todayButton} onClick={() => setDate(todayIsoInRiyadh())}>اليوم</button>
        <div className={`${styles.syncState} ${!online || pendingSync ? styles.syncWarn : ''}`}>
          <span className={online ? styles.onlineDot : styles.offlineDot} />
          <div><strong>{online ? 'متصل' : 'غير متصل'}</strong><small>{saveLabel}</small></div>
          {pendingSync > 0 && <button type="button" onClick={retrySync} disabled={!online || syncing}>{syncing ? '...' : `مزامنة ${pendingSync}`}</button>}
        </div>
      </section>

      {err && <div className={styles.error}>{err}</div>}
      {msg && <div className={styles.success}>{msg}</div>}

      <section className={styles.summaryStrip}>
        <div><span>القوة المسندة</span><strong>{summary.total}</strong></div>
        <div className={styles.fullStat}><span>كامل</span><strong>{summary.full}</strong></div>
        <div className={styles.halfStat}><span>نصف يوم</span><strong>{summary.half}</strong></div>
        {summary.protected > 0 && <div><span>حالة محفوظة</span><strong>{summary.protected}</strong></div>}
        <div className={styles.absentStat}><span>غياب تلقائي</span><strong>{summary.absent}</strong></div>
      </section>

      <section className={styles.contractorBar}>
        <div className={styles.contractorTabs}>
          {grouped.map((contractor) => {
            const remaining = contractor.workers.filter((worker) => !marks[worker.id]).length;
            const status = contractor.workers.length === 0
              ? 'بلا عمالة'
              : remaining > 0 ? `${remaining} غائب/غير مسجل` : 'تم تسجيل الحاضرين';
            return (
              <button
                key={contractor.id}
                type="button"
                className={activeContractor === contractor.id ? styles.activeContractor : ''}
                onClick={() => setActiveContractor(contractor.id)}
              >
                <span>{contractor.operation_alias || contractor.name_ar}</span>
                <small>{status}</small>
              </button>
            );
          })}
        </div>
        <div className={styles.contractorMeta}>
          <strong>{activeContractorRow?.name_ar || '—'}</strong>
          <span>{activeContractorRow?.project_basis === 'piecework' ? 'مقطوعية / بالوحدة' : activeContractorRow?.project_basis === 'salary' ? 'راتب' : 'يومية'}</span>
        </div>
      </section>

      {loading ? (
        <div className={styles.loading}>جارٍ فتح سجل اليوم…</div>
      ) : loadError ? (
        <div className={styles.error}>تعذر تحميل بيانات اليوم. لم تُعرض حالة فارغة بديلة حتى لا تُنشئ بيانات فوق سجل غير مقروء.</div>
      ) : grouped.length === 0 ? (
        <div className={styles.empty}>لا يوجد مقاول مرتبط أو عمالة مسندة لهذا المشروع في التاريخ المختار.</div>
      ) : !activeContractorHasWorkers ? (
        <div className={styles.empty}>
          هذا المقاول مرتبط بالمشروع لكنه بلا عمالة مسندة في هذا التاريخ.{' '}
          <Link href={`/dashboard/projects/${projectId}/operations/labor`}>أضف أو انقل العمالة من شاشة العمالة</Link>.
        </div>
      ) : (
        <section className={layoutStyles.workArea}>
          <main className={layoutStyles.pane}>
            <div className={layoutStyles.paneHead}>
              <div className={layoutStyles.paneTitle}>
                <span className={layoutStyles.eyebrow}>FAST ENTRY</span>
                <h2>غير المسجلين</h2>
                <p>سجّل فقط من حضر: كامل أو نصف يوم. من يبقى هنا يُعامل كغياب تلقائيًا.</p>
              </div>
              <div className={layoutStyles.tools}>
                <input aria-label="بحث في عمالة الحضور" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بالاسم أو الصفة" />
                <span className={layoutStyles.count}>{pendingWorkers.length}</span>
              </div>
            </div>
            <BulkAttendanceList
              key={`${date}-${activeContractor}`}
              workers={pendingWorkers}
              busy={busy}
              onMarkWorker={markWorker}
              onMarkSelected={markSelected}
            />
          </main>

          <aside className={layoutStyles.pane}>
            <div className={layoutStyles.paneHead}>
              <div className={layoutStyles.paneTitle}>
                <span className={layoutStyles.eyebrow}>RECORDED</span>
                <h2>تم التسجيل</h2>
                <p>نفس قائمة العمال وبنفس البنية؛ عدّل كامل/نصف أو ألغِ التسجيل مباشرة.</p>
              </div>
              <div className={layoutStyles.tools}>
                <span className={layoutStyles.count}>{doneWorkers.length}</span>
              </div>
            </div>
            <RegisteredAttendanceList
              workers={doneWorkers}
              marks={marks}
              busy={busy}
              onMarkWorker={markWorker}
              onRemove={removeAttendance}
            />
          </aside>
        </section>
      )}
    </div>
  );
}
