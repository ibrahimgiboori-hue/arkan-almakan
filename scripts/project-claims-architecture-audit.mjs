import fs from 'node:fs';
import path from 'node:path';
import {
  buildClaimAttachment,
  buildClaimCollection,
  buildClaimInvoice,
  buildCreateClaimPayload,
  buildProjectClaimsWorkspace,
  buildProjectMeasurementPayload,
  normalizeDraftClaimPatch,
  projectClaimApprovalDecision,
  projectClaimCurrentJourneyLabel,
  projectClaimJourneyState,
  projectClaimSelectedMeasurements,
} from '../lib/project-claims.mjs';

const root=process.cwd();
const failures=[];
const exists=(relative)=>fs.existsSync(path.join(root,relative));
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const fail=(message)=>failures.push(message);

const files={
  domain:'lib/project-claims.mjs',
  adapter:'lib/adapters/project-claims-supabase.js',
  service:'lib/application/project-claims-service.js',
  presentation:'components/ProjClaims.js',
};
for(const [role,file] of Object.entries(files))if(!exists(file))fail(`${role}: missing ${file}`);

if(exists(files.domain)){
  const source=read(files.domain);
  for(const forbidden of ['@/lib/supabase','@supabase/','react','next/','supabase.','.from(','.rpc(','window.','document.','navigator.']){
    if(source.includes(forbidden))fail(`project claims domain leaked infrastructure/presentation: ${forbidden}`);
  }
  for(const required of [
    'PROJECT_CLAIM_JOURNEY','buildProjectClaimsWorkspace','projectClaimDocsAt','projectClaimJourneyState','projectClaimCurrentJourneyLabel',
    'projectClaimSelectedMeasurements','buildProjectMeasurementPayload','buildCreateClaimPayload','projectClaimApprovalDecision',
    'buildClaimCollection','buildClaimInvoice','normalizeDraftClaimPatch','buildClaimAttachment','safeClaimFileName',
  ])if(!source.includes(required))fail(`project claims domain missing rule: ${required}`);
}

if(exists(files.adapter)){
  const source=read(files.adapter);
  if(!source.includes("@/lib/supabase"))fail('project claims adapter must own Supabase.');
  for(const required of [
    'projectClaimsSupabaseRepository',"from('progress_claims')","from('v_available_measurements')","from('v_item_measurement_status')",
    "from('op_attachments')","from('claim_lines')","from('item_measurements')",
    "rpc('record_item_measurement'","rpc('create_claim_from_measurements'","rpc('fn_submit_progress_claim_for_approval'",
    "rpc('fn_approval_decide'","rpc('record_claim_client_submission'","rpc('advance_claim'",
    "rpc('fn_claim_collect_to_treasury'","rpc('record_claim_invoice'","rpc('delete_claim_deep'",
    'uploadProjectClaimDocument','removeProjectClaimDocuments','createProjectClaimDocumentUrl',
  ])if(!source.includes(required))fail(`project claims adapter missing persistence/journey contract: ${required}`);
}

if(exists(files.service)){
  const source=read(files.service);
  for(const forbidden of ['@/lib/supabase','@supabase/','supabase.','.from(','.rpc(','window.','document.','navigator.']){
    if(source.includes(forbidden))fail(`project claims service leaked infrastructure/presentation: ${forbidden}`);
  }
  for(const required of [
    'projectClaimsService','createProjectClaimsService','loadWorkspace','recordMeasurement','completeHistoricalStart','editMeasurement','cancelMeasurement',
    'createClaim','ensureMeasureSheet','submitInternal','decideApproval','recordClientSubmission','recordOwnerApproval','collectClaim','recordInvoice',
    'uploadDocument','openDocument','updateDraftClaim','hardDelete','interpretGuardedWrite','verifyClaim','collectToTreasury','loadClaimProof',
  ])if(!source.includes(required))fail(`project claims service missing journey/orchestration contract: ${required}`);
  if(!source.includes("claim.status==='collected'"))fail('project claims service must verify collected state after treasury collection.');
  if(!source.includes('if(path){try{await repository.removeDocuments([path]);}catch{}}'))fail('project claims service must compensate an uploaded file if metadata linking fails.');
}

