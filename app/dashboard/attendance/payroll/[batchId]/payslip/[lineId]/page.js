'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { PAYMENT_METHOD_LABEL, formatMoney, formatMinutesSigned } from '@/lib/attendance/external-payroll';

function listDates(values=[]){
  if(!values?.length) return '—';
  return values.map((value)=>typeof value==='string'?value:value?.date).filter(Boolean).join('، ');
}

export default function PayslipPage(){
  const params=useParams();
  const batchId=String(params?.batchId||'');
  const lineId=String(params?.lineId||'');
  const [batch,setBatch]=useState(null);
  const [line,setLine]=useState(null);
  const [profile,setProfile]=useState(null);
  const [attendanceImport,setAttendanceImport]=useState(null);
  const [letterheadUrl,setLetterheadUrl]=useState('');
  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState('');

  useEffect(()=>{
    async function load(){
      if(!batchId||!lineId)return;
      setLoading(true);setErr('');
      try{
        const bq=await supabase.from('hr_external_payroll_batches').select('*').eq('id',batchId).single();
        if(bq.error)throw bq.error;
        const lq=await supabase.from('hr_external_payroll_lines').select('*').eq('id',lineId).eq('payroll_batch_id',batchId).single();
        if(lq.error)throw lq.error;
        const iq=await supabase.from('hr_attendance_imports').select('id,client_name_snapshot,client_reference,period_from,period_to').eq('id',bq.data.attendance_import_id).single();
        if(iq.error)throw iq.error;
        const pq=await supabase.from('hr_client_external_employee_profiles').select('*').eq('client_key',bq.data.client_key).eq('source_employee_key',lq.data.source_employee_key).maybeSingle();
        if(pq.error)throw pq.error;
        setBatch(bq.data);setLine(lq.data);setAttendanceImport(iq.data);setProfile(pq.data||null);
        if(bq.data.client_letterhead_path){
          const path=String(bq.data.client_letterhead_path);
          if(/^https?:\/\//i.test(path)) setLetterheadUrl(path);
          else setLetterheadUrl(supabase.storage.from('brand').getPublicUrl(path).data.publicUrl||'');
        }
      }catch(e){setErr(e.message||String(e));}
      setLoading(false);
    }
    load();
  },[batchId,lineId]);

  const snapshot=useMemo(()=>line?.calculation_snapshot&&typeof line.calculation_snapshot==='object'?line.calculation_snapshot:{},[line]);
  const employee=snapshot.employee||{};
  const salary=snapshot.salary||{};
  const attendance=snapshot.attendance||{};
  const calc=snapshot.calculation||{};
  const paymentMethod=snapshot.payment_method||line?.payment_method||profile?.default_payment_method||batch?.default_payment_method||null;
  const missingDates=(attendance.missing_punch_dates||[]).map((item)=>({
    date:item?.date,
    label:item?.kind==='missing_in'?'دخول':item?.kind==='missing_out'?'خروج':'بصمة',
  }));

  if(loading)return <div className="section" style={{padding:24}}>جارٍ إعداد قسيمة الراتب…</div>;
  if(err)return <div className="msg err">{err}</div>;
  if(!line?.calculated_at || !calc.final_net_salary && calc.final_net_salary!==0)return <div className="msg err">قسيمة الراتب غير جاهزة. ارجع إلى معالجة الرواتب ونفّذ الاحتساب أولًا.</div>;

  const employeeName=employee.display_name||profile?.display_name||employee.source_name||'—';
  const employeeNo=employee.employee_no||profile?.display_employee_no||employee.source_no||'—';
  const payrollMonth=snapshot.payroll_month||attendanceImport?.period_from||'';
  const timeAmount=Number(calc.time_amount||0);
  const manualAdd=Number(calc.manual_additions||0);
  const manualDeduct=Number(calc.manual_deductions||0);
  const hasComponents=[salary.basic_salary,salary.housing_allowance,salary.transport_allowance,salary.other_allowances].some((v)=>v!=null&&Number(v)!==0);

  return <div className="payslip-screen">
    <style jsx global>{`
      .payslip-screen{direction:rtl;font-family:inherit;padding:0 0 30px}.payslip-actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin:10px 0 18px}.payslip-page{position:relative;width:210mm;min-height:297mm;margin:0 auto;background:#fff;box-shadow:0 8px 28px rgba(15,23,42,.14);overflow:hidden}.payslip-letterhead{position:absolute;inset:0;width:210mm;height:297mm;object-fit:fill;z-index:0;pointer-events:none}.payslip-content{position:relative;z-index:1;padding:38mm 18mm 28mm;box-sizing:border-box;min-height:297mm;color:#172033}.payslip-title{text-align:center;margin:0 0 18px;font-size:24px;font-weight:800;letter-spacing:.2px}.payslip-subtitle{text-align:center;margin:-10px 0 22px;font-size:12px;color:#64748b}.payslip-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 18px;border:1px solid #dbe3ec;border-radius:10px;padding:12px 14px;margin-bottom:16px}.payslip-field{display:flex;gap:8px;min-width:0}.payslip-field b{white-space:nowrap}.payslip-table{width:100%;border-collapse:collapse;margin:12px 0 16px;font-size:13px}.payslip-table th,.payslip-table td{border:1px solid #dbe3ec;padding:8px 9px;text-align:right;vertical-align:top}.payslip-table th{background:#f3f6f9;font-weight:800}.payslip-table td.amount,.payslip-table th.amount{text-align:left;white-space:nowrap}.payslip-section-title{font-size:14px;font-weight:800;margin:14px 0 7px}.payslip-summary{margin-top:16px;border:2px solid #25364b;border-radius:10px;overflow:hidden}.payslip-summary-row{display:flex;justify-content:space-between;gap:18px;padding:9px 12px;border-bottom:1px solid #dbe3ec}.payslip-summary-row:last-child{border-bottom:0;background:#f3f6f9;font-size:17px;font-weight:900}.payslip-note{font-size:11px;color:#526174;line-height:1.75}.payslip-payment{display:inline-block;border:1px solid #cbd5e1;border-radius:8px;padding:7px 11px;font-weight:700}.payslip-source{margin-top:18px;font-size:10px;color:#64748b;text-align:center}.payslip-muted{color:#64748b}.payslip-empty{color:#94a3b8}.payslip-action-btn{border:0;border-radius:9px;padding:10px 16px;background:#23364c;color:#fff;cursor:pointer;font-weight:700}.payslip-action-btn.secondary{background:#fff;color:#23364c;border:1px solid #cbd5e1}@media(max-width:900px){.payslip-page{transform-origin:top center;transform:scale(.72);margin-bottom:-83mm}.payslip-grid{grid-template-columns:1fr}}@media print{@page{size:A4;margin:0}html,body{margin:0!important;padding:0!important;background:#fff!important}.attendance-workflow-nav,.payslip-actions,body>nav,body>header{display:none!important}.payslip-screen{padding:0!important}.payslip-page{width:210mm;height:297mm;min-height:297mm;margin:0!important;box-shadow:none!important;transform:none!important;break-after:page;print-color-adjust:exact;-webkit-print-color-adjust:exact}.payslip-content{height:297mm;min-height:297mm}.payslip-letterhead{width:210mm;height:297mm}}
    `}</style>

    <div className="payslip-actions"><button className="payslip-action-btn secondary" onClick={()=>window.close()}>إغلاق</button><button className="payslip-action-btn" onClick={()=>window.print()}>طباعة / حفظ PDF</button></div>

    <article className="payslip-page">
      {letterheadUrl&&<img className="payslip-letterhead" src={letterheadUrl} alt=""/>}
      <div className="payslip-content">
        <h1 className="payslip-title">قسيمة راتب</h1>
        <div className="payslip-subtitle">{attendanceImport?.client_name_snapshot||''}</div>

        <div className="payslip-grid">
          <div className="payslip-field"><b>الموظف:</b><span>{employeeName}</span></div>
          <div className="payslip-field"><b>الرقم الوظيفي:</b><span>{employeeNo}</span></div>
          {employee.show_job_title&&employee.job_title&&<div className="payslip-field"><b>المسمى الوظيفي:</b><span>{employee.job_title}</span></div>}
          {employee.show_identity&&employee.identity_no&&<div className="payslip-field"><b>الهوية / الإقامة:</b><span>{employee.identity_no}</span></div>}
          <div className="payslip-field"><b>شهر الرواتب:</b><span>{payrollMonth}</span></div>
          <div className="payslip-field"><b>طريقة الدفع:</b><span>{PAYMENT_METHOD_LABEL[paymentMethod]||'غير محددة'}</span></div>
        </div>

        {hasComponents&&<><div className="payslip-section-title">مكونات الراتب</div><table className="payslip-table"><thead><tr><th>البيان</th><th className="amount">المبلغ (ر.س)</th></tr></thead><tbody>
          {salary.basic_salary!=null&&<tr><td>الراتب الأساسي</td><td className="amount">{formatMoney(salary.basic_salary)}</td></tr>}
          {salary.housing_allowance!=null&&<tr><td>بدل السكن</td><td className="amount">{formatMoney(salary.housing_allowance)}</td></tr>}
          {salary.transport_allowance!=null&&<tr><td>بدل النقل</td><td className="amount">{formatMoney(salary.transport_allowance)}</td></tr>}
          {salary.other_allowances!=null&&<tr><td>بدلات أخرى</td><td className="amount">{formatMoney(salary.other_allowances)}</td></tr>}
        </tbody></table></>}

        <div className="payslip-section-title">الاستحقاقات</div>
        <table className="payslip-table"><thead><tr><th>البيان</th><th>التفاصيل</th><th className="amount">المبلغ (ر.س)</th></tr></thead><tbody>
          <tr><td>صافي الراتب المرجعي</td><td className="payslip-muted">قبل أثر الحضور</td><td className="amount">{formatMoney(salary.reference_net_salary)}</td></tr>
          {timeAmount>0&&<tr><td>صافي فرق الساعات</td><td>{formatMinutesSigned(attendance.net_minutes||0)}</td><td className="amount">{formatMoney(timeAmount)}</td></tr>}
          {manualAdd>0&&<tr><td>إضافة</td><td>{calc.manual_additions_reason||'إضافة أخرى'}</td><td className="amount">{formatMoney(manualAdd)}</td></tr>}
          {timeAmount<=0&&manualAdd<=0&&<tr><td colSpan={3} className="payslip-empty">لا توجد إضافات أخرى.</td></tr>}
        </tbody></table>

        <div className="payslip-section-title">الخصومات</div>
        <table className="payslip-table"><thead><tr><th>البيان</th><th>التفاصيل</th><th className="amount">المبلغ (ر.س)</th></tr></thead><tbody>
          {Number(attendance.absence_days||0)>0&&<tr><td>غياب</td><td>{attendance.absence_days} يوم · {listDates(attendance.absence_dates)}</td><td className="amount">{formatMoney(calc.absence_amount)}</td></tr>}
          {Number(attendance.missing_punch_days||0)>0&&<tr><td>بصمة مفقودة</td><td>{attendance.missing_punch_days} يوم · دخول {attendance.missing_in_count||0} · خروج {attendance.missing_out_count||0}<br/><span className="payslip-muted">{missingDates.map((item)=>`${item.date} (${item.label})`).join('، ')}</span></td><td className="amount">{formatMoney(calc.missing_punch_amount)}</td></tr>}
          {timeAmount<0&&<tr><td>صافي نقص الساعات</td><td>{formatMinutesSigned(attendance.net_minutes||0)} · بعد المقاصة الشهرية</td><td className="amount">{formatMoney(Math.abs(timeAmount))}</td></tr>}
          {manualDeduct>0&&<tr><td>خصم آخر</td><td>{calc.manual_deductions_reason||'خصم آخر'}</td><td className="amount">{formatMoney(manualDeduct)}</td></tr>}
          {Number(calc.total_deductions||0)===0&&<tr><td colSpan={3} className="payslip-empty">لا توجد خصومات.</td></tr>}
        </tbody></table>

        <div className="payslip-summary">
          <div className="payslip-summary-row"><span>صافي الراتب المرجعي</span><b>{formatMoney(salary.reference_net_salary)} ر.س</b></div>
          <div className="payslip-summary-row"><span>إجمالي الإضافات</span><b>{formatMoney(calc.total_additions)} ر.س</b></div>
          <div className="payslip-summary-row"><span>إجمالي الخصومات</span><b>{formatMoney(calc.total_deductions)} ر.س</b></div>
          <div className="payslip-summary-row"><span>صافي المستحق</span><b>{formatMoney(calc.final_net_salary)} ر.س</b></div>
        </div>

        <div style={{marginTop:16}}><span className="payslip-payment">طريقة الدفع: {PAYMENT_METHOD_LABEL[paymentMethod]||'غير محددة'}</span></div>
        <div className="payslip-source">الفترة: {snapshot.period_from||attendanceImport?.period_from||'—'} إلى {snapshot.period_to||attendanceImport?.period_to||'—'}</div>
      </div>
    </article>
  </div>;
}
