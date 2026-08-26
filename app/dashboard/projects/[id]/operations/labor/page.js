'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import ConstitutionDialog from '@/components/ui/ConstitutionDialog';
import { todayIsoInRiyadh } from '@/lib/format';
import { moveOperationalDate } from '@/lib/project-operation-context.mjs';
import { resolveRosterAssignment } from '@/lib/site-operation-roster.mjs';
import { useProjectOperationContext } from '@/lib/use-project-operation-context';
import styles from '../operations.module.css';

const LABOR_CLASS = Object.freeze({ worker: 'عامل', technician: 'صنايعي', foreman: 'فورمان' });
const PAY_BASIS = Object.freeze({ daily: 'يومية', salary: 'راتب شهري', piecework: 'بالوحدة' });
const naturalCompare = (a = '', b = '') => String(a).localeCompare(String(b), 'ar', { numeric: true, sensitivity: 'base' });

function dateLabel(value) {
  if (!value) return '—';
  const [y, m, d] = String(value).split('-').map(Number);
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(y, m - 1, d));
}

const EMPTY_ADD = {
  names: '', labor_class: 'worker', trade: '', pay_basis: 'daily', rate: '', salary: '', salary_days: 30,
  piece_rate: '', piece_unit: 'م2', effective_from: '',
};

