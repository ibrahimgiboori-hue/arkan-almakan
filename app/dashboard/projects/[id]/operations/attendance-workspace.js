'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { receiptLabel } from '@/lib/operation-safety.mjs';
import { useProjectOperationContext } from '@/lib/use-project-operation-context';
import { projectAttendanceService } from '@/lib/application/project-attendance-service';
import {
  PROJECT_ATTENDANCE_LABOR_CLASS,
  PROJECT_ATTENDANCE_STATUS,
  createProjectAttendanceDraft,
  planProjectAttendanceLedger,
  projectAttendanceLedgerKey,
  projectAttendanceLedgerRows,
  projectAttendanceMarksForLedger,
  projectAttendanceRosterForDate,
  summarizeProjectAttendanceLedger,
} from '@/lib/project-attendance.mjs';
import RawGrid, { RawGridFooter, rawGridStyles } from '@/components/ui/RawGrid';
import ProjectLedgerFilterBar from '@/components/project/ProjectLedgerFilterBar';
import styles from './operations.module.css';

const WEEKDAY = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { weekday: 'short' });

function dayText(value) {
  if (!value) return '';
  const [y, m, d] = String(value).split('-');
  return `${d}/${m}/${y}`;
}

function dayLabel(value) {
  if (!value) return '—';
  const [y, m, d] = String(value).split('-').map(Number);
  return `${WEEKDAY.format(new Date(y, m - 1, d))} ${dayText(value)}`;
}

function daysText(count) {
  if (count === 1) return 'يوم واحد';
  if (count === 2) return 'يومين';
  return count <= 10 ? `${count} أيام` : `${count} يومًا`;
}

function queuedNotice(result, subject) {
  return result?.error
    ? `تعذّر حفظ ${subject} على الخادم الآن (${result.error.message || result.error}) — بقيت في انتظار إعادة المحاولة، فتحقّق قبل الاعتماد عليها.`
    : `حُفظت ${subject} على هذا الجهاز وتنتظر عودة الاتصال.`;
}

const blankDrafts = (count, date) => [...Array(count)].map(() => createProjectAttendanceDraft({ date }));
const isBlankDraft = (draft) => !draft.laborer_id && !draft.status;
const statusOptions = [{ value: 'full', label: PROJECT_ATTENDANCE_STATUS.full.label }, { value: 'half', label: PROJECT_ATTENDANCE_STATUS.half.label }];

/**
 * سجل الحضور: ورقة واحدة مستمرة للمشروع كله — صف لكل عامل في كل يوم (التاريخ، العامل، المقاول، الحضور).
 * لا ورقة جديدة لكل يوم ولا لكل مقاول: الفلترة (المقاول، الفترة، البحث) هي التي تحدد ما يظهر.
 * الصفوف الجديدة تُكتب أو تُلصق من إكسل أسفل السجل، والتعديلات تُحفظ مرة واحدة: كتابة موثقة لكل يوم
 * فيه حضور جديد، وإلغاء مثبت لكل تسجيل مُسح. الخانة الفارغة غياب تلقائي.
 */
