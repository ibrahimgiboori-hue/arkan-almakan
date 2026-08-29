'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const GROUP_ORDER = ['employee','project','contractor','entity','quotation','document'];
const GROUP_LABEL = {
  employee:'الموظفون',project:'المشاريع',contractor:'المقاولون',entity:'العملاء والجهات',quotation:'عروض الأسعار',document:'المستندات',
};

function cleanTerm(value='') {
  return String(value).replace(/[,%()]/g,' ').replace(/\s+/g,' ').trim().slice(0,80);
}

function item(kind, id, title, meta, href) {
  return { kind, id, title:title || 'بدون اسم', meta:meta || '', href };
}

export default function GlobalSearch() {
  const router = useRouter();
  const inputRef = useRef(null);
  const rootRef = useRef(null);
  const [query,setQuery]=useState('');
  const [results,setResults]=useState([]);
  const [open,setOpen]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    function keydown(event){
      if((event.ctrlKey||event.metaKey)&&String(event.key).toLowerCase()==='k'){
        event.preventDefault();setOpen(true);setTimeout(()=>inputRef.current?.focus(),0);
      }
      if(event.key==='Escape'){setOpen(false);inputRef.current?.blur();}
    }
    function pointer(event){if(rootRef.current&&!rootRef.current.contains(event.target))setOpen(false);}
    window.addEventListener('keydown',keydown);document.addEventListener('pointerdown',pointer);
    return()=>{window.removeEventListener('keydown',keydown);document.removeEventListener('pointerdown',pointer);};
  },[]);

  useEffect(()=>{
    const term=cleanTerm(query);
    if(term.length<2){setResults([]);setLoading(false);setError('');return undefined;}
    let alive=true;
    const timer=setTimeout(async()=>{
      setLoading(true);setError('');
      const like=`%${term}%`;
      const requests=[
        supabase.from('employees').select('id,employee_no,full_name_ar,full_name_en,job_title').or(`full_name_ar.ilike.${like},full_name_en.ilike.${like},employee_no.ilike.${like},id_number.ilike.${like}`).limit(6),
        supabase.from('projects').select('id,project_no,name_ar,name_en,city').or(`name_ar.ilike.${like},name_en.ilike.${like},project_no.ilike.${like},city.ilike.${like}`).limit(6),
        supabase.from('contractors').select('id,contractor_no,name_ar,name_en,contact_name').or(`name_ar.ilike.${like},name_en.ilike.${like},contractor_no.ilike.${like},contact_name.ilike.${like}`).limit(6),
        supabase.from('entities').select('id,entity_code,name_ar,name_en,contact_name').or(`name_ar.ilike.${like},name_en.ilike.${like},entity_code.ilike.${like},contact_name.ilike.${like}`).limit(6),
        supabase.from('quotations').select('id,quote_no,client_name,project_ref,status').or(`quote_no.ilike.${like},client_name.ilike.${like},project_ref.ilike.${like}`).limit(6),
        supabase.from('documents').select('id,doc_number,subject,template_code,status').or(`doc_number.ilike.${like},subject.ilike.${like},template_code.ilike.${like},tags.ilike.${like}`).limit(6),
      ];
      const settled=await Promise.allSettled(requests);
      if(!alive)return;
      const data=settled.map(entry=>entry.status==='fulfilled'&&!entry.value.error?(entry.value.data||[]):[]);
      const merged=[
        ...data[0].map(r=>item('employee',r.id,r.full_name_ar||r.full_name_en,`${r.employee_no||'—'} · ${r.job_title||'بدون مسمى'}`,`/dashboard/employees/${r.id}`)),
        ...data[1].map(r=>item('project',r.id,r.name_ar||r.name_en,`${r.project_no||'—'} · ${r.city||'الموقع غير محدد'}`,`/dashboard/projects/${r.id}`)),
        ...data[2].map(r=>item('contractor',r.id,r.name_ar||r.name_en,`${r.contractor_no||'—'} · ${r.contact_name||'مقاول'}`,`/dashboard/contractors?search=${encodeURIComponent(r.contractor_no||r.name_ar||r.name_en||'')}`)),
        ...data[3].map(r=>item('entity',r.id,r.name_ar||r.name_en,`${r.entity_code||'—'} · ${r.contact_name||'جهة'}`,`/dashboard/entities?search=${encodeURIComponent(r.entity_code||r.name_ar||r.name_en||'')}`)),
        ...data[4].map(r=>item('quotation',r.id,r.client_name||r.quote_no,`${r.quote_no||'—'} · ${r.project_ref||'بدون مشروع'}`,`/dashboard/quotes/${r.id}`)),
        ...data[5].map(r=>item('document',r.id,r.subject||r.doc_number,`${r.doc_number||'—'} · ${r.template_code||'مستند'}`,`/dashboard/documents/edit/${r.id}`)),
      ];
      setResults(merged);setLoading(false);
      if(settled.every(entry=>entry.status==='rejected'||entry.value?.error))setError('تعذر البحث وفق صلاحيات الحساب الحالية.');
    },220);
    return()=>{alive=false;clearTimeout(timer);};
  },[query]);

  const grouped=useMemo(()=>GROUP_ORDER.map(kind=>({kind,items:results.filter(r=>r.kind===kind)})).filter(group=>group.items.length),[results]);

  function choose(result){setOpen(false);setQuery('');router.push(result.href);}

  return <div ref={rootRef} style={{position:'relative',minWidth:250,maxWidth:390,flex:'0 1 390px'}}>
    <div style={{display:'flex',alignItems:'center',gap:6,border:'1px solid var(--raw-line,#d7d7d7)',borderRadius:8,background:'var(--raw-surface,#fff)',padding:'0 8px'}}>
      <span aria-hidden="true" style={{opacity:.65}}>⌕</span>
      <input ref={inputRef} value={query} onChange={e=>{setQuery(e.target.value);setOpen(true);}} onFocus={()=>setOpen(true)} placeholder="ابحث في البرنامج…" aria-label="البحث الشامل في البرنامج" style={{border:0,outline:'none',background:'transparent',width:'100%',minWidth:0,padding:'7px 2px'}}/>
      <kbd style={{fontSize:10,opacity:.55,whiteSpace:'nowrap'}}>Ctrl K</kbd>
    </div>
    {open&&<div role="dialog" aria-label="نتائج البحث" style={{position:'absolute',zIndex:1000,top:'calc(100% + 6px)',right:0,width:'min(560px,82vw)',maxHeight:'70vh',overflow:'auto',background:'var(--raw-surface,#fff)',border:'1px solid var(--raw-line,#ddd)',borderRadius:10,boxShadow:'0 14px 36px rgba(0,0,0,.16)',padding:8}}>
      {cleanTerm(query).length<2?<div style={{padding:12,fontSize:13,opacity:.7}}>اكتب حرفين على الأقل. يمكنك البحث بالاسم أو الرقم أو المرجع.</div>:loading?<div style={{padding:12}}>جارٍ البحث…</div>:error?<div style={{padding:12}}>{error}</div>:!results.length?<div style={{padding:12}}>لا توجد نتائج مطابقة.</div>:grouped.map(group=><section key={group.kind} style={{padding:'4px 0 8px'}}><div style={{fontSize:11,fontWeight:800,opacity:.6,padding:'5px 8px'}}>{GROUP_LABEL[group.kind]}</div>{group.items.map(result=><button key={`${result.kind}-${result.id}`} type="button" onClick={()=>choose(result)} style={{display:'grid',gridTemplateColumns:'1fr auto',gap:10,width:'100%',textAlign:'right',border:0,borderTop:'1px solid var(--raw-line-soft,#eee)',background:'transparent',padding:'9px 8px',cursor:'pointer'}}><span style={{display:'grid',gap:2}}><strong>{result.title}</strong><small style={{opacity:.68}}>{result.meta}</small></span><span aria-hidden="true">←</span></button>)}</section>)}
    </div>}
  </div>;
}
