const number=(value)=>Number(value||0);

export function selectAvailableProjectItems(items=[],links=[],date=''){
  const active=(links||[]).filter((row)=>
    row?.is_active!==false&&
    (!row?.start_date||row.start_date<=date)&&
    (!row?.end_date||row.end_date>=date)
  );
  if(!active.length)return items||[];
  const ids=new Set(active.map((row)=>row.project_item_id));
  return (items||[]).filter((item)=>ids.has(item.id));
}

export function buildProjectOutputPayload({contractorId,item,quantity,notes}){
  const qty=number(quantity);
  if(!contractorId)throw new Error('المقاول غير محدد.');
  if(!item?.id)throw new Error('البند غير محدد.');
  if(!qty)throw new Error('الكمية المنفذة مطلوبة.');
  return {
    contractor_id:contractorId,
    item_id:item.id,
    qty,
    unit:item.unit||null,
    notes:String(notes||'').trim()||null,
  };
}

export function summarizeProjectOutput(rows=[]){
  return Object.freeze({
    count:(rows||[]).length,
    totalQuantity:(rows||[]).reduce((sum,row)=>sum+number(row?.group_output),0),
  });
}

/* ---------- the daily output sheet ---------- */

const draftId=()=>globalThis?.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function createOutputDraft(seed={},idFactory=draftId){
  return {_id:idFactory(),id:null,persisted:false,item_id:'',qty:'',notes:'',...seed};
}

/** A saved day_items row as a locked sheet row. */
export function storedOutputToRow(row){
  return {
    _id:`saved-${row?.id}`,
    id:row?.id||null,
    persisted:true,
    item_id:row?.project_item_id||'',
    qty:String(row?.group_output??''),
    notes:row?.notes||'',
    unit:row?.unit||'',
  };
}

export function outputDraftUsed(row){
  return !row?.persisted&&(number(row?.qty)>0||Boolean(String(row?.notes||'').trim())||Boolean(row?.item_id&&row?.qty!==''));
}

/** New rows that are ready, and a message per incomplete row (by its sheet row number). */
export function validateOutputDrafts(rows=[]){
  const ready=[];
  const errors=[];
  (rows||[]).forEach((row,index)=>{
    if(!outputDraftUsed(row))return;
    if(!row.item_id)errors.push(`الصف ${index+1}: اختر البند.`);
    else if(!(number(row.qty)>0))errors.push(`الصف ${index+1}: الكمية المنفذة مطلوبة.`);
    else ready.push(row);
  });
  return Object.freeze({ready,errors});
}
