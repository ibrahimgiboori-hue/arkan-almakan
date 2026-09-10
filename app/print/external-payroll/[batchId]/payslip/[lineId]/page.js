'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import ConstitutionPrintFrame from '@/components/print/ConstitutionPrintFrame';
import { PRINT_FLOW_KIND } from '@/lib/print-governance';
import { latinDigits } from '@/lib/latin-digits';
import {
  PAYMENT_METHOD_LABEL,
  formatMoney,
} from '@/lib/attendance/external-payroll';

function latin(value){ return latinDigits(value); }
function money(value){ return `${latin(formatMoney(value))} ر.س`; }
function present(value){ return value!==null && value!==undefined && value!==''; }
function percent(value){ return `${latin(Number(value||0).toFixed(2))}%`; }
function hoursFromMinutes(minutes){
  const value=Math.max(0,Math.round(Number(minutes||0)));
  const h=Math.floor(value/60);
  const m=value%60;
  return `${latin(h)}:${String(m).padStart(2,'0')} ساعة`;
}

export default function ExternalPayslipPrintPage(){
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
    let alive=true;
    (async()=>{
      if(!batchId||!lineId)return;
      setLoading(true);setErr('');
      try{
        const bq=await supabase.from('hr_external_payroll_batches').select('*').eq('id',batchId).single();
        if(bq.error)throw bq.error;
        const lq=await supabase.from('hr_external_payroll_lines').select('*').eq('id',lineId).eq('payroll_batch_id',batchId).single();
        if(lq.error)throw lq.error;
        const iq=await supabase.from('hr_attendance_imports').select('id,client_name_snapshot,period_from,period_to').eq('id',bq.data.attendance_import_id).single();
        if(iq.error)throw iq.error;
        const pq=await supabase.from('hr_client_external_employee_profiles').select('*').eq('client_key',bq.data.client_key).eq('source_employee_key',lq.data.source_employee_key).maybeSingle();
        if(pq.error)throw pq.error;
        if(alive){setBatch(bq.data);setLine(lq.data);setAttendanceImport(iq.data);setProfile(pq.data||null);}
      }catch(e){if(alive)setErr(e.message||String(e));}
      if(alive)setLoading(false);
    })();
    return()=>{alive=false;};
  },[batchId,lineId]);

  const snapshot=useMemo(()=>line?.calculation_snapshot&&typeof line.calculation_snapshot==='object'?line.calculation_snapshot:{},[line]);
  const employee=snapshot.employee||{};
  const salary=snapshot.salary||{};
  const attendance=snapshot.attendance||{};
  const calc=snapshot.calculation||{};

  if(loading)return <main style={{padding:24,direction:'rtl'}}>جارٍ تجهيز قسيمة الراتب…</main>;
  if(err)return <main style={{padding:24,direction:'rtl'}}>تعذر تجهيز قسيمة الراتب: {err}</main>;
  if(!line?.calculated_at || (!present(calc.final_net_salary) && !present(line.calculated_final_net_salary)))return <main style={{padding:24,direction:'rtl'}}>قسيمة الراتب غير جاهزة. أعد احتساب الرواتب أولًا.</main>;

  const employeeName=latin(employee.display_name||profile?.display_name||employee.source_name||profile?.source_employee_name||'—');
  const employeeNo=latin(employee.employee_no||profile?.display_employee_no||employee.source_no||profile?.source_employee_no||'—');
  const jobTitle=latin(employee.job_title||profile?.job_title||'');
  const identityNo=latin(employee.identity_no||profile?.identity_no||'');
  const showJobTitle=Boolean(employee.show_job_title??line.show_job_title);
  const showIdentity=Boolean(employee.show_identity??line.show_identity);
  const payrollMonth=latin(snapshot.payroll_month||attendanceImport?.period_from||'');
  const paymentMethod=snapshot.payment_method||line?.payment_method||profile?.default_payment_method||batch?.default_payment_method||null;

  const basic=Number(salary.basic_salary ?? line.basic_salary ?? 0);
  const housing=Number(salary.housing_allowance ?? line.housing_allowance ?? 0);
  const transport=Number(salary.transport_allowance ?? line.transport_allowance ?? 0);
  const other=Number(salary.other_allowances ?? line.other_allowances ?? 0);
  const gross=Number(salary.gross_salary ?? line.calculated_gross_salary ?? (basic+housing+transport+other));
  const gosiRate=Number(salary.gosi_employee_rate ?? line.calculated_gosi_employee_rate ?? 0);
  const gosiDeduction=Number(salary.gosi_employee_deduction ?? line.calculated_gosi_employee_deduction ?? 0);

  const absenceDays=Number(attendance.absence_days ?? line.calculated_absence_days ?? 0);
  const missingPunchDays=Number(attendance.missing_punch_days ?? line.calculated_missing_punch_days ?? 0);
  const netMinutes=Number(attendance.net_minutes ?? line.calculated_net_minutes ?? 0);
  const absenceAmount=Number(calc.absence_amount ?? line.calculated_absence_amount ?? 0);
  const missingPunchAmount=Number(calc.missing_punch_amount ?? line.calculated_missing_punch_amount ?? 0);
  const timeAmount=Number(calc.time_amount ?? line.calculated_time_amount ?? 0);
  const manualAdd=Number(calc.manual_additions ?? line.manual_additions ?? 0);
  const manualDeduct=Number(calc.manual_deductions ?? line.manual_deductions ?? 0);
  const totalAttendanceDeductions=Number(calc.total_deductions ?? line.calculated_total_deductions ?? 0);
  const totalDeductions=gosiDeduction+totalAttendanceDeductions;
  const totalEarnings=gross+Math.max(0,timeAmount)+manualAdd;
  const finalNet=Number(calc.final_net_salary ?? line.calculated_final_net_salary ?? 0);

  const overtimeMinutes=timeAmount>0?Math.max(0,netMinutes):0;
  const shortMinutes=timeAmount<0?Math.max(0,-netMinutes):0;
  const timeDeduction=Math.max(0,-timeAmount);
  const timeAddition=Math.max(0,timeAmount);

  const letterheadPath=String(batch?.client_letterhead_path||'').trim();
  const captainCfg=letterheadPath && !/^https?:\/\//i.test(letterheadPath)?{letterhead_image_path:letterheadPath}:null;

  return <div className="external-payslip-print">
    <style jsx global>{`
      .external-payslip-print{direction:rtl}
      .external-payslip-actions{display:flex;gap:8px;justify-content:center;align-items:center;flex-wrap:wrap;margin:8px auto 10px}
      .external-payslip-actions button{border:1px solid #aaa;background:#fff;color:#222;padding:6px 10px;font:inherit;font-size:12px;cursor:pointer}
      .external-payslip-actions button.primary{background:#8B3332;border-color:#8B3332;color:#fff}
      .print-doc-external_payroll_payslip .external-payslip-table{width:100%;margin:0!important;table-layout:fixed;border-collapse:collapse}
      .print-doc-external_payroll_payslip .external-payslip-table th,
      .print-doc-external_payroll_payslip .external-payslip-table td{padding:1.35mm 1.7mm!important;line-height:1.2!important;vertical-align:middle!important}
      .print-doc-external_payroll_payslip .external-payslip-table .payslip-title{font-size:14px!important;font-weight:800;text-align:center!important;color:#2f2f31!important;background:#fff!important;padding:1.8mm!important}
      .print-doc-external_payroll_payslip .external-payslip-table .payslip-client{text-align:center!important;color:#666!important;font-size:10px!important;background:#fff!important;padding:1.1mm!important}
      .print-doc-external_payroll_payslip .external-payslip-table .payslip-section{font-size:10.5px!important;font-weight:800!important;color:#6f2929!important;background:#f6eeee!important;text-align:right!important;padding:1.15mm 1.7mm!important}
      .print-doc-external_payroll_payslip .external-payslip-table .payslip-head{font-weight:800!important;background:#fbf8f8!important;color:#444!important}
      .print-doc-external_payroll_payslip .external-payslip-table .payslip-label{font-weight:700;background:#fbf8f8!important;color:#4b4b4d}
      .print-doc-external_payroll_payslip .external-payslip-table .payslip-number,
      .print-doc-external_payroll_payslip .external-payslip-table .payslip-money{font-family:Arial,Helvetica,sans-serif!important;direction:ltr!important;unicode-bidi:isolate!important;font-variant-numeric:lining-nums tabular-nums!important;white-space:nowrap}
      .print-doc-external_payroll_payslip .external-payslip-table .payslip-money{text-align:left!important;font-weight:600}
      .print-doc-external_payroll_payslip .external-payslip-table .payslip-total{font-weight:800!important;background:#fbf8f8!important}
      .print-doc-external_payroll_payslip .external-payslip-table .payslip-final td{font-size:12.5px!important;font-weight:900!important;border-top:.45mm solid #8B3332!important;background:#fbf5f5!important}
      .print-doc-external_payroll_payslip .external-payslip-table .payslip-period{font-size:9px!important;color:#666!important;text-align:center!important;background:#fff!important}
      .external-payslip-http-letterhead{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;pointer-events:none;z-index:0}
    `}</style>

    <div className="external-payslip-actions no-print">
      <button onClick={()=>window.close()}>إغلاق</button>
      <button className="primary" onClick={()=>window.print()}>طباعة / حفظ PDF</button>
    </div>

    <ConstitutionPrintFrame
      documentKey="external_payroll_payslip"
      cfg={captainCfg}
      direction="rtl"
      renderOverlay={letterheadPath && /^https?:\/\//i.test(letterheadPath)?()=> <img className="external-payslip-http-letterhead" src={letterheadPath} alt=""/>:undefined}
    >
      <div className="print-document" dir="rtl">
        <table className="print-data-table external-payslip-table" data-print-flow={PRINT_FLOW_KIND.REPEATABLE_TABLE}>
          <colgroup>{Array.from({length:12}).map((_,i)=><col key={i} style={{width:'8.3333%'}}/>)}</colgroup>
          <thead>
            <tr data-print-row data-print-row-atomic="true"><th className="payslip-title" colSpan={12}>قسيمة راتب — <span className="payslip-number">{payrollMonth}</span></th></tr>
            <tr data-print-row data-print-row-atomic="true"><td className="payslip-client" colSpan={12}>{latin(attendanceImport?.client_name_snapshot||'')}</td></tr>
          </thead>
          <tbody>
            <tr data-print-row data-print-row-atomic="true"><th className="payslip-section" colSpan={12}>بيانات الموظف</th></tr>
            <tr data-print-row>
              <td className="payslip-label" colSpan={2}>اسم الموظف</td><td colSpan={4}>{employeeName}</td>
              <td className="payslip-label" colSpan={2}>الرقم الوظيفي</td><td className="payslip-number" colSpan={4}>{employeeNo}</td>
            </tr>
            {(showJobTitle&&jobTitle||showIdentity&&identityNo)&&<tr data-print-row>
              <td className="payslip-label" colSpan={2}>المسمى الوظيفي</td><td colSpan={4}>{showJobTitle&&jobTitle?jobTitle:''}</td>
              <td className="payslip-label" colSpan={2}>الهوية / الإقامة</td><td className="payslip-number" colSpan={4}>{showIdentity&&identityNo?identityNo:''}</td>
            </tr>}
            <tr data-print-row>
              <td className="payslip-label" colSpan={2}>شهر الراتب</td><td className="payslip-number" colSpan={4}>{payrollMonth}</td>
              <td className="payslip-label" colSpan={2}>طريقة الدفع</td><td colSpan={4}>{PAYMENT_METHOD_LABEL[paymentMethod]||'غير محددة'}</td>
            </tr>

            <tr data-print-row data-print-row-atomic="true"><th className="payslip-section" colSpan={12}>الاستحقاقات</th></tr>
            <tr data-print-row><th className="payslip-head" colSpan={5}>البيان</th><th className="payslip-head" colSpan={3}>التفاصيل</th><th className="payslip-head" colSpan={4}>المبلغ</th></tr>
            <tr data-print-row><td colSpan={5}>الراتب الأساسي</td><td colSpan={3}></td><td colSpan={4} className="payslip-money">{money(basic)}</td></tr>
            {housing>0&&<tr data-print-row><td colSpan={5}>بدل السكن</td><td colSpan={3}></td><td colSpan={4} className="payslip-money">{money(housing)}</td></tr>}
            {transport>0&&<tr data-print-row><td colSpan={5}>بدل النقل</td><td colSpan={3}></td><td colSpan={4} className="payslip-money">{money(transport)}</td></tr>}
            {other>0&&<tr data-print-row><td colSpan={5}>بدلات أخرى</td><td colSpan={3}></td><td colSpan={4} className="payslip-money">{money(other)}</td></tr>}
            {timeAddition>0&&<tr data-print-row><td colSpan={5}>ساعات إضافية</td><td colSpan={3} className="payslip-number">{hoursFromMinutes(overtimeMinutes)}</td><td colSpan={4} className="payslip-money">{money(timeAddition)}</td></tr>}
            {manualAdd>0&&<tr data-print-row><td colSpan={5}>{latin(calc.manual_additions_reason||line.manual_additions_reason||'إضافة أخرى')}</td><td colSpan={3}></td><td colSpan={4} className="payslip-money">{money(manualAdd)}</td></tr>}
            <tr data-print-row data-print-row-role="total" data-print-row-atomic="true"><td className="payslip-total" colSpan={8}>إجمالي الاستحقاقات</td><td className="payslip-money payslip-total" colSpan={4}>{money(totalEarnings)}</td></tr>

            <tr data-print-row data-print-row-atomic="true"><th className="payslip-section" colSpan={12}>الخصومات</th></tr>
            <tr data-print-row><th className="payslip-head" colSpan={5}>البيان</th><th className="payslip-head" colSpan={3}>التفاصيل</th><th className="payslip-head" colSpan={4}>المبلغ</th></tr>
            {gosiDeduction>0&&<tr data-print-row><td colSpan={5}>التأمينات الاجتماعية</td><td colSpan={3} className="payslip-number">{percent(gosiRate)}</td><td colSpan={4} className="payslip-money">{money(gosiDeduction)}</td></tr>}
            {absenceAmount>0&&<tr data-print-row><td colSpan={5}>الغياب</td><td colSpan={3} className="payslip-number">{latin(absenceDays)} يوم</td><td colSpan={4} className="payslip-money">{money(absenceAmount)}</td></tr>}
            {timeDeduction>0&&<tr data-print-row><td colSpan={5}>التأخير / نقص الساعات</td><td colSpan={3} className="payslip-number">{hoursFromMinutes(shortMinutes)}</td><td colSpan={4} className="payslip-money">{money(timeDeduction)}</td></tr>}
            {missingPunchAmount>0&&<tr data-print-row><td colSpan={5}>البصمات المفقودة</td><td colSpan={3} className="payslip-number">{latin(missingPunchDays)} حالة</td><td colSpan={4} className="payslip-money">{money(missingPunchAmount)}</td></tr>}
            {manualDeduct>0&&<tr data-print-row><td colSpan={5}>{latin(calc.manual_deductions_reason||line.manual_deductions_reason||'خصم آخر')}</td><td colSpan={3}></td><td colSpan={4} className="payslip-money">{money(manualDeduct)}</td></tr>}
            <tr data-print-row data-print-row-role="total" data-print-row-atomic="true"><td className="payslip-total" colSpan={8}>إجمالي الخصومات</td><td className="payslip-money payslip-total" colSpan={4}>{money(totalDeductions)}</td></tr>
            <tr className="payslip-final" data-print-row data-print-row-role="total" data-print-row-atomic="true"><td colSpan={8}>صافي الراتب</td><td className="payslip-money" colSpan={4}>{money(finalNet)}</td></tr>
            <tr data-print-row><td className="payslip-period" colSpan={12}>فترة الراتب: <span className="payslip-number">{latin(snapshot.period_from||attendanceImport?.period_from||'—')} إلى {latin(snapshot.period_to||attendanceImport?.period_to||'—')}</span></td></tr>
          </tbody>
        </table>
      </div>
    </ConstitutionPrintFrame>
  </div>;
}
