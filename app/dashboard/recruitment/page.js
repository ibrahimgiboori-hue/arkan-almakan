'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { money, dateAr } from '@/lib/format';
import { CONSTRUCTION_JOB_CATALOG, CONSTRUCTION_JOB_GROUPS, getJobProfile, buildDefaultQuestions } from '@/lib/recruitment-catalog';

const VSTATUS = { draft:'مسودة', open:'مفتوح للتقديم', paused:'موقوف مؤقتاً', filled:'اكتمل العدد', closed:'مغلق' };
const ASTATUS = { submitted:'طلب جديد', screening:'فرز ومراجعة', interview:'مقابلة', reserve:'مرشح احتياطي', offer_review:'العرض تحت الاعتماد', offer_sent:'أُرسل العرض', offer_accepted:'قَبِل العرض', offer_declined:'اعتذر عن العرض', not_selected:'لم يقع عليه الاختيار', disqualified:'غير مستوفٍ', hired:'تم التوظيف', archived:'مؤرشف' };
const EMPTY={profileKey:'',title_ar:'',department:'',headcount:1,salary_min:'',salary_max:'',duties:''};

export default function RecruitmentPage(){
  const [vacancies,setVacancies]=useState([]); const [apps,setApps]=useState([]); const [tab,setTab]=useState('vacancies'); const [showNew,setShowNew]=useState(false);
  const [form,setForm]=useState(EMPTY); const [err,setErr]=useState(''); const [busy,setBusy]=useState(false);
  const profile=getJobProfile(form.profileKey);

  const load=useCallback(async()=>{
    const [v,a]=await Promise.all([
      supabase.from('job_vacancies').select('*').order('created_at',{ascending:false}),
      supabase.from('candidate_applications').select('id,status,questionnaire_score,interview_score,final_score,has_eliminating_issue,response_due_at,response_sent_at,applied_at,candidates(id,full_name_ar,nationality,mobile,id_expiry),job_vacancies(id,title_ar,department)').order('applied_at',{ascending:false}).limit(150)
    ]);
    if(v.error||a.error) setErr(v.error?.message||a.error?.message||'تعذر تحميل بيانات التوظيف');
    setVacancies(v.data||[]); setApps(a.data||[]);
  },[]);
  useEffect(()=>{load();},[load]);

  function chooseProfile(key){
    const p=getJobProfile(key); if(!p){setForm({...form,profileKey:''});return;}
    setForm({...form,profileKey:key,title_ar:p.title,department:p.department,duties:p.duties});
  }

  async function createVacancy(e){
    e.preventDefault(); setBusy(true); setErr('');
    const p=getJobProfile(form.profileKey); const year=new Date().getFullYear(); const no=`VAC-${year}-${String(Date.now()).slice(-6)}`;
    const {data,error}=await supabase.from('job_vacancies').insert({
      vacancy_no:no,title_ar:form.title_ar.trim(),department:form.department.trim()||null,headcount:Number(form.headcount||1),
      salary_min:form.salary_min===''?null:Number(form.salary_min),salary_max:form.salary_max===''?null:Number(form.salary_max),salary_visible:false,duties:form.duties.trim()||null,
      occupation_profile_key:p?.key||null,occupation_family:p?.family||null,occupation_level:p?.levelLabel||null,saudi_group_code:p?.saudiGroupCode||null,saudi_group_name:p?.saudiGroupName||null
    }).select('id').single();
    if(error){setBusy(false);setErr(error.message);return;}
    if(p){
      const questions=buildDefaultQuestions(p).map((x,i)=>({vacancy_id:data.id,label:x.label,question_text:x.question_text,answer_type:x.answer_type,options:x.options||[],criterion_type:x.criterion_type||'normal',expected_value:x.expected_value||null,weight:Number(x.weight||0),score_map:x.score_map||{},is_license:!!x.is_license,license_type:x.license_type||null,sort_order:i+1}));
      const {error:qErr}=await supabase.from('vacancy_requirements').insert(questions);
      if(qErr){setBusy(false);setErr(`تم إنشاء الشاغر، لكن تعذر إنشاء الأسئلة التلقائية: ${qErr.message}`);await load();return;}
    }
    setBusy(false); setForm(EMPTY); setShowNew(false); await load(); if(data?.id) window.location.href=`/dashboard/recruitment/${data.id}`;
  }

  const openCount=vacancies.filter(v=>v.status==='open').length;
  const pending=apps.filter(a=>['submitted','screening','interview'].includes(a.status)).length;
  const reserves=apps.filter(a=>a.status==='reserve').length;
  const due=apps.filter(a=>a.response_due_at&&!a.response_sent_at&&new Date(a.response_due_at)<new Date()).length;

  return <>
    <div className="page-head"><div><h1>التوظيف والمرشحون</h1><p>من الشاغر إلى الفرز والمقابلة والعرض الوظيفي</p></div><button className="btn" onClick={()=>setShowNew(!showNew)}>+ شاغر جديد</button></div>
    {err&&<div className="msg err" style={{marginBottom:12}}>{err}</div>}
    <div className="grid k4" style={{marginBottom:16}}><div className="card"><h3>الشواغر المفتوحة</h3><div className="big">{openCount}</div></div><div className="card"><h3>تحت المراجعة</h3><div className="big">{pending}</div></div><div className="card"><h3>مرشحون احتياطيون</h3><div className="big">{reserves}</div></div><div className="card"><h3>ردود متأخرة</h3><div className="big">{due}</div><div className="foot">مهلة الرد تبدأ بعد قرار عدم الاستمرار</div></div></div>

    {showNew&&<form className="section" style={{padding:18,marginTop:0,marginBottom:16}} onSubmit={createVacancy}>
      <header style={{margin:'-18px -18px 16px'}}><h2>إنشاء شاغر وظيفي</h2></header>
      <div className="msg" style={{marginBottom:14,borderColor:'var(--hair)',background:'#fafafa'}}>اختر مسمى جاهزًا ليقترح النظام الإدارة والمهام والأسئلة والأوزان. يمكنك تعديلها بعد الإنشاء.</div>
      <div className="form-grid">
        <div className="field span3"><label>المسمى الجاهز من دليل المقاولات</label><select value={form.profileKey} onChange={e=>chooseProfile(e.target.value)}><option value="">— مسمى مخصص / اختر لاحقًا —</option>{CONSTRUCTION_JOB_GROUPS.map(g=><optgroup key={g} label={g}>{CONSTRUCTION_JOB_CATALOG.filter(x=>x.department===g).map(x=><option key={x.key} value={x.key}>{x.title}</option>)}</optgroup>)}</select><span className="hint">المكتبة مبنية على مجموعات ومسارات قطاع التشييد والتصنيف السعودي للمهن.</span></div>
        <div className="field span2"><label>المسمى الوظيفي *</label><input required value={form.title_ar} onChange={e=>setForm({...form,title_ar:e.target.value})}/></div>
        <div className="field"><label>الإدارة / القسم</label><input value={form.department} onChange={e=>setForm({...form,department:e.target.value})}/></div>
        {profile&&<div className="field span3"><label>التصنيف المقترح</label><div className="msg" style={{borderColor:'var(--hair)',background:'#fff'}}>{profile.levelLabel} · {profile.saudiGroupCode} — {profile.saudiGroupName}</div></div>}
        <div className="field"><label>العدد المطلوب</label><input type="number" min="1" value={form.headcount} onChange={e=>setForm({...form,headcount:e.target.value})}/></div>
        <div className="field"><label>راتب المنشأة من — داخلي</label><input type="number" min="0" value={form.salary_min} onChange={e=>setForm({...form,salary_min:e.target.value})}/></div>
        <div className="field"><label>راتب المنشأة إلى — داخلي</label><input type="number" min="0" value={form.salary_max} onChange={e=>setForm({...form,salary_max:e.target.value})}/><span className="hint">لا يظهر هذا النطاق للمرشح.</span></div>
        <div className="field span3"><label>المهام الأساسية</label><textarea rows="5" value={form.duties} onChange={e=>setForm({...form,duties:e.target.value})}/></div>
      </div>
      {profile&&<div className="msg ok" style={{marginTop:8}}>سيُنشئ النظام 5 أسئلة وظيفية مختصرة موزونة تلقائيًا. يمكن تعديلها بالكامل من بطاقة الشاغر قبل فتحه.</div>}
      <div className="rowsplit" style={{marginTop:12}}><button className="btn" disabled={busy}>{busy?'جارٍ الحفظ…':'إنشاء ومراجعة الشاغر'}</button><button type="button" className="btn ghost" onClick={()=>setShowNew(false)}>إلغاء</button></div>
    </form>}

    <div className="tabs"><button className={tab==='vacancies'?'on':''} onClick={()=>setTab('vacancies')}>الشواغر</button><button className={tab==='applications'?'on':''} onClick={()=>setTab('applications')}>طلبات المرشحين</button><button className={tab==='talent'?'on':''} onClick={()=>setTab('talent')}>بنك المواهب</button></div>
    {tab==='vacancies'&&<div className="section" style={{marginTop:0,overflowX:'auto'}}><table><thead><tr><th>رقم الشاغر</th><th>المسمى</th><th>الإدارة</th><th className="num">العدد</th><th>نطاق الراتب الداخلي</th><th>الحالة</th><th>—</th></tr></thead><tbody>{vacancies.map(v=><tr key={v.id}><td className="mono">{v.vacancy_no||'—'}</td><td style={{fontWeight:600}}>{v.title_ar}</td><td>{v.department||'—'}</td><td className="num">{v.headcount}</td><td className="mono">{v.salary_min!=null||v.salary_max!=null?`${v.salary_min!=null?money(v.salary_min):'—'} - ${v.salary_max!=null?money(v.salary_max):'—'}`:'يحدد لاحقاً'}</td><td>{VSTATUS[v.status]||v.status}</td><td><Link className="btn ghost" style={{padding:'4px 10px',fontSize:12}} href={`/dashboard/recruitment/${v.id}`}>فتح</Link></td></tr>)}{!vacancies.length&&<tr><td colSpan="7"><div className="empty">لا توجد شواغر حتى الآن.</div></td></tr>}</tbody></table></div>}
    {tab==='applications'&&<div className="section" style={{marginTop:0,overflowX:'auto'}}><table><thead><tr><th>المرشح</th><th>الشاغر</th><th>الجنسية</th><th>انتهاء الهوية/الإقامة</th><th className="num">الاستبيان</th><th className="num">المقابلة</th><th className="num">النهائي</th><th>الحالة</th></tr></thead><tbody>{apps.map(a=><tr key={a.id}><td><Link href={`/dashboard/recruitment/applications/${a.id}`} style={{fontWeight:600,color:'var(--maroon-dark)'}}>{a.candidates?.full_name_ar||'—'}</Link>{a.has_eliminating_issue&&<div style={{fontSize:11.5,color:'var(--warn)'}}>شرط أساسي يحتاج مراجعة</div>}</td><td>{a.job_vacancies?.title_ar||'—'}</td><td>{a.candidates?.nationality||'—'}</td><td className="mono">{dateAr(a.candidates?.id_expiry)}</td><td className="num">{a.questionnaire_score??'—'}</td><td className="num">{a.interview_score??'—'}</td><td className="num" style={{fontWeight:700}}>{a.final_score??'—'}</td><td>{ASTATUS[a.status]||a.status}</td></tr>)}{!apps.length&&<tr><td colSpan="8"><div className="empty">لم تصل طلبات ترشيح بعد.</div></td></tr>}</tbody></table></div>}
    {tab==='talent'&&<div className="section" style={{marginTop:0,padding:18}}><div className="empty"><h3>بنك المواهب</h3><p>المرشحون الممتازون يبقون لمدة لا تتجاوز 90 يوماً ثم ينتقلون إلى الأرشيف المقيد.</p></div></div>}
  </>;
}
