import { supabase } from '@/lib/supabase';

const EVIDENCE_BUCKET='site-docs';
const EMPLOYEE_FIELDS='id,full_name_ar,employee_no,status';
const TRANSACTION_FIELDS='id,direction,trx_date,amount,category,beneficiary,notes,charge_to,contractor_id,is_recovered,recovered_ref,owner_approved,document_path,created_at';

function safeEvidenceName(name='evidence'){
  const parts=String(name).split('.');
  const ext=parts.length>1?`.${parts.pop().toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,10)}`:'';
  const base=parts.join('.').replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,60)||'evidence';
  return `${base}${ext}`;
}

export async function loadProjectCustodyWorkspaceSource(projectId){
  const [balanceQ,custodyQ,linksQ,eligibleEmployeesQ]=await Promise.all([
    supabase.from('v_custody_balance').select('custody_id,custody_no,employee_id,project_id,status,balance').eq('project_id',projectId),
    supabase.from('custodies').select('id,custody_no,employee_id,project_id,is_restricted,opened_at,status,purpose').eq('project_id',projectId).order('opened_at',{ascending:false}),
    supabase.from('project_contractors').select('contractor_id,is_active').eq('project_id',projectId).eq('is_active',true),
    supabase.from('employees').select(EMPLOYEE_FIELDS).in('status',['active','on_leave']).order('full_name_ar'),
  ]);
  const firstError=[balanceQ,custodyQ,linksQ,eligibleEmployeesQ].find((result)=>result.error)?.error;
  if(firstError)throw firstError;

  const custodies=custodyQ.data||[];
  const eligibleEmployees=eligibleEmployeesQ.data||[];
  const employeeIds=[...new Set(custodies.map((row)=>row.employee_id).filter(Boolean))];
  const contractorIds=[...new Set((linksQ.data||[]).map((row)=>row.contractor_id).filter(Boolean))];
  const missingEmployeeIds=employeeIds.filter((id)=>!eligibleEmployees.some((employee)=>employee.id===id));

  const [missingEmployeesQ,contractorsQ]=await Promise.all([
    missingEmployeeIds.length?supabase.from('employees').select(EMPLOYEE_FIELDS).in('id',missingEmployeeIds):Promise.resolve({data:[],error:null}),
    contractorIds.length?supabase.from('contractors').select('id,name_ar,operation_alias').in('id',contractorIds):Promise.resolve({data:[],error:null}),
  ]);
  if(missingEmployeesQ.error)throw missingEmployeesQ.error;
  if(contractorsQ.error)throw contractorsQ.error;

  return {
    balances:balanceQ.data||[],
    custodies,
    eligibleEmployees,
    missingEmployees:missingEmployeesQ.data||[],
    contractors:contractorsQ.data||[],
  };
}

export async function loadProjectCustodyTransactions(custodyId){
  if(!custodyId)return [];
  const query=await supabase.from('custody_transactions')
    .select(TRANSACTION_FIELDS)
    .eq('custody_id',custodyId)
    .order('trx_date',{ascending:false})
    .order('created_at',{ascending:false});
  if(query.error)throw query.error;
  return query.data||[];
}

export async function openProjectCustody(payload){
  const query=await supabase.rpc('fn_open_project_custody',payload);
  if(query.error)throw query.error;
  return query.data||{};
}

export async function linkProjectCustodyTransactionEvidence(transactionId,path){
  const query=await supabase.from('custody_transactions').update({document_path:path}).eq('id',transactionId).select('id').single();
  if(query.error)throw query.error;
  return query.data;
}

export async function loadProjectCustodyProof(custodyId){
  const query=await supabase.from('custodies').select('id,custody_no').eq('id',custodyId).single();
  if(query.error)throw query.error;
  return query.data;
}

export async function createProjectCustodyTransaction(payload){
  const query=await supabase.from('custody_transactions').insert(payload).select('id').single();
  if(query.error)throw query.error;
  return query.data;
}

export async function loadProjectCustodyTransactionProof(transactionId){
  const query=await supabase.from('custody_transactions').select('id,amount,direction,trx_date,document_path').eq('id',transactionId).single();
  if(query.error)throw query.error;
  return query.data;
}

export async function settleProjectCustody(custodyId){
  return supabase.from('custodies').update({status:'settled'}).eq('id',custodyId).eq('status','open').select('id').maybeSingle();
}

export async function uploadProjectCustodyEvidence({projectId,custodyId,file}){
  if(!file)return null;
  const id=typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path=`projects/${projectId}/custody/${custodyId}/${id}-${safeEvidenceName(file.name)}`;
  const query=await supabase.storage.from(EVIDENCE_BUCKET).upload(path,file,{upsert:false,contentType:file.type||undefined,cacheControl:'3600'});
  if(query.error)throw query.error;
  return path;
}

export async function removeProjectCustodyEvidence(path){
  if(!path)return true;
  const query=await supabase.storage.from(EVIDENCE_BUCKET).remove([path]);
  if(query.error)throw query.error;
  return true;
}

export async function createProjectCustodyEvidenceUrl(path){
  if(!path)return null;
  const query=await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrl(path,300);
  if(query.error)throw query.error;
  if(!query.data?.signedUrl)throw new Error('تعذر إنشاء رابط الإثبات');
  return query.data.signedUrl;
}

export const projectCustodySupabaseRepository=Object.freeze({
  loadWorkspaceSource:loadProjectCustodyWorkspaceSource,
  loadTransactions:loadProjectCustodyTransactions,
  openCustody:openProjectCustody,
  linkTransactionEvidence:linkProjectCustodyTransactionEvidence,
  loadCustodyProof:loadProjectCustodyProof,
  createTransaction:createProjectCustodyTransaction,
  loadTransactionProof:loadProjectCustodyTransactionProof,
  settleCustody:settleProjectCustody,
  uploadEvidence:uploadProjectCustodyEvidence,
  removeEvidence:removeProjectCustodyEvidence,
  createEvidenceUrl:createProjectCustodyEvidenceUrl,
});
