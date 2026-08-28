'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import RawGrid, { RawGridFooter } from '@/components/ui/RawGrid';
import { ConstitutionPage, Section, EmptyState, Notice } from '@/components/ui/ConstitutionUI';

const n=(v)=>Number(v||0);
const money=(v)=>`${n(v).toLocaleString('ar-SA',{maximumFractionDigits:2})} ر.س`;
const isoMonth=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;};
const STATUS={draft:'مسودة',submitted:'مرسلة',hr_reviewed:'مراجعة الموارد البشرية',accountant_approved:'مراجعة مالية',ceo_approved:'معتمدة',rejected:'مرفوضة',cancelled:'ملغاة'};
const EXECUTION_STATUS={pending:'بانتظار القرار',returned:'مُعادة للتعديل',approved:'اكتمل الاعتماد',rejected:'مرفوضة',cancelled:'ملغاة'};
const DESTINATION={workforce:'الموارد البشرية',finance:'المالية',projects:'المشاريع',documents:'المستندات',admin:'الإدارة'};

function calculated(row){
  const gross=n(row.basic_salary)+n(row.housing_allowance)+n(row.transport_allowance)+n(row.other_allowance)+n(row.overtime_amount)+n(row.commission_amount);
  const deductions=n(row.absence_deduction)+n(row.advance_deduction)+n(row.penalty_deduction)+n(row.gosi_deduction)+n(row.other_deduction);
  return {...row,gross_pay:gross,total_deductions:deductions,net_pay:gross-deductions};
}

function editablePayload(row){
  return {
    id:row.id,run_id:row.run_id,employee_id:row.employee_id,
    basic_salary:n(row.basic_salary),housing_allowance:n(row.housing_allowance),transport_allowance:n(row.transport_allowance),other_allowance:n(row.other_allowance),
    overtime_amount:n(row.overtime_amount),commission_amount:n(row.commission_amount),absence_days:n(row.absence_days),absence_deduction:n(row.absence_deduction),
    advance_deduction:n(row.advance_deduction),penalty_deduction:n(row.penalty_deduction),gosi_deduction:n(row.gosi_deduction),other_deduction:n(row.other_deduction),notes:row.notes||null,
  };
}

function newLine(runId,employee){
  return {
    run_id:runId,employee_id:employee.id,basic_salary:n(employee.basic_salary),housing_allowance:n(employee.housing_allowance),transport_allowance:n(employee.transport_allowance),other_allowance:n(employee.other_allowance),
    overtime_amount:0,commission_amount:0,absence_days:0,absence_deduction:0,advance_deduction:0,penalty_deduction:0,gosi_deduction:0,other_deduction:0,notes:null,
  };
}

