'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function ContractorPortalHome(){
  const [data,setData]=useState(null);const [error,setError]=useState('');
  useEffect(()=>{(async()=>{const {data:value,error:loadError}=await supabase.rpc('fn_portal_dashboard');if(loadError)setError(loadError.message);else setData(value);})();},[]);
  if(error)return <div className="portal-message error">{error}</div>;
  if(!data)return <div className="portal-loading">جارٍ تحميل المشاريع…</div>;
  return <>
    <section className="portal-welcome"><div><span>مرحبًا</span><h1>{data.account.displayName}</h1><p>{data.contractor.name} — اختر مشروعًا لإدخال أو استعراض التايم شيت.</p></div><Link href="/print/timesheet/blank" target="_blank">طباعة نموذج حضور فارغ</Link></section>
    <section className="portal-section"><header><h2>المشاريع المفتوحة لك</h2><span>{data.projects.length} مشروع</span></header>
      {data.projects.length?<div className="portal-projects">{data.projects.map(project=><Link key={project.id} href={`/contractor/project/${project.id}`}><b>{project.projectNo}</b><h3>{project.name}</h3><span>{project.city||'—'}</span><small>فتح التايم شيت ←</small></Link>)}</div>:<div className="portal-empty">لا يوجد مشروع مفتوح لك حاليًا. تواصل مع أركان المكان.</div>}
    </section>
  </>;
}
