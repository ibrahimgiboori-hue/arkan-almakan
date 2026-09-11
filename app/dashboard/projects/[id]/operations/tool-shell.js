'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { todayIsoInRiyadh } from '@/lib/format';
import { moveOperationalDate } from '@/lib/project-operation-context.mjs';
import { projectOperationContextService } from '@/lib/application/project-operation-context-service';
import { useProjectOperationContext } from '@/lib/use-project-operation-context';
import { OutputPanel, FinancePanel } from './operation-panels';
import DirectExpensePanel from './direct-expense-panel';
import styles from './tool-shell.module.css';

function dateLabel(value){
  if(!value)return '—';
  const [y,m,d] = String(value).split('-').map(Number);
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(y,m-1,d));
}

export default function OperationToolShell({ type }){
  const { id:projectId } = useParams();
  const {
    date,
    contractorId,
    ready:contextReady,
    setDate,
    setContractorId,
  } = useProjectOperationContext(projectId);
  const [contractors,setContractors] = useState([]);
  const [loading,setLoading] = useState(true);
  const [err,setErr] = useState('');
  const [pendingSync,setPendingSync] = useState(0);
  const [reportOpen,setReportOpen] = useState(false);
  const [reportFrom,setReportFrom] = useState('');
  const [reportTo,setReportTo] = useState('');

  useEffect(()=>{
    let active=true;
    (async()=>{
      if(!contextReady||!projectId||!date)return;
      setLoading(true);setErr('');
      try{
        const rows=await projectOperationContextService.loadContractors({projectId,date});
        if(!active)return;
        setContractors(rows);
        if(!contractorId||!rows.some((row)=>row.id===contractorId))setContractorId(rows[0]?.id||'');
      }catch(e){if(active)setErr('تعذر تحميل سياق التشغيل: '+(e.message||e));}
      if(active)setLoading(false);
    })();
    return()=>{active=false};
  },[contextReady,projectId,date,contractorId,setContractorId]);

  const contractor = useMemo(()=>contractors.find(x=>x.id===contractorId)||null,[contractors,contractorId]);

  const title = {
    output:'الإنجاز اليومي',
    expenses:'المصروفات',
    finance:'السلف والدفعات',
  }[type]||'التشغيل';

  function openExpenseReport(){
    setReportFrom(date);
    setReportTo(date);
    setReportOpen(true);
  }

  function printExpenseReport(){
    setErr('');
    if(!projectId||!contractorId){setErr('اختر المقاول أولاً لإنشاء تقرير المصروفات.');return;}
    if(!reportFrom||!reportTo){setErr('حدد بداية ونهاية فترة التقرير.');return;}
    if(reportTo<reportFrom){setErr('تاريخ النهاية يجب ألا يسبق تاريخ البداية.');return;}
    const params=new URLSearchParams({project:projectId,contractor:contractorId,from:reportFrom,to:reportTo});
    window.open(`/print/expenses?${params.toString()}`,'_blank','noopener,noreferrer');
    setReportOpen(false);
  }

  if(!contextReady)return <div className={styles.empty}>جارٍ فتح سياق المشروع…</div>;

  return <div className={styles.root} dir="rtl">
    <section className={styles.contextBar} data-work-context-bar="true">
      <div className={styles.mode}><span>التشغيل اليومي</span><strong>{title}</strong></div>
      <div className={styles.dateNav}>
        <button type="button" onClick={()=>setDate(d=>moveOperationalDate(d,1))} aria-label="اليوم التالي">←</button>
        <div><strong>{dateLabel(date)}</strong><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
        <button type="button" onClick={()=>setDate(d=>moveOperationalDate(d,-1))} aria-label="اليوم السابق">→</button>
      </div>
      <button className={styles.today} type="button" onClick={()=>setDate(todayIsoInRiyadh())}>اليوم</button>
      {type==='expenses'&&<button className={styles.reportButton} type="button" onClick={openExpenseReport}>طباعة المصروفات</button>}
      <div className={styles.contractorSelect}><span>المقاول</span><select value={contractorId} onChange={e=>setContractorId(e.target.value)}>{contractors.map(c=><option key={c.id} value={c.id}>{c.operation_alias||c.name_ar}</option>)}</select></div>
      <div className={styles.contextMeta}><strong>{contractor?.name_ar||'—'}</strong><span>{contractor?.project_basis==='piecework'?'مقطوعية / بالوحدة':contractor?.project_basis==='salary'?'راتب':'يومية'}</span></div>
    </section>

    {reportOpen&&<div className={styles.reportBackdrop} role="presentation" onMouseDown={()=>setReportOpen(false)}>
      <section className={styles.reportDialog} role="dialog" aria-modal="true" aria-label="فترة تقرير المصروفات" onMouseDown={e=>e.stopPropagation()}>
        <header><div><span>تقرير المصروفات</span><strong>{contractor?.operation_alias||contractor?.name_ar||'المقاول'}</strong></div><button type="button" onClick={()=>setReportOpen(false)} aria-label="إغلاق">×</button></header>
        <div className={styles.reportDates}>
          <label><span>من تاريخ</span><input type="date" value={reportFrom} onChange={e=>setReportFrom(e.target.value)}/></label>
          <label><span>إلى تاريخ</span><input type="date" value={reportTo} onChange={e=>setReportTo(e.target.value)}/></label>
        </div>
        <p>سيُنشأ التقرير من المصروفات المحفوظة فعليًا في قاعدة البيانات ضمن هذه الفترة.</p>
        <footer><button type="button" onClick={()=>setReportOpen(false)}>إلغاء</button><button type="button" className={styles.reportPrimary} onClick={printExpenseReport}>فتح التقرير</button></footer>
      </section>
    </div>}

    {err&&<div className={styles.error}>{err}</div>}
    {pendingSync>0&&<div className={styles.pending}>{pendingSync} حركة محفوظة على الجهاز وتنتظر المزامنة.</div>}

    {loading?<div className={styles.empty}>جارٍ فتح مساحة التشغيل…</div>:!contractor?<div className={styles.empty}>لا يوجد مقاول مرتبط أو مسند له عمالة في هذا التاريخ.</div>:<>
      {type==='output'&&<OutputPanel projectId={projectId} date={date} contractor={contractor} onQueueChange={setPendingSync}/>} 
      {type==='expenses'&&<DirectExpensePanel projectId={projectId} date={date} contractor={contractor} onQueueChange={setPendingSync}/>} 
      {type==='finance'&&<FinancePanel projectId={projectId} date={date} contractor={contractor} onQueueChange={setPendingSync}/>} 
    </>}
  </div>;
}
