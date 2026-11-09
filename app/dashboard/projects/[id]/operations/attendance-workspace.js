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
  PROJECT_ATTENDANCE_LABOR_CLASS,
  PROJECT_ATTENDANCE_STATUS,
  filterProjectAttendanceWorkers,
  groupProjectAttendanceByContractor,
  planProjectAttendanceSheet,
  projectAttendanceCellValue,
  summarizeProjectAttendance,
} from '@/lib/project-attendance.mjs';
import RawGrid, { RawGridFooter, rawGridStyles } from '@/components/ui/RawGrid';
import styles from './operations.module.css';

function dateLabel(value) {
  if (!value) return '—';
  const [y, m, d] = String(value).split('-').map(Number);
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(y, m - 1, d));
}

function queuedNotice(result, subject) {
  return result?.error
    ? `تعذّر حفظ ${subject} على الخادم الآن (${result.error.message || result.error}) — بقيت في انتظار إعادة المحاولة، فتحقّق قبل الاعتماد عليها.`
    : `حُفظت ${subject} على هذا الجهاز وتنتظر عودة الاتصال.`;
}

/**
 * الحضور كورقة إكسل: عمال المقاول صفوف، وعمود «الحضور» يُكتب فيه كامل أو نصف يوم
 * (أو يُلصق من إكسل، أو يُعبّأ لأسفل بـ Ctrl+D)، والخانة الفارغة غياب تلقائي. التعديلات
 * تُحفظ مرة واحدة: كتابة موثقة واحدة للحضور، وإلغاء مثبت لكل تسجيل مُسح.
 */
