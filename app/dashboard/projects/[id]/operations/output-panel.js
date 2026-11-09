'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { projectOperationOutputService } from '@/lib/application/project-operation-output-service';
import {
  createOutputDraft,
  storedOutputToRow,
  summarizeProjectOutput,
  validateOutputDrafts,
} from '@/lib/project-operation-output.mjs';
import { sheetBatchMessage } from '@/lib/sheet-batch.mjs';
import RawGrid, { RawGridFooter, rawGridStyles } from '@/components/ui/RawGrid';
import styles from './operations.module.css';

const money=(n)=>Number(n||0).toLocaleString('en-US',{maximumFractionDigits:2});
const blankRows=(count)=>Array.from({length:count},()=>createOutputDraft());

function Feedback({value}){if(!value)return null;return <div className={value.type==='error'?styles.panelError:styles.panelSuccess}>{value.text}</div>;}

/**
 * الإنجاز اليومي كورقة إكسل: إنجاز اليوم المحفوظ يظهر مقفلًا في الأعلى، والصفوف
 * الجديدة تحته تُكتب أو تُلصق من إكسل ثم تُحفظ مرة واحدة (كل صف عبر قناة الكتابة الموثقة).
 */
export default function OutputPanel({projectId,date,contractor,onQueueChange,service=projectOperationOutputService}){
  const [items,setItems]=useState([]);
  const [availableItems,setAvailableItems]=useState([]);
  const [savedRows,setSavedRows]=useState([]);
  const [drafts,setDrafts]=useState(()=>blankRows(4));
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [feedback,setFeedback]=useState(null);

  const load=useCallback(async()=>{
    if(!projectId||!date||!contractor?.id)return;
    setLoading(true);
    try{
      const day=await service.loadDay({projectId,date,contractorId:contractor.id});
      setItems(day.items);
      setAvailableItems(day.availableItems);
      setSavedRows(day.rows);
    }catch(e){setFeedback({type:'error',text:'تعذر تحميل إنجاز اليوم: '+(e.message||e)});}
    setLoading(false);
  },[projectId,date,contractor?.id,service]);

  useEffect(()=>{load();},[load]);
  useEffect(()=>{setDrafts(blankRows(4));setFeedback(null);},[projectId,date,contractor?.id]);

  const itemById=useMemo(()=>new Map(items.map((item)=>[item.id,item])),[items]);
  const rows=useMemo(()=>[...savedRows.map(storedOutputToRow),...drafts],[savedRows,drafts]);
  const {ready,errors}=validateOutputDrafts(rows);
  const summary=summarizeProjectOutput(savedRows);

  function patchRow(key,patch){setDrafts((prev)=>prev.map((row)=>row._id===key?{...row,...patch}:row));}
  function appendRows(patches){setDrafts((prev)=>[...prev,...patches.map((patch)=>createOutputDraft(patch))]);}
  function removeRow(row){setDrafts((prev)=>prev.length>1?prev.filter((item)=>item._id!==row._id):blankRows(1));}

  async function saveSheet(){
    if(errors.length){setFeedback({type:'error',text:errors.slice(0,4).join(' ')});return;}
    if(!ready.length)return;
    setBusy(true);setFeedback(null);
    try{
      const result=await service.saveSheet({projectId,date,contractorId:contractor.id,rows:ready,items});
      onQueueChange?.(result.pendingCount||0);
      const verified=new Set(result.saved.filter((entry)=>entry.result?.status==='verified').map((entry)=>entry.row._id));
      const queued=new Set(result.saved.filter((entry)=>entry.result?.status==='queued').map((entry)=>entry.row._id));
      setDrafts((prev)=>{
        const next=prev.filter((row)=>!verified.has(row._id)).map((row)=>queued.has(row._id)?{...row,queued:true}:row);
        const open=next.filter((row)=>!row.queued&&!row.qty&&!row.notes).length;
        return open>=2?next:[...next,...blankRows(2-open)];
      });
      setFeedback({type:result.failure?'error':'success',text:sheetBatchMessage(result,'سطر إنجاز')});
      if(result.verified)await load();
    }catch(e){setFeedback({type:'error',text:'تعذر حفظ الإنجاز: '+(e.message||e)});}
    setBusy(false);
  }

  const columns=[
    {key:'_index',label:'#',type:'index',render:(row)=>rows.indexOf(row)+1},
    {key:'_status',label:'الحالة',type:'badge',text:(row)=>row.persisted?'محفوظ':row.queued?'في الانتظار':'جديد',tone:(row)=>row.persisted?'saved':row.queued?'muted':'new'},
    {
      key:'item_id',label:'البند',type:'select',minWidth:260,emptyOption:'اختر البند',
      options:(row)=>(row.persisted?items:availableItems).map((item)=>({value:item.id,label:item.description_ar})),
    },
    {key:'_unit',label:'الوحدة',type:'computed',compute:(row)=>row.unit||itemById.get(row.item_id)?.unit||null,formula:'وحدة البند من نطاق المشروع'},
    {key:'qty',label:'الكمية المنفذة',type:'number',min:0,step:'any'},
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
          <span>DAILY OUTPUT · SHEET</span>
          <h2>الإنجاز اليومي</h2>
          <p>إنجاز اليوم المحفوظ يظهر مقفلًا. اكتب الصفوف الجديدة تحته أو الصقها من إكسل (البند، الكمية، ملاحظة) ثم احفظ مرة واحدة.</p>
        </div>
        <div style={{display:'flex',gap:18,alignItems:'flex-end',flexWrap:'wrap'}}>
          <div><small style={{display:'block',opacity:.65}}>أسطر محفوظة اليوم</small><strong>{summary.count}</strong></div>
          <div><small style={{display:'block',opacity:.65}}>{contractor?.name_ar}</small><strong>{money(summary.totalQuantity)} <small>كمية</small></strong></div>
        </div>
      </div>

      <Feedback value={feedback}/>
      {!loading&&!availableItems.length&&<div className={styles.panelEmpty}>لا توجد بنود متاحة لهذا المقاول في المشروع في هذا التاريخ.</div>}

      <RawGrid
        columns={columns}
        rows={rows}
        rowKey={(row)=>row._id}
        savedFlag={(row)=>row.persisted}
        rowDisabled={(row)=>row.persisted||row.queued}
        onPatchRow={patchRow}
        onAppendRows={appendRows}
        busy={busy}
        loading={loading&&!items.length}
      />

      {!(loading&&!items.length)&&<RawGridFooter
        actions={<>
          <button type="button" className={rawGridStyles.plainButton} onClick={()=>setDrafts((prev)=>[...prev,...blankRows(4)])} disabled={busy}>+ 4 صفوف</button>
          <button type="button" className={rawGridStyles.plainButton} onClick={()=>{setDrafts(blankRows(4));load();}} disabled={busy}>إعادة تحميل اليوم</button>
        </>}
        summary={<>
          <strong>جاهز للحفظ: {ready.length} سطر{errors.length?` · ${errors.length} ناقص`:''}</strong>
          <button className={rawGridStyles.primaryButton} type="button" onClick={saveSheet} disabled={busy||(!ready.length&&!errors.length)}>{busy?'جارٍ الحفظ…':'حفظ إنجاز اليوم'}</button>
        </>}
      />}
    </main>
  </section>;
}
