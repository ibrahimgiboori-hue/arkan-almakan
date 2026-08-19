'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { money, dateAr } from '@/lib/format';

const VSTATUS = { draft:'مسودة', open:'مفتوح للتقديم', paused:'موقوف مؤقتاً', filled:'اكتمل العدد', closed:'مغلق' };
const ASTATUS = {
  submitted:'طلب جديد', screening:'فرز ومراجعة', interview:'مقابلة', reserve:'مرشح احتياطي',
  offer_review:'العرض تحت الاعتماد', offer_sent:'أُرسل العرض', offer_accepted:'قَبِل العرض',
  offer_declined:'اعتذر عن العرض', not_selected:'لم يقع عليه الاختيار', disqualified:'غير مستوفٍ', hired:'تم التوظيف', archived:'مؤرشف'
};

export default function RecruitmentPage(){
  const [vacancies,setVacancies]=useState([]);
  const [apps,setApps]=useState([]);
  const [tab,setTab]=useState('vacancies');
  const [showNew,setShowNew]=useState(false);
  const [form,setForm]=useState({title_ar:'',department:'',headcount:1,salary_min:'',salary_max:'',duties:''});
  const [err,setErr]=useState('');
  const [busy,setBusy]=useState(false);

  const load=useCallback(async()=>{
    const [v,a]=await Promise.all([
      supabase.from('job_vacancies').select('*').order('created_at',{ascending:false}),
      supabase.from('candidate_applications')
        .select('id,status,questionnaire_score,interview_score,final_score,has_eliminating_issue,response_due_at,applied_at,candidates(id,full_name_ar,nationality,mobile,id_expiry),job_vacancies(id,title_ar,department)')
        .order('applied_at',{ascending:false}).limit(150)
    ]);
    if(v.error||a.error) setErr(v.error?.message||a.error?.message||'تعذر تحميل بيانات التوظيف');
    setVacancies(v.data||[]); setApps(a.data||[]);
  },[]);

  useEffect(()=>{load();},[load]);

  async function createVacancy(e){
    e.preventDefault(); setBusy(true); setErr('');
    const year=new Date().getFullYear();
    const no=`VAC-${year}-${String(Date.now()).slice(-6)}`;
    const {data,error}=await supabase.from('job_vacancies').insert({
      vacancy_no:no,title_ar:form.title_ar.trim(),department:form.department.trim()||null,
      headcount:Number(form.headcount||1),salary_min:form.salary_min===''?null:Number(form.salary_min),
      salary_max:form.salary_max===''?null:Number(form.salary_max),duties:form.duties.trim()||null
    }).select('id').single();
    setBusy(false);
    if(error){setErr(error.message);return;}
    setForm({title_ar:'',department:'',headcount:1,salary_min:'',salary_max:'',duties:''});
    setShowNew(false); await load();
    if(data?.id) window.location.href=`/dashboard/recruitment/${data.id}`;
  }

  const openCount=vacancies.filter(v=>v.status==='open').length;
  const pending=apps.filter(a=>['submitted','screening','interview'].includes(a.status)).length;
  const reserves=apps.filter(a=>a.status==='reserve').length;
  const due=apps.filter(a=>a.response_due_at && !a.response_sent_at && new Date(a.response_due_at)<new Date()).length;

  return <>
    <div className="page-head">
      <div><h1>التوظيف والمرشحون</h1><p>من الشاغر إلى الفرز والمقابلة والعرض الوظيفي</p></div>
      <button className="btn" onClick={()=>setShowNew(!showNew)}>+ شاغر جديد</button>
    </div>
    {err&&<div className="msg err" style={{marginBottom:12}}>{err}</div>}

    <div className="grid k4" style={{marginBottom:16}}>
      <div className="card"><h3>الشواغر المفتوحة</h3><div className="big">{openCount}</div></div>
      <div className="card"><h3>تحت المراجعة</h3><div className="big">{pending}</div></div>
      <div className="card"><h3>مرشحون احتياطيون</h3><div className="big">{reserves}</div></div>
      <div className="card"><h3>ردود تجاوزت 72 ساعة</h3><div className="big">{due}</div><div className="foot">تحتاج متابعة الموارد البشرية</div></div>
    </div>

    {showNew&&<form className="section" style={{padding:18,marginTop:0,marginBottom:16}} onSubmit={createVacancy}>
      <header style={{margin:'-18px -18px 16px'}}><h2>إنشاء شاغر وظيفي</h2></header>
      <div className="form-grid">
        <div className="field span2"><label>المسمى الوظيفي *</label><input required value={form.title_ar} onChange={e=>setForm({...form,title_ar:e.target.value})}/></div>
        <div className="field"><label>الإدارة / القسم</label><input value={form.department} onChange={e=>setForm({...form,department:e.target.value})}/></div>
        <div className="field"><label>العدد المطلوب</label><input type="number" min="1" value={form.headcount} onChange={e=>setForm({...form,headcount:e.target.value})}/></div>
        <div className="field"><label>الراتب من</label><input type="number" min="0" value={form.salary_min} onChange={e=>setForm({...form,salary_min:e.target.value})}/></div>
        <div className="field"><label>الراتب إلى</label><input type="number" min="0" value={form.salary_max} onChange={e=>setForm({...form,salary_max:e.target.value})}/></div>
        <div className="field span3"><label>المهام الأساسية</label><textarea rows="3" value={form.duties} onChange={e=>setForm({...form,duties:e.target.value})}/></div>
      </div>
      <div className="rowsplit" style={{marginTop:12}}><button className="btn" disabled={busy}>{busy?'جارٍ الحفظ…':'إنشاء ومتابعة الشروط'}</button><button type="button" className="btn ghost" onClick={()=>setShowNew(false)}>إلغاء</button></div>
    </form>}

    <div className="tabs">
      <button className={tab==='vacancies'?'on':''} onClick={()=>setTab('vacancies')}>الشواغر</button>
      <button className={tab==='applications'?'on':''} onClick={()=>setTab('applications')}>طلبات المرشحين</button>
      <button className={tab==='talent'?'on':''} onClick={()=>setTab('talent')}>بنك المواهب</button>
    </div>

    {tab==='vacancies'&&<div className="section" style={{marginTop:0,overflowX:'auto'}}>
      <table><thead><tr><th>رقم الشاغر</th><th>المسمى</th><th>الإدارة</th><th className="num">العدد</th><th>نطاق الراتب</th><th>الحالة</th><th>—</th></tr></thead>
      <tbody>{vacancies.map(v=><tr key={v.id}>
        <td className="mono">{v.vacancy_no||'—'}</td><td style={{fontWeight:600}}>{v.title_ar}</td><td>{v.department||'—'}</td><td className="num">{v.headcount}</td>
        <td className="mono">{v.salary_min!=null||v.salary_max!=null?`${v.salary_min!=null?money(v.salary_min):'—'} - ${v.salary_max!=null?money(v.salary_max):'—'}`:'يحدد لاحقاً'}</td>
        <td>{VSTATUS[v.status]||v.status}</td><td><Link className="btn ghost" style={{padding:'4px 10px',fontSize:12}} href={`/dashboard/recruitment/${v.id}`}>فتح</Link></td>
      </tr>)}{!vacancies.length&&<tr><td colSpan="7"><div className="empty">لا توجد شواغر حتى الآن.</div></td></tr>}</tbody></table>
    </div>}

    {tab==='applications'&&<div className="section" style={{marginTop:0,overflowX:'auto'}}>
      <table><thead><tr><th>المرشح</th><th>الشاغر</th><th>الجنسية</th><th>انتهاء الهوية/الإقامة</th><th className="num">الاستبيان</th><th className="num">المقابلة</th><th className="num">النهائي</th><th>الحالة</th></tr></thead>
      <tbody>{apps.map(a=><tr key={a.id}>
        <td><Link href={`/dashboard/recruitment/applications/${a.id}`} style={{fontWeight:600,color:'var(--maroon-dark)'}}>{a.candidates?.full_name_ar||'—'}</Link>{a.has_eliminating_issue&&<div style={{fontSize:11.5,color:'var(--warn)'}}>شرط أساسي يحتاج مراجعة</div>}</td>
        <td>{a.job_vacancies?.title_ar||'—'}</td><td>{a.candidates?.nationality||'—'}</td><td className="mono">{dateAr(a.candidates?.id_expiry)}</td>
        <td className="num">{a.questionnaire_score??'—'}</td><td className="num">{a.interview_score??'—'}</td><td className="num" style={{fontWeight:700}}>{a.final_score??'—'}</td><td>{ASTATUS[a.status]||a.status}</td>
      </tr>)}{!apps.length&&<tr><td colSpan="8"><div className="empty">لم تصل طلبات ترشيح بعد.</div></td></tr>}</tbody></table>
    </div>}

    {tab==='talent'&&<div className="section" style={{marginTop:0,padding:18}}>
      <div className="empty"><h3>بنك المواهب</h3><p>سيعرض المرشحين الممتازين المحتفظ بهم لمدة لا تتجاوز 90 يوماً، ثم يُنقلون تلقائياً إلى الأرشيف المقيد.</p></div>
    </div>}
  </>;
}
