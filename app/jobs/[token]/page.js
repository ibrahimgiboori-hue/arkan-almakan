'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { money } from '@/lib/format';

export default function PublicJobApplication(){
  const {token}=useParams();
  const [v,setV]=useState(null); const [loading,setLoading]=useState(true); const [err,setErr]=useState(''); const [done,setDone]=useState(false); const [busy,setBusy]=useState(false);
  const [c,setC]=useState({full_name_ar:'',nationality:'',id_kind:'إقامة',id_number:'',id_expiry:'',mobile:'',email:''});
  const [salary,setSalary]=useState(''); const [available,setAvailable]=useState(''); const [answers,setAnswers]=useState({});
  useEffect(()=>{(async()=>{const {data,error}=await supabase.rpc('get_public_vacancy',{p_token:token}); if(error)setErr(error.message); setV(data); setLoading(false);})();},[token]);
  async function submit(e){
    e.preventDefault(); setBusy(true); setErr('');
    const payload=(v.requirements||[]).map(r=>({requirement_id:r.id,answer_text:answers[r.id]??'',answer_json:null}));
    const {error}=await supabase.rpc('submit_candidate_application',{p_token:token,p_candidate:c,p_salary_expectation:salary===''?null:Number(salary),p_available_from:available||null,p_answers:payload});
    setBusy(false); if(error){setErr(error.message);return;} setDone(true); window.scrollTo({top:0,behavior:'smooth'});
  }
  if(loading)return <div style={{maxWidth:760,margin:'60px auto',padding:24}}>جارٍ تحميل الوظيفة…</div>;
  if(!v)return <div style={{maxWidth:760,margin:'60px auto',padding:24}}><div className="msg err">هذا الشاغر غير متاح للتقديم حالياً.</div></div>;
  if(done)return <div style={{maxWidth:720,margin:'70px auto',padding:24,direction:'rtl'}}><div className="section" style={{padding:28,textAlign:'center'}}><h1 style={{marginTop:0}}>تم استلام طلبك</h1><p style={{lineHeight:1.9}}>شكراً لاهتمامك بالانضمام إلى أركان المكان. سيقوم فريق الموارد البشرية بمراجعة بياناتك ومتطلبات الشاغر، وسيتم التواصل معك عند الحاجة إلى استكمال أي خطوة.</p></div></div>;
  const salaryText=v.salary_min!=null||v.salary_max!=null?`${v.salary_min!=null?money(v.salary_min):'—'} - ${v.salary_max!=null?money(v.salary_max):'—'} ريال`:'يحدد حسب العرض';
  return <div style={{maxWidth:840,margin:'28px auto 60px',padding:'0 18px',direction:'rtl'}}>
    <div className="section" style={{padding:24,marginTop:0}}>
      <div style={{borderBottom:'1px solid var(--hair)',paddingBottom:16,marginBottom:18}}><div style={{fontSize:13,color:'var(--ink-soft)'}}>أركان المكان للمقاولات — فرصة وظيفية</div><h1 style={{margin:'5px 0 4px'}}>{v.title_ar}</h1><div style={{fontSize:14,color:'var(--ink-soft)'}}>{v.department||'—'} · نطاق الراتب: {salaryText}</div></div>
      {v.duties&&<div style={{marginBottom:20}}><h3>المهام الأساسية</h3><p style={{whiteSpace:'pre-wrap',lineHeight:1.9}}>{v.duties}</p></div>}
      {err&&<div className="msg err" style={{marginBottom:14}}>{err}</div>}
      <form onSubmit={submit}>
        <h2 style={{fontSize:18}}>بيانات المتقدم</h2>
        <div className="form-grid">
          <div className="field span2"><label>الاسم الكامل *</label><input required value={c.full_name_ar} onChange={e=>setC({...c,full_name_ar:e.target.value})}/></div>
          <div className="field"><label>الجنسية</label><input value={c.nationality} onChange={e=>setC({...c,nationality:e.target.value})}/></div>
          <div className="field"><label>نوع الهوية</label><select value={c.id_kind} onChange={e=>setC({...c,id_kind:e.target.value})}><option>إقامة</option><option>هوية وطنية</option><option>جواز سفر</option></select></div>
          <div className="field"><label>رقم الهوية / الإقامة *</label><input required dir="ltr" value={c.id_number} onChange={e=>setC({...c,id_number:e.target.value})}/></div>
          <div className="field"><label>تاريخ الانتهاء</label><input type="date" dir="ltr" value={c.id_expiry} onChange={e=>setC({...c,id_expiry:e.target.value})}/></div>
          <div className="field"><label>رقم الجوال *</label><input required dir="ltr" value={c.mobile} onChange={e=>setC({...c,mobile:e.target.value})}/></div>
          <div className="field"><label>البريد الإلكتروني</label><input type="email" dir="ltr" value={c.email} onChange={e=>setC({...c,email:e.target.value})}/></div>
          <div className="field"><label>الراتب المتوقع</label><input type="number" min="0" dir="ltr" value={salary} onChange={e=>setSalary(e.target.value)}/></div>
          <div className="field"><label>إمكانية المباشرة من</label><input type="date" dir="ltr" value={available} onChange={e=>setAvailable(e.target.value)}/></div>
        </div>

        {!!v.requirements?.length&&<><h2 style={{fontSize:18,marginTop:26}}>أسئلة الشاغر</h2><div className="form-grid">
          {v.requirements.map(r=><div className={r.answer_type==='text'?'field span2':'field'} key={r.id}>
            <label>{r.question_text||r.label}{r.criterion_type==='eliminating'?' *':''}</label>
            {r.answer_type==='yes_no'?<select required={r.criterion_type==='eliminating'} value={answers[r.id]??''} onChange={e=>setAnswers({...answers,[r.id]:e.target.value})}><option value="">اختر…</option><option value="نعم">نعم</option><option value="لا">لا</option></select>:
             r.answer_type==='date'?<input type="date" required={r.criterion_type==='eliminating'} value={answers[r.id]??''} onChange={e=>setAnswers({...answers,[r.id]:e.target.value})}/>: 
             r.answer_type==='number'?<input type="number" required={r.criterion_type==='eliminating'} value={answers[r.id]??''} onChange={e=>setAnswers({...answers,[r.id]:e.target.value})}/>: 
             <input required={r.criterion_type==='eliminating'} placeholder={r.is_license?'أدخل رقم الترخيص / بياناته':''} value={answers[r.id]??''} onChange={e=>setAnswers({...answers,[r.id]:e.target.value})}/>} 
            {r.is_license&&<span className="hint">سيتم التحقق من الترخيص ومستنداته بواسطة الموارد البشرية.</span>}
          </div>)}
        </div></>}
        <div className="msg" style={{marginTop:20,lineHeight:1.8}}>بإرسال الطلب، فإنك تقر بأن البيانات المقدمة صحيحة حسب علمك. التقديم لا يعني القبول أو إصدار عرض وظيفي.</div>
        <button className="btn" style={{marginTop:16,minWidth:160,justifyContent:'center'}} disabled={busy}>{busy?'جارٍ إرسال الطلب…':'إرسال طلب التقديم'}</button>
      </form>
    </div>
  </div>;
}
