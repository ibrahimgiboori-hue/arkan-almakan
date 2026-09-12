import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const failures=[];

function walk(relative,files=[]){
  const absolute=path.join(root,relative);
  if(!fs.existsSync(absolute))return files;
  for(const entry of fs.readdirSync(absolute,{withFileTypes:true})){
    const child=path.join(relative,entry.name).replaceAll('\\','/');
    if(entry.isDirectory())walk(child,files);
    else if(/\.(?:js|jsx)$/.test(entry.name))files.push(child);
  }
  return files;
}

const projectRoutes=walk('app/dashboard/projects/[id]');
const projectComponents=fs.existsSync(path.join(root,'components'))
  ? fs.readdirSync(path.join(root,'components'),{withFileTypes:true})
      .filter((entry)=>entry.isFile() && /^(?:Proj.*|ItemBudget)\.js$/.test(entry.name))
      .map((entry)=>`components/${entry.name}`)
  : [];

const surfaces=[...new Set([...projectRoutes,...projectComponents])];
for(const file of surfaces){
  const source=fs.readFileSync(path.join(root,file),'utf8');
  if(/from\s+['"]@\/lib\/supabase['"]|from\s+['"]@supabase\/|\bsupabase\s*\./.test(source)){
    failures.push(`${file}: سطح مشروع حي يتصل بـSupabase مباشرة بدل Service/Adapter.`);
  }
}

if(!surfaces.includes('app/dashboard/projects/[id]/page.js'))failures.push('جذر المشروع غير داخل مسح الحدود الحية.');
for(const required of ['components/ProjScope.js','components/ProjProgress.js','components/ProjClaims.js','components/ProjDocs.js','components/ProjGuarantees.js','components/ItemBudget.js']){
  if(!surfaces.includes(required))failures.push(`${required}: مكوّن المشروع الأساسي خارج مسح الحدود الحية.`);
}

if(failures.length){
  console.error('\nProject live surface boundary audit failed:\n');
  failures.forEach((item)=>console.error(`- ${item}`));
  process.exit(1);
}

console.log(`Project live surface boundary audit passed: ${surfaces.length} project route/component source files are presentation-only with no direct Supabase dependency.`);
