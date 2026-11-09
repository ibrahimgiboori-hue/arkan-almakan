'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { projectOperationFinanceService } from '@/lib/application/project-operation-finance-service';
import {
  PROJECT_FINANCE_KIND_LABELS,
  PROJECT_FINANCE_SOURCE_LABELS,
  createFinanceDraft,
  storedFinanceRows,
  summarizeProjectFinanceDay,
  validateFinanceDrafts,
} from '@/lib/project-operation-finance.mjs';
import { sheetBatchMessage } from '@/lib/sheet-batch.mjs';
import RawGrid, { RawGridFooter, rawGridStyles } from '@/components/ui/RawGrid';
import styles from './operations.module.css';

const money=(n)=>Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const blankRows=(count)=>Array.from({length:count},()=>createFinanceDraft());
const options=(labels)=>Object.entries(labels).map(([value,label])=>({value,label}));

function Feedback({value}){if(!value)return null;return <div className={value.type==='error'?styles.panelError:styles.panelSuccess}>{value.text}</div>;}

/**
 * السلف والدفعات كورقة إكسل: حركات اليوم المحفوظة مقفلة، والجديدة (سلفة أو دفعة)
 * تُكتب أو تُلصق من إكسل ثم تُحفظ مرة واحدة عبر قناة الكتابة الموثقة.
 */
export default function FinancePanel({projectId,date,contractor,onQueueChange,service=projectOperationFinanceService}){
  const [advances,setAdvances]=useState([]);
  const [payments,setPayments]=useState([]);
  const [drafts,setDrafts]=useState(()=>blankRows(4));
  const [loading,setLoading]=useState(true);
  const [loaded,setLoaded]=useState(false);
  const [busy,setBusy]=useState(false);
  const [feedback,setFeedback]=useState(null);

  const load=useCallback(async()=>{
    if(!projectId||!date||!contractor?.id)return;
    setLoading(true);
    try{
      const day=await service.loadDay({projectId,date,contractorId:contractor.id});
      setAdvances(day.advances||[]);
      setPayments(day.payments||[]);
    }catch(e){setFeedback({type:'error',text:'تعذر تحميل السلف والدفعات: '+(e.message||e)});}
    setLoading(false);setLoaded(true);
  },[projectId,date,contractor?.id,service]);

  useEffect(()=>{load();},[load]);
  useEffect(()=>{setDrafts(blankRows(4));setFeedback(null);setLoaded(false);},[projectId,date,contractor?.id]);

  const rows=useMemo(()=>[...storedFinanceRows({advances,payments}),...drafts],[advances,payments,drafts]);
  const {ready,errors}=validateFinanceDrafts(rows);
  const summary=summarizeProjectFinanceDay({advances,payments});

  function patchRow(key,patch){setDrafts((prev)=>prev.map((row)=>row._id===key?{...row,...patch}:row));}
  function appendRows(patches){setDrafts((prev)=>[...prev,...patches.map((patch)=>createFinanceDraft(patch))]);}
  function removeRow(row){setDrafts((prev)=>prev.length>1?prev.filter((item)=>item._id!==row._id):blankRows(1));}

  async function saveSheet(){
    if(errors.length){setFeedback({type:'error',text:errors.slice(0,4).join(' ')});return;}
    if(!ready.length)return;
    setBusy(true);setFeedback(null);
    try{
      const result=await service.saveSheet({projectId,date,contractorId:contractor.id,rows:ready});
      onQueueChange?.(result.pendingCount||0);
      const verified=new Set(result.saved.filter((entry)=>entry.result?.status==='verified').map((entry)=>entry.row._id));
      const queued=new Set(result.saved.filter((entry)=>entry.result?.status==='queued').map((entry)=>entry.row._id));
      setDrafts((prev)=>{
        const next=prev.filter((row)=>!verified.has(row._id)).map((row)=>queued.has(row._id)?{...row,queued:true}:row);
        const open=next.filter((row)=>!row.queued&&!row.amount&&!row.notes).length;
        return open>=2?next:[...next,...blankRows(2-open)];
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

  return <section style={{width:'100%',minWidth:0,borderTop:'1px solid var(--raw-border)'}}>
    <main className={styles.formPane} style={{width:'100%',minWidth:0,paddingInline:0}}>
      <div className={styles.panelTitle}>
        <div>
          <span>ADVANCES / PAYMENTS · SHEET</span>
          <h2>السلف والدفعات</h2>
          <p>حركات اليوم المحفوظة تظهر مقفلة. اكتب السلف والدفعات الجديدة تحتها أو الصقها من إكسل ثم احفظ مرة واحدة.</p>
        </div>
        <div style={{display:'flex',gap:18,alignItems:'flex-end',flexWrap:'wrap'}}>
          <div><small style={{display:'block',opacity:.65}}>سلف اليوم</small><strong>{money(summary.advanceTotal)} <small>ر.س</small></strong></div>
          <div><small style={{display:'block',opacity:.65}}>دفعات اليوم</small><strong>{money(summary.paymentTotal)} <small>ر.س</small></strong></div>
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
      />

      <RawGridFooter
        actions={<>
          <button type="button" className={rawGridStyles.plainButton} onClick={()=>setDrafts((prev)=>[...prev,...blankRows(4)])} disabled={busy}>+ 4 صفوف</button>
          <button type="button" className={rawGridStyles.plainButton} onClick={()=>{setDrafts(blankRows(4));load();}} disabled={busy}>إعادة تحميل اليوم</button>
        </>}
        summary={<>
          <strong>جاهز للحفظ: {ready.length} حركة{errors.length?` · ${errors.length} ناقصة`:''}</strong>
          <button className={rawGridStyles.primaryButton} type="button" onClick={saveSheet} disabled={busy||(!ready.length&&!errors.length)}>{busy?'جارٍ الحفظ…':'حفظ حركات اليوم'}</button>
        </>}
      />
    </main>
  </section>;
}
