'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

const ROW_MM = 2;
const DEFAULT_AFTER_ROWS = 1;
const MIN_BEFORE_ROWS = -4;
const MAX_BEFORE_ROWS = 12;
const BODY_SELECTOR = '.document-content-body';
const BLOCK_SELECTOR = ':scope > .document-visible-block[data-document-visible-block="true"]';
const PRINT_ROOT_SELECTOR = '.print-constitution[data-print-document]';

const GROUPS = Object.freeze({
  tableHeader:{
    label:'رؤوس الجداول',
    selector:'.amounts th,table[data-print-flow="repeatable-table"] thead th,.sigtable th',
    defaults:{text:'#ffffff',fill:'#7d1f2f'},
  },
  sectionHeader:{
    label:'عناوين الأقسام',
    selector:'.card-head,.pc-head,.pt-head,.dc-head,.report-items-title,.strict>.head',
    defaults:{text:'#7d1f2f',fill:'#ffffff'},
  },
  fieldLabel:{
    label:'عناوين الحقول',
    selector:'.card-doc .k,.pc-k,.pt-k,.governed-cell-label',
    defaults:{text:'#444444',fill:'#ffffff'},
  },
});

function cleanText(value='') {
  return String(value).replace(/\s+/g,' ').trim();
}

function shortText(value='',limit=52) {
  const text=cleanText(value);
  return text.length>limit?`${text.slice(0,limit-1)}…`:text;
}

function blockKey(block) {
  if (!block) return '';
  const child=block.firstElementChild;
  const explicit=child?.dataset?.printBlockKey || child?.getAttribute?.('data-print-flow') || '';
  const heading=child?.querySelector?.('.card-head,.pc-head,.pt-head,.dc-head,.report-items-title,.strict>.head,thead th,h1,h2,h3')?.textContent || '';
  const cls=typeof child?.className==='string'
    ? child.className.split(/\s+/).filter(Boolean).slice(0,3).join('.')
    : '';
  const tag=child?.tagName?.toLowerCase() || 'block';
  return cleanText(explicit || `${tag}:${cls}:${heading}`) || `block:${block.dataset.documentBlockIndex || '0'}`;
}

function blockLabel(block) {
  if (!block) return 'كتلة محتوى';
  const child=block.firstElementChild;
  const heading=child?.querySelector?.('.card-head,.pc-head,.pt-head,.dc-head,.report-items-title,.strict>.head,thead th,h1,h2,h3')?.textContent || '';
  if (cleanText(heading)) return shortText(heading);
  if (child?.classList?.contains('title-block')) return shortText(child.textContent || 'عنوان المستند');
  if (child?.classList?.contains('footer-row')) return 'بيانات الشركة / الختم';
  if (child?.classList?.contains('sigtable')) return 'التوقيعات';
  if (child?.classList?.contains('fill')) return 'مساحة مرنة';
  if (child?.classList?.contains('amounts')) return 'الجدول';
  const cls=typeof child?.className==='string' ? child.className.split(/\s+/)[0] : '';
  return cls || 'كتلة محتوى';
}

function profileKey(documentKey) {
  const source=document.querySelector('.constitution-flow-measure') || document.querySelector('.constitution-paged-content');
  const title=cleanText(source?.querySelector('.title-block h1,h1')?.textContent || '');
  const headings=[...(source?.querySelectorAll?.('.card-head,.dc-head,.pc-head,.pt-head,.report-items-title') || [])]
    .map((node)=>cleanText(node.textContent)).filter(Boolean).slice(0,5);
  return `${documentKey}|${title || 'untitled'}|${headings.join('|')}`;
}

function normalizedWorkbench(value={}) {
  return {
    styles:value.styles || {},
    elementStyles:value.elementStyles || {},
    blocks:value.blocks || {},
  };
}

function defaultBlockSetting() {
  return {beforeRows:0,afterRows:DEFAULT_AFTER_ROWS};
}

function clearManualColor(root) {
  root.querySelectorAll('[data-print-workbench-style="true"]').forEach((element)=>{
    if (element.dataset.printManualText==='true') element.style.removeProperty('color');
    if (element.dataset.printManualFill==='true') element.style.removeProperty('background-color');
    delete element.dataset.printManualText;
    delete element.dataset.printManualFill;
    delete element.dataset.printManualColor;
    delete element.dataset.printWorkbenchStyle;
  });
}

