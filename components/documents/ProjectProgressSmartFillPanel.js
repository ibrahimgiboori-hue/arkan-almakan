'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export const DAILY_PROGRESS_CODE = 'CAT_PROJECTS_OPERATIONS_DAILY_PROGRESS';
export const ACHIEVEMENT_LOG_CODE = 'CAT_PROJECTS_OPERATIONS_ACHIEVEMENT_LOG';

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
  return num(value).toLocaleString('ar-SA', { maximumFractionDigits:digits });
}

function classLabel(value) {
  if (value === 'technician') return 'صنايعي';
  if (value === 'foreman') return 'فورمان';
  if (value === 'worker') return 'عامل';
  return 'غير مصنف';
}

function statusFactor(status) {
  if (status === 'full') return 1;
  if (status === 'half') return 0.5;
  return 0;
}

function makeKey(event) {
  return `${event.date}|${event.project_item_id || ''}|${num(event.qty).toFixed(3)}`;
}

function dedupeEvents(events) {
  const map = new Map();
  for (const event of events) {
    const key = makeKey(event);
    const existing = map.get(key);
    if (!existing || (event.source === 'day_items' && existing.source !== 'day_items')) map.set(key, event);
  }
  return [...map.values()].sort((a,b) => a.date.localeCompare(b.date) || (a.sort_order || 0) - (b.sort_order || 0));
}

async function loadProjectCore(projectId) {
  const projectQ = await supabase.from('projects').select('*').eq('id', projectId).maybeSingle();
  if (projectQ.error || !projectQ.data) throw projectQ.error || new Error('لم يُعثر على المشروع.');
  const project = projectQ.data;

  let clientName = '';
  if (project.entity_id) {
    const entityQ = await supabase.from('entities').select('name_ar').eq('id', project.entity_id).maybeSingle();
    clientName = entityQ.data?.name_ar || '';
  }
  if (!clientName && project.quotation_id) {
    const quoteQ = await supabase.from('quotations').select('client_name,site_location').eq('id', project.quotation_id).maybeSingle();
    clientName = quoteQ.data?.client_name || '';
    if (!project.site_address && !project.city && quoteQ.data?.site_location) project.site_address = quoteQ.data.site_location;
  }

  const itemsQ = await supabase.from('project_items')
    .select('id,sort_order,description_ar,unit,contract_qty,sell_price,contract_value,notes')
    .eq('project_id', projectId).order('sort_order');
  if (itemsQ.error) throw itemsQ.error;
  return { project, clientName, items:itemsQ.data || [] };
}

async function loadInternalEvents(projectId, items, from, to, includeBefore = false) {
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
      id:row.id,
      source:'day_items',
      date:day.work_date,
      project_item_id:row.project_item_id,
      sort_order:item.sort_order,
      description:item.description_ar,
      qty:num(row.group_output),
      unit:row.unit || item.unit || '',
      notes:row.notes || '',
      contract_qty:num(item.contract_qty),
      sell_price:num(item.sell_price),
    });
  }
  for (const row of progressQ.data || []) {
    const item = itemById.get(row.project_item_id);
    if (!item || num(row.qty_done) === 0) continue;
    events.push({
      id:row.id,
      source:'progress_entries',
      date:row.entry_date,
      project_item_id:row.project_item_id,
      sort_order:item.sort_order,
      description:item.description_ar,
      qty:num(row.qty_done),
      unit:item.unit || '',
      notes:row.notes || '',
      contract_qty:num(item.contract_qty),
      sell_price:num(item.sell_price),
    });
  }
  return dedupeEvents(events);
}

async function loadAttendance(projectId, date) {
  const dayQ = await supabase.from('timesheet_days')
    .select('id,work_date,notes,machinery,weather_stop')
    .eq('project_id', projectId).eq('work_date', date).maybeSingle();
  if (dayQ.error) throw dayQ.error;
  if (!dayQ.data) return { day:null, rows:[], groups:[], totalCost:0, equivalent:0, statusCounts:{} };

  const attendanceQ = await supabase.from('attendance')
    .select('id,laborer_id,status,amount,rate_used,labor_class_snapshot,trade_snapshot,notes,laborers(full_name)')
    .eq('day_id', dayQ.data.id);
  if (attendanceQ.error) throw attendanceQ.error;
  const rows = attendanceQ.data || [];

  const groupsMap = new Map();
  const statusCounts = {};
  let totalCost = 0;
  let equivalent = 0;
  for (const row of rows) {
    statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
    const label = classLabel(row.labor_class_snapshot);
    if (!groupsMap.has(label)) groupsMap.set(label, { label, full:0, half:0, absent:0, other:0, equivalent:0, amount:0 });
    const group = groupsMap.get(label);
    if (row.status === 'full') group.full += 1;
    else if (row.status === 'half') group.half += 1;
    else if (row.status === 'absent') group.absent += 1;
    else group.other += 1;
    const factor = statusFactor(row.status);
    group.equivalent += factor;
    equivalent += factor;
    group.amount += num(row.amount);
    totalCost += num(row.amount);
  }
  return { day:dayQ.data, rows, groups:[...groupsMap.values()], totalCost, equivalent, statusCounts };
}

