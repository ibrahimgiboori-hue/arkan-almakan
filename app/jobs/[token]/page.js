'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import styles from './page.module.css';

const EMPTY={full_name_ar:'',nationality:'',id_kind:'إقامة',id_number:'',id_expiry:'',mobile:'',email:''};

export default function PublicJobApplication(){
  const {token}=useParams();
  const [v,setV]=useState(null); const [loading,setLoading]=useState(true); const [err,setErr]=useState(''); const [done,setDone]=useState(false); const [busy,setBusy]=useState(false);
  const [c,setC]=useState(EMPTY); const [salaryMin,setSalaryMin]=useState(''); const [salaryMax,setSalaryMax]=useState(''); const [available,setAvailable]=useState(''); const [answers,setAnswers]=useState({});
  const [files,setFiles]=useState({cv:null,id:null,qualifications:[]});

  useEffect(()=>{(async()=>{const {data,error}=await supabase.rpc('get_public_vacancy',{p_token:token}); if(error)setErr(error.message); setV(data); setLoading(false);})();},[token]);

  async function uploadOne(applicationId,docType,file){
    if(!file)return;
    const body=new FormData(); body.append('vacancy_token',token); body.append('application_id',applicationId); body.append('document_type',docType); body.append('file',file);
    const {error}=await supabase.functions.invoke('candidate-upload',{body});
    if(error) throw error;
  }

  async function submit(e){
    e.preventDefault(); setBusy(true); setErr('');
    try{
      if(salaryMin!==''&&salaryMax!==''&&Number(salaryMin)>Number(salaryMax)) throw new Error('الحد الأدنى للراتب المتوقع يجب ألا يتجاوز الحد الأعلى.');
      if(!files.cv||!files.id) throw new Error('يرجى إرفاق السيرة الذاتية وصورة الهوية أو الإقامة.');
      const payload=(v.requirements||[]).slice(0,5).map(r=>({requirement_id:r.id,answer_text:answers[r.id]??'',answer_json:null}));
      const {data,error}=await supabase.rpc('submit_candidate_application_v2',{
        p_token:token,p_candidate:c,p_salary_min:salaryMin===''?null:Number(salaryMin),p_salary_max:salaryMax===''?null:Number(salaryMax),p_available_from:available||null,p_answers:payload
      });
      if(error) throw error;
      const applicationId=data?.application_id;
      if(!applicationId) throw new Error('تم حفظ الطلب لكن تعذر تجهيز المرفقات. يرجى التواصل مع الموارد البشرية.');
      await uploadOne(applicationId,'السيرة الذاتية',files.cv);
      await uploadOne(applicationId,'الهوية / الإقامة',files.id);
      for(const f of files.qualifications) await uploadOne(applicationId,'المؤهلات والشهادات',f);
      setDone(true); window.scrollTo({top:0,behavior:'smooth'});
    }catch(e2){setErr(e2?.message||'تعذر إرسال الطلب. يرجى المحاولة مرة أخرى.');}
    finally{setBusy(false);}
  }

  if(loading)return <div className={styles.wrap}>جارٍ تحميل الفرصة الوظيفية…</div>;
  if(!v)return <div className={styles.wrap}><div className={styles.error}>هذه الفرصة غير متاحة للتقديم حالياً.</div></div>;
  if(done)return <div className={styles.success}><div className={styles.successBox}><h1>تم استلام طلبك</h1><p>شكرًا لاهتمامك بالانضمام إلى أركان المكان للمقاولات. سيقوم فريق الموارد البشرية بمراجعة طلبك والمرفقات، وسيتم التواصل معك عند الحاجة إلى استكمال أي خطوة.</p></div></div>;

  return <div className={styles.wrap}>
    <section className={styles.hero}>
      <div className={styles.kicker}>فرصة وظيفية</div>
      <h1>{v.title_ar}</h1>
      <div className={styles.meta}>الإدارة: {v.department||'تحدد وفق الهيكل التنظيمي'}</div>
      <p className={styles.intro}>{v.company_intro}</p>
      {v.duties&&<><div className={styles.dutiesTitle}>المهام الأساسية</div><p className={styles.duties}>{v.duties}</p></>}
    </section>

    <form className={styles.panel} onSubmit={submit}>
      {err&&<div className={styles.error}>{err}</div>}
      <h2 className={styles.sectionTitle}>بيانات المتقدم</h2>
      <div className={styles.grid}>
        <div className={`${styles.field} ${styles.full}`}><label>الاسم الكامل *</label><input required value={c.full_name_ar} onChange={e=>setC({...c,full_name_ar:e.target.value})}/></div>
        <div className={styles.field}><label>الجنسية *</label><input required value={c.nationality} onChange={e=>setC({...c,nationality:e.target.value})}/></div>
        <div className={styles.field}><label>رقم واتساب للتواصل *</label><input required inputMode="tel" dir="ltr" value={c.mobile} onChange={e=>setC({...c,mobile:e.target.value})}/></div>
        <div className={`${styles.field} ${styles.full}`}><label>الهوية / الإقامة *</label><div className={styles.combo}><select value={c.id_kind} onChange={e=>setC({...c,id_kind:e.target.value})}><option>إقامة</option><option>هوية وطنية</option><option>جواز سفر</option></select><input required dir="ltr" placeholder="الرقم" value={c.id_number} onChange={e=>setC({...c,id_number:e.target.value})}/></div></div>
        <div className={styles.field}><label>تاريخ انتهاء الهوية / الإقامة *</label><input required type="date" dir="ltr" value={c.id_expiry} onChange={e=>setC({...c,id_expiry:e.target.value})}/></div>
        <div className={styles.field}><label>إمكانية المباشرة من</label><input type="date" dir="ltr" value={available} onChange={e=>setAvailable(e.target.value)}/></div>
        <div className={`${styles.field} ${styles.full}`}><label>الراتب الشهري المتوقع</label><div className={styles.salary}><input type="number" min="0" dir="ltr" placeholder="من" value={salaryMin} onChange={e=>setSalaryMin(e.target.value)}/><span>إلى</span><input type="number" min="0" dir="ltr" placeholder="إلى" value={salaryMax} onChange={e=>setSalaryMax(e.target.value)}/></div><div className={styles.hint}>اكتب النطاق الذي تراه مناسبًا لك. نطاق المنشأة الداخلي لا يظهر للمتقدمين.</div></div>
      </div>

      {!!v.requirements?.length&&<section className={styles.questions}><h2 className={styles.sectionTitle}>أسئلة مرتبطة بالوظيفة</h2><div className={styles.grid}>
        {v.requirements.slice(0,5).map(r=><div className={`${styles.field} ${r.answer_type==='text'?styles.full:''}`} key={r.id}>
          <label>{r.question_text||r.label}{r.criterion_type==='eliminating'?' *':''}</label>
          {r.answer_type==='single'?<select required={r.criterion_type==='eliminating'} value={answers[r.id]??''} onChange={e=>setAnswers({...answers,[r.id]:e.target.value})}><option value="">اختر…</option>{(r.options||[]).map(o=><option key={typeof o==='string'?o:o.label} value={typeof o==='string'?o:o.label}>{typeof o==='string'?o:o.label}</option>)}</select>:
           r.answer_type==='yes_no'?<select required={r.criterion_type==='eliminating'} value={answers[r.id]??''} onChange={e=>setAnswers({...answers,[r.id]:e.target.value})}><option value="">اختر…</option><option>نعم</option><option>لا</option></select>:
           r.answer_type==='date'?<input type="date" required={r.criterion_type==='eliminating'} value={answers[r.id]??''} onChange={e=>setAnswers({...answers,[r.id]:e.target.value})}/>: 
           r.answer_type==='number'?<input type="number" required={r.criterion_type==='eliminating'} value={answers[r.id]??''} onChange={e=>setAnswers({...answers,[r.id]:e.target.value})}/>: 
           <input required={r.criterion_type==='eliminating'} placeholder={r.is_license?'رقم الترخيص':''} value={answers[r.id]??''} onChange={e=>setAnswers({...answers,[r.id]:e.target.value})}/>} 
          {r.is_license&&<div className={styles.hint}>ستتحقق الموارد البشرية من الترخيص والمرفق.</div>}
        </div>)}
      </div></section>}

      <section className={styles.attachments}>
        <h2 className={styles.sectionTitle}>المرفقات</h2>
        <div className={styles.grid}>
          <div className={`${styles.field} ${styles.fileBox}`}><label>السيرة الذاتية * — PDF أو صورة</label><input required type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e=>setFiles({...files,cv:e.target.files?.[0]||null})}/></div>
          <div className={`${styles.field} ${styles.fileBox}`}><label>صورة الهوية / الإقامة *</label><input required type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e=>setFiles({...files,id:e.target.files?.[0]||null})}/></div>
          <div className={`${styles.field} ${styles.fileBox} ${styles.full}`}><label>المؤهلات والتراخيص إن وجدت</label><input multiple type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e=>setFiles({...files,qualifications:Array.from(e.target.files||[])})}/><div className={styles.hint}>يمكن اختيار أكثر من ملف، بحد أقصى 10 م.ب لكل ملف.</div></div>
        </div>
      </section>

      <div className={styles.notice}>بإرسال الطلب، فإنك تقر بأن البيانات والمرفقات المقدمة صحيحة حسب علمك. التقديم لا يعني القبول أو إصدار عرض وظيفي.</div>
      <button className={styles.submit} disabled={busy}>{busy?'جارٍ إرسال الطلب والمرفقات…':'إرسال طلب التقديم'}</button>
    </form>
  </div>;
}
