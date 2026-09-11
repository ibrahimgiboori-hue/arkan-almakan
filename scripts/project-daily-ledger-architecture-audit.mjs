import fs from 'node:fs';
import path from 'node:path';
import { filterProjectDailyLedgerRows, normalizeProjectDailyLedger } from '../lib/project-daily-ledger.mjs';

const root=process.cwd();
const failures=[];
const exists=(relative)=>fs.existsSync(path.join(root,relative));
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const fail=(message)=>failures.push(message);

const files={
  domain:'lib/project-daily-ledger.mjs',
  adapter:'lib/adapters/project-daily-ledger-supabase.js',
  service:'lib/application/project-daily-ledger-service.js',
  presentation:'app/dashboard/projects/[id]/operations/movements/page.js',
};
for(const [role,file] of Object.entries(files))if(!exists(file))fail(`${role}: missing ${file}`);

if(exists(files.domain)){
  const source=read(files.domain);
  for(const forbidden of ['@/lib/supabase','@supabase/','react','next/','.from(','.rpc(','window.','document.'])if(source.includes(forbidden))fail(`daily ledger domain leaked infrastructure/presentation: ${forbidden}`);
  for(const required of ['normalizeProjectDailyLedger','filterProjectDailyLedgerRows','PROJECT_DAILY_LEDGER_FILTERS'])if(!source.includes(required))fail(`daily ledger domain missing projection contract: ${required}`);
}

if(exists(files.adapter)){
  const source=read(files.adapter);
  if(!source.includes("@/lib/supabase"))fail('daily ledger adapter must own Supabase.');
  if(!source.includes("rpc('fn_project_daily_ledger'"))fail('daily ledger adapter lost the canonical ledger RPC.');
}

if(exists(files.service)){
  const source=read(files.service);
  for(const forbidden of ['@/lib/supabase','@supabase/','.from(','.rpc(','window.','document.'])if(source.includes(forbidden))fail(`daily ledger service leaked infrastructure/presentation: ${forbidden}`);
  for(const required of ['projectDailyLedgerService','normalizeProjectDailyLedger','projectDailyLedgerSupabaseRepository'])if(!source.includes(required))fail(`daily ledger service missing contract: ${required}`);
}

if(exists(files.presentation)){
  const source=read(files.presentation);
  if(!source.includes("@/lib/application/project-daily-ledger-service"))fail('daily ledger presentation must use the application service.');
  for(const forbidden of ['@/lib/supabase','@supabase/','.from(','.rpc(','fn_project_daily_ledger'])if(source.includes(forbidden))fail(`daily ledger presentation leaked persistence detail: ${forbidden}`);
}

const fixture=normalizeProjectDailyLedger({
  rows:[{id:'1',type:'expense',amount:125},{id:'2',type:'attendance',valueText:'كامل'}],
  summary:{attendance:1,expenses:125},
});
if(fixture.rows[0]?.value!=='125.00 ر.س'||fixture.summary.attendance!==1||fixture.summary.outputs!==0)fail('daily ledger normalization invariant changed.');
if(filterProjectDailyLedgerRows(fixture.rows,'expense').length!==1||filterProjectDailyLedgerRows(fixture.rows,'all').length!==2)fail('daily ledger filter invariant changed.');

if(failures.length){
  console.error('\nProject daily ledger architecture audit failed:\n');
  failures.forEach((item)=>console.error(`- ${item}`));
  process.exit(1);
}

console.log('Project daily ledger architecture audit passed: projection, persistence, orchestration and presentation are separated and ledger invariants are locked.');