export default function PayrollOperationalPage(){
  const [auth,setAuth]=useState({loading:true,allowed:false,canEdit:false,canSubmit:false,error:''});
  const [runs,setRuns]=useState([]),[run,setRun]=useState(null),[lines,setLines]=useState([]),[employees,setEmployees]=useState([]);
  const [guard,setGuard]=useState(null);
  const [month,setMonth]=useState(isoMonth()),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const empMap=useMemo(()=>new Map(employees.map(e=>[e.id,e])),[employees]);

  useEffect(()=>{let alive=true;(async()=>{
    const session=(await supabase.auth.getSession()).data.session;
    if(!session){if(alive)setAuth({loading:false,allowed:false,canEdit:false,canSubmit:false,error:'يلزم تسجيل الدخول.'});return;}
    const [capsQ,primaryQ,userQ]=await Promise.all([
      supabase.from('v_my_capabilities').select('capability_key'),supabase.rpc('fn_is_primary_user'),supabase.from('app_users').select('is_system_admin').eq('id',session.user.id).maybeSingle(),
    ]);
    const keys=new Set((capsQ.data||[]).map(r=>r.capability_key));
    const admin=primaryQ.data===true||Boolean(userQ.data?.is_system_admin);
    const allowed=admin||keys.has('hr.payroll.view')||keys.has('finance.payroll.view');
    const canEdit=admin||keys.has('hr.payroll.create')||keys.has('hr.payroll.edit');
    const canSubmit=admin||keys.has('hr.payroll.submit');
    if(alive)setAuth({loading:false,allowed,canEdit,canSubmit,error:allowed?'':'هذا القسم خارج الصلاحيات الممنوحة لهذا الحساب.'});
  })();return()=>{alive=false;};},[]);

  async function readRun(runId){
    const [linesQ,guardQ]=await Promise.all([
      supabase.from('payroll_lines').select('*').eq('run_id',runId).order('employee_id'),
      supabase.rpc('fn_transaction_guard_state',{p_source_table:'payroll_runs',p_source_id:runId}),
    ]);
    if(linesQ.error)throw linesQ.error;
    if(guardQ.error)throw guardQ.error;
    setLines(linesQ.data||[]);setGuard(guardQ.data||null);
  }

  async function load(preferredRunId=null){
    setLoading(true);setError('');
    const [runsQ,employeesQ]=await Promise.all([
      supabase.from('payroll_runs').select('*').order('run_month',{ascending:false}),
      supabase.from('employees').select('id,employee_no,full_name_ar,status,basic_salary,housing_allowance,transport_allowance,other_allowance').in('status',['active','on_leave']).order('full_name_ar'),
    ]);
    if(runsQ.error||employeesQ.error){setError((runsQ.error||employeesQ.error).message);setLoading(false);return;}
    const nextRuns=runsQ.data||[],nextEmployees=employeesQ.data||[];setRuns(nextRuns);setEmployees(nextEmployees);
    const chosen=nextRuns.find(r=>r.id===preferredRunId)||nextRuns.find(r=>r.id===run?.id)||nextRuns[0]||null;setRun(chosen);
    if(chosen){try{await readRun(chosen.id);}catch(e){setError(e?.message||'تعذر قراءة دورة الرواتب.');}}
    else{setLines([]);setGuard(null);}
    setLoading(false);
  }

  useEffect(()=>{if(auth.allowed)load();},[auth.allowed]);

  async function selectRun(id){
    const chosen=runs.find(r=>r.id===id)||null;setRun(chosen);setLoading(true);setError('');setMessage('');
    if(!chosen){setLines([]);setGuard(null);setLoading(false);return;}
    try{await readRun(id);}catch(e){setError(e?.message||'تعذر قراءة دورة الرواتب.');}
    setLoading(false);
  }

  function patchRow(id,patch){setLines(prev=>prev.map(row=>row.id===id?calculated({...row,...patch}):row));}

  async function ensureEmployeeLines(runId){
    const existingQ=await supabase.from('payroll_lines').select('employee_id').eq('run_id',runId);if(existingQ.error)throw existingQ.error;
    const existingIds=new Set((existingQ.data||[]).map(r=>r.employee_id));
    const missing=employees.filter(e=>!existingIds.has(e.id)).map(e=>newLine(runId,e));
    if(missing.length){const insertQ=await supabase.from('payroll_lines').insert(missing);if(insertQ.error)throw insertQ.error;}
    return missing.length;
  }

  async function createOrOpenMonth(){
    if(!auth.canEdit||!month)return;setBusy(true);setError('');setMessage('');
    try{
      const runMonth=`${month}-01`;const existingQ=await supabase.from('payroll_runs').select('*').eq('run_month',runMonth).maybeSingle();if(existingQ.error)throw existingQ.error;
      let current=existingQ.data;
      if(!current){const createQ=await supabase.from('payroll_runs').insert({run_month:runMonth,status:'draft'}).select('*').single();if(createQ.error)throw createQ.error;current=createQ.data;}
      const added=await ensureEmployeeLines(current.id);
      setMessage(existingQ.data?`تم فتح دورة الشهر${added?` وإضافة ${added} موظف غير موجود`:''}.`:`تم إنشاء مسودة الرواتب وإضافة ${added} موظف.`);await load(current.id);
    }catch(e){setError(e?.message||'تعذر إنشاء دورة الرواتب.');}
    setBusy(false);
  }

  async function persistDraft(){
    if(!run||run.status!=='draft')return;
    const payload=lines.map(editablePayload);
    if(payload.length){const saveQ=await supabase.from('payroll_lines').upsert(payload,{onConflict:'id'});if(saveQ.error)throw saveQ.error;}
    const computed=lines.map(calculated);const totals=computed.reduce((a,r)=>({gross:a.gross+n(r.gross_pay),ded:a.ded+n(r.total_deductions),net:a.net+n(r.net_pay)}),{gross:0,ded:0,net:0});
    const runQ=await supabase.from('payroll_runs').update({total_gross:totals.gross,total_deductions:totals.ded,total_net:totals.net}).eq('id',run.id);if(runQ.error)throw runQ.error;
  }

  async function saveLines(){
    if(!auth.canEdit||!run||run.status!=='draft')return;setBusy(true);setError('');setMessage('');
    try{await persistDraft();setMessage('تم حفظ دورة الرواتب. الإجمالي والصافي محسوبان تلقائيًا من قاعدة البيانات.');await load(run.id);}catch(e){setError(e?.message||'تعذر حفظ دورة الرواتب.');}
    setBusy(false);
  }

  async function submitPayroll(){
    if(!auth.canSubmit||!run||!['draft','rejected'].includes(run.status))return;
    if(!lines.length){setError('لا يمكن إرسال مسير رواتب بدون صفوف موظفين.');return;}
    setBusy(true);setError('');setMessage('');
    try{
      if(run.status==='draft')await persistDraft();
      const {error:submitError}=await supabase.rpc('fn_submit_transaction_source',{p_source_table:'payroll_runs',p_source_id:run.id,p_completion_status:'submitted'});
      if(submitError)throw submitError;
      setMessage('تم إرسال مسير الرواتب إلى مسار الاعتماد. سيظهر الآن للجهة المالية المسؤولة.');await load(run.id);
    }catch(e){setError(e?.message||'تعذر إرسال مسير الرواتب.');}
    setBusy(false);
  }

  function printPayroll(){if(run)window.open(`/print/payroll/${run.id}`,'_blank','noopener,noreferrer');}

  const columns=[
    {key:'employee',label:'الموظف',type:'custom',minWidth:190,render:r=>{const e=empMap.get(r.employee_id);return e?`${e.employee_no||''} ${e.full_name_ar}`:'—';}},
    {key:'basic_salary',label:'الأساسي',type:'number'},{key:'housing_allowance',label:'السكن',type:'number'},{key:'transport_allowance',label:'النقل',type:'number'},{key:'other_allowance',label:'بدلات أخرى',type:'number'},
    {key:'overtime_amount',label:'إضافي',type:'number'},{key:'commission_amount',label:'عمولة',type:'number'},
    {key:'absence_deduction',label:'خصم غياب',type:'number'},{key:'advance_deduction',label:'سلف',type:'number'},{key:'penalty_deduction',label:'جزاءات',type:'number'},{key:'gosi_deduction',label:'تأمينات',type:'number'},{key:'other_deduction',label:'خصم آخر',type:'number'},
    {key:'gross_pay',label:'الإجمالي',type:'custom',render:r=>money(calculated(r).gross_pay)},{key:'total_deductions',label:'إجمالي الخصم',type:'custom',render:r=>money(calculated(r).total_deductions)},{key:'net_pay',label:'الصافي',type:'custom',render:r=>money(calculated(r).net_pay)},
  ];
  const totals=lines.map(calculated).reduce((a,r)=>({gross:a.gross+n(r.gross_pay),ded:a.ded+n(r.total_deductions),net:a.net+n(r.net_pay)}),{gross:0,ded:0,net:0});
  const locked=!auth.canEdit||run?.status!=='draft';
  const routeLabel=guard?.execution_status?EXECUTION_STATUS[guard.execution_status]||guard.execution_status:(run?.status==='draft'?'لم تُرسل بعد':STATUS[run?.status]||run?.status||'—');

  if(auth.loading)return <ConstitutionPage><EmptyState title="جارٍ تجهيز الرواتب" description="نتحقق من الصلاحيات ونقرأ البيانات."/></ConstitutionPage>;
  if(!auth.allowed)return <ConstitutionPage><Notice tone="warning">{auth.error}</Notice></ConstitutionPage>;

  return <ConstitutionPage>
    <Section title="إعداد الرواتب" description="إنشاء المسير وحفظه كمسودة، ثم إرساله إلى دورة الاعتماد. الحالات النهائية محمية بواسطة حارس المعاملة ولا يمكن تجاوزها يدويًا.">
      <div style={{display:'grid',gap:14}}>
        {error?<div className="msg err">{error}</div>:null}{message?<div className="msg ok">{message}</div>:null}
        <div className="rowsplit">
          <input type="month" value={month} onChange={e=>setMonth(e.target.value)} disabled={!auth.canEdit||busy}/>
          <button className="btn" type="button" onClick={createOrOpenMonth} disabled={!auth.canEdit||busy||!month}>{busy?'جارٍ التنفيذ…':'إنشاء / فتح دورة الشهر'}</button>
          <span className="spacer"/>
          {runs.length?<select value={run?.id||''} onChange={e=>selectRun(e.target.value)}>{runs.map(r=><option key={r.id} value={r.id}>{String(r.run_month).slice(0,7)} — {STATUS[r.status]||r.status}</option>)}</select>:null}
        </div>

        {run?<div className="section"><header><h2>حالة المعاملة</h2></header><div style={{padding:14,display:'grid',gap:8}}>
          <div className="rowsplit"><span>رقم المعاملة</span><strong>{guard?.transaction_no||'يُنشأ تلقائيًا عند الالتقاط'}</strong><span className="spacer"/><span>الحالة</span><strong>{routeLabel}</strong></div>
          <div className="rowsplit"><span>المصدر</span><strong>الموارد البشرية</strong><span className="spacer"/><span>الوجهة</span><strong>{DESTINATION[guard?.target_destination_key]||guard?.target_destination_key||'—'}</strong></div>
          {guard?.configuration_error?<div className="msg err">خطأ إعداد في دورة المعاملة: {guard.configuration_error}</div>:null}
        </div></div>:null}

        {run?<div className="hint">الدورة الحالية: <strong>{String(run.run_month).slice(0,7)}</strong> · الحالة: <strong>{STATUS[run.status]||run.status}</strong> · الموظفون: <strong>{lines.length}</strong></div>:null}
        <RawGrid columns={columns} rows={lines} rowKey={r=>r.id} savedFlag={()=>true} onPatchRow={patchRow} busy={busy||locked} loading={loading} emptyMessage="لا توجد صفوف رواتب بعد. اختر الشهر واضغط إنشاء / فتح دورة الشهر."/>
        {run?<RawGridFooter actions={<div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button className="btn" type="button" disabled={busy||locked} onClick={saveLines}>حفظ المسودة</button>
          {auth.canSubmit&&['draft','rejected'].includes(run.status)?<button className="btn" type="button" disabled={busy||!lines.length} onClick={submitPayroll}>إرسال للمالية</button>:null}
          <button className="btn ghost" type="button" disabled={busy} onClick={printPayroll}>طباعة / PDF</button>
        </div>} summary={<strong>الإجمالي {money(totals.gross)} · الخصومات {money(totals.ded)} · الصافي {money(totals.net)}</strong>}/>:null}
      </div>
    </Section>
  </ConstitutionPage>;
}
