export const PROJECT_DOCUMENT_KINDS = Object.freeze([
  'محضر استلام','تقرير يومي','تقرير أسبوعي','صورة موقع','مراسلة مع المالك','مخطط','أخرى',
]);

export function projectDocumentsMode(mode='all') {
  return Object.freeze({
    showDocs: mode === 'all' || mode === 'documents',
    showMaterials: mode === 'all' || mode === 'materials',
  });
}

const textOrNull = (value) => {
  const text=String(value ?? '').trim();
  return text || null;
};

const finiteNumber = (value, fallback=0) => {
  if (value === '' || value == null) return fallback;
  const number=Number(value);
  if (!Number.isFinite(number)) throw new Error('أدخل قيمة رقمية صحيحة.');
  return number;
};

export function buildSiteDocumentRecord({projectId,draft,filePath=null}) {
  if (!projectId) throw new Error('المشروع غير محدد.');
  const title=textOrNull(draft?.title);
  if (!title) throw new Error('عنوان المستند مطلوب.');
  const kind=PROJECT_DOCUMENT_KINDS.includes(draft?.doc_kind) ? draft.doc_kind : PROJECT_DOCUMENT_KINDS[0];
  return Object.freeze({
    project_id:projectId,
    doc_kind:kind,
    title,
    description:textOrNull(draft?.description),
    file_path:filePath || null,
  });
}

export function siteDocumentStoragePath({projectId,fileName,stamp=Date.now()}) {
  if (!projectId) throw new Error('المشروع غير محدد.');
  const raw=String(fileName || 'file');
  const ext=(raw.includes('.') ? raw.split('.').pop() : '')
    .toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,10);
  return `${projectId}/${stamp}${ext ? `.${ext}` : ''}`;
}

export function buildMaterialRecord({projectId,draft,receivedAt}) {
  if (!projectId) throw new Error('المشروع غير محدد.');
  const materialName=textOrNull(draft?.material_name);
  if (!materialName) throw new Error('اسم المادة مطلوب.');
  return Object.freeze({
    project_id:projectId,
    material_name:materialName,
    unit:textOrNull(draft?.unit),
    qty_in:finiteNumber(draft?.qty_in,0),
    unit_cost:finiteNumber(draft?.unit_cost,0),
    supplier:textOrNull(draft?.supplier),
    charge_to:draft?.charge_to || 'arkan',
    received_at:receivedAt,
  });
}

const MATERIAL_PATCH_FIELDS = new Set(['material_name','unit','qty_in','qty_used','unit_cost','supplier','charge_to','received_at']);
export function normalizeMaterialPatch(fields={}) {
  const patch={};
  for (const [key,value] of Object.entries(fields)) {
    if (!MATERIAL_PATCH_FIELDS.has(key)) continue;
    if (['qty_in','qty_used','unit_cost'].includes(key)) patch[key]=finiteNumber(value,0);
    else if (['unit','supplier'].includes(key)) patch[key]=textOrNull(value);
    else if (key === 'material_name') {
      const name=textOrNull(value);
      if (!name) throw new Error('اسم المادة مطلوب.');
      patch[key]=name;
    } else patch[key]=value;
  }
  if (!Object.keys(patch).length) throw new Error('لا يوجد تعديل صالح للحفظ.');
  return Object.freeze(patch);
}

export function buildProjectDocumentsWorkspace({siteDocs=[],centralDocs=[],materials=[]}={}) {
  return Object.freeze({
    siteDocs:Object.freeze([...(siteDocs || [])]),
    centralDocs:Object.freeze([...(centralDocs || [])]),
    materials:Object.freeze([...(materials || [])]),
  });
}
