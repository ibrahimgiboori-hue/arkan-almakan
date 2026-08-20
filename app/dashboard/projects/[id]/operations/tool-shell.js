'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { OutputPanel, ExpensePanel, FinancePanel, MovementsPanel } from './operation-panels';
import styles from './tool-shell.module.css';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const naturalCompare = (a='',b='') => String(a).localeCompare(String(b),'ar',{numeric:true,sensitivity:'base'});

function moveDate(value, days){
  const [y,m,d] = String(value).split('-').map(Number);
  const next = new Date(y,m-1,d);
  next.setDate(next.getDate()+days);
  return iso(next);
}

function dateLabel(value){
  if(!value)return '—';
  const [y,m,d] = String(value).split('-').map(Number);
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(y,m-1,d));
}

export default function OperationToolShell({ type }){
  const { id:projectId } = useParams();
  const dateKey = `arkan.project.ops.date.${projectId}`;
  const contractorKey = `arkan.project.ops.contractor.${projectId}`;
  const [date,setDate] = useState(iso(new Date()));
  const [contractors,setContractors] = useState([]);
  const [contractorId,setContractorId] = useState('');
  const [loading,setLoading] = useState(true);
  const [err,setErr] = useState('');
  const [pendingSync,setPendingSync] = useState(0);

  useEffect(()=>{
    if(typeof window==='undefined')return;
    const savedDate = localStorage.getItem(dateKey);
    if(savedDate)setDate(savedDate);
  },[dateKey]);

  useEffect(()=>{
    if(typeof window!=='undefined')localStorage.setItem(dateKey,date);
  },[date,dateKey]);

  useEffect(()=>{
    let active=true;
    (async()=>{
      if(!projectId||!date)return;
      setLoading(true);setErr('');
      try{
        const linkQ = await supabase.from('project_contractors')
          .select('contractor_id,basis,start_date,end_date,is_active')
          .eq('project_id',projectId)
          .eq('is_active',true)
          .lte('start_date',date)
          .or(`end_date.is.null,end_date.gte.${date}`);
        if(linkQ.error)throw linkQ.error;
        const ids=[...new Set((linkQ.data||[]).map(x=>x.contractor_id).filter(Boolean))];
        const contractorQ = ids.length
          ? await supabase.from('contractors').select('id,name_ar,operation_alias,contractor_no').in('id',ids)
          : {data:[],error:null};
        if(contractorQ.error)throw contractorQ.error;
        if(!active)return;
        const rows=(contractorQ.data||[]).map(c=>({
          ...c,
          project_basis:(linkQ.data||[]).find(x=>x.contractor_id===c.id)?.basis||null,
        })).sort((a,b)=>naturalCompare(a.name_ar,b.name_ar));
        setContractors(rows);
        const saved=typeof window!=='undefined'?localStorage.getItem(contractorKey):'';
        setContractorId(current=>{
          if(current&&rows.some(x=>x.id===current))return current;
          if(saved&&rows.some(x=>x.id===saved))return saved;
          return rows[0]?.id||'';
        });
      }catch(e){if(active)setErr('تعذر تحميل سياق التشغيل: '+(e.message||e));}
      if(active)setLoading(false);
    })();
    return()=>{active=false};
  },[projectId,date,contractorKey]);

  useEffect(()=>{
    if(typeof window!=='undefined'&&contractorId)localStorage.setItem(contractorKey,contractorId);
  },[contractorId,contractorKey]);

  const contractor = useMemo(()=>contractors.find(x=>x.id===contractorId)||null,[contractors,contractorId]);

  const title = {
    output:'الإنجاز اليومي',
    expenses:'المصروفات والعهد',
    finance:'السلف والدفعات',
    movements:'حركات اليوم',
  }[type]||'التشغيل';

  return <div className={styles.root} dir="rtl">
    <section className={styles.contextBar}>
      <div className={styles.mode}><span>التشغيل اليومي</span><strong>{title}</strong></div>
      <div className={styles.dateNav}>
        <button type="button" onClick={()=>setDate(d=>moveDate(d,1))} aria-label="اليوم التالي">←</button>
        <div><strong>{dateLabel(date)}</strong><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
        <button type="button" onClick={()=>setDate(d=>moveDate(d,-1))} aria-label="اليوم السابق">→</button>
      </div>
      <button className={styles.today} type="button" onClick={()=>setDate(iso(new Date()))}>اليوم</button>
      <div className={styles.contractorSelect}><span>المقاول</span><select value={contractorId} onChange={e=>setContractorId(e.target.value)}>{contractors.map(c=><option key={c.id} value={c.id}>{c.operation_alias||c.name_ar}</option>)}</select></div>
      <div className={styles.contextMeta}><strong>{contractor?.name_ar||'—'}</strong><span>{contractor?.project_basis==='piecework'?'مقطوعية / بالوحدة':contractor?.project_basis==='salary'?'راتب':'يومية'}</span></div>
    </section>

    {err&&<div className={styles.error}>{err}</div>}
    {pendingSync>0&&<div className={styles.pending}>{pendingSync} حركة محفوظة على الجهاز وتنتظر المزامنة.</div>}

    {loading?<div className={styles.empty}>جارٍ فتح مساحة التشغيل…</div>:!contractor?<div className={styles.empty}>لا يوجد مقاول مرتبط بالمشروع في هذا التاريخ.</div>:<>
      {type==='output'&&<OutputPanel projectId={projectId} date={date} contractor={contractor} onQueueChange={setPendingSync}/>} 
      {type==='expenses'&&<ExpensePanel projectId={projectId} date={date} contractor={contractor} onQueueChange={setPendingSync}/>} 
      {type==='finance'&&<FinancePanel projectId={projectId} date={date} contractor={contractor} onQueueChange={setPendingSync}/>} 
      {type==='movements'&&<MovementsPanel projectId={projectId} date={date} contractor={contractor}/>} 
    </>}
  </div>;
}
