'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { projectOperationFinanceService } from '@/lib/application/project-operation-finance-service';
import {
  PROJECT_FINANCE_KIND_LABELS,
  PROJECT_FINANCE_SOURCE_LABELS,
  createFinanceDraft,
  storedFinanceRows,
  summarizeFinanceLedger,
  validateFinanceDrafts,
} from '@/lib/project-operation-finance.mjs';
import { projectLedgerMatches } from '@/lib/project-operation-context.mjs';
import { sheetBatchMessage } from '@/lib/sheet-batch.mjs';
import RawGrid, { RawGridFooter, rawGridStyles } from '@/components/ui/RawGrid';
import styles from './operations.module.css';

const money=(n)=>Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const blankRows=(count,date,contractorId)=>[...Array(count)].map(()=>createFinanceDraft({date,contractor_id:contractorId||''}));
const isBlank=(row)=>!row.persisted&&!row.queued&&!row.amount&&!String(row.notes||'').trim()&&!String(row.reference||'').trim();
const options=(labels)=>Object.entries(labels).map(([value,label])=>({value,label}));
const dayText=(value)=>{if(!value)return '—';const [y,m,d]=String(value).split('-');return `${d}/${m}/${y}`;};

function Feedback({value}){if(!value)return null;return <div className={value.type==='error'?styles.panelError:styles.panelSuccess}>{value.text}</div>;}

/**
 * سجل السلف والدفعات: ورقة واحدة لكل حركات المشروع المالية مع المقاولين. المحفوظ مقفل،
 * والجديد (سلفة أو دفعة) يُكتب أو يُلصق من إكسل بتاريخه ومقاوله ثم يُحفظ مرة واحدة
 * عبر قناة الكتابة الموثقة. الفلترة تحدد المقاول والفترة.
 */
