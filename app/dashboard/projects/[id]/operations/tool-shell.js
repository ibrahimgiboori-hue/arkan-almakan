'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { projectOperationContextService } from '@/lib/application/project-operation-context-service';
import { useProjectOperationContext } from '@/lib/use-project-operation-context';
import ProjectLedgerFilterBar from '@/components/project/ProjectLedgerFilterBar';
import OutputPanel from './output-panel';
import DirectExpensePanel from './direct-expense-panel';
import FinancePanel from './finance-panel';
import SettlementPanel from './settlement-panel';
import styles from './tool-shell.module.css';

/**
 * غلاف أوراق المشروع (الإنجاز، المصروفات، السلف والدفعات): كل ورقة سجل واحد مستمر للمشروع كله،
 * والفلترة المشتركة (المقاول أو الكل، الفترة، البحث) هي التي تحدد ما يظهر. لا ورقة لكل يوم ولا لكل مقاول.
 */
export default function OperationToolShell({ type }){
  const { id:projectId } = useParams();
  const context = useProjectOperationContext(projectId);
  const { date:entryDate, contractorId, from, to, search, ready:contextReady, setDate, setContractorId } = context;
  const [contractors,setContractors] = useState([]);
  const [loading,setLoading] = useState(true);
  const [err,setErr] = useState('');
  const [pendingSync,setPendingSync] = useState(0);

  useEffect(()=>{
    let active=true;
    (async()=>{
      if(!contextReady||!projectId||!from||!to)return;
      setLoading(true);setErr('');
      try{
        const rows=await projectOperationContextService.loadContractorsForPeriod({projectId,from,to});
        if(!active)return;
        setContractors(rows);
        if(contractorId&&rows.length&&!rows.some((row)=>row.id===contractorId))setContractorId('');
      }catch(e){if(active)setErr('تعذر تحميل مقاولي المشروع: '+(e.message||e));}
      if(active)setLoading(false);
    })();
    return()=>{active=false};
  },[contextReady,projectId,from,to,contractorId,setContractorId]);

  // New rows default to the entry day; keep it inside the period being shown.
  useEffect(()=>{
    if(!contextReady||!from||!to)return;
    if(entryDate<from||entryDate>to)setDate(to);
  },[contextReady,entryDate,from,to,setDate]);

  const contractor = useMemo(()=>contractors.find(x=>x.id===contractorId)||null,[contractors,contractorId]);

  const title = {
    output:'الإنجاز',
    expenses:'المصروفات',
    finance:'السلف والدفعات',
    settlement:'تسوية المقاول',
  }[type]||'التشغيل';

  function printExpenseReport(){
    setErr('');
    if(!projectId||!contractorId){setErr('اختر المقاول من الفلترة أولًا لطباعة تقرير مصروفاته عن الفترة.');return;}
    const params=new URLSearchParams({project:projectId,contractor:contractorId,from,to});
    window.open(`/print/expenses?${params.toString()}`,'_blank','noopener,noreferrer');
  }

  if(!contextReady)return <div className={styles.empty}>جارٍ فتح سياق المشروع…</div>;

  const panelProps={projectId,contractors,contractorId,from,to,search,entryDate,onQueueChange:setPendingSync};

  return <div className={styles.root} dir="rtl" data-project-ledger={type}>
    <section className={styles.contextBar} data-work-context-bar="true">
      <div className={styles.mode}><span>سجل المشروع</span><strong>{title}</strong></div>
      <div className={styles.contextMeta}><strong>{contractor?.name_ar||'كل المقاولين'}</strong><span>{contractor?(contractor.project_basis==='piecework'?'مقطوعية / بالوحدة':contractor.project_basis==='salary'?'راتب':'يومية'):`${contractors.length} مقاول في الفترة`}</span></div>
    </section>

    <ProjectLedgerFilterBar context={context} contractors={contractors} searchPlaceholder={type==='output'?'البند أو المقاول أو الملاحظة':'البيان أو المقاول أو التصنيف'}>
      {type!=='settlement'&&<label className={styles.entryDate}><span>تاريخ الصفوف الجديدة</span><input type="date" value={entryDate} min={from} max={to} onChange={e=>e.target.value&&setDate(e.target.value)}/></label>}
      {type==='expenses'&&<button className={styles.reportButton} type="button" onClick={printExpenseReport}>طباعة مصروفات الفترة</button>}
    </ProjectLedgerFilterBar>

    {err&&<div className={styles.error}>{err}</div>}
    {pendingSync>0&&<div className={styles.pending}>{pendingSync} حركة محفوظة على الجهاز وتنتظر المزامنة.</div>}

    {loading&&!contractors.length?<div className={styles.empty}>جارٍ فتح السجل…</div>:!contractors.length?<div className={styles.empty}>لا يوجد مقاول مرتبط بالمشروع أو مسند له عمالة في هذه الفترة.</div>:<>
      {type==='output'&&<OutputPanel {...panelProps}/>}
      {type==='expenses'&&<DirectExpensePanel {...panelProps}/>}
      {type==='finance'&&<FinancePanel {...panelProps}/>}
      {type==='settlement'&&<SettlementPanel {...panelProps}/>}
    </>}
  </div>;
}
