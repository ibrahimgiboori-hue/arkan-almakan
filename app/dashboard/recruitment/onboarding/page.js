'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { dateAr } from '@/lib/format';

const S={pre_start:'قبل المباشرة',scheduled:'مباشرة مجدولة',started:'باشر العمل',completed:'مكتمل',cancelled:'ملغي'};
export default function OnboardingQueue(){
  const [rows,setRows]=useState([]),[alerts,setAlerts]=useState([]),[err,setErr]=useState('');
  useEffect(()=>{(async()=>{await supabase.rpc('archive_expired_talent_pool');const [o,a]=await Promise.all([
    supabase.from('candidate_onboarding').select('id,status,expected_start_date,actual_start_date,probation_end_date,work_authorization_basis,candidates(full_name_ar,nationality,mobile),job_offers(job_title_snapshot,department_snapshot)').order('created_at',{ascending:false}),
    supabase.from('v_hr_recruitment_alerts').select('*').order('due_at',{ascending:true}).limit(50)
  ]);if(o.error||a.error)setErr(o.error?.message||a.error?.message);setRows(o.data||[]);setAlerts(a.data||[]);})();},[]);
  return <><div className="page-head"><div><h1>المباشرة والتهيئة</h1><p>من قبول العقد إلى مباشرة الموظف والتقييم خلال فترة التجربة</p></div></div>{err&&<div className="msg err" style={{marginBottom:12}}>{err}</div>}
  {!!alerts.length&&<div className="section" style={{marginTop:0,marginBottom:16}}><header><h2>تنبيهات تحتاج متابعة</h2><span>{alerts.length}</span></header><div style={{padding:14}}>{alerts.slice(0,8).map((a,i)=><div key={`${a.alert_type}-${a.entity_id}-${i}`} className="rowsplit" style={{padding:'8px 0',borderBottom:'1px solid var(--hair)'}}><span>{a.title}</span><span style={{fontSize:12,color:'var(--ink-soft)'}}>{dateAr(a.due_at)}</span></div>)}</div></div>}
  <div className="section" style={{marginTop:0,overflowX:'auto'}}><table><thead><tr><th>المرشح</th><th>الوظيفة</th><th>الحالة</th><th>المباشرة المتوقعة</th><th>المباشرة الفعلية</th><th>نهاية التجربة</th><th>الأساس النظامي للعمل</th><th>الإجراء</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td style={{fontWeight:600}}>{r.candidates?.full_name_ar||'—'}</td><td>{r.job_offers?.job_title_snapshot||'—'}</td><td>{S[r.status]||r.status}</td><td>{dateAr(r.expected_start_date)}</td><td>{dateAr(r.actual_start_date)}</td><td>{dateAr(r.probation_end_date)}</td><td>{r.work_authorization_basis||'—'}</td><td><Link className="btn ghost" style={{padding:'4px 10px',fontSize:12}} href={`/dashboard/recruitment/onboarding/${r.id}`}>فتح</Link></td></tr>)}{!rows.length&&<tr><td colSpan="8"><div className="empty">لا توجد ملفات تهيئة حتى الآن. تنشأ تلقائياً بعد قبول المرشح لمسودة العقد.</div></td></tr>}</tbody></table></div></>;
}