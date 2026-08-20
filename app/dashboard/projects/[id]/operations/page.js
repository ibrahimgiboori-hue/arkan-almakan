'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { receiptLabel } from '@/lib/operation-safety.mjs';
import { pendingOperationCount, saveOperationWithQueue, syncPendingOperations } from '@/lib/verified-operation-write';
import BulkAttendanceList from './BulkAttendanceList';
import styles from './operations.module.css';

const STATUS = {
  full: { label: 'كامل', short: 'كامل' },
  half: { label: 'نصف يوم', short: 'نصف' },
  absent: { label: 'غياب', short: 'غياب' },
  stopped: { label: 'توقف', short: 'توقف' },
  leave: { label: 'إجازة', short: 'إجازة' },
};

const LABOR_CLASS = { worker: 'عامل', technician: 'صنايعي', foreman: 'فورمان' };
const naturalCompare = (a = '', b = '') => String(a).localeCompare(String(b), 'ar', { numeric: true, sensitivity: 'base' });
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function moveDate(value, days) {
  const [y, m, d] = String(value).split('-').map(Number);
  const next = new Date(y, m - 1, d);
  next.setDate(next.getDate() + days);
  return iso(next);
}

function dateLabel(value) {
  if (!value) return '—';
  const [y, m, d] = String(value).split('-').map(Number);
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(y, m - 1, d));
}

