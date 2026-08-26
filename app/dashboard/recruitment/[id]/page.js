'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { publicAppUrl } from '@/lib/public-url';
import { matchRecruitmentProfile, recommendedQuestions, ALL_RECRUITMENT_PROFILES } from '@/lib/recruitment-question-engine';

const VSTATUS={draft:'مسودة',open:'مفتوح للتقديم',paused:'موقوف مؤقتاً',filled:'اكتمل العدد',closed:'مغلق'};
const CRIT={eliminating:'إقصائي مباشر',high:'مهم بوزن مرتفع',normal:'عادي',preferred:'ميزة إضافية'};
const ATYPE={text:'نص',number:'رقم',yes_no:'نعم / لا',single:'اختيار واحد',date:'تاريخ',license:'ترخيص'};

export default function VacancyEditor(){
  const {id}=useParams();
  const [v,setV]=useState(null); const [reqs,setReqs]=useState([]); const [apps,setApps]=useState([]);
  const [err,setErr]=useState(''); const [saved,setSaved]=useState(''); const [generating,setGenerating]=useState(false); const [profileKey,setProfileKey]=useState('');
  const [r,setR]=useState({label:'',question_text:'',answer_type:'text',criterion_type:'normal',expected_value:'',weight:0,is_license:false,license_type:''});

  const load=useCallback(async()=>{
    const [a,b,c]=await Promise.all([
      supabase.from('job_vacancies').select('*').eq('id',id).maybeSingle(),
      supabase.from('vacancy_requirements').select('*').eq('vacancy_id',id).eq('is_active',true).order('sort_order'),
      supabase.from('candidate_applications').select('id,status,final_score,questionnaire_score,interview_score,candidates(full_name_ar,nationality)').eq('vacancy_id',id).order('applied_at',{ascending:false})
    ]);
    if(a.error||b.error||c.error) setErr(a.error?.message||b.error?.message||c.error?.message);
    setV(a.data); setReqs(b.data||[]); setApps(c.data||[]);
    if(a.data){const suggested=matchRecruitmentProfile(a.data.title_ar,a.data.occupation_profile_key);setProfileKey(a.data.occupation_profile_key||suggested?.key||'');}
  },[id]);
  useEffect(()=>{load();},[load]);

  const flash=m=>{setSaved(m);setTimeout(()=>setSaved(''),1800)};
  async function patch(fields){ setV({...v,...fields}); const {error}=await supabase.from('job_vacancies').update({...fields,updated_at:new Date().toISOString()}).eq('id',id); if(error)setErr(error.message);else flash('حُفظ'); }
  async function addReq(e){e.preventDefault(); const {error}=await supabase.from('vacancy_requirements').insert({vacancy_id:id,...r,weight:Number(r.weight||0),expected_value:r.expected_value||null,license_type:r.license_type||null,sort_order:reqs.length+1}); if(error){setErr(error.message);return;} setR({label:'',question_text:'',answer_type:'text',criterion_type:'normal',expected_value:'',weight:0,is_license:false,license_type:''}); load();}
  async function delReq(rid){if(!confirm('حذف هذا الشرط من الشاغر؟'))return; const {error}=await supabase.from('vacancy_requirements').update({is_active:false}).eq('id',rid); if(error)setErr(error.message);else load();}
  async function updateReq(rid,fields){setReqs(reqs.map(x=>x.id===rid?{...x,...fields}:x)); const {error}=await supabase.from('vacancy_requirements').update(fields).eq('id',rid); if(error)setErr(error.message);}
  async function copyLink(){const url=publicAppUrl(`/careers/${v.public_token}`,window.location.origin); await navigator.clipboard.writeText(url); flash('تم نسخ رابط التقديم');}

  async function generateQuestions(){
    const profile=matchRecruitmentProfile(v.title_ar,profileKey||v.occupation_profile_key);
    if(reqs.length&&!confirm('سيستبدل النظام الأسئلة النشطة الحالية بخمسة أسئلة مقترحة. هل تريد المتابعة؟'))return;
    setGenerating(true);setErr('');
    try{
      if(reqs.length){const {error:offErr}=await supabase.from('vacancy_requirements').update({is_active:false}).eq('vacancy_id',id).eq('is_active',true);if(offErr)throw offErr;}
      const questions=recommendedQuestions(profile).slice(0,5).map((x,i)=>({
        vacancy_id:id,label:x.label,question_text:x.question_text,answer_type:x.answer_type||'single',options:x.options||[],criterion_type:x.criterion_type||'normal',expected_value:x.expected_value||null,
        weight:Number(x.weight||0),score_map:x.score_map||{},is_license:!!x.is_license,license_type:x.license_type||null,sort_order:i+1,is_active:true
      }));
      const {error:qErr}=await supabase.from('vacancy_requirements').insert(questions); if(qErr)throw qErr;
      if(profile){
        const fields={occupation_profile_key:profile.key,occupation_family:profile.family||null,occupation_level:profile.levelLabel||profile.level||null,saudi_group_code:profile.saudiGroupCode||null,saudi_group_name:profile.saudiGroupName||null};
        if(!v.department&&profile.department)fields.department=profile.department;
        if(!v.duties&&profile.duties)fields.duties=Array.isArray(profile.duties)?profile.duties.join('\n'):profile.duties;
        const {error:vErr}=await supabase.from('job_vacancies').update({...fields,updated_at:new Date().toISOString()}).eq('id',id); if(vErr)throw vErr;
      }
      await load();flash('تم توليد 5 أسئلة مقترحة');
    }catch(e){setErr(e?.message||'تعذر توليد الأسئلة');}
    finally{setGenerating(false);}
  }

  if(!v)return <div className="empty">جارٍ تحميل الشاغر…</div>;
  const weightSum=reqs.reduce((s,x)=>s+Number(x.weight||0),0);
  const matched=matchRecruitmentProfile(v.title_ar,profileKey||v.occupation_profile_key);
  const groups=[...new Set(ALL_RECRUITMENT_PROFILES.map(x=>x.department))];

  return <>
    <div className="page-head"><div><h1>{v.title_ar}</h1><p>{v.vacancy_no||'شاغر وظيفي'} — {VSTATUS[v.status]}</p></div><div className="rowsplit"><Link className="btn ghost" href="/dashboard/recruitment">العودة</Link>{v.status==='open'&&<button className="btn" onClick={copyLink}>نسخ رابط التقديم</button>}</div></div>
    {err&&<div className="msg err" style={{marginBottom:12}}>{err}</div>}{saved&&<div className="msg ok" style={{marginBottom:12}}>{saved}</div>}

    <div className="section" style={{marginTop:0,padding:18}}>
      <header style={{margin:'-18px -18px 16px'}}><h2>بطاقة الشاغر</h2></header>
      <div className="form-grid">
        <div className="field span2"><label>المسمى الوظيفي</label><input value={v.title_ar||''} onChange={e=>setV({...v,title_ar:e.target.value})} onBlur={e=>patch({title_ar:e.target.value})}/></div>
        <div className="field"><label>الإدارة / القسم</label><input value={v.department||''} onChange={e=>setV({...v,department:e.target.value})} onBlur={e=>patch({department:e.target.value||null})}/></div>
        <div className="field"><label>العدد المطلوب</label><input type="number" min="1" value={v.headcount} onChange={e=>patch({headcount:Number(e.target.value||1)})}/></div>
        <div className="field"><label>الراتب من — داخلي</label><input type="number" value={v.salary_min??''} onChange={e=>setV({...v,salary_min:e.target.value})} onBlur={e=>patch({salary_min:e.target.value===''?null:Number(e.target.value)})}/></div>
        <div className="field"><label>الراتب إلى — داخلي</label><input type="number" value={v.salary_max??''} onChange={e=>setV({...v,salary_max:e.target.value})} onBlur={e=>patch({salary_max:e.target.value===''?null:Number(e.target.value)})}/><span className="hint">لا يظهر للمرشح.</span></div>
        <div className="field"><label>الحالة</label><select value={v.status} onChange={e=>patch({status:e.target.value,closed_at:['filled','closed'].includes(e.target.value)?new Date().toISOString():null})}>{Object.entries(VSTATUS).map(([k,x])=><option key={k} value={k}>{x}</option>)}</select></div>
        <div className="field"><label>وزن الاستبيان %</label><input type="number" min="0" max="100" value={v.questionnaire_weight} onChange={e=>{const q=Number(e.target.value||0);patch({questionnaire_weight:q,interview_weight:100-q})}}/></div>
        <div className="field"><label>وزن المقابلة %</label><input disabled value={v.interview_weight}/><span className="hint">يتكامل تلقائياً إلى 100%</span></div>
        <div className="field"><label>مهلة الرد على المرشح</label><input type="number" min="1" max="168" value={v.response_sla_hours} onChange={e=>patch({response_sla_hours:Number(e.target.value||72)})}/><span className="hint">تبدأ عند قرار عدم الاستمرار.</span></div>
        <div className="field"><label>مدة بنك المواهب</label><input type="number" min="1" max="365" value={v.talent_pool_days} onChange={e=>patch({talent_pool_days:Number(e.target.value||90)})}/><span className="hint">بالأيام — الافتراضي 90</span></div>
        <div className="field span3"><label>المهام الأساسية</label><textarea rows="4" value={v.duties||''} onChange={e=>setV({...v,duties:e.target.value})} onBlur={e=>patch({duties:e.target.value||null})}/></div>
      </div>
      {v.status==='draft'&&<div className="rowsplit" style={{marginTop:14}}><button className="btn" onClick={()=>patch({status:'open'})}>فتح الشاغر للتقديم</button><span className="hint">بعد الفتح يمكن نشر رابط التقديم في الإعلان أو المجموعة.</span></div>}
    </div>

    <div className="section">
      <header><h2>شروط وأسئلة الشاغر</h2><span style={{fontSize:12.5}}>مجموع الأوزان: {weightSum}</span></header>
      <div style={{padding:16,borderBottom:'1px solid var(--hair)',background:'#FBF9F9'}}>
        <div className="form-grid" style={{alignItems:'end'}}>
          <div className="field span2" style={{marginBottom:0}}><label>المسمى المرجعي لتوليد الأسئلة</label><select value={profileKey} onChange={e=>setProfileKey(e.target.value)}><option value="">مطابقة تلقائية حسب المسمى</option>{groups.map(g=><optgroup key={g} label={g}>{ALL_RECRUITMENT_PROFILES.filter(x=>x.department===g).map(p=><option key={p.key} value={p.key}>{p.title}</option>)}</optgroup>)}</select>{matched&&<span className="hint">اقتراح النظام: {matched.title} — {matched.levelLabel||matched.level}</span>}</div>
          <div className="field" style={{marginBottom:0}}><label>&nbsp;</label><button type="button" className="btn" onClick={generateQuestions} disabled={generating}>{generating?'جارٍ التوليد…':'توليد الأسئلة المقترحة'}</button></div>
        </div>
        <div className="hint" style={{marginTop:8}}>يولد النظام 5 أسئلة قصيرة موزونة مجموعها 100، ويمكنك تعديل الأوزان أو استبدال الأسئلة قبل نشر الرابط.</div>
      </div>
      <div style={{padding:16,overflowX:'auto'}}>
        <table><thead><tr><th>الشرط / السؤال</th><th>نوع الإجابة</th><th>أهمية الشرط</th><th className="num">الوزن</th><th>الإجابة المطلوبة</th><th>—</th></tr></thead>
        <tbody>{reqs.map(x=><tr key={x.id}>
          <td><div style={{fontWeight:600}}>{x.label}</div><div style={{fontSize:12,color:'var(--ink-soft)'}}>{x.question_text||'—'}{x.is_license&&` — ترخيص: ${x.license_type||x.label}`}</div></td>
          <td>{ATYPE[x.answer_type]||x.answer_type}</td>
          <td><select value={x.criterion_type} onChange={e=>updateReq(x.id,{criterion_type:e.target.value})}>{Object.entries(CRIT).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></td>
          <td><input type="number" min="0" max="100" value={x.weight} onChange={e=>updateReq(x.id,{weight:Number(e.target.value||0)})} style={{width:75}}/></td>
          <td>{x.expected_value&&x.expected_value!=='__nonempty__'?x.expected_value:'—'}</td><td><button className="btn ghost" style={{padding:'3px 8px',fontSize:12}} onClick={()=>delReq(x.id)}>حذف</button></td>
        </tr>)}{!reqs.length&&<tr><td colSpan="6"><div className="empty">لا توجد أسئلة بعد. اضغط «توليد الأسئلة المقترحة» ليبنيها النظام من المسمى الوظيفي.</div></td></tr>}</tbody></table>
      </div>
      {reqs.length<5&&<form onSubmit={addReq} style={{padding:'0 16px 16px'}}>
        <div className="form-grid">
          <div className="field span2"><label>اسم الشرط *</label><input required value={r.label} onChange={e=>setR({...r,label:e.target.value})} placeholder="مثال: خبرة في مشاريع المباني"/></div>
          <div className="field span2"><label>السؤال الذي يراه المرشح</label><input value={r.question_text} onChange={e=>setR({...r,question_text:e.target.value})} placeholder="مثال: كم سنة خبرتك في هذا المجال؟"/></div>
          <div className="field"><label>نوع الإجابة</label><select value={r.answer_type} onChange={e=>setR({...r,answer_type:e.target.value,is_license:e.target.value==='license'||r.is_license})}>{Object.entries(ATYPE).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></div>
          <div className="field"><label>أهمية الشرط</label><select value={r.criterion_type} onChange={e=>setR({...r,criterion_type:e.target.value})}>{Object.entries(CRIT).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></div>
          <div className="field"><label>الوزن</label><input type="number" min="0" max="100" value={r.weight} onChange={e=>setR({...r,weight:e.target.value})}/></div>
          <div className="field"><label>الإجابة المطلوبة</label><input value={r.expected_value} onChange={e=>setR({...r,expected_value:e.target.value})} placeholder={r.criterion_type==='eliminating'?'مثال: نعم':'اختياري'}/></div>
          <div className="field"><label>هل هو ترخيص؟</label><select value={r.is_license?'yes':'no'} onChange={e=>setR({...r,is_license:e.target.value==='yes',answer_type:e.target.value==='yes'?'license':r.answer_type})}><option value="no">لا</option><option value="yes">نعم</option></select></div>
          {r.is_license&&<div className="field"><label>نوع الترخيص</label><input value={r.license_type} onChange={e=>setR({...r,license_type:e.target.value})} placeholder="الهيئة السعودية للمهندسين مثلاً"/></div>}
        </div><button className="btn" style={{marginTop:10}}>+ إضافة سؤال يدوي</button>
      </form>}
    </div>

    <div className="section">
      <header><h2>المرشحون لهذا الشاغر</h2><span>{apps.length} طلب</span></header>
      <div style={{overflowX:'auto'}}><table><thead><tr><th>المرشح</th><th>الجنسية</th><th className="num">الاستبيان</th><th className="num">المقابلة</th><th className="num">النتيجة</th><th>الحالة</th></tr></thead><tbody>
        {apps.map(a=><tr key={a.id}><td><Link href={`/dashboard/recruitment/applications/${a.id}`} style={{fontWeight:600,color:'var(--maroon-dark)'}}>{a.candidates?.full_name_ar}</Link></td><td>{a.candidates?.nationality||'—'}</td><td className="num">{a.questionnaire_score??'—'}</td><td className="num">{a.interview_score??'—'}</td><td className="num">{a.final_score??'—'}</td><td>{a.status}</td></tr>)}
        {!apps.length&&<tr><td colSpan="6"><div className="empty">لا يوجد متقدمون على هذا الشاغر بعد.</div></td></tr>}
      </tbody></table></div>
    </div>
  </>;
}