export default function ProjectLaborPage() {
  const { id: projectId } = useParams();
  const {
    date,
    contractorId,
    ready: contextReady,
    setDate,
    setContractorId,
  } = useProjectOperationContext(projectId);

  const [contractors, setContractors] = useState([]);
  const [allContractors, setAllContractors] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [addForm, setAddForm] = useState(() => ({ ...EMPTY_ADD }));
  const [editFor, setEditFor] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [moveFor, setMoveFor] = useState(null);
  const [moveForm, setMoveForm] = useState({ contractor_id: '', effective_from: '', daily_rate: '', notes: '' });

  const load = useCallback(async () => {
    if (!contextReady || !projectId || !date) return;
    setLoading(true);
    setLoadError('');
    setErr('');
    try {
      const [linksQ, assignmentsQ, allContractorsQ] = await Promise.all([
        supabase.from('project_contractors')
          .select('contractor_id,basis,worker_daily,tech_daily,start_date,end_date,is_active')
          .eq('project_id', projectId)
          .eq('is_active', true)
          .lte('start_date', date)
          .or(`end_date.is.null,end_date.gte.${date}`),
        supabase.from('labor_project_assignments')
          .select('id,laborer_id,contractor_id,labor_class,trade,pay_basis,daily_rate,valid_from,valid_to')
          .eq('project_id', projectId),
        supabase.from('contractors')
          .select('id,name_ar,operation_alias,contractor_no,worker_daily,tech_daily,is_active')
          .eq('is_active', true)
          .order('name_ar'),
      ]);
      const firstError = [linksQ, assignmentsQ, allContractorsQ].find((query) => query.error)?.error;
      if (firstError) throw firstError;

      const historyAssignments = assignmentsQ.data || [];
      const currentAssignments = historyAssignments.map((row) => {
        const resolved = resolveRosterAssignment(
          historyAssignments.filter((candidate) => candidate.laborer_id === row.laborer_id),
          date,
        );
        return resolved.eligible ? resolved.assignment : null;
      }).filter(Boolean);
      const dedupedAssignments = [...new Map(currentAssignments.map((row) => [row.laborer_id, row])).values()];

      const projectContractorIds = [...new Set([
        ...(linksQ.data || []).map((row) => row.contractor_id),
        ...dedupedAssignments.map((row) => row.contractor_id),
      ].filter(Boolean))];
      const activeContractors = allContractorsQ.data || [];
      const projectContractors = activeContractors
        .filter((row) => projectContractorIds.includes(row.id))
        .map((row) => {
          const link = (linksQ.data || []).find((item) => item.contractor_id === row.id);
          return {
            ...row,
            project_basis: link?.basis || null,
            worker_daily: link?.worker_daily ?? row.worker_daily,
            tech_daily: link?.tech_daily ?? row.tech_daily,
          };
        })
        .sort((a, b) => naturalCompare(a.name_ar, b.name_ar));

      const laborerIds = [...new Set(dedupedAssignments.map((row) => row.laborer_id).filter(Boolean))];
      const laborersQ = laborerIds.length
        ? await supabase.from('laborers')
          .select('id,full_name,labor_class,trade,pay_basis,daily_rate,monthly_salary,salary_days,piece_rate,piece_unit,is_active')
          .in('id', laborerIds)
        : { data: [], error: null };
      if (laborersQ.error) throw laborersQ.error;

      const assignmentByWorker = new Map(dedupedAssignments.map((row) => [row.laborer_id, row]));
      const rows = (laborersQ.data || []).map((worker) => {
        const assignment = assignmentByWorker.get(worker.id);
        return {
          ...worker,
          contractor_id: assignment?.contractor_id || null,
          labor_class: assignment?.labor_class || worker.labor_class,
          trade: assignment?.trade || worker.trade,
          pay_basis: assignment?.pay_basis || worker.pay_basis || 'daily',
          daily_rate: assignment?.daily_rate ?? worker.daily_rate,
          assignment_id: assignment?.id || null,
          assignment_from: assignment?.valid_from || null,
          assignment_to: assignment?.valid_to || null,
        };
      }).filter((worker) => worker.assignment_id).sort((a, b) => naturalCompare(a.full_name, b.full_name));

      setAllContractors(activeContractors);
      setContractors(projectContractors);
      setWorkers(rows);
      const selectedStillExists = contractorId && projectContractors.some((row) => row.id === contractorId);
      if (!selectedStillExists) setContractorId(projectContractors[0]?.id || '');
      setAddForm((current) => ({ ...current, effective_from: current.effective_from || date }));
    } catch (error) {
      const message = 'تعذر تحميل عمالة المشروع: ' + (error.message || error);
      setLoadError(message);
      setErr(message);
      setContractors([]);
      setWorkers([]);
    }
    setLoading(false);
  }, [contextReady, date, projectId, setContractorId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    setAddForm((current) => ({ ...current, effective_from: date }));
  }, [date]);

  const selectedContractor = contractors.find((row) => row.id === contractorId) || null;
  const visibleWorkers = useMemo(
    () => workers.filter((worker) => !contractorId || worker.contractor_id === contractorId),
    [contractorId, workers],
  );

  function rateForTarget(targetId, worker = moveFor) {
    if (!targetId || !worker || worker.pay_basis !== 'daily') return '';
    const target = contractors.find((row) => row.id === targetId) || allContractors.find((row) => row.id === targetId);
    if (!target) return '';
    const rate = worker.labor_class === 'technician' ? target.tech_daily : target.worker_daily;
    return rate == null ? '' : String(rate);
  }

  async function addWorkers(event) {
    event.preventDefault();
    if (!contractorId) { setErr('اختر المقاول أولًا.'); return; }
    const names = String(addForm.names || '').split(/\n|،/).map((value) => value.trim()).filter(Boolean);
    if (!names.length) { setErr('اكتب أسماء العمال، كل اسم في سطر.'); return; }
    setBusy('add'); setErr(''); setMsg('');
    try {
      const { data, error } = await supabase.rpc('fn_quick_add_workers', {
        p_project_id: projectId,
        p_contractor_id: contractorId,
        p_effective_from: addForm.effective_from || date,
        p_names: names,
        p_labor_class: addForm.labor_class || 'worker',
        p_trade: addForm.trade || null,
        p_pay_basis: addForm.pay_basis || 'daily',
        p_daily_rate: addForm.pay_basis === 'daily' ? (Number(addForm.rate) || null) : null,
        p_monthly_salary: addForm.pay_basis === 'salary' ? (Number(addForm.salary) || null) : null,
        p_salary_days: Number(addForm.salary_days || 30),
        p_piece_rate: addForm.pay_basis === 'piecework' ? (Number(addForm.piece_rate) || null) : null,
        p_piece_unit: addForm.piece_unit || 'م2',
      });
      if (error) throw error;
      const result = Array.isArray(data) ? data : [];
      const created = result.filter((row) => row.status === 'created').length;
      const existing = result.filter((row) => row.status === 'existing').length;
      const transfer = result.filter((row) => row.status === 'needs_transfer').map((row) => row.name);
      setMsg(`أضيف ${created} · موجود مسبقًا ${existing}`);
      if (transfer.length) setErr(`لم يُنقل تلقائيًا: ${transfer.join('، ')}. هؤلاء مرتبطون بإسناد آخر ويحتاجون استخدام «نقل» حتى يبقى التاريخ صحيحًا.`);
      setAddForm({ ...EMPTY_ADD, effective_from: date });
      await load();
    } catch (error) {
      setErr('تعذر إضافة العمال: ' + (error.message || error));
    }
    setBusy('');
  }

  function openEdit(worker) {
    setEditFor(worker);
    setEditForm({
      full_name: worker.full_name || '',
      labor_class: worker.labor_class || 'worker',
      trade: worker.trade || '',
      pay_basis: worker.pay_basis || 'daily',
      daily_rate: worker.daily_rate || '',
      monthly_salary: worker.monthly_salary || '',
      salary_days: worker.salary_days || 30,
      piece_rate: worker.piece_rate || '',
      piece_unit: worker.piece_unit || 'م2',
      valid_from: worker.assignment_from || date,
      valid_to: worker.assignment_to || '',
      reason: '',
    });
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (!editFor) return;
    if (!editForm.reason.trim()) { setErr('اكتب سبب التعديل لحفظ الأثر التاريخي.'); return; }
    setBusy('edit'); setErr(''); setMsg('');
    try {
      const { error } = await supabase.rpc('fn_update_labor_assignment', {
        p_assignment_id: editFor.assignment_id,
        p_full_name: editForm.full_name,
        p_labor_class: editForm.labor_class,
        p_trade: editForm.trade || null,
        p_pay_basis: editForm.pay_basis,
        p_daily_rate: editForm.pay_basis === 'daily' ? (Number(editForm.daily_rate) || null) : null,
        p_monthly_salary: editForm.pay_basis === 'salary' ? (Number(editForm.monthly_salary) || null) : null,
        p_salary_days: Number(editForm.salary_days || 30),
        p_piece_rate: editForm.pay_basis === 'piecework' ? (Number(editForm.piece_rate) || null) : null,
        p_piece_unit: editForm.piece_unit || null,
        p_valid_from: editForm.valid_from,
        p_valid_to: editForm.valid_to || null,
        p_reason: editForm.reason,
      });
      if (error) throw error;
      setMsg(`حُفظ تعديل ${editForm.full_name} مع الاحتفاظ بالسجل السابق.`);
      setEditFor(null);
      await load();
    } catch (error) {
      setErr('تعذر تعديل العامل: ' + (error.message || error));
    }
    setBusy('');
  }

  function openMove(worker) {
    setMoveFor(worker);
    setMoveForm({ contractor_id: '', effective_from: date, daily_rate: '', notes: '' });
  }

  function changeMoveContractor(targetId) {
    setMoveForm((form) => ({ ...form, contractor_id: targetId, daily_rate: rateForTarget(targetId, moveFor) }));
  }

  async function saveMove(event) {
    event.preventDefault();
    if (!moveFor || !moveForm.contractor_id) return;
    setBusy('move'); setErr(''); setMsg('');
    try {
      const { error } = await supabase.rpc('fn_move_laborer', {
        p_laborer_id: moveFor.id,
        p_project_id: projectId,
        p_contractor_id: moveForm.contractor_id,
        p_effective_from: moveForm.effective_from || date,
        p_labor_class: moveFor.labor_class,
        p_trade: moveFor.trade || null,
        p_pay_basis: moveFor.pay_basis || 'daily',
        p_daily_rate: moveFor.pay_basis === 'daily' && moveForm.daily_rate !== '' ? Number(moveForm.daily_rate) : null,
        p_notes: moveForm.notes || 'نقل من إدارة عمالة المشروع',
      });
      if (error) throw error;
      const movedName = moveFor.full_name;
      setMoveFor(null);
      setContractorId(moveForm.contractor_id);
      setMsg(`تم نقل ${movedName} مع حفظ تاريخه السابق واعتماد أجر الإسناد الجديد.`);
      await load();
    } catch (error) {
      setErr('تعذر نقل العامل: ' + (error.message || error));
    }
    setBusy('');
  }

  if (!contextReady || loading) return <div className={styles.loading}>جارٍ فتح عمالة المشروع…</div>;

  return <div className={styles.root} dir="rtl">
    <section className={styles.controlBar}>
      <div className={styles.modeTitle}><span>التشغيل اليومي</span><strong>العمالة</strong></div>
      <div className={styles.dateNav} aria-label="تاريخ إسناد العمالة">
        <button type="button" onClick={() => setDate((current) => moveOperationalDate(current, 1))} aria-label="اليوم التالي">←</button>
        <div className={styles.dateCenter}><strong>{dateLabel(date)}</strong><input aria-label="اختيار تاريخ إسناد العمالة" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div>
        <button type="button" onClick={() => setDate((current) => moveOperationalDate(current, -1))} aria-label="اليوم السابق">→</button>
      </div>
      <button type="button" className={styles.todayButton} onClick={() => setDate(todayIsoInRiyadh())}>اليوم</button>
    </section>

    {err && <div className={styles.error}>{err}</div>}
    {msg && <div className={styles.success}>{msg}</div>}

    {loadError ? <div className={styles.error}>تعذر قراءة إسنادات العمالة. لن نعرض حالة «لا توجد عمالة» حتى لا تُنشأ بيانات فوق سجل غير مقروء.</div> : <>
    <section className={styles.summaryStrip}>
      <div><span>عمالة المشروع في التاريخ</span><strong>{workers.length}</strong></div>
      <div><span>لدى المقاول المختار</span><strong>{visibleWorkers.length}</strong></div>
      <div><span>عمال</span><strong>{visibleWorkers.filter((worker) => worker.labor_class === 'worker').length}</strong></div>
      <div><span>صنايعية</span><strong>{visibleWorkers.filter((worker) => worker.labor_class === 'technician').length}</strong></div>
    </section>

    <section className={styles.contractorBar}>
      <div className={styles.contractorTabs}>
        {contractors.map((contractor) => <button key={contractor.id} type="button" className={contractorId === contractor.id ? styles.activeContractor : ''} onClick={() => setContractorId(contractor.id)}><span>{contractor.operation_alias || contractor.name_ar}</span><small>{workers.filter((worker) => worker.contractor_id === contractor.id).length} فرد</small></button>)}
      </div>
      <div className={styles.contractorMeta}><strong>{selectedContractor?.name_ar || '—'}</strong><span>الإسناد الفعلي في {date}</span></div>
    </section>

    {!selectedContractor ? <div className={styles.empty}>لا يوجد مقاول مرتبط بالمشروع في التاريخ المختار. ابدأ الإسناد من «النطاق والإسناد» أولًا.</div> : <section className={styles.operationGrid}>
      <main className={styles.formPane}>
        <div className={styles.panelTitle}><div><span>QUICK ADD</span><h2>إضافة عمالة</h2><p>كل اسم في سطر. الإضافة تُسند الأفراد للمقاول والتاريخ المختارين مباشرة.</p></div></div>
        <form className={styles.operationForm} onSubmit={addWorkers}>
          <label className={styles.wideField}><span>الأسماء</span><textarea rows="6" value={addForm.names} onChange={(event) => setAddForm((form) => ({ ...form, names: event.target.value }))} placeholder={'أحمد محمد\nمحمد علي'} /></label>
          <label><span>الصفة</span><select value={addForm.labor_class} onChange={(event) => setAddForm((form) => ({ ...form, labor_class: event.target.value }))}>{Object.entries(LABOR_CLASS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label><span>المهنة</span><input value={addForm.trade} onChange={(event) => setAddForm((form) => ({ ...form, trade: event.target.value }))} /></label>
          <label><span>طريقة الأجر</span><select value={addForm.pay_basis} onChange={(event) => setAddForm((form) => ({ ...form, pay_basis: event.target.value }))}>{Object.entries(PAY_BASIS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          {addForm.pay_basis === 'daily' && <label><span>اليومية</span><input type="number" min="0" step="0.01" value={addForm.rate} onChange={(event) => setAddForm((form) => ({ ...form, rate: event.target.value }))} /></label>}
          {addForm.pay_basis === 'salary' && <><label><span>الراتب الشهري</span><input type="number" min="0" step="0.01" value={addForm.salary} onChange={(event) => setAddForm((form) => ({ ...form, salary: event.target.value }))} /></label><label><span>أيام احتساب الراتب</span><input type="number" min="1" value={addForm.salary_days} onChange={(event) => setAddForm((form) => ({ ...form, salary_days: event.target.value }))} /></label></>}
          {addForm.pay_basis === 'piecework' && <><label><span>سعر الوحدة</span><input type="number" min="0" step="0.01" value={addForm.piece_rate} onChange={(event) => setAddForm((form) => ({ ...form, piece_rate: event.target.value }))} /></label><label><span>الوحدة</span><input value={addForm.piece_unit} onChange={(event) => setAddForm((form) => ({ ...form, piece_unit: event.target.value }))} /></label></>}
          <label><span>سريان الإسناد من</span><input type="date" value={addForm.effective_from || date} onChange={(event) => setAddForm((form) => ({ ...form, effective_from: event.target.value }))} /></label>
          <button type="submit" className={styles.primaryAction} disabled={busy === 'add'}>{busy === 'add' ? 'جارٍ الإضافة…' : 'إضافة العمالة'}</button>
        </form>
      </main>

      <aside className={styles.historyPane}>
        <div className={styles.historyHead}><div><span>CURRENT ROSTER</span><strong>العمالة الحالية</strong></div><b>{visibleWorkers.length}</b></div>
        <div className={styles.activityList}>{visibleWorkers.length === 0 ? <div className={styles.panelEmpty}>لا توجد عمالة مسندة لهذا المقاول في التاريخ المختار.</div> : visibleWorkers.map((worker) => <div className={styles.activityRow} key={worker.id}><div><strong>{worker.full_name}</strong><small>{LABOR_CLASS[worker.labor_class] || worker.labor_class} · {worker.trade || 'بلا مهنة'} · {PAY_BASIS[worker.pay_basis] || worker.pay_basis}</small></div><div><button type="button" className="btn ghost" onClick={() => openEdit(worker)}>تعديل</button> <button type="button" className="btn ghost" onClick={() => openMove(worker)}>نقل</button></div></div>)}</div>
      </aside>
    </section>}
    </>}

    {editFor && <ConstitutionDialog title={`تعديل: ${editFor.full_name}`} description="التعديل يحفظ الأثر التاريخي ولا يعيد كتابة الحضور المالي السابق." size="wide" onClose={() => setEditFor(null)}>
      <form className={styles.operationForm} onSubmit={saveEdit}>
        <label><span>الاسم</span><input required value={editForm.full_name || ''} onChange={(event) => setEditForm((form) => ({ ...form, full_name: event.target.value }))} /></label>
        <label><span>الصفة</span><select value={editForm.labor_class || 'worker'} onChange={(event) => setEditForm((form) => ({ ...form, labor_class: event.target.value }))}>{Object.entries(LABOR_CLASS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label><span>المهنة</span><input value={editForm.trade || ''} onChange={(event) => setEditForm((form) => ({ ...form, trade: event.target.value }))} /></label>
        <label><span>طريقة الأجر</span><select value={editForm.pay_basis || 'daily'} onChange={(event) => setEditForm((form) => ({ ...form, pay_basis: event.target.value }))}>{Object.entries(PAY_BASIS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        {editForm.pay_basis === 'daily' && <label><span>اليومية</span><input type="number" min="0" step="0.01" value={editForm.daily_rate || ''} onChange={(event) => setEditForm((form) => ({ ...form, daily_rate: event.target.value }))} /></label>}
        {editForm.pay_basis === 'salary' && <><label><span>الراتب الشهري</span><input type="number" min="0" step="0.01" value={editForm.monthly_salary || ''} onChange={(event) => setEditForm((form) => ({ ...form, monthly_salary: event.target.value }))} /></label><label><span>أيام الاحتساب</span><input type="number" min="1" value={editForm.salary_days || 30} onChange={(event) => setEditForm((form) => ({ ...form, salary_days: event.target.value }))} /></label></>}
        {editForm.pay_basis === 'piecework' && <><label><span>سعر الوحدة</span><input type="number" min="0" step="0.01" value={editForm.piece_rate || ''} onChange={(event) => setEditForm((form) => ({ ...form, piece_rate: event.target.value }))} /></label><label><span>الوحدة</span><input value={editForm.piece_unit || ''} onChange={(event) => setEditForm((form) => ({ ...form, piece_unit: event.target.value }))} /></label></>}
        <label><span>من تاريخ</span><input required type="date" value={editForm.valid_from || ''} onChange={(event) => setEditForm((form) => ({ ...form, valid_from: event.target.value }))} /></label>
        <label><span>إلى تاريخ</span><input type="date" value={editForm.valid_to || ''} onChange={(event) => setEditForm((form) => ({ ...form, valid_to: event.target.value }))} /></label>
        <label className={styles.wideField}><span>سبب التعديل *</span><input required value={editForm.reason || ''} onChange={(event) => setEditForm((form) => ({ ...form, reason: event.target.value }))} placeholder="مثال: تصحيح صفة العامل" /></label>
        <button type="submit" className={styles.primaryAction} disabled={busy === 'edit'}>{busy === 'edit' ? 'جارٍ الحفظ…' : 'حفظ التعديل'}</button>
      </form>
    </ConstitutionDialog>}

    {moveFor && <ConstitutionDialog title={`نقل: ${moveFor.full_name}`} description="ينتهي الإسناد السابق قبل تاريخ النقل ويبدأ الإسناد الجديد مع حفظ التاريخ. اليومية أدناه تخص الإسناد الجديد." size="compact" onClose={() => setMoveFor(null)}>
      <form className={styles.operationForm} onSubmit={saveMove}>
        <label className={styles.wideField}><span>المقاول الجديد</span><select required value={moveForm.contractor_id} onChange={(event) => changeMoveContractor(event.target.value)}><option value="">اختر المقاول</option>{allContractors.filter((contractor) => contractor.id !== moveFor.contractor_id).map((contractor) => <option key={contractor.id} value={contractor.id}>{contractor.name_ar}</option>)}</select></label>
        <label><span>من تاريخ</span><input required type="date" value={moveForm.effective_from} onChange={(event) => setMoveForm((form) => ({ ...form, effective_from: event.target.value }))} /></label>
        {moveFor.pay_basis === 'daily' && <label><span>يومية الإسناد الجديد</span><input type="number" min="0" step="0.01" value={moveForm.daily_rate} onChange={(event) => setMoveForm((form) => ({ ...form, daily_rate: event.target.value }))} placeholder="يُستخدم سعر المقاول الجديد إذا تُرك فارغًا" /></label>}
        <label className={styles.wideField}><span>ملاحظة</span><input value={moveForm.notes} onChange={(event) => setMoveForm((form) => ({ ...form, notes: event.target.value }))} /></label>
        <button type="submit" className={styles.primaryAction} disabled={busy === 'move'}>{busy === 'move' ? 'جارٍ النقل…' : 'نقل العامل'}</button>
      </form>
    </ConstitutionDialog>}
  </div>;
}
