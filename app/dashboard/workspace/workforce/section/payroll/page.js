'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { money } from '@/lib/format';
import { useDashboardSession } from '@/lib/dashboard-session-context';
import RawGrid, { RawGridFooter } from '@/components/ui/RawGrid';
import { ConstitutionPage, Section, Notice } from '@/components/ui/ConstitutionUI';

const n=(v)=>Number(v||0);
const isoMonth=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;};
const STATUS={draft:'مسودة',submitted:'مرسلة',hr_reviewed:'مراجعة الموارد البشرية',accountant_approved:'مراجعة مالية',ceo_approved:'معتمدة',rejected:'مرفوضة',cancelled:'ملغاة'};
const BATCH_STATUS={draft:'مسودة',submitted:'بانتظار الاعتماد',returned:'مُعادة للتعديل',approved:'معتمدة',rejected:'مرفوضة',cancelled:'ملغاة'};

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

function emptyBatchOverview(){return {batches:[],line_states:{}};}

export default function PayrollOperationalPage(){
  const me=useDashboardSession();
  const auth=useMemo(()=>{
    const admin=Boolean(me?.access?.fullAdmin);const keys=me?.capabilityKeys||new Set();
    const allowed=admin||keys.has('hr.payroll.view')||keys.has('finance.payroll.view');
    return {allowed,canEdit:admin||keys.has('hr.payroll.create')||keys.has('hr.payroll.edit'),canSubmit:admin||keys.has('hr.payroll.submit'),error:allowed?'':'هذا القسم خارج الصلاحيات الممنوحة لهذا الحساب.'};
  },[me]);

  const [runs,setRuns]=useState([]),[run,setRun]=useState(null),[lines,setLines]=useState([]),[employees,setEmployees]=useState([]);
  const [batchOverview,setBatchOverview]=useState(emptyBatchOverview),[batchFeatureReady,setBatchFeatureReady]=useState(true);
  const [selectedIds,setSelectedIds]=useState(()=>new Set());
  const [month,setMonth]=useState(isoMonth()),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const empMap=useMemo(()=>new Map(employees.map(e=>[e.id,e])),[employees]);

  const lineStates=batchOverview?.line_states||{};
  const lineState=(row)=>lineStates?.[row?.id]||null;
  const isLineLocked=(row)=>Boolean(lineState(row)?.locked)||['ceo_approved','cancelled'].includes(run?.status);
  const isLineAvailable=(row)=>!lineState(row)&&!['ceo_approved','cancelled'].includes(run?.status);

  async function readRun(runId){
    const [linesQ,batchesQ]=await Promise.all([
      supabase.from('payroll_lines').select('*').eq('run_id',runId).order('employee_id'),
      supabase.rpc('fn_payroll_batch_overview',{p_run_id:runId}),
    ]);
    if(linesQ.error)throw linesQ.error;
    setLines(linesQ.data||[]);
    if(batchesQ.error){
      const text=`${batchesQ.error?.message||''} ${batchesQ.error?.details||''}`;
      if(/fn_payroll_batch_overview|schema cache|function/i.test(text)){
        setBatchFeatureReady(false);setBatchOverview(emptyBatchOverview());
      }else throw batchesQ.error;
    }else{
      setBatchFeatureReady(true);setBatchOverview(batchesQ.data||emptyBatchOverview());
    }
    setSelectedIds(new Set());
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
    else{setLines([]);setBatchOverview(emptyBatchOverview());setSelectedIds(new Set());}
    setLoading(false);
  }

  useEffect(()=>{if(auth.allowed)load();},[auth.allowed]);

  async function selectRun(id){
    const chosen=runs.find(r=>r.id===id)||null;setRun(chosen);setLoading(true);setError('');setMessage('');setSelectedIds(new Set());
    if(!chosen){setLines([]);setBatchOverview(emptyBatchOverview());setLoading(false);return;}
    try{await readRun(id);}catch(e){setError(e?.message||'تعذر قراءة دورة الرواتب.');}
    setLoading(false);
  }

  function patchRow(id,patch){
    const current=lines.find(row=>row.id===id);
    if(!current||isLineLocked(current))return;
    setLines(prev=>prev.map(row=>row.id===id?calculated({...row,...patch}):row));
  }

  function toggleLine(row){
    if(!isLineAvailable(row)||busy)return;
    setSelectedIds(prev=>{const next=new Set(prev);if(next.has(row.id))next.delete(row.id);else next.add(row.id);return next;});
  }

  function selectAllAvailable(){
    const available=lines.filter(isLineAvailable).map(row=>row.id);
    setSelectedIds(prev=>prev.size===available.length&&available.every(id=>prev.has(id))?new Set():new Set(available));
  }

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
      setMessage(existingQ.data?`تم فتح دفتر الشهر${added?` وإضافة ${added} موظف غير موجود`:''}.`:`تم إنشاء دفتر الرواتب وإضافة ${added} موظف.`);await load(current.id);
    }catch(e){setError(e?.message||'تعذر إنشاء دورة الرواتب.');}
    setBusy(false);
  }

  async function persistDraft(){
    if(!run||['ceo_approved','cancelled'].includes(run.status))return;
    const payload=lines.filter(row=>!isLineLocked(row)).map(editablePayload);
    if(payload.length){const saveQ=await supabase.from('payroll_lines').upsert(payload,{onConflict:'id'});if(saveQ.error)throw saveQ.error;}
    const computed=lines.map(calculated);const totals=computed.reduce((a,r)=>({gross:a.gross+n(r.gross_pay),ded:a.ded+n(r.total_deductions),net:a.net+n(r.net_pay)}),{gross:0,ded:0,net:0});
    const runQ=await supabase.from('payroll_runs').update({total_gross:totals.gross,total_deductions:totals.ded,total_net:totals.net}).eq('id',run.id);if(runQ.error)throw runQ.error;
  }

  async function saveLines(){
    if(!auth.canEdit||!run||['ceo_approved','cancelled'].includes(run.status))return;setBusy(true);setError('');setMessage('');
    try{await persistDraft();setMessage('تم حفظ دفتر الرواتب.');await load(run.id);}catch(e){setError(e?.message||'تعذر حفظ الرواتب.');}
    setBusy(false);
  }

  async function submitSelected(){
    if(!auth.canSubmit||!run||!selectedIds.size||!batchFeatureReady)return;
    setBusy(true);setError('');setMessage('');
    try{
      await persistDraft();
      const ids=Array.from(selectedIds);
      const {data,error:submitError}=await supabase.rpc('fn_submit_payroll_batch',{p_run_id:run.id,p_line_ids:ids,p_note:null});
      if(submitError)throw submitError;
      setMessage(`تم رفع ${ids.length} موظف في معاملة رواتب مستقلة${data?' بنجاح':''}. بقية موظفي الشهر ما زالوا مفتوحين.`);
      await load(run.id);
    }catch(e){setError(e?.message||'تعذر إرسال الموظفين المحددين.');}
    setBusy(false);
  }

  async function resubmitBatch(batch){
    if(!auth.canSubmit||!batch?.id||!['returned','rejected'].includes(batch.status)||!batchFeatureReady)return;
    setBusy(true);setError('');setMessage('');
    try{
      await persistDraft();
      const {error:submitError}=await supabase.rpc('fn_resubmit_payroll_batch',{p_batch_id:batch.id,p_note:null});
      if(submitError)throw submitError;
      setMessage(`تم تحديث وإعادة إرسال المعاملة ${batch.batch_no}.`);await load(run.id);
    }catch(e){setError(e?.message||'تعذر إعادة إرسال معاملة الرواتب.');}
    setBusy(false);
  }

  function printPayroll(){if(run)window.open(`/print/payroll/${run.id}`,'_blank','noopener,noreferrer');}

  const availableLines=lines.filter(isLineAvailable);
  const selectedLines=lines.filter(row=>selectedIds.has(row.id)).map(calculated);
  const selectedTotals=selectedLines.reduce((a,r)=>({gross:a.gross+n(r.gross_pay),ded:a.ded+n(r.total_deductions),net:a.net+n(r.net_pay)}),{gross:0,ded:0,net:0});
  const totals=lines.map(calculated).reduce((a,r)=>({gross:a.gross+n(r.gross_pay),ded:a.ded+n(r.total_deductions),net:a.net+n(r.net_pay)}),{gross:0,ded:0,net:0});
  const batches=batchOverview?.batches||[];
  const approvedCount=lines.filter(row=>lineState(row)?.batch_status==='approved').length;
  const pendingCount=lines.filter(row=>lineState(row)?.batch_status==='submitted').length;
  const returnedCount=lines.filter(row=>['returned','rejected'].includes(lineState(row)?.batch_status)).length;
  const editableRun=auth.canEdit&&!['ceo_approved','cancelled'].includes(run?.status);

  const columns=[
    {key:'selection',label:'تحديد',type:'custom',render:(r)=>{const state=lineState(r);if(state)return <span title={state.return_note||''}>{state.batch_no} · {BATCH_STATUS[state.batch_status]||state.batch_status}</span>;return <input aria-label="تحديد الموظف للمعاملة" type="checkbox" checked={selectedIds.has(r.id)} disabled={!auth.canSubmit||busy||!isLineAvailable(r)} onChange={()=>toggleLine(r)}/>;}},
    {key:'employee',label:'الموظف',type:'custom',minWidth:190,render:r=>{const e=empMap.get(r.employee_id);return e?`${e.employee_no||''} ${e.full_name_ar}`:'—';}},
    {key:'basic_salary',label:'الأساسي',type:'number'},{key:'housing_allowance',label:'السكن',type:'number'},{key:'transport_allowance',label:'النقل',type:'number'},{key:'other_allowance',label:'بدلات أخرى',type:'number'},
    {key:'overtime_amount',label:'إضافي',type:'number'},{key:'commission_amount',label:'عمولة',type:'number'},
    {key:'absence_deduction',label:'خصم غياب',type:'number'},{key:'advance_deduction',label:'سلف',type:'number'},{key:'penalty_deduction',label:'جزاءات',type:'number'},{key:'gosi_deduction',label:'تأمينات',type:'number'},{key:'other_deduction',label:'خصم آخر',type:'number'},
    {key:'gross_pay',label:'الإجمالي',type:'custom',render:r=>money(calculated(r).gross_pay)},{key:'total_deductions',label:'إجمالي الخصم',type:'custom',render:r=>money(calculated(r).total_deductions)},{key:'net_pay',label:'الصافي',type:'custom',render:r=>money(calculated(r).net_pay)},
  ];

  if(!auth.allowed)return <ConstitutionPage><Notice tone="warning">{auth.error}</Notice></ConstitutionPage>;

  return <ConstitutionPage>
    <Section title="دفتر الرواتب" description="المسير الشهري هو دفتر العمل. الاعتماد يُرفع كمعاملة مستقلة للموظفين الذين تحددهم فقط، ويمكن رفع بقية الموظفين لاحقًا.">
      <div style={{display:'grid',gap:14}}>
        {error?<div className="msg err">{error}</div>:null}{message?<div className="msg ok">{message}</div>:null}
        {!batchFeatureReady?<Notice tone="warning">واجهة تحديد الموظفين جاهزة، لكن قاعدة البيانات لم تُفعّل بعد بعقد دفعات الرواتب؛ لذلك زر رفع المحدد سيبقى متوقفًا حتى تطبيق التحديث البنيوي.</Notice>:null}

        <div className="rowsplit">
          <input type="month" value={month} onChange={e=>setMonth(e.target.value)} disabled={!auth.canEdit||busy}/>
          <button className="btn" type="button" onClick={createOrOpenMonth} disabled={!auth.canEdit||busy||!month}>{busy?'جارٍ التنفيذ…':'إنشاء / فتح دفتر الشهر'}</button>
          <span className="spacer"/>
          {runs.length?<select value={run?.id||''} onChange={e=>selectRun(e.target.value)}>{runs.map(r=><option key={r.id} value={r.id}>{String(r.run_month).slice(0,7)} — {STATUS[r.status]||r.status}</option>)}</select>:null}
        </div>

        {run?<div className="hint">الشهر <strong>{String(run.run_month).slice(0,7)}</strong> · الموظفون <strong>{lines.length}</strong> · معتمد <strong>{approvedCount}</strong> · تحت الاعتماد <strong>{pendingCount}</strong> · معاد للتعديل <strong>{returnedCount}</strong> · متاح للرفع <strong>{availableLines.length}</strong></div>:null}

        {run&&auth.canSubmit&&availableLines.length?<div className="rowsplit">
          <button className="btn ghost" type="button" disabled={busy} onClick={selectAllAvailable}>{selectedIds.size===availableLines.length?'إلغاء تحديد الكل':'تحديد كل المتاح'}</button>
          <span>المحدد: <strong>{selectedIds.size}</strong> موظف</span>
          <span className="spacer"/>
          <strong>صافي المحدد: {money(selectedTotals.net)}</strong>
        </div>:null}

        <RawGrid
          columns={columns}
          rows={lines}
          rowKey={r=>r.id}
          savedFlag={()=>true}
          onPatchRow={patchRow}
          rowDisabled={r=>!editableRun||isLineLocked(r)}
          busy={busy}
          loading={loading}
          emptyMessage="لا توجد صفوف رواتب بعد. اختر الشهر واضغط إنشاء / فتح دفتر الشهر."
        />

        {run?<RawGridFooter actions={<div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button className="btn" type="button" disabled={busy||!editableRun} onClick={saveLines}>حفظ الدفتر</button>
          {auth.canSubmit?<button className="btn" type="button" disabled={busy||!batchFeatureReady||!selectedIds.size} onClick={submitSelected}>رفع المحدد للمالية ({selectedIds.size})</button>:null}
          <button className="btn ghost" type="button" disabled={busy} onClick={printPayroll}>طباعة / PDF</button>
        </div>} summary={<strong>إجمالي الشهر {money(totals.gross)} · الخصومات {money(totals.ded)} · الصافي {money(totals.net)}</strong>}/>:null}

        {run&&batches.length?<div style={{display:'grid',gap:8}}>
          <strong>معاملات هذا الشهر</strong>
          {batches.map(batch=><div key={batch.id} className="rowsplit" style={{paddingBlock:6,borderBottom:'1px solid var(--line,#e5e7eb)'}}>
            <strong>{batch.batch_no}</strong>
            <span>{batch.employee_count} موظف</span>
            <span>{BATCH_STATUS[batch.status]||batch.status}</span>
            <span>الصافي {money(batch.total_net)}</span>
            {batch.return_note?<span title={batch.return_note}>السبب: {batch.return_note}</span>:null}
            <span className="spacer"/>
            {auth.canSubmit&&['returned','rejected'].includes(batch.status)?<button className="btn" type="button" disabled={busy} onClick={()=>resubmitBatch(batch)}>إعادة إرسال نفس المعاملة</button>:null}
          </div>)}
        </div>:null}
      </div>
    </Section>
  </ConstitutionPage>;
}
