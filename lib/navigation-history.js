'use client';

const KEY='arkan.navigation.stack.v1';
const BACK_FLAG='arkan.navigation.back-target.v1';
const WORKSPACE='/dashboard/workspace';

function safeSession(){
  if(typeof window==='undefined') return null;
  try{return window.sessionStorage;}catch{return null;}
}

function read(){
  const storage=safeSession();
  if(!storage) return [];
  try{
    const value=JSON.parse(storage.getItem(KEY)||'[]');
    return Array.isArray(value)?value.filter(item=>typeof item==='string'&&item.startsWith('/dashboard')):[];
  }catch{return [];}
}

function write(stack){
  const storage=safeSession();
  if(!storage) return;
  storage.setItem(KEY,JSON.stringify(stack.slice(-24)));
}

export function recordLogicalRoute(pathname){
  if(!pathname?.startsWith('/dashboard')) return;
  const storage=safeSession();
  if(!storage) return;
  const pendingBack=storage.getItem(BACK_FLAG);
  const stack=read();

  if(pendingBack===pathname){
    storage.removeItem(BACK_FLAG);
    while(stack.length>1&&stack.at(-1)!==pathname) stack.pop();
    if(stack.at(-1)!==pathname) stack.push(pathname);
    write(stack);
    return;
  }

  if(stack.at(-1)!==pathname){
    stack.push(pathname);
    write(stack);
  }
}

export function logicalBackTarget(currentPath,fallback=WORKSPACE){
  const storage=safeSession();
  if(!storage) return fallback;
  const stack=read();
  if(stack.at(-1)!==currentPath) stack.push(currentPath);
  if(stack.length>1){
    stack.pop();
    const target=stack.at(-1)||fallback;
    write(stack);
    storage.setItem(BACK_FLAG,target);
    return target;
  }
  storage.setItem(BACK_FLAG,fallback);
  write([fallback]);
  return fallback;
}

export function resetLogicalHistory(pathname=WORKSPACE){
  write([pathname]);
}