export default function AttendanceWorkspace({ service = projectAttendanceService } = {}) {
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
  const [changes, setChanges] = useState({});
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
      const workspace = await service.loadDay({ projectId, date: requestDate });
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
  }, [contextReady, date, projectId, setActiveContractor, service]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setChanges({}); }, [date, activeContractor]);

  useEffect(() => {
    const refresh = () => {
      setOnline(navigator.onLine !== false);
      setPendingSync(service.pendingCount());
    };
    refresh();
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
    };
  }, [service]);

  async function writeAttendance(entries) {
    if (!entries.length) return null;
    const requestDate = dateRef.current;
    setSaveProof({ status: 'saving' });
    const result = await service.saveEntries({
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

  // One cleared registration → a confirmed removal. Returns true only when the server removed it.
  async function removeMark(worker, requestDate) {
    const row = marks[worker.id];
    if (!row) return false;
    if (row.protected) throw new Error(`الحالة الحالية لـ${worker.full_name} حالة تاريخية محفوظة ولا تُلغى من الإدخال السريع.`);
    if (row.pending || !row.id) throw new Error(`حركة ${worker.full_name} بانتظار المزامنة؛ لا يمكن إلغاؤها قبل أن يثبتها الخادم.`);
    if (row.work_date && row.work_date !== requestDate) throw new Error('تغيّر اليوم المعروض. أعد فتح اليوم قبل تعديل هذا السجل.');
    await service.removeEntry({ mark: row, date: requestDate });
    if (dateRef.current !== requestDate) return false;
    setMarks((current) => {
      if (current[worker.id]?.id !== row.id) return current;
      const next = { ...current };
      delete next[worker.id];
      return next;
    });
    return true;
  }

  async function saveSheet() {
    const requestDate = dateRef.current;
    const plan = planProjectAttendanceSheet({ workers, marks, changes, date: requestDate });
    if (!plan.entries.length && !plan.removals.length) {
      if (plan.blocked.length) setErr('لم تتغير هذه الصفوف: ' + plan.blocked.join('، '));
      return;
    }
    setBusy('sheet');
    setErr('');
    setMsg('');
    const parts = [];
    const settled = new Set();
    try {
      if (plan.entries.length) {
        const result = await writeAttendance(plan.entries);
        if (result?.stale) { setBusy(''); return; }
        plan.entries.forEach(({ worker }) => settled.add(worker.id));
        parts.push(result?.status === 'verified'
          ? `سُجّل ${plan.entries.length} عاملًا · ${receiptLabel(result.receipt)}`
          : queuedNotice(result, `${plan.entries.length} حركة حضور`));
      }
      let removed = 0;
      for (const worker of plan.removals) {
        if (await removeMark(worker, requestDate)) { removed += 1; settled.add(worker.id); }
      }
      if (removed) parts.push(`أُلغي تسجيل ${removed} وأصبحوا غيابًا تلقائيًا لهذا اليوم`);
      if (plan.blocked.length) setErr('لم تتغير هذه الصفوف: ' + plan.blocked.join('، '));
    } catch (error) {
      setSaveProof({ status: 'error' });
      setErr(error.message || String(error));
    }
    setChanges((current) => {
      const next = { ...current };
      settled.forEach((id) => { delete next[id]; });
      return next;
    });
    if (parts.length) setMsg(parts.join(' · '));
    setBusy('');
  }

  async function retrySync() {
    if (syncing || !online || service.pendingCount() === 0) return;
    setSyncing(true);
    setErr('');
    const result = await service.syncPending(({ status, receipt }) => {
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
  const sheetRows = useMemo(() => visibleWorkers.map((worker) => ({
    ...worker,
    attendance: projectAttendanceCellValue(worker, marks, changes),
    mark: marks[worker.id] || null,
    dirty: Object.prototype.hasOwnProperty.call(changes, worker.id) && (changes[worker.id] || '') !== (marks[worker.id]?.status || ''),
  })), [visibleWorkers, marks, changes]);
  const dirtyCount = sheetRows.filter((row) => row.dirty).length;
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
        <section data-attendance-sheet="true">
          <div className={styles.panelTitle}>
            <div>
              <h2>حضور اليوم</h2>
              <small>اكتب في عمود «الحضور» كامل أو نصف يوم، أو حدّد عدة خانات والصق «كامل» أو اضغط Ctrl+D لتعبئتها لأسفل. الخانة الفارغة غياب تلقائي: من يبقى بلا تسجيل يُعامل كغياب تلقائيًا.</small>
            </div>
            <input aria-label="بحث في عمالة الحضور" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بالاسم أو الصفة" />
          </div>
          <RawGrid
            columns={[
              { key: '_index', label: '#', type: 'index', render: (row) => sheetRows.indexOf(row) + 1 },
              { key: '_name', label: 'العامل', type: 'computed', compute: (row) => row.full_name },
              { key: '_class', label: 'الصفة', type: 'computed', compute: (row) => PROJECT_ATTENDANCE_LABOR_CLASS[row.labor_class] || row.labor_class || null },
              { key: '_trade', label: 'المهنة', type: 'computed', compute: (row) => row.trade || null },
              {
                key: 'attendance', label: 'الحضور', type: 'select', minWidth: 140, emptyOption: 'غياب تلقائي', total: 'count',
                options: [{ value: 'full', label: PROJECT_ATTENDANCE_STATUS.full.label }, { value: 'half', label: PROJECT_ATTENDANCE_STATUS.half.label }],
                visible: (row) => !row.mark?.protected,
                placeholderWhenHidden: (row) => PROJECT_ATTENDANCE_STATUS[row.mark?.status]?.label || row.mark?.status,
              },
              {
                key: '_state', label: 'الحفظ', type: 'badge',
                text: (row) => row.mark?.pending ? 'بانتظار المزامنة' : row.mark?.protected ? 'حالة محفوظة' : row.dirty ? 'غير محفوظ' : row.mark ? 'محفوظ' : 'غياب تلقائي',
                tone: (row) => row.dirty ? 'new' : row.mark && !row.mark.pending ? 'saved' : 'muted',
              },
            ]}
            rows={sheetRows}
            rowKey={(row) => row.id}
            savedFlag={(row) => Boolean(row.mark) && !row.dirty}
            rowDisabled={(row) => Boolean(row.mark?.protected || row.mark?.pending)}
            onPatchRow={(key, patch) => setChanges((current) => ({ ...current, [key]: patch.attendance || '' }))}
            busy={Boolean(busy)}
            totalsLabel="الحاضرون"
          />
          <RawGridFooter
            actions={<button type="button" className={rawGridStyles.plainButton} onClick={() => setChanges({})} disabled={Boolean(busy) || !dirtyCount}>تراجع عن التعديلات</button>}
            summary={<>
              <strong>{dirtyCount ? `تعديلات غير محفوظة: ${dirtyCount}` : 'لا توجد تعديلات غير محفوظة'}</strong>
              <button className={rawGridStyles.primaryButton} type="button" onClick={saveSheet} disabled={Boolean(busy) || !dirtyCount}>{busy === 'sheet' ? 'جارٍ الحفظ…' : 'حفظ الحضور'}</button>
            </>}
          />
        </section>
      )}
    </div>
  );
}
