'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { dateAr, money } from '@/lib/format';

const OSTATUS={internal_review:'تحت المراجعة الداخلية',internal_approved:'معتمد داخلياً',sent:'أُرسل للمرشح',accepted:'مقبول',declined:'اعتذر المرشح',expired:'منتهي',superseded:'مستبدل',draft:'مسودة'};
export default function RecruitmentOffers(){
  const router=useRouter();const [apps,setApps]=useState([]),[offers,setOffers]=useState([]),[err,setErr]=useState(''),[busy,setBusy]=useState('');
  const load=useCallback(async()=>{const [a,o]=await Promise.all([
    supabase.from('candidate_applications').select('id,status,final_score,salary_expectation,candidates(full_name_ar,nationality),job_vacancies(title_ar,department)').in('status',['interview','reserve','offer_review','offer_sent','offer_accepted','offer_declined']).order('updated_at',{ascending:false}),
    supabase.from('job_offers').select('id,application_id,offer_version,status,gross_salary,valid_until,created_at,candidate_name_snapshot,job_title_snapshot').neq('status','superseded').order('created_at',{ascending:false})
  ]);if(a.error||o.error)setErr(a.error?.message||o.error?.message);setApps(a.data||[]);setOffers(o.data||[]);},[]);useEffect(()=>{load();},[load]);
  async function openOffer(app){const existing=offers.find(o=>o.application_id===app.id);if(existing){router.push(`/dashboard/recruitment/applications/${app.id}/offer`);return;}setBusy(app.id);const {error}=await supabase.rpc('create_job_offer_from_application',{p_application:app.id,p_valid_days:7});setBusy('');if(error){setErr(error.message);return;}router.push(`/dashboard/recruitment/applications/${app.id}/offer`);}
  return <><div className="page-head"><div><h1>العروض الوظيفية</h1><p>طابور إعداد واعتماد وإرسال عروض المرشحين</p></div><Link className="btn ghost" href="/dashboard/recruitment">التوظيف والمرشحون</Link></div>{err&&<div className="msg err" style={{marginBottom:12}}>{err}</div>}
    <div className="section" style={{marginTop:0,overflowX:'auto'}}><table><thead><tr><th>المرشح</th><th>الوظيفة</th><th className="num">تقييم الملاءمة</th><th>الراتب المتوقع</th><th>حالة العرض</th><th>الصلاحية</th><th>—</th></tr></thead><tbody>{apps.map(a=>{const o=offers.find(x=>x.application_id===a.id);return <tr key={a.id}><td style={{fontWeight:600}}>{a.candidates?.full_name_ar||'—'}</td><td>{a.job_vacancies?.title_ar||'—'}</td><td className="num">{a.final_score??'—'}</td><td>{a.salary_expectation!=null?money(a.salary_expectation):'—'}</td><td>{o?OSTATUS[o.status]||o.status:'لم ينشأ بعد'}</td><td>{o?dateAr(o.valid_until):'—'}</td><td><button className="btn" style={{padding:'4px 10px',fontSize:12}} disabled={busy===a.id} onClick={()=>openOffer(a)}>{busy===a.id?'جارٍ…':o?'فتح العرض':'إنشاء العرض'}</button></td></tr>})}{!apps.length&&<tr><td colSpan="7"><div className="empty">لا توجد معاملات وصلت إلى مرحلة العرض الوظيفي حالياً.</div></td></tr>}</tbody></table></div>
  </>;
}
