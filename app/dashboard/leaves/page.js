'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { dateAr } from '@/lib/format';
import { STATUS_AR, STATUS_CLASS, LEAVE_AR, nextStage, STAGE_AR } from '@/lib/requests';
import { inclusiveDays, leaveBalanceState } from '@/lib/system-constitution';
import {
  ConstitutionPage, PageHeader, Section, EntrySurface, SummaryStrip,
  Notice, Toolbar, TableFrame, EmptyState,
} from '@/components/ui/ConstitutionUI';
import ManualDecisionForm from '@/components/ManualDecisionForm';

const KINDS=['annual','sick','unpaid','permission','emergency','hajj','maternity'];
const EMPTY={employee_id:'',leave_kind:'annual',start_date:'',end_date:'',reason:''};
const HISTORY_EMPTY={employee_id:'',leave_kind:'annual',start_date:'',end_date:'',reason:'',paper_reference:'',paper_document_date:'',paper_approver_text:'',actual_return_date:''};

export default function Leaves(){
  const [rows,setRows]=useState(null); const [bal,setBal]=useState([]); const [emps,setEmps]=useState([]);
  const [form,setForm]=useState({...EMPTY}); const [history,setHistory]=useState({...HISTORY_EMPTY});
  const [editId,setEditId]=useState(null); const [open,setOpen]=useState(false); const [historyOpen,setHistoryOpen]=useState(false);
  const [decisionTarget,setDecisionTarget]=useState(null); const [decisionBusy,setDecisionBusy]=useState(false);
  const [err,setErr]=useState(''); const [msg,setMsg]=useState('');

  async function load(){
    setErr('');
    const [r,b,e]=await Promise.all([
      supabase.from('leave_requests').select('*, employees:employees!leave_requests_employee_id_fkey(full_name_ar, employee_no, hire_date, annual_leave_days, job_title, department)').order('start_date',{ascending:false}).order('created_at',{ascending:false}),
      supabase.from('v_leave_balance_live').select('*').order('employee_no'),
      supabase.from('employees').select('id, employee_no, full_name_ar, person_kind, board_role, job_title, department, hire_date, annual_leave_days').in('status',['active','on_leave']).order('employee_no'),
    ]);
    const firstError=r.error||b.error||e.error;
    if(firstError){console.error('Leaves load failed',firstError);setErr('تعذر تحميل بيانات الإجازات حاليًا. يرجى تحديث الصفحة والمحاولة مرة أخرى.');}
    setRows(r.data||[]);setBal(b.data||[]);setEmps(e.data||[]);
  }
  useEffect(()=>{load();},[]);

  const days=inclusiveDays(form.start_date,form.end_date);
  const historicalDays=inclusiveDays(history.start_date,history.end_date);
  const balOf=(id)=>bal.find((b)=>b.employee_id===id);
  const canEdit=(r)=>r.record_source!=='historical_paper'&&['draft','submitted'].includes(r.status);
  const canCancel=(r)=>r.record_source!=='historical_paper'&&!['cancelled','rejected'].includes(r.status);
  const decisionStage=decisionTarget?nextStage('leave',decisionTarget.status):null;

  function closeForms(){setOpen(false);setHistoryOpen(false);setEditId(null);setDecisionTarget(null);}
  function startEdit(r){setDecisionTarget(null);setHistoryOpen(false);setEditId(r.id);setForm({employee_id:r.employee_id,leave_kind:r.leave_kind,start_date:r.start_date,end_date:r.end_date,reason:r.reason||''});setOpen(true);setErr('');setMsg('');}
  function startNew(){setDecisionTarget(null);setHistoryOpen(false);setEditId(null);setForm({...EMPTY});setOpen(true);setErr('');setMsg('');}
  function startHistory(){setDecisionTarget(null);setOpen(false);setEditId(null);setHistory({...HISTORY_EMPTY});setHistoryOpen(true);setErr('');setMsg('');}
  function startDecision(r){setOpen(false);setHistoryOpen(false);setEditId(null);setDecisionTarget(r);setErr('');setMsg('');}

  async function submit(e){e.preventDefault();setErr('');setMsg('');if(days<=0){setErr('فترة الإجازة غير صحيحة.');return;}const payload={...form,is_paid:form.leave_kind!=='unpaid',record_source:'current'};const res=editId?await supabase.from('leave_requests').update(payload).eq('id',editId):await supabase.from('leave_requests').insert({...payload,status:'submitted'});if(res.error){setErr('تعذر الحفظ: '+res.error.message);return;}setMsg(editId?'حفظت التعديلات':'تم تسجيل طلب الإجازة');setForm({...EMPTY});setEditId(null);setOpen(false);load();}
  async function submitHistorical(e){e.preventDefault();setErr('');setMsg('');if(historicalDays<=0){setErr('فترة الإجازة التاريخية غير صحيحة.');return;}const {error}=await supabase.rpc('record_historical_leave',{p_employee_id:history.employee_id,p_leave_kind:history.leave_kind,p_start_date:history.start_date,p_end_date:history.end_date,p_reason:history.reason||null,p_reference:history.paper_reference||null,p_document_date:history.paper_document_date||null,p_approver_text:history.paper_approver_text||null,p_actual_return_date:history.actual_return_date||null});if(error){setErr('تعذر تسجيل الحركة التاريخية: '+error.message);return;}setMsg('تم تسجيل الإجازة القديمة كحركة تاريخية منتهية');setHistory({...HISTORY_EMPTY});setHistoryOpen(false);load();}
  async function submitDecision({actorEmployeeId,decision,decisionDate,comment}){if(!decisionTarget)return;setDecisionBusy(true);setErr('');setMsg('');const {error}=await supabase.rpc('record_leave_manual_decision',{p_id:decisionTarget.id,p_actor_employee_id:actorEmployeeId,p_decision:decision,p_decision_date:decisionDate,p_comment:comment,p_evidence_path:null});setDecisionBusy(false);if(error){setErr(error.message);return;}setMsg(decision==='rejected'?'تم تسجيل رفض الطلب':'تم تسجيل القرار واعتماد المرحلة');setDecisionTarget(null);load();}
  async function cancel(r){const reason=window.prompt(`سبب إلغاء إجازة ${r.employees?.full_name_ar||''}:`);if(reason===null)return;setErr('');setMsg('');const {error}=await supabase.rpc('cancel_leave',{p_id:r.id,p_reason:reason});if(error){setErr(error.message);return;}setMsg('تم إلغاء الطلب');load();}
  async function remove(r){if(!window.confirm('حذف هذا السجل نهائياً؟'))return;setErr('');setMsg('');const {error}=await supabase.from('leave_requests').delete().eq('id',r.id);if(error){setErr('تعذر الحذف: '+error.message);return;}setMsg('تم حذف السجل');load();}

  if(!rows)return <ConstitutionPage><EmptyState title="جارٍ تحميل الإجازات" description="يتم تحميل الأرصدة والحركات الحالية."/></ConstitutionPage>;

  const currentRequests=rows.filter((r)=>r.record_source!=='historical_paper'&&!['cancelled','rejected'].includes(r.status)).length;
  const historicalCount=rows.filter((r)=>r.record_source==='historical_paper').length;
  const warningBalances=bal.filter((b)=>leaveBalanceState(b.available_balance)!=='ok').length;

  return <ConstitutionPage>
    <PageHeader eyebrow="LEAVE" title="الإجازات" description="الأرصدة والطلبات والحركات التاريخية في سجل واحد." actions={<Toolbar><button className="btn ghost" onClick={startHistory}>+ حركة تاريخية</button><button className="btn" onClick={startNew}>+ طلب إجازة</button></Toolbar>}/>

    <Section title="ملخص الإجازات">
      <SummaryStrip items={[
        {key:'balances',value:bal.length,label:'موظفون لهم رصيد'},
        {key:'active',value:currentRequests,label:'طلبات وحركات حالية'},
        {key:'warning',value:warningBalances,label:'أرصدة تحتاج انتباه'},
        {key:'history',value:historicalCount,label:'حركات تاريخية'},
      ]}/>
    </Section>

    <Notice>يحتسب الرصيد من تاريخ المباشرة وفق الاستحقاق السنوي. الملفات الورقية القديمة تسجل كحركات تاريخية ولا تمر بمسار اعتماد جديد.</Notice>
    {err&&<Notice tone="error">{err}</Notice>}{msg&&<Notice tone="success">{msg}</Notice>}

    {decisionTarget&&decisionStage&&<ManualDecisionForm requestLabel={`إجازة ${decisionTarget.employees?.full_name_ar||''}`} stageLabel={STAGE_AR[decisionStage]} employees={emps} busy={decisionBusy} onSubmit={submitDecision} onClose={()=>setDecisionTarget(null)}/>} 

    {historyOpen&&<EntrySurface title="إضافة حركة إجازة تاريخية" description="واقعة مكتملة تنعكس على الرصيد دون مسار اعتماد جديد.">
      <form onSubmit={submitHistorical} style={{padding:22}}><div className="form-grid">
        <div className="field span2"><label>الموظف *</label><select required value={history.employee_id} onChange={(e)=>setHistory({...history,employee_id:e.target.value})}><option value="">اختر الموظف</option>{emps.map((x)=><option key={x.id} value={x.id}>{x.employee_no} - {x.full_name_ar}</option>)}</select></div>
        <div className="field"><label>نوع الإجازة *</label><select value={history.leave_kind} onChange={(e)=>setHistory({...history,leave_kind:e.target.value})}>{KINDS.map((k)=><option key={k} value={k}>{LEAVE_AR[k]}</option>)}</select></div>
        <div className="field"><label>من *</label><input type="date" required dir="ltr" value={history.start_date} onChange={(e)=>setHistory({...history,start_date:e.target.value})}/></div>
        <div className="field"><label>إلى *</label><input type="date" required dir="ltr" value={history.end_date} onChange={(e)=>setHistory({...history,end_date:e.target.value})}/></div>
        <div className="field"><label>عدد الأيام</label><input readOnly dir="ltr" value={historicalDays||''}/></div>
        <div className="field"><label>تاريخ المباشرة بعد الإجازة</label><input type="date" dir="ltr" value={history.actual_return_date} onChange={(e)=>setHistory({...history,actual_return_date:e.target.value})}/></div>
        <div className="field"><label>رقم أو مرجع الورقة</label><input value={history.paper_reference} onChange={(e)=>setHistory({...history,paper_reference:e.target.value})}/></div>
        <div className="field"><label>تاريخ المستند</label><input type="date" dir="ltr" value={history.paper_document_date} onChange={(e)=>setHistory({...history,paper_document_date:e.target.value})}/></div>
        <div className="field span2"><label>المعتمد كما هو مكتوب في الورقة</label><input value={history.paper_approver_text} onChange={(e)=>setHistory({...history,paper_approver_text:e.target.value})}/></div>
        <div className="field span2"><label>السبب أو الملاحظات</label><textarea rows="3" value={history.reason} onChange={(e)=>setHistory({...history,reason:e.target.value})}/></div>
      </div><Toolbar><button className="btn" type="submit">حفظ الحركة</button><button className="btn ghost" type="button" onClick={closeForms}>إلغاء</button></Toolbar></form>
    </EntrySurface>}

    {open&&<EntrySurface title={editId?'تعديل طلب إجازة':'طلب إجازة'} description="أدخل بيانات الطلب فقط؛ بقية السجل يبقى خارج مسرح الإدخال.">
      <form onSubmit={submit} style={{padding:22}}><div className="form-grid">
        <div className="field span2"><label>الموظف *</label><select required value={form.employee_id} onChange={(e)=>setForm({...form,employee_id:e.target.value})}><option value="">اختر الموظف</option>{emps.map((x)=><option key={x.id} value={x.id}>{x.employee_no} - {x.full_name_ar}</option>)}</select>{form.employee_id&&balOf(form.employee_id)&&<span className="hint">المستحق: {balOf(form.employee_id).accrued_days} يوم · المستهلك: {balOf(form.employee_id).used_days} · المتاح: {balOf(form.employee_id).available_balance}</span>}</div>
        <div className="field"><label>نوع الإجازة *</label><select value={form.leave_kind} onChange={(e)=>setForm({...form,leave_kind:e.target.value})}>{KINDS.map((k)=><option key={k} value={k}>{LEAVE_AR[k]}</option>)}</select></div>
        <div className="field"><label>عدد الأيام</label><input value={days||''} readOnly dir="ltr"/></div>
        <div className="field"><label>من *</label><input type="date" required dir="ltr" value={form.start_date} onChange={(e)=>setForm({...form,start_date:e.target.value})}/></div>
        <div className="field"><label>إلى *</label><input type="date" required dir="ltr" value={form.end_date} onChange={(e)=>setForm({...form,end_date:e.target.value})}/></div>
        <div className="field span2"><label>السبب</label><textarea rows="3" value={form.reason} onChange={(e)=>setForm({...form,reason:e.target.value})}/></div>
      </div><Toolbar><button className="btn" type="submit">{editId?'حفظ التعديلات':'تسجيل الطلب'}</button><button className="btn ghost" type="button" onClick={closeForms}>إلغاء</button></Toolbar></form>
    </EntrySurface>}

    <Section title="أرصدة الإجازة السنوية" description={`${bal.length} موظف`}>
      {bal.length===0?<EmptyState title="لا توجد أرصدة" description="يلزم تسجيل تاريخ المباشرة والاستحقاق السنوي للموظف."/>:<TableFrame><table><thead><tr><th>الموظف</th><th className="num">السنوي</th><th className="num">الرصيد الكلي</th><th className="num">المستهلك</th><th className="num">محجوز</th><th className="num">الرصيد الفعلي</th><th className="num">المتاح</th></tr></thead><tbody>{bal.map((b)=>{const state=leaveBalanceState(b.available_balance);return <tr key={b.employee_id}><td><strong>{b.employee_no} - {b.full_name_ar}</strong></td><td className="num">{Number(b.annual_leave_days)}</td><td className="num">{b.accrued_days}</td><td className="num">{b.used_days}</td><td className="num">{b.reserved_days}</td><td className="num"><span className={`pill ${Number(b.actual_balance)<0?'bad':'ok'}`}>{b.actual_balance}</span></td><td className="num"><span className={`pill ${state==='blocked'?'bad':state==='warning'?'warn':'ok'}`}>{b.available_balance}</span></td></tr>;})}</tbody></table></TableFrame>}
    </Section>

    <Section title="حركات وطلبات الإجازة" description={`${rows.length} حركة مسجلة`}>
      {rows.length===0?<EmptyState title="لا توجد حركات" description="سجل طلباً جديداً أو أدخل حركة تاريخية."/>:<TableFrame><table><thead><tr><th>الموظف</th><th>المصدر</th><th>النوع</th><th>من</th><th>إلى</th><th className="num">الأيام</th><th>الحالة</th><th>المرحلة التالية</th><th>الإجراءات</th></tr></thead><tbody>{rows.map((r)=>{const stage=r.record_source==='historical_paper'?null:nextStage('leave',r.status);return <tr key={r.id}><td><strong>{r.employees?.full_name_ar||'غير محدد'}</strong></td><td>{r.record_source==='historical_paper'?'ملف ورقي قديم':'طلب حالي'}</td><td>{LEAVE_AR[r.leave_kind]}</td><td className="mono">{dateAr(r.start_date)}</td><td className="mono">{dateAr(r.end_date)}</td><td className="num">{r.days_count}</td><td><span className={`pill ${STATUS_CLASS[r.status]}`}>{r.record_source==='historical_paper'?'منفذة تاريخياً':STATUS_AR[r.status]}</span></td><td>{stage?STAGE_AR[stage]:'مكتملة'}</td><td><Toolbar><Link className="btn ghost" href={`/print/leave/${r.id}`} target="_blank">طباعة</Link>{stage&&!['cancelled','rejected'].includes(r.status)&&<button className="btn" onClick={()=>startDecision(r)}>تسجيل القرار</button>}{canEdit(r)&&<button className="btn ghost" onClick={()=>startEdit(r)}>تعديل</button>}{canCancel(r)&&<button className="btn ghost" onClick={()=>cancel(r)}>إلغاء</button>}{(canEdit(r)||r.record_source==='historical_paper')&&<button className="btn ghost" onClick={()=>remove(r)}>حذف</button>}</Toolbar></td></tr>;})}</tbody></table></TableFrame>}
    </Section>
  </ConstitutionPage>;
}
