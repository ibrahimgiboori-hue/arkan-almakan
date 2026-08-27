'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { publicAppUrl } from '@/lib/public-url';
import { PROGRAM_PORTALS, PROGRAM_ROOT_PATH, projectProgramPath } from '@/lib/program-links';

async function copyText(value){
  try{
    await navigator.clipboard.writeText(value);
    return true;
  }catch{
    try{
      const textarea=document.createElement('textarea');
      textarea.value=value;
      textarea.style.position='fixed';
      textarea.style.opacity='0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok=document.execCommand('copy');
      textarea.remove();
      return ok;
    }catch{return false;}
  }
}

function allowedPortalKeys(access={}){
  if(access.fullAdmin) return new Set(PROGRAM_PORTALS.map(item=>item.key));
  return new Set([
    access.projectScoped?'projects':null,
    access.hr?'workforce':null,
    access.finance?'finance':null,
    access.documents?'documents':null,
    access.admin?'admin':null,
  ].filter(Boolean));
}

function LinkRow({label,path,onCopied}){
  const url=publicAppUrl(path);
  return <div style={{display:'grid',gridTemplateColumns:'minmax(140px,.65fr) minmax(0,1.6fr) auto',alignItems:'center',gap:12,padding:'12px 14px',borderBottom:'1px solid var(--constitution-border-soft)'}}>
    <strong style={{fontSize:'var(--constitution-font-side,12px)'}}>{label}</strong>
    <code dir="ltr" style={{minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:'var(--constitution-font-data,11px)',color:'var(--constitution-muted)'}}>{url}</code>
    <button type="button" onClick={async()=>onCopied(await copyText(url),label)} style={{minHeight:38,padding:'0 14px',border:'1px solid var(--constitution-border)',borderRadius:9,background:'#fff',color:'var(--constitution-brand)',font:'inherit',fontWeight:850,cursor:'pointer'}}>نسخ</button>
  </div>;
}

export default function ProgramLinksPanel({open,onClose,access,capabilities=[]}){
  const [projects,setProjects]=useState([]);
  const [message,setMessage]=useState('');
  const allowed=useMemo(()=>allowedPortalKeys(access),[access]);
  const scopedProjectIds=useMemo(()=>new Set((capabilities||[])
    .filter(item=>item.module_key==='projects'&&item.scope_type==='project'&&item.scope_key)
    .map(item=>item.scope_key)),[capabilities]);

  useEffect(()=>{
    if(!open||!allowed.has('projects')) return;
    let alive=true;
    (async()=>{
      let query=supabase.from('projects').select('id,project_no,name_ar').order('project_no');
      if(!access?.fullAdmin&&!access?.projectsScreen&&scopedProjectIds.size){
        query=query.in('id',[...scopedProjectIds]);
      }
      const {data}=await query;
      if(alive) setProjects(data||[]);
    })();
    return()=>{alive=false;};
  },[open,access?.fullAdmin,access?.projectsScreen,allowed,scopedProjectIds]);

  if(!open) return null;

  function handleCopied(ok,label){
    setMessage(ok?`تم نسخ ${label}`:'تعذر النسخ من المتصفح الحالي');
    window.setTimeout(()=>setMessage(''),1800);
  }

  const portals=PROGRAM_PORTALS.filter(item=>allowed.has(item.key));

  return <div onMouseDown={onClose} style={{position:'fixed',inset:0,zIndex:1950,background:'rgba(17,17,15,.28)',display:'grid',placeItems:'start center',padding:'76px 16px 28px'}}>
    <section onMouseDown={event=>event.stopPropagation()} aria-label="روابط البرنامج" style={{width:'min(920px,100%)',maxHeight:'calc(100dvh - 104px)',overflow:'auto',border:'1px solid var(--constitution-border)',borderRadius:16,background:'var(--constitution-paper)',boxShadow:'0 26px 70px rgba(17,17,15,.24)',color:'var(--constitution-ink)'}}>
      <header style={{position:'sticky',top:0,zIndex:2,display:'flex',alignItems:'center',justifyContent:'space-between',gap:18,padding:'16px 18px',borderBottom:'1px solid var(--constitution-border-soft)',background:'rgba(251,250,247,.98)',backdropFilter:'blur(10px)'}}>
        <div>
          <strong style={{fontSize:'var(--constitution-font-title-md,17px)'}}>روابط البرنامج</strong>
          <div style={{marginTop:3,fontSize:'var(--constitution-font-data,11px)',color:'var(--constitution-muted)'}}>الرابط يحدد نقطة الدخول فقط؛ الصلاحيات هي التي تحدد ما يراه المستخدم بعد تسجيل الدخول.</div>
        </div>
        <button type="button" onClick={onClose} style={{minHeight:38,padding:'0 14px',border:'1px solid var(--constitution-border)',borderRadius:9,background:'#fff',color:'var(--constitution-brand)',font:'inherit',fontWeight:850,cursor:'pointer'}}>إغلاق</button>
      </header>

      {message&&<div style={{margin:'12px 14px 0',padding:'9px 12px',border:'1px solid rgba(18,101,72,.24)',borderRadius:9,background:'rgba(18,101,72,.06)',color:'var(--constitution-success)',fontSize:'var(--constitution-font-data,11px)',fontWeight:750}}>{message}</div>}

      <section style={{margin:'14px',border:'1px solid var(--constitution-border)',borderRadius:12,overflow:'hidden'}}>
        <div style={{padding:'11px 14px',borderBottom:'1px solid var(--constitution-border-soft)',fontSize:'var(--constitution-font-side,12px)',fontWeight:900}}>الرابط الرئيسي</div>
        <LinkRow label="أركان المكان" path={PROGRAM_ROOT_PATH} onCopied={handleCopied}/>
      </section>

      <section style={{margin:'14px',border:'1px solid var(--constitution-border)',borderRadius:12,overflow:'hidden'}}>
        <div style={{padding:'11px 14px',borderBottom:'1px solid var(--constitution-border-soft)',fontSize:'var(--constitution-font-side,12px)',fontWeight:900}}>فروع البوابات</div>
        {portals.map(portal=><LinkRow key={portal.key} label={portal.label} path={portal.path} onCopied={handleCopied}/>)}
      </section>

      {allowed.has('projects')&&projects.length>0&&<section style={{margin:'14px',border:'1px solid var(--constitution-border)',borderRadius:12,overflow:'hidden'}}>
        <div style={{padding:'11px 14px',borderBottom:'1px solid var(--constitution-border-soft)'}}>
          <strong style={{fontSize:'var(--constitution-font-side,12px)'}}>فروع بوابة المشاريع</strong>
          <div style={{marginTop:3,fontSize:'var(--constitution-font-data,11px)',color:'var(--constitution-muted)'}}>هذه الروابط مناسبة لمشرف مشروع أو مشرف موقع؛ الحساب لا يرى إلا المشروع المسموح له به.</div>
        </div>
        {projects.map(project=><LinkRow key={project.id} label={`${project.project_no||''} ${project.name_ar||'المشروع'}`.trim()} path={projectProgramPath(project.id)} onCopied={handleCopied}/>)}
      </section>}
    </section>
  </div>;
}
