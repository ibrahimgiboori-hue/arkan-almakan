'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import styles from './page.module.css';

const EMPTY={full_name_ar:'',nationality:'',id_kind:'إقامة',id_number:'',id_expiry:'',mobile:'',email:''};
const LEVEL_AR={entry:'مبتدئ',intermediate:'متوسط الخبرة',advanced:'متقدم',expert:'متمرس / خبير',leadership:'قيادي / إداري'};

export default function PublicJobApplication(){
  const {token}=useParams();
  const [v,setV]=useState(null); const [loading,setLoading]=useState(true); const [err,setErr]=useState(''); const [done,setDone]=useState(false); const [busy,setBusy]=useState(false);
  const [c,setC]=useState(EMPTY); const [salaryMin,setSalaryMin]=useState(''); const [salaryMax,setSalaryMax]=useState(''); const [available,setAvailable]=useState(''); const [answers,setAnswers]=useState({});
  const [g,setG]=useState({current_city:'',target_city_relation:'',employment_status:'',notice_period_days:'',can_start_within_window:'',start_constraint_note:''});
  const [files,setFiles]=useState({cv:null,id:null,qualifications:[]});

  useEffect(()=>{(async()=>{const {data,error}=await supabase.rpc('get_public_vacancy',{p_token:token}); if(error)setErr(error.message); setV(data); setLoading(false);})();},[token]);

  async function uploadOne(applicationId,docType,file){
    if(!file)return; const body=new FormData(); body.append('vacancy_token',token); body.append('application_id',applicationId); body.append('document_type',docType); body.append('file',file);
    const {error}=await supabase.functions.invoke('candidate-upload',{body}); if(error)throw error;
  }

  async function submit(e){
    e.preventDefault(); setBusy(true); setErr('');
    try{
      if(c.full_name_ar.trim().split(/\s+/).length<3) throw new Error('يرجى كتابة الاسم الثلاثي على الأقل.');
      if(salaryMin!==''&&salaryMax!==''&&Number(salaryMin)>Number(salaryMax)) throw new Error('الحد الأدنى للراتب المتوقع يجب ألا يتجاوز الحد الأعلى.');
      if(!files.cv||!files.id) throw new Error('يرجى إرفاق السيرة الذاتية وصورة الهوية أو الإقامة.');
      if(g.employment_status==='موظف حاليًا'&&g.notice_period_days==='') throw new Error('يرجى تحديد فترة الإشعار الحالية.');
      if(g.can_start_within_window==='false'&&!available) throw new Error('يرجى تحديد أقرب تاريخ متاح للمباشرة.');
      const payload=(v.requirements||[]).slice(0,5).map(r=>({requirement_id:r.id,answer_text:answers[r.id]??'',answer_json:null}));
      const general={...g,notice_period_days:g.notice_period_days===''?null:Number(g.notice_period_days),can_start_within_window:g.can_start_within_window===''?null:g.can_start_within_window==='true'};
      const {data,error}=await supabase.rpc('submit_candidate_application_v3',{p_token:token,p_candidate:c,p_salary_min:salaryMin===''?null:Number(salaryMin),p_salary_max:salaryMax===''?null:Number(salaryMax),p_available_from:available||null,p_general:general,p_answers:payload});
      if(error)throw error;
      const applicationId=data?.application_id; if(!applicationId)throw new Error('تم حفظ الطلب لكن تعذر تجهيز المرفقات.');
      await uploadOne(applicationId,'السيرة الذاتية',files.cv); await uploadOne(applicationId,'الهوية / الإقامة',files.id);
      for(const f of files.qualifications) await uploadOne(applicationId,'المؤهلات والشهادات',f);
      setDone(true); window.scrollTo({top:0,behavior:'smooth'});
    }catch(e2){setErr(e2?.message||'تعذر إرسال الطلب. يرجى المحاولة مرة أخرى.');} finally{setBusy(false);}
  }

  if(loading)return <div className={styles.wrap}>جارٍ تحميل الفرصة الوظيفية…</div>;
  if(!v)return <div className={styles.wrap}><div className={styles.error}>هذه الفرصة غير متاحة للتقديم حالياً.</div></div>;
  if(done)return <div className={styles.success}><div className={styles.successBox}><h1>تم استلام طلبك</h1><p>شكرًا لاهتمامك بالانضمام إلى أركان المكان للمقاولات. سيقوم فريق الموارد البشرية بمراجعة الطلب والمرفقات.</p></div></div>;

  const days=v.required_start_within_days||14;
  return <div className={styles.wrap}>
    <section className={styles.hero}>
      <div className={styles.kicker}>فرصة وظيفية</div><h1>{v.title_ar}</h1>
      <div className={styles.meta}>الإدارة: {v.department||'تحدد وفق الهيكل التنظيمي'} · المستوى المستهدف: {LEVEL_AR[v.target_experience_level]||'يحدد حسب الشاغر'}{v.target_city?` · الموقع: ${v.target_city}`:''}</div>
      <p className={styles.intro}>{v.company_intro}</p>
      {v.duties&&<><div className={styles.dutiesTitle}>المهام الأساسية</div><p className={styles.duties}>{String(v.duties).replace(/\\n/g,'\n')}</p></>}
    </section>

    <form className={styles.panel} onSubmit={submit}>
      {err&&<div className={styles.error}>{err}</div>}
      <h2 className={styles.sectionTitle}>البيانات العامة</h2>
      <div className={styles.hint} style={{marginBottom:12}}>10 بيانات مختصرة تساعد على فهم الجاهزية. لا تدخل بيانات السكن أو الحالة الوظيفية في درجة الجودة المهنية.</div>
      <div className={styles.grid}>
        <div className={`${styles.field} ${styles.full}`}><label>1. الاسم الثلاثي على الأقل *</label><input required value={c.full_name_ar} onChange={e=>setC({...c,full_name_ar:e.target.value})}/></div>
        <div className={styles.field}><label>2. الجنسية *</label><input required value={c.nationality} onChange={e=>setC({...c,nationality:e.target.value})}/></div>
        <div className={styles.field}><label>3. الهوية / الإقامة *</label><div className={styles.combo}><select value={c.id_kind} onChange={e=>setC({...c,id_kind:e.target.value})}><option>إقامة</option><option>هوية وطنية</option><option>جواز سفر</option></select><input required dir="ltr" placeholder="الرقم" value={c.id_number} onChange={e=>setC({...c,id_number:e.target.value})}/></div></div>
        <div className={styles.field}><label>4. تاريخ انتهاء الهوية / الإقامة *</label><input required type="date" value={c.id_expiry} onChange={e=>setC({...c,id_expiry:e.target.value})}/></div>
        <div className={styles.field}><label>5. مدينة السكن الحالية *</label><input required value={g.current_city} onChange={e=>setG({...g,current_city:e.target.value})}/></div>
        <div className={styles.field}><label>6. {v.target_city?`السكن بالنسبة إلى ${v.target_city}`:'الاستعداد للعمل في موقع الوظيفة'} *</label><select required value={g.target_city_relation} onChange={e=>setG({...g,target_city_relation:e.target.value})}><option value="">اختر…</option><option>السكن داخل المدينة</option><option>يمكن الانتقال عند القبول</option><option>التنقل اليومي ممكن</option><option>يحتاج الأمر إلى ترتيب مسبق</option></select></div>
        <div className={styles.field}><label>7. الحالة الوظيفية الحالية *</label><select required value={g.employment_status} onChange={e=>setG({...g,employment_status:e.target.value,notice_period_days:e.target.value==='موظف حاليًا'?g.notice_period_days:''})}><option value="">اختر…</option><option>غير موظف حاليًا</option><option>موظف حاليًا</option><option>عمل حر / مستقل</option><option>طالب / متدرب</option></select></div>
        {g.employment_status==='موظف حاليًا'&&<div className={styles.field}><label>8. فترة الإشعار الحالية *</label><select required value={g.notice_period_days} onChange={e=>setG({...g,notice_period_days:e.target.value})}><option value="">اختر…</option><option value="0">لا توجد</option><option value="7">أسبوع</option><option value="14">أسبوعان</option><option value="30">شهر</option><option value="60">شهران</option><option value="90">3 أشهر أو أكثر</option></select></div>}
        <div className={styles.field}><label>9. هل توجد عوائق للمباشرة خلال {days} يومًا؟ *</label><select required value={g.can_start_within_window} onChange={e=>setG({...g,can_start_within_window:e.target.value})}><option value="">اختر…</option><option value="true">لا، يمكن المباشرة خلال المدة</option><option value="false">نعم، أحتاج مدة أطول</option></select></div>
        {g.can_start_within_window==='false'&&<><div className={styles.field}><label>أقرب تاريخ متاح للمباشرة *</label><input required type="date" value={available} onChange={e=>setAvailable(e.target.value)}/></div><div className={styles.field}><label>سبب التأخير باختصار</label><input value={g.start_constraint_note} onChange={e=>setG({...g,start_constraint_note:e.target.value})}/></div></>}
        <div className={`${styles.field} ${styles.full}`}><label>10. نطاق الراتب الشهري المتوقع</label><div className={styles.salary}><input type="number" min="0" placeholder="من" value={salaryMin} onChange={e=>setSalaryMin(e.target.value)}/><span>إلى</span><input type="number" min="0" placeholder="إلى" value={salaryMax} onChange={e=>setSalaryMax(e.target.value)}/></div><div className={styles.hint}>نطاق المنشأة الداخلي لا يظهر للمتقدمين.</div></div>
      </div>

      <h2 className={styles.sectionTitle} style={{marginTop:24}}>بيانات التواصل</h2>
      <div className={styles.grid}><div className={styles.field}><label>رقم واتساب *</label><input required inputMode="tel" dir="ltr" value={c.mobile} onChange={e=>setC({...c,mobile:e.target.value})}/></div><div className={styles.field}><label>البريد الإلكتروني</label><input type="email" dir="ltr" value={c.email} onChange={e=>setC({...c,email:e.target.value})}/></div></div>

      {!!v.requirements?.length&&<section className={styles.questions}><h2 className={styles.sectionTitle}>5 أسئلة مرتبطة بالوظيفة</h2><div className={styles.hint} style={{marginBottom:12}}>الأسئلة مصممة للمستوى المستهدف وتقيّم طريقة التفكير وجودة القرار، وليس الادعاء الذاتي بالخبرة.</div><div className={styles.grid}>
        {v.requirements.slice(0,5).map(r=><div className={`${styles.field} ${styles.full}`} key={r.id}><label>{r.question_text||r.label}</label>{r.answer_type==='single'?<select required value={answers[r.id]??''} onChange={e=>setAnswers({...answers,[r.id]:e.target.value})}><option value="">اختر…</option>{(r.options||[]).map(o=><option key={typeof o==='string'?o:o.label} value={typeof o==='string'?o:o.label}>{typeof o==='string'?o:o.label}</option>)}</select>:<input required value={answers[r.id]??''} onChange={e=>setAnswers({...answers,[r.id]:e.target.value})}/>}</div>)}
      </div></section>}

      <section className={styles.attachments}><h2 className={styles.sectionTitle}>المرفقات</h2><div className={styles.grid}>
        <div className={`${styles.field} ${styles.fileBox}`}><label>السيرة الذاتية * — PDF أو صورة</label><input required type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e=>setFiles({...files,cv:e.target.files?.[0]||null})}/></div>
        <div className={`${styles.field} ${styles.fileBox}`}><label>صورة الهوية / الإقامة *</label><input required type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e=>setFiles({...files,id:e.target.files?.[0]||null})}/></div>
        <div className={`${styles.field} ${styles.fileBox} ${styles.full}`}><label>المؤهلات والتراخيص إن وجدت</label><input multiple type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e=>setFiles({...files,qualifications:Array.from(e.target.files||[])})}/></div>
      </div></section>
      <div className={styles.notice}>التقديم لا يعني القبول أو إصدار عرض وظيفي، وتستخدم البيانات لغرض تقييم الطلب وإجراءات التوظيف.</div>
      <button className={styles.submit} disabled={busy}>{busy?'جارٍ إرسال الطلب والمرفقات…':'إرسال طلب التقديم'}</button>
    </form>
  </div>;
}
