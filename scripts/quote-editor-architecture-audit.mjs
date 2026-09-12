import fs from 'node:fs';
import path from 'node:path';
import {
  QUOTE_EDITOR_RETIRED_PRINT_KEYS,
  buildQuoteLineRecord,
  buildQuotePaymentRecord,
  sanitizeQuoteLinePatch,
  sanitizeQuotePatch,
  sanitizeQuotePaymentPatch,
  workItemSelectionPatch,
} from '../lib/quote-editor.mjs';

const root=process.cwd();
const failures=[];
const exists=(relative)=>fs.existsSync(path.join(root,relative));
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const fail=(message)=>failures.push(message);

const files={
  domain:'lib/quote-editor.mjs',
  adapter:'lib/adapters/quote-editor-supabase.js',
  service:'lib/application/quote-editor-service.js',
  editor:'app/dashboard/quotes/[id]/page.js',
  party:'components/quotes/QuotePartyGovernancePanel.js',
};
for(const [role,file] of Object.entries(files))if(!exists(file))fail(`${role}: missing ${file}`);

if(exists(files.domain)){
  const source=read(files.domain);
  for(const forbidden of ['@/lib/supabase','@supabase/','react','next/','supabase.','.from(','.rpc(','window.','document.','navigator.']){
    if(source.includes(forbidden))fail(`quote editor domain leaked infrastructure/presentation: ${forbidden}`);
  }
  for(const required of [
    'QUOTE_EDITOR_RETIRED_PRINT_KEYS','QUOTE_EDITOR_TOGGLES','QUOTE_EDITOR_SECTIONS','QUOTE_PARTY_FIELDS',
    'sanitizeQuotePatch','sanitizeQuotePartyPatch','nextQuoteSortOrder','buildQuoteLineRecord','sanitizeQuoteLinePatch',
    'workItemSelectionPatch','workItemRecordFromLine','buildQuotePaymentRecord','sanitizeQuotePaymentPatch','buildQuoteEditorWorkspace',
  ])if(!source.includes(required))fail(`quote editor domain missing contract: ${required}`);
}

if(exists(files.adapter)){
  const source=read(files.adapter);
  if(!source.includes("@/lib/supabase"))fail('quote editor adapter must own Supabase.');
  for(const required of [
    'quoteEditorSupabaseRepository',"from('quotations')","from('quotation_lines')","from('quotation_payments')",
    "from('work_items')","from('quote_presets')","from('employees')","rpc('quote_line_insert_after'",
    ".eq('quotation_id',quoteId).eq('id',lineId)", ".eq('quotation_id',quoteId).eq('id',paymentId)",
  ])if(!source.includes(required))fail(`quote editor adapter missing scoped persistence contract: ${required}`);
}

if(exists(files.service)){
  const source=read(files.service);
  for(const forbidden of ['@/lib/supabase','@supabase/','supabase.','.from(','.rpc(','window.','document.','navigator.','this.saveLine']){
    if(source.includes(forbidden))fail(`quote editor service leaked infrastructure/self-dispatch detail: ${forbidden}`);
  }
  for(const required of [
    'quoteEditorService','createQuoteEditorService','saveLineInternal','loadWorkspace','patchQuote','addLine','insertAfter',
    'saveLine','deleteLine','moveLine','pickWorkItem','saveLineToLibrary','addPayment','updatePayment','deletePayment',
    'loadParty','patchParty','saved.quotation_id!==quoteId','saved.id!==quoteId','usageWarning',
  ])if(!source.includes(required))fail(`quote editor service missing guarded workflow: ${required}`);
  if(!source.includes("setLineSort(quoteId,a.id,-1)")||!source.includes('setLineSort(quoteId,b.id,b.sort_order)')){
    fail('quote editor move must reserve a temporary order and attempt compensation on failure.');
  }
}

