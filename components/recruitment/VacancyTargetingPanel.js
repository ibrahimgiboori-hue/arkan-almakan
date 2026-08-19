'use client';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { matchRecruitmentProfile, recommendedQuestions, LEVEL_LABELS } from '@/lib/recruitment-question-engine';

export default function VacancyTargetingPanel(){
  const pathname=usePathname();
  const m=pathname?.match(/^\/dashboard\/recruitment\/([0-9a-f-]{36})$/i);
  const vacancyId=m?.[1]||null;
  const [v,setV]=useState(null); const [busy,setBusy]=useState(false); const [msg,setMsg]=useState(''); const [err,setErr]=useState('');

  useEffect(()=>{if(!vacancyId){setV(null);return;} (async()=>{
    const {data,error}=await supabase.from('job_vacancies').select('id,title_ar,occupation_profile_key,target_experience_level,target_city,required_start_within_days').eq('id',vacancyId).maybeSingle();
    if(error)setErr(error.message); else setV(data);
  })();},[vacancyId]);

  useEffect(()=>{
    if(!vacancyId)return;
    const timer=setTimeout(()=>{
      document.querySelectorAll('button').forEach(btn=>{
        if((btn.textContent||'').trim()==='توليد الأسئلة المقترحة'){
          const f=btn.closest('.field'); if(f)f.style.display='none'; else btn.style.display='none';
        }
      });
    },250);
    return()=>clearTimeout(timer);
  },[vacancyId,v]);

  const level=v?.target_experience_level||'entry';
  const profile=useMemo(()=>v?matchRecruitmentProfile(v.title_ar,v.occupation_profile_key):null,[v]);
  if(!vacancyId||!v)return null;

  async function patch(fields){
    setV(x=>({...x,...fields})); setErr('');
    const {error}=await supabase.from('job_vacancies').update({...fields,updated_at:new Date().toISOString()}).eq('id',vacancyId);
    if(error)setErr(error.message); else {setMsg('حُفظ');setTimeout(()=>setMsg(''),1200);}
  }

  async function generate(){
    if(!confirm(`سيتم استبدال الأسئلة الوظيفية الحالية بخمسة أسئلة تناسب مستوى «${LEVEL_LABELS[level]}». هل تريد المتابعة؟`))return;
    setBusy(true);setErr('');
    try{
      const {error:off}=await supabase.from('vacancy_requirements').update({is_active:false}).eq('vacancy_id',vacancyId).eq('is_active',true); if(off)throw off;
      const qs=recommendedQuestions(profile,level).slice(0,5).map((q,i)=>({vacancy_id:vacancyId,label:q.label,question_text:q.question_text,answer_type:q.answer_type||'single',options:q.options||[],criterion_type:q.criterion_type||'normal',expected_value:q.expected_value||null,weight:Number(q.weight||0),score_map:q.score_map||{},is_license:!!q.is_license,license_type:q.license_type||null,sort_order:i+1,is_active:true}));
      const {error:ins}=await supabase.from('vacancy_requirements').insert(qs); if(ins)throw ins;
      if(profile){await supabase.from('job_vacancies').update({occupation_profile_key:profile.key,occupation_family:profile.family||null,occupation_level:LEVEL_LABELS[level],updated_at:new Date().toISOString()}).eq('id',vacancyId);}
      setMsg('تم توليد 5 أسئلة حسب المستوى'); setTimeout(()=>location.reload(),700);
    }catch(e){setErr(e?.message||'تعذر توليد الأسئلة');}
    finally{setBusy(false);}
  }

  return <div className="section" style={{marginTop:0,marginBottom:16,padding:18,border:'1px solid #e1d8d8',background:'#fff'}}>
    <header style={{margin:'-18px -18px 16px'}}><h2>استهداف المرشح</h2><span style={{fontSize:12.5}}>المسمى يحدد نوع المعرفة، والمستوى يحدد عمق الأسئلة</span></header>
    {err&&<div className="msg err" style={{marginBottom:10}}>{err}</div>}{msg&&<div className="msg ok" style={{marginBottom:10}}>{msg}</div>}
    <div className="form-grid">
      <div className="field"><label>مستوى الخبرة المستهدف</label><select value={level} onChange={e=>patch({target_experience_level:e.target.value,occupation_level:LEVEL_LABELS[e.target.value]})}>{Object.entries(LEVEL_LABELS).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select><span className="hint">لا يعتمد على عدد السنوات فقط؛ بل على عمق القرار المتوقع من الوظيفة.</span></div>
      <div className="field"><label>مدينة العمل المستهدفة</label><input value={v.target_city||''} onChange={e=>setV({...v,target_city:e.target.value})} onBlur={e=>patch({target_city:e.target.value||null})} placeholder="مثال: الرياض"/></div>
      <div className="field"><label>المباشرة المطلوبة خلال</label><div style={{display:'flex',alignItems:'center',gap:8}}><input type="number" min="1" max="365" value={v.required_start_within_days||14} onChange={e=>patch({required_start_within_days:Number(e.target.value||14)})}/><span style={{whiteSpace:'nowrap'}}>يومًا</span></div><span className="hint">يظهر للمرشح كسؤال جاهزية، ولا يدخل في درجة الجودة المهنية.</span></div>
    </div>
    <div className="rowsplit" style={{marginTop:14,alignItems:'center'}}><div className="hint">{profile?`المسمى المرجعي: ${profile.title}`:'سيستخدم النظام أقرب ملف مهني متاح.'}</div><button className="btn" type="button" disabled={busy} onClick={generate}>{busy?'جارٍ التوليد…':'توليد 5 أسئلة حسب المستوى'}</button></div>
  </div>;
}
