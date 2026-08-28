'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import RawGrid, { RawGridFooter } from '@/components/ui/RawGrid';

const money=(v)=>`${Number(v||0).toLocaleString('ar-SA',{maximumFractionDigits:2})} ر.س`;
const isoMonth=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;};
const n=(v)=>Number(v||0);
const REASONS=[
  ['resignation','استقالة'],['mutual','اتفاق الطرفين'],['employer_unilateral','إنهاء من صاحب العمل'],
  ['employee_unilateral','إنهاء من الموظف'],['contract_expiry','انتهاء العقد'],['article_80','المادة 80'],['article_81','المادة 81'],
];
const RECOMMENDATIONS=[
  ['continue','استمرار'],['improvement','خطة تحسين'],['consider_extension','النظر في تمديد التجربة'],['do_not_continue','عدم الاستمرار'],
];

function Notice({error,message,children}){
  return <>{error?<div className="msg err">{error}</div>:null}{message?<div className="msg ok">{message}</div>:null}{children}</>;
}

function PayrollPanel(){
  const [runs,setRuns]=useState([]),[run,setRun]=useState(null),[lines,setLines]=useState([]),[employees,setEmployees]=useState([]);
  const [month,setMonth]=useState(isoMonth()),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('');
  const empMap=useMemo(()=>new Map(employees.map(e=>[e.id,e])),[employees]);

  async function load(baseRunId=null){
    setLoading(true);setError('');
    const [rQ,eQ]=await Promise.all([
      supabase.from('payroll_runs').select('*').order('run_month',{ascending:false}),
      supabase.from('employees').select('id,employee_no,full_name_ar,status,basic_salary,housing_allowance,transport_allowance,other_allowance').in('status',['active','on_leave']).order('full_name_ar'),
    ]);
    if(rQ.error||eQ.error){setError((rQ.error||eQ.error).message);setLoading(false);return;}
    const rr=rQ.data||[];const ee=eQ.data||[];setRuns(rr);setEmployees(ee);
    const chosen=rr.find(x=>x.id===(baseRunId||run?.id))||rr[0]||null;setRun(chosen);
    if(chosen){const lQ=await supabase.from('payroll_lines').select('*').eq('run_id',chosen.id).order('employee_id');if(lQ.error)setError(lQ.error.message);setLines(lQ.data||[]);}else setLines([]);
    setLoading(false);
  }
  useEffect(()=>{load();},[]);

  async function selectRun(id){setRun(runs.find(r=>r.id===id)||null);setLoading(true);const q=await supabase.from('payroll_lines').select('*').eq('run_id',id).order('employee_id');setLines(q.data||[]);if(q.error)setError(q.error.message);setLoading(false);}

  function calc(row){
    const gross=n(row.basic_salary)+n(row.housing_allowance)+n(row.transport_allowance)+n(row.other_allowance)+n(row.overtime_amount)+n(row.commission_amount);
    const deductions=n(row.absence_deduction)+n(row.advance_deduction)+n(row.penalty_deduction)+n(row.gosi_deduction)+n(row.other_deduction);
    return {...row,gross_pay:gross,total_deductions:deductions,net_pay:gross-deductions};
  }
  function patchRow(id,patch){setLines(prev=>prev.map(r=>r.id===id?calc({...r,...patch}):r));}

  async function createMonth(){
    setBusy(true);setError('');setMessage('');
    const runMonth=`${month}-01`;
    const existing=await supabase.from('payroll_runs').select('*').eq('run_month',runMonth).maybeSingle();
    if(existing.error){setError(existing.error.message);setBusy(false);return;}
    let current=existing.data;
    if(!current){const rQ=await supabase.from('payroll_runs').insert({run_month:runMonth,status:'draft'}).select('*').single();if(rQ.error){setError(rQ.error.message);setBusy(false);return;}current=rQ.data;}
    const existingLines=await supabase.from('payroll_lines').select('id').eq('run_id',current.id).limit(1);
    if(!existingLines.data?.length){
      const payload=employees.map(e=>calc({run_id:current.id,employee_id:e.id,basic_salary:n(e.basic_salary),housing_allowance:n(e.housing_allowance),transport_allowance:n(e.transport_allowance),other_allowance:n(e.other_allowance),overtime_amount:0,commission_amount:0,absence_days:0,absence_deduction:0,advance_deduction:0,penalty_deduction:0,gosi_deduction:0,other_deduction:0}));
      if(payload.length){const lQ=await supabase.from('payroll_lines').insert(payload);if(lQ.error){setError(lQ.error.message);setBusy(false);return;}}
    }
    setMessage(existing.data?'تم فتح دورة الشهر الموجودة.':'تم إنشاء مسودة الرواتب من الموظفين النشطين.');await load(current.id);setBusy(false);
  }

  async function saveLines(){
    if(!run||run.status!=='draft')return;
    setBusy(true);setError('');setMessage('');
    const payload=lines.map(r=>calc(r)).map(r=>({id:r.id,run_id:r.run_id,employee_id:r.employee_id,basic_salary:n(r.basic_salary),housing_allowance:n(r.housing_allowance),transport_allowance:n(r.transport_allowance),other_allowance:n(r.other_allowance),overtime_amount:n(r.overtime_amount),commission_amount:n(r.commission_amount),absence_days:n(r.absence_days),absence_deduction:n(r.absence_deduction),advance_deduction:n(r.advance_deduction),penalty_deduction:n(r.penalty_deduction),gosi_deduction:n(r.gosi_deduction),other_deduction:n(r.other_deduction),gross_pay:n(r.gross_pay),total_deductions:n(r.total_deductions),net_pay:n(r.net_pay),notes:r.notes||null}));
    const q=await supabase.from('payroll_lines').upsert(payload,{onConflict:'id'});if(q.error){setError(q.error.message);setBusy(false);return;}
    const gross=payload.reduce((s,r)=>s+r.gross_pay,0),ded=payload.reduce((s,r)=>s+r.total_deductions,0),net=payload.reduce((s,r)=>s+r.net_pay,0);
    const rq=await supabase.from('payroll_runs').update({total_gross:gross,total_deductions:ded,total_net:net}).eq('id',run.id);if(rq.error)setError(rq.error.message);else setMessage('تم حفظ دورة الرواتب وتحديث الإجماليات.');await load(run.id);setBusy(false);
  }

  const columns=[
    {key:'employee',label:'الموظف',type:'custom',minWidth:190,render:r=>{const e=empMap.get(r.employee_id);return e?`${e.employee_no||''} ${e.full_name_ar}`:'—';}},
    {key:'basic_salary',label:'الأساسي',type:'number'},{key:'housing_allowance',label:'السكن',type:'number'},{key:'transport_allowance',label:'النقل',type:'number'},{key:'other_allowance',label:'بدلات أخرى',type:'number'},
    {key:'overtime_amount',label:'إضافي',type:'number'},{key:'commission_amount',label:'عمولة',type:'number'},
    {key:'absence_deduction',label:'خصم غياب',type:'number'},{key:'advance_deduction',label:'سلف',type:'number'},{key:'penalty_deduction',label:'جزاءات',type:'number'},{key:'gosi_deduction',label:'تأمينات',type:'number'},{key:'other_deduction',label:'خصم آخر',type:'number'},
    {key:'gross_pay',label:'الإجمالي',type:'custom',render:r=>money(calc(r).gross_pay)},{key:'net_pay',label:'الصافي',type:'custom',render:r=>money(calc(r).net_pay)},
  ];
  const totals=lines.map(calc).reduce((a,r)=>({gross:a.gross+r.gross_pay,ded:a.ded+r.total_deductions,net:a.net+r.net_pay}),{gross:0,ded:0,net:0});
  return <div style={{display:'grid',gap:14}}>
    <Notice error={error} message={message}/>
    <div className="rowsplit"><input type="month" value={month} onChange={e=>setMonth(e.target.value)}/><button className="btn" onClick={createMonth} disabled={busy||!month}>إنشاء / فتح دورة الشهر</button><span className="spacer"/>{runs.length?<select value={run?.id||''} onChange={e=>selectRun(e.target.value)}>{runs.map(r=><option key={r.id} value={r.id}>{String(r.run_month).slice(0,7)} — {r.status}</option>)}</select>:null}</div>
    <RawGrid columns={columns} rows={lines} rowKey={r=>r.id} savedFlag={()=>true} onPatchRow={patchRow} busy={busy||run?.status!=='draft'} loading={loading} emptyMessage="لا توجد دورة رواتب بعد. اختر الشهر وأنشئ مسودة."/>
    {run?<RawGridFooter actions={<button className="btn" disabled={busy||run.status!=='draft'} onClick={saveLines}>حفظ دورة الرواتب</button>} summary={<strong>الإجمالي {money(totals.gross)} · الخصومات {money(totals.ded)} · الصافي {money(totals.net)}</strong>}/>:null}
  </div>;
}

