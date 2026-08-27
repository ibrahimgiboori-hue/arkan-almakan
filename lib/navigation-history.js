'use client';

const KEY='arkan.navigation.stack.v1';
const BACK_FLAG='arkan.navigation.back-target.v1';
const WORKSPACE='/dashboard/workspace';
const PORTAL_ROOT_RE=/^\/dashboard\/workspace\/(projects|workforce|finance|documents|admin)\/?$/;

const TOOL_PARENTS=Object.freeze([
  { re:/^\/dashboard\/(?:employees|leaves)(?:\/|$)/, parent:'/dashboard/workspace/workforce' },
  { re:/^\/dashboard\/recruitment(?:\/|$)/, parent:'/dashboard/workspace/workforce' },
  { re:/^\/dashboard\/(?:advances|approvals)(?:\/|$)/, parent:'/dashboard/workspace/finance' },
  { re:/^\/dashboard\/(?:documents|register|archive|formbuilder)(?:\/|$)/, parent:'/dashboard/workspace/documents' },
  { re:/^\/dashboard\/(?:board|settings|org-structure|system-user|backup)(?:\/|$)/, parent:'/dashboard/workspace/admin' },
  { re:/^\/dashboard\/(?:projects|quotes|contractors|entities)\/?$/, parent:'/dashboard/workspace/projects' },
]);

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

function projectParent(pathname=''){
  const scoped=String(pathname).match(/^\/dashboard\/projects\/([^/]+)\/(.+)$/);
  if(scoped) return `/dashboard/projects/${scoped[1]}`;
  const project=String(pathname).match(/^\/dashboard\/projects\/([^/]+)\/?$/);
  if(project) return '/dashboard/workspace/projects';
  return '';
}

export function logicalParentFor(pathname=''){
  const project=projectParent(pathname);
  if(project) return project;
  return TOOL_PARENTS.find(rule=>rule.re.test(String(pathname)))?.parent || '';
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

  // البوابات كلها مستوى واحد. التبديل بينها يستبدل المستوى الحالي ولا يصنع
  // خطوة رجوع وهمية بين بوابة وأخرى.
  if(PORTAL_ROOT_RE.test(pathname) && (stack.at(-1)===WORKSPACE || PORTAL_ROOT_RE.test(stack.at(-1)||''))){
    if(stack.length) stack[stack.length-1]=pathname;
    else stack.push(pathname);
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
  const directParent=logicalParentFor(currentPath);
  if(!storage) return directParent || fallback;
  const stack=read();

  // المسارات المعروفة ترجع إلى أبيها في هرم البرنامج مباشرة، بصرف النظر عن
  // Browser History أو الحالات الداخلية التي مر بها المستخدم.
  if(directParent){
    while(stack.length && stack.at(-1)===currentPath) stack.pop();
    while(stack.length && stack.at(-1)!==directParent && logicalParentFor(stack.at(-1))===directParent) stack.pop();
    if(stack.at(-1)!==directParent) stack.push(directParent);
    write(stack);
    storage.setItem(BACK_FLAG,directParent);
    return directParent;
  }

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
