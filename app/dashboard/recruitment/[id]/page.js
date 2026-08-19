'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { money } from '@/lib/format';

const VSTATUS={draft:'مسودة',open:'مفتوح للتقديم',paused:'موقوف مؤقتاً',filled:'اكتمل العدد',closed:'مغلق'};
const CRIT={eliminating:'إقصائي مباشر',high:'مهم بوزن مرتفع',normal:'عادي',preferred:'ميزة إضافية'};
const ATYPE={text:'نص',number:'رقم',yes_no:'نعم / لا',single:'اختيار واحد',date:'تاريخ',license:'ترخيص'};

export default function VacancyEditor(){
  const {id}=useParams();
  const [v,setV]=useState(null); const [reqs,setReqs]=useState([]); const [apps,setApps]=useState([]);
  const [err,setErr]=useState(''); const [saved,setSaved]=useState('');
  const [r,setR]=useState({label:'',question_text:'',answer_type:'text',criterion_type:'normal',expected_value:'',weight:0,is_license:false,license_type:''});
  const load=useCallback(async()=>{
    const [a,b,c]=await Promise.all([
      supabase.from('job_vacancies').select('*').eq('id',id).maybeSingle(),
      supabase.from('vacancy_requirements').select('*').eq('vacancy_id',id).order('sort_order'),
      supabase.from('candidate_applications').select('id,status,final_score,questionnaire_score,interview_score,candidates(full_name_ar,nationality)').eq('vacancy_id',id).order('applied_at',{ascending:false})
    ]);
    if(a.error||b.error||c.error) setErr(a.error?.message||b.error?.message||c.error?.message);
    setV(a.data); setReqs(b.data||[]); setApps(c.data||[]);
  },[id]);
  useEffect(()=>{load();},[load]);
  const flash=m=>{setSaved(m);setTimeout(()=>setSaved(''),1500)};
  async function patch(fields){ setV({...v,...fields}); const {error}=await supabase.from('job_vacancies').update({...fields,updated_at:new Date().toISOString()}).eq('id',id); if(error)setErr(error.message);else flash('حُفظ'); }
  async function addReq(e){e.preventDefault(); const {error}=await supabase.from('vacancy_requirements').insert({vacancy_id:id,...r,weight:Number(r.weight||0),expected_value:r.expected_value||null,license_type:r.license_type||null,sort_order:reqs.length+1}); if(error){setErr(error.message);return;} setR({label:'',question_text:'',answer_type:'text',criterion_type:'normal',expected_value:'',weight:0,is_license:false,license_type:''}); load();}
  async function delReq(rid){if(!confirm('حذف هذا الشرط من الشاغر؟'))return; const {error}=await supabase.from('vacancy_requirements').delete().eq('id',rid); if(error)setErr(error.message);else load();}
  async function updateReq(rid,fields){setReqs(reqs.map(x=>x.id===rid?{...x,...fields}:x)); const {error}=await supabase.from('vacancy_requirements').update(fields).eq('id',rid); if(error)setErr(error.message);}
  async function copyLink(){const url=`${window.location.origin}/jobs/${v.public_token}`; await navigator.clipboard.writeText(url); flash('تم نسخ رابط التقديم');}
  if(!v)return <div className="empty">جارٍ تحميل الشاغر…</div>;
  const weightSum=reqs.reduce((s,x)=>s+Number(x.weight||0),0);
  return <>
    <div className="page-head"><div><h1>{v.title_ar}</h1><p>{v.vacancy_no||'شاغر وظيفي'} — {VSTATUS[v.status]}</p></div><div className="rowsplit"><Link className="btn ghost" href="/dashboard/recruitment">العودة</Link>{v.status==='open'&&<button className="btn" onClick={copyLink}>نسخ رابط التقديم</button>}</div></div>
    {err&&<div className="msg err" style={{marginBottom:12}}>{err}</div>}{saved&&<div className="msg ok" style={{marginBottom:12}}>{saved}</div>}

    <div className="section" style={{marginTop:0,padding:18}}>
      <header style={{margin:'-18px -18px 16px'}}><h2>بطاقة الشاغر</h2></header>
      <div className="form-grid">
        <div className="field span2"><label>المسمى الوظيفي</label><input value={v.title_ar||''} onChange={e=>setV({...v,title_ar:e.target.value})} onBlur={e=>patch({title_ar:e.target.value})}/></div>
        <div className="field"><label>الإدارة / القسم</label><input value={v.department||''} onChange={e=>setV({...v,department:e.target.value})} onBlur={e=>patch({department:e.target.value||null})}/></div>
        <div className="field"><label>العدد المطلوب</label><input type="number" min="1" value={v.headcount} onChange={e=>patch({headcount:Number(e.target.value||1)})}/></div>
        <div className="field"><label>الراتب من</label><input type="number" value={v.salary_min??''} onChange={e=>setV({...v,salary_min:e.target.value})} onBlur={e=>patch({salary_min:e.target.value===''?null:Number(e.target.value)})}/></div>
        <div className="field"><label>الراتب إلى</label><input type="number" value={v.salary_max??''} onChange={e=>setV({...v,salary_max:e.target.value})} onBlur={e=>patch({salary_max:e.target.value===''?null:Number(e.target.value)})}/></div>
        <div className="field"><label>الحالة</label><select value={v.status} onChange={e=>patch({status:e.target.value,closed_at:['filled','closed'].includes(e.target.value)?new Date().toISOString():null})}>{Object.entries(VSTATUS).map(([k,x])=><option key={k} value={k}>{x}</option>)}</select></div>
        <div className="field"><label>وزن الاستبيان %</label><input type="number" min="0" max="100" value={v.questionnaire_weight} onChange={e=>{const q=Number(e.target.value||0);patch({questionnaire_weight:q,interview_weight:100-q})}}/></div>
        <div className="field"><label>وزن المقابلة %</label><input disabled value={v.interview_weight}/><span className="hint">يتكامل تلقائياً إلى 100%</span></div>
        <div className="field"><label>مهلة الرد على المرشح</label><input type="number" min="1" max="168" value={v.response_sla_hours} onChange={e=>patch({response_sla_hours:Number(e.target.value||72)})}/><span className="hint">بالساعات — الافتراضي 72</span></div>
        <div className="field"><label>مدة بنك المواهب</label><input type="number" min="1" max="365" value={v.talent_pool_days} onChange={e=>patch({talent_pool_days:Number(e.target.value||90)})}/><span className="hint">بالأيام — الافتراضي 90</span></div>
        <div className="field span3"><label>المهام الأساسية</label><textarea rows="4" value={v.duties||''} onChange={e=>setV({...v,duties:e.target.value})} onBlur={e=>patch({duties:e.target.value||null})}/></div>
      </div>
      {v.status==='draft'&&<div className="rowsplit" style={{marginTop:14}}><button className="btn" onClick={()=>patch({status:'open'})}>فتح الشاغر للتقديم</button><span className="hint">بعد الفتح يمكن نشر رابط التقديم في الإعلان أو المجموعة.</span></div>}
    </div>

    <div className="section">
      <header><h2>شروط وأسئلة الشاغر</h2><span style={{fontSize:12.5}}>مجموع الأوزان: {weightSum}</span></header>
      <div style={{padding:16,overflowX:'auto'}}>
        <table><thead><tr><th>الشرط / السؤال</th><th>نوع الإجابة</th><th>أهمية الشرط</th><th className="num">الوزن</th><th>الإجابة المطلوبة</th><th>—</th></tr></thead>
        <tbody>{reqs.map(x=><tr key={x.id}>
          <td><div style={{fontWeight:600}}>{x.label}</div><div style={{fontSize:12,color:'var(--ink-soft)'}}>{x.question_text||'—'}{x.is_license&&` — ترخيص: ${x.license_type||x.label}`}</div></td>
          <td>{ATYPE[x.answer_type]||x.answer_type}</td>
          <td><select value={x.criterion_type} onChange={e=>updateReq(x.id,{criterion_type:e.target.value})}>{Object.entries(CRIT).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></td>
          <td><input type="number" min="0" max="100" value={x.weight} onChange={e=>updateReq(x.id,{weight:Number(e.target.value||0)})} style={{width:75}}/></td>
          <td>{x.expected_value||'—'}</td><td><button className="btn ghost" style={{padding:'3px 8px',fontSize:12}} onClick={()=>delReq(x.id)}>حذف</button></td>
        </tr>)}{!reqs.length&&<tr><td colSpan="6"><div className="empty">لم تُضف شروط بعد. أضف الشروط التي ستبني عليها أسئلة الاستبيان والتقييم.</div></td></tr>}</tbody></table>
      </div>
      <form onSubmit={addReq} style={{padding:'0 16px 16px'}}>
        <div className="form-grid">
          <div className="field span2"><label>اسم الشرط *</label><input required value={r.label} onChange={e=>setR({...r,label:e.target.value})} placeholder="مثال: خبرة في مشاريع المباني"/></div>
          <div className="field span2"><label>السؤال الذي يراه المرشح</label><input value={r.question_text} onChange={e=>setR({...r,question_text:e.target.value})} placeholder="مثال: كم سنة خبرة لديك في هذا المجال؟"/></div>
          <div className="field"><label>نوع الإجابة</label><select value={r.answer_type} onChange={e=>setR({...r,answer_type:e.target.value,is_license:e.target.value==='license'||r.is_license})}>{Object.entries(ATYPE).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></div>
          <div className="field"><label>أهمية الشرط</label><select value={r.criterion_type} onChange={e=>setR({...r,criterion_type:e.target.value})}>{Object.entries(CRIT).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></div>
          <div className="field"><label>الوزن</label><input type="number" min="0" max="100" value={r.weight} onChange={e=>setR({...r,weight:e.target.value})}/></div>
          <div className="field"><label>الإجابة المطلوبة</label><input value={r.expected_value} onChange={e=>setR({...r,expected_value:e.target.value})} placeholder={r.criterion_type==='eliminating'?'مثال: نعم':'اختياري'}/></div>
          <div className="field"><label>هل هو ترخيص؟</label><select value={r.is_license?'yes':'no'} onChange={e=>setR({...r,is_license:e.target.value==='yes',answer_type:e.target.value==='yes'?'license':r.answer_type})}><option value="no">لا</option><option value="yes">نعم</option></select></div>
          {r.is_license&&<div className="field"><label>نوع الترخيص</label><input value={r.license_type} onChange={e=>setR({...r,license_type:e.target.value})} placeholder="الهيئة السعودية للمهندسين مثلاً"/></div>}
        </div><button className="btn" style={{marginTop:10}}>+ إضافة الشرط</button>
      </form>
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
