'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import ConstitutionPagedFrame from '@/components/print/ConstitutionPagedFrame';
import { getPrintLayoutPolicy, paginateRows } from '@/lib/print-governance';

const n=(v)=>Number(v||0);
const money=(v)=>`${n(v).toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})} ر.س`;
const STATUS={draft:'مسودة',submitted:'مرسلة للاعتماد',hr_reviewed:'مراجعة الموارد البشرية',accountant_approved:'مراجعة مالية',ceo_approved:'معتمدة',rejected:'مرفوضة',cancelled:'ملغاة'};
const STEP_STATUS={pending:'قيد الانتظار',approved:'معتمد',returned:'معاد للتعديل',rejected:'مرفوض',cancelled:'ملغى'};

function stateOf(run,guard){
  if(guard?.finalization_allowed)return {key:'approved',label:'معتمد'};
  if(run?.status==='rejected')return {key:'rejected',label:'مرفوض'};
  if(run?.status==='cancelled')return {key:'cancelled',label:'ملغى'};
  if(run?.status && run.status!=='draft')return {key:'review',label:'قيد الاعتماد'};
  return {key:'draft',label:'مسودة — غير معتمد'};
}

export default function PayrollPrintPage(){
  const params=useParams();
  const id=String(params?.id||'');
  const [run,setRun]=useState(null);
  const [lines,setLines]=useState([]);
  const [employees,setEmployees]=useState([]);
  const [cfg,setCfg]=useState(null);
  const [guard,setGuard]=useState(null);
  const [approval,setApproval]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const empMap=useMemo(()=>new Map(employees.map(e=>[e.id,e])),[employees]);
  const layout=useMemo(()=>getPrintLayoutPolicy('payroll_run'),[]);

  useEffect(()=>{let alive=true;(async()=>{
    if(!id)return;
    setLoading(true);setError('');
    const [runQ,linesQ,empQ,cfgQ,guardQ]=await Promise.all([
      supabase.from('payroll_runs').select('*').eq('id',id).maybeSingle(),
      supabase.from('payroll_lines').select('*').eq('run_id',id).order('employee_id'),
      supabase.from('employees').select('id,employee_no,full_name_ar').order('full_name_ar'),
      supabase.from('app_settings').select('*').eq('id',1).maybeSingle(),
      supabase.rpc('fn_transaction_guard_state',{p_source_table:'payroll_runs',p_source_id:id}),
    ]);
    const firstError=runQ.error||linesQ.error||empQ.error||cfgQ.error||guardQ.error;
    if(firstError){if(alive){setError(firstError.message);setLoading(false);}return;}
    if(alive){
      setRun(runQ.data||null);
      setLines(linesQ.data||[]);
      setEmployees(empQ.data||[]);
      setCfg(cfgQ.data||null);
      setGuard(guardQ.data||null);
    }
    const executionRef=guardQ.data?.execution_ref;
    if(executionRef){
      const detailQ=await supabase.rpc('fn_approval_get',{p_workflow_id:executionRef});
      if(alive&&!detailQ.error)setApproval(detailQ.data||null);
    }
    if(alive)setLoading(false);
  })();return()=>{alive=false;};},[id]);

  if(loading)return <main style={{padding:30,direction:'rtl'}}>جارٍ تجهيز المسير للطباعة…</main>;
  if(error)return <main style={{padding:30,direction:'rtl'}}>تعذر تجهيز الطباعة: {error}</main>;
  if(!run)return <main style={{padding:30,direction:'rtl'}}>مسير الرواتب غير موجود.</main>;

  const totals=lines.reduce((a,r)=>({gross:a.gross+n(r.gross_pay),ded:a.ded+n(r.total_deductions),net:a.net+n(r.net_pay)}),{gross:0,ded:0,net:0});
  const pages=paginateRows(lines,layout.pagination);
  const printState=stateOf(run,guard);
  const steps=approval?.steps||[];
  let rowOffset=0;

  return <>
    <div className="print-toolbar no-print">
      <div className="group">
        <button className="primary" onClick={()=>window.print()}>طباعة أو حفظ PDF</button>
        <button onClick={()=>window.close()}>إغلاق</button>
      </div>
      <span className="note">مسير الرواتب · {String(run.run_month).slice(0,7)} · {printState.label}</span>
    </div>

    <ConstitutionPagedFrame
      documentKey="payroll_run"
      cfg={cfg}
      showLetterhead={false}
      direction="rtl"
      contentTopMm={layout.topMm}
      contentBottomMm={layout.bottomMm}
      contentSideMm={layout.sideMm}
    >
      {pages.map((pageRows,pageIndex)=>{
        const start=rowOffset;
        rowOffset+=pageRows.length;
        const isFirst=pageIndex===0;
        const isFinal=pageIndex===pages.length-1;
        return <div className="print-document" key={`payroll-page-${pageIndex}`}>
          {isFirst&&<>
            <header className="print-document-head">
              <div>
                <h1 className="print-document-title">مسير الرواتب</h1>
                <div className="print-document-subtitle">أركان المكان · نسخة صادرة من محرك الطباعة المركزي</div>
              </div>
              <div className={`print-document-state print-state-${printState.key}`}>{printState.label}</div>
            </header>
            <section className="print-meta-grid">
              <div className="print-meta-item"><span>الشهر</span><strong>{String(run.run_month).slice(0,7)}</strong></div>
              <div className="print-meta-item"><span>رقم المعاملة</span><strong>{guard?.transaction_no||'—'}</strong></div>
              <div className="print-meta-item"><span>الحالة التشغيلية</span><strong>{STATUS[run.status]||run.status}</strong></div>
              <div className="print-meta-item"><span>عدد الموظفين</span><strong>{lines.length}</strong></div>
            </section>
          </>}

          <table className="print-data-table">
            <colgroup>
              <col style={{width:'4%'}}/><col style={{width:'18%'}}/>
              {Array.from({length:9}).map((_,i)=><col key={i} style={{width:`${78/9}%`}}/>)}
            </colgroup>
            <thead><tr><th>#</th><th className="text">الموظف</th><th>الأساسي</th><th>السكن</th><th>النقل</th><th>بدلات أخرى</th><th>إضافي</th><th>عمولة</th><th>الإجمالي</th><th>الخصومات</th><th>الصافي</th></tr></thead>
            <tbody>{pageRows.map((r,i)=>{const e=empMap.get(r.employee_id);return <tr key={r.id} data-print-row><td>{start+i+1}</td><td className="text">{e?.employee_no?`${e.employee_no} — `:''}{e?.full_name_ar||'—'}</td><td className="num">{money(r.basic_salary)}</td><td className="num">{money(r.housing_allowance)}</td><td className="num">{money(r.transport_allowance)}</td><td className="num">{money(r.other_allowance)}</td><td className="num">{money(r.overtime_amount)}</td><td className="num">{money(r.commission_amount)}</td><td className="num">{money(r.gross_pay)}</td><td className="num">{money(r.total_deductions)}</td><td className="num">{money(r.net_pay)}</td></tr>})}</tbody>
            {isFinal&&<tfoot><tr><th colSpan="8">الإجمالي</th><th className="num">{money(totals.gross)}</th><th className="num">{money(totals.ded)}</th><th className="num">{money(totals.net)}</th></tr></tfoot>}
          </table>

          {isFinal&&<>
            <section className="print-approval-block">
              <h2 className="print-approval-title">مسار الاعتماد</h2>
              {steps.length?<div className="print-approval-list">{steps.map((s)=><div className="print-approval-step" key={s.id}><strong>الخطوة {s.step_order}: {s.target_group_label||'الجهة المختصة'}</strong><span>{STEP_STATUS[s.status]||s.status}</span>{s.decision_comment?<small>{s.decision_comment}</small>:null}</div>)}</div>:<div className="print-document-subtitle">لم تبدأ دورة الاعتماد بعد.</div>}
            </section>
            <footer className="print-document-footer">حالة الاعتماد ورقم المعاملة مأخوذان مباشرة من سجل المعاملة المركزي.</footer>
          </>}
        </div>;
      })}
    </ConstitutionPagedFrame>
  </>;
}
