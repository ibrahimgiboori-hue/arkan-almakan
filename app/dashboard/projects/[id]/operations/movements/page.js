'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { todayIsoInRiyadh } from '@/lib/format';
import { moveOperationalDate } from '@/lib/project-operation-context.mjs';
import { useProjectOperationContext } from '@/lib/use-project-operation-context';
import { projectDailyLedgerService } from '@/lib/application/project-daily-ledger-service';
import {
  PROJECT_DAILY_LEDGER_EMPTY_SUMMARY,
  PROJECT_DAILY_LEDGER_FILTERS,
  filterProjectDailyLedgerRows,
} from '@/lib/project-daily-ledger.mjs';
import styles from './movements.module.css';

const money=(n)=>Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
function dateLabel(value){const [y,m,d]=String(value).split('-').map(Number);return new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(y,m-1,d))}

export default function MovementsPage(){
  const {id:projectId}=useParams();
  const {date,ready:contextReady,setDate}=useProjectOperationContext(projectId);
  const [rows,setRows]=useState([]);
  const [summary,setSummary]=useState(PROJECT_DAILY_LEDGER_EMPTY_SUMMARY);
  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState('');
  const [filter,setFilter]=useState('all');

  const load=useCallback(async()=>{
    if(!contextReady||!projectId||!date)return;
    setLoading(true);setErr('');setRows([]);setSummary(PROJECT_DAILY_LEDGER_EMPTY_SUMMARY);
    try{
      const ledger=await projectDailyLedgerService.load({projectId,date});
      setRows(ledger.rows);setSummary(ledger.summary);
    }catch(e){setErr('تعذر تحميل حركات اليوم: '+(e?.message||e));}
    finally{setLoading(false);}
  },[contextReady,projectId,date]);

  useEffect(()=>{load()},[load]);
  const visible=useMemo(()=>filterProjectDailyLedgerRows(rows,filter),[rows,filter]);

  if(!contextReady)return <div className={styles.empty}>جارٍ فتح سياق المشروع…</div>;

  return <div className={styles.root} dir="rtl">
    <header className={styles.context}>
      <div><span>DAILY LEDGER</span><h2>حركات اليوم</h2><p>الحضور والإنجاز والحركات المالية المسجلة في التاريخ المختار.</p></div>
      <div className={styles.dateNav}><button type="button" onClick={()=>setDate(d=>moveOperationalDate(d,1))} aria-label="اليوم التالي">←</button><div><strong>{dateLabel(date)}</strong><input aria-label="تاريخ حركات اليوم" type="date" value={date} onChange={e=>setDate(e.target.value)}/></div><button type="button" onClick={()=>setDate(d=>moveOperationalDate(d,-1))} aria-label="اليوم السابق">→</button></div>
      <button type="button" className={styles.today} onClick={()=>setDate(todayIsoInRiyadh())}>اليوم</button>
    </header>

    {err&&<div className={styles.error} role="alert">{err}</div>}

    <section className={styles.summary} aria-label="ملخص حركات اليوم">
      <div><span>الحضور</span><strong>{summary.attendance}</strong><small>{summary.full} كامل · {summary.half} نصف · {summary.absent} غياب</small></div>
      <div><span>الإنجاز</span><strong>{summary.outputs}</strong><small>حركة مسجلة</small></div>
      <div><span>مصروفات التشغيل</span><strong>{money(summary.expenses)}</strong><small>ر.س</small></div>
      <div><span>صرف من العهدة</span><strong>{money(summary.custody)}</strong><small>ر.س</small></div>
      <div><span>سلف المقاولين</span><strong>{money(summary.advances)}</strong><small>ر.س</small></div>
      <div><span>دفعات المقاولين</span><strong>{money(summary.payments)}</strong><small>ر.س</small></div>
    </section>

    <div className={styles.filters} aria-label="تصفية حركات اليوم">{PROJECT_DAILY_LEDGER_FILTERS.map(([k,v])=><button type="button" key={k} className={filter===k?styles.on:''} aria-pressed={filter===k} onClick={()=>setFilter(k)}>{v}</button>)}</div>

    {loading?
      <div className={styles.empty}>جارٍ تجميع حركات اليوم…</div>
      :visible.length===0?
        <div className={styles.empty}>{filter==='all'?'لا توجد حركات مسجلة في التاريخ المختار.':'لا توجد حركات ضمن هذا التصنيف في التاريخ المختار.'}</div>
        :<div className={styles.ledger}>{visible.map(row=><div className={styles.row} key={row.id}>
          <span className={`${styles.marker} ${styles[`m_${row.type}`]||''}`}></span>
          <div className={styles.copy}><strong>{row.title}</strong><small title={row.detail||''}>{row.detail||'—'}</small></div>
          {row.value&&<b>{row.value}</b>}
          <time>{row.time?new Date(row.time).toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'}):'—'}</time>
        </div>)}</div>}
  </div>;
}
