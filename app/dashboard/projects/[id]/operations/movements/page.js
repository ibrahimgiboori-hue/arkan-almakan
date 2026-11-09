'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useProjectOperationContext } from '@/lib/use-project-operation-context';
import { projectDailyLedgerService } from '@/lib/application/project-daily-ledger-service';
import { projectOperationContextService } from '@/lib/application/project-operation-context-service';
import {
  PROJECT_DAILY_LEDGER_EMPTY_SUMMARY,
  PROJECT_DAILY_LEDGER_FILTERS,
  PROJECT_MOVEMENTS_MAX_DAYS,
  filterProjectMovementRows,
  summarizeProjectMovementRows,
} from '@/lib/project-daily-ledger.mjs';
import RawGrid from '@/components/ui/RawGrid';
import ProjectLedgerFilterBar from '@/components/project/ProjectLedgerFilterBar';
import styles from './movements.module.css';

const money=(n)=>Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const TYPE_LABELS=Object.fromEntries(PROJECT_DAILY_LEDGER_FILTERS);
const timeText=(value)=>value?new Date(value).toLocaleTimeString('ar-SA-u-ca-gregory-nu-latn',{hour:'2-digit',minute:'2-digit'}):null;
const dayText=(value)=>{if(!value)return null;const [y,m,d]=String(value).split('-');return `${d}/${m}/${y}`;};

// حركات المشروع ورقة واحدة للقراءة: كل ما سُجّل في الفترة صفًا صفًا بتاريخه، تُحدَّد وتُنسخ إلى إكسل ويُجمع مبلغها.
const LEDGER_COLUMNS=(rows)=>[
  {key:'_index',label:'#',type:'index',render:(row)=>rows.indexOf(row)+1},
  {key:'_date',label:'التاريخ',type:'computed',compute:(row)=>dayText(row.date)},
  {key:'_type',label:'النوع',type:'badge',text:(row)=>TYPE_LABELS[row.type]||row.type||'—',tone:()=>'muted'},
  {key:'_title',label:'الحركة',type:'computed',compute:(row)=>row.title||null},
  {key:'_detail',label:'التفاصيل',type:'computed',compute:(row)=>row.detail||null},
  {key:'_amount',label:'المبلغ (ر.س)',type:'computed',numeric:true,compute:(row)=>row.amount===null||row.amount===undefined?null:Number(row.amount),format:(value)=>value===null?null:money(value),total:'sum'},
  {key:'_value',label:'القيمة',type:'computed',compute:(row)=>row.amount===null||row.amount===undefined?(row.value||null):null},
  {key:'_time',label:'الوقت',type:'computed',compute:(row)=>timeText(row.time)},
];

/**
 * سجل حركات المشروع: الحضور والإنجاز والمصروفات والعهدة والسلف والدفعات في ورقة واحدة للفترة المختارة.
 * لا صفحة لكل يوم: الفلترة المشتركة (المقاول، الفترة، البحث) ونوع الحركة تحدد ما يظهر.
 */
export default function MovementsPage({service=projectDailyLedgerService,contextService=projectOperationContextService}={}){
  const {id:projectId}=useParams();
  const context=useProjectOperationContext(projectId);
  const {contractorId,from,to,search,ready:contextReady}=context;
  const [rows,setRows]=useState([]);
  const [contractors,setContractors]=useState([]);
  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState('');
  const [type,setType]=useState('all');
  const loadSeqRef=useRef(0);

  const load=useCallback(async()=>{
    if(!contextReady||!projectId||!from||!to)return;
    const seq=++loadSeqRef.current;
    setLoading(true);setErr('');
    try{
      const [ledger,list]=await Promise.all([
        service.loadRange({projectId,from,to}),
        contextService.loadContractorsForPeriod({projectId,from,to}),
      ]);
      if(seq!==loadSeqRef.current)return;
      setRows(ledger.rows);setContractors(list);
    }catch(e){
      if(seq!==loadSeqRef.current)return;
      setRows([]);
      setErr('تعذر تحميل حركات الفترة: '+(e?.message||e));
    }finally{if(seq===loadSeqRef.current)setLoading(false);}
  },[contextReady,projectId,from,to,service,contextService]);

  useEffect(()=>{load()},[load]);
  const scoped=useMemo(()=>filterProjectMovementRows(rows,{contractorId,search}),[rows,contractorId,search]);
  const visible=useMemo(()=>filterProjectMovementRows(scoped,{type}),[scoped,type]);
  const summary=useMemo(()=>scoped.length?summarizeProjectMovementRows(scoped):PROJECT_DAILY_LEDGER_EMPTY_SUMMARY,[scoped]);

  if(!contextReady)return <div className={styles.empty}>جارٍ فتح سياق المشروع…</div>;

  return <div className={styles.root} dir="rtl" data-movements-ledger="project">
    <header className={styles.context}>
      <div><span>PROJECT MOVEMENTS</span><h2>حركات المشروع</h2><p>كل ما سُجّل في الفترة المختارة: الحضور والإنجاز والحركات المالية — حتى {PROJECT_MOVEMENTS_MAX_DAYS} يومًا في العرض الواحد.</p></div>
    </header>

    <ProjectLedgerFilterBar context={context} contractors={contractors} searchPlaceholder="العامل أو البند أو البيان"/>

    {err&&<div className={styles.error} role="alert">{err}</div>}

    <section className={styles.summary} aria-label="ملخص حركات الفترة">
      <div><span>الحضور</span><strong>{summary.attendance}</strong><small>{summary.full} كامل · {summary.half} نصف · {summary.absent} غياب</small></div>
      <div><span>الإنجاز</span><strong>{summary.outputs}</strong><small>حركة مسجلة</small></div>
      <div><span>مصروفات التشغيل</span><strong>{money(summary.expenses)}</strong><small>ر.س</small></div>
      <div><span>صرف من العهدة</span><strong>{money(summary.custody)}</strong><small>ر.س</small></div>
      <div><span>سلف المقاولين</span><strong>{money(summary.advances)}</strong><small>ر.س</small></div>
      <div><span>دفعات المقاولين</span><strong>{money(summary.payments)}</strong><small>ر.س</small></div>
    </section>

    <div className={styles.filters} aria-label="نوع الحركة">{PROJECT_DAILY_LEDGER_FILTERS.map(([k,v])=><button type="button" key={k} className={type===k?styles.on:''} aria-pressed={type===k} onClick={()=>setType(k)}>{v}</button>)}</div>

    {loading?
      <div className={styles.empty}>جارٍ تجميع حركات الفترة…</div>
      :visible.length===0?
        <div className={styles.empty}>{rows.length?'لا توجد حركات تطابق الفلترة.':'لا توجد حركات مسجلة في هذه الفترة.'}</div>
        :<RawGrid columns={LEDGER_COLUMNS(visible)} rows={visible} rowKey={(row)=>row.id} rowDisabled={()=>true}/>}
  </div>;
}
