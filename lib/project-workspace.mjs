import { normalizeCapabilities } from './core/capabilities.js';

export const PROJECT_WORKSPACE_EDITABLE_FIELDS=Object.freeze([
  'name_ar','city','site_address','stage','supply_scope','source_kind','our_role','entity_id',
  'originator_id','supervisor_id','signed_date','commencement_date','duration_days','delay_penalty_text',
  'delay_penalty_daily','advance_pct','advance_amount','retention_pct','payment_terms_days','claim_basis','notes',
]);

const editableFieldSet=new Set(PROJECT_WORKSPACE_EDITABLE_FIELDS);

export function buildProjectWorkspaceAccess({projectId,capabilities=[],isPrimaryUser=false,isSystemAdmin=false}={}){
  const normalized=normalizeCapabilities(capabilities);
  const scoped=normalized.filter((capability)=>
    capability.module_key==='projects'&&
    (capability.scope_type==='all'||(capability.scope_type==='project'&&capability.scope_key===projectId))
  );
  const systemFull=Boolean(isPrimaryUser||isSystemAdmin);
  const portalFull=systemFull||scoped.some((capability)=>capability.source_key==='projects_full_access');
  return Object.freeze({
    full:portalFull,
    keys:Object.freeze([...new Set(scoped.map((capability)=>capability.capability_key))]),
  });
}

export function projectWorkspaceCanWrite(activeView,access={full:false,keys:[]}){
  const keys=new Set(access?.keys||[]);
  const has=(key)=>Boolean(access?.full)||keys.has(key);
  if(activeView==='scope')return has('projects.scope.edit');
  if(activeView==='progress')return has('projects.progress.edit');
  if(activeView==='claims')return has('projects.claims.edit')||has('projects.claims.create');
  if(activeView==='docs')return has('projects.documents.edit')||has('projects.documents.create')||has('projects.materials.edit')||has('projects.materials.create');
  return has('projects.projects.edit');
}

export function normalizeProjectWorkspacePatch(fields={}){
  const patch={};
  for(const [key,value] of Object.entries(fields||{}))if(editableFieldSet.has(key))patch[key]=value;
  if(!Object.keys(patch).length)throw new Error('لا توجد حقول مشروع مسموح بحفظها في هذا التعديل.');
  return Object.freeze(patch);
}

export function selectProjectSetupAction(rows=[]){
  return (rows||[]).find((row)=>row?.source_type==='project_setup')||null;
}

export function projectWorkspaceOverview(project={},financials={},totals={}){
  const contractValue=Number(
    totals?.contract_value_effective!==undefined&&totals?.contract_value_effective!==null
      ? totals.contract_value_effective
      : (project?.contract_value||0)
  );
  return Object.freeze({
    contractValue,
    contractApproved:Boolean(totals?.contract_value_approved),
    profit:Number(financials?.current_profit||0),
    daysLeft:financials?.days_remaining,
  });
}

export function projectSetupState(action){
  const status=action?.approval_status||null;
  return Object.freeze({
    pending:status==='pending',
    returned:status==='returned',
    rejected:status==='rejected',
  });
}
