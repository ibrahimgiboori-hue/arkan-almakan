'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { projectOperationOutputService } from '@/lib/application/project-operation-output-service';
import {
  availableOutputItems,
  createOutputDraft,
  storedOutputToRow,
  validateOutputDrafts,
} from '@/lib/project-operation-output.mjs';
import { projectLedgerMatches } from '@/lib/project-operation-context.mjs';
import { sheetBatchMessage } from '@/lib/sheet-batch.mjs';
import RawGrid, { RawGridFooter, rawGridStyles } from '@/components/ui/RawGrid';
import styles from './operations.module.css';

const qtyText=(n)=>Number(n||0).toLocaleString('en-US',{maximumFractionDigits:2});
const blankRows=(count,date,contractorId)=>[...Array(count)].map(()=>createOutputDraft({date,contractor_id:contractorId||''}));
const isBlank=(row)=>!row.persisted&&!row.queued&&!row.item_id&&!row.qty&&!String(row.notes||'').trim();
const dayText=(value)=>{if(!value)return '—';const [y,m,d]=String(value).split('-');return `${d}/${m}/${y}`;};

function Feedback({value}){if(!value)return null;return <div className={value.type==='error'?styles.panelError:styles.panelSuccess}>{value.text}</div>;}

/**
 * سجل الإنجاز: ورقة واحدة لإنجاز المشروع كله (التاريخ، المقاول، البند، الكمية). المحفوظ مقفل،
 * والجديد يُكتب أو يُلصق من إكسل أسفل السجل بتاريخه ومقاوله، ثم يُحفظ مرة واحدة —
 * كل سطر عبر قناة الكتابة الموثقة على يومه ومقاوله. الفلترة تحدد ما يظهر.
 */