export default function ProjectDailyOperations() {
  const { id: projectId } = useParams();
  const [date, setDate] = useState(iso(new Date()));
  const [contractors, setContractors] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [marks, setMarks] = useState({});
  const [activeContractor, setActiveContractor] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [saveProof, setSaveProof] = useState(null);
  const [online, setOnline] = useState(true);
  const [pendingSync, setPendingSync] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    if (!projectId || !date) return;
    setLoading(true);
    setErr('');
    try {
      const [dayQ, assignQ, projectContractorQ] = await Promise.all([
        supabase.from('timesheet_days').select('id').eq('project_id', projectId).eq('work_date', date).maybeSingle(),
        supabase.from('labor_project_assignments')
          .select('id,laborer_id,contractor_id,labor_class,trade,pay_basis,daily_rate,valid_from,valid_to')
          .eq('project_id', projectId)
          .lte('valid_from', date)
          .or(`valid_to.is.null,valid_to.gte.${date}`),
        supabase.from('project_contractors')
          .select('contractor_id,basis,worker_daily,tech_daily,start_date,end_date,is_active')
          .eq('project_id', projectId)
          .eq('is_active', true)
          .lte('start_date', date)
          .or(`end_date.is.null,end_date.gte.${date}`),
      ]);

      const firstError = [dayQ, assignQ, projectContractorQ].find((x) => x.error)?.error;
      if (firstError) throw firstError;

      const assignments = assignQ.data || [];
      const contractorIds = [...new Set([
        ...(projectContractorQ.data || []).map((x) => x.contractor_id),
        ...assignments.map((x) => x.contractor_id),
      ].filter(Boolean))];
      const laborerIds = [...new Set(assignments.map((x) => x.laborer_id).filter(Boolean))];

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

      const secondError = [contractorQ, laborerQ, attendanceQ].find((x) => x.error)?.error;
      if (secondError) throw secondError;

      const contractorRows = (contractorQ.data || []).map((c) => {
        const link = (projectContractorQ.data || []).find((x) => x.contractor_id === c.id);
        return { ...c, project_basis: link?.basis || null };
      }).sort((a, b) => naturalCompare(a.name_ar, b.name_ar));

      const assignmentByWorker = new Map(assignments.map((a) => [a.laborer_id, a]));
      const workerRows = (laborerQ.data || []).map((w) => {
        const a = assignmentByWorker.get(w.id);
        return {
          ...w,
          contractor_id: a?.contractor_id || null,
          labor_class: a?.labor_class || w.labor_class,
          trade: a?.trade || w.trade,
          daily_rate: a?.daily_rate ?? w.daily_rate,
          assignment_id: a?.id || null,
        };
      }).filter((w) => w.assignment_id).sort((a, b) => naturalCompare(a.full_name, b.full_name));

      setContractors(contractorRows);
      setWorkers(workerRows);
      setMarks(Object.fromEntries((attendanceQ.data || []).map((x) => [x.laborer_id, x])));
      setActiveContractor((current) => current && contractorRows.some((c) => c.id === current)
        ? current
        : (contractorRows[0]?.id || ''));
    } catch (e) {
      setErr('تعذر فتح حضور اليوم: ' + (e.message || e));
    }
    setLoading(false);
  }, [projectId, date]);

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
    setSaveProof({ status: 'saving' });
    const result = await saveOperationWithQueue({
      operation: 'attendance',
      projectId,
      workDate: date,
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
    if (result.status === 'verified') {
      setSaveProof({ status: 'verified', receipt: result.receipt });
      const snapshot = Array.isArray(result.receipt?.entity_snapshot) ? result.receipt.entity_snapshot : [];
      setMarks((current) => ({ ...current, ...Object.fromEntries(snapshot.map((x) => [x.laborer_id, x])) }));
    } else {
      setSaveProof({ status: 'queued', requestId: result.requestId });
    }
    return result;
  }

  async function markWorker(worker, status) {
    setBusy(`worker-${worker.id}`);
    setErr('');
    setMsg('');
    try {
      const result = await writeAttendance([{ worker, status }]);
      if (result?.status === 'queued') setMsg(`حُفظت محاولة تسجيل ${worker.full_name} على هذا الجهاز وتنتظر الاتصال.`);
      else if (result?.receipt) setMsg(`${worker.full_name} — ${STATUS[status]?.label || status} · ${receiptLabel(result.receipt)}`);
    } catch (e) {
      setSaveProof({ status: 'error' });
      setErr(e.message || String(e));
    }
    setBusy('');
  }

  async function markSelected(selectedWorkers, status) {
    if (!selectedWorkers.length) return false;
    setBusy('selection');
    setErr('');
    setMsg('');
    try {
      const result = await writeAttendance(selectedWorkers.map((worker) => ({ worker, status })));
      const label = STATUS[status]?.label || status;
      if (result?.status === 'verified') {
        setMsg(`تم تسجيل ${selectedWorkers.length} عاملًا — ${label} · ${receiptLabel(result.receipt)}`);
      } else {
        setMsg(`حُفظت ${selectedWorkers.length} حركة ${label} على الجهاز وتنتظر الاتصال.`);
      }
      setBusy('');
      return true;
    } catch (e) {
      setSaveProof({ status: 'error' });
      setErr(e.message || String(e));
      setBusy('');
      return false;
    }
  }

  async function removeAttendance(worker) {
    const row = marks[worker.id];
    if (!row?.id) return;
    if (!window.confirm(`إلغاء تسجيل ${worker.full_name} لهذا اليوم؟`)) return;
    setBusy(`undo-${worker.id}`);
    setErr('');
    try {
      const { error } = await supabase.rpc('fn_remove_attendance_entry', { p_attendance_id: row.id });
      if (error) throw error;
      setMarks((current) => {
        const next = { ...current };
        delete next[worker.id];
        return next;
      });
      setMsg(`أُلغي تسجيل ${worker.full_name}`);
    } catch (e) {
      setErr('تعذر إلغاء التسجيل: ' + (e.message || e));
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
    workers: workers.filter((w) => w.contractor_id === contractor.id),
  })), [contractors, workers]);

  const visibleWorkers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workers
      .filter((w) => !activeContractor || w.contractor_id === activeContractor)
      .filter((w) => !q || [w.full_name, w.trade, LABOR_CLASS[w.labor_class]].filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)));
  }, [workers, activeContractor, search]);

  const pendingWorkers = visibleWorkers.filter((w) => !marks[w.id]);
  const doneWorkers = visibleWorkers.filter((w) => marks[w.id]);
  const allDayWorkers = workers;
  const fullCount = allDayWorkers.filter((w) => marks[w.id]?.status === 'full').length;
  const halfCount = allDayWorkers.filter((w) => marks[w.id]?.status === 'half').length;
  const absentCount = allDayWorkers.filter((w) => marks[w.id]?.status === 'absent').length;
  const otherCount = allDayWorkers.filter((w) => marks[w.id] && !['full', 'half', 'absent'].includes(marks[w.id]?.status)).length;
  const remainingCount = allDayWorkers.filter((w) => !marks[w.id]).length;
  const completion = allDayWorkers.length ? Math.round(((allDayWorkers.length - remainingCount) / allDayWorkers.length) * 100) : 0;
  const activeContractorRow = grouped.find((g) => g.id === activeContractor);

  const saveLabel = saveProof?.status === 'saving'
    ? 'جارٍ الحفظ…'
    : saveProof?.status === 'verified'
      ? 'آخر حركة محفوظة في الخادم'
      : saveProof?.status === 'queued'
        ? 'هناك حركة محفوظة على الجهاز'
        : saveProof?.status === 'error'
          ? 'آخر محاولة لم تثبت'
          : 'الحفظ الموثق جاهز';

  return (
    <div className={styles.root} dir="rtl">
      <section className={styles.controlBar}>
        <div className={styles.modeTitle}>
          <span>التشغيل اليومي</span>
          <strong>الحضور</strong>
        </div>

        <div className={styles.dateNav} aria-label="التنقل بين الأيام">
          <button type="button" onClick={() => setDate((d) => moveDate(d, 1))} aria-label="اليوم التالي">←</button>
          <div className={styles.dateCenter}>
            <strong>{dateLabel(date)}</strong>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="اختيار التاريخ" />
          </div>
          <button type="button" onClick={() => setDate((d) => moveDate(d, -1))} aria-label="اليوم السابق">→</button>
        </div>

        <button type="button" className={styles.todayButton} onClick={() => setDate(iso(new Date()))}>اليوم</button>

        <div className={`${styles.syncState} ${!online || pendingSync ? styles.syncWarn : ''}`}>
          <span className={online ? styles.onlineDot : styles.offlineDot} />
          <div><strong>{online ? 'متصل' : 'غير متصل'}</strong><small>{saveLabel}</small></div>
          {pendingSync > 0 && <button type="button" onClick={retrySync} disabled={!online || syncing}>{syncing ? '...' : `مزامنة ${pendingSync}`}</button>}
        </div>
      </section>

      {err && <div className={styles.error}>{err}</div>}
      {msg && <div className={styles.success}>{msg}</div>}

      <section className={styles.summaryStrip}>
        <div><span>القوة المسندة</span><strong>{allDayWorkers.length}</strong></div>
        <div className={styles.fullStat}><span>كامل</span><strong>{fullCount}</strong></div>
        <div className={styles.halfStat}><span>نصف يوم</span><strong>{halfCount}</strong></div>
        <div className={styles.absentStat}><span>غياب</span><strong>{absentCount}</strong></div>
        {otherCount > 0 && <div><span>حالات أخرى</span><strong>{otherCount}</strong></div>}
        <div className={remainingCount ? styles.remainingStat : ''}><span>غير مسجل</span><strong>{remainingCount}</strong></div>
        <div className={styles.progressStat}><span>اكتمال اليوم</span><strong>{completion}%</strong></div>
      </section>

      <section className={styles.contractorBar}>
        <div className={styles.contractorTabs}>
          {grouped.map((g) => {
            const groupPending = g.workers.filter((w) => !marks[w.id]).length;
            return (
              <button
                key={g.id}
                type="button"
                className={activeContractor === g.id ? styles.activeContractor : ''}
                onClick={() => setActiveContractor(g.id)}
              >
                <span>{g.operation_alias || g.name_ar}</span>
                <small>{groupPending ? `${groupPending} متبقٍ` : 'مكتمل'}</small>
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
      ) : grouped.length === 0 ? (
        <div className={styles.empty}>لا يوجد مقاول أو عمالة مسندة لهذا المشروع في التاريخ المختار.</div>
      ) : (
        <section className={styles.workArea}>
          <main className={styles.entryPane}>
            <div className={styles.entryHead}>
              <div>
                <span className={styles.eyebrow}>FAST ENTRY</span>
                <h2>غير المسجلين</h2>
                <p>حدد عاملًا أو عدة عمال ثم سجل حالتهم دفعة واحدة، أو سجل العامل مباشرة من صفه.</p>
              </div>
              <div className={styles.entryTools}>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث بالاسم أو الصفة" />
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

          <aside className={styles.reviewPane}>
            <div className={styles.reviewHead}>
              <div><span className={styles.eyebrow}>REVIEW</span><h3>تم التسجيل</h3></div>
              <strong>{doneWorkers.length}</strong>
            </div>
            <div className={styles.reviewList}>
              {doneWorkers.length === 0 ? <div className={styles.reviewEmpty}>لم يتم تسجيل أحد بعد.</div> : doneWorkers.map((worker) => {
                const mark = marks[worker.id];
                const state = mark?.status || 'full';
                return (
                  <div className={styles.reviewRow} key={worker.id}>
                    <span className={`${styles.statusDot} ${styles[`dot_${state}`] || ''}`} />
                    <div><strong>{worker.full_name}</strong><small>{STATUS[state]?.label || state}</small></div>
                    <button type="button" onClick={() => removeAttendance(worker)} disabled={busy === `undo-${worker.id}`}>إلغاء</button>
                  </div>
                );
              })}
            </div>
          </aside>
        </section>
      )}
    </div>
  );
}