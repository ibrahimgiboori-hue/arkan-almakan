'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const PROFILE_LABELS = Object.freeze({
  employee_request: 'بيانات الموظف والطلب',
  employee_record: 'بيانات الموظف والسجل',
  employee_notice: 'بيانات الموظف والإشعار',
  finance_request: 'بيانات الموظف والمشروع والمالية',
  project_record: 'بيانات المشروع',
  project_request: 'بيانات المشروع والطلب',
  asset_record: 'بيانات الموظف والمشروع والعهدة',
  checklist: 'بيانات السياق والقائمة',
  meeting_record: 'بيانات المشروع والاجتماع',
  letter: 'بيانات الطرف والخطاب',
  party_record: 'بيانات الطرف',
  recruitment_record: 'بيانات المرشح',
  contractor_timesheet: 'المشروع والمقاول والعمالة والحضور',
});

const ATTENDANCE_AR = Object.freeze({
  full: 'حضور كامل',
  half: 'نصف يوم',
  absent: 'غياب',
  stopped: 'متوقف',
  leave: 'إجازة',
  unrecorded: 'غير مسجل',
});

function todayRiyadh() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function blank(value) {
  return value == null || (typeof value === 'string' && value.trim() === '');
}

function fillBlanks(current, suggestions) {
  const next = { ...(current || {}) };
  let filled = 0;
  Object.entries(suggestions || {}).forEach(([key, value]) => {
    if (key.startsWith('_') || blank(value)) return;
    if (blank(next[key])) {
      next[key] = value;
      filled += 1;
    }
  });
  return { next, filled };
}

function allFieldKeys(template) {
  const keys = new Set((template?.layout?.fill_fields || []).map((field) => field.key).filter(Boolean));
  (template?.layout?.sections || []).forEach((section) => {
    (section.fields || []).forEach((field) => field.key && keys.add(field.key));
  });
  return keys;
}

