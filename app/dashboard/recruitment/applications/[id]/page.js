'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { dateAr, money } from '@/lib/format';

const STATUS={submitted:'طلب جديد',screening:'فرز ومراجعة',interview:'مقابلة',reserve:'مرشح احتياطي',offer_review:'العرض تحت الاعتماد',offer_sent:'أُرسل العرض',offer_accepted:'قَبِل العرض',offer_declined:'اعتذر عن العرض',not_selected:'لم يقع عليه الاختيار',disqualified:'غير مستوفٍ',hired:'تم التوظيف',archived:'مؤرشف'};
const REC={strong:'أوصي بشدة',recommend:'أوصي',compare:'يحتاج مقارنة',do_not_recommend:'لا أوصي'};
const n=v=>v===''||v==null?null:Number(v);

export default function ApplicationReview(){
  const {id}=useParams();
  const [app,setApp]=useState(null),[answers,setAnswers]=useState([]),[reqs,setReqs]=useState([]),[recs,setRecs]=useState([]),[interviews,setInterviews]=useState([]),[employees,setEmployees]=useState([]),[docs,setDocs]=useState([]);
  const [err,setErr]=useState(''),[saved,setSaved]=useState(''),[uploading,setUploading]=useState(false);
  const [rec,setRec]=useState({recommender_employee_id:'',professional_context:'',known_months:'',work_quality:5,discipline:5,reliability:5,safety:5,recommendation_level:'recommend',comments:''});
  const [iv,setIv]=useState({interviewer_employee_id:'',technical_score:'',practical_score:'',communication_score:'',work_environment_score:'',recommendation:'recommend',notes:''});
  const load=useCallback(async()=>{
    const [a,b,c,d,e,f,g]=await Promise.all([
      supabase.from('candidate_applications').select('*,candidates(*),job_vacancies(*)').eq('id',id).maybeSingle(),
      supabase.from('candidate_application_answers').select('*').eq('application_id',id).order('created_at'),
      supabase.from('candidate_recommendations').select('*,employees(full_name_ar,job_title)').eq('application_id',id).order('created_at'),
      supabase.from('candidate_interview_reviews').select('*,employees(full_name_ar,job_title)').eq('application_id',id).order('interviewed_at'),
      supabase.from('employees').select('id,full_name_ar,job_title,department').eq('status','active').order('full_name_ar'),
      supabase.from('candidate_documents').select('*').eq('application_id',id).order('created_at'),
      supabase.from('vacancy_requirements').select('*').eq('vacancy_id',(await supabase.from('candidate_applications').select('vacancy_id').eq('id',id).single()).data?.vacancy_id||'00000000-0000-0000-0000-000000000000').order('sort_order')
    ]);
    if(a.error) setErr(a.error.message);
    setApp(a.data); setAnswers(b.data||[]); setRecs(c.data||[]); setInterviews(d.data||[]); setEmployees(e.data||[]); setDocs(f.data||[]); setReqs(g.data||[]);
  },[id]);
  useEffect(()=>{load();},[load]);
  const flash=m=>{setSaved(m);setTimeout(()=>setSaved(''),1500)};
  async function patchApp(fields){setApp({...app,...fields});const {error}=await supabase.from('candidate_applications').update({...fields,updated_at:new Date().toISOString()}).eq('id',id);if(error)setErr(error.message);else flash('حُفظ');}
  async function scoreAnswer(aid,val){setAnswers(answers.map(a=>a.id===aid?{...a,score:val}:a));await supabase.from('candidate_application_answers').update({score:n(val)}).eq('id',aid);}
  async function calculateQuestionnaire(){
    const map=Object.fromEntries(reqs.map(r=>[r.id,r])); let total=0,weighted=0;
    answers.forEach(a=>{const w=Number(map[a.requirement_id]?.weight||0),s=Number(a.score||0);if(w>0&&a.score!=null){total+=w;weighted+=w*s;}});
    const q=total?Math.round((weighted/total)*100)/100:null;
    const {error}=await supabase.from('candidate_applications').update({questionnaire_score:q,updated_at:new Date().toISOString()}).eq('id',id);if(error){setErr(error.message);return;}
    await supabase.rpc('refresh_candidate_application_score',{p_application:id}); flash('أعيد حساب تقييم الاستبيان والنتيجة النهائية'); load();
  }
  async function addRec(e){e.preventDefault();const {error}=await supabase.from('candidate_recommendations').insert({application_id:id,...rec,recommender_employee_id:rec.recommender_employee_id||null,known_months:n(rec.known_months),work_quality:n(rec.work_quality),discipline:n(rec.discipline),reliability:n(rec.reliability),safety:n(rec.safety)});if(error){setErr(error.message);return;}setRec({recommender_employee_id:'',professional_context:'',known_months:'',work_quality:5,discipline:5,reliability:5,safety:5,recommendation_level:'recommend',comments:''});load();}
  async function addInterview(e){e.preventDefault();const vals=[iv.technical_score,iv.practical_score,iv.communication_score,iv.work_environment_score].map(n).filter(x=>x!=null);if(!vals.length){setErr('أدخل درجة واحدة على الأقل للمقابلة');return;}const overall=Math.round((vals.reduce((s,x)=>s+x,0)/vals.length)*100)/100;const {error}=await supabase.from('candidate_interview_reviews').insert({application_id:id,...iv,interviewer_employee_id:iv.interviewer_employee_id||null,technical_score:n(iv.technical_score),practical_score:n(iv.practical_score),communication_score:n(iv.communication_score),work_environment_score:n(iv.work_environment_score),overall_score:overall});if(error){setErr(error.message);return;}await supabase.from('candidate_applications').update({status:'interview'}).eq('id',id);await supabase.rpc('refresh_candidate_application_score',{p_application:id});setIv({interviewer_employee_id:'',technical_score:'',practical_score:'',communication_score:'',work_environment_score:'',recommendation:'recommend',notes:''});load();}
  async function addTalent(){const until=new Date();until.setDate(until.getDate()+Number(app.job_vacancies?.talent_pool_days||90));const {error}=await supabase.from('candidates').update({talent_pool_until:until.toISOString().slice(0,10),usage_restricted:false}).eq('id',app.candidate_id);if(error)setErr(error.message);else{flash(`أضيف إلى بنك المواهب حتى ${dateAr(until)}`);load();}}
  async function uploadDoc(e){const file=e.target.files?.[0];if(!file)return;setUploading(true);const safe=file.name.replace(/[^a-zA-Z0-9._-]+/g,'_');const path=`${app.candidate_id}/${id}/${Date.now()}-${safe}`;const up=await supabase.storage.from('recruitment-docs').upload(path,file,{upsert:false});if(up.error){setErr(up.error.message);setUploading(false);return;}const ins=await supabase.from('candidate_documents').insert({candidate_id:app.candidate_id,application_id:id,document_type:'مرفق مرشح',file_path:path});if(ins.error)setErr(ins.error.message);else flash('رُفع المرفق');setUploading(false);load();}
  async function openDoc(path){const {data,error}=await supabase.storage.from('recruitment-docs').createSignedUrl(path,120);if(error)setErr(error.message);else window.open(data.signedUrl,'_blank');}
  if(!app)return <div className="empty">جارٍ تحميل ملف المرشح…</div>;
  const c=app.candidates||{},v=app.job_vacancies||{};
  const daysLeft=c.id_expiry?Math.ceil((new Date(c.id_expiry)-new Date())/86400000):null;
  return <>
    <div className="page-head"><div><h1>{c.full_name_ar}</h1><p>{v.title_ar} — {STATUS[app.status]||app.status}</p></div><div className="rowsplit"><Link className="btn ghost" href={`/dashboard/recruitment/${v.id}`}>الشاغر</Link><Link className="btn ghost" href="/dashboard/recruitment">التوظيف</Link></div></div>
    {err&&<div className="msg err" style={{marginBottom:12}}>{err}</div>}{saved&&<div className="msg ok" style={{marginBottom:12}}>{saved}</div>}
    <div className="grid k4" style={{marginBottom:16}}>
      <div className="card"><h3>تقييم الاستبيان</h3><div className="big">{app.questionnaire_score??'—'}</div><div className="foot">وزنه {v.questionnaire_weight}%</div></div>
      <div className="card"><h3>تقييم المقابلة</h3><div className="big">{app.interview_score??'—'}</div><div className="foot">وزنه {v.interview_weight}%</div></div>
      <div className="card"><h3>النتيجة النهائية</h3><div className="big">{app.final_score??'—'}</div><div className="foot">مؤشر مساعد وليس قراراً آلياً</div></div>
      <div className="card"><h3>صلاحية الهوية / الإقامة</h3><div className="big" style={{fontSize:22}}>{daysLeft==null?'—':daysLeft>=0?`${daysLeft} يوم`:'منتهية'}</div><div className="foot">{dateAr(c.id_expiry)}</div></div>
    </div>

    <div className="section" style={{marginTop:0,padding:18}}><header style={{margin:'-18px -18px 16px'}}><h2>بيانات المرشح والقرار الحالي</h2></header>
      <div className="form-grid">
        <div className="field"><label>الجنسية</label><input disabled value={c.nationality||'—'}/></div><div className="field"><label>رقم الهوية / الإقامة</label><input disabled dir="ltr" value={c.id_number||'—'}/></div><div className="field"><label>انتهاء الهوية / الإقامة</label><input disabled value={dateAr(c.id_expiry)}/></div>
        <div className="field"><label>الجوال</label><input disabled dir="ltr" value={c.mobile||'—'}/></div><div className="field"><label>البريد</label><input disabled dir="ltr" value={c.email||'—'}/></div><div className="field"><label>الراتب المتوقع</label><input disabled value={app.salary_expectation!=null?money(app.salary_expectation):'—'}/></div>
        <div className="field"><label>حالة الطلب</label><select value={app.status} onChange={e=>patchApp({status:e.target.value})}>{Object.entries(STATUS).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></div>
        <div className="field span2"><label>سبب تجاوز توصية البرنامج عند الحاجة</label><input value={app.hr_override_reason||''} onChange={e=>setApp({...app,hr_override_reason:e.target.value})} onBlur={e=>patchApp({hr_override:!!e.target.value,hr_override_reason:e.target.value||null})} placeholder="يُكتب فقط إذا قررت HR المتابعة رغم نتيجة أو شرط يستحق المراجعة"/></div>
      </div>
      <div className="rowsplit" style={{marginTop:12}}><button className="btn ghost" onClick={addTalent}>إضافة لبنك المواهب {v.talent_pool_days||90} يوم</button>{app.has_eliminating_issue&&<span style={{fontSize:13,color:'var(--warn)',fontWeight:600}}>يوجد شرط إقصائي لم يستوفَ آلياً — القرار النهائي بعد مراجعة HR</span>}</div>
    </div>

    <div className="section"><header><h2>إجابات الاستبيان وتقييمها</h2><button className="btn" style={{padding:'4px 10px',fontSize:12}} onClick={calculateQuestionnaire}>إعادة حساب الدرجة</button></header><div style={{overflowX:'auto'}}><table><thead><tr><th>السؤال</th><th>الإجابة</th><th>نوع الشرط</th><th className="num">الوزن</th><th className="num">تقييم HR /100</th></tr></thead><tbody>
      {answers.map(a=>{const r=reqs.find(x=>x.id===a.requirement_id);return <tr key={a.id}><td>{a.question_snapshot}</td><td>{a.answer_text||'—'}{a.is_eliminating_hit&&<div style={{fontSize:11.5,color:'var(--warn)'}}>لا يطابق الإجابة الإقصائية المحددة</div>}</td><td>{r?.criterion_type||'—'}</td><td className="num">{r?.weight??0}</td><td><input type="number" min="0" max="100" value={a.score??''} onChange={e=>scoreAnswer(a.id,e.target.value)} style={{width:82}}/></td></tr>})}
      {!answers.length&&<tr><td colSpan="5"><div className="empty">لا توجد إجابات مسجلة.</div></td></tr>}
    </tbody></table></div></div>

    <div className="section"><header><h2>التوصيات الداخلية</h2><span>{recs.length} توصية</span></header><div style={{padding:16}}>
      {recs.map(x=><div key={x.id} style={{borderBottom:'1px solid var(--hair)',padding:'10px 0'}}><div style={{fontWeight:600}}>{x.employees?.full_name_ar||'موصٍ داخلي'} — {REC[x.recommendation_level]||x.recommendation_level}</div><div style={{fontSize:12.5,color:'var(--ink-soft)',marginTop:3}}>{x.professional_context||'—'} · جودة {x.work_quality||'—'}/5 · انضباط {x.discipline||'—'}/5 · اعتمادية {x.reliability||'—'}/5 · سلامة {x.safety||'—'}/5</div>{x.comments&&<div style={{marginTop:5}}>{x.comments}</div>}</div>)}
      <form onSubmit={addRec} style={{marginTop:14}}><div className="form-grid"><div className="field"><label>الموصي</label><select value={rec.recommender_employee_id} onChange={e=>setRec({...rec,recommender_employee_id:e.target.value})}><option value="">اختر…</option>{employees.map(e=><option key={e.id} value={e.id}>{e.full_name_ar}</option>)}</select></div><div className="field span2"><label>سياق المعرفة المهنية</label><input value={rec.professional_context} onChange={e=>setRec({...rec,professional_context:e.target.value})} placeholder="مثال: عمل معه في مشروع لمدة سنتين"/></div><div className="field"><label>مدة المعرفة بالأشهر</label><input type="number" min="0" value={rec.known_months} onChange={e=>setRec({...rec,known_months:e.target.value})}/></div><div className="field"><label>جودة العمل /5</label><input type="number" min="1" max="5" value={rec.work_quality} onChange={e=>setRec({...rec,work_quality:e.target.value})}/></div><div className="field"><label>الانضباط /5</label><input type="number" min="1" max="5" value={rec.discipline} onChange={e=>setRec({...rec,discipline:e.target.value})}/></div><div className="field"><label>الاعتمادية /5</label><input type="number" min="1" max="5" value={rec.reliability} onChange={e=>setRec({...rec,reliability:e.target.value})}/></div><div className="field"><label>السلامة /5</label><input type="number" min="1" max="5" value={rec.safety} onChange={e=>setRec({...rec,safety:e.target.value})}/></div><div className="field"><label>التوصية</label><select value={rec.recommendation_level} onChange={e=>setRec({...rec,recommendation_level:e.target.value})}>{Object.entries(REC).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></div><div className="field span2"><label>ملاحظات</label><input value={rec.comments} onChange={e=>setRec({...rec,comments:e.target.value})}/></div></div><button className="btn" style={{marginTop:10}}>إضافة التوصية</button></form>
    </div></div>

    <div className="section"><header><h2>المقابلات والاختبار الفني</h2><span>{interviews.length} تقييم</span></header><div style={{padding:16}}>
      {interviews.map(x=><div key={x.id} style={{borderBottom:'1px solid var(--hair)',padding:'10px 0'}}><div style={{fontWeight:600}}>{x.employees?.full_name_ar||'المقابل'} — {x.overall_score}/100 — {REC[x.recommendation]||x.recommendation}</div><div style={{fontSize:12.5,color:'var(--ink-soft)',marginTop:3}}>فني {x.technical_score??'—'} · عملي {x.practical_score??'—'} · تواصل {x.communication_score??'—'} · بيئة العمل {x.work_environment_score??'—'}</div>{x.notes&&<div style={{marginTop:5}}>{x.notes}</div>}</div>)}
      <form onSubmit={addInterview} style={{marginTop:14}}><div className="form-grid"><div className="field"><label>المقابل</label><select value={iv.interviewer_employee_id} onChange={e=>setIv({...iv,interviewer_employee_id:e.target.value})}><option value="">اختر…</option>{employees.map(e=><option key={e.id} value={e.id}>{e.full_name_ar}</option>)}</select></div><div className="field"><label>فني /100</label><input type="number" min="0" max="100" value={iv.technical_score} onChange={e=>setIv({...iv,technical_score:e.target.value})}/></div><div className="field"><label>اختبار عملي /100</label><input type="number" min="0" max="100" value={iv.practical_score} onChange={e=>setIv({...iv,practical_score:e.target.value})}/></div><div className="field"><label>التواصل /100</label><input type="number" min="0" max="100" value={iv.communication_score} onChange={e=>setIv({...iv,communication_score:e.target.value})}/></div><div className="field"><label>ملاءمة بيئة العمل /100</label><input type="number" min="0" max="100" value={iv.work_environment_score} onChange={e=>setIv({...iv,work_environment_score:e.target.value})}/></div><div className="field"><label>التوصية</label><select value={iv.recommendation} onChange={e=>setIv({...iv,recommendation:e.target.value})}>{Object.entries(REC).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></div><div className="field span2"><label>ملاحظات المقابلة</label><input value={iv.notes} onChange={e=>setIv({...iv,notes:e.target.value})}/></div></div><button className="btn" style={{marginTop:10}}>حفظ تقييم المقابلة</button></form>
    </div></div>

    <div className="section"><header><h2>المرفقات والتحقق</h2><label className="btn ghost" style={{padding:'4px 10px',fontSize:12,cursor:'pointer'}}>{uploading?'جارٍ الرفع…':'رفع مرفق'}<input type="file" hidden onChange={uploadDoc}/></label></header><div style={{padding:16}}>{docs.map(d=><div key={d.id} className="rowsplit" style={{borderBottom:'1px solid var(--hair)',padding:'8px 0'}}><span>{d.document_type} {d.document_number?`— ${d.document_number}`:''}</span><span className="spacer"/><span style={{fontSize:12,color:'var(--ink-soft)'}}>{d.verification_status}</span>{d.file_path&&<button className="btn ghost" style={{padding:'3px 8px',fontSize:12}} onClick={()=>openDoc(d.file_path)}>فتح</button>}</div>)}{!docs.length&&<div className="empty">لم تُرفع مستندات بعد.</div>}</div></div>
  </>;
}
