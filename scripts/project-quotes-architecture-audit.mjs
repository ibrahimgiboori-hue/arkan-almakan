import fs from 'node:fs';
import path from 'node:path';
import {
  PROJECT_QUOTE_DEFAULTS,
  buildProjectQuoteRecord,
  buildProjectQuotesWorkspace,
  projectQuoteApprovalLabel,
  projectQuoteCanCreate,
} from '../lib/project-quotes.mjs';

const root=process.cwd();
const failures=[];
const exists=(relative)=>fs.existsSync(path.join(root,relative));
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const fail=(message)=>failures.push(message);

const files={
  domain:'lib/project-quotes.mjs',
  adapter:'lib/adapters/project-quotes-supabase.js',
  service:'lib/application/project-quotes-service.js',
  presentation:'app/dashboard/projects/[id]/quotes/page.js',
};
for(const [role,file] of Object.entries(files))if(!exists(file))fail(`${role}: missing ${file}`);

if(exists(files.domain)){
  const source=read(files.domain);
  for(const forbidden of ['@/lib/supabase','@supabase/','react','next/','supabase.','.from(','.rpc(','window.','document.','navigator.']){
    if(source.includes(forbidden))fail(`project quotes domain leaked infrastructure/presentation: ${forbidden}`);
  }
  for(const required of ['PROJECT_QUOTE_DEFAULTS','projectQuoteCanCreate','projectQuoteApprovalLabel','buildProjectQuotesWorkspace','buildProjectQuoteRecord']){
    if(!source.includes(required))fail(`project quotes domain missing rule: ${required}`);
  }
}

if(exists(files.adapter)){
  const source=read(files.adapter);
  if(!source.includes("@/lib/supabase"))fail('project quotes adapter must own Supabase.');
  for(const required of [
    'projectQuotesSupabaseRepository',"from('quotations')","from('v_quote_totals')",".in('id',ids)",
    "from('v_my_capabilities')","rpc('fn_is_primary_user'","rpc('fn_quotation_approval_state'",
    "rpc('next_document_number'","from('app_settings')",'insertQuote',
  ])if(!source.includes(required))fail(`project quotes adapter missing persistence/access contract: ${required}`);
  if(/from\('v_quote_totals'\)\.select\('\*'\)(?!\.in\('id',ids\))/.test(source))fail('project quote totals must stay constrained to the current project quote ids.');
}

if(exists(files.service)){
  const source=read(files.service);
  for(const forbidden of ['@/lib/supabase','@supabase/','supabase.','.from(','.rpc(','window.','document.','navigator.']){
    if(source.includes(forbidden))fail(`project quotes service leaked infrastructure/presentation: ${forbidden}`);
  }
  for(const required of [
    'projectQuotesService','createProjectQuotesService','loadWorkspace','createQuote','Promise.allSettled',
    'repository.loadTotals','repository.loadCapabilities','repository.isPrimaryUser','repository.loadApprovalState',
    'repository.nextDocumentNumber','repository.loadSettings','repository.insertQuote','saved.project_id!==projectId','readErrors',
  ])if(!source.includes(required))fail(`project quotes service missing orchestration/proof contract: ${required}`);
}

if(exists(files.presentation)){
  const source=read(files.presentation);
  if(!source.includes("@/lib/application/project-quotes-service"))fail('project quote register must use the application service.');
  if(!source.includes("@/lib/project-quotes.mjs"))fail('project quote register must consume domain contracts.');
  for(const forbidden of ["@/lib/supabase",'@supabase/','supabase.','.from(','.rpc(','v_my_capabilities','fn_is_primary_user','next_document_number','v_quote_totals']){
    if(source.includes(forbidden))fail(`project quote register leaked persistence/access detail: ${forbidden}`);
  }
  for(const required of ['projectQuotesService.loadWorkspace','projectQuotesService.createQuote','projectQuoteApprovalLabel','workspace.readErrors']){
    if(!source.includes(required))fail(`project quote register lost governed behavior: ${required}`);
  }
}

const caps=[
  {capability_key:'projects.quotes.view',scope_type:'all',scope_key:null,source_key:'x'},
  {capability_key:'projects.quotes.create',scope_type:'project',scope_key:'p1',source_key:'x'},
];
if(!projectQuoteCanCreate({capabilities:caps,projectId:'p1'})||projectQuoteCanCreate({capabilities:caps,projectId:'p2'}))fail('project quote scoped-create capability invariant changed.');
if(!projectQuoteCanCreate({capabilities:[],primary:true,projectId:'p2'}))fail('primary-user quote create invariant changed.');
if(projectQuoteApprovalLabel({workflow_id:'w1',workflow_status:'pending',target_group_label:'المالية'})!=='لدى المالية')fail('project quote approval label invariant changed.');
const record=buildProjectQuoteRecord({projectId:'p1',kind:'boq',language:'en',quoteNo:'BOQ-1',settings:{vat_rate:0.15},systemVatRate:0.15});
if(record.project_id!=='p1'||record.doc_kind!=='boq'||record.language!=='en'||record.show_qty!==true||record.show_en_desc!==true||record.client_name!==PROJECT_QUOTE_DEFAULTS.en.clientName)fail('project quote creation payload invariant changed.');
const workspace=buildProjectQuotesWorkspace({
  projectId:'p1',
  quotes:[{id:'q1'},{id:'q2'}],
  totals:[{id:'q1',grand_total:100}],
  approvalStates:[{quoteId:'q1',state:{workflow_status:'approved'}},{quoteId:'q2',state:{workflow_status:'pending'}}],
  capabilities:caps,
});
if(workspace.summary.count!==2||workspace.summary.approved!==1||workspace.summary.pending!==1||workspace.totals.q1.grand_total!==100||!workspace.canCreate)fail('project quote workspace summary invariant changed.');

if(failures.length){
  console.error('\nProject quotes architecture audit failed:\n');
  failures.forEach((item)=>console.error(`- ${item}`));
  process.exit(1);
}

console.log('Project quotes architecture audit passed: project-scoped totals, access projection, approval states, guarded creation and presentation are separated and controlled.');
