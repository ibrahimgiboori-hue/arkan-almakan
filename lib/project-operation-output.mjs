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
