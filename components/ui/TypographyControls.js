'use client';

import { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY='arkan.typography.v1';
const DEFAULTS=Object.freeze({
  titleLg:30,
  titleMd:17,
  side:12,
  data:11,
});
const LIMITS=Object.freeze({
  titleLg:[24,40],
  titleMd:[13,26],
  side:[10,18],
  data:[9,17],
});

function normalize(source={}){
  return Object.fromEntries(Object.entries(DEFAULTS).map(([key,fallback])=>{
    const value=Number(source[key]);
    const [min,max]=LIMITS[key];
    return [key,Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback];
  }));
}

function apply(values){
  if(typeof document==='undefined') return;
  const root=document.documentElement;
  root.style.setProperty('--constitution-font-title-lg',`${values.titleLg}px`);
  root.style.setProperty('--constitution-font-title-md',`${values.titleMd}px`);
  root.style.setProperty('--constitution-font-side',`${values.side}px`);
  root.style.setProperty('--constitution-font-data',`${values.data}px`);
}

export default function TypographyControls({open,onClose}){
  const [values,setValues]=useState(DEFAULTS);

  useEffect(()=>{
    let next=DEFAULTS;
    try{next=normalize(JSON.parse(window.localStorage.getItem(STORAGE_KEY)||'{}'));}catch{}
    setValues(next);
    apply(next);
  },[]);

  useEffect(()=>{
    apply(values);
    try{window.localStorage.setItem(STORAGE_KEY,JSON.stringify(values));}catch{}
  },[values]);

  const rows=useMemo(()=>[
    ['titleLg','العناوين الكبيرة'],
    ['titleMd','العناوين الفرعية'],
    ['side','العناوين الجانبية'],
    ['data','البيانات المعروضة'],
  ],[]);

  if(!open) return null;

  return <div onMouseDown={onClose} style={{position:'fixed',inset:0,zIndex:1900,background:'rgba(17,17,15,.24)',display:'grid',placeItems:'start center',padding:'84px 16px 24px'}}>
    <section onMouseDown={event=>event.stopPropagation()} aria-label="ضبط أحجام الخطوط" style={{width:'min(560px,100%)',border:'1px solid var(--constitution-border)',borderRadius:16,background:'var(--constitution-paper)',boxShadow:'0 24px 60px rgba(17,17,15,.22)',overflow:'hidden',color:'var(--constitution-ink)'}}>
      <header style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,padding:'16px 18px',borderBottom:'1px solid var(--constitution-border-soft)'}}>
        <div><strong style={{fontSize:'var(--constitution-font-title-md)'}}>أحجام الخطوط</strong><div style={{marginTop:3,fontSize:'var(--constitution-font-data)',color:'var(--constitution-muted)'}}>تتغير الواجهة مباشرة ويحفظ هذا الجهاز اختيارك.</div></div>
        <button type="button" onClick={onClose} style={{minHeight:38,padding:'0 14px',border:'1px solid var(--constitution-border)',borderRadius:9,background:'#fff',color:'var(--constitution-brand)',font:'inherit',fontWeight:800,cursor:'pointer'}}>إغلاق</button>
      </header>
      <div style={{display:'grid',gap:0}}>
        {rows.map(([key,label])=>{
          const [min,max]=LIMITS[key];
          return <label key={key} style={{display:'grid',gridTemplateColumns:'160px minmax(0,1fr) 52px',alignItems:'center',gap:14,padding:'15px 18px',borderBottom:'1px solid var(--constitution-border-soft)'}}>
            <span style={{fontSize:key==='side'?'var(--constitution-font-side)':'var(--constitution-font-data)',fontWeight:800}}>{label}</span>
            <input type="range" min={min} max={max} step="1" value={values[key]} onChange={event=>setValues(current=>({...current,[key]:Number(event.target.value)}))} style={{width:'100%',accentColor:'var(--constitution-brand)'}} />
            <strong style={{fontSize:'var(--constitution-font-data)',textAlign:'end'}}>{values[key]}px</strong>
          </label>;
        })}
      </div>
      <footer style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,padding:'14px 18px'}}>
        <span style={{fontSize:'var(--constitution-font-data)',color:'var(--constitution-muted)'}}>الضبط خاص بالعرض ولا يغيّر المطبوعات.</span>
        <button type="button" onClick={()=>setValues(DEFAULTS)} style={{minHeight:38,padding:'0 14px',border:'1px solid var(--constitution-border)',borderRadius:9,background:'transparent',color:'inherit',font:'inherit',fontWeight:800,cursor:'pointer'}}>إعادة الافتراضي</button>
      </footer>
    </section>
  </div>;
}