function dailyPayload(core, date, events, attendance) {
  const { project, clientName } = core;
  const rows = events.map((event) => ({
    _id:crypto.randomUUID(),
    description:event.description || '',
    quantity:event.qty,
    unit:event.unit || '',
    status:'إنجاز داخلي مسجل',
    notes:event.notes || '',
  }));

  const groupFields = { technician_count:0, technician_value:0, worker_count:0, worker_value:0, foreman_count:0, foreman_value:0 };
  for (const group of attendance.groups) {
    if (group.label === 'صنايعي') { groupFields.technician_count = group.equivalent; groupFields.technician_value = group.amount; }
    if (group.label === 'عامل') { groupFields.worker_count = group.equivalent; groupFields.worker_value = group.amount; }
    if (group.label === 'فورمان') { groupFields.foreman_count = group.equivalent; groupFields.foreman_value = group.amount; }
  }

  const achievementLines = events.length
    ? events.map((e) => `• ${e.description}: ${fmt(e.qty, 3)} ${e.unit || ''}${e.notes ? ` — ${e.notes}` : ''}`)
    : ['• لا يوجد إنجاز داخلي كمي مسجل لهذا التاريخ.'];

  const laborLines = attendance.groups.length
    ? attendance.groups.map((g) => `• ${g.label}: ${g.full} حضور كامل${g.half ? `، ${g.half} نصف يوم` : ''}${g.absent ? `، ${g.absent} غياب` : ''} — ما يعادل ${fmt(g.equivalent, 1)} يوم عمل — قيمة الحضور ${fmt(g.amount)} ريال.`)
    : ['• لا توجد تسجيلات حضور لهذا التاريخ.'];

  const details = [
    'الإنجاز الداخلي المسجل:',
    ...achievementLines,
    '',
    'العمالة والحضور:',
    ...laborLines,
    attendance.rows.length ? `إجمالي قيمة الحضور المسجلة لهذا اليوم: ${fmt(attendance.totalCost)} ريال.` : '',
    attendance.day?.notes ? `ملاحظات الموقع: ${attendance.day.notes}` : '',
    attendance.day?.machinery ? `المعدات: ${attendance.day.machinery}` : '',
    attendance.day?.weather_stop ? 'يوجد توقف مرتبط بالطقس في هذا اليوم.' : '',
    '',
    'ملاحظة منهجية: كميات الإنجاز الواردة أعلاه هي تسجيلات داخلية لدى أركان المكان لتوثيق التقدم الفعلي، ولا تعد بذاتها قياسًا معتمدًا أو مستخلصًا أو إقرارًا من الطرف الآخر ما لم ترتبط بقياس أو اعتماد مستقل.',
  ].filter((line, i, arr) => line !== '' || (i > 0 && arr[i-1] !== '')).join('\n');

  return {
    transaction_date:date,
    effective_date:date,
    project_name:project.name_ar,
    project_no:project.project_no,
    site_location:project.site_address || project.city || '',
    client_name:clientName || '',
    subject:`تقرير التقدم اليومي - ${project.name_ar} - ${date}`,
    ...groupFields,
    attendance_equivalent:attendance.equivalent,
    labor_total:attendance.totalCost,
    details,
    _rows:rows,
    _autofill:{
      project_id:project.id,
      context_date:date,
      source_model:'project_internal_progress_v1',
      generated_at:new Date().toISOString(),
      generated_keys:['transaction_date','effective_date','project_name','project_no','site_location','client_name','subject','technician_count','technician_value','worker_count','worker_value','foreman_count','foreman_value','attendance_equivalent','labor_total','details','_rows'],
    },
  };
}

