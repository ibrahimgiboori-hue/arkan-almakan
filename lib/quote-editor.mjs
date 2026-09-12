export const QUOTE_EDITOR_RETIRED_PRINT_KEYS=Object.freeze(new Set([
  'show_letterhead','margin_top_mm','margin_bottom_mm','margin_side_mm',
  'stamp_size_mm','stamp_x_mm','stamp_y_mm','sign_size_mm','sign_x_mm','sign_y_mm',
]));

export const QUOTE_EDITOR_TOGGLES=Object.freeze([
  ['show_unit','عمود الوحدة'],
  ['show_qty','عمود الكمية'],
  ['show_unit_price','عمود الفئة'],
  ['show_line_total','عمود الإجمالي'],
  ['show_en_desc','وصف إنجليزي'],
]);

export const QUOTE_EDITOR_SECTIONS=Object.freeze([
  ['show_intro','النص الافتتاحي'],
  ['show_payments','الدفعات المقترحة'],
  ['show_terms','الشروط والأحكام'],
  ['show_closing','النص الختامي'],
  ['show_bank','الحساب البنكي'],
  ['show_stamp','الختم'],
  ['show_signature','التوقيع'],
]);

export const QUOTE_PARTY_FIELDS=Object.freeze([
  'id','client_kind','client_representative_name','client_representative_title',
  'arkan_signatory_employee_id','arkan_signatory_name','arkan_signatory_title',
]);

const textOrNull=(value)=>{
  const text=String(value ?? '').trim();
  return text || null;
};

export function sanitizeQuotePatch(fields={}){
  const clean={};
  for(const [key,value] of Object.entries(fields || {})){
    if(QUOTE_EDITOR_RETIRED_PRINT_KEYS.has(key))continue;
    if(key==='id'||key==='quote_no'||key==='project_id')continue;
    clean[key]=value;
  }
  return Object.freeze(clean);
}

export function sanitizeQuotePartyPatch(fields={}){
  const allowed=new Set(QUOTE_PARTY_FIELDS.filter((key)=>key!=='id'));
  const clean={};
  for(const [key,value] of Object.entries(fields || {}))if(allowed.has(key))clean[key]=value;
  if(!Object.keys(clean).length)throw new Error('لا توجد بيانات أطراف صالحة للحفظ.');
  return Object.freeze(clean);
}

export function nextQuoteSortOrder(rows=[]){
  return (rows.length?Math.max(...rows.map((row)=>Number(row.sort_order || 0))):0)+1;
}

export function buildQuoteLineRecord({quoteId,kind='item',sortOrder}){
  if(!quoteId)throw new Error('عرض السعر غير محدد.');
  const lineKind=kind==='title'?'title':'item';
  return Object.freeze({
    quotation_id:quoteId,
    sort_order:Number(sortOrder),
    kind:lineKind,
    description_ar:lineKind==='title'?'عنوان قسم':'',
    unit:lineKind==='item'?'م2':null,
    qty:1,
    unit_price:0,
  });
}

export function sanitizeQuoteLinePatch(fields={}){
  const clean={...fields};
  for(const key of ['id','quotation_id','sort_order','created_at'])delete clean[key];
  if(!Object.keys(clean).length)throw new Error('لا يوجد تعديل صالح على البند.');
  return Object.freeze(clean);
}

export function workItemSelectionPatch(workItem){
  if(!workItem?.id)throw new Error('بند الدليل غير موجود.');
  return Object.freeze({
    work_item_id:workItem.id,
    description_ar:workItem.description_ar || '',
    description_en:workItem.description_en || null,
    unit:workItem.unit || null,
    unit_price:Number(workItem.last_sell_price || 0),
    cost_price:workItem.last_cost_price ?? null,
  });
}

export function workItemRecordFromLine(line){
  if(!textOrNull(line?.description_ar))throw new Error('اكتب وصف البند قبل حفظه في الدليل.');
  return Object.freeze({
    description_ar:textOrNull(line.description_ar),
    description_en:textOrNull(line.description_en),
    unit:textOrNull(line.unit),
    last_sell_price:Number(line.unit_price || 0),
    last_cost_price:line.cost_price==null||line.cost_price===''?null:Number(line.cost_price),
  });
}

export function buildQuotePaymentRecord({quoteId,sortOrder}){
  if(!quoteId)throw new Error('عرض السعر غير محدد.');
  return Object.freeze({quotation_id:quoteId,sort_order:Number(sortOrder),label:'دفعة',percent:0});
}

export function sanitizeQuotePaymentPatch(fields={}){
  const allowed=new Set(['label','percent','amount','notes','trigger_note']);
  const clean={};
  for(const [key,value] of Object.entries(fields || {}))if(allowed.has(key))clean[key]=value;
  if(!Object.keys(clean).length)throw new Error('لا يوجد تعديل صالح على الدفعة.');
  return Object.freeze(clean);
}

export function buildQuoteEditorWorkspace({quote,lines=[],payments=[],workItems=[],presets=[]}={}){
  if(!quote?.id)throw new Error('لم يُعثر على هذا العرض.');
  return Object.freeze({
    quote:Object.freeze({...quote}),
    lines:Object.freeze([...(lines || [])]),
    payments:Object.freeze([...(payments || [])]),
    workItems:Object.freeze([...(workItems || [])]),
    presets:Object.freeze([...(presets || [])]),
  });
}
