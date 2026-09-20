import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifestPath = path.join(root,'config','tenant-table-manifest.json');
const failures = [];
const warnings = [];

if(!fs.existsSync(manifestPath)){
  console.error('Multi-tenant architecture audit failed: missing config/tenant-table-manifest.json');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath,'utf8'));
const groups = manifest.groups || {};
const foundation = new Set(manifest.foundation_tables || []);
const classifications = new Map();

for(const [groupName,group] of Object.entries(groups)){
  for(const table of group.tables || []){
    if(classifications.has(table)){
      failures.push(`table ${table} is classified twice: ${classifications.get(table)} and ${groupName}`);
      continue;
    }
    classifications.set(table,groupName);
  }
}

if(Number(manifest.generated_from_production_table_count)!==classifications.size){
  failures.push(
    `manifest classified ${classifications.size} production tables but baseline declares ${manifest.generated_from_production_table_count}`
  );
}

for(const table of ['employees','projects','quotations','documents','cash_vouchers','treasury_accounts']){
  if(classifications.get(table)!=='tenant_root') failures.push(`${table} must remain an explicit tenant_root`);
}

for(const table of ['app_settings','system_access_settings']){
  if(classifications.get(table)!=='legacy_replace') failures.push(`${table} must remain marked legacy_replace until retired`);
}

for(const table of ['permission_actions','permission_capabilities','workflow_action_defs']){
  if(classifications.get(table)!=='platform_catalog') failures.push(`${table} is a platform vocabulary catalog and must not silently become tenant data`);
}

const migrationDir = path.join(root,'supabase','migrations');
if(fs.existsSync(migrationDir)){
  const migrationFiles = fs.readdirSync(migrationDir).filter((name)=>name.endsWith('.sql'));
  const createTableRegex = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-zA-Z0-9_]+)/gi;
  for(const name of migrationFiles){
    const source = fs.readFileSync(path.join(migrationDir,name),'utf8');
    let match;
    while((match=createTableRegex.exec(source))){
      const table = match[1];
      if(!classifications.has(table) && !foundation.has(table)){
        failures.push(`${name}: creates public.${table} without tenant ownership classification`);
      }
    }
  }
}

const foundationMigration = path.join(
  migrationDir,
  '20260920152000_multi_tenant_foundation_phase1.sql'
);
if(!fs.existsSync(foundationMigration)){
  failures.push('missing multi-tenant foundation migration');
}else{
  const source = fs.readFileSync(foundationMigration,'utf8');
  for(const token of [
    'public.organizations',
    'public.organization_memberships',
    'public.organization_modules',
    'public.organization_settings',
    'private.has_active_org_membership',
    'public.current_organization_id',
    'x-organization-id',
  ]){
    if(!source.includes(token)) failures.push(`foundation migration missing required contract: ${token}`);
  }
  if(!source.includes('security invoker')) failures.push('active organization resolver must remain SECURITY INVOKER');
  if(!source.includes('revoke all on function private.has_active_org_membership')) failures.push('private tenant helper EXECUTE lockdown is missing');
}

const testPath = path.join(root,'supabase','tests','multi_tenant_foundation_phase1.sql');
if(!fs.existsSync(testPath)){
  failures.push('missing adversarial tenant isolation test');
}else{
  const source = fs.readFileSync(testPath,'utf8');
  for(const token of [
    'member_can_read_own_tenant',
    'member_cannot_read_other_tenant',
    'forged_tenant_header_is_rejected',
    'own_tenant_header_is_accepted',
    'anon_has_no_organization_select_grant',
    'rollback;',
  ]){
    if(!source.includes(token)) failures.push(`tenant isolation test missing: ${token}`);
  }
}

const scanRoots = ['app','components','lib'];
const sourceExt = new Set(['.js','.jsx','.mjs','.ts','.tsx']);
function walk(dir){
  if(!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap((entry)=>{
    const full = path.join(dir,entry.name);
    if(entry.isDirectory()) return walk(full);
    return sourceExt.has(path.extname(entry.name)) ? [full] : [];
  });
}

let legacySettingsReads = 0;
let hardCodedArkanIdentity = 0;
for(const scope of scanRoots){
  for(const file of walk(path.join(root,scope))){
    const rel = path.relative(root,file).replaceAll('\\','/');
    const source = fs.readFileSync(file,'utf8');
    if(/\.from\(\s*['"]app_settings['"]\s*\)/.test(source)) legacySettingsReads += 1;
    if(/شركة أركان المكان|Arkan Al Makan Contracting Company/.test(source) &&
       !rel.includes('/print/') &&
       !rel.includes('document') &&
       !rel.includes('template')){
      hardCodedArkanIdentity += 1;
    }
  }
}

if(legacySettingsReads){
  warnings.push(`${legacySettingsReads} source files still read legacy app_settings; migrate them to organization settings before multi-tenant go-live`);
}
if(hardCodedArkanIdentity){
  warnings.push(`${hardCodedArkanIdentity} reusable source files may still contain hard-coded Arkan identity; review before tenant #2`);
}

if(warnings.length){
  console.warn('\nMulti-tenant architecture audit warnings:\n');
  warnings.forEach((item)=>console.warn(`- ${item}`));
}

if(failures.length){
  console.error('\nMulti-tenant architecture audit failed:\n');
  failures.forEach((item)=>console.error(`- ${item}`));
  process.exit(1);
}

console.log(
  `Multi-tenant architecture audit passed: ${classifications.size} production tables classified, ${foundation.size} foundation tables governed, and new public tables require explicit ownership classification.`
);