function achievementPayload(core, from, to, allEvents) {
  const { project, clientName } = core;
  const before = new Map();
  const within = [];
  for (const event of allEvents) {
    const key = event.project_item_id;
    if (!before.has(key)) before.set(key, 0);
    const previous = before.get(key);
    const cumulative = previous + event.qty;
    before.set(key, cumulative);
    if (event.date >= from && event.date <= to) within.push({ ...event, cumulative });
  }

  const rows = within.map((event) => ({
    _id:crypto.randomUUID(),
    work_date:event.date,
    description:event.description || '',
    quantity:event.qty,
    unit:event.unit || '',
    cumulative_qty:event.cumulative,
    notes:event.notes || '',
  }));

  const byItem = new Map();
  for (const event of within) {
    if (!byItem.has(event.project_item_id)) byItem.set(event.project_item_id, { description:event.description, unit:event.unit, added:0, cumulative:event.cumulative, contract_qty:event.contract_qty });
    const item = byItem.get(event.project_item_id);
    item.added += event.qty;
    item.cumulative = event.cumulative;
  }
  const summaryLines = [...byItem.values()].map((item) => {
    const available = item.contract_qty > 1 ? ` من كمية المشروع المسجلة ${fmt(item.contract_qty, 3)} ${item.unit || ''}` : '';
    return `• ${item.description}: أضيف خلال الفترة ${fmt(item.added, 3)} ${item.unit || ''}، والإجمالي الداخلي التراكمي حتى ${to} هو ${fmt(item.cumulative, 3)} ${item.unit || ''}${available}.`;
  });

  const warnings = [...byItem.values()]
    .filter((item) => item.contract_qty > 0 && item.cumulative > item.contract_qty)
    .map((item) => `تنبيه مراجعة: الإنجاز الداخلي التراكمي لبند «${item.description}» (${fmt(item.cumulative, 3)}) يتجاوز كمية المشروع المسجلة (${fmt(item.contract_qty, 3)}). راجع ربط الإنجاز أو كمية البند.`);

  const details = [
    `يغطي هذا التقرير تسجيلات الإنجاز الداخلي من ${from} إلى ${to}.`,
    summaryLines.length ? 'ملخص الإنجاز خلال الفترة:' : 'لا توجد كميات إنجاز داخلي مسجلة ضمن الفترة المختارة.',
    ...summaryLines,
    ...warnings,
    '',
    'ملاحظة منهجية: هذا التقرير يوثق الكميات التي سجلتها أركان المكان داخليًا كتقدم فعلي. لا تمثل هذه الكميات بذاتها قياسًا مشتركًا أو معتمدًا، ولا تنشئ استحقاق مستخلص أو إقرارًا من العميل أو المنفذ إلا إذا تم توثيق ذلك في سجل القياسات والاعتمادات المستقل.',
  ].filter(Boolean).join('\n');

  return {
    transaction_date:to,
    project_name:project.name_ar,
    project_no:project.project_no,
    site_location:project.site_address || project.city || '',
    client_name:clientName || '',
    period_from:from,
    period_to:to,
    subject:`تقرير توثيق الإنجازات - ${project.name_ar} - من ${from} إلى ${to}`,
    details,
    _rows:rows,
    _autofill:{
      project_id:project.id,
      date_from:from,
      date_to:to,
      source_model:'project_internal_achievement_log_v1',
      generated_at:new Date().toISOString(),
      generated_keys:['transaction_date','project_name','project_no','site_location','client_name','period_from','period_to','subject','details','_rows'],
    },
  };
}

