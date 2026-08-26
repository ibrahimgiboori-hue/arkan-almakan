'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { todayIsoInRiyadh } from '@/lib/format';
import { receiptLabel } from '@/lib/operation-safety.mjs';
import { moveOperationalDate } from '@/lib/project-operation-context.mjs';
import { selectRosterAssignmentsForDate } from '@/lib/site-operation-roster.mjs';
import { useProjectOperationContext } from '@/lib/use-project-operation-context';
import { pendingOperationCount, saveOperationWithQueue, syncPendingOperations } from '@/lib/verified-operation-write';
import BulkAttendanceList from './BulkAttendanceList';
import RegisteredAttendanceList from './RegisteredAttendanceList';
import styles from './operations.module.css';
import layoutStyles from './attendance-layout.module.css';

const STATUS = Object.freeze({
  full: { label: 'كامل' },
  half: { label: 'نصف يوم' },
  stopped: { label: 'متوقف — حالة محفوظة', protected: true },
  leave: { label: 'إجازة — حالة محفوظة', protected: true },
});
const PROTECTED_STATUSES = new Set(['stopped', 'leave']);
const LABOR_CLASS = Object.freeze({ worker: 'عامل', technician: 'صنايعي', foreman: 'فورمان' });
const naturalCompare = (a = '', b = '') => String(a).localeCompare(String(b), 'ar', { numeric: true, sensitivity: 'base' });

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
      const [dayQ, assignQ, projectContractorQ] = await Promise.all([
        supabase.from('timesheet_days').select('id').eq('project_id', projectId).eq('work_date', requestDate).maybeSingle(),
        supabase.from('labor_project_assignments')
          .select('id,laborer_id,contractor_id,labor_class,trade,pay_basis,daily_rate,valid_from,valid_to')
          .eq('project_id', projectId)
          .lte('valid_from', requestDate)
          .or(`valid_to.is.null,valid_to.gte.${requestDate}`),
        supabase.from('project_contractors')
          .select('contractor_id,basis,worker_daily,tech_daily,start_date,end_date,is_active')
          .eq('project_id', projectId)
          .eq('is_active', true)
          .lte('start_date', requestDate)
          .or(`end_date.is.null,end_date.gte.${requestDate}`),
      ]);
      const firstError = [dayQ, assignQ, projectContractorQ].find((query) => query.error)?.error;
      if (firstError) throw firstError;

      const assignments = selectRosterAssignmentsForDate(assignQ.data || [], requestDate);
      const contractorIds = [...new Set([
        ...(projectContractorQ.data || []).map((row) => row.contractor_id),
        ...assignments.map((row) => row.contractor_id),
      ].filter(Boolean))];
      const laborerIds = [...new Set(assignments.map((row) => row.laborer_id).filter(Boolean))];

      const [contractorQ, laborerQ, attendanceQ] = await Promise.all([
        contractorIds.length
          ? supabase.from('contractors').select('id,name_ar,operation_alias,contractor_no').in('id', contractorIds)
          : Promise.resolve({ data: [], error: null }),
        laborerIds.length
          ? supabase.from('laborers').select('id,full_name,labor_class,trade,daily_rate,is_active').in('id', laborerIds)
          : Promise.resolve({ data: [], error: null }),
        dayQ.data?.id
          ? supabase.from('attendance').select('id,laborer_id,status,rate_used,portal_last_edited_by_name,portal_last_edited_at').eq('day_id', dayQ.data.id)
          : Promise.resolve({ data: [], error: null }),
      ]);
      const secondError = [contractorQ, laborerQ, attendanceQ].find((query) => query.error)?.error;
      if (secondError) throw secondError;
      if (requestSeq !== loadSeqRef.current || dateRef.current !== requestDate) return;

      const contractorRows = (contractorQ.data || []).map((contractor) => {
        const link = (projectContractorQ.data || []).find((row) => row.contractor_id === contractor.id);
        return { ...contractor, project_basis: link?.basis || null };
      }).sort((a, b) => naturalCompare(a.name_ar, b.name_ar));

      const assignmentByWorker = new Map(assignments.map((assignment) => [assignment.laborer_id, assignment]));
      const workerRows = (laborerQ.data || []).map((worker) => {
        const assignment = assignmentByWorker.get(worker.id);
        return {
          ...worker,
          contractor_id: assignment?.contractor_id || null,
          labor_class: assignment?.labor_class || worker.labor_class,
          trade: assignment?.trade || worker.trade,
          daily_rate: assignment?.daily_rate ?? worker.daily_rate,
          assignment_id: assignment?.id || null,
        };
      }).filter((worker) => worker.assignment_id).sort((a, b) => naturalCompare(a.full_name, b.full_name));

      const trackedRows = (attendanceQ.data || [])
        .filter((row) => ['full', 'half', 'stopped', 'leave'].includes(row.status))
        .map((row) => ({
          ...row,
          work_date: requestDate,
          pending: false,
          protected: PROTECTED_STATUSES.has(row.status),
        }));
      setContractors(contractorRows);
      setWorkers(workerRows);
      setMarks(Object.fromEntries(trackedRows.map((row) => [row.laborer_id, row])));

      const selectedId = contractorRef.current;
      const selectedStillExists = selectedId && contractorRows.some((contractor) => contractor.id === selectedId);
      if (!selectedStillExists) setActiveContractor(contractorRows[0]?.id || '');
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
      setPendingSync(pendingOperationCount());
    };
    refresh();
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
    };
  }, []);

  async function writeAttendance(rows) {
    if (!rows.length) return null;
    const requestDate = dateRef.current;
    setSaveProof({ status: 'saving' });
    const result = await saveOperationWithQueue({
      operation: 'attendance',
      projectId,
      workDate: requestDate,
      payload: {
        rows: rows.map(({ worker, status }) => ({
          laborer_id: worker.id,
          status,
          rate_used: Number(worker.daily_rate || 0),
        })),
      },
      batchId: null,
      sourceKind: 'live',
      sourceRef: null,
      certainty: 'confirmed',
    });
    setPendingSync(result.pendingCount || 0);

    if (dateRef.current !== requestDate) return { ...result, stale: true };

    if (result.status === 'verified') {
      setSaveProof({ status: 'verified', receipt: result.receipt });
      const snapshot = Array.isArray(result.receipt?.entity_snapshot) ? result.receipt.entity_snapshot : [];
      const verifiedMarks = Object.fromEntries(snapshot.map((row) => [row.laborer_id, {
        ...row,
        work_date: requestDate,
        pending: false,
        protected: PROTECTED_STATUSES.has(row.status),
      }]));
      setMarks((current) => ({ ...current, ...verifiedMarks }));
    } else {
      setSaveProof({ status: 'queued', requestId: result.requestId });
      const optimisticMarks = Object.fromEntries(rows.map(({ worker, status }) => [worker.id, {
        id: null,
        laborer_id: worker.id,
        status,
        work_date: requestDate,
        pending: true,
        request_id: result.requestId,
        protected: false,
      }]));
      setMarks((current) => ({ ...current, ...optimisticMarks }));
    }
    return result;
  }

  async function markWorker(worker, status) {
    if (!STATUS[status] || PROTECTED_STATUSES.has(status)) return;
    const existing = marks[worker.id];
    if (existing?.protected) {
      setErr(`حالة ${worker.full_name} محفوظة تاريخيًا (${STATUS[existing.status]?.label || existing.status}) ولا يجوز الكتابة فوقها من الإدخال السريع.`);
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
      else if (result?.receipt) setMsg(`${worker.full_name} — ${STATUS[status].label} · ${receiptLabel(result.receipt)}`);
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
        setMsg(`تم تسجيل ${selectedWorkers.length} عاملًا — ${STATUS[status].label} · ${receiptLabel(result.receipt)}`);
      } else {
        setMsg(queuedNotice(result, `${selectedWorkers.length} حركة ${STATUS[status].label}`));
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
      const { data, error } = await supabase.rpc('fn_remove_attendance_entry', { p_attendance_id: row.id });
      if (error) throw error;
      if (data !== true) throw new Error('لم يُحذف سجل الحضور؛ ربما تغيّر أو حُذف من جهة أخرى. حدّث اليوم قبل المحاولة مرة أخرى.');
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
    if (syncing || !online || pendingOperationCount() === 0) return;
    setSyncing(true);
    setErr('');
    const result = await syncPendingOperations(({ status, receipt }) => {
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

  const grouped = useMemo(() => contractors.map((contractor) => ({
    ...contractor,
    workers: workers.filter((worker) => worker.contractor_id === contractor.id),
  })), [contractors, workers]);

  const visibleWorkers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return workers
      .filter((worker) => !activeContractor || worker.contractor_id === activeContractor)
      .filter((worker) => !query || [worker.full_name, worker.trade, LABOR_CLASS[worker.labor_class]].filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)));
  }, [activeContractor, search, workers]);

  const pendingWorkers = visibleWorkers.filter((worker) => !marks[worker.id]);
  const doneWorkers = visibleWorkers.filter((worker) => marks[worker.id]);
  const fullCount = workers.filter((worker) => marks[worker.id]?.status === 'full').length;
  const halfCount = workers.filter((worker) => marks[worker.id]?.status === 'half').length;
  const protectedCount = workers.filter((worker) => marks[worker.id]?.protected).length;
  const absentCount = Math.max(0, workers.length - fullCount - halfCount - protectedCount);
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
    <div className={styles.root} dir="rtl">
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
        <div><span>القوة المسندة</span><strong>{workers.length}</strong></div>
        <div className={styles.fullStat}><span>كامل</span><strong>{fullCount}</strong></div>
        <div className={styles.halfStat}><span>نصف يوم</span><strong>{halfCount}</strong></div>
        {protectedCount > 0 && <div><span>حالة محفوظة</span><strong>{protectedCount}</strong></div>}
        <div className={styles.absentStat}><span>غياب تلقائي</span><strong>{absentCount}</strong></div>
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