if(exists(files.presentation)){
  const source=read(files.presentation);
  if(!source.includes("@/lib/application/project-claims-service"))fail('project claims presentation must use the application service.');
  if(!source.includes("@/lib/project-claims.mjs"))fail('project claims presentation must consume domain projections.');
  if(!source.includes('data-project-claims-journey="engineered-v1"'))fail('project claims presentation must declare the engineered journey.');
  for(const forbidden of [
    "@/lib/supabase",'@supabase/','supabase.','.from(','.rpc(','interpretGuardedWrite',
    'fn_claim_collect_to_treasury','fn_approval_decide','record_claim_client_submission','delete_claim_deep',
  ])if(source.includes(forbidden))fail(`project claims presentation leaked persistence/journey implementation: ${forbidden}`);
  for(const required of [
    'projectClaimsService.loadWorkspace','projectClaimsService.createClaim','projectClaimsService.submitInternal','projectClaimsService.decideApproval',
    'projectClaimsService.recordClientSubmission','projectClaimsService.recordOwnerApproval','projectClaimsService.collectClaim',
    'projectClaimsService.recordInvoice','projectClaimsService.uploadDocument','projectClaimsService.hardDelete',
  ])if(!source.includes(required))fail(`project claims presentation lost journey action: ${required}`);
}

const workspace=buildProjectClaimsWorkspace({
  claims:[{id:'c1'}],
  available:[{measurement_id:'m1',amount:100}],
  attachments:[{id:'d1',entity_id:'c1',stage:'draft',doc_code:'claim_sheet'}],
  claimLines:[{claim_id:'c1',measurement_id:'m1'}],
  journeyContexts:[{claimId:'c1',data:{approval:{workflow:{id:'w1'}}},error:null}],
});
if(workspace.docs.c1?.length!==1||workspace.claimLines.c1?.length!==1||workspace.journeys.c1?.approval?.workflow?.id!=='w1')fail('project claims workspace projection invariant changed.');
const state=projectClaimJourneyState({status:'owner_approved',client_submitted_at:'2026-09-01'},{},false);
if(state.collection!=='current'||projectClaimCurrentJourneyLabel(state)!=='التحصيل')fail('project claim journey-state invariant changed.');
const selected=projectClaimSelectedMeasurements([{measurement_id:'m1',amount:100},{measurement_id:'m2',amount:50}],['m2']);
if(selected.rows.length!==1||selected.total!==50)fail('project claim selected-measurement invariant changed.');
const measurement=buildProjectMeasurementPayload({item:'i1',from:'2026-09-01',to:'2026-09-10',qty:'5',price:'12',ref:' R ',notes:' N '});
if(measurement.p_qty!==5||measurement.p_unit_price!==12||measurement.p_document_ref!=='R'||measurement.p_notes!=='N')fail('project measurement normalization invariant changed.');
const create=buildCreateClaimPayload('p1',['m1','m1','m2']);
if(create.p_measurement_ids.length!==2)fail('project claim creation de-duplication invariant changed.');
try{projectClaimApprovalDecision({workflowId:'w1',decision:'return',note:''});fail('claim approval allowed return without reason.');}catch{}
const collection=buildClaimCollection({claimId:'c1',accountId:'a1',date:'2026-09-12',reference:' T '});
if(collection.p_account_id!=='a1'||collection.p_reference!=='T')fail('claim collection payload invariant changed.');
const invoice=buildClaimInvoice({claimId:'c1',invoiceNo:' INV-1 ',date:'2026-09-12'});
if(invoice.p_invoice_no!=='INV-1')fail('claim invoice normalization invariant changed.');
const patch=normalizeDraftClaimPatch({retention_amount:'10',advance_recovery:'5',status:'collected'});
if(patch.retention_amount!==10||patch.advance_recovery!==5||Object.hasOwn(patch,'status'))fail('draft claim patch whitelist invariant changed.');
const attachment=buildClaimAttachment({claimId:'c1',stage:'draft',code:'claim_sheet',direction:'out',title:'محضر'});
if(attachment.entity_type!=='claim'||attachment.entity_id!=='c1')fail('claim attachment ownership invariant changed.');

if(failures.length){
  console.error('\nProject claims architecture audit failed:\n');
  failures.forEach((item)=>console.error(`- ${item}`));
  process.exit(1);
}

console.log('Project claims architecture audit passed: measurement, claim creation, approval journey, client submission, treasury collection, invoicing, documents and deletion are separated from persistence and presentation with guarded proofs.');
