'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { laborClassLabel } from '@/lib/labor-class-summary.mjs';

const isoToday=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const STATUS=[['unrecorded','غير مسجل'],['full','حضور كامل'],['half','نصف يوم'],['absent','غياب'],['stopped','حاضر والعمل متوقف'],['leave','إجازة']];

export default function ContractorProjectTimesheet(){
  const {id}=useParams();const today=isoToday();
  const [context,setContext]=useState(null);const [date,setDate]=useState(today);const [rows,setRows]=useState([]);
  const [draft,setDraft]=useState({});const [dirty,setDirty]=useState(new Set());const [editCode,setEditCode]=useState('');
  const [editing,setEditing]=useState(null);const [adding,setAdding]=useState(false);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [error,setError]=useState('');
  const project=useMemo(()=>context?.projects?.find(row=>row.id===id),[context,id]);
  const load=useCallback(async()=>{
    setError('');
    const [dashboard,roster]=await Promise.all([supabase.rpc('fn_portal_dashboard'),supabase.rpc('fn_portal_roster',{p_project_id:id,p_work_date:date})]);
    if(dashboard.error||roster.error){setError((dashboard.error||roster.error).message);return;}
    setContext(dashboard.data);setRows(roster.data||[]);
    setDraft(Object.fromEntries((roster.data||[]).map(row=>[row.laborer_id,{status:row.attendance_status||'unrecorded',notes:row.attendance_notes||''}])));setDirty(new Set());
  },[id,date]);
  useEffect(()=>{load();},[load]);
  function change(workerId,key,value){setDraft(current=>({...current,[workerId]:{...current[workerId],[key]:value}}));setDirty(current=>new Set(current).add(workerId));}
  async function saveAttendance(){
    if(!dirty.size)return;setBusy(true);setError('');setMessage('');
    const payload=[...dirty].map(workerId=>({laborerId:workerId,status:draft[workerId].status,notes:draft[workerId].notes}));
    const {data,error:saveError}=await supabase.rpc('fn_portal_save_attendance',{p_request_id:crypto.randomUUID(),p_project_id:id,p_work_date:date,p_rows:payload,p_edit_code:editCode||null});
    if(saveError)setError(saveError.message);else{setMessage(`تم الحفظ والتحقق — إيصال رقم ${data.receiptNo} — بواسطة ${data.actorName}`);setEditCode('');await load();}
    setBusy(false);
  }
  async function saveWorker(event){
    event.preventDefault();setBusy(true);setError('');
    const form=new FormData(event.currentTarget);const args={p_laborer_id:editing.laborer_id,p_full_name:form.get('name'),p_labor_class:form.get('class'),p_trade:form.get('trade')||null,p_phone:form.get('phone')||null};
    const {error:updateError}=await supabase.rpc('fn_portal_update_laborer',args);if(updateError)setError(updateError.message);else{setEditing(null);setMessage('حُفظت بيانات العامل وسُجل اسم منفذ التعديل.');await load();}setBusy(false);
  }
  async function addWorker(event){
    event.preventDefault();setBusy(true);setError('');const form=new FormData(event.currentTarget);
    const {error:addError}=await supabase.rpc('fn_portal_add_laborer',{p_project_id:id,p_full_name:form.get('name'),p_labor_class:form.get('class'),p_trade:form.get('trade')||null,p_phone:form.get('phone')||null});
    if(addError)setError(addError.message);else{setAdding(false);setMessage('أضيف العامل إلى عمالتك وإسناد المشروع من تاريخ اليوم.');await load();}setBusy(false);
  }
  if(!context&&!error)return <div className="portal-loading">جارٍ تحميل التايم شيت…</div>;
  return <>
    <div className="portal-page-head"><div><Link href="/contractor">المشاريع</Link><h1>{project?.projectNo} — {project?.name}</h1><p>يمكنك تعديل أسماء عمالتك ومهنهم. الحضور السابق يحتاج رمزًا أو تفويضًا مباشرًا ساريًا.</p></div><button onClick={()=>setAdding(true)}>إضافة عامل</button></div>
    <section className="portal-datebar"><label>تاريخ التايم شيت<input type="date" max={today} value={date} onChange={e=>setDate(e.target.value)}/></label><div>{date===today?<b className="ok">اليوم الحالي مفتوح</b>:<><b>يوم سابق للعرض</b><span>عند الحفظ أدخل رمز التصريح، أو اتركه فارغًا إذا منحك المسؤول تفويضًا مباشرًا.</span></>}</div>{date<today&&<label>رمز التصريح<input dir="ltr" inputMode="numeric" maxLength={6} value={editCode} onChange={e=>setEditCode(e.target.value.replace(/\D/g,''))} placeholder="6 أرقام"/></label>}</section>
    {error&&<div className="portal-message error">{error}</div>}{message&&<div className="portal-message ok">{message}</div>}
    <section className="portal-section"><header><h2>عمالة المقاول</h2><span>{rows.length} فردًا</span></header>
      {rows.length?<div className="portal-roster">{rows.map((row,index)=><article key={row.laborer_id}><div className="portal-worker"><span>{index+1}</span><div><b>{row.full_name}</b><small>{row.trade||laborClassLabel(row.labor_class)}</small>{row.last_edited_by_name&&<em>عُدّل بواسطة {row.last_edited_by_name} · {new Date(row.last_edited_at).toLocaleString('ar-SA-u-ca-gregory')}</em>}</div><button onClick={()=>setEditing(row)}>بيانات العامل</button></div><div className="portal-attendance"><label>الحالة<select value={draft[row.laborer_id]?.status||'unrecorded'} onChange={e=>change(row.laborer_id,'status',e.target.value)}>{STATUS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>ملاحظة داخلية<input value={draft[row.laborer_id]?.notes||''} onChange={e=>change(row.laborer_id,'notes',e.target.value)} placeholder="اختياري"/></label></div></article>)}</div>:<div className="portal-empty">لا توجد عمالة مسندة لهذا المشروع في التاريخ المختار.</div>}
      <div className="portal-save"><span>{dirty.size} سطر تغير</span><button disabled={busy||!dirty.size} onClick={saveAttendance}>{busy?'جارٍ الحفظ…':'حفظ التايم شيت'}</button></div>
    </section>
    {(editing||adding)&&<div className="portal-modal"><form onSubmit={editing?saveWorker:addWorker}><header><h2>{editing?'تعديل بيانات العامل':'إضافة عامل'}</h2><button type="button" onClick={()=>{setEditing(null);setAdding(false)}}>×</button></header><label>الاسم الحقيقي<input name="name" required defaultValue={editing?.full_name||''}/></label><label>التصنيف<select name="class" defaultValue={editing?.labor_class||'worker'}><option value="worker">عامل</option><option value="technician">صنايعي</option><option value="foreman">فورمان</option></select></label><label>المهنة<input name="trade" defaultValue={editing?.trade||''} placeholder="نجار، حداد، سباك…"/></label><label>الجوال<input name="phone" dir="ltr" defaultValue={editing?.phone||''}/></label><footer><button disabled={busy}>حفظ</button><button type="button" onClick={()=>{setEditing(null);setAdding(false)}}>إلغاء</button></footer></form></div>}
  </>;
}