export default function AttendanceWorkspace({ service = projectAttendanceService } = {}) {
  const { id: projectId } = useParams();
  const context = useProjectOperationContext(projectId);
  const { date: entryDate, contractorId, from, to, search, ready: contextReady, setDate } = context;

  const [ledger, setLedger] = useState({ contractors: [], laborers: [], assignmentRows: [] });
  const [marks, setMarks] = useState({});
  const [changes, setChanges] = useState({});
  const [drafts, setDrafts] = useState(() => blankDrafts(3, entryDate));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [saveProof, setSaveProof] = useState(null);
  const [online, setOnline] = useState(true);
  const [pendingSync, setPendingSync] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const rangeKey = `${from}|${to}`;
  const rangeRef = useRef(rangeKey);
  const loadSeqRef = useRef(0);

  useEffect(() => { rangeRef.current = rangeKey; }, [rangeKey]);

  const load = useCallback(async () => {
    if (!contextReady || !projectId || !from || !to) return;
    const requestRange = `${from}|${to}`;
    const requestSeq = ++loadSeqRef.current;
    setLoading(true);
    setLoadError('');
    try {
      const result = await service.loadRange({ projectId, from, to });
      if (requestSeq !== loadSeqRef.current || rangeRef.current !== requestRange) return;
      setLedger(result);
      // Server truth replaces what was read before; records still waiting for the network stay visible and locked.
      setMarks((current) => ({
        ...result.marks,
        ...Object.fromEntries(Object.entries(current).filter(([, mark]) => mark.pending)),
      }));
    } catch (error) {
      if (requestSeq !== loadSeqRef.current || rangeRef.current !== requestRange) return;
      const message = 'تعذر فتح سجل الحضور: ' + (error.message || error);
      setLoadError(message);
      setLedger({ contractors: [], laborers: [], assignmentRows: [] });
      setMarks({});
    } finally {
      if (requestSeq === loadSeqRef.current && rangeRef.current === requestRange) setLoading(false);
    }
  }, [contextReady, from, to, projectId, service]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setChanges({}); }, [rangeKey]);

  // New rows default to the entry day; keep that day inside the period being shown.
  useEffect(() => {
    if (!contextReady || !from || !to) return;
    if (entryDate < from || entryDate > to) setDate(to);
  }, [contextReady, entryDate, from, to, setDate]);
  useEffect(() => {
    setDrafts((current) => current.map((draft) => (isBlankDraft(draft) && draft.date !== entryDate ? { ...draft, date: entryDate } : draft)));
  }, [entryDate]);

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

  const rosterFor = useMemo(() => {
    const cache = new Map();
    return (day) => {
      if (!day) return [];
      if (!cache.has(day)) cache.set(day, projectAttendanceRosterForDate({ date: day, assignmentRows: ledger.assignmentRows, laborers: ledger.laborers }));
      return cache.get(day);
    };
  }, [ledger]);
  const contractorName = useMemo(() => {
    const byId = new Map(ledger.contractors.map((contractor) => [contractor.id, contractor.operation_alias || contractor.name_ar]));
    return (id) => byId.get(id) || '';
  }, [ledger.contractors]);
  const workerName = useMemo(() => {
    const byId = new Map(ledger.laborers.map((worker) => [worker.id, worker.full_name]));
    return (id) => byId.get(id) || '';
  }, [ledger.laborers]);

  async function writeAttendance(day, entries) {
    if (!entries.length) return null;
    setSaveProof({ status: 'saving' });
    const result = await service.saveEntries({ projectId, date: day, entries });
    setPendingSync(result?.pendingCount || 0);
    if (result.status === 'verified') setSaveProof({ status: 'verified', receipt: result.receipt });
    else setSaveProof({ status: 'queued', requestId: result.requestId });
    const placementOf = (laborerId) => {
      const worker = rosterFor(day).find((item) => item.id === laborerId);
      return worker ? { contractor_id: worker.contractor_id, labor_class: worker.labor_class, trade: worker.trade } : {};
    };
    setMarks((current) => ({ ...current, ...projectAttendanceMarksForLedger(result.marks, day, placementOf) }));
    return result;
  }

  // One cleared registration → a confirmed removal. Returns true only when the server removed it.
  async function removeMark(key, row) {
    if (row.protected) throw new Error(`تسجيل ${workerName(row.laborer_id)} يوم ${dayText(row.work_date)} حالة تاريخية محفوظة ولا تُلغى من السجل.`);
    if (row.pending || !row.id) throw new Error(`تسجيل ${workerName(row.laborer_id)} بانتظار المزامنة؛ لا يمكن إلغاؤه قبل أن يثبته الخادم.`);
    if (key !== projectAttendanceLedgerKey(row.work_date, row.laborer_id)) throw new Error('تغيّر السجل المعروض. حدّث الفترة قبل تعديل هذا الصف.');
    await service.removeEntry({ mark: row, date: row.work_date });
    setMarks((current) => {
      if (current[key]?.id !== row.id) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    return true;
  }

  async function saveSheet() {
    const plan = planProjectAttendanceLedger({ marks, changes, drafts, rosterFor, from, to });
    if (plan.errors.length) { setErr(plan.errors.slice(0, 4).join(' ')); return; }
    const settledChanges = new Set(plan.settledChanges);
    const settledDrafts = new Set(plan.settledDrafts);
    if (!plan.days.length) {
      if (plan.blocked.length) setErr('لم تتغير هذه الصفوف: ' + plan.blocked.join('، '));
      return;
    }
    setBusy('sheet');
    setErr('');
    setMsg('');
    let written = 0;
    let writtenDays = 0;
    let queued = 0;
    let removed = 0;
    let lastReceipt = null;
    let queuedResult = null;
    try {
      for (const day of plan.days) {
        if (day.entries.length) {
          const result = await writeAttendance(day.date, day.entries);
          day.entries.forEach(({ key, draftId }) => { if (draftId) settledDrafts.add(draftId); else settledChanges.add(key); });
          if (result?.status === 'verified') { written += day.entries.length; writtenDays += 1; lastReceipt = result.receipt; } else { queued += day.entries.length; queuedResult = result; }
        }
        for (const { key, mark } of day.removals) {
          if (await removeMark(key, mark)) { removed += 1; settledChanges.add(key); }
        }
      }
      if (plan.blocked.length) setErr('لم تتغير هذه الصفوف: ' + plan.blocked.join('، '));
    } catch (error) {
      setSaveProof({ status: 'error' });
      setErr(error.message || String(error));
    }
    setChanges((current) => {
      const next = { ...current };
      settledChanges.forEach((key) => { delete next[key]; });
      return next;
    });
    setDrafts((current) => {
      const next = current.filter((draft) => !settledDrafts.has(draft._id));
      const open = next.filter(isBlankDraft).length;
      return open >= 2 ? next : [...next, ...blankDrafts(2 - open, entryDate)];
    });
    const parts = [];
    if (written) parts.push([`سُجّل ${written} حضور على ${daysText(writtenDays)}`, receiptLabel(lastReceipt)].filter(Boolean).join(' · '));
    if (queued) parts.push(queuedNotice(queuedResult, `${queued} حركة حضور`));
    if (removed) parts.push(`أُلغي ${removed} تسجيل وأصبح غيابًا تلقائيًا`);
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
      setMarks((current) => Object.fromEntries(Object.entries(current).filter(([, mark]) => !mark.pending)));
      await load();
    }
  }

  // The roster on the entry day, narrowed by the contractor filter — the people a new row can name.
  const entryRoster = useMemo(
    () => rosterFor(entryDate).filter((worker) => !contractorId || worker.contractor_id === contractorId),
    [rosterFor, entryDate, contractorId],
  );
  const savedRows = useMemo(() => projectAttendanceLedgerRows({
    marks, laborers: ledger.laborers, contractors: ledger.contractors, from, to, contractorId, search,
  }).map((row) => ({
    ...row,
    status: Object.prototype.hasOwnProperty.call(changes, row._id) ? changes[row._id] : (row.mark.status || ''),
    dirty: Object.prototype.hasOwnProperty.call(changes, row._id) && (changes[row._id] || '') !== (row.mark.status || ''),
  })), [marks, ledger, from, to, contractorId, search, changes]);
  const rows = useMemo(() => [...savedRows, ...drafts], [savedRows, drafts]);
  const summary = summarizeProjectAttendanceLedger(savedRows, (row) => row.status);
  // Edits hidden by a filter still count: the filter only narrows what is shown, like Excel.
  const dirtyCount = Object.entries(changes).filter(([key, value]) => marks[key] && (value || '') !== (marks[key].status || '')).length
    + drafts.filter((draft) => draft.status).length;
  const entryUnmarked = entryRoster.filter((worker) => !marks[projectAttendanceLedgerKey(entryDate, worker.id)]
    && !drafts.some((draft) => draft.date === entryDate && draft.laborer_id === worker.id));
  const periodHasLabor = ledger.assignmentRows.some((row) => !contractorId || row.contractor_id === contractorId);

  function addEntryRoster() {
    if (!entryUnmarked.length) return;
    setDrafts((current) => [
      ...current.filter((draft) => !isBlankDraft(draft)),
      ...entryUnmarked.map((worker) => createProjectAttendanceDraft({ date: entryDate, laborer_id: worker.id })),
      ...blankDrafts(1, entryDate),
    ]);
  }

  function patchRows(list) {
    const draftPatches = new Map();
    const statusChanges = {};
    for (const { key, patch } of list) {
      if (drafts.some((draft) => draft._id === key)) draftPatches.set(key, { ...(draftPatches.get(key) || {}), ...patch });
      else if (Object.prototype.hasOwnProperty.call(patch, 'status')) statusChanges[key] = patch.status || '';
    }
    if (draftPatches.size) setDrafts((current) => current.map((draft) => (draftPatches.has(draft._id) ? { ...draft, ...draftPatches.get(draft._id) } : draft)));
    if (Object.keys(statusChanges).length) setChanges((current) => ({ ...current, ...statusChanges }));
  }

  function appendRows(patches) {
    setDrafts((current) => [...current, ...patches.map((patch) => createProjectAttendanceDraft({ date: entryDate, ...patch }))]);
  }

  function removeDraft(row) {
    setDrafts((current) => (current.length > 1 ? current.filter((draft) => draft._id !== row._id) : blankDrafts(1, entryDate)));
  }

  const workerOptions = (row) => {
    const roster = rosterFor(row.date || entryDate);
    const list = roster.filter((worker) => !contractorId || worker.contractor_id === contractorId || worker.id === row.laborer_id);
    return list.map((worker) => ({ value: worker.id, label: worker.full_name }));
  };
  const draftWorker = (row) => rosterFor(row.date || entryDate).find((worker) => worker.id === row.laborer_id) || null;

  const columns = [
    { key: '_index', label: '#', type: 'index', render: (row) => rows.indexOf(row) + 1 },
    {
      key: 'date', label: 'التاريخ', type: 'date', minWidth: 150,
      visible: (row) => !row.persisted,
      placeholderWhenHidden: (row) => dayLabel(row.date),
      sheetValue: (row) => dayText(row.date),
      onChange: (row, value) => ({ date: value }),
    },
    {
      key: 'laborer_id', label: 'العامل', type: 'select', minWidth: 170, emptyOption: '—', options: workerOptions,
      visible: (row) => !row.persisted,
      placeholderWhenHidden: (row) => row.worker_name,
      sheetValue: (row) => (row.persisted ? row.worker_name : workerName(row.laborer_id)),
    },
    {
      key: '_contractor', label: 'المقاول', type: 'computed',
      compute: (row) => (row.persisted ? row.contractor_name : contractorName(draftWorker(row)?.contractor_id)) || null,
    },
    {
      key: '_trade', label: 'المهنة', type: 'computed',
      compute: (row) => {
        const worker = row.persisted ? row : draftWorker(row);
        return worker ? (worker.trade || PROJECT_ATTENDANCE_LABOR_CLASS[worker.labor_class] || null) : null;
      },
    },
    {
      key: 'status', label: 'الحضور', type: 'select', minWidth: 140, emptyOption: 'غياب تلقائي', total: 'count',
      options: statusOptions,
      visible: (row) => !row.mark?.protected,
      placeholderWhenHidden: (row) => PROJECT_ATTENDANCE_STATUS[row.mark?.status]?.label || row.mark?.status,
    },
    {
      key: '_state', label: 'الحفظ', type: 'badge',
      text: (row) => (row.persisted
        ? (row.mark?.pending ? 'بانتظار المزامنة' : row.mark?.protected ? 'حالة محفوظة' : row.dirty ? (row.status ? 'غير محفوظ' : 'سيُلغى') : 'محفوظ')
        : (row.status ? 'جديد' : row.laborer_id ? 'غياب تلقائي' : '')),
      tone: (row) => (row.persisted ? (row.dirty ? 'new' : row.mark?.pending ? 'muted' : 'saved') : row.status ? 'new' : 'muted'),
    },
    {
      key: '_action', label: 'إجراء', type: 'action',
      render: (row, { disabled }) => (row.persisted
        ? <span aria-hidden="true">—</span>
        : <button type="button" className={rawGridStyles.actionButton} onClick={() => removeDraft(row)} disabled={disabled} aria-label="حذف الصف">×</button>),
    },
  ];

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
    <div className={styles.root} dir="rtl" data-project-attendance-workspace="engineered-v1" data-attendance-ledger="project">
      <section className={styles.controlBar}>
        <div className={styles.modeTitle}><span>سجل المشروع</span><strong>الحضور</strong></div>
        <div className={`${styles.syncState} ${!online || pendingSync ? styles.syncWarn : ''}`}>
          <span className={online ? styles.onlineDot : styles.offlineDot} />
          <div><strong>{online ? 'متصل' : 'غير متصل'}</strong><small>{saveLabel}</small></div>
          {pendingSync > 0 && <button type="button" onClick={retrySync} disabled={!online || syncing}>{syncing ? '...' : `مزامنة ${pendingSync}`}</button>}
        </div>
      </section>

      <ProjectLedgerFilterBar context={context} contractors={ledger.contractors} searchPlaceholder="اسم العامل أو المهنة أو المقاول" />

      {err && <div className={styles.error}>{err}</div>}
      {msg && <div className={styles.success}>{msg}</div>}

      <section className={styles.summaryStrip}>
        <div><span>سجلات الفترة</span><strong>{summary.records}</strong></div>
        <div className={styles.fullStat}><span>كامل</span><strong>{summary.full}</strong></div>
        <div className={styles.halfStat}><span>نصف يوم</span><strong>{summary.half}</strong></div>
        <div><span>أيام العمل</span><strong>{summary.workedDays}</strong></div>
        {summary.protected > 0 && <div><span>حالة محفوظة</span><strong>{summary.protected}</strong></div>}
        <div className={styles.absentStat}><span>غياب تلقائي {dayText(entryDate)}</span><strong>{entryUnmarked.length}</strong></div>
      </section>

      {loading ? (
        <div className={styles.loading}>جارٍ فتح سجل الحضور…</div>
      ) : loadError ? (
        <div className={styles.error}>{loadError} — لم تُعرض حالة فارغة بديلة حتى لا تُنشئ بيانات فوق سجل غير مقروء.</div>
      ) : !periodHasLabor && !savedRows.length ? (
        <div className={styles.empty}>
          {contractorId ? 'هذا المقاول بلا عمالة مسندة للمشروع في هذه الفترة.' : 'المشروع بلا عمالة مسندة في هذه الفترة.'}{' '}
          <Link href={`/dashboard/projects/${projectId}/operations/labor`}>أضف أو انقل العمالة من شاشة العمالة</Link>.
        </div>
      ) : (
        <section data-attendance-sheet="true">
          <div className={styles.panelTitle}>
            <div>
              <h2>سجل الحضور</h2>
              <small>صف لكل عامل في كل يوم. اكتب الصفوف الجديدة أسفل السجل أو الصقها من إكسل (التاريخ، العامل، …، الحضور)، أو اضغط «عمالة اليوم» ثم اكتب «كامل» في أول خانة وCtrl+D لأسفل. الخانة الفارغة غياب تلقائي: من يبقى بلا تسجيل يُعامل كغياب تلقائيًا.</small>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <label style={{ display: 'grid', gap: 4 }}>
                <small>تاريخ الصفوف الجديدة</small>
                <input type="date" value={entryDate} min={from} max={to} onChange={(event) => event.target.value && setDate(event.target.value)} aria-label="تاريخ الصفوف الجديدة" />
              </label>
              <button type="button" className={rawGridStyles.plainButton} onClick={addEntryRoster} disabled={Boolean(busy) || !entryUnmarked.length}>
                + عمالة يوم {dayText(entryDate)} ({entryUnmarked.length})
              </button>
            </div>
          </div>
          <RawGrid
            columns={columns}
            rows={rows}
            rowKey={(row) => row._id}
            savedFlag={(row) => row.persisted && !row.dirty}
            rowDisabled={(row) => Boolean(row.mark?.protected || row.mark?.pending)}
            onPatchRows={patchRows}
            onPatchRow={(key, patch) => patchRows([{ key, patch }])}
            onAppendRows={appendRows}
            busy={Boolean(busy)}
            totalsLabel="الحاضرون"
            emptyMessage="لا توجد سجلات حضور في هذه الفترة."
          />
          <RawGridFooter
            actions={<>
              <button type="button" className={rawGridStyles.plainButton} onClick={() => setDrafts((current) => [...current, ...blankDrafts(4, entryDate)])} disabled={Boolean(busy)}>+ 4 صفوف</button>
              <button type="button" className={rawGridStyles.plainButton} onClick={() => { setChanges({}); setDrafts(blankDrafts(3, entryDate)); }} disabled={Boolean(busy) || !dirtyCount}>تراجع عن التعديلات</button>
              <button type="button" className={rawGridStyles.plainButton} onClick={load} disabled={Boolean(busy)}>تحديث السجل</button>
            </>}
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