for(const presentation of [files.editor,files.party]){
  if(!exists(presentation))continue;
  const source=read(presentation);
  for(const forbidden of ["@/lib/supabase",'@supabase/','supabase.','.from(','.rpc(',"from('quotations')","from('quotation_lines')","from('quotation_payments')","from('work_items')"]){
    if(source.includes(forbidden))fail(`${presentation}: presentation leaked persistence detail: ${forbidden}`);
  }
  if(!source.includes("@/lib/application/quote-editor-service"))fail(`${presentation}: must use the quote editor application service.`);
}
if(exists(files.editor)){
  const source=read(files.editor);
  for(const required of [
    'quoteEditorService.loadWorkspace','quoteEditorService.patchQuote','quoteEditorService.addLine','quoteEditorService.insertAfter',
    'quoteEditorService.saveLine','quoteEditorService.deleteLine','quoteEditorService.moveLine','quoteEditorService.pickWorkItem',
    'quoteEditorService.saveLineToLibrary','quoteEditorService.addPayment','quoteEditorService.updatePayment','quoteEditorService.deletePayment',
    'QUOTE_EDITOR_TOGGLES as TOGGLES','QUOTE_EDITOR_SECTIONS as SECTIONS',
  ])if(!source.includes(required))fail(`quote editor presentation lost governed behavior: ${required}`);
}
if(exists(files.party)){
  const source=read(files.party);
  for(const required of ['quoteEditorService.loadParty','quoteEditorService.patchParty','employeeSignatoryPatch','manualSignatoryPatch']){
    if(!source.includes(required))fail(`quote party presentation lost governed behavior: ${required}`);
  }
}

const clean=sanitizeQuotePatch({client_name:'x',show_letterhead:false,margin_top_mm:2,id:'q1',project_id:'p1'});
if(clean.client_name!=='x'||Object.hasOwn(clean,'show_letterhead')||Object.hasOwn(clean,'margin_top_mm')||Object.hasOwn(clean,'id')||Object.hasOwn(clean,'project_id'))fail('quote patch retired/identity field invariant changed.');
if(!QUOTE_EDITOR_RETIRED_PRINT_KEYS.has('margin_top_mm')||!QUOTE_EDITOR_RETIRED_PRINT_KEYS.has('stamp_x_mm'))fail('retired print geometry key catalog changed.');
const line=buildQuoteLineRecord({quoteId:'q1',kind:'item',sortOrder:3});
if(line.quotation_id!=='q1'||line.sort_order!==3||line.kind!=='item'||line.qty!==1)fail('quote line creation invariant changed.');
const linePatch=sanitizeQuoteLinePatch({quotation_id:'evil',sort_order:99,description_ar:'بند'});
if(Object.hasOwn(linePatch,'quotation_id')||Object.hasOwn(linePatch,'sort_order')||linePatch.description_ar!=='بند')fail('quote line patch identity/order guard changed.');
const selection=workItemSelectionPatch({id:'w1',description_ar:'أعمال',description_en:'Works',unit:'م2',last_sell_price:12,last_cost_price:9});
if(selection.work_item_id!=='w1'||selection.unit_price!==12||selection.cost_price!==9)fail('work item selection projection changed.');
const payment=buildQuotePaymentRecord({quoteId:'q1',sortOrder:2});
if(payment.quotation_id!=='q1'||payment.sort_order!==2||payment.percent!==0)fail('quote payment creation invariant changed.');
const paymentPatch=sanitizeQuotePaymentPatch({trigger_note:'عند التوقيع',percent:25,evil:'x'});
if(paymentPatch.trigger_note!=='عند التوقيع'||paymentPatch.percent!==25||Object.hasOwn(paymentPatch,'evil'))fail('quote payment patch whitelist changed.');

if(failures.length){
  console.error('\nQuote editor architecture audit failed:\n');
  failures.forEach((item)=>console.error(`- ${item}`));
  process.exit(1);
}

console.log('Quote editor architecture audit passed: quote header, lines, ordering, work-item library, payments, party governance and presentation are separated with scoped verified mutations.');
