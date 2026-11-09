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

/* ---------- the output ledger: one sheet for the whole project ---------- */

const draftId=()=>globalThis?.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function createOutputDraft(seed={},idFactory=draftId){
  return {_id:idFactory(),id:null,persisted:false,date:'',contractor_id:'',item_id:'',qty:'',notes:'',...seed};
}

/** A saved day_items row as a locked ledger row (date comes from its timesheet day). */
export function storedOutputToRow(row,date=''){
  return {
    _id:`saved-${row?.id}`,
    id:row?.id||null,
    persisted:true,
    date:row?.work_date||date||'',
    contractor_id:row?.contractor_id||'',
    item_id:row?.project_item_id||'',
    qty:String(row?.group_output??''),
    notes:row?.notes||'',
    unit:row?.unit||'',
  };
}

/** Items a contractor may record on a day: his active item assignments, or every item when he has none. */
export function availableOutputItems(items=[],links=[],contractorId='',date=''){
  return selectAvailableProjectItems(items,(links||[]).filter((link)=>link.contractor_id===contractorId),date);
}

export function outputDraftUsed(row){
  return !row?.persisted&&(number(row?.qty)>0||Boolean(String(row?.notes||'').trim())||Boolean(row?.item_id&&row?.qty!==''));
}

/**
 * New rows that are ready, and a message per incomplete row (by its sheet row number).
 * itemsFor(contractorId, date) → the items allowed for that contractor on that day (optional).
 */
export function validateOutputDrafts(rows=[],{itemsFor=null,from='',to=''}={}){
  const ready=[];
  const errors=[];
  (rows||[]).forEach((row,index)=>{
    if(!outputDraftUsed(row))return;
    const label=`الصف ${index+1}`;
    if(!row.item_id)errors.push(`${label}: اختر البند.`);
    else if(!(number(row.qty)>0))errors.push(`${label}: الكمية المنفذة مطلوبة.`);
    else if(itemsFor&&!row.date)errors.push(`${label}: اكتب التاريخ.`);
    else if(itemsFor&&((from&&row.date<from)||(to&&row.date>to)))errors.push(`${label}: التاريخ خارج فترة العرض — وسّع الفلترة لتشمله.`);
    else if(itemsFor&&!row.contractor_id)errors.push(`${label}: اختر المقاول.`);
    else if(itemsFor&&!itemsFor(row.contractor_id,row.date).some((item)=>item.id===row.item_id))errors.push(`${label}: البند غير مسند لهذا المقاول في ${row.date}.`);
    else ready.push(row);
  });
  return Object.freeze({ready,errors});
}