function applyColor(element,style) {
  if (!element || !style) return;
  if (style.textEnabled!==false && style.text) {
    element.style.setProperty('color',style.text,'important');
    element.dataset.printManualText='true';
    [...element.querySelectorAll('*')].forEach((child)=>child.style.setProperty('color','inherit','important'));
  }
  if (style.fillEnabled!==false && style.fill) {
    element.style.setProperty('background-color',style.fill,'important');
    element.dataset.printManualFill='true';
  }
  if (style.text || style.fill) element.dataset.printManualColor='group';
  element.dataset.printWorkbenchStyle='true';
}

export default function PrintContentWorkbench() {
  const [documentKey,setDocumentKey]=useState('');
  const [profile,setProfile]=useState('');
  const [open,setOpen]=useState(false);
  const [baseSettings,setBaseSettings]=useState({});
  const [workbench,setWorkbench]=useState(()=>normalizedWorkbench());
  const [selectedBlock,setSelectedBlock]=useState(null);
  const [blockOptions,setBlockOptions]=useState([]);
  const [dirty,setDirty]=useState(false);
  const [message,setMessage]=useState('');
  const applyFrame=useRef(0);

  const refreshBlocks=useCallback(()=>{
    const bodies=[...document.querySelectorAll('.constitution-paged-content .document-content-body')];
    const unique=new Map();
    bodies.forEach((body)=>{
      [...body.querySelectorAll(BLOCK_SELECTOR)].forEach((block)=>{
        const key=blockKey(block);
        if (key && !unique.has(key)) unique.set(key,{key,label:blockLabel(block)});
      });
    });
    const options=[...unique.values()];
    setBlockOptions((current)=>{
      const same=current.length===options.length && current.every((item,index)=>item.key===options[index]?.key&&item.label===options[index]?.label);
      return same?current:options;
    });
    setSelectedBlock((current)=>{
      if (current && options.some((item)=>item.key===current.key)) return current;
      return options[0] || null;
    });
  },[]);

  const syncEnvironment=useCallback(()=>{
    const root=document.querySelector(PRINT_ROOT_SELECTOR);
    const nextKey=root?.dataset?.printDocument || '';
    if (nextKey) {
      setDocumentKey((current)=>current===nextKey?current:nextKey);
      const nextProfile=profileKey(nextKey);
      setProfile((current)=>current===nextProfile?current:nextProfile);
      refreshBlocks();
    } else {
      setDocumentKey('');
    }
  },[refreshBlocks]);

  useEffect(()=>{
    syncEnvironment();
    const timer=window.setInterval(syncEnvironment,900);
    return ()=>window.clearInterval(timer);
  },[syncEnvironment]);

  useEffect(()=>{
    if (!documentKey || !profile) return;
    let cancelled=false;
    (async()=>{
      const {data,error}=await supabase.from('print_presentation_overrides')
        .select('settings').eq('document_key',documentKey).maybeSingle();
      if (cancelled) return;
      if (error) {
        setMessage(`تعذر تحميل التنسيق: ${error.message}`);
        return;
      }
      const settings=data?.settings || {};
      setBaseSettings(settings);
      setWorkbench(normalizedWorkbench(settings.contentWorkbenchProfiles?.[profile] || {}));
      setDirty(false);
      setMessage('');
    })();
    return ()=>{cancelled=true;};
  },[documentKey,profile]);

  const requestLayoutRefresh=useCallback(()=>{
    window.dispatchEvent(new CustomEvent('arkan:print-content-layout-changed'));
  },[]);

  const applySettings=useCallback(()=>{
    const bodies=[...document.querySelectorAll(BODY_SELECTOR)];
    bodies.forEach((body)=>{
      clearManualColor(body);
      const blocks=[...body.querySelectorAll(BLOCK_SELECTOR)];
      blocks.forEach((block)=>{
        const key=blockKey(block);
        const setting=workbench.blocks?.[key] || defaultBlockSetting();
        const beforeRows=Math.max(MIN_BEFORE_ROWS,Math.min(MAX_BEFORE_ROWS,Number(setting.beforeRows)||0));
        const afterRows=Math.max(0,Math.min(12,Number(setting.afterRows ?? DEFAULT_AFTER_ROWS)));
        block.dataset.printContentKey=key;
        block.style.setProperty('--print-block-gap-before',`${beforeRows*ROW_MM}mm`);
        block.style.setProperty('--print-block-gap-after',`${afterRows*ROW_MM}mm`);
        if (open && selectedBlock?.key===key && !block.closest('.constitution-flow-measure')) block.dataset.printContentSelected='true';
        else delete block.dataset.printContentSelected;
      });

      Object.entries(GROUPS).forEach(([groupKey,group])=>{
        const style=workbench.styles?.[groupKey];
        if (!style) return;
        [...body.querySelectorAll(group.selector)].forEach((element)=>applyColor(element,style));
      });
    });
  },[open,selectedBlock,workbench.blocks,workbench.styles]);

  useEffect(()=>{
    cancelAnimationFrame(applyFrame.current);
    applyFrame.current=requestAnimationFrame(applySettings);
    const host=document.querySelector('.print-constitution') || document.querySelector('.constitution-paged-pages');
    if (!host) return ()=>cancelAnimationFrame(applyFrame.current);
    const observer=new MutationObserver(()=>{
      cancelAnimationFrame(applyFrame.current);
      applyFrame.current=requestAnimationFrame(applySettings);
    });
    observer.observe(host,{subtree:true,childList:true});
    return ()=>{
      cancelAnimationFrame(applyFrame.current);
      observer.disconnect();
    };
  },[applySettings,documentKey]);

  useEffect(()=>{
    const onClick=(event)=>{
      if (!open || event.target.closest('.no-print')) return;
      const block=event.target.closest('.document-visible-block[data-document-visible-block="true"]');
      if (!block || !block.closest(BODY_SELECTOR)) return;
      setSelectedBlock({key:blockKey(block),label:blockLabel(block)});
    };
    document.addEventListener('click',onClick,true);
    return ()=>document.removeEventListener('click',onClick,true);
  },[open]);

  const selectedSetting=useMemo(()=>{
    if (!selectedBlock?.key) return defaultBlockSetting();
    return workbench.blocks?.[selectedBlock.key] || defaultBlockSetting();
  },[selectedBlock,workbench.blocks]);

  const previousBlockKey=useCallback(()=>{
    if (!selectedBlock?.key) return null;
    const index=blockOptions.findIndex((item)=>item.key===selectedBlock.key);
    return index>0?blockOptions[index-1].key:null;
  },[blockOptions,selectedBlock]);

  const commitBlocks=useCallback((producer)=>{
    setWorkbench((state)=>({...state,blocks:producer({...state.blocks})}));
    setDirty(true);
    requestAnimationFrame(requestLayoutRefresh);
  },[requestLayoutRefresh]);

  const moveUp=useCallback(()=>{
    if (!selectedBlock?.key) return;
    commitBlocks((blocks)=>{
      const current={...(blocks[selectedBlock.key]||defaultBlockSetting())};
      const previousKey=previousBlockKey();
      if (previousKey) {
        const previous={...(blocks[previousKey]||defaultBlockSetting())};
        if ((Number(previous.afterRows)||0)>0) {
          previous.afterRows=Math.max(0,Number(previous.afterRows)-1);
          blocks[previousKey]=previous;
          return blocks;
        }
      }
      current.beforeRows=Math.max(MIN_BEFORE_ROWS,(Number(current.beforeRows)||0)-1);
      blocks[selectedBlock.key]=current;
      return blocks;
    });
  },[commitBlocks,previousBlockKey,selectedBlock]);

  const moveDown=useCallback(()=>{
    if (!selectedBlock?.key) return;
    commitBlocks((blocks)=>{
      const current={...(blocks[selectedBlock.key]||defaultBlockSetting())};
      current.beforeRows=Math.min(MAX_BEFORE_ROWS,(Number(current.beforeRows)||0)+1);
      blocks[selectedBlock.key]=current;
      return blocks;
    });
  },[commitBlocks,selectedBlock]);

  const compactAbove=useCallback(()=>{
    if (!selectedBlock?.key) return;
    commitBlocks((blocks)=>{
      const previousKey=previousBlockKey();
      if (previousKey) blocks[previousKey]={...(blocks[previousKey]||defaultBlockSetting()),afterRows:0};
      blocks[selectedBlock.key]={...(blocks[selectedBlock.key]||defaultBlockSetting()),beforeRows:0};
      return blocks;
    });
  },[commitBlocks,previousBlockKey,selectedBlock]);

  const compactAll=useCallback(()=>{
    const blocks={};
    blockOptions.forEach((item)=>{blocks[item.key]={beforeRows:0,afterRows:0};});
    setWorkbench((state)=>({...state,blocks}));
    setDirty(true);
    requestAnimationFrame(requestLayoutRefresh);
  },[blockOptions,requestLayoutRefresh]);

  const restoreSpacing=useCallback(()=>{
    setWorkbench((state)=>({...state,blocks:{}}));
    setDirty(true);
    requestAnimationFrame(requestLayoutRefresh);
  },[requestLayoutRefresh]);

  const updateGroupColor=useCallback((groupKey,patch)=>{
    setWorkbench((state)=>({
      ...state,
      styles:{
        ...state.styles,
        [groupKey]:{
          ...(state.styles?.[groupKey]||{}),
          ...patch,
          textEnabled:true,
          fillEnabled:true,
        },
      },
    }));
    setDirty(true);
  },[]);

  const resetGroupColor=useCallback((groupKey)=>{
    setWorkbench((state)=>{
      const styles={...state.styles};
      delete styles[groupKey];
      return {...state,styles};
    });
    setDirty(true);
  },[]);

  const save=useCallback(async()=>{
    if (!documentKey || !profile) return;
    setMessage('جارٍ الحفظ...');
    const profiles={...(baseSettings.contentWorkbenchProfiles||{}),[profile]:workbench};
    const settings={...baseSettings,contentWorkbenchProfiles:profiles};
    const {data:{user}}=await supabase.auth.getUser();
    const {error}=await supabase.from('print_presentation_overrides').upsert({
      document_key:documentKey,
      settings,
      updated_by_user_id:user?.id || null,
      updated_at:new Date().toISOString(),
    },{onConflict:'document_key'});
    if (error) {
      setMessage(`تعذر الحفظ: ${error.message}`);
      return;
    }
    setBaseSettings(settings);
    setDirty(false);
    setMessage('تم الحفظ');
  },[baseSettings,documentKey,profile,workbench]);

  if (!documentKey) return null;

  return (
    <aside className={`print-content-workbench no-print ${open?'is-open':'is-closed'}`} dir="rtl">
      {!open ? (
        <button type="button" className="pcw-launch" onClick={()=>setOpen(true)}>تنسيق الصفحة</button>
      ) : (
        <>
          <div className="pcw-head">
            <strong>تنسيق الصفحة</strong>
            <button type="button" onClick={()=>setOpen(false)} aria-label="إغلاق">×</button>
          </div>

          <section className="pcw-section">
            <label className="pcw-label">العنصر</label>
            <select value={selectedBlock?.key||''} onChange={(event)=>{
              const option=blockOptions.find((item)=>item.key===event.target.value);
              setSelectedBlock(option||null);
            }}>
              {blockOptions.map((item)=><option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
            <div className="pcw-position">الموضع: {(Number(selectedSetting.beforeRows)||0)*ROW_MM} مم قبل العنصر</div>
            <div className="pcw-big-actions">
              <button type="button" onClick={moveUp}>↑ أقرب 2 مم</button>
              <button type="button" onClick={moveDown}>↓ أبعد 2 مم</button>
            </div>
            <div className="pcw-actions">
              <button type="button" onClick={compactAbove}>التصاق بما قبله</button>
              <button type="button" onClick={compactAll}>ضغط الصفحة</button>
              <button type="button" onClick={restoreSpacing}>مسافات طبيعية</button>
            </div>
          </section>

          <section className="pcw-section">
            <strong>ألوان العناوين</strong>
            <div className="pcw-help">كل صف: لون النص ثم لون الخلفية. لا توجد مربعات تفعيل.</div>
            {Object.entries(GROUPS).map(([groupKey,group])=>{
              const style=workbench.styles?.[groupKey] || {};
              const text=style.text || group.defaults.text;
              const fill=style.fill || group.defaults.fill;
              return (
                <div className="pcw-color-simple" key={groupKey}>
                  <span>{group.label}</span>
                  <label title="لون النص">نص <input type="color" value={text} onChange={(event)=>updateGroupColor(groupKey,{text:event.target.value})} /></label>
                  <label title="لون الخلفية">خلفية <input type="color" value={fill} onChange={(event)=>updateGroupColor(groupKey,{fill:event.target.value})} /></label>
                  <button type="button" onClick={()=>resetGroupColor(groupKey)}>تلقائي</button>
                </div>
              );
            })}
          </section>

          <div className="pcw-savebar">
            <button type="button" className="primary" disabled={!dirty} onClick={save}>{dirty?'حفظ التغييرات':'محفوظ'}</button>
            {message && <span>{message}</span>}
          </div>
        </>
      )}

      <style jsx global>{`
        .print-content-workbench{position:fixed;right:14px;top:150px;z-index:10020;width:300px;max-height:calc(100vh - 170px);overflow:auto;background:#fff;border:1px solid #d4c7c7;border-radius:9px;box-shadow:0 10px 28px rgba(0,0,0,.14);color:#242424;font-family:var(--font-body,Arial,sans-serif);box-sizing:border-box}
        .print-content-workbench.is-closed{width:150px;overflow:visible;background:transparent;border:0;box-shadow:none}
        .pcw-launch{width:100%;padding:9px 10px;border:1px solid #7d1f2f;background:#fff;color:#7d1f2f;font:inherit;font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 4px 15px rgba(0,0,0,.08)}
        .pcw-head{display:flex;align-items:center;justify-content:space-between;padding:10px 11px;border-bottom:1px solid #eadede;color:#6f1d2a}.pcw-head strong{font-size:13px}.pcw-head button{border:0;background:transparent;font-size:20px;line-height:1;cursor:pointer;color:#777}
        .pcw-section{padding:10px 11px;border-bottom:1px solid #eee;display:grid;gap:8px}.pcw-section>strong,.pcw-label{font-size:11.5px;color:#6f1d2a;font-weight:700}.pcw-section select{width:100%;padding:7px;border:1px solid #cfc5c5;background:#fff;color:#222;font:inherit;font-size:11px}
        .pcw-position{font-size:10px;color:#777;background:#faf7f7;padding:5px 7px;border-radius:4px}.pcw-big-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px}.pcw-big-actions button{padding:8px 5px;border:1px solid #7d1f2f;background:#7d1f2f;color:#fff;font:inherit;font-size:11px;cursor:pointer}.pcw-actions{display:flex;gap:5px;flex-wrap:wrap}.pcw-actions button,.pcw-color-simple button{border:1px solid #d2c3c3;background:#fff;color:#662632;padding:5px 7px;font:inherit;font-size:9.8px;cursor:pointer}
        .pcw-help{font-size:9.5px;color:#777}.pcw-color-simple{display:grid;grid-template-columns:minmax(80px,1fr) auto auto auto;gap:5px;align-items:center;font-size:9.7px}.pcw-color-simple>span{font-weight:600}.pcw-color-simple label{display:flex;align-items:center;gap:3px;white-space:nowrap}.pcw-color-simple input[type=color]{width:27px;height:25px;padding:1px;border:1px solid #ccc;background:#fff}
        .pcw-savebar{position:sticky;bottom:0;display:flex;align-items:center;gap:7px;padding:9px 11px;background:#fff;border-top:1px solid #eadede}.pcw-savebar .primary{flex:0 0 auto;border:1px solid #7d1f2f;background:#7d1f2f;color:#fff;padding:7px 10px;font:inherit;font-size:10.5px;cursor:pointer}.pcw-savebar .primary:disabled{opacity:.45;cursor:default}.pcw-savebar span{font-size:9px;color:#666}
        .document-visible-block[data-print-content-selected=true]{outline:1.5px dashed #8b3332!important;outline-offset:1mm;cursor:pointer}
        @media(max-width:900px){.print-content-workbench{right:10px;left:10px;top:auto;bottom:10px;width:auto;max-height:48vh}.print-content-workbench.is-closed{left:auto;width:150px}}
      `}</style>
    </aside>
  );
}
