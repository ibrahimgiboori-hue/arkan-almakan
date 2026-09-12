import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const failures=[];
const retiredFiles=[
  'components/ProjExecution.js',
  'components/ProjMoney.js',
  'components/ProjectResourceView.js',
];
const retiredSymbols=['ProjExecution','ProjMoney','ProjectResourceView'];

for(const file of retiredFiles){
  if(fs.existsSync(path.join(root,file)))failures.push(`${file}: عاد مكوّن مشروع متقاعد بعد حذفه.`);
}

function walk(relative,files=[]){
  const absolute=path.join(root,relative);
  if(!fs.existsSync(absolute))return files;
  for(const entry of fs.readdirSync(absolute,{withFileTypes:true})){
    const child=path.join(relative,entry.name).replaceAll('\\','/');
    if(entry.isDirectory())walk(child,files);
    else if(/\.(?:js|jsx|mjs)$/.test(entry.name))files.push(child);
  }
  return files;
}

for(const file of [...walk('app'),...walk('components'),...walk('lib')]){
  const source=fs.readFileSync(path.join(root,file),'utf8');
  for(const symbol of retiredSymbols){
    if(source.includes(symbol))failures.push(`${file}: أعاد اعتمادًا على المكوّن القديم ${symbol}.`);
  }
  if(/\.rpc\(\s*['"]start_item_execution['"]/.test(source)){
    failures.push(`${file}: أعاد RPC بدء التنفيذ القديم بدل دورة إسناد البند الموحدة.`);
  }
  if(/\.rpc\(\s*['"]finish_item_execution['"]/.test(source)){
    failures.push(`${file}: أعاد RPC إنهاء التنفيذ القديم بدل دورة إسناد البند الموحدة.`);
  }
}

if(failures.length){
  console.error('\nRetired project components audit failed:\n');
  failures.forEach((item)=>console.error(`- ${item}`));
  process.exit(1);
}

console.log('Retired project components audit passed: ProjExecution, ProjMoney and ProjectResourceView are physically absent, no live source references them, and the old item execution RPC path cannot return.');
