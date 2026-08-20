'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import styles from './movements.module.css';

const money=(n)=>Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const iso=(d)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function moveDate(value,days){const [y,m,d]=String(value).split('-').map(Number);const n=new Date(y,m-1,d);n.setDate(n.getDate()+days);return iso(n)}
function dateLabel(value){const [y,m,d]=String(value).split('-').map(Number);return new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(y,m-1,d))}
const EMPTY_SUMMARY={attendance:0,full:0,half:0,absent:0,outputs:0,expenses:0,custody:0,advances:0,payments:0};

export default function MovementsPage(){
  const {id:projectId}=useParams();
  const dateKey=`arkan.project.ops.date.${projectId}`;
  const [date,setDate]=useState(iso(new Date()));
  const [rows,setRows]=useState([]);
  const [summary,setSummary]=useState(EMPTY_SUMMARY);
  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState('');
  const [filter,setFilter]=useState('all');

  useEffect(()=>{if(typeof window==='undefined')return;const saved=localStorage.getItem(dateKey);if(saved)setDate(saved)},[dateKey]);
  useEffect(()=>{if(typeof window!=='undefined')localStorage.setItem(dateKey,date)},[date,dateKey]);

  const load=useCallback(async()=>{
    if(!projectId||!date)return;
    setLoading(true);
    setErr('');
    setRows([]);
    setSummary(EMPTY_SUMMARY);
    try{
      const {data,error}=await supabase.rpc('fn_project_daily_ledger',{
        p_project_id:projectId,
        p_date:date,
      });
      if(error)throw error;
      const payload=data||{};
      const nextRows=Array.isArray(payload.rows)?payload.rows.map(row=>({
        ...row,
        value: row.valueText || (row.amount!==null && row.amount!==undefined ? `${money(row.amount)} ر.س` : null),
      })):[];
      setRows(nextRows);
      setSummary({...EMPTY_SUMMARY,...(payload.summary||{})});
    }catch(e){
      setErr('تعذر تحميل حركات اليوم: '+(e?.message||e));
    }finally{
      setLoading(false);
    }
  },[projectId,date]);

  useEffect(()=>{load()},[load]);

  const visible=useMemo(()=>filter==='all'?rows:rows.filter(x=>x.type===filter),[rows,filter]);
  const filters=[['all','الكل'],['attendance','الحضور'],['output','الإنجاز'],['expense','المصروفات'],['custody','العهدة'],['advance','السلف'],['payment','الدفعات']];

  return <div className={styles.root} dir="rtl">
    <header className={styles.context}>
      <div><span>DAILY LEDGER</span><h2>حركات اليوم</h2><p>صورة المشروع كاملة في التاريخ المختار.</p></div>
      <div className={styles.dateNav}><button onClick={()=>setDate(d=>moveDate(d,1))}>←</button><div><strong>{dateLabel(date)}</strong><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></div><button onClick={()=>setDate(d=>moveDate(d,-1))}>→</button></div>
      <button className={styles.today} onClick={()=>setDate(iso(new Date()))}>اليوم</button>
    </header>

    {err&&<div className={styles.error}>{err}</div>}

    <section className={styles.summary}>
      <div><span>الحضور</span><strong>{summary.attendance}</strong><small>{summary.full} كامل · {summary.half} نصف · {summary.absent} غياب</small></div>
      <div><span>حركات الإنجاز</span><strong>{summary.outputs}</strong><small>حركة كمية</small></div>
      <div><span>مصروفات مباشرة</span><strong>{money(summary.expenses)}</strong><small>ر.س</small></div>
      <div><span>صرف من العهدة</span><strong>{money(summary.custody)}</strong><small>ر.س</small></div>
      <div><span>سلف</span><strong>{money(summary.advances)}</strong><small>ر.س</small></div>
      <div><span>دفعات</span><strong>{money(summary.payments)}</strong><small>ر.س</small></div>
    </section>

    <div className={styles.filters}>{filters.map(([k,v])=><button key={k} className={filter===k?styles.on:''} onClick={()=>setFilter(k)}>{v}</button>)}</div>

    {loading?
      <div className={styles.empty}>جارٍ تجميع حركة اليوم…</div>
      :visible.length===0?
        <div className={styles.empty}>لا توجد حركات ضمن هذا التصنيف في اليوم المختار.</div>
        :<div className={styles.ledger}>{visible.map(row=><div className={styles.row} key={row.id}>
          <span className={`${styles.marker} ${styles[`m_${row.type}`]||''}`}></span>
          <div className={styles.copy}><strong>{row.title}</strong><small>{row.detail||'—'}</small></div>
          {row.value&&<b>{row.value}</b>}
          <time>{row.time?new Date(row.time).toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'}):'—'}</time>
        </div>)}</div>}
  </div>;
}
