import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const failures=[];
const retiredFiles=new Set([
  'components/ProjExecution.js',
  'components/ProjMoney.js',
]);
const retiredSymbols=['ProjExecution','ProjMoney'];

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
  if(retiredFiles.has(file))continue;
  const source=fs.readFileSync(path.join(root,file),'utf8');
  for(const symbol of retiredSymbols){
    if(source.includes(symbol))failures.push(`${file}: ما زال يعتمد على المكوّن القديم ${symbol}.`);
  }
}

if(failures.length){
  console.error('\nRetired project components audit failed:\n');
  failures.forEach((item)=>console.error(`- ${item}`));
  process.exit(1);
}

console.log('Retired project components audit passed: no live app/component/lib source depends on ProjExecution or ProjMoney; they are safe candidates for physical removal.');