function CompliancePanel(){
  const [employees,setEmployees]=useState([]),[docs,setDocs]=useState([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [form,setForm]=useState({employee_id:'',doc_type:'',doc_number:'',issue_date:'',expiry_date:'',alert_days_before:30,notes:''});
  const empMap=useMemo(()=>new Map(employees.map(e=>[e.id,e])),[employees]);
  async function load(){setLoading(true);const [eQ,dQ]=await Promise.all([supabase.from('employees').select('id,employee_no,full_name_ar,id_expiry,status').order('full_name_ar'),supabase.from('employee_documents').select('*').order('expiry_date',{ascending:true})]);if(eQ.error||dQ.error)setError((eQ.error||dQ.error).message);setEmployees(eQ.data||[]);setDocs(dQ.data||[]);setLoading(false);}
  useEffect(()=>{load();},[]);
  async function save(){setBusy(true);setError('');setMessage('');const q=await supabase.from('employee_documents').insert({...form,doc_number:form.doc_number||null,issue_date:form.issue_date||null,expiry_date:form.expiry_date||null,notes:form.notes||null,alert_days_before:Number(form.alert_days_before||30)});if(q.error)setError(q.error.message);else{setMessage('تمت إضافة الوثيقة.');setForm({employee_id:'',doc_type:'',doc_number:'',issue_date:'',expiry_date:'',alert_days_before:30,notes:''});await load();}setBusy(false);}
  async function remove(id){if(!confirm('حذف هذه الوثيقة؟'))return;setBusy(true);const q=await supabase.from('employee_documents').delete().eq('id',id);if(q.error)setError(q.error.message);else await load();setBusy(false);}
  const identityRows=employees.filter(e=>e.id_expiry).map(e=>({id:`identity-${e.id}`,employee_id:e.id,doc_type:'الهوية / الإقامة',doc_number:'—',expiry_date:e.id_expiry,identity:true}));
  const rows=[...docs,...identityRows].sort((a,b)=>String(a.expiry_date||'9999').localeCompare(String(b.expiry_date||'9999')));
  const columns=[{key:'employee',label:'الموظف',type:'custom',render:r=>empMap.get(r.employee_id)?.full_name_ar||'—'},{key:'doc_type',label:'الوثيقة',type:'custom',render:r=>r.doc_type},{key:'doc_number',label:'الرقم',type:'custom',render:r=>r.doc_number||'—'},{key:'expiry_date',label:'الانتهاء',type:'custom',render:r=>r.expiry_date||'—'},{key:'action',label:'إجراء',type:'action',render:r=>r.identity?<span className="hint">من ملف الموظف</span>:<button className="btn ghost" onClick={()=>remove(r.id)} disabled={busy}>حذف</button>}];
  return <div style={{display:'grid',gap:14}}><Notice error={error} message={message}/><div className="section"><header><h2>إضافة وثيقة موظف</h2></header><div style={{padding:14}} className="form-grid"><div className="field"><label>الموظف</label><select value={form.employee_id} onChange={e=>setForm({...form,employee_id:e.target.value})}><option value="">اختر</option>{employees.map(e=><option key={e.id} value={e.id}>{e.employee_no||''} {e.full_name_ar}</option>)}</select></div><div className="field"><label>نوع الوثيقة</label><input value={form.doc_type} onChange={e=>setForm({...form,doc_type:e.target.value})}/></div><div className="field"><label>الرقم</label><input value={form.doc_number} onChange={e=>setForm({...form,doc_number:e.target.value})}/></div><div className="field"><label>تاريخ الإصدار</label><input type="date" value={form.issue_date} onChange={e=>setForm({...form,issue_date:e.target.value})}/></div><div className="field"><label>الانتهاء</label><input type="date" value={form.expiry_date} onChange={e=>setForm({...form,expiry_date:e.target.value})}/></div><div className="field"><label>التنبيه قبل (يوم)</label><input type="number" value={form.alert_days_before} onChange={e=>setForm({...form,alert_days_before:e.target.value})}/></div><div className="field span2"><label>ملاحظات</label><input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></div><div className="field"><label>&nbsp;</label><button className="btn" disabled={busy||!form.employee_id||!form.doc_type} onClick={save}>حفظ الوثيقة</button></div></div></div><RawGrid columns={columns} rows={rows} rowKey={r=>r.id} savedFlag={()=>true} onPatchRow={()=>{}} busy={busy} loading={loading} emptyMessage="لا توجد وثائق أو تواريخ انتهاء."/></div>;
}

function EndServicePanel(){
  const [employees,setEmployees]=useState([]),[rows,setRows]=useState([]),[selected,setSelected]=useState(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [form,setForm]=useState({employee_id:'',last_working_day:'',reason:'resignation'});const empMap=useMemo(()=>new Map(employees.map(e=>[e.id,e])),[employees]);
  async function load(){setLoading(true);const [eQ,rQ]=await Promise.all([supabase.from('employees').select('id,employee_no,full_name_ar,hire_date,status,basic_salary,housing_allowance,transport_allowance,other_allowance').order('full_name_ar'),supabase.from('end_of_service').select('*').order('created_at',{ascending:false})]);if(eQ.error||rQ.error)setError((eQ.error||rQ.error).message);setEmployees(eQ.data||[]);setRows(rQ.data||[]);setLoading(false);}
  useEffect(()=>{load();},[]);
  async function createDraft(){setBusy(true);setError('');setMessage('');const e=empMap.get(form.employee_id);if(!e){setBusy(false);return;}const wage=n(e.basic_salary)+n(e.housing_allowance)+n(e.transport_allowance)+n(e.other_allowance);let leaveDays=0,debt=0;const [lb,dq]=await Promise.all([supabase.rpc('leave_balance_snapshot',{p_employee:e.id,p_as_of:form.last_working_day,p_exclude_request:null}),supabase.from('v_employee_debt').select('outstanding_debt').eq('employee_id',e.id).maybeSingle()]);if(!lb.error)leaveDays=n(lb.data?.[0]?.actual_balance);if(!dq.error)debt=n(dq.data?.outstanding_debt);const start=e.hire_date?new Date(e.hire_date):null,end=new Date(form.last_working_day);const years=start?Math.max(0,(end-start)/31557600000):0;const leaveAmount=leaveDays*(wage/30);const q=await supabase.from('end_of_service').insert({employee_id:e.id,last_working_day:form.last_working_day,reason:form.reason,years_of_service:years,last_wage:wage,eos_amount:0,unused_leave_days:leaveDays,unused_leave_amount:leaveAmount,notice_compensation:0,outstanding_debt:debt,other_dues:0,other_deductions:0,net_settlement:leaveAmount-debt,clearance_done:false,status:'draft'}).select('*').single();if(q.error)setError(q.error.message);else{setMessage('تم إنشاء مسودة نهاية الخدمة. راجع مبلغ المكافأة وبقية البنود قبل الاعتماد.');setSelected(q.data);await load();}setBusy(false);}
  async function saveSelected(){if(!selected)return;setBusy(true);setError('');const net=n(selected.eos_amount)+n(selected.unused_leave_amount)+n(selected.notice_compensation)+n(selected.other_dues)-n(selected.outstanding_debt)-n(selected.other_deductions);const patch={eos_amount:n(selected.eos_amount),unused_leave_days:n(selected.unused_leave_days),unused_leave_amount:n(selected.unused_leave_amount),notice_compensation:n(selected.notice_compensation),outstanding_debt:n(selected.outstanding_debt),other_dues:n(selected.other_dues),other_deductions:n(selected.other_deductions),net_settlement:net,clearance_done:Boolean(selected.clearance_done)};const q=await supabase.from('end_of_service').update(patch).eq('id',selected.id).eq('status','draft');if(q.error)setError(q.error.message);else{setMessage('تم حفظ مسودة التسوية.');setSelected({...selected,...patch});await load();}setBusy(false);}
  const columns=[{key:'employee',label:'الموظف',type:'custom',render:r=>empMap.get(r.employee_id)?.full_name_ar||'—'},{key:'last_working_day',label:'آخر يوم',type:'custom',render:r=>r.last_working_day},{key:'reason',label:'السبب',type:'custom',render:r=>REASONS.find(x=>x[0]===r.reason)?.[1]||r.reason},{key:'net_settlement',label:'الصافي',type:'custom',render:r=>money(r.net_settlement)},{key:'status',label:'الحالة',type:'custom',render:r=>r.status},{key:'action',label:'إجراء',type:'action',render:r=><button className="btn ghost" onClick={()=>setSelected(r)}>فتح</button>}];
  return <div style={{display:'grid',gap:14}}><Notice error={error} message={message}/><div className="section"><header><h2>إنشاء مسودة نهاية خدمة</h2></header><div style={{padding:14}} className="form-grid"><div className="field"><label>الموظف</label><select value={form.employee_id} onChange={e=>setForm({...form,employee_id:e.target.value})}><option value="">اختر</option>{employees.filter(e=>e.status!=='terminated').map(e=><option key={e.id} value={e.id}>{e.employee_no||''} {e.full_name_ar}</option>)}</select></div><div className="field"><label>آخر يوم عمل</label><input type="date" value={form.last_working_day} onChange={e=>setForm({...form,last_working_day:e.target.value})}/></div><div className="field"><label>سبب الانتهاء</label><select value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})}>{REASONS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div><div className="field"><label>&nbsp;</label><button className="btn" disabled={busy||!form.employee_id||!form.last_working_day} onClick={createDraft}>إنشاء المسودة</button></div></div></div>{selected?<div className="section"><header><h2>مراجعة التسوية — {empMap.get(selected.employee_id)?.full_name_ar||'—'}</h2></header><div style={{padding:14}} className="form-grid">{[['eos_amount','مكافأة نهاية الخدمة'],['unused_leave_days','أيام الإجازة'],['unused_leave_amount','بدل الإجازة'],['notice_compensation','بدل الإشعار'],['outstanding_debt','مديونية الموظف'],['other_dues','مستحقات أخرى'],['other_deductions','خصومات أخرى']].map(([k,l])=><div className="field" key={k}><label>{l}</label><input type="number" value={selected[k]??0} disabled={selected.status!=='draft'} onChange={e=>setSelected({...selected,[k]:e.target.value})}/></div>)}<div className="field"><label>المخالصة مكتملة</label><input type="checkbox" checked={Boolean(selected.clearance_done)} disabled={selected.status!=='draft'} onChange={e=>setSelected({...selected,clearance_done:e.target.checked})}/></div><div className="field"><label>&nbsp;</label><button className="btn" disabled={busy||selected.status!=='draft'} onClick={saveSelected}>حفظ التسوية</button></div></div></div>:null}<RawGrid columns={columns} rows={rows} rowKey={r=>r.id} savedFlag={()=>true} onPatchRow={()=>{}} busy={busy} loading={loading} emptyMessage="لا توجد تسويات نهاية خدمة. أنشئ مسودة من الأعلى."/></div>;
}

function PerformancePanel(){
  const [onboarding,setOnboarding]=useState([]),[reviews,setReviews]=useState([]),[candidates,setCandidates]=useState([]),[reviewerEmployeeId,setReviewerEmployeeId]=useState(null),[selected,setSelected]=useState(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [scores,setScores]=useState({performance:80,attendance:80,behavior:80,technical:80,recommendation:'continue',improvement_plan:'',notes:''});
  const candMap=useMemo(()=>new Map(candidates.map(c=>[c.id,c])),[candidates]);const onboardMap=useMemo(()=>new Map(onboarding.map(o=>[o.id,o])),[onboarding]);
  async function load(){setLoading(true);const session=(await supabase.auth.getSession()).data.session;const [oQ,rQ,cQ,uQ]=await Promise.all([supabase.from('candidate_onboarding').select('*').order('created_at',{ascending:false}),supabase.from('candidate_probation_reviews').select('*').order('scheduled_date',{ascending:false}),supabase.from('candidates').select('id,full_name_ar'),session?supabase.from('app_users').select('employee_id').eq('id',session.user.id).maybeSingle():Promise.resolve({data:null})]);if(oQ.error||rQ.error||cQ.error)setError((oQ.error||rQ.error||cQ.error).message);setOnboarding(oQ.data||[]);setReviews(rQ.data||[]);setCandidates(cQ.data||[]);setReviewerEmployeeId(uQ.data?.employee_id||null);setLoading(false);}
  useEffect(()=>{load();},[]);
  async function schedule(onboardingRow){setBusy(true);setError('');const base=onboardingRow.actual_start_date||onboardingRow.expected_start_date;if(!base){setError('سجل تاريخ المباشرة أولًا قبل إنشاء مراجعات فترة التجربة.');setBusy(false);return;}const d=new Date(base);const payload=[30,60,90].map(day=>{const x=new Date(d);x.setDate(x.getDate()+day);return {onboarding_id:onboardingRow.id,review_day:day,scheduled_date:x.toISOString().slice(0,10),status:'pending'};});const q=await supabase.from('candidate_probation_reviews').upsert(payload,{onConflict:'onboarding_id,review_day',ignoreDuplicates:true});if(q.error)setError(q.error.message);else{setMessage('تم إنشاء مواعيد مراجعة 30 / 60 / 90 يومًا.');await load();}setBusy(false);}
  async function complete(){if(!selected)return;setBusy(true);setError('');const q=await supabase.rpc('complete_probation_review',{p_review:selected.id,p_reviewer:reviewerEmployeeId,p_performance:Number(scores.performance),p_attendance:Number(scores.attendance),p_behavior:Number(scores.behavior),p_technical:Number(scores.technical),p_recommendation:scores.recommendation,p_improvement_plan:scores.improvement_plan||null,p_notes:scores.notes||null});if(q.error)setError(q.error.message);else{setMessage(`تم حفظ التقييم النهائي (${q.data}).`);setSelected(null);await load();}setBusy(false);}
  if(loading)return <div className="empty">جارٍ تحميل فترة التجربة…</div>;
  const reviewColumns=[{key:'candidate',label:'المرشح',type:'custom',render:r=>{const o=onboardMap.get(r.onboarding_id);return candMap.get(o?.candidate_id)?.full_name_ar||'—';}},{key:'review_day',label:'يوم المراجعة',type:'custom',render:r=>r.review_day},{key:'scheduled_date',label:'الموعد',type:'custom',render:r=>r.scheduled_date},{key:'overall_score',label:'النتيجة',type:'custom',render:r=>r.overall_score??'—'},{key:'status',label:'الحالة',type:'custom',render:r=>r.status},{key:'action',label:'إجراء',type:'action',render:r=>r.status==='pending'?<button className="btn ghost" onClick={()=>setSelected(r)}>تقييم</button>:<span>مكتمل</span>}];
  return <div style={{display:'grid',gap:14}}><Notice error={error} message={message}/>{!onboarding.length?<div className="msg">الأداة تعمل، لكن لا توجد حاليًا ملفات «مباشرة وتهيئة» مرتبطة بمرشحين؛ لذلك لا يوجد مصدر تنشأ منه مراجعات فترة التجربة.</div>:<div className="section"><header><h2>ملفات المباشرة</h2></header><div style={{padding:14,display:'grid',gap:8}}>{onboarding.map(o=><div className="rowsplit" key={o.id}><strong>{candMap.get(o.candidate_id)?.full_name_ar||'مرشح'}</strong><span>{o.actual_start_date||o.expected_start_date||'بدون تاريخ مباشرة'}</span><span className="spacer"/><button className="btn ghost" disabled={busy} onClick={()=>schedule(o)}>إنشاء مراجعات 30/60/90</button></div>)}</div></div>}{selected?<div className="section"><header><h2>تقييم فترة التجربة</h2></header><div style={{padding:14}} className="form-grid">{[['performance','الأداء'],['attendance','الحضور'],['behavior','السلوك'],['technical','المهارة الفنية']].map(([k,l])=><div className="field" key={k}><label>{l} / 100</label><input type="number" min="0" max="100" value={scores[k]} onChange={e=>setScores({...scores,[k]:e.target.value})}/></div>)}<div className="field"><label>التوصية</label><select value={scores.recommendation} onChange={e=>setScores({...scores,recommendation:e.target.value})}>{RECOMMENDATIONS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div><div className="field span2"><label>خطة تحسين</label><input value={scores.improvement_plan} onChange={e=>setScores({...scores,improvement_plan:e.target.value})}/></div><div className="field span2"><label>ملاحظات</label><input value={scores.notes} onChange={e=>setScores({...scores,notes:e.target.value})}/></div><div className="field"><label>&nbsp;</label><button className="btn" disabled={busy||!reviewerEmployeeId} onClick={complete}>حفظ التقييم</button></div></div></div>:null}<RawGrid columns={reviewColumns} rows={reviews} rowKey={r=>r.id} savedFlag={()=>true} onPatchRow={()=>{}} busy={busy} emptyMessage="لا توجد مراجعات مجدولة بعد."/></div>;
}

export default function WorkforceOperationalSection({dataKind}){
  if(dataKind==='hr-payroll')return <PayrollPanel/>;
  if(dataKind==='hr-compliance')return <CompliancePanel/>;
  if(dataKind==='hr-end-service')return <EndServicePanel/>;
  if(dataKind==='hr-performance')return <PerformancePanel/>;
  return null;
}
