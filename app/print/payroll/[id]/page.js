'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const n=(v)=>Number(v||0);
const money=(v)=>`${n(v).toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})} ر.س`;
const STATUS={draft:'مسودة',submitted:'مرسلة للاعتماد',hr_reviewed:'مراجعة الموارد البشرية',accountant_approved:'مراجعة مالية',ceo_approved:'معتمدة',rejected:'مرفوضة',cancelled:'ملغاة'};

export default function PayrollPrintPage(){
  const params=useParams();const id=String(params?.id||'');
  const [run,setRun]=useState(null),[lines,setLines]=useState([]),[employees,setEmployees]=useState([]),[guard,setGuard]=useState(null),[approval,setApproval]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const empMap=useMemo(()=>new Map(employees.map(e=>[e.id,e])),[employees]);

  useEffect(()=>{let alive=true;(async()=>{
    if(!id)return;
    setLoading(true);setError('');
    const [runQ,linesQ,empQ,guardQ]=await Promise.all([
      supabase.from('payroll_runs').select('*').eq('id',id).maybeSingle(),
      supabase.from('payroll_lines').select('*').eq('run_id',id).order('employee_id'),
      supabase.from('employees').select('id,employee_no,full_name_ar').order('full_name_ar'),
      supabase.rpc('fn_transaction_guard_state',{p_source_table:'payroll_runs',p_source_id:id}),
    ]);
    const firstError=runQ.error||linesQ.error||empQ.error||guardQ.error;
    if(firstError){if(alive){setError(firstError.message);setLoading(false);}return;}
    if(alive){setRun(runQ.data||null);setLines(linesQ.data||[]);setEmployees(empQ.data||[]);setGuard(guardQ.data||null);}
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
  const approved=Boolean(guard?.finalization_allowed);
  const steps=approval?.steps||[];

  return <main className="sheet" dir="rtl">
    <div className="screen-actions"><button onClick={()=>window.print()}>طباعة / حفظ PDF</button><button onClick={()=>window.close()}>إغلاق</button></div>
    <header className="head">
      <div><h1>مسير الرواتب</h1><div>أركان المكان</div></div>
      <div className={`stamp ${approved?'ok':'draft'}`}>{approved?'معتمد':'مسودة — غير معتمد'}</div>
    </header>

    <section className="meta">
      <div><span>الشهر</span><strong>{String(run.run_month).slice(0,7)}</strong></div>
      <div><span>رقم المعاملة</span><strong>{guard?.transaction_no||'—'}</strong></div>
      <div><span>الحالة</span><strong>{STATUS[run.status]||run.status}</strong></div>
      <div><span>عدد الموظفين</span><strong>{lines.length}</strong></div>
    </section>

    <table>
      <thead><tr><th>#</th><th>الموظف</th><th>الأساسي</th><th>السكن</th><th>النقل</th><th>بدلات أخرى</th><th>إضافي</th><th>عمولة</th><th>الإجمالي</th><th>الخصومات</th><th>الصافي</th></tr></thead>
      <tbody>{lines.map((r,i)=>{const e=empMap.get(r.employee_id);return <tr key={r.id}><td>{i+1}</td><td>{e?.employee_no?`${e.employee_no} — `:''}{e?.full_name_ar||'—'}</td><td>{money(r.basic_salary)}</td><td>{money(r.housing_allowance)}</td><td>{money(r.transport_allowance)}</td><td>{money(r.other_allowance)}</td><td>{money(r.overtime_amount)}</td><td>{money(r.commission_amount)}</td><td>{money(r.gross_pay)}</td><td>{money(r.total_deductions)}</td><td>{money(r.net_pay)}</td></tr>})}</tbody>
      <tfoot><tr><th colSpan="8">الإجمالي</th><th>{money(totals.gross)}</th><th>{money(totals.ded)}</th><th>{money(totals.net)}</th></tr></tfoot>
    </table>

    <section className="approval">
      <h2>مسار الاعتماد</h2>
      {steps.length?steps.map((s)=><div className="step" key={s.id}><strong>الخطوة {s.step_order}: {s.target_group_label||'الجهة المختصة'}</strong><span>{s.status}</span>{s.decision_comment?<small>{s.decision_comment}</small>:null}</div>):<div className="muted">لم تبدأ دورة الاعتماد بعد.</div>}
    </section>

    <footer>طُبع من نظام أركان المكان · حالة الاعتماد مأخوذة مباشرة من سجل المعاملة.</footer>

    <style jsx global>{`
      @page{size:A4 landscape;margin:10mm}
      html,body{background:#fff!important;color:#111!important;font-family:Arial,Tahoma,sans-serif}
      body{margin:0}
      .sheet{padding:10mm;direction:rtl}
      .screen-actions{display:flex;gap:8px;margin-bottom:12px}
      .screen-actions button{padding:8px 14px;border:1px solid #bbb;background:#fff;border-radius:6px;font-size:14px;cursor:pointer}
      .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #222;padding-bottom:10px;margin-bottom:10px}
      .head h1{margin:0 0 4px;font-size:24px}.head div{font-size:13px}
      .stamp{border:2px solid;padding:8px 14px;font-weight:700;font-size:16px}.stamp.ok{border-color:#222}.stamp.draft{border-style:dashed}
      .meta{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0 14px}.meta div{border:1px solid #ccc;padding:7px}.meta span{display:block;font-size:11px;margin-bottom:3px;color:#555}.meta strong{font-size:13px}
      table{width:100%;border-collapse:collapse;font-size:10.5px;table-layout:fixed}th,td{border:1px solid #aaa;padding:5px 4px;text-align:center;vertical-align:middle}th:nth-child(2),td:nth-child(2){text-align:right;width:18%}thead th{background:#f2f2f2}tfoot th{font-weight:700}
      .approval{margin-top:14px}.approval h2{font-size:14px;margin:0 0 7px}.step{display:grid;grid-template-columns:1fr auto;gap:5px;border-bottom:1px solid #ddd;padding:5px 0;font-size:11px}.step small{grid-column:1/-1}.muted{font-size:11px;color:#666}
      footer{margin-top:14px;border-top:1px solid #ccc;padding-top:6px;font-size:9px;text-align:center;color:#555}
      @media print{.screen-actions{display:none}.sheet{padding:0}}
    `}</style>
  </main>;
}
