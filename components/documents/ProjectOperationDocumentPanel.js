'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export const DAILY_PROGRESS_CODE = 'CAT_PROJECTS_OPERATIONS_DAILY_PROGRESS';
export const ACHIEVEMENT_LOG_CODE = 'CAT_PROJECTS_OPERATIONS_ACHIEVEMENT_LOG';

const DOC_TYPES = {
  [DAILY_PROGRESS_CODE]: {
    mode: 'daily',
    name: 'التقرير اليومي',
    prefix: 'DAY',
    sourceModel: 'project_daily_operations_v2',
  },
  [ACHIEVEMENT_LOG_CODE]: {
    mode: 'period',
    name: 'بيان الكميات المنفذة',
    prefix: 'QTY',
    sourceModel: 'project_executed_quantities_v2',
  },
};

function todayRiyadh() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function shiftDate(value, days) {
  const d = new Date(`${value}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function num(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function fmt(value, digits = 2) {
  return num(value).toLocaleString('ar-SA', { maximumFractionDigits: digits });
}

function laborLabel(value) {
  if (value === 'technician') return 'صنايعي';
  if (value === 'foreman') return 'فورمان';
  if (value === 'worker') return 'عامل';
  return 'غير مصنف';
}

function attendanceFactor(status) {
  if (status === 'full') return 1;
  if (status === 'half') return 0.5;
  return 0;
}

function eventKey(event) {
  return `${event.date}|${event.project_item_id || ''}|${num(event.qty).toFixed(3)}`;
}

function dedupeEvents(events) {
  const map = new Map();
  for (const event of events) {
    const key = eventKey(event);
    const existing = map.get(key);
    if (!existing || (event.source === 'day_items' && existing.source !== 'day_items')) map.set(key, event);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date) || (a.sort_order || 0) - (b.sort_order || 0));
}

function composeTitle(type, projectName, { date, from, to, manualTitle }) {
  const manual = String(manualTitle || '').trim();
  if (manual) return manual;
  if (type.mode === 'daily') return `${type.name} — ${projectName} — ${date}`;
  return `${type.name} — ${projectName} — ${from} إلى ${to}`;
}

async function loadProjectCore(projectId) {
  const projectQ = await supabase.from('projects').select('*').eq('id', projectId).maybeSingle();
  if (projectQ.error || !projectQ.data) throw projectQ.error || new Error('لم يُعثر على المشروع.');
  const project = { ...projectQ.data };

  let clientName = '';
  if (project.entity_id) {
    const entityQ = await supabase.from('entities').select('name_ar').eq('id', project.entity_id).maybeSingle();
    clientName = entityQ.data?.name_ar || '';
  }
  if ((!clientName || (!project.site_address && !project.city)) && project.quotation_id) {
    const quoteQ = await supabase.from('quotations').select('client_name,site_location').eq('id', project.quotation_id).maybeSingle();
    if (!clientName) clientName = quoteQ.data?.client_name || '';
    if (!project.site_address && !project.city && quoteQ.data?.site_location) project.site_address = quoteQ.data.site_location;
  }

  const itemsQ = await supabase.from('project_items')
    .select('id,sort_order,description_ar,unit,contract_qty,sell_price,contract_value,notes')
    .eq('project_id', projectId).order('sort_order');
  if (itemsQ.error) throw itemsQ.error;

  return { project, clientName, items: itemsQ.data || [] };
}

async function loadInternalProgress(projectId, items, from, to, includeBefore = false) {
  const itemIds = items.map((row) => row.id);
  if (!itemIds.length) return [];

  const daysQ = await supabase.from('timesheet_days')
    .select('id,work_date,notes')
    .eq('project_id', projectId)
    .lte('work_date', to)
    .gte('work_date', includeBefore ? '1900-01-01' : from)
    .order('work_date');
  if (daysQ.error) throw daysQ.error;

  const days = daysQ.data || [];
  const dayById = new Map(days.map((row) => [row.id, row]));
  let dayItems = [];
  if (days.length) {
    const q = await supabase.from('day_items')
      .select('id,day_id,project_item_id,group_output,unit,notes,contractor_id')
      .in('day_id', days.map((row) => row.id));
    if (q.error) throw q.error;
    dayItems = q.data || [];
  }

  const progressQ = await supabase.from('progress_entries')
    .select('id,project_item_id,entry_date,qty_done,manual_pct,claimed,notes')
    .in('project_item_id', itemIds)
    .lte('entry_date', to)
    .gte('entry_date', includeBefore ? '1900-01-01' : from)
    .order('entry_date');
  if (progressQ.error) throw progressQ.error;

  const itemById = new Map(items.map((row) => [row.id, row]));
  const events = [];

  for (const row of dayItems) {
    const day = dayById.get(row.day_id);
    const item = itemById.get(row.project_item_id);
    if (!day || !item || num(row.group_output) === 0) continue;
    events.push({
      id: row.id,
      source: 'day_items',
      date: day.work_date,
      project_item_id: row.project_item_id,
      sort_order: item.sort_order,
      description: item.description_ar,
      qty: num(row.group_output),
      unit: row.unit || item.unit || '',
      notes: row.notes || '',
      contract_qty: num(item.contract_qty),
    });
  }

  for (const row of progressQ.data || []) {
    const item = itemById.get(row.project_item_id);
    if (!item || num(row.qty_done) === 0) continue;
    events.push({
      id: row.id,
      source: 'progress_entries',
      date: row.entry_date,
      project_item_id: row.project_item_id,
      sort_order: item.sort_order,
      description: item.description_ar,
      qty: num(row.qty_done),
      unit: item.unit || '',
      notes: row.notes || '',
      contract_qty: num(item.contract_qty),
    });
  }

  return dedupeEvents(events);
}

async function loadAttendance(projectId, date) {
  const dayQ = await supabase.from('timesheet_days')
    .select('id,work_date,notes,machinery,weather_stop')
    .eq('project_id', projectId).eq('work_date', date).maybeSingle();
  if (dayQ.error) throw dayQ.error;
  if (!dayQ.data) return { day: null, rows: [], groups: [], totalCost: 0, equivalent: 0 };

  const attendanceQ = await supabase.from('attendance')
    .select('id,laborer_id,status,amount,rate_used,labor_class_snapshot,trade_snapshot,notes,laborers(full_name)')
    .eq('day_id', dayQ.data.id);
  if (attendanceQ.error) throw attendanceQ.error;

  const rows = attendanceQ.data || [];
  const groupMap = new Map();
  let totalCost = 0;
  let equivalent = 0;

  for (const row of rows) {
    const label = laborLabel(row.labor_class_snapshot);
    if (!groupMap.has(label)) groupMap.set(label, { label, full: 0, half: 0, absent: 0, other: 0, equivalent: 0, amount: 0 });
    const group = groupMap.get(label);
    if (row.status === 'full') group.full += 1;
    else if (row.status === 'half') group.half += 1;
    else if (row.status === 'absent') group.absent += 1;
    else group.other += 1;

    const factor = attendanceFactor(row.status);
    group.equivalent += factor;
    equivalent += factor;
    group.amount += num(row.amount);
    totalCost += num(row.amount);
  }

  return { day: dayQ.data, rows, groups: [...groupMap.values()], totalCost, equivalent };
}

function buildDailyPayload(core, date, events, attendance, manualTitle = '') {
  const { project, clientName } = core;
  const subject = composeTitle(DOC_TYPES[DAILY_PROGRESS_CODE], project.name_ar, { date, manualTitle });
  const rows = events.map((event) => ({
    _id: crypto.randomUUID(),
    description: event.description || '',
    quantity: event.qty,
    unit: event.unit || '',
    status: 'مسجل داخليًا',
    notes: event.notes || '',
  }));

  const labor = { technician_count: 0, technician_value: 0, worker_count: 0, worker_value: 0, foreman_count: 0, foreman_value: 0 };
  for (const group of attendance.groups) {
    if (group.label === 'صنايعي') { labor.technician_count = group.equivalent; labor.technician_value = group.amount; }
    if (group.label === 'عامل') { labor.worker_count = group.equivalent; labor.worker_value = group.amount; }
    if (group.label === 'فورمان') { labor.foreman_count = group.equivalent; labor.foreman_value = group.amount; }
  }

  const workLines = events.length
    ? events.map((e) => `• ${e.description}: ${fmt(e.qty, 3)} ${e.unit || ''}${e.notes ? ` — ${e.notes}` : ''}`)
    : ['• لا توجد كمية منفذة مسجلة لهذا التاريخ.'];

  const laborLines = attendance.groups.length
    ? attendance.groups.map((g) => `• ${g.label}: ${g.full} كامل${g.half ? `، ${g.half} نصف يوم` : ''}${g.absent ? `، ${g.absent} غياب` : ''} — المكافئ ${fmt(g.equivalent, 1)} يوم — ${fmt(g.amount)} ريال.`)
    : ['• لا توجد تسجيلات حضور لهذا التاريخ.'];

  const details = [
    'الأعمال المنفذة:',
    ...workLines,
    '',
    'العمالة:',
    ...laborLines,
    attendance.rows.length ? `إجمالي تكلفة الحضور: ${fmt(attendance.totalCost)} ريال.` : '',
    attendance.day?.notes ? `ملاحظات الموقع: ${attendance.day.notes}` : '',
    attendance.day?.machinery ? `المعدات: ${attendance.day.machinery}` : '',
    attendance.day?.weather_stop ? 'توقف مرتبط بالطقس مسجل لهذا اليوم.' : '',
    '',
    'بيان المصدر: الكميات الواردة تسجيلات تشغيلية داخلية، ولا تعد قياسًا معتمدًا أو مستخلصًا إلا بوجود سجل اعتماد مستقل.',
  ].filter((line, i, arr) => line !== '' || (i > 0 && arr[i - 1] !== '')).join('\n');

  return {
    transaction_date: date,
    effective_date: date,
    project_name: project.name_ar,
    project_no: project.project_no,
    site_location: project.site_address || project.city || '',
    client_name: clientName || '',
    subject,
    ...labor,
    attendance_equivalent: attendance.equivalent,
    labor_total: attendance.totalCost,
    details,
    _rows: rows,
    _autofill: {
      project_id: project.id,
      context_date: date,
      custom_title: String(manualTitle || '').trim(),
      source_model: DOC_TYPES[DAILY_PROGRESS_CODE].sourceModel,
      generated_at: new Date().toISOString(),
    },
  };
}

function buildPeriodPayload(core, from, to, allEvents, manualTitle = '') {
  const { project, clientName } = core;
  const subject = composeTitle(DOC_TYPES[ACHIEVEMENT_LOG_CODE], project.name_ar, { from, to, manualTitle });
  const cumulativeByItem = new Map();
  const within = [];

  for (const event of allEvents) {
    const previous = cumulativeByItem.get(event.project_item_id) || 0;
    const cumulative = previous + event.qty;
    cumulativeByItem.set(event.project_item_id, cumulative);
    if (event.date >= from && event.date <= to) within.push({ ...event, cumulative });
  }

  const rows = within.map((event) => ({
    _id: crypto.randomUUID(),
    work_date: event.date,
    description: event.description || '',
    quantity: event.qty,
    unit: event.unit || '',
    cumulative_qty: event.cumulative,
    notes: event.notes || '',
  }));

  const byItem = new Map();
  for (const event of within) {
    if (!byItem.has(event.project_item_id)) byItem.set(event.project_item_id, {
      description: event.description,
      unit: event.unit,
      added: 0,
      cumulative: event.cumulative,
      contract_qty: event.contract_qty,
    });
    const item = byItem.get(event.project_item_id);
    item.added += event.qty;
    item.cumulative = event.cumulative;
  }

  const summary = [...byItem.values()].map((item) => {
    const base = item.contract_qty > 1 ? ` من أصل ${fmt(item.contract_qty, 3)} ${item.unit || ''} مسجلة بالمشروع` : '';
    return `• ${item.description}: منفذ خلال الفترة ${fmt(item.added, 3)} ${item.unit || ''}، والتراكمي ${fmt(item.cumulative, 3)} ${item.unit || ''}${base}.`;
  });

  const warnings = [...byItem.values()]
    .filter((item) => item.contract_qty > 0 && item.cumulative > item.contract_qty)
    .map((item) => `مراجعة مطلوبة: التراكمي لبند «${item.description}» يتجاوز الكمية المسجلة بالمشروع.`);

  const details = [
    `الفترة: ${from} إلى ${to}.`,
    summary.length ? 'ملخص الكميات:' : 'لا توجد كميات منفذة مسجلة خلال الفترة.',
    ...summary,
    ...warnings,
    '',
    'بيان المصدر: هذه كميات تشغيلية مسجلة داخليًا، ولا تمثل قياسًا مشتركًا أو معتمدًا ولا تنشئ استحقاق مستخلص دون سجل اعتماد مستقل.',
  ].filter(Boolean).join('\n');

  return {
    transaction_date: to,
    project_name: project.name_ar,
    project_no: project.project_no,
    site_location: project.site_address || project.city || '',
    client_name: clientName || '',
    period_from: from,
    period_to: to,
    subject,
    details,
    _rows: rows,
    _autofill: {
      project_id: project.id,
      date_from: from,
      date_to: to,
      custom_title: String(manualTitle || '').trim(),
      source_model: DOC_TYPES[ACHIEVEMENT_LOG_CODE].sourceModel,
      generated_at: new Date().toISOString(),
    },
  };
}

export default function ProjectOperationDocumentPanel({ code, docId = null }) {
  const router = useRouter();
  const type = DOC_TYPES[code];
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [contextDate, setContextDate] = useState(todayRiyadh());
  const [dateFrom, setDateFrom] = useState(shiftDate(todayRiyadh(), -6));
  const [dateTo, setDateTo] = useState(todayRiyadh());
  const [manualTitle, setManualTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      const projectQ = await supabase.from('projects').select('id,project_no,name_ar,status').order('project_no');
      if (!active) return;
      setProjects(projectQ.data || []);

      if (docId) {
        const docQ = await supabase.from('documents').select('project_id,payload').eq('id', docId).maybeSingle();
        if (!active || !docQ.data) return;
        const payload = docQ.data.payload || {};
        setProjectId(docQ.data.project_id || payload?._autofill?.project_id || '');
        if (payload?._autofill?.context_date) setContextDate(payload._autofill.context_date);
        if (payload?._autofill?.date_from) setDateFrom(payload._autofill.date_from);
        if (payload?._autofill?.date_to) setDateTo(payload._autofill.date_to);
        if (payload?._autofill?.custom_title) setManualTitle(payload._autofill.custom_title);
      }
    })();
    return () => { active = false; };
  }, [docId]);

  const selectedProject = useMemo(() => projects.find((row) => row.id === projectId), [projects, projectId]);
  if (!type) return null;

  async function buildPayload() {
    if (!projectId) throw new Error('اختر المشروع.');
    if (type.mode === 'period' && dateFrom > dateTo) throw new Error('راجع الفترة المحددة.');

    const core = await loadProjectCore(projectId);
    if (type.mode === 'daily') {
      const [events, attendance] = await Promise.all([
        loadInternalProgress(projectId, core.items, contextDate, contextDate, false),
        loadAttendance(projectId, contextDate),
      ]);
      return buildDailyPayload(core, contextDate, events, attendance, manualTitle);
    }

    const events = await loadInternalProgress(projectId, core.items, dateFrom, dateTo, true);
    return buildPeriodPayload(core, dateFrom, dateTo, events, manualTitle);
  }

  async function apply() {
    setBusy(true);
    setErr('');
    setInfo('');
    try {
      const payload = await buildPayload();
      if (docId) {
        const q = await supabase.from('documents').update({ subject: payload.subject, payload, project_id: projectId }).eq('id', docId);
        if (q.error) throw q.error;
        setInfo('تم تحديث المستند من بيانات المشروع.');
        setTimeout(() => window.location.reload(), 650);
      } else {
        const q = await supabase.from('documents').insert({
          doc_number: `DRAFT-${type.prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          template_code: code,
          language: 'ar',
          subject: payload.subject,
          project_id: projectId,
          payload,
          status: 'draft',
          parties: {},
        }).select('id').single();
        if (q.error) throw q.error;
        router.replace(`/dashboard/documents/edit/${q.data.id}`);
      }
    } catch (error) {
      setErr(`تعذر إعداد ${type.name}: ${error.message || error}`);
    }
    setBusy(false);
  }

  return (
    <div className="section" style={{ marginTop: 0, border: '1px solid var(--line)' }} data-project-operation-document="true">
      <header><h2>مصادر المستند</h2></header>
      <div style={{ padding: 18 }}>
        <div className="form-grid">
          <div className="field">
            <label>المشروع *</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">اختر المشروع</option>
              {projects.map((row) => <option key={row.id} value={row.id}>{row.project_no} - {row.name_ar}</option>)}
            </select>
          </div>

          {type.mode === 'daily' ? (
            <div className="field">
              <label>التاريخ *</label>
              <input type="date" value={contextDate} max={todayRiyadh()} onChange={(e) => setContextDate(e.target.value)} />
            </div>
          ) : (
            <>
              <div className="field"><label>من *</label><input type="date" value={dateFrom} max={dateTo} onChange={(e) => setDateFrom(e.target.value)} /></div>
              <div className="field"><label>إلى *</label><input type="date" value={dateTo} max={todayRiyadh()} min={dateFrom} onChange={(e) => setDateTo(e.target.value)} /></div>
            </>
          )}

          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>العنوان — اختياري</label>
            <input
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              placeholder={selectedProject
                ? composeTitle(type, selectedProject.name_ar, type.mode === 'daily'
                    ? { date: contextDate }
                    : { from: dateFrom, to: dateTo })
                : 'يُنشأ تلقائيًا من نوع المستند والمشروع والفترة'}
            />
          </div>
        </div>

        <div className="hint" style={{ marginTop: 10, lineHeight: 1.8 }}>
          {type.mode === 'daily'
            ? 'المصدر: الأعمال المنفذة، الحضور، تكلفة العمالة وملاحظات الموقع المسجلة في اليوم المحدد.'
            : 'المصدر: الكميات المنفذة المسجلة داخل المشروع خلال الفترة المحددة. القياسات المعتمدة تبقى في مسار مستقل.'}
        </div>

        <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn primary" disabled={busy || !projectId} onClick={apply}>
            {busy ? 'جارٍ التحديث…' : docId ? 'تحديث من المشروع' : 'إنشاء المستند'}
          </button>
          <span className="hint">يمكن تعديل العنوان يدويًا دون تغيير مصادر البيانات.</span>
        </div>

        {err && <div className="msg err" style={{ marginTop: 12 }}>{err}</div>}
        {info && <div className="msg ok" style={{ marginTop: 12 }}>{info}</div>}
      </div>
    </div>
  );
}
