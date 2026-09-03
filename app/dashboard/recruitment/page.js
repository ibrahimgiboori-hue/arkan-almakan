'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { money, dateAr } from '@/lib/format';
import { useCachedQuery, invalidateCachedQuery } from '@/lib/useCachedQuery';
import RawGrid, { rawGridStyles } from '@/components/ui/RawGrid';
import { CONSTRUCTION_JOB_CATALOG, CONSTRUCTION_JOB_GROUPS, getJobProfile, buildDefaultQuestions } from '@/lib/recruitment-catalog';

const VSTATUS = { draft:'مسودة', open:'مفتوح للتقديم', paused:'موقوف مؤقتاً', filled:'اكتمل العدد', closed:'مغلق' };
const ASTATUS = { submitted:'طلب جديد', screening:'فرز ومراجعة', interview:'مقابلة', reserve:'مرشح احتياطي', offer_review:'العرض تحت الاعتماد', offer_sent:'أُرسل العرض', offer_accepted:'قَبِل العرض', offer_declined:'اعتذر عن العرض', not_selected:'لم يقع عليه الاختيار', disqualified:'غير مستوفٍ', hired:'تم التوظيف', archived:'مؤرشف' };
const EMPTY={profileKey:'',title_ar:'',department:'',headcount:1,salary_min:'',salary_max:'',duties:''};
const CACHE_KEY='recruitment:index';

async function fetchRecruitmentIndex(){
  const [v,a]=await Promise.all([
    supabase.from('job_vacancies').select('*').order('created_at',{ascending:false}),
    supabase.from('candidate_applications')
      .select('id,status,questionnaire_score,interview_score,final_score,has_eliminating_issue,response_due_at,response_sent_at,applied_at,candidates(id,full_name_ar,nationality,mobile,id_expiry),job_vacancies(id,title_ar,department)')
      .order('applied_at',{ascending:false})
      .limit(150),
  ]);
  if(v.error||a.error) throw (v.error||a.error);
  return { vacancies:v.data||[], apps:a.data||[] };
}

