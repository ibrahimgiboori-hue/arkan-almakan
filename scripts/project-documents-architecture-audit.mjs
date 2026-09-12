import fs from 'node:fs';
import path from 'node:path';
import {
  PROJECT_DOCUMENT_KINDS,
  buildMaterialRecord,
  buildSiteDocumentRecord,
  normalizeMaterialPatch,
  projectDocumentsMode,
  siteDocumentStoragePath,
} from '../lib/project-documents.mjs';

const root=process.cwd();
const failures=[];
const exists=(relative)=>fs.existsSync(path.join(root,relative));
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const fail=(message)=>failures.push(message);

const files={
  domain:'lib/project-documents.mjs',
  adapter:'lib/adapters/project-documents-supabase.js',
  service:'lib/application/project-documents-service.js',
  presentation:'components/ProjDocs.js',
};
for(const [role,file] of Object.entries(files))if(!exists(file))fail(`${role}: missing ${file}`);

if(exists(files.domain)){
  const source=read(files.domain);
  for(const forbidden of ['@/lib/supabase','@supabase/','react','next/','supabase.','.from(','.rpc(','window.','document.','navigator.']){
    if(source.includes(forbidden))fail(`project documents domain leaked infrastructure/presentation: ${forbidden}`);
  }
  for(const required of ['PROJECT_DOCUMENT_KINDS','projectDocumentsMode','buildSiteDocumentRecord','siteDocumentStoragePath','buildMaterialRecord','normalizeMaterialPatch','buildProjectDocumentsWorkspace']){
    if(!source.includes(required))fail(`project documents domain missing rule: ${required}`);
  }
}

if(exists(files.adapter)){
  const source=read(files.adapter);
  if(!source.includes("@/lib/supabase"))fail('project documents adapter must own Supabase.');
  for(const required of [
    'projectDocumentsSupabaseRepository',"from('site_documents')","from('documents')","from('project_materials')",
    "storage.from('site-docs').upload","storage.from('site-docs').remove","storage.from('site-docs').createSignedUrl",
    ".eq('project_id',projectId).eq('id',id)",
  ])if(!source.includes(required))fail(`project documents adapter missing scoped persistence/storage contract: ${required}`);
}

if(exists(files.service)){
  const source=read(files.service);
  for(const forbidden of ['@/lib/supabase','@supabase/','supabase.','.from(','.rpc(','window.','document.','navigator.']){
    if(source.includes(forbidden))fail(`project documents service leaked infrastructure/presentation: ${forbidden}`);
  }
  for(const required of [
    'projectDocumentsService','createProjectDocumentsService','loadWorkspace','addSiteDocument','openSiteDocument','deleteSiteDocument',
    'addMaterial','updateMaterial','deleteMaterial','removeSiteFiles','cleanupWarning','todayIsoInRiyadh','requireSingle',
  ])if(!source.includes(required))fail(`project documents service missing orchestration/proof contract: ${required}`);
}

if(exists(files.presentation)){
  const source=read(files.presentation);
  if(!source.includes("@/lib/application/project-documents-service"))fail('ProjDocs must use the project documents application service.');
  if(!source.includes("@/lib/project-documents.mjs"))fail('ProjDocs must consume project document domain contracts.');
  for(const forbidden of ["@/lib/supabase",'@supabase/','supabase.','.from(','.rpc(',"storage.from('"]){
    if(source.includes(forbidden))fail(`ProjDocs leaked persistence/storage detail: ${forbidden}`);
  }
  for(const required of [
    'projectDocumentsService.loadWorkspace','projectDocumentsService.addSiteDocument','projectDocumentsService.openSiteDocument',
    'projectDocumentsService.deleteSiteDocument','projectDocumentsService.addMaterial','projectDocumentsService.updateMaterial','projectDocumentsService.deleteMaterial',
  ])if(!source.includes(required))fail(`ProjDocs lost governed behavior: ${required}`);
}

if(!PROJECT_DOCUMENT_KINDS.includes('محضر استلام')||!PROJECT_DOCUMENT_KINDS.includes('صورة موقع'))fail('project document kind catalog changed unexpectedly.');
const all=projectDocumentsMode('all');
const docs=projectDocumentsMode('documents');
const materials=projectDocumentsMode('materials');
if(!all.showDocs||!all.showMaterials||!docs.showDocs||docs.showMaterials||materials.showDocs||!materials.showMaterials)fail('project document mode invariant changed.');
const record=buildSiteDocumentRecord({projectId:'p1',draft:{doc_kind:'محضر استلام',title:'  محضر  ',description:'  test  '},filePath:'p1/1.pdf'});
if(record.project_id!=='p1'||record.title!=='محضر'||record.description!=='test'||record.file_path!=='p1/1.pdf')fail('site document normalization invariant changed.');
const storagePath=siteDocumentStoragePath({projectId:'p1',fileName:'test.PD F',stamp:123});
if(storagePath!=='p1/123.pdf')fail('site document storage path sanitization invariant changed.');
const material=buildMaterialRecord({projectId:'p1',draft:{material_name:' أسمنت ',qty_in:'10',unit_cost:'5',charge_to:'arkan'},receivedAt:'2026-09-12'});
if(material.material_name!=='أسمنت'||material.qty_in!==10||material.unit_cost!==5||material.received_at!=='2026-09-12')fail('project material payload invariant changed.');
const patch=normalizeMaterialPatch({qty_used:'4',evil:'x'});
if(patch.qty_used!==4||Object.hasOwn(patch,'evil'))fail('project material patch whitelist invariant changed.');

if(failures.length){
  console.error('\nProject documents architecture audit failed:\n');
  failures.forEach((item)=>console.error(`- ${item}`));
  process.exit(1);
}

console.log('Project documents architecture audit passed: site documents, central project documents, scoped material mutations, storage cleanup and presentation are separated and guarded.');