export default function ProjectProgressSmartFillPanel({ code, docId = null }) {
  const router = useRouter();
  const isDaily = code === DAILY_PROGRESS_CODE;
  const isLog = code === ACHIEVEMENT_LOG_CODE;
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [contextDate, setContextDate] = useState(todayRiyadh());
  const [dateFrom, setDateFrom] = useState(shiftDate(todayRiyadh(), -6));
  const [dateTo, setDateTo] = useState(todayRiyadh());
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
        setProjectId(docQ.data.project_id || docQ.data.payload?._autofill?.project_id || '');
        if (docQ.data.payload?._autofill?.context_date) setContextDate(docQ.data.payload._autofill.context_date);
        if (docQ.data.payload?._autofill?.date_from) setDateFrom(docQ.data.payload._autofill.date_from);
        if (docQ.data.payload?._autofill?.date_to) setDateTo(docQ.data.payload._autofill.date_to);
      }
    })();
    return () => { active = false; };
  }, [docId]);

  const selectedProject = useMemo(() => projects.find((row) => row.id === projectId), [projects, projectId]);
  if (!isDaily && !isLog) return null;

  async function buildPayload() {
    if (!projectId) throw new Error('اختر المشروع أولًا.');
    if (isLog && dateFrom > dateTo) throw new Error('تاريخ البداية يجب أن يسبق تاريخ النهاية.');
    const core = await loadProjectCore(projectId);
    if (isDaily) {
      const [events, attendance] = await Promise.all([
        loadInternalEvents(projectId, core.items, contextDate, contextDate, false),
        loadAttendance(projectId, contextDate),
      ]);
      return dailyPayload(core, contextDate, events, attendance);
    }
    const events = await loadInternalEvents(projectId, core.items, dateFrom, dateTo, true);
    return achievementPayload(core, dateFrom, dateTo, events);
  }

  async function apply() {
    setBusy(true); setErr(''); setInfo('');
    try {
      const payload = await buildPayload();
      if (docId) {
        const q = await supabase.from('documents').update({ payload, project_id:projectId }).eq('id', docId);
        if (q.error) throw q.error;
        setInfo('تمت إعادة بناء المستند من بيانات المشروع الفعلية. تم تحديث الأجزاء المولدة آليًا فقط في هذا المستند المتخصص.');
        setTimeout(() => window.location.reload(), 800);
      } else {
        const prefix = isDaily ? 'DPR' : 'ACH';
        const q = await supabase.from('documents').insert({
          doc_number:`DRAFT-${prefix}-${crypto.randomUUID().slice(0,8).toUpperCase()}`,
          template_code:code,
          language:'ar',
          subject:payload.subject,
          project_id:projectId,
          payload,
          status:'draft',
          parties:{},
        }).select('id').single();
        if (q.error) throw q.error;
        router.replace(`/dashboard/documents/edit/${q.data.id}`);
      }
    } catch (error) {
      setErr((isDaily ? 'تعذر بناء تقرير التقدم اليومي: ' : 'تعذر بناء تقرير توثيق الإنجازات: ') + (error.message || error));
    }
    setBusy(false);
  }

  return <div className="section" style={{marginTop:0,border:'1px solid var(--line)'}} data-project-progress-smart-fill="true">
    <header>
      <h2>{isDaily ? 'قراءة يوم المشروع وكتابة تقرير التقدم' : 'قراءة سجل الإنجاز الداخلي وكتابة تقرير التوثيق'}</h2>
    </header>
    <div style={{padding:18}}>
      <div className="hint" style={{marginBottom:14,lineHeight:1.9}}>
        {isDaily
          ? 'يقرأ الإنجاز الداخلي المسجل للبنود، والحضور المؤكد، وتصنيف العمالة، وقيمة الحضور، وملاحظات الموقع. القياسات المشتركة أو المعتمدة لا تُستخدم بدل الإنجاز الداخلي.'
          : 'يجمع زيادات الإنجاز الداخلي حسب التاريخ والبند ويحسب التراكم. هذا المسار منفصل عن القياسات المشتركة والمستخلصات.'}
      </div>
      <div className="form-grid">
        <div className="field">
          <label>المشروع *</label>
          <select value={projectId} onChange={(e)=>setProjectId(e.target.value)}>
            <option value="">اختر المشروع</option>
            {projects.map((row)=><option key={row.id} value={row.id}>{row.project_no} - {row.name_ar}</option>)}
          </select>
        </div>
        {isDaily ? <div className="field">
          <label>تاريخ التقرير *</label>
          <input type="date" value={contextDate} max={todayRiyadh()} onChange={(e)=>setContextDate(e.target.value)} />
        </div> : <>
          <div className="field"><label>من *</label><input type="date" value={dateFrom} max={dateTo} onChange={(e)=>setDateFrom(e.target.value)} /></div>
          <div className="field"><label>إلى *</label><input type="date" value={dateTo} max={todayRiyadh()} min={dateFrom} onChange={(e)=>setDateTo(e.target.value)} /></div>
        </>}
      </div>
      {selectedProject && <div className="hint" style={{marginTop:10}}>المشروع المحدد: {selectedProject.name_ar}</div>}
      <div style={{marginTop:14,display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
        <button type="button" className="btn primary" disabled={busy || !projectId} onClick={apply}>
          {busy ? 'جارٍ قراءة مصادر المشروع…' : docId ? 'إعادة بناء المستند من بيانات المشروع' : isDaily ? 'إنشاء تقرير اليوم من بيانات المشروع' : 'إنشاء تقرير توثيق الإنجازات'}
        </button>
        <span className="hint">لا يتم تحويل الإنجاز الداخلي إلى قياس معتمد تلقائيًا.</span>
      </div>
      {err && <div className="msg err" style={{marginTop:12}}>{err}</div>}
      {info && <div className="msg ok" style={{marginTop:12}}>{info}</div>}
    </div>
  </div>;
}
