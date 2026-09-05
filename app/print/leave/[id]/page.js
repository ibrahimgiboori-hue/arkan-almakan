'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { dateAr } from '@/lib/format';
import { LEAVE_AR } from '@/lib/requests';
import ConstitutionPrintFrame from '@/components/print/ConstitutionPrintFrame';
import LeaveProcedurePanel from '@/components/print/LeaveProcedurePanel';

function addDay(dateText) {
  if (!dateText) return null;
  const d = new Date(`${dateText}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0,10);
}

function v(x) { return x == null || x === '' ? '—' : x; }

function statusLabel(status) {
  const map = {
    draft:'مسودة',
    submitted:'بانتظار الإجراء الأول',
    hr_reviewed:'بانتظار الاعتماد النهائي',
    ceo_approved:'معتمد نهائيًا',
    rejected:'مرفوض',
    cancelled:'ملغى',
  };
  return map[status] || v(status);
}

export default function LeavePrint() {
  const { id } = useParams();
  const [row, setRow] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [before, setBefore] = useState(null);
  const [atReturn, setAtReturn] = useState(null);
  const [approvals, setApprovals] = useState([]);
  const [substitute, setSubstitute] = useState(null);
  const [finalApprover, setFinalApprover] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [r, s, a, subLink, finalPerson] = await Promise.all([
        supabase.from('leave_requests')
          .select('*, employees:employees!leave_requests_employee_id_fkey(id, employee_no, full_name_ar, job_title, department, hire_date, annual_leave_days)')
          .eq('id', id).single(),
        supabase.from('app_settings').select('*').eq('id', 1).maybeSingle(),
        supabase.from('v_approval_register').select('*')
          .eq('entity_table','leave_requests').eq('entity_id',id).order('step_order'),
        supabase.from('leave_request_substitutes').select('substitute_employee_id').eq('request_id',id).maybeSingle(),
        supabase.from('employees').select('id,full_name_ar,job_title,board_role')
          .eq('board_role','رئيس مجلس الإدارة').maybeSingle(),
      ]);
      if (r.error) {
        console.error('Leave print request load failed', r.error);
        setErr('تعذر تحميل طلب الإجازة. يرجى تحديث الصفحة والمحاولة مرة أخرى.');
        return;
      }
      setRow(r.data); setCfg(s.data); setApprovals(a.data || []); setFinalApprover(finalPerson.data || null);

      if (subLink.data?.substitute_employee_id) {
        const sub = await supabase.from('employees')
          .select('id,employee_no,full_name_ar,job_title,department,employment_kind,status,planned_start_date,planned_end_date')
          .eq('id',subLink.data.substitute_employee_id).maybeSingle();
        if (!sub.error) setSubstitute(sub.data || null);
      }

      const empId = r.data.employee_id;
      const returnDate = r.data.actual_return_date || addDay(r.data.end_date);
      const [b, ar] = await Promise.all([
        supabase.rpc('leave_balance_snapshot', { p_employee:empId, p_as_of:r.data.start_date, p_exclude_request:id }),
        supabase.rpc('leave_balance_snapshot', { p_employee:empId, p_as_of:returnDate, p_exclude_request:id }),
      ]);
      if (b.error || ar.error) {
        console.error('Leave print balance load failed', b.error || ar.error);
        setErr('تعذر تحميل بيانات رصيد الإجازة. يرجى تحديث الصفحة والمحاولة مرة أخرى.');
        return;
      }
      setBefore(b.data?.[0] || null); setAtReturn(ar.data?.[0] || null);
    })();
  }, [id]);

  const requestDays = Number(row?.days_count || 0);
  const affectsAnnual = row?.leave_kind === 'annual';
  const returnDate = row ? (row.actual_return_date || addDay(row.end_date)) : null;
  const expectedBalance = useMemo(() => {
    if (!atReturn) return null;
    return Number(atReturn.actual_balance || 0) - (affectsAnnual ? requestDays : 0);
  }, [atReturn, affectsAnnual, requestDays]);
  const exceptional = affectsAnnual && expectedBalance != null && Number(expectedBalance) < 0;

  if (err) return <div style={{padding:40}}>{err}</div>;
  if (!row || !cfg || !before || !atReturn) return <div style={{padding:40}}>جارٍ التحميل…</div>;

  const emp = row.employees || {};
  const substituteKind = substitute?.employment_kind === 'temporary_replacement' ? 'بديل مؤقت' : substitute ? 'موظف قائم' : '—';

  return (
    <>
      <div className="print-toolbar no-print">
        <button className="primary" onClick={()=>window.print()}>طباعة أو حفظ PDF</button>
        <span className="note">طلب إجازة — {emp.full_name_ar}</span>
      </div>

      <ConstitutionPrintFrame documentKey="leave_request" cfg={cfg}>
        <div className="xlsx-doc">
          <div className="xlsx-meta" data-print-keep-with-next="true">
            <span>{cfg.company_name_ar}</span>
            <span>{dateAr(row.paper_document_date || row.created_at)}</span>
          </div>

          <div className="xlsx-title" data-print-keep-with-next="true">
            <h1>طلب إجازة</h1>
            <span className="rule" />
          </div>

          <div className="xlsx-grid">
            <div className="xlsx-cell xlsx-label s2">الموظف</div>
            <div className="xlsx-cell xlsx-value s4">{emp.full_name_ar}</div>
            <div className="xlsx-cell xlsx-label s2">الرقم الوظيفي</div>
            <div className="xlsx-cell xlsx-value s4">{v(emp.employee_no)}</div>

            <div className="xlsx-cell xlsx-label s2">المسمى الوظيفي</div>
            <div className="xlsx-cell xlsx-value s4">{v(emp.job_title)}</div>
            <div className="xlsx-cell xlsx-label s2">الإدارة</div>
            <div className="xlsx-cell xlsx-value s4">{v(emp.department)}</div>

            <div className="xlsx-cell xlsx-label s2">تاريخ المباشرة</div>
            <div className="xlsx-cell xlsx-value s2">{dateAr(emp.hire_date)}</div>
            <div className="xlsx-cell xlsx-label s2">الاستحقاق السنوي</div>
            <div className="xlsx-cell xlsx-value s2">{Number(emp.annual_leave_days || before.annual_entitlement)} يوم</div>
            <div className="xlsx-cell xlsx-label s2">نوع الإجازة</div>
            <div className="xlsx-cell xlsx-value s2">{LEAVE_AR[row.leave_kind] || row.leave_kind}</div>

            <div className="xlsx-cell xlsx-label s2">من</div>
            <div className="xlsx-cell xlsx-value s2">{dateAr(row.start_date)}</div>
            <div className="xlsx-cell xlsx-label s2">إلى</div>
            <div className="xlsx-cell xlsx-value s2">{dateAr(row.end_date)}</div>
            <div className="xlsx-cell xlsx-label s2">تاريخ العودة</div>
            <div className="xlsx-cell xlsx-value s2">{dateAr(returnDate)}</div>

            <div className="xlsx-cell xlsx-label s2">عدد الأيام</div>
            <div className="xlsx-cell xlsx-value s2">{requestDays} يوم</div>
            <div className="xlsx-cell xlsx-label s2">الحالة</div>
            <div className="xlsx-cell xlsx-value s2">{statusLabel(row.status)}</div>
            <div className="xlsx-cell xlsx-label s2">الموظف البديل</div>
            <div className="xlsx-cell xlsx-value s2">{substitute?.full_name_ar || 'غير محدد'}</div>

            {substitute && <>
              <div className="xlsx-cell xlsx-label s2">نوع البديل</div>
              <div className="xlsx-cell xlsx-value s2">{substituteKind}</div>
              <div className="xlsx-cell xlsx-label s2">المسمى</div>
              <div className="xlsx-cell xlsx-value s6">{v(substitute.job_title)}</div>
            </>}

            {row.reason && <>
              <div className="xlsx-cell xlsx-label s2">السبب</div>
              <div className="xlsx-cell xlsx-value s10">{row.reason}</div>
            </>}
          </div>

          <div className="xlsx-grid">
            <div className="xlsx-cell xlsx-section s12">بيان رصيد الإجازة السنوية</div>

            <div className="xlsx-cell xlsx-label s2">المستحق عند البداية</div>
            <div className="xlsx-cell xlsx-value num s2">{before.accrued_days}</div>
            <div className="xlsx-cell xlsx-label s2">المستخدم سابقًا</div>
            <div className="xlsx-cell xlsx-value num s2">{before.used_days}</div>
            <div className="xlsx-cell xlsx-label s2">المتاح قبل الطلب</div>
            <div className="xlsx-cell xlsx-value num s2">{before.available_balance}</div>

            <div className="xlsx-cell xlsx-label s2">الخصم من الرصيد</div>
            <div className="xlsx-cell xlsx-value num s2">{affectsAnnual ? requestDays : 0}</div>
            <div className="xlsx-cell xlsx-label s2">المستحق عند العودة</div>
            <div className="xlsx-cell xlsx-value num s2">{atReturn.accrued_days}</div>
            <div className="xlsx-cell xlsx-label xlsx-strong s2">المتبقي بعد الاعتماد</div>
            <div className="xlsx-cell xlsx-value num xlsx-strong s2">{expectedBalance}</div>

            {Number(before.reserved_days || 0) > 0 && <>
              <div className="xlsx-cell xlsx-label s3">رصيد محجوز سابقًا</div>
              <div className="xlsx-cell xlsx-value num s1">{before.reserved_days}</div>
              <div className="xlsx-cell xlsx-value s8">—</div>
            </>}
          </div>

          {row.record_source === 'historical_paper' && (
            <div className="xlsx-grid">
              <div className="xlsx-cell xlsx-section s12">بيانات الملف التاريخي</div>
              <div className="xlsx-cell xlsx-label s2">المرجع</div>
              <div className="xlsx-cell xlsx-value s4">{v(row.paper_reference)}</div>
              <div className="xlsx-cell xlsx-label s2">المعتمد في الورقة</div>
              <div className="xlsx-cell xlsx-value s4">{v(row.paper_approver_text)}</div>
              <div className="xlsx-cell xlsx-label s2">تاريخ المستند</div>
              <div className="xlsx-cell xlsx-value s4">{dateAr(row.paper_document_date)}</div>
              <div className="xlsx-cell xlsx-label s2">المباشرة الفعلية</div>
              <div className="xlsx-cell xlsx-value s4">{dateAr(row.actual_return_date)}</div>
            </div>
          )}

          {row.record_source !== 'historical_paper' && (
            <LeaveProcedurePanel
              approvals={approvals}
              exceptional={exceptional}
              substitute={substitute}
              expectedFinalApprover={finalApprover}
            />
          )}
        </div>
      </ConstitutionPrintFrame>
    </>
  );
}
