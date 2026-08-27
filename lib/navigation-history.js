'use client';

import { NAVIGATION_POLICY } from '@/lib/navigation-constitution';

const KEY='arkan.navigation.stack.v1';
const BACK_FLAG='arkan.navigation.back-target.v1';
const ORIGIN_KEY='arkan.navigation.origins.v1';
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

function pathnameOnly(value=''){
  const text=String(value||'');
  if(!text) return '';
  try{
    if(/^https?:\/\//i.test(text)) return new URL(text).pathname;
  }catch{}
  return text.split(/[?#]/)[0]||'';
}

function normalizeRoute(value=''){
  const text=String(value||'').trim();
  if(!text) return '';
  try{
    if(/^https?:\/\//i.test(text)){
      const url=new URL(text);
      return `${url.pathname}${url.search}${url.hash}`;
    }
  }catch{}
  return text.startsWith('/')?text:'';
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

function readOrigins(){
  const storage=safeSession();
  if(!storage) return {};
  try{
    const value=JSON.parse(storage.getItem(ORIGIN_KEY)||'{}');
    return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  }catch{return {};}
}

function writeOrigins(origins){
  const storage=safeSession();
  if(!storage) return;
  const rows=Object.entries(origins||{})
    .sort((a,b)=>Number(b[1]?.at||0)-Number(a[1]?.at||0))
    .slice(0,32);
  storage.setItem(ORIGIN_KEY,JSON.stringify(Object.fromEntries(rows)));
}

function workspaceSectionParent(pathname=''){
  const path=pathnameOnly(pathname);
  const match=path.match(/^\/dashboard\/workspace\/(projects|workforce|finance|documents|admin)\/section\/[^/]+\/?$/);
  return match?`/dashboard/workspace/${match[1]}`:'';
}

function projectParent(pathname=''){
  const path=pathnameOnly(pathname);
  const scoped=path.match(/^\/dashboard\/projects\/([^/]+)\/(.+)$/);
  if(scoped) return `/dashboard/projects/${scoped[1]}`;
  const project=path.match(/^\/dashboard\/projects\/([^/]+)\/?$/);
  if(project) return '/dashboard/workspace/projects';
  return '';
}

export function logicalParentFor(pathname=''){
  const path=pathnameOnly(pathname);
  const portalSection=workspaceSectionParent(path);
  if(portalSection)return portalSection;
  const project=projectParent(path);
  if(project) return project;
  return TOOL_PARENTS.find(rule=>rule.re.test(path))?.parent || '';
}

// تحفظ الشاشة التي ضغط المستخدم منها على الأداة نفسها. هذه هي أولوية الرجوع؛
// جدول الآباء الثابت مجرد fallback عند الدخول المباشر من رابط خارجي.
export function rememberNavigationOrigin(destination,source){
  if(NAVIGATION_POLICY.toolParent!=='actual-launch-surface') return;
  const dest=normalizeRoute(destination);
  const from=normalizeRoute(source);
  const destPath=pathnameOnly(dest);
  const sourcePath=pathnameOnly(from);
  if(!destPath.startsWith('/dashboard')||!sourcePath.startsWith('/dashboard')) return;
  if(!logicalParentFor(destPath)) return;
  if(dest===from||destPath===sourcePath&&dest===from) return;
  const origins=readOrigins();
  origins[destPath]={source:from,at:Date.now()};
  writeOrigins(origins);
}

function consumeNavigationOrigin(currentPath){
  if(NAVIGATION_POLICY.toolParent!=='actual-launch-surface') return '';
  const key=pathnameOnly(currentPath);
  if(!key) return '';
  const origins=readOrigins();
  const row=origins[key];
  if(!row?.source) return '';
  delete origins[key];
  writeOrigins(origins);
  const source=normalizeRoute(row.source);
  if(!source||pathnameOnly(source)===key) return '';
  return source;
}

export function recordLogicalRoute(pathname){
  const path=pathnameOnly(pathname);
  if(!path?.startsWith('/dashboard')) return;
  const storage=safeSession();
  if(!storage) return;
  const pendingBack=storage.getItem(BACK_FLAG);
  const stack=read();

  if(pendingBack===path){
    storage.removeItem(BACK_FLAG);
    while(stack.length>1&&stack.at(-1)!==path) stack.pop();
    if(stack.at(-1)!==path) stack.push(path);
    write(stack);
    return;
  }

  // البوابات كلها مستوى واحد؛ التبديل بينها لا يصنع خطوة رجوع وهمية.
  if(PORTAL_ROOT_RE.test(path) && (stack.at(-1)===WORKSPACE || PORTAL_ROOT_RE.test(stack.at(-1)||''))){
    if(stack.length) stack[stack.length-1]=path;
    else stack.push(path);
    write(stack);
    return;
  }

  if(stack.at(-1)!==path){
    stack.push(path);
    write(stack);
  }
}

export function logicalBackTarget(currentPath,fallback=WORKSPACE){
  const path=pathnameOnly(currentPath);
  const storage=safeSession();

  // الدستور: الرجوع من أداة يرجع إلى الشاشة التي فتحتها فعليًا بضغطة واحدة.
  const launchSurface=consumeNavigationOrigin(path);
  if(launchSurface){
    const targetPath=pathnameOnly(launchSurface);
    if(storage){
      const stack=read();
      while(stack.length&&stack.at(-1)===path) stack.pop();
      if(stack.at(-1)!==targetPath) stack.push(targetPath);
      write(stack);
      storage.setItem(BACK_FLAG,targetPath);
    }
    return launchSurface;
  }

  const directParent=logicalParentFor(path);
  if(!storage) return directParent || fallback;
  const stack=read();

  // الدخول المباشر من رابط خارجي لا يملك launch surface؛ هنا فقط نستخدم الأب الثابت.
  if(directParent){
    while(stack.length && stack.at(-1)===path) stack.pop();
    while(stack.length && stack.at(-1)!==directParent && logicalParentFor(stack.at(-1))===directParent) stack.pop();
    if(stack.at(-1)!==directParent) stack.push(directParent);
    write(stack);
    storage.setItem(BACK_FLAG,directParent);
    return directParent;
  }

  if(stack.at(-1)!==path) stack.push(path);
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
  write([pathnameOnly(pathname)||WORKSPACE]);
}