export default function OutputPanel({projectId,contractors=[],contractorId='',from,to,search='',entryDate,onQueueChange,service=projectOperationOutputService}){
  const [items,setItems]=useState([]);
  const [links,setLinks]=useState([]);
  const [savedRows,setSavedRows]=useState([]);
  const [drafts,setDrafts]=useState(()=>blankRows(4,entryDate,contractorId));
  const [loading,setLoading]=useState(true);
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
      setItems(result.items);
      setLinks(result.links);
      setSavedRows(result.rows);
    }catch(e){if(seq===loadSeqRef.current){setSavedRows([]);setFeedback({type:'error',text:'تعذر تحميل سجل الإنجاز: '+(e.message||e)+' — لم تُعرض حالة فارغة بديلة.'});}}
    if(seq===loadSeqRef.current)setLoading(false);
  },[projectId,from,to,contractorId,service]);

  useEffect(()=>{load();},[load]);
  useEffect(()=>{setFeedback(null);},[projectId,from,to,contractorId]);
  useEffect(()=>{
    setDrafts((current)=>current.map((row)=>isBlank(row)?{...row,date:entryDate,contractor_id:contractorId||row.contractor_id}:row));
  },[entryDate,contractorId]);

  const itemById=useMemo(()=>new Map(items.map((item)=>[item.id,item])),[items]);
  const contractorName=useMemo(()=>{
    const byId=new Map(contractors.map((c)=>[c.id,c.operation_alias||c.name_ar]));
    return (id)=>byId.get(id)||'';
  },[contractors]);
  const itemsFor=useCallback((contractor,date)=>availableOutputItems(items,links,contractor,date),[items,links]);

  const ledgerRows=useMemo(()=>savedRows
    .map((row)=>storedOutputToRow(row))
    .filter((row)=>projectLedgerMatches(search,itemById.get(row.item_id)?.description_ar,contractorName(row.contractor_id),row.notes))
    .sort((a,b)=>a.date.localeCompare(b.date)||contractorName(a.contractor_id).localeCompare(contractorName(b.contractor_id),'ar')),[savedRows,search,itemById,contractorName]);
  const rows=useMemo(()=>[...ledgerRows,...drafts],[ledgerRows,drafts]);
  const {ready,errors}=validateOutputDrafts(rows,{itemsFor,from,to});
  const totalQuantity=ledgerRows.reduce((sum,row)=>sum+Number(row.qty||0),0);

  function patchRow(key,patch){setDrafts((prev)=>prev.map((row)=>row._id===key?{...row,...patch}:row));}
  function appendRows(patches){setDrafts((prev)=>[...prev,...patches.map((patch)=>createOutputDraft({date:entryDate,contractor_id:contractorId||'',...patch}))]);}
  function removeRow(row){setDrafts((prev)=>prev.length>1?prev.filter((item)=>item._id!==row._id):blankRows(1,entryDate,contractorId));}

  async function saveSheet(){
    if(errors.length){setFeedback({type:'error',text:errors.slice(0,4).join(' ')});return;}
    if(!ready.length)return;
    setBusy(true);setFeedback(null);
    try{
      const result=await service.saveSheet({projectId,rows:ready,items});
      onQueueChange?.(result.pendingCount||0);
      const verified=new Set(result.saved.filter((entry)=>entry.result?.status==='verified').map((entry)=>entry.row._id));
      const queued=new Set(result.saved.filter((entry)=>entry.result?.status==='queued').map((entry)=>entry.row._id));
      setDrafts((prev)=>{
        const next=prev.filter((row)=>!verified.has(row._id)).map((row)=>queued.has(row._id)?{...row,queued:true}:row);
        const open=next.filter(isBlank).length;
        return open>=2?next:[...next,...blankRows(2-open,entryDate,contractorId)];
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
      key:'item_id',label:'البند',type:'select',minWidth:260,emptyOption:'اختر البند',
      options:(row)=>(row.persisted?items:itemsFor(row.contractor_id||contractorId,row.date||entryDate)).map((item)=>({value:item.id,label:item.description_ar})),
    },
    {key:'_unit',label:'الوحدة',type:'computed',compute:(row)=>row.unit||itemById.get(row.item_id)?.unit||null,formula:'وحدة البند من نطاق المشروع'},
    {key:'qty',label:'الكمية المنفذة',type:'number',min:0,step:'any',total:'sum'},
    {key:'notes',label:'ملاحظة',type:'text',minWidth:220,placeholder:'اختياري'},
    {
      key:'_action',label:'إجراء',type:'action',
      render:(row,{disabled})=>row.persisted||row.queued
        ?<span aria-hidden="true">—</span>
        :<button type="button" className={rawGridStyles.actionButton} onClick={()=>removeRow(row)} disabled={disabled}>×</button>,
    },
  ];

  return <section style={{width:'100%',minWidth:0}} data-output-ledger="project">
    <main className={styles.formPane} style={{width:'100%',minWidth:0,paddingInline:0}}>
      <div className={styles.panelTitle}>
        <div>
          <span>OUTPUT · PROJECT LEDGER</span>
          <h2>سجل الإنجاز</h2>
          <p>إنجاز المشروع كله في ورقة واحدة. المحفوظ مقفل؛ اكتب الصفوف الجديدة أسفله أو الصقها من إكسل (التاريخ، المقاول، البند، …، الكمية، ملاحظة) ثم احفظ مرة واحدة.</p>
        </div>
        <div style={{display:'flex',gap:18,alignItems:'flex-end',flexWrap:'wrap'}}>
          <div><small style={{display:'block',opacity:.65}}>أسطر محفوظة</small><strong>{ledgerRows.length}</strong></div>
          <div><small style={{display:'block',opacity:.65}}>مجموع الكميات</small><strong>{qtyText(totalQuantity)}</strong></div>
        </div>
      </div>

      <Feedback value={feedback}/>
      {!loading&&!items.length&&<div className={styles.panelEmpty}>لا توجد بنود في نطاق المشروع بعد.</div>}

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
        totalsLabel="المجموع"
        emptyMessage="لا يوجد إنجاز في هذه الفترة."
      />

      {!(loading&&!items.length)&&<RawGridFooter
        actions={<>
          <button type="button" className={rawGridStyles.plainButton} onClick={()=>setDrafts((prev)=>[...prev,...blankRows(4,entryDate,contractorId)])} disabled={busy}>+ 4 صفوف</button>
          <button type="button" className={rawGridStyles.plainButton} onClick={()=>{setDrafts(blankRows(4,entryDate,contractorId));load();}} disabled={busy}>تحديث السجل</button>
        </>}
        summary={<>
          <strong>جاهز للحفظ: {ready.length} سطر{errors.length?` · ${errors.length} ناقص`:''}</strong>
          <button className={rawGridStyles.primaryButton} type="button" onClick={saveSheet} disabled={busy||(!ready.length&&!errors.length)}>{busy?'جارٍ الحفظ…':'حفظ الإنجاز'}</button>
        </>}
      />}
    </main>
  </section>;
}
