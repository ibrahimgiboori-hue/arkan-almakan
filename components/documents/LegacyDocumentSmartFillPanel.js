'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { byCode } from '@/lib/doc-templates';

const CANDIDATE_CODES = new Set(['JOB_OFFER', 'JOB_APPLICATION']);

function blank(value) {
  return value == null || (typeof value === 'string' && value.trim() === '');
}

function fillBlanks(current, suggestions) {
  const next = { ...(current || {}) };
  let filled = 0;
  Object.entries(suggestions || {}).forEach(([key, value]) => {
    if (blank(value)) return;
    if (blank(next[key])) {
      next[key] = value;
      filled += 1;
    }
  });
  return { next, filled };
}

export default function LegacyDocumentSmartFillPanel({ code, docId = null }) {
  const router = useRouter();
  const legacy = useMemo(() => byCode(code), [code]);
  const [template, setTemplate] = useState(null);
  const [documentRow, setDocumentRow] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [employeeId, setEmployeeId] = useState('');
  const [candidateId, setCandidateId] = useState('');
  const [leaveRequestId, setLeaveRequestId] = useState('');
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    if (!legacy) return;
    let active = true;
    (async () => {
      const templateQ = await supabase.from('document_templates').select('code,name_ar,layout,relation_scope').eq('code', code).maybeSingle();
      if (!active) return;
      if (templateQ.data?.layout?.sections?.length) {
        setTemplate(null);
        return;
      }
      setTemplate(templateQ.data || { code, name_ar:legacy.name, relation_scope:['employee'] });

      const [employeeQ, candidateQ] = await Promise.all([
        supabase.from('employees').select('id,employee_no,full_name_ar,nationality,id_number,id_expiry,birth_date,mobile,email,job_title,department,hire_date,basic_salary,housing_allowance,transport_allowance,other_allowance,annual_leave_days').order('employee_no'),
        CANDIDATE_CODES.has(code)
          ? supabase.from('candidates').select('id,full_name_ar,nationality,id_number,id_expiry,mobile,email,current_city').is('archived_at', null).order('full_name_ar')
          : Promise.resolve({ data: [] }),
      ]);
      if (!active) return;
      setEmployees(employeeQ.data || []);
      setCandidates(candidateQ.data || []);

      if (docId) {
        const docQ = await supabase.from('documents').select('id,payload,employee_id,subject').eq('id', docId).maybeSingle();
        if (!active || !docQ.data) return;
        setDocumentRow(docQ.data);
        setEmployeeId(docQ.data.employee_id || '');
        const meta = docQ.data.payload?._autofill || {};
        if (meta.candidate_id) setCandidateId(meta.candidate_id);
        if (meta.leave_request_id) setLeaveRequestId(meta.leave_request_id);
      }
    })();
    return () => { active = false; };
  }, [code, docId, legacy]);

  useEffect(() => {
    if (code !== 'LEAVE_REQUEST' || !employeeId) {
      setLeaveRequests([]);
      return;
    }
    let active = true;
    (async () => {
      const q = await supabase.from('leave_requests')
        .select('id,request_no,leave_kind,start_date,end_date,days_count,reason,return_date,status,record_source,paper_reference')
        .eq('employee_id', employeeId).order('start_date', { ascending:false }).limit(30);
      if (active) setLeaveRequests(q.data || []);
    })();
    return () => { active = false; };
  }, [code, employeeId]);

  if (!legacy || !template) return null;

  async function suggestionsForSelection() {
    const suggestions = {};
    const employee = employees.find((row) => row.id === employeeId);
    if (employee) {
      const allowances = Number(employee.housing_allowance || 0) + Number(employee.transport_allowance || 0) + Number(employee.other_allowance || 0);
      Object.assign(suggestions, {
        employee_name: employee.full_name_ar,
        employee_no: employee.employee_no,
        job_title: employee.job_title,
        department: employee.department,
        nationality: employee.nationality,
        id_number: employee.id_number,
        id_expiry: employee.id_expiry,
        birth_date: employee.birth_date,
        mobile: employee.mobile,
        email: employee.email,
        hire_date: employee.hire_date,
        basic_salary: employee.basic_salary,
        allowances,
        gross: Number(employee.basic_salary || 0) + allowances,
        current_salary: Number(employee.basic_salary || 0) + allowances,
        last_wage: Number(employee.basic_salary || 0) + allowances,
        current_title: employee.job_title,
        annual_leave: employee.annual_leave_days,
      });

      const [leaveQ, debtQ] = await Promise.all([
        supabase.from('v_leave_balance_live').select('actual_balance,available_balance').eq('employee_id', employee.id).maybeSingle(),
        supabase.from('v_employee_debt').select('outstanding_debt').eq('employee_id', employee.id).maybeSingle(),
      ]);
      if (leaveQ.data) suggestions.balance = leaveQ.data.available_balance ?? leaveQ.data.actual_balance;
      if (debtQ.data) suggestions.prior_debt = debtQ.data.outstanding_debt;
    }

    const candidate = candidates.find((row) => row.id === candidateId);
    if (candidate) Object.assign(suggestions, {
      candidate_name: candidate.full_name_ar,
      name: candidate.full_name_ar,
      nationality: candidate.nationality,
      id_number: candidate.id_number,
      id_expiry: candidate.id_expiry,
      mobile: candidate.mobile,
      email: candidate.email,
      city: candidate.current_city,
    });

    const leave = leaveRequests.find((row) => row.id === leaveRequestId);
    if (leave) Object.assign(suggestions, {
      leave_kind: leave.leave_kind,
      start_date: leave.start_date,
      end_date: leave.end_date,
      days: leave.days_count,
      return_date: leave.return_date,
      reason: leave.reason,
      ref_doc: leave.request_no || leave.paper_reference,
    });

    return suggestions;
  }

  async function applySmartFill() {
    setBusy(true); setErr(''); setInfo('');
    try {
      const suggestions = await suggestionsForSelection();
      const current = documentRow?.payload || {};
      const merged = fillBlanks(current, suggestions);
      const payload = {
        ...merged.next,
        _autofill: {
          ...(current._autofill || {}),
          employee_id: employeeId || null,
          candidate_id: candidateId || null,
          leave_request_id: leaveRequestId || null,
          last_filled_at: new Date().toISOString(),
          mode: 'fill_blanks_only',
        },
      };

      const subjectLabel = suggestions.employee_name || suggestions.candidate_name || suggestions.name || '';
      if (documentRow?.id) {
        const q = await supabase.from('documents').update({
          payload,
          employee_id: employeeId || documentRow.employee_id || null,
        }).eq('id', documentRow.id);
        if (q.error) throw q.error;
        setInfo(`تم استكمال ${merged.filled} حقلًا من بيانات النظام دون استبدال أي قيمة كتبتها يدويًا.`);
        setTimeout(() => window.location.reload(), 900);
      } else {
        const draftNo = `DRAFT-SMART-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
        const q = await supabase.from('documents').insert({
          doc_number: draftNo,
          template_code: code,
          language: 'ar',
          subject: `${legacy.name}${subjectLabel ? ` - ${subjectLabel}` : ''}`,
          employee_id: employeeId || null,
          payload,
          status: 'draft',
          parties: {},
        }).select('id').single();
        if (q.error) throw q.error;
        router.replace(`/dashboard/documents/edit/${q.data.id}`);
      }
    } catch (error) {
      setErr('تعذرت التعبئة الذكية: ' + (error.message || error));
    }
    setBusy(false);
  }

  return <div className="section" style={{marginTop:0,border:'1px solid var(--line)'}} data-legacy-document-smart-fill="true">
    <header><h2>التعبئة الذكية من النظام</h2></header>
    <div style={{padding:18}}>
      <div style={{marginBottom:14,color:'var(--ink-soft)',fontSize:13.5,lineHeight:1.8}}>
        هذا نموذج من مجموعة الموارد البشرية القديمة. جرى ربطه بملف الموظف والبيانات الفعلية المتاحة مع إبقاء كل الحقول غير المسجلة مفتوحة للإدخال اليدوي.
      </div>
      <div className="form-grid">
        {!CANDIDATE_CODES.has(code) && <div className="field">
          <label>الموظف</label>
          <select value={employeeId} onChange={(event)=>setEmployeeId(event.target.value)}>
            <option value="">بدون اختيار</option>
            {employees.map((row)=><option key={row.id} value={row.id}>{row.employee_no} - {row.full_name_ar}</option>)}
          </select>
        </div>}
        {CANDIDATE_CODES.has(code) && <div className="field">
          <label>المرشح</label>
          <select value={candidateId} onChange={(event)=>setCandidateId(event.target.value)}>
            <option value="">بدون اختيار</option>
            {candidates.map((row)=><option key={row.id} value={row.id}>{row.full_name_ar}</option>)}
          </select>
        </div>}
        {code === 'LEAVE_REQUEST' && employeeId && <div className="field">
          <label>طلب إجازة مسجل — اختياري</label>
          <select value={leaveRequestId} onChange={(event)=>setLeaveRequestId(event.target.value)}>
            <option value="">تعبئة بيانات الموظف والرصيد فقط</option>
            {leaveRequests.map((row)=><option key={row.id} value={row.id}>{row.request_no || row.paper_reference || 'طلب'} — {row.start_date} إلى {row.end_date}</option>)}
          </select>
        </div>}
      </div>
      <div style={{marginTop:14,display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
        <button type="button" className="btn" disabled={busy} onClick={applySmartFill}>{busy ? 'جارٍ قراءة البيانات…' : documentRow ? 'استكمال الفراغات من النظام' : 'إنشاء مسودة معبأة من النظام'}</button>
        <span className="hint">البيانات غير الموجودة في البرنامج لا يتم اختراعها؛ تكتبها أنت يدويًا.</span>
      </div>
      {err && <div className="msg err" style={{marginTop:12}}>{err}</div>}
      {info && <div className="msg ok" style={{marginTop:12}}>{info}</div>}
    </div>
  </div>;
}
