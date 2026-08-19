'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { dateAr } from '@/lib/format';
import { LEAVE_AR } from '@/lib/requests';
import '../../employees/emp-report.css';

const pub = (p) => p ? supabase.storage.from('brand').getPublicUrl(p).data.publicUrl : null;

function addDay(dateText) {
  if (!dateText) return null;
  const d = new Date(`${dateText}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0,10);
}

function v(x) { return x == null || x === '' ? 'غير محدد' : x; }

export default function LeavePrint() {
  const { id } = useParams();
  const [row, setRow] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [before, setBefore] = useState(null);
  const [atReturn, setAtReturn] = useState(null);
  const [approvals, setApprovals] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [r, s, a] = await Promise.all([
        supabase.from('leave_requests')
          .select('*, employees(id, employee_no, full_name_ar, job_title, department, hire_date, annual_leave_days)')
          .eq('id', id).single(),
        supabase.from('app_settings').select('*').eq('id', 1).maybeSingle(),
        supabase.from('v_approval_register').select('*')
          .eq('entity_table','leave_requests').eq('entity_id',id).order('step_order'),
      ]);
      if (r.error) { setErr(r.error.message); return; }
      setRow(r.data); setCfg(s.data); setApprovals(a.data || []);

      const empId = r.data.employee_id;
      const returnDate = r.data.actual_return_date || addDay(r.data.end_date);
      const [b, ar] = await Promise.all([
        supabase.rpc('leave_balance_snapshot', { p_employee:empId, p_as_of:r.data.start_date, p_exclude_request:id }),
        supabase.rpc('leave_balance_snapshot', { p_employee:empId, p_as_of:returnDate, p_exclude_request:id }),
      ]);
      if (b.error || ar.error) { setErr((b.error || ar.error).message); return; }
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

  if (err) return <div style={{padding:40}}>{err}</div>;
  if (!row || !cfg || !before || !atReturn) return <div style={{padding:40}}>جارٍ التحميل</div>;

  const emp = row.employees || {};
  const headUrl = pub(cfg.header_image_path);
  const footUrl = pub(cfg.footer_image_path);
  const hMm = Number(cfg.header_height_mm || 40);
  const fMm = Number(cfg.footer_height_mm || 32);
  const mTop = Number(cfg.letterhead_top_mm || 46);
  const mBot = Number(cfg.letterhead_bottom_mm || 38);
  const mSide = Number(cfg.letterhead_side_mm || 20);

  return (
    <>
      <div className="rtoolbar no-print">
        <button className="primary" onClick={()=>window.print()}>طباعة أو حفظ PDF</button>
        <span className="rt-note">طلب إجازة: {emp.full_name_ar}</span>
      </div>

      <div className="pages">
        <div className="sheet">
          {headUrl ? <img className="r-head" src={headUrl} alt="" style={{height:`${hMm}mm`}} /> : <div className="r-head" style={{height:`${hMm}mm`}} />}

          <div className="content" style={{paddingTop:`${Math.max(0,mTop-hMm)}mm`,paddingBottom:`${Math.max(0,mBot-fMm)}mm`,paddingRight:`${mSide}mm`,paddingLeft:`${mSide}mm`}}>
            <div className="r-title">
              <h1>طلب إجازة</h1>
              <div className="r-meta"><span>{cfg.company_name_ar}</span><span>{dateAr(row.paper_document_date || row.created_at)}</span></div>
              <span className="r-rule" />
            </div>

            <table className="r-table" style={{marginBottom:'6mm'}}>
              <tbody>
                <tr><th style={{width:'28mm'}}>الموظف</th><td>{emp.full_name_ar}</td><th style={{width:'28mm'}}>الرقم الوظيفي</th><td>{v(emp.employee_no)}</td></tr>
                <tr><th>المسمى الوظيفي</th><td>{v(emp.job_title)}</td><th>الإدارة</th><td>{v(emp.department)}</td></tr>
                <tr><th>تاريخ المباشرة</th><td>{dateAr(emp.hire_date)}</td><th>الاستحقاق السنوي</th><td>{Number(emp.annual_leave_days || before.annual_entitlement)} يوم</td></tr>
                <tr><th>نوع الإجازة</th><td>{LEAVE_AR[row.leave_kind] || row.leave_kind}</td><th>عدد أيام الطلب</th><td>{requestDays} يوم</td></tr>
                <tr><th>من</th><td>{dateAr(row.start_date)}</td><th>إلى</th><td>{dateAr(row.end_date)}</td></tr>
                <tr><th>تاريخ العودة</th><td>{dateAr(returnDate)}</td><th>المصدر</th><td>{row.record_source === 'historical_paper' ? 'ملف ورقي قديم' : 'طلب حالي'}</td></tr>
                {row.reason && <tr><th>السبب</th><td colSpan={3}>{row.reason}</td></tr>}
              </tbody>
            </table>

            <div style={{fontWeight:700,marginBottom:'2mm'}}>بيان رصيد الإجازة السنوية</div>
            <table className="r-table" style={{marginBottom:'7mm'}}>
              <thead><tr><th>البيان</th><th className="num">الأيام</th></tr></thead>
              <tbody>
                <tr><td>الرصيد الكلي المستحق عند بداية الإجازة</td><td className="num">{before.accrued_days}</td></tr>
                <tr><td>الرصيد المستهلك قبل هذا الطلب</td><td className="num">{before.used_days}</td></tr>
                {Number(before.reserved_days || 0) > 0 && <tr><td>إجازات سنوية أخرى معتمدة ومحجوزة</td><td className="num">{before.reserved_days}</td></tr>}
                <tr><td>الرصيد المتاح قبل الطلب</td><td className="num">{before.available_balance}</td></tr>
                <tr><td>أيام الطلب الحالي المؤثرة على الرصيد</td><td className="num">{affectsAnnual ? requestDays : 0}</td></tr>
                <tr><td>الرصيد الكلي المستحق عند تاريخ العودة</td><td className="num">{atReturn.accrued_days}</td></tr>
                <tr className="r-total"><td>الرصيد المتوقع عند العودة بعد هذا الطلب</td><td className="num">{expectedBalance}</td></tr>
              </tbody>
            </table>

            <div style={{fontSize:12.5,lineHeight:1.8,marginBottom:'7mm'}}>
              يحتسب الاستحقاق تدريجياً من تاريخ المباشرة على أساس الاستحقاق السنوي خلال 365 يوماً، ويقرب أي كسر في الرصيد المستحق إلى يوم كامل. الإجازات غير السنوية لا تخصم من رصيد الإجازة السنوية إلا إذا نصت سياسة المنشأة على خلاف ذلك.
            </div>

            {row.record_source === 'historical_paper' && (
              <table className="r-table" style={{marginBottom:'7mm'}}>
                <tbody>
                  <tr><th style={{width:'32mm'}}>مرجع الملف القديم</th><td>{v(row.paper_reference)}</td><th style={{width:'32mm'}}>المعتمد في الورقة</th><td>{v(row.paper_approver_text)}</td></tr>
                  <tr><th>تاريخ المستند</th><td>{dateAr(row.paper_document_date)}</td><th>تاريخ المباشرة الفعلي</th><td>{dateAr(row.actual_return_date)}</td></tr>
                </tbody>
              </table>
            )}

            {approvals.length > 0 && (
              <div style={{marginBottom:'7mm'}}>
                <div style={{fontWeight:700,marginBottom:'2mm'}}>الاعتمادات المسجلة في النظام</div>
                <table className="r-table"><thead><tr><th>المرحلة</th><th>صاحب القرار</th><th>الصفة</th><th>التاريخ</th></tr></thead><tbody>
                  {approvals.map((a)=><tr key={a.id}><td>{v(a.stage_label_snapshot)}</td><td>{v(a.actor_name)}</td><td>{v(a.actor_title)}</td><td>{dateAr(a.decision_date)}</td></tr>)}
                </tbody></table>
              </div>
            )}

            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'8mm',marginTop:'9mm',textAlign:'center'}}>
              <div><div style={{fontWeight:700}}>الموظف</div><div style={{marginTop:'12mm',borderTop:'1px solid #777',paddingTop:'2mm'}}>الاسم والتوقيع</div></div>
              <div><div style={{fontWeight:700}}>المراجعة</div><div style={{marginTop:'12mm',borderTop:'1px solid #777',paddingTop:'2mm'}}>الاسم والتوقيع</div></div>
              <div><div style={{fontWeight:700}}>الاعتماد</div><div style={{marginTop:'12mm',borderTop:'1px solid #777',paddingTop:'2mm'}}>الاسم والتوقيع</div></div>
            </div>
          </div>

          <div className="pagenum">صفحة 1 من 1</div>
          {footUrl ? <img className="r-foot" src={footUrl} alt="" style={{height:`${fMm}mm`}} /> : <div className="r-foot" style={{height:`${fMm}mm`}} />}
        </div>
      </div>
    </>
  );
}
