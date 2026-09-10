'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import ConstitutionPrintFrame from '@/components/print/ConstitutionPrintFrame';
import { PRINT_FLOW_KIND } from '@/lib/print-governance';
import { PAYMENT_METHOD_LABEL, formatMoney, formatMinutesSigned } from '@/lib/attendance/external-payroll';

function listDates(values=[]){
  if(!values?.length) return '—';
  return values.map((value)=>typeof value==='string'?value:value?.date).filter(Boolean).join('، ');
}

function money(value){ return `${formatMoney(value)} ر.س`; }

export default function PayslipPage(){
  const params=useParams();
  const batchId=String(params?.batchId||'');
  const lineId=String(params?.lineId||'');
  const [batch,setBatch]=useState(null);
  const [line,setLine]=useState(null);
  const [profile,setProfile]=useState(null);
  const [attendanceImport,setAttendanceImport]=useState(null);
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
        setBatch(bq.data);
        setLine(lq.data);
        setAttendanceImport(iq.data);
        setProfile(pq.data||null);
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
  if(!line?.calculated_at || (!calc.final_net_salary && calc.final_net_salary!==0))return <div className="msg err">قسيمة الراتب غير جاهزة. ارجع إلى معالجة الرواتب ونفّذ الاحتساب أولًا.</div>;

  const employeeName=employee.display_name||profile?.display_name||employee.source_name||'—';
  const employeeNo=employee.employee_no||profile?.display_employee_no||employee.source_no||'—';
  const payrollMonth=snapshot.payroll_month||attendanceImport?.period_from||'';
  const timeAmount=Number(calc.time_amount||0);
  const manualAdd=Number(calc.manual_additions||0);
  const manualDeduct=Number(calc.manual_deductions||0);
  const basic=salary.basic_salary ?? line.basic_salary;
  const housing=salary.housing_allowance ?? line.housing_allowance;
  const transport=salary.transport_allowance ?? line.transport_allowance;
  const other=salary.other_allowances ?? line.other_allowances;
  const gross=salary.gross_salary ?? line.calculated_gross_salary;
  const contributory=salary.contributory_wage ?? line.calculated_contributory_wage;
  const gosiRate=salary.gosi_employee_rate ?? line.calculated_gosi_employee_rate;
  const gosiDeduction=salary.gosi_employee_deduction ?? line.calculated_gosi_employee_deduction;
  const referenceNet=salary.reference_net_salary ?? line.reference_net_salary;
  const hasAttendanceDetails=Number(attendance.absence_days||0)>0 || Number(attendance.missing_punch_days||0)>0;
  const letterheadPath=String(batch?.client_letterhead_path||'').trim();
  const captainCfg=letterheadPath && !/^https?:\/\//i.test(letterheadPath)
    ? {letterhead_image_path:letterheadPath}
    : null;

  return <div className="external-payslip-print">
    <style jsx global>{`
      .external-payslip-print{direction:rtl;font-family:inherit;padding-bottom:22px}
      .external-payslip-actions{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:8px auto 10px}
      .external-payslip-actions button{border:1px solid #b9b9b9;background:#fff;color:#2f2f31;padding:7px 12px;font:inherit;font-size:12px;cursor:pointer}
      .external-payslip-actions button.primary{background:#8B3332;border-color:#8B3332;color:#fff}
      .print-doc-external_payroll_payslip .external-payslip-sheet{width:100%;font-size:11.5px;line-height:1.35;color:#2f2f31}
      .print-doc-external_payroll_payslip .external-payslip-table{width:100%;margin:0!important;border-collapse:collapse!important;table-layout:fixed}
      .print-doc-external_payroll_payslip .external-payslip-table th,
      .print-doc-external_payroll_payslip .external-payslip-table td{padding:1mm 1.5mm!important;line-height:1.35!important;vertical-align:middle!important;background:#fff}
      .print-doc-external_payroll_payslip .external-payslip-table .payslip-title-row th{font-size:16px!important;font-weight:800!important;text-align:center!important;background:#fff!important;color:#2f2f31!important;padding:1.5mm!important}
      .print-doc-external_payroll_payslip .external-payslip-table .payslip-client-row td{text-align:center!important;font-size:10.5px!important;color:#666!important;background:#fff!important}
      .print-doc-external_payroll_payslip .external-payslip-table .payslip-section-row th{font-size:11.5px!important;font-weight:800!important;text-align:right!important;background:#f3eeee!important;color:#5f2727!important;padding:.8mm 1.5mm!important}
      .print-doc-external_payroll_payslip .external-payslip-table .payslip-label{width:18%;font-weight:700;background:#faf8f8!important;color:#555}
      .print-doc-external_payroll_payslip .external-payslip-table .payslip-value{width:32%}
      .print-doc-external_payroll_payslip .external-payslip-table .payslip-money{text-align:left!important;direction:ltr;font-variant-numeric:tabular-nums;white-space:nowrap}
      .print-doc-external_payroll_payslip .external-payslip-table .payslip-net td{font-size:13px!important;font-weight:900!important;border-top:.45mm solid #8B3332!important;background:#fbf6f6!important}
      .print-doc-external_payroll_payslip .external-payslip-table .payslip-detail{font-size:10px!important;color:#666!important;line-height:1.45!important}
      .print-doc-external_payroll_payslip .external-payslip-table tr{break-inside:avoid}
      .print-doc-external_payroll_payslip .external-payslip-table .payslip-section-row{break-after:avoid}
      .external-payslip-http-letterhead{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;pointer-events:none;z-index:0}
      @media print{
        .external-payslip-actions,.attendance-workflow-nav,body>nav,body>header{display:none!important}
        .external-payslip-print{padding:0!important}
      }
    `}</style>

    <div className="external-payslip-actions no-print">
      <button onClick={()=>window.close()}>إغلاق</button>
      <button className="primary" onClick={()=>window.print()}>طباعة / حفظ PDF</button>
    </div>

    <ConstitutionPrintFrame
      documentKey="external_payroll_payslip"
      cfg={captainCfg}
      direction="rtl"
      renderOverlay={letterheadPath && /^https?:\/\//i.test(letterheadPath)
        ? ()=> <img className="external-payslip-http-letterhead" src={letterheadPath} alt=""/>
        : undefined}
    >
      <div className="external-payslip-sheet" dir="rtl">
        <table className="data-table external-payslip-table" data-print-flow={PRINT_FLOW_KIND.REPEATABLE_TABLE}>
          <thead>
            <tr className="payslip-title-row" data-print-row-atomic="true"><th colSpan={4}>قسيمة راتب — {payrollMonth}</th></tr>
          </thead>
          <tbody>
            <tr className="payslip-client-row" data-print-row-atomic="true"><td colSpan={4}>{attendanceImport?.client_name_snapshot||''}</td></tr>

            <tr className="payslip-section-row" data-print-row-atomic="true"><th colSpan={4}>بيانات الموظف</th></tr>
            <tr>
              <td className="payslip-label">الموظف</td><td className="payslip-value">{employeeName}</td>
              <td className="payslip-label">الرقم الوظيفي</td><td className="payslip-value">{employeeNo}</td>
            </tr>
            {(employee.show_job_title&&employee.job_title || employee.show_identity&&employee.identity_no)&&<tr>
              <td className="payslip-label">المسمى الوظيفي</td><td className="payslip-value">{employee.show_job_title&&employee.job_title?employee.job_title:'—'}</td>
              <td className="payslip-label">الهوية / الإقامة</td><td className="payslip-value">{employee.show_identity&&employee.identity_no?employee.identity_no:'—'}</td>
            </tr>}
            <tr>
              <td className="payslip-label">شهر الرواتب</td><td className="payslip-value">{payrollMonth}</td>
              <td className="payslip-label">طريقة الدفع</td><td className="payslip-value">{PAYMENT_METHOD_LABEL[paymentMethod]||'غير محددة'}</td>
            </tr>

            <tr className="payslip-section-row" data-print-row-atomic="true"><th colSpan={4}>مكونات الراتب</th></tr>
            <tr>
              <td className="payslip-label">الراتب الأساسي</td><td className="payslip-value payslip-money">{money(basic)}</td>
              <td className="payslip-label">بدل السكن</td><td className="payslip-value payslip-money">{money(housing)}</td>
            </tr>
            <tr>
              <td className="payslip-label">بدل النقل</td><td className="payslip-value payslip-money">{money(transport)}</td>
              <td className="payslip-label">بدلات أخرى</td><td className="payslip-value payslip-money">{money(other)}</td>
            </tr>
            {gross!=null&&<tr>
              <td className="payslip-label">إجمالي الراتب</td><td className="payslip-value payslip-money">{money(gross)}</td>
              <td className="payslip-label">الأجر الخاضع للاشتراك</td><td className="payslip-value payslip-money">{money(contributory)}</td>
            </tr>}
            {gosiDeduction!=null&&<tr>
              <td className="payslip-label">خصم التأمينات</td><td className="payslip-value payslip-money">{money(gosiDeduction)}</td>
              <td className="payslip-label">نسبة حصة الموظف</td><td className="payslip-value">{Number(gosiRate||0).toFixed(2)}%</td>
            </tr>}
            <tr>
              <td className="payslip-label">صافي الراتب المرجعي</td><td className="payslip-value payslip-money">{money(referenceNet)}</td>
              <td className="payslip-label">ساعات اليوم</td><td className="payslip-value">{line.calculated_day_hours||calc.day_hours||'—'}</td>
            </tr>

            <tr className="payslip-section-row" data-print-row-atomic="true"><th colSpan={4}>أثر الحضور</th></tr>
            <tr>
              <td className="payslip-label">الغياب</td><td className="payslip-value">{Number(attendance.absence_days||0)} يوم</td>
              <td className="payslip-label">خصم الغياب</td><td className="payslip-value payslip-money">{money(calc.absence_amount)}</td>
            </tr>
            <tr>
              <td className="payslip-label">البصمات المفقودة</td><td className="payslip-value">{Number(attendance.missing_punch_days||0)} حالة — دخول {Number(attendance.missing_in_count||0)} / خروج {Number(attendance.missing_out_count||0)}</td>
              <td className="payslip-label">خصم البصمات</td><td className="payslip-value payslip-money">{money(calc.missing_punch_amount)}</td>
            </tr>
            <tr>
              <td className="payslip-label">صافي الساعات</td><td className="payslip-value">{formatMinutesSigned(attendance.net_minutes||0)}</td>
              <td className="payslip-label">الأثر المالي</td><td className="payslip-value payslip-money">{timeAmount===0?money(0):`${timeAmount>0?'+':'−'} ${money(Math.abs(timeAmount))}`}</td>
            </tr>
            {hasAttendanceDetails&&<tr data-print-row-atomic="true">
              <td className="payslip-label">تفاصيل الحالات</td>
              <td colSpan={3} className="payslip-detail">
                {Number(attendance.absence_days||0)>0&&<>الغياب: {listDates(attendance.absence_dates)}</>}
                {Number(attendance.absence_days||0)>0&&Number(attendance.missing_punch_days||0)>0&&<> — </>}
                {Number(attendance.missing_punch_days||0)>0&&<>البصمات: {missingDates.map((item)=>`${item.date} (${item.label})`).join('، ')}</>}
              </td>
            </tr>}

            {(manualAdd>0||manualDeduct>0)&&<tr className="payslip-section-row" data-print-row-atomic="true"><th colSpan={4}>تعديلات أخرى</th></tr>}
            {manualAdd>0&&<tr>
              <td className="payslip-label">إضافة</td><td className="payslip-value">{calc.manual_additions_reason||'إضافة أخرى'}</td>
              <td className="payslip-label">المبلغ</td><td className="payslip-value payslip-money">{money(manualAdd)}</td>
            </tr>}
            {manualDeduct>0&&<tr>
              <td className="payslip-label">خصم</td><td className="payslip-value">{calc.manual_deductions_reason||'خصم آخر'}</td>
              <td className="payslip-label">المبلغ</td><td className="payslip-value payslip-money">{money(manualDeduct)}</td>
            </tr>}

            <tr className="payslip-section-row" data-print-row-atomic="true"><th colSpan={4}>الخلاصة</th></tr>
            <tr>
              <td className="payslip-label">إجمالي الإضافات</td><td className="payslip-value payslip-money">{money(calc.total_additions)}</td>
              <td className="payslip-label">إجمالي الخصومات</td><td className="payslip-value payslip-money">{money(calc.total_deductions)}</td>
            </tr>
            <tr className="payslip-net" data-print-row-atomic="true">
              <td colSpan={2}>صافي المستحق</td><td colSpan={2} className="payslip-money">{money(calc.final_net_salary)}</td>
            </tr>
            <tr data-print-row-atomic="true">
              <td className="payslip-label">الفترة</td><td colSpan={3}>{snapshot.period_from||attendanceImport?.period_from||'—'} إلى {snapshot.period_to||attendanceImport?.period_to||'—'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </ConstitutionPrintFrame>
  </div>;
}
