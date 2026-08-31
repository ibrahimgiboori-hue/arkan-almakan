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
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
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
      const linksQ = await supabase.from('project_contractors')
        .select('contractor_id,basis,worker_daily,tech_daily,start_date,end_date,is_active')
        .eq('project_id', projectId)
        .eq('is_active', true)
        .lte('start_date', date)
        .or(`end_date.is.null,end_date.gte.${date}`);
      if (linksQ.error) throw linksQ.error;

      const projectContractorIds = [...new Set((linksQ.data || []).map((row) => row.contractor_id).filter(Boolean))];
      const contractorsQ = projectContractorIds.length
        ? await supabase.from('contractors')
          .select('id,name_ar,operation_alias,contractor_no,worker_daily,tech_daily,is_active')
          .in('id', projectContractorIds)
          .eq('is_active', true)
          .order('name_ar')
        : { data: [], error: null };
      if (contractorsQ.error) throw contractorsQ.error;

      const projectContractors = (contractorsQ.data || []).map((row) => {
        const link = (linksQ.data || []).find((item) => item.contractor_id === row.id);
        return {
          ...row,
          project_basis: link?.basis || null,
          worker_daily: link?.worker_daily ?? row.worker_daily,
          tech_daily: link?.tech_daily ?? row.tech_daily,
        };
      }).sort((a, b) => naturalCompare(a.name_ar, b.name_ar));

      const laborersQ = projectContractorIds.length
        ? await supabase.from('laborers')
          .select('id,contractor_id,full_name,labor_class,trade,pay_basis,daily_rate,monthly_salary,salary_days,piece_rate,piece_unit,is_active')
          .in('contractor_id', projectContractorIds)
          .eq('is_active', true)
          .order('full_name')
        : { data: [], error: null };
      if (laborersQ.error) throw laborersQ.error;

      const laborerIds = (laborersQ.data || []).map((row) => row.id);
      const assignmentsQ = laborerIds.length
        ? await supabase.from('labor_project_assignments')
          .select('id,laborer_id,project_id,contractor_id,labor_class,trade,pay_basis,daily_rate,valid_from,valid_to,is_active,created_at')
          .in('laborer_id', laborerIds)
        : { data: [], error: null };
      if (assignmentsQ.error) throw assignmentsQ.error;

      const historyAssignments = assignmentsQ.data || [];
      const rosterRows = (laborersQ.data || []).map((worker) => {
        const resolved = resolveRosterAssignment(
          historyAssignments.filter((candidate) => candidate.laborer_id === worker.id),
          date,
        );
        const assignment = resolved.eligible ? resolved.assignment : null;
        return {
          ...worker,
          current_assignment: assignment,
          assignment_id: assignment?.project_id === projectId ? assignment.id : null,
          assignment_from: assignment?.project_id === projectId ? assignment.valid_from : null,
          assignment_to: assignment?.project_id === projectId ? assignment.valid_to : null,
          labor_class: assignment?.project_id === projectId ? (assignment.labor_class || worker.labor_class) : worker.labor_class,
          trade: assignment?.project_id === projectId ? (assignment.trade || worker.trade) : worker.trade,
          pay_basis: assignment?.project_id === projectId ? (assignment.pay_basis || worker.pay_basis) : worker.pay_basis,
          daily_rate: assignment?.project_id === projectId ? (assignment.daily_rate ?? worker.daily_rate) : worker.daily_rate,
        };
      }).sort((a, b) => naturalCompare(a.full_name, b.full_name));

      setContractors(projectContractors);
      setRoster(rosterRows);
      const selectedStillExists = contractorId && projectContractors.some((row) => row.id === contractorId);
      if (!selectedStillExists) setContractorId(projectContractors[0]?.id || '');
    } catch (error) {
      const message = 'تعذر تحميل عمالة المشروع: ' + (error.message || error);
      setLoadError(message);
      setErr(message);
      setContractors([]);
      setRoster([]);
    }
    setLoading(false);
  }, [contextReady, date, projectId, contractorId, setContractorId]);

  useEffect(() => { load(); }, [load]);

  const selectedContractor = contractors.find((row) => row.id === contractorId) || null;
  const contractorRoster = useMemo(
    () => roster.filter((worker) => worker.contractor_id === contractorId),
    [contractorId, roster],
  );
  const projectWorkers = useMemo(
    () => contractorRoster.filter((worker) => worker.current_assignment?.project_id === projectId),
    [contractorRoster, projectId],
  );

  async function assignWorker(worker) {
    if (!selectedContractor) return;
    const otherAssignment = worker.current_assignment && worker.current_assignment.project_id !== projectId;
    const key = `${otherAssignment ? 'move-in' : 'assign'}:${worker.id}`;
    setBusy(key); setErr(''); setMsg('');
    try {
      const query = otherAssignment
        ? await supabase.rpc('fn_move_laborer', {
          p_laborer_id: worker.id,
          p_project_id: projectId,
          p_contractor_id: selectedContractor.id,
          p_effective_from: date,
          p_labor_class: worker.labor_class,
          p_trade: worker.trade || null,
          p_pay_basis: worker.pay_basis || 'daily',
          p_daily_rate: worker.pay_basis === 'daily' ? (Number(worker.daily_rate) || null) : null,
          p_notes: 'نقل صريح من إدارة عمالة المشروع',
        })
        : await supabase.rpc('fn_assign_existing_laborer', {
          p_laborer_id: worker.id,
          p_project_id: projectId,
          p_contractor_id: selectedContractor.id,
          p_effective_from: date,
        });
      if (query.error) throw query.error;
      setMsg(otherAssignment ? `نُقل ${worker.full_name} إلى المشروع.` : `أُسند ${worker.full_name} للمشروع.`);
      await load();
    } catch (error) {
      setErr(error.message || String(error));
    }
    setBusy('');
  }

  function rateForTarget(targetId, worker = moveFor) {
    if (!targetId || !worker || worker.pay_basis !== 'daily') return '';
    const target = contractors.find((row) => row.id === targetId);
    if (!target) return '';
    const rate = worker.labor_class === 'technician' ? target.tech_daily : target.worker_daily;
    return rate == null ? '' : String(rate);
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
      setMsg(`حُفظ تعديل ${editForm.full_name}.`);
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
      setMsg(`تم نقل ${movedName} مع حفظ تاريخه السابق.`);
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

    {loadError ? null : <>
      <section className={styles.summaryStrip}>
        <div><span>عمالة المقاول</span><strong>{contractorRoster.length}</strong></div>
        <div><span>مسندة للمشروع</span><strong>{projectWorkers.length}</strong></div>
        <div><span>عمال</span><strong>{projectWorkers.filter((worker) => worker.labor_class === 'worker').length}</strong></div>
        <div><span>صنايعية</span><strong>{projectWorkers.filter((worker) => worker.labor_class === 'technician').length}</strong></div>
      </section>

      <section className={styles.contractorBar}>
        <div className={styles.contractorTabs}>
          {contractors.map((contractor) => <button key={contractor.id} type="button" className={contractorId === contractor.id ? styles.activeContractor : ''} onClick={() => setContractorId(contractor.id)}><span>{contractor.operation_alias || contractor.name_ar}</span><small>{roster.filter((worker) => worker.contractor_id === contractor.id && worker.current_assignment?.project_id === projectId).length} مسند</small></button>)}
        </div>
        <div className={styles.contractorMeta}><strong>{selectedContractor?.name_ar || '—'}</strong><span>{date}</span></div>
      </section>

      {!selectedContractor ? <div className={styles.empty}>لا يوجد مقاول مسند للمشروع في التاريخ المختار.</div> : <section className={styles.operationGrid}>
        <main className={styles.formPane}>
          <div className={styles.panelTitle}><div><h2>عمالة المقاول</h2></div></div>
          <div className={styles.activityList}>
            {contractorRoster.length === 0 ? <div className={styles.panelEmpty}>لا توجد عمالة لدى هذا المقاول.</div> : contractorRoster.map((worker) => {
              const inThisProject = worker.current_assignment?.project_id === projectId;
              const assignedElsewhere = Boolean(worker.current_assignment && !inThisProject);
              const actionKey = `${assignedElsewhere ? 'move-in' : 'assign'}:${worker.id}`;
              return <div className={styles.activityRow} key={worker.id}>
                <div>
                  <strong>{worker.full_name}</strong>
                  <small>{LABOR_CLASS[worker.labor_class] || worker.labor_class} · {worker.trade || '—'} · {PAY_BASIS[worker.pay_basis] || worker.pay_basis}</small>
                </div>
                <div>
                  {inThisProject
                    ? <span className="pill ok">مسند</span>
                    : <button type="button" className="btn" disabled={busy === actionKey} onClick={() => assignWorker(worker)}>{busy === actionKey ? 'جارٍ التنفيذ…' : assignedElsewhere ? 'نقل للمشروع' : 'إسناد'}</button>}
                </div>
              </div>;
            })}
          </div>
        </main>

        <aside className={styles.historyPane}>
          <div className={styles.historyHead}><div><strong>في المشروع</strong></div><b>{projectWorkers.length}</b></div>
          <div className={styles.activityList}>{projectWorkers.length === 0 ? <div className={styles.panelEmpty}>لا توجد عمالة مسندة.</div> : projectWorkers.map((worker) => <div className={styles.activityRow} key={worker.id}><div><strong>{worker.full_name}</strong><small>{LABOR_CLASS[worker.labor_class] || worker.labor_class} · {worker.trade || '—'} · {PAY_BASIS[worker.pay_basis] || worker.pay_basis}</small></div><div><button type="button" className="btn ghost" onClick={() => openEdit(worker)}>تعديل</button> <button type="button" className="btn ghost" onClick={() => openMove(worker)}>نقل</button></div></div>)}</div>
        </aside>
      </section>}
    </>}

    {editFor && <ConstitutionDialog title={`تعديل: ${editFor.full_name}`} size="wide" onClose={() => setEditFor(null)}>
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
        <label className={styles.wideField}><span>سبب التعديل *</span><input required value={editForm.reason || ''} onChange={(event) => setEditForm((form) => ({ ...form, reason: event.target.value }))} /></label>
        <button type="submit" className={styles.primaryAction} disabled={busy === 'edit'}>{busy === 'edit' ? 'جارٍ الحفظ…' : 'حفظ'}</button>
      </form>
    </ConstitutionDialog>}

    {moveFor && <ConstitutionDialog title={`نقل: ${moveFor.full_name}`} size="compact" onClose={() => setMoveFor(null)}>
      <form className={styles.operationForm} onSubmit={saveMove}>
        <label className={styles.wideField}><span>المقاول الجديد</span><select required value={moveForm.contractor_id} onChange={(event) => changeMoveContractor(event.target.value)}><option value="">اختر المقاول</option>{contractors.filter((contractor) => contractor.id !== moveFor.contractor_id).map((contractor) => <option key={contractor.id} value={contractor.id}>{contractor.name_ar}</option>)}</select></label>
        <label><span>من تاريخ</span><input required type="date" value={moveForm.effective_from} onChange={(event) => setMoveForm((form) => ({ ...form, effective_from: event.target.value }))} /></label>
        {moveFor.pay_basis === 'daily' && <label><span>اليومية الجديدة</span><input type="number" min="0" step="0.01" value={moveForm.daily_rate} onChange={(event) => setMoveForm((form) => ({ ...form, daily_rate: event.target.value }))} /></label>}
        <label className={styles.wideField}><span>ملاحظة</span><input value={moveForm.notes} onChange={(event) => setMoveForm((form) => ({ ...form, notes: event.target.value }))} /></label>
        <button type="submit" className={styles.primaryAction} disabled={busy === 'move'}>{busy === 'move' ? 'جارٍ النقل…' : 'نقل'}</button>
      </form>
    </ConstitutionDialog>}
  </div>;
}
