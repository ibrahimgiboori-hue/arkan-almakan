'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { dateAr } from '@/lib/format';

const S={internal_review:'مراجعة داخلية',internal_approved:'معتمد داخلياً',sent:'أُرسل للمرشح',candidate_changes:'أعاد المرشح ملاحظات',accepted:'مقبول',declined:'مرفوض',superseded:'مستبدل'};
export default function ContractQueue(){
  const [rows,setRows]=useState([]),[err,setErr]=useState('');
  useEffect(()=>{(async()=>{const {data,error}=await supabase.from('employment_contract_drafts').select('id,status,draft_version,sent_at,candidate_accepted_at,candidate_comment,application_id,job_offers(candidate_name_snapshot,job_title_snapshot,department_snapshot)').order('created_at',{ascending:false}).limit(200);if(error)setErr(error.message);setRows(data||[]);})();},[]);
  return <><div className="page-head"><div><h1>مسودات عقود العمل</h1><p>المراجعة الداخلية ثم إرسال المسودة للمرشح</p></div></div>{err&&<div className="msg err" style={{marginBottom:12}}>{err}</div>}<div className="section" style={{marginTop:0,overflowX:'auto'}}><table><thead><tr><th>المرشح</th><th>الوظيفة</th><th>النسخة</th><th>الحالة</th><th>تاريخ الإرسال</th><th>قبول المرشح</th><th>الإجراء</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td style={{fontWeight:600}}>{r.job_offers?.candidate_name_snapshot||'—'}</td><td>{r.job_offers?.job_title_snapshot||'—'}</td><td className="num">{r.draft_version}</td><td>{S[r.status]||r.status}{r.status==='candidate_changes'&&r.candidate_comment&&<div style={{fontSize:11.5,color:'var(--warn)'}}>{r.candidate_comment}</div>}</td><td>{dateAr(r.sent_at)}</td><td>{dateAr(r.candidate_accepted_at)}</td><td><Link className="btn ghost" style={{padding:'4px 10px',fontSize:12}} href={`/dashboard/recruitment/contracts/${r.id}`}>فتح</Link></td></tr>)}{!rows.length&&<tr><td colSpan="7"><div className="empty">لا توجد مسودات عقود حتى الآن. تنشأ تلقائياً بعد قبول العرض الوظيفي.</div></td></tr>}</tbody></table></div></>;
}