export default function FinancePanel({projectId,contractors=[],contractorId='',from,to,search='',entryDate,onQueueChange,service=projectOperationFinanceService}){
  const [advances,setAdvances]=useState([]);
  const [payments,setPayments]=useState([]);
  const [drafts,setDrafts]=useState(()=>blankRows(4,entryDate,contractorId));
  const [loading,setLoading]=useState(true);
  const [loaded,setLoaded]=useState(false);
  const [busy,setBusy]=useState(false);
  const [feedback,setFeedback]=useState(null);
  const loadSeqRef=useRef(0);

  const load=useCallback(async()=>{
    if(!projectId||!from||!to)return;
    const seq=++loadSeqRef.current;
    setLoading(true);
    try{
      const result=await service.loadRange({projectId,from,to,contractorId});
      if(seq!==loadSeqRef.current)return;
      setAdvances(result.advances||[]);
      setPayments(result.payments||[]);
    }catch(e){if(seq===loadSeqRef.current){setAdvances([]);setPayments([]);setFeedback({type:'error',text:'تعذر تحميل سجل السلف والدفعات: '+(e.message||e)+' — لم تُعرض حالة فارغة بديلة.'});}}
    if(seq===loadSeqRef.current){setLoading(false);setLoaded(true);}
  },[projectId,from,to,contractorId,service]);

  useEffect(()=>{load();},[load]);
  useEffect(()=>{setFeedback(null);},[projectId,from,to,contractorId]);
  useEffect(()=>{
    setDrafts((current)=>current.map((row)=>isBlank(row)?{...row,date:entryDate,contractor_id:contractorId||row.contractor_id}:row));
  },[entryDate,contractorId]);

  const contractorName=useMemo(()=>{
    const byId=new Map(contractors.map((c)=>[c.id,c.operation_alias||c.name_ar]));
    return (id)=>byId.get(id)||'';
  },[contractors]);
  const ledgerRows=useMemo(()=>storedFinanceRows({advances,payments})
    .filter((row)=>projectLedgerMatches(search,contractorName(row.contractor_id),PROJECT_FINANCE_KIND_LABELS[row.kind],row.notes,row.reference)),[advances,payments,search,contractorName]);
  const rows=useMemo(()=>[...ledgerRows,...drafts],[ledgerRows,drafts]);
  const {ready,errors}=validateFinanceDrafts(rows,{ledger:true,from,to});
  const summary=summarizeFinanceLedger(ledgerRows);

  function patchRow(key,patch){setDrafts((prev)=>prev.map((row)=>row._id===key?{...row,...patch}:row));}
  function appendRows(patches){setDrafts((prev)=>[...prev,...patches.map((patch)=>createFinanceDraft({date:entryDate,contractor_id:contractorId||'',...patch}))]);}
  function removeRow(row){setDrafts((prev)=>prev.length>1?prev.filter((item)=>item._id!==row._id):blankRows(1,entryDate,contractorId));}

  async function saveSheet(){
    if(errors.length){setFeedback({type:'error',text:errors.slice(0,4).join(' ')});return;}
    if(!ready.length)return;
    setBusy(true);setFeedback(null);
    try{
      const result=await service.saveSheet({projectId,rows:ready});
      onQueueChange?.(result.pendingCount||0);
      const verified=new Set(result.saved.filter((entry)=>entry.result?.status==='verified').map((entry)=>entry.row._id));
      const queued=new Set(result.saved.filter((entry)=>entry.result?.status==='queued').map((entry)=>entry.row._id));
      setDrafts((prev)=>{
        const next=prev.filter((row)=>!verified.has(row._id)).map((row)=>queued.has(row._id)?{...row,queued:true}:row);
        const open=next.filter(isBlank).length;
        return open>=2?next:[...next,...blankRows(2-open,entryDate,contractorId)];
      });
      setFeedback({type:result.failure?'error':'success',text:sheetBatchMessage(result,'حركة')});
      if(result.verified)await load();
    }catch(e){setFeedback({type:'error',text:'تعذر حفظ الحركات: '+(e.message||e)});}
    setBusy(false);
  }

  const columns=[
    {key:'_index',label:'#',type:'index',render:(row)=>rows.indexOf(row)+1},
    {key:'_status',label:'الحالة',type:'badge',text:(row)=>row.persisted?'محفوظ':row.queued?'في الانتظار':'جديد',tone:(row)=>row.persisted?'saved':row.queued?'muted':'new'},
    {
      key:'date',label:'التاريخ',type:'date',
      visible:(row)=>!row.persisted,
      placeholderWhenHidden:(row)=>dayText(row.date),
      sheetValue:(row)=>dayText(row.date),
    },
    {
      key:'contractor_id',label:'المقاول',type:'select',minWidth:160,emptyOption:'اختر المقاول',
      options:contractors.map((c)=>({value:c.id,label:c.operation_alias||c.name_ar})),
      visible:(row)=>!row.persisted,
      placeholderWhenHidden:(row)=>contractorName(row.contractor_id)||'—',
      sheetValue:(row)=>contractorName(row.contractor_id),
    },
    {
      key:'kind',label:'النوع',type:'select',minWidth:110,options:options(PROJECT_FINANCE_KIND_LABELS),
      onChange:(row,value)=>({kind:value,source:value==='payment'?(row.source||'bank'):'',reference:value==='payment'?row.reference:''}),
    },
    {key:'amount',label:'المبلغ',type:'number',min:0,step:0.01,total:'sum'},
    {key:'source',label:'طريقة الدفع',type:'select',visible:(row)=>row.kind==='payment',options:options(PROJECT_FINANCE_SOURCE_LABELS)},
    {key:'reference',label:'المرجع',type:'text',visible:(row)=>row.kind==='payment',placeholder:'رقم التحويل أو السند'},
    {key:'notes',label:'ملاحظة',type:'text',minWidth:220,placeholder:'اختياري'},
    {
      key:'_action',label:'إجراء',type:'action',
      render:(row,{disabled})=>row.persisted||row.queued
        ?<span aria-hidden="true">—</span>
        :<button type="button" className={rawGridStyles.actionButton} onClick={()=>removeRow(row)} disabled={disabled}>×</button>,
    },
  ];

  return <section style={{width:'100%',minWidth:0}} data-finance-ledger="project">
    <main className={styles.formPane} style={{width:'100%',minWidth:0,paddingInline:0}}>
      <div className={styles.panelTitle}>
        <div>
          <span>ADVANCES / PAYMENTS · PROJECT LEDGER</span>
          <h2>سجل السلف والدفعات</h2>
          <p>كل السلف والدفعات للمقاولين في ورقة واحدة. المحفوظ مقفل؛ اكتب الحركات الجديدة أسفله أو الصقها من إكسل بتاريخها ومقاولها ثم احفظ مرة واحدة.</p>
        </div>
        <div style={{display:'flex',gap:18,alignItems:'flex-end',flexWrap:'wrap'}}>
          <div><small style={{display:'block',opacity:.65}}>سلف الفترة</small><strong>{money(summary.advanceTotal)} <small>ر.س</small></strong></div>
          <div><small style={{display:'block',opacity:.65}}>دفعات الفترة</small><strong>{money(summary.paymentTotal)} <small>ر.س</small></strong></div>
        </div>
      </div>

      <Feedback value={feedback}/>

      <RawGrid
        columns={columns}
        rows={rows}
        rowKey={(row)=>row._id}
        savedFlag={(row)=>row.persisted}
        rowDisabled={(row)=>row.persisted||row.queued}
        onPatchRow={patchRow}
        onAppendRows={appendRows}
        busy={busy}
        loading={loading&&!loaded}
        emptyMessage="لا توجد سلف أو دفعات في هذه الفترة."
      />

      <RawGridFooter
        actions={<>
          <button type="button" className={rawGridStyles.plainButton} onClick={()=>setDrafts((prev)=>[...prev,...blankRows(4,entryDate,contractorId)])} disabled={busy}>+ 4 صفوف</button>
          <button type="button" className={rawGridStyles.plainButton} onClick={()=>{setDrafts(blankRows(4,entryDate,contractorId));load();}} disabled={busy}>تحديث السجل</button>
        </>}
        summary={<>
          <strong>جاهز للحفظ: {ready.length} حركة{errors.length?` · ${errors.length} ناقصة`:''}</strong>
          <button className={rawGridStyles.primaryButton} type="button" onClick={saveSheet} disabled={busy||(!ready.length&&!errors.length)}>{busy?'جارٍ الحفظ…':'حفظ الحركات'}</button>
        </>}
      />
    </main>
  </section>;
}