function isoDate(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

export default function DocumentSmartFillPanel({ code, docId = null }) {
  const router = useRouter();
  const [template, setTemplate] = useState(null);
  const [documentRow, setDocumentRow] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [entities, setEntities] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [employeeId, setEmployeeId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [partyKey, setPartyKey] = useState('');
  const [contextDate, setContextDate] = useState(todayRiyadh());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      const templateQ = await supabase.from('document_templates').select('*').eq('code', code).maybeSingle();
      if (!active) return;
      if (templateQ.error || !templateQ.data?.layout?.sections?.length) {
        setTemplate(null);
        return;
      }
      setTemplate(templateQ.data);

      const relationScope = templateQ.data.relation_scope || [];
      const jobs = [];
      jobs.push(relationScope.includes('employee')
        ? supabase.from('employees').select('id,employee_no,full_name_ar,nationality,id_number,id_expiry,birth_date,mobile,email,job_title,department,hire_date,basic_salary,housing_allowance,transport_allowance,other_allowance,iban,bank_name,annual_leave_days').order('employee_no')
        : Promise.resolve({ data: [] }));
      jobs.push(relationScope.includes('project')
        ? supabase.from('projects').select('*').order('project_no')
        : Promise.resolve({ data: [] }));
      jobs.push(relationScope.includes('party') || relationScope.includes('project')
        ? supabase.from('entities').select('id,entity_code,name_ar,entity_kind,cr_number,cr_no,vat_number,vat_no,contact_name,contact_title,mobile,email,city,national_address,address').order('name_ar')
        : Promise.resolve({ data: [] }));
      jobs.push(relationScope.includes('party')
        ? supabase.from('contractors').select('id,contractor_no,name_ar,kind,cr_number,vat_number,contact_name,mobile,email,iban,bank_name').eq('is_active', true).order('name_ar')
        : Promise.resolve({ data: [] }));
      jobs.push(relationScope.includes('party')
        ? supabase.from('candidates').select('id,full_name_ar,nationality,id_kind,id_number,id_expiry,mobile,email,current_city,employment_status,notice_period_days').is('archived_at', null).order('full_name_ar')
        : Promise.resolve({ data: [] }));

      const [employeeQ, projectQ, entityQ, contractorQ, candidateQ] = await Promise.all(jobs);
      if (!active) return;
      setEmployees(employeeQ.data || []);
      setProjects(projectQ.data || []);
      setEntities(entityQ.data || []);
      setContractors(contractorQ.data || []);
      setCandidates(candidateQ.data || []);

      if (docId) {
        const docQ = await supabase.from('documents').select('id,payload,employee_id,project_id,subject').eq('id', docId).maybeSingle();
        if (!active || !docQ.data) return;
        setDocumentRow(docQ.data);
        setEmployeeId(docQ.data.employee_id || '');
        setProjectId(docQ.data.project_id || '');
        const meta = docQ.data.payload?._autofill || {};
        if (meta.party_type && meta.party_id) setPartyKey(`${meta.party_type}:${meta.party_id}`);
        if (meta.context_date) setContextDate(meta.context_date);
      }
    })();
    return () => { active = false; };
  }, [code, docId]);

  const relationScope = template?.relation_scope || [];
  const profile = template?.template_profile || template?.layout?.profile || '';
  const fieldKeys = useMemo(() => allFieldKeys(template), [template]);
  const partyOptions = useMemo(() => {
    const items = [];
    if (profile === 'recruitment_record') {
      candidates.forEach((row) => items.push({ key:`candidate:${row.id}`, label:`مرشح — ${row.full_name_ar}` }));
      return items;
    }
    entities.forEach((row) => items.push({ key:`entity:${row.id}`, label:`جهة — ${row.name_ar}` }));
    contractors.forEach((row) => items.push({ key:`contractor:${row.id}`, label:`مقاول — ${row.name_ar}` }));
    candidates.forEach((row) => items.push({ key:`candidate:${row.id}`, label:`مرشح — ${row.full_name_ar}` }));
    return items;
  }, [profile, entities, contractors, candidates]);

  if (!template || profile === 'project_work_claims_report') return null;

  function selectedParty() {
    if (!partyKey) return null;
    const [type, id] = partyKey.split(':');
    const list = type === 'entity' ? entities : type === 'contractor' ? contractors : candidates;
    return { type, row:list.find((item) => item.id === id) || null };
  }

  async function buildSuggestions() {
    const suggestions = {};
    if (fieldKeys.has('transaction_date')) suggestions.transaction_date = contextDate;
    if (fieldKeys.has('effective_date')) suggestions.effective_date = contextDate;

    const employee = employees.find((row) => row.id === employeeId);
    if (employee) {
      const allowances = Number(employee.housing_allowance || 0) + Number(employee.transport_allowance || 0) + Number(employee.other_allowance || 0);
      Object.assign(suggestions, {
        employee_name: employee.full_name_ar,
        employee_no: employee.employee_no,
        job_title: employee.job_title,
        department: employee.department,
        id_number: employee.id_number,
        nationality: employee.nationality,
        hire_date: employee.hire_date,
        mobile: employee.mobile,
        email: employee.email,
        iban: employee.iban,
        bank_name: employee.bank_name,
        basic_salary: employee.basic_salary,
        housing: employee.housing_allowance,
        transport: employee.transport_allowance,
        allowances,
        gross: Number(employee.basic_salary || 0) + allowances,
        current_salary: employee.basic_salary,
        last_wage: Number(employee.basic_salary || 0) + allowances,
      });

      const [leaveQ, debtQ] = await Promise.all([
        supabase.from('v_leave_balance_live').select('annual_leave_days,accrued_days,used_days,reserved_days,actual_balance,available_balance').eq('employee_id', employee.id).maybeSingle(),
        supabase.from('v_employee_debt').select('outstanding_debt').eq('employee_id', employee.id).maybeSingle(),
      ]);
      if (leaveQ.data) Object.assign(suggestions, {
        annual_leave_days: leaveQ.data.annual_leave_days,
        leave_accrued: leaveQ.data.accrued_days,
        leave_used: leaveQ.data.used_days,
        leave_balance: leaveQ.data.actual_balance,
        leave_available: leaveQ.data.available_balance,
      });
      if (debtQ.data) suggestions.outstanding_debt = debtQ.data.outstanding_debt;
    }

    const project = projects.find((row) => row.id === projectId);
    if (project) {
      const client = entities.find((row) => row.id === project.entity_id);
      Object.assign(suggestions, {
        project_name: project.name_ar,
        project_no: project.project_no,
        site_location: project.site_address || project.city,
        client_name: client?.name_ar || '',
        contract_value: project.contract_value,
        start_date: project.commencement_date || project.start_date,
        commencement_date: project.commencement_date || project.start_date,
        planned_end: project.planned_end,
        duration_days: project.duration_days,
        retention_pct: project.retention_pct,
        advance_amount: project.advance_amount,
        advance_pct: project.advance_pct,
        cost_center: project.project_no,
      });
    }

    const party = selectedParty();
    if (party?.row) {
      if (party.type === 'entity') Object.assign(suggestions, {
        party_name: party.row.name_ar,
        party_identifier: party.row.cr_number || party.row.cr_no,
        party_role: party.row.entity_kind || 'جهة',
        party_contact: party.row.mobile || party.row.email,
        addressee: party.row.contact_name || party.row.name_ar,
        addressee_title: party.row.contact_title,
      });
      if (party.type === 'contractor') Object.assign(suggestions, {
        party_name: party.row.name_ar,
        party_identifier: party.row.cr_number || party.row.contractor_no,
        party_role: 'مقاول',
        party_contact: party.row.mobile || party.row.email,
      });
      if (party.type === 'candidate') Object.assign(suggestions, {
        party_name: party.row.full_name_ar,
        candidate_name: party.row.full_name_ar,
        party_identifier: party.row.id_number,
        party_role: 'مرشح',
        party_contact: party.row.mobile || party.row.email,
        nationality: party.row.nationality,
      });
    }

    return suggestions;
  }

  async function specialContent() {
    if (!projectId) return { rows:null, extras:{} };

    if (code === 'CAT_PROJECTS_OPERATIONS_CONTRACTOR_DAILY_TIMESHEET') {
      const party = selectedParty();
      if (party?.type !== 'contractor' || !party.row) return { rows:null, extras:{} };
      const assignmentQ = await supabase.from('labor_project_assignments')
        .select('laborer_id,labor_class,trade,valid_from,valid_to,laborers(full_name)')
        .eq('project_id', projectId).eq('contractor_id', party.row.id)
        .lte('valid_from', contextDate).or(`valid_to.is.null,valid_to.gte.${contextDate}`);
      if (assignmentQ.error) throw assignmentQ.error;
      const assignments = assignmentQ.data || [];
      const dayQ = await supabase.from('timesheet_days').select('id,notes').eq('project_id', projectId).eq('work_date', contextDate).maybeSingle();
      let attendance = [];
      if (dayQ.data?.id && assignments.length) {
        const ids = assignments.map((row) => row.laborer_id);
        const attendanceQ = await supabase.from('attendance').select('laborer_id,status,notes').eq('day_id', dayQ.data.id).in('laborer_id', ids);
        if (attendanceQ.error) throw attendanceQ.error;
        attendance = attendanceQ.data || [];
      }
      const rows = assignments.map((assignment) => {
        const at = attendance.find((row) => row.laborer_id === assignment.laborer_id);
        return {
          _id: crypto.randomUUID(),
          worker_name: assignment.laborers?.full_name || '',
          labor_class: assignment.labor_class === 'technician' ? 'صنايعي' : assignment.labor_class === 'foreman' ? 'فورمان' : 'عامل',
          trade: assignment.trade || '',
          attendance: at ? (ATTENDANCE_AR[at.status] || at.status) : 'غير مسجل',
          supervisor_notes: at?.notes || '',
        };
      });
      return { rows, extras:{ details:dayQ.data?.notes || '' } };
    }

    if (code === 'CAT_PROCUREMENT_ASSETS_MATERIAL_RECEIPT') {
      const materialQ = await supabase.from('project_materials')
        .select('material_name,unit,qty_in,received_at,supplier,invoice_ref,notes')
        .eq('project_id', projectId).eq('received_at', contextDate).order('material_name');
      if (materialQ.error) throw materialQ.error;
      const rows = (materialQ.data || []).map((row) => ({
        _id: crypto.randomUUID(),
        description: row.material_name,
        quantity: row.qty_in,
        unit: row.unit,
        status: [row.supplier ? `المورد: ${row.supplier}` : '', row.invoice_ref ? `مرجع: ${row.invoice_ref}` : '', row.notes || ''].filter(Boolean).join(' — '),
      }));
      return { rows, extras:{} };
    }

    if (code === 'CAT_FINANCE_ADMIN_BUDGET_VARIANCE') {
      const [budgetQ, financialQ] = await Promise.all([
        supabase.from('v_project_budget').select('*').eq('project_id', projectId).maybeSingle(),
        supabase.from('v_project_financials').select('*').eq('project_id', projectId).maybeSingle(),
      ]);
      const b = budgetQ.data;
      const f = financialQ.data;
      if (!b && !f) return { rows:null, extras:{} };
      const rows = [
        { _id:crypto.randomUUID(), description:'ميزانية الصرف المعتمدة للبنود', quantity:1, unit_price:Number(b?.total_spend_budget || 0), line_total:Number(b?.total_spend_budget || 0) },
        { _id:crypto.randomUUID(), description:'التكلفة المباشرة المعروفة حتى الآن', quantity:1, unit_price:Number(f?.direct_cost_known || 0), line_total:Number(f?.direct_cost_known || 0) },
        { _id:crypto.randomUUID(), description:'المتبقي من الميزانية', quantity:1, unit_price:Number(b?.total_remaining || 0), line_total:Number(b?.total_remaining || 0) },
      ];
      const details = `قيمة المشروع المسجلة: ${Number(f?.contract_value || b?.total_revenue || 0).toLocaleString('ar-SA')} ريال. الميزانية المسجلة: ${Number(b?.total_spend_budget || f?.budget_total || 0).toLocaleString('ar-SA')} ريال. التكلفة المباشرة المعروفة: ${Number(f?.direct_cost_known || 0).toLocaleString('ar-SA')} ريال. البنود المتجاوزة للميزانية: ${Number(b?.items_over_budget || 0)}.`;
      return { rows, extras:{ amount:Number(b?.total_spend_budget || f?.budget_total || 0), details } };
    }

    if (code === 'CAT_PROJECTS_OPERATIONS_DAILY_PROGRESS') {
      const [dayQ, financeQ] = await Promise.all([
        supabase.from('timesheet_days').select('id,notes,machinery,weather_stop').eq('project_id', projectId).eq('work_date', contextDate).maybeSingle(),
        supabase.from('v_project_financials').select('computed_progress_pct,manual_progress_pct,earned_value').eq('project_id', projectId).maybeSingle(),
      ]);
      let counts = {};
      if (dayQ.data?.id) {
        const aQ = await supabase.from('attendance').select('status').eq('day_id', dayQ.data.id);
        (aQ.data || []).forEach((row) => { counts[row.status] = (counts[row.status] || 0) + 1; });
      }
      const details = [
        dayQ.data?.notes || '',
        `الحضور المسجل: كامل ${counts.full || 0}، نصف يوم ${counts.half || 0}، غياب ${counts.absent || 0}.`,
        dayQ.data?.machinery ? `المعدات: ${dayQ.data.machinery}.` : '',
        dayQ.data?.weather_stop ? 'يوجد توقف مرتبط بالطقس في هذا اليوم.' : '',
        financeQ.data ? `نسبة الإنجاز الحالية المسجلة للمشروع: ${Number(financeQ.data.computed_progress_pct ?? financeQ.data.manual_progress_pct ?? 0).toFixed(2)}%.` : '',
      ].filter(Boolean).join('\n');
      return { rows:null, extras:{ details } };
    }

    if (code === 'CAT_PROJECTS_OPERATIONS_WEEKLY_PROGRESS') {
      const end = new Date(`${contextDate}T12:00:00`);
      const start = new Date(end); start.setDate(start.getDate() - 6);
      const from = start.toISOString().slice(0, 10);
      const daysQ = await supabase.from('timesheet_days').select('id,work_date,notes').eq('project_id', projectId).gte('work_date', from).lte('work_date', contextDate).order('work_date');
      const dayIds = (daysQ.data || []).map((row) => row.id);
      let counts = {};
      if (dayIds.length) {
        const aQ = await supabase.from('attendance').select('status').in('day_id', dayIds);
        (aQ.data || []).forEach((row) => { counts[row.status] = (counts[row.status] || 0) + 1; });
      }
      const financeQ = await supabase.from('v_project_financials').select('computed_progress_pct,manual_progress_pct,earned_value,claimed_gross,collected,pending_collection').eq('project_id', projectId).maybeSingle();
      const details = `الفترة من ${from} إلى ${contextDate}. أيام الموقع المسجلة: ${(daysQ.data || []).length}. تسجيلات الحضور: كامل ${counts.full || 0}، نصف يوم ${counts.half || 0}، غياب ${counts.absent || 0}.` + (financeQ.data ? ` نسبة الإنجاز الحالية: ${Number(financeQ.data.computed_progress_pct ?? financeQ.data.manual_progress_pct ?? 0).toFixed(2)}%، القيمة المكتسبة ${Number(financeQ.data.earned_value || 0).toLocaleString('ar-SA')} ريال، المطالبات ${Number(financeQ.data.claimed_gross || 0).toLocaleString('ar-SA')} ريال، المحصل ${Number(financeQ.data.collected || 0).toLocaleString('ar-SA')} ريال.` : '');
      return { rows:null, extras:{ details } };
    }

    return { rows:null, extras:{} };
  }

  async function applySmartFill() {
    setBusy(true); setErr(''); setInfo('');
    try {
      const suggestions = await buildSuggestions();
      const special = await specialContent();
      Object.assign(suggestions, special.extras || {});
      const currentPayload = documentRow?.payload || {};
      const merged = fillBlanks(currentPayload, suggestions);
      const hasMeaningfulRows = Array.isArray(currentPayload._rows) && currentPayload._rows.some((row) => Object.entries(row || {}).some(([key, value]) => key !== '_id' && !blank(value)));
      const nextRows = !hasMeaningfulRows && Array.isArray(special.rows) && special.rows.length ? special.rows : (currentPayload._rows || []);
      const party = selectedParty();
      const payload = {
        ...merged.next,
        _rows: nextRows,
        _autofill: {
          ...(currentPayload._autofill || {}),
          employee_id: employeeId || null,
          project_id: projectId || null,
          party_type: party?.type || null,
          party_id: party?.row?.id || null,
          context_date: contextDate,
          last_filled_at: new Date().toISOString(),
          mode: 'fill_blanks_only',
        },
      };

      const label = suggestions.employee_name || suggestions.project_name || suggestions.party_name || '';
      if (documentRow?.id) {
        const updateQ = await supabase.from('documents').update({
          payload,
          employee_id: employeeId || documentRow.employee_id || null,
          project_id: projectId || documentRow.project_id || null,
        }).eq('id', documentRow.id);
        if (updateQ.error) throw updateQ.error;
        const rowCount = Array.isArray(special.rows) && special.rows.length && !hasMeaningfulRows ? special.rows.length : 0;
        setInfo(`تم استكمال ${merged.filled} حقلًا من بيانات النظام${rowCount ? ` وإضافة ${rowCount} سطرًا` : ''}. لم يتم استبدال أي قيمة مكتوبة يدويًا.`);
        setTimeout(() => window.location.reload(), 900);
      } else {
        const draftNo = `DRAFT-SMART-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
        const insertQ = await supabase.from('documents').insert({
          doc_number: draftNo,
          template_code: template.code,
          language: 'ar',
          subject: `${template.name_ar}${label ? ` - ${label}` : ''}`,
          employee_id: employeeId || null,
          project_id: projectId || null,
          payload,
          status: 'draft',
          parties: {},
        }).select('id').single();
        if (insertQ.error) throw insertQ.error;
        router.replace(`/dashboard/documents/edit/${insertQ.data.id}`);
      }
    } catch (error) {
      setErr('تعذرت التعبئة الذكية: ' + (error.message || error));
    }
    setBusy(false);
  }

  const supportedSelectors = relationScope.includes('employee') || relationScope.includes('project') || relationScope.includes('party');
  if (!supportedSelectors) return null;

  return <div className="section" style={{marginTop:0,border:'1px solid var(--line)'}} data-document-smart-fill="true">
    <header style={{display:'flex',alignItems:'center',gap:10}}>
      <div>
        <h2>التعبئة الذكية من النظام</h2>
        <div className="hint">{PROFILE_LABELS[profile] || 'بيانات المستند'} — يملأ الفراغات فقط ويترك أي قيمة كتبتها يدويًا كما هي.</div>
      </div>
    </header>
    <div style={{padding:18}}>
      <div className="form-grid">
        {relationScope.includes('employee') && <div className="field">
          <label>الموظف</label>
          <select value={employeeId} onChange={(event)=>setEmployeeId(event.target.value)}>
            <option value="">بدون اختيار</option>
            {employees.map((row)=><option key={row.id} value={row.id}>{row.employee_no} - {row.full_name_ar}</option>)}
          </select>
        </div>}
        {relationScope.includes('project') && <div className="field">
          <label>المشروع</label>
          <select value={projectId} onChange={(event)=>setProjectId(event.target.value)}>
            <option value="">بدون اختيار</option>
            {projects.map((row)=><option key={row.id} value={row.id}>{row.project_no} - {row.name_ar}</option>)}
          </select>
        </div>}
        {relationScope.includes('party') && <div className="field">
          <label>{profile === 'recruitment_record' ? 'المرشح' : 'الطرف / الجهة'}</label>
          <select value={partyKey} onChange={(event)=>setPartyKey(event.target.value)}>
            <option value="">بدون اختيار</option>
            {partyOptions.map((row)=><option key={row.key} value={row.key}>{row.label}</option>)}
          </select>
        </div>}
        <div className="field">
          <label>تاريخ البيانات</label>
          <input type="date" value={contextDate} max={todayRiyadh()} onChange={(event)=>setContextDate(event.target.value)} />
          <span className="hint">يُستخدم للحضور والتقارير اليومية واستلام المواد عندما يكون النموذج يدعم ذلك.</span>
        </div>
      </div>
      <div style={{marginTop:14,display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
        <button type="button" className="btn" disabled={busy} onClick={applySmartFill}>{busy ? 'جارٍ قراءة البيانات…' : documentRow ? 'استكمال الفراغات من النظام' : 'إنشاء مسودة معبأة من النظام'}</button>
        <span className="hint">الحقول التي لا يدعمها البرنامج أو لا توجد لها بيانات تبقى مفتوحة للإدخال اليدوي.</span>
      </div>
      {err && <div className="msg err" style={{marginTop:12}}>{err}</div>}
      {info && <div className="msg ok" style={{marginTop:12}}>{info}</div>}
    </div>
  </div>;
}
