import fs from 'node:fs';
import path from 'node:path';
import { selectAvailableProjectItems, buildProjectOutputPayload, summarizeProjectOutput } from '../lib/project-operation-output.mjs';
import { buildProjectFinancePayload, summarizeProjectFinanceDay } from '../lib/project-operation-finance.mjs';

const root=process.cwd();
const failures=[];
const exists=(relative)=>fs.existsSync(path.join(root,relative));
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const fail=(message)=>failures.push(message);

const tools={
  output:{
    domain:'lib/project-operation-output.mjs',
    adapter:'lib/adapters/project-operation-output-supabase.js',
    service:'lib/application/project-operation-output-service.js',
    presentation:'app/dashboard/projects/[id]/operations/output-panel.js',
  },
  finance:{
    domain:'lib/project-operation-finance.mjs',
    adapter:'lib/adapters/project-operation-finance-supabase.js',
    service:'lib/application/project-operation-finance-service.js',
    presentation:'app/dashboard/projects/[id]/operations/finance-panel.js',
  },
};

for(const [tool,files] of Object.entries(tools))for(const [role,file] of Object.entries(files))if(!exists(file))fail(`${tool} ${role}: missing ${file}`);

for(const [tool,files] of Object.entries(tools)){
  if(exists(files.domain)){
    const source=read(files.domain);
    for(const forbidden of ['@/lib/supabase','@supabase/','react','next/','supabase.from(','supabase.rpc(','window.','document.'])if(source.includes(forbidden))fail(`${tool} domain leaked infrastructure/presentation: ${forbidden}`);
  }
  if(exists(files.adapter)){
    const source=read(files.adapter);
    if(!source.includes("@/lib/supabase"))fail(`${tool} adapter must own Supabase.`);
  }
  if(exists(files.service)){
    const source=read(files.service);
    for(const forbidden of ['@/lib/supabase','@supabase/','supabase.from(','supabase.rpc(','window.','document.'])if(source.includes(forbidden))fail(`${tool} service leaked infrastructure/presentation: ${forbidden}`);
    if(!source.includes('saveOperationWithQueue'))fail(`${tool} service must use the verified operation write channel.`);
  }
  if(exists(files.presentation)){
    const source=read(files.presentation);
    for(const forbidden of ["@/lib/supabase",'@supabase/','supabase.from(','supabase.rpc(','saveOperationWithQueue'])if(source.includes(forbidden))fail(`${tool} presentation leaked infrastructure/write orchestration: ${forbidden}`);
  }
}

if(exists('app/dashboard/projects/[id]/operations/operation-panels.js'))fail('retired mixed operation-panels.js still exists after output/finance replacement.');

const items=[{id:'a'},{id:'b'}];
const available=selectAvailableProjectItems(items,[{project_item_id:'b',is_active:true,start_date:'2026-09-01',end_date:null}],'2026-09-12');
if(available.length!==1||available[0].id!=='b')fail('output item availability invariant changed.');
const outputPayload=buildProjectOutputPayload({contractorId:'c1',item:{id:'b',unit:'m2'},quantity:'12.5',notes:' done '});
if(outputPayload.qty!==12.5||outputPayload.notes!=='done')fail('output payload normalization invariant changed.');
if(summarizeProjectOutput([{group_output:2},{group_output:'3.5'}]).totalQuantity!==5.5)fail('output summary invariant changed.');
const advance=buildProjectFinancePayload({kind:'advance',contractorId:'c1',amount:'100',notes:' test '});
const payment=buildProjectFinancePayload({kind:'payment',contractorId:'c1',amount:'50',source:'cash',reference:' R1 ',notes:''});
if(advance.amount!==100||advance.notes!=='test'||payment.source!=='cash'||payment.reference!=='R1')fail('finance payload normalization invariant changed.');
const financeSummary=summarizeProjectFinanceDay({advances:[{amount:100}],payments:[{amount:50},{amount:'25'}]});
if(financeSummary.total!==175||financeSummary.count!==3)fail('finance summary invariant changed.');

if(failures.length){
  console.error('\nProject operation tools architecture audit failed:\n');
  failures.forEach((item)=>console.error(`- ${item}`));
  process.exit(1);
}

console.log('Project operation tools architecture audit passed: output and finance rules, verified writes, persistence and presentation are separated; mixed legacy panel is retired.');