export default function RecruitmentPage(){
  const router=useRouter();
  const {data,loading,error:loadError,reload}=useCachedQuery(CACHE_KEY,fetchRecruitmentIndex);
  const vacancies=data?.vacancies||[];
  const apps=data?.apps||[];

  const [showNew,setShowNew]=useState(false);
  const [form,setForm]=useState(EMPTY);
  const [err,setErr]=useState('');
  const [busy,setBusy]=useState(false);
  const profile=getJobProfile(form.profileKey);
  const visibleError=err||(loadError?(loadError.message||'تعذر تحميل بيانات التوظيف'):'');

  function chooseProfile(key){
    const p=getJobProfile(key);
    if(!p){setForm({...form,profileKey:''});return;}
    setForm({...form,profileKey:key,title_ar:p.title,department:p.department,duties:p.duties});
  }

  function closeNewVacancy(){
    setShowNew(false);
    setForm(EMPTY);
    setErr('');
  }

  async function createVacancy(e){
    e.preventDefault();
    setBusy(true);
    setErr('');

    const p=getJobProfile(form.profileKey);
    const year=new Date().getFullYear();
    const no=`VAC-${year}-${String(Date.now()).slice(-6)}`;
    const {data:created,error}=await supabase.from('job_vacancies').insert({
      vacancy_no:no,
      title_ar:form.title_ar.trim(),
      department:form.department.trim()||null,
      headcount:Number(form.headcount||1),
      salary_min:form.salary_min===''?null:Number(form.salary_min),
      salary_max:form.salary_max===''?null:Number(form.salary_max),
      salary_visible:false,
      duties:form.duties.trim()||null,
      occupation_profile_key:p?.key||null,
      occupation_family:p?.family||null,
      occupation_level:p?.levelLabel||null,
      saudi_group_code:p?.saudiGroupCode||null,
      saudi_group_name:p?.saudiGroupName||null,
    }).select('id').single();

    if(error){
      setBusy(false);
      setErr(error.message);
      return;
    }

    if(p){
      const questions=buildDefaultQuestions(p).map((x,i)=>({
        vacancy_id:created.id,
        label:x.label,
        question_text:x.question_text,
        answer_type:x.answer_type,
        options:x.options||[],
        criterion_type:x.criterion_type||'normal',
        expected_value:x.expected_value||null,
        weight:Number(x.weight||0),
        score_map:x.score_map||{},
        is_license:!!x.is_license,
        license_type:x.license_type||null,
        sort_order:i+1,
      }));
      const {error:qErr}=await supabase.from('vacancy_requirements').insert(questions);
      if(qErr){
        invalidateCachedQuery(CACHE_KEY);
        await reload();
        setBusy(false);
        setErr(`تم إنشاء الشاغر، لكن تعذر إنشاء الأسئلة التلقائية: ${qErr.message}`);
        return;
      }
    }

    invalidateCachedQuery(CACHE_KEY);
    await reload();
    setBusy(false);
    setForm(EMPTY);
    setShowNew(false);
    if(created?.id) router.push(`/dashboard/recruitment/${created.id}`);
  }

  const openCount=vacancies.filter(v=>v.status==='open').length;
  const pending=apps.filter(a=>['submitted','screening','interview'].includes(a.status)).length;
  const reserves=apps.filter(a=>a.status==='reserve').length;
  const due=apps.filter(a=>a.response_due_at&&!a.response_sent_at&&new Date(a.response_due_at)<new Date()).length;

  const vacancyColumns=[
    {key:'vacancy_no',label:'رقم الشاغر',type:'custom',minWidth:150,render:v=><span className="mono">{v.vacancy_no||'—'}</span>},
    {key:'title_ar',label:'المسمى',type:'custom',minWidth:220,render:v=><strong>{v.title_ar}</strong>},
    {key:'department',label:'الإدارة',type:'custom',minWidth:160,render:v=>v.department||'—'},
    {key:'headcount',label:'العدد',type:'custom',render:v=>v.headcount},
    {key:'salary',label:'نطاق الراتب الداخلي',type:'custom',minWidth:190,render:v=><span className="mono">{v.salary_min!=null||v.salary_max!=null?`${v.salary_min!=null?money(v.salary_min):'—'} - ${v.salary_max!=null?money(v.salary_max):'—'}`:'يحدد لاحقاً'}</span>},
    {key:'status',label:'الحالة',type:'badge',text:v=>VSTATUS[v.status]||v.status,tone:v=>v.status==='open'?'saved':v.status==='draft'||v.status==='paused'?'new':'muted'},
    {key:'_action',label:'إجراء',type:'action',render:v=><Link className={rawGridStyles.actionButton} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',textDecoration:'none'}} href={`/dashboard/recruitment/${v.id}`}>فتح</Link>},
  ];

  const applicationColumns=[
    {key:'candidate',label:'المرشح',type:'custom',minWidth:220,render:a=><div><strong>{a.candidates?.full_name_ar||'—'}</strong>{a.has_eliminating_issue&&<small style={{display:'block',marginTop:3,color:'var(--raw-red)'}}>شرط أساسي يحتاج مراجعة</small>}</div>},
    {key:'vacancy',label:'الشاغر',type:'custom',minWidth:190,render:a=>a.job_vacancies?.title_ar||'—'},
    {key:'nationality',label:'الجنسية',type:'custom',render:a=>a.candidates?.nationality||'—'},
    {key:'id_expiry',label:'انتهاء الهوية/الإقامة',type:'custom',minWidth:170,render:a=><span className="mono">{dateAr(a.candidates?.id_expiry)}</span>},
    {key:'questionnaire_score',label:'الاستبيان',type:'custom',render:a=>a.questionnaire_score??'—'},
    {key:'interview_score',label:'المقابلة',type:'custom',render:a=>a.interview_score??'—'},
    {key:'final_score',label:'النهائي',type:'custom',render:a=><strong>{a.final_score??'—'}</strong>},
    {key:'status',label:'الحالة',type:'badge',text:a=>ASTATUS[a.status]||a.status,tone:a=>a.status==='hired'||a.status==='offer_accepted'?'saved':['submitted','screening','interview','offer_review'].includes(a.status)?'new':'muted'},
    {key:'_action',label:'إجراء',type:'action',render:a=><Link className={rawGridStyles.actionButton} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',textDecoration:'none'}} href={`/dashboard/recruitment/applications/${a.id}`}>فتح</Link>},
  ];

  return <div
    data-geometry-owner="arkan-workspace-v1"
    data-workspace-kind="operational-index"
    data-workspace-scope="workforce-recruitment"
  >
    <div className="page-head">
      <div>
        <h1>التوظيف والمرشحون</h1>
        <p>مسار واحد ظاهر: الشاغر ← الطلبات ← التقييم ← العرض ← التوظيف</p>
      </div>
      {!showNew&&<button className="btn" type="button" onClick={()=>{setShowNew(true);setErr('');}}>+ شاغر جديد</button>}
    </div>

    {visibleError&&<div className="msg err" style={{marginBottom:12}}>{visibleError}</div>}

    <div className="grid k4" style={{marginBottom:16}}>
      <div className="card"><h3>الشواغر المفتوحة</h3><div className="big">{openCount}</div></div>
      <div className="card"><h3>تحت المراجعة</h3><div className="big">{pending}</div></div>
      <div className="card"><h3>مرشحون احتياطيون</h3><div className="big">{reserves}</div></div>
      <div className="card"><h3>ردود متأخرة</h3><div className="big">{due}</div><div className="foot">مهلة الرد تبدأ بعد قرار عدم الاستمرار</div></div>
    </div>

    {showNew&&<form className="section" style={{padding:18,marginTop:0,marginBottom:16}} onSubmit={createVacancy}>
      <header style={{margin:'-18px -18px 16px'}}><h2>إنشاء شاغر وظيفي</h2></header>
      <div className="msg" style={{marginBottom:14,borderColor:'var(--hair)',background:'#fafafa'}}>اختر مسمى جاهزًا ليقترح النظام الإدارة والمهام والأسئلة والأوزان. يمكنك تعديلها بعد الإنشاء.</div>
      <div className="form-grid">
        <div className="field span3">
          <label>المسمى الجاهز من دليل المقاولات</label>
          <select value={form.profileKey} onChange={e=>chooseProfile(e.target.value)}>
            <option value="">— مسمى مخصص / اختر لاحقًا —</option>
            {CONSTRUCTION_JOB_GROUPS.map(g=><optgroup key={g} label={g}>{CONSTRUCTION_JOB_CATALOG.filter(x=>x.department===g).map(x=><option key={x.key} value={x.key}>{x.title}</option>)}</optgroup>)}
          </select>
          <span className="hint">المكتبة مبنية على مجموعات ومسارات قطاع التشييد والتصنيف السعودي للمهن.</span>
        </div>
        <div className="field span2"><label>المسمى الوظيفي *</label><input required value={form.title_ar} onChange={e=>setForm({...form,title_ar:e.target.value})}/></div>
        <div className="field"><label>الإدارة / القسم</label><input value={form.department} onChange={e=>setForm({...form,department:e.target.value})}/></div>
        {profile&&<div className="field span3"><label>التصنيف المقترح</label><div className="msg" style={{borderColor:'var(--hair)',background:'#fff'}}>{profile.levelLabel} · {profile.saudiGroupCode} — {profile.saudiGroupName}</div></div>}
        <div className="field"><label>العدد المطلوب</label><input type="number" min="1" value={form.headcount} onChange={e=>setForm({...form,headcount:e.target.value})}/></div>
        <div className="field"><label>راتب المنشأة من — داخلي</label><input type="number" min="0" value={form.salary_min} onChange={e=>setForm({...form,salary_min:e.target.value})}/></div>
        <div className="field"><label>راتب المنشأة إلى — داخلي</label><input type="number" min="0" value={form.salary_max} onChange={e=>setForm({...form,salary_max:e.target.value})}/><span className="hint">لا يظهر هذا النطاق للمرشح.</span></div>
        <div className="field span3"><label>المهام الأساسية</label><textarea rows="5" value={form.duties} onChange={e=>setForm({...form,duties:e.target.value})}/></div>
      </div>
      {profile&&<div className="msg ok" style={{marginTop:8}}>سيُنشئ النظام 5 أسئلة وظيفية مختصرة موزونة تلقائيًا. يمكن تعديلها بالكامل من بطاقة الشاغر قبل فتحه.</div>}
      <div className="rowsplit" style={{marginTop:12}}>
        <button className="btn" disabled={busy}>{busy?'جارٍ الحفظ…':'إنشاء ومراجعة الشاغر'}</button>
        <button type="button" className="btn ghost" disabled={busy} onClick={closeNewVacancy}>إلغاء</button>
      </div>
    </form>}

    <div className="section" style={{marginTop:0}}>
      <header><h2>1. الشواغر</h2></header>
      <RawGrid
        columns={vacancyColumns}
        rows={vacancies}
        rowKey={row=>row.id}
        onPatchRow={()=>{}}
        loading={loading&&!data}
        emptyMessage="لا توجد شواغر حتى الآن."
      />
    </div>

    <div className="section">
      <header><h2>2. طلبات المرشحين</h2></header>
      <RawGrid
        columns={applicationColumns}
        rows={apps}
        rowKey={row=>row.id}
        onPatchRow={()=>{}}
        loading={loading&&!data}
        emptyMessage="لم تصل طلبات ترشيح بعد."
      />
    </div>

    <div className="section">
      <header><h2>3. بنك المواهب</h2></header>
      <div className="empty"><p>المرشحون الممتازون يبقون لمدة لا تتجاوز 90 يوماً ثم ينتقلون إلى الأرشيف المقيد.</p></div>
    </div>
  </div>;
}