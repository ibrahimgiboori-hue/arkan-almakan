'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import ConstitutionPrintFrame from '@/components/print/ConstitutionPrintFrame';
import { PRINT_FLOW_KIND } from '@/lib/print-governance';
import {
  PAYMENT_METHOD_LABEL,
  SOCIAL_INSURANCE_SCHEME_LABEL,
  formatMoney,
  formatMinutesSigned,
} from '@/lib/attendance/external-payroll';

function listDates(values=[]){
  if(!values?.length) return '—';
  return values.map((value)=>typeof value==='string'?value:value?.date).filter(Boolean).join('، ');
}

function money(value){ return `${formatMoney(value)} ر.س`; }
function present(value){ return value!==null && value!==undefined && value!==''; }

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
    let alive=true;
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
        if(alive){
          setBatch(bq.data);
          setLine(lq.data);
          setAttendanceImport(iq.data);
          setProfile(pq.data||null);
        }
      }catch(e){if(alive)setErr(e.message||String(e));}
      if(alive)setLoading(false);
    }
    load();
    return()=>{alive=false;};
  },[batchId,lineId]);

  const snapshot=useMemo(()=>line?.calculation_snapshot&&typeof line.calculation_snapshot==='object'?line.calculation_snapshot:{},[line]);
  const employee=snapshot.employee||{};
  const salary=snapshot.salary||{};
  const attendance=snapshot.attendance||{};
  const calc=snapshot.calculation||{};

  if(loading)return <main style={{padding:24,direction:'rtl'}}>جارٍ تجهيز القسيمة للطباعة…</main>;
  if(err)return <main style={{padding:24,direction:'rtl'}}>تعذر تجهيز القسيمة: {err}</main>;
  if(!line?.calculated_at || (!present(calc.final_net_salary) && !present(line.calculated_final_net_salary)))return <main style={{padding:24,direction:'rtl'}}>قسيمة الراتب غير جاهزة. أعد احتساب الرواتب أولًا.</main>;

  const employeeName=employee.display_name||profile?.display_name||employee.source_name||profile?.source_employee_name||'—';
  const employeeNo=employee.employee_no||profile?.display_employee_no||employee.source_no||profile?.source_employee_no||'—';
  const jobTitle=employee.job_title||profile?.job_title||'';
  const identityNo=employee.identity_no||profile?.identity_no||'';
  const showJobTitle=Boolean(employee.show_job_title??line.show_job_title);
  const showIdentity=Boolean(employee.show_identity??line.show_identity);
  const payrollMonth=snapshot.payroll_month||attendanceImport?.period_from||'';
  const paymentMethod=snapshot.payment_method||line?.payment_method||profile?.default_payment_method||batch?.default_payment_method||null;

  const basic=salary.basic_salary ?? line.basic_salary ?? 0;
  const housing=salary.housing_allowance ?? line.housing_allowance ?? 0;
  const transport=salary.transport_allowance ?? line.transport_allowance ?? 0;
  const other=salary.other_allowances ?? line.other_allowances ?? 0;
  const gross=salary.gross_salary ?? line.calculated_gross_salary ?? (Number(basic)+Number(housing)+Number(transport)+Number(other));
  const contributory=salary.contributory_wage ?? line.calculated_contributory_wage;
  const gosiRate=salary.gosi_employee_rate ?? line.calculated_gosi_employee_rate;
  const gosiDeduction=salary.gosi_employee_deduction ?? line.calculated_gosi_employee_deduction ?? 0;
  const referenceNet=salary.reference_net_salary ?? line.reference_net_salary ?? (Number(gross)-Number(gosiDeduction));
  const insuranceScheme=salary.social_insurance_scheme||profile?.social_insurance_scheme||'';

  const absenceDays=Number(attendance.absence_days ?? line.calculated_absence_days ?? 0);
  const missingPunchDays=Number(attendance.missing_punch_days ?? line.calculated_missing_punch_days ?? 0);
  const missingIn=Number(attendance.missing_in_count ?? line.calculated_missing_in_count ?? 0);
  const missingOut=Number(attendance.missing_out_count ?? line.calculated_missing_out_count ?? 0);
  const netMinutes=Number(attendance.net_minutes ?? line.calculated_net_minutes ?? 0);
  const absenceAmount=Number(calc.absence_amount ?? line.calculated_absence_amount ?? 0);
  const missingPunchAmount=Number(calc.missing_punch_amount ?? line.calculated_missing_punch_amount ?? 0);
  const timeAmount=Number(calc.time_amount ?? line.calculated_time_amount ?? 0);
  const manualAdd=Number(calc.manual_additions ?? line.manual_additions ?? 0);
  const manualDeduct=Number(calc.manual_deductions ?? line.manual_deductions ?? 0);
  const totalAdditions=Number(calc.total_additions ?? line.calculated_total_additions ?? 0);
  const totalDeductions=Number(calc.total_deductions ?? line.calculated_total_deductions ?? 0);
  const finalNet=Number(calc.final_net_salary ?? line.calculated_final_net_salary ?? 0);
  const absenceDates=attendance.absence_dates||[];
  const missingDates=attendance.missing_punch_dates||[];
  const hasAttendanceDetails=absenceDays>0||missingPunchDays>0;
  const hasOtherAdjustments=manualAdd>0||manualDeduct>0;

  const letterheadPath=String(batch?.client_letterhead_path||'').trim();
  const captainCfg=letterheadPath && !/^https?:\/\//i.test(letterheadPath)
    ? {letterhead_image_path:letterheadPath}
    : null;

  return <div className="external-payslip-print">
    <style jsx global>{`
      .external-payslip-print{direction:rtl}
      .external-payslip-actions{display:flex;gap:8px;justify-content:center;align-items:center;flex-wrap:wrap;margin:8px auto 10px}
      .external-payslip-actions button{border:1px solid #aaa;background:#fff;color:#222;padding:6px 10px;font:inherit;font-size:12px;cursor:pointer}
      .external-payslip-actions button.primary{background:#8B3332;border-color:#8B3332;color:#fff}
      .print-doc-external_payroll_payslip .external-payslip-table{width:100%;margin:0!important;table-layout:fixed;border-collapse:collapse}
      .print-doc-external_payroll_payslip .external-payslip-table .payslip-title{font-size:15px;font-weight:800;text-align:center!important;color:#2f2f31!important;background:#fff!important}
      .print-doc-external_payroll_payslip .external-payslip-table .payslip-client{text-align:center!important;color:#666!important;font-size:10.5px!important;background:#fff!important}
      .print-doc-external_payroll_payslip .external-payslip-table .payslip-section{font-weight:800!important;color:#6f2929!important;background:#f6eeee!important;text-align:right!important}
      .print-doc-external_payroll_payslip .external-payslip-table .payslip-label{font-weight:700;background:#fbf8f8!important;color:#4b4b4d}
      .print-doc-external_payroll_payslip .external-payslip-table .payslip-money{text-align:left!important;direction:ltr;font-variant-numeric:tabular-nums;white-space:nowrap}
      .print-doc-external_payroll_payslip .external-payslip-table .payslip-detail{font-size:10px!important;color:#5d5d61!important;line-height:1.35!important}
      .print-doc-external_payroll_payslip .external-payslip-table .payslip-total{font-weight:800!important}
      .print-doc-external_payroll_payslip .external-payslip-table .payslip-final td{font-size:13px!important;font-weight:900!important;border-top:.45mm solid #8B3332!important;background:#fbf5f5!important}
      .external-payslip-http-letterhead{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;pointer-events:none;z-index:0}
      @media print{
        .external-payslip-actions,.attendance-workflow-nav,.side,.topbar,.side-head,.side-foot,.nav,body>nav,body>header{display:none!important}
        html,body,.shell,.main,.page,.external-payslip-print{margin:0!important;padding:0!important;max-width:none!important;width:auto!important;background:#fff!important}
      }
    `}</style>

    <div className="external-payslip-actions no-print">
      <button onClick={()=>window.close()}>إغلاق</button>
      <button className="primary" onClick={()=>window.print()}>طباعة أو حفظ PDF</button>
    </div>

    <ConstitutionPrintFrame
      documentKey="external_payroll_payslip"
      cfg={captainCfg}
      direction="rtl"
      renderOverlay={letterheadPath && /^https?:\/\//i.test(letterheadPath)
        ? ()=> <img className="external-payslip-http-letterhead" src={letterheadPath} alt=""/>
        : undefined}
    >
      <div className="print-document" dir="rtl">
        <table className="print-data-table external-payslip-table" data-print-flow={PRINT_FLOW_KIND.REPEATABLE_TABLE}>
          <colgroup>{Array.from({length:6}).map((_,i)=><col key={i} style={{width:'16.6667%'}}/>)}</colgroup>
          <thead>
            <tr data-print-row data-print-row-atomic="true"><th className="payslip-title" colSpan={6}>قسيمة راتب — {payrollMonth}</th></tr>
            <tr data-print-row data-print-row-atomic="true"><td className="payslip-client" colSpan={6}>{attendanceImport?.client_name_snapshot||''}</td></tr>
          </thead>
          <tbody>
            <tr data-print-row data-print-row-atomic="true"><th className="payslip-section" colSpan={6}>بيانات الموظف</th></tr>
            <tr data-print-row>
              <td className="payslip-label">الموظف</td><td colSpan={2}>{employeeName}</td>
              <td className="payslip-label">الرقم الوظيفي</td><td colSpan={2}>{employeeNo}</td>
            </tr>
            {(showJobTitle&&jobTitle||showIdentity&&identityNo)&&<tr data-print-row>
              <td className="payslip-label">المسمى الوظيفي</td><td colSpan={2}>{showJobTitle&&jobTitle?jobTitle:'—'}</td>
              <td className="payslip-label">الهوية / الإقامة</td><td colSpan={2}>{showIdentity&&identityNo?identityNo:'—'}</td>
            </tr>}
            <tr data-print-row>
              <td className="payslip-label">شهر الرواتب</td><td colSpan={2}>{payrollMonth}</td>
              <td className="payslip-label">طريقة الدفع</td><td colSpan={2}>{PAYMENT_METHOD_LABEL[paymentMethod]||'غير محددة'}</td>
            </tr>

            <tr data-print-row data-print-row-atomic="true"><th className="payslip-section" colSpan={6}>مكونات الراتب</th></tr>
            <tr data-print-row>
              <td className="payslip-label">الراتب الأساسي</td><td colSpan={2} className="payslip-money">{money(basic)}</td>
              <td className="payslip-label">بدل السكن</td><td colSpan={2} className="payslip-money">{money(housing)}</td>
            </tr>
            <tr data-print-row>
              <td className="payslip-label">بدل النقل</td><td colSpan={2} className="payslip-money">{money(transport)}</td>
              <td className="payslip-label">بدلات أخرى</td><td colSpan={2} className="payslip-money">{money(other)}</td>
            </tr>
            <tr data-print-row>
              <td className="payslip-label">إجمالي الراتب</td><td colSpan={2} className="payslip-money">{money(gross)}</td>
              <td className="payslip-label">صافي الراتب قبل أثر الحضور</td><td colSpan={2} className="payslip-money">{money(referenceNet)}</td>
            </tr>
            <tr data-print-row>
              <td className="payslip-label">الأجر الخاضع للاشتراك</td><td colSpan={2} className="payslip-money">{present(contributory)?money(contributory):'—'}</td>
              <td className="payslip-label">التأمينات الاجتماعية</td><td colSpan={2}>{SOCIAL_INSURANCE_SCHEME_LABEL[insuranceScheme]||'—'}{present(gosiRate)?` · ${Number(gosiRate).toFixed(2)}%`:''}</td>
            </tr>
            <tr data-print-row>
              <td className="payslip-label">خصم التأمينات</td><td colSpan={2} className="payslip-money">{money(gosiDeduction)}</td>
              <td className="payslip-label">ساعات اليوم</td><td colSpan={2}>{line.calculated_day_hours||calc.day_hours||'—'}</td>
            </tr>

            <tr data-print-row data-print-row-atomic="true"><th className="payslip-section" colSpan={6}>أثر الحضور</th></tr>
            <tr data-print-row>
              <td className="payslip-label">الغياب</td><td colSpan={2}>{absenceDays} يوم</td>
              <td className="payslip-label">خصم الغياب</td><td colSpan={2} className="payslip-money">{money(absenceAmount)}</td>
            </tr>
            <tr data-print-row>
              <td className="payslip-label">البصمات المفقودة</td><td colSpan={2}>{missingPunchDays} حالة · دخول {missingIn} · خروج {missingOut}</td>
              <td className="payslip-label">خصم البصمات</td><td colSpan={2} className="payslip-money">{money(missingPunchAmount)}</td>
            </tr>
            <tr data-print-row>
              <td className="payslip-label">صافي فرق الساعات</td><td colSpan={2}>{formatMinutesSigned(netMinutes)}</td>
              <td className="payslip-label">الأثر المالي</td><td colSpan={2} className="payslip-money">{timeAmount===0?money(0):`${timeAmount>0?'+':'−'} ${money(Math.abs(timeAmount))}`}</td>
            </tr>
            {hasAttendanceDetails&&<tr data-print-row>
              <td className="payslip-label">تفاصيل الحالات</td>
              <td colSpan={5} className="payslip-detail">
                {absenceDays>0&&<>الغياب: {listDates(absenceDates)}</>}
                {absenceDays>0&&missingPunchDays>0&&<> · </>}
                {missingPunchDays>0&&<>البصمات: {missingDates.length?missingDates.map((item)=>`${typeof item==='string'?item:item?.date} (${item?.kind==='missing_in'?'دخول':item?.kind==='missing_out'?'خروج':'بصمة'})`).join('، '):`${missingPunchDays} حالة`}</>}
              </td>
            </tr>}

            {hasOtherAdjustments&&<tr data-print-row data-print-row-atomic="true"><th className="payslip-section" colSpan={6}>تعديلات أخرى</th></tr>}
            {manualAdd>0&&<tr data-print-row><td className="payslip-label">إضافة</td><td colSpan={3}>{calc.manual_additions_reason||line.manual_additions_reason||'إضافة أخرى'}</td><td className="payslip-label">القيمة</td><td className="payslip-money">{money(manualAdd)}</td></tr>}
            {manualDeduct>0&&<tr data-print-row><td className="payslip-label">خصم</td><td colSpan={3}>{calc.manual_deductions_reason||line.manual_deductions_reason||'خصم آخر'}</td><td className="payslip-label">القيمة</td><td className="payslip-money">{money(manualDeduct)}</td></tr>}

            <tr data-print-row data-print-row-atomic="true"><th className="payslip-section" colSpan={6}>الخلاصة</th></tr>
            <tr data-print-row><td className="payslip-total" colSpan={4}>صافي الراتب قبل أثر الحضور</td><td colSpan={2} className="payslip-money payslip-total">{money(referenceNet)}</td></tr>
            <tr data-print-row><td className="payslip-total" colSpan={4}>إجمالي الإضافات</td><td colSpan={2} className="payslip-money payslip-total">{money(totalAdditions)}</td></tr>
            <tr data-print-row><td className="payslip-total" colSpan={4}>إجمالي الخصومات</td><td colSpan={2} className="payslip-money payslip-total">{money(totalDeductions)}</td></tr>
            <tr className="payslip-final" data-print-row data-print-row-role="total" data-print-row-atomic="true"><td colSpan={4}>صافي المستحق</td><td colSpan={2} className="payslip-money">{money(finalNet)}</td></tr>
            <tr data-print-row><td className="payslip-label">الفترة</td><td colSpan={5}>{snapshot.period_from||attendanceImport?.period_from||'—'} إلى {snapshot.period_to||attendanceImport?.period_to||'—'}</td></tr>
          </tbody>
        </table>
      </div>
    </ConstitutionPrintFrame>
  </div>;
}
