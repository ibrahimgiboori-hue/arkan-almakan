'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

const ROW_MM = 2;
const DEFAULT_AFTER_ROWS = 1;
const GROUPS = Object.freeze({
  tableHeader:{
    label:'رؤوس الجداول',
    selector:'.amounts th,table[data-print-flow="repeatable-table"] thead th,.sigtable th',
  },
  sectionHeader:{
    label:'عناوين الأقسام',
    selector:'.card-head,.pc-head,.pt-head,.dc-head,.report-items-title,.strict>.head',
  },
  fieldLabel:{
    label:'عناوين الحقول / المدخلات',
    selector:'.card-doc .k,.pc-k,.pt-k,.governed-cell-label',
  },
});
const ALL_HEADING_SELECTOR = Object.values(GROUPS).map((group)=>group.selector).join(',');
const PRINT_ROOT_SELECTOR = '.print-constitution[data-print-document]';
const BODY_SELECTOR = '.document-content-body';
const BLOCK_SELECTOR = ':scope > .document-visible-block[data-document-visible-block="true"]';

function cleanText(value='') {
  return String(value).replace(/\s+/g,' ').trim();
}

function shortText(value='', limit=54) {
  const text=cleanText(value);
  return text.length>limit?`${text.slice(0,limit-1)}…`:text;
}

function groupForElement(element) {
  if (!element) return null;
  return Object.entries(GROUPS).find(([,group])=>element.matches(group.selector))?.[0] || null;
}

function blockKey(block) {
  if (!block) return '';
  const child=block.firstElementChild;
  const explicit=child?.dataset?.printBlockKey || child?.getAttribute?.('data-print-flow') || '';
  const heading=child?.querySelector?.('.card-head,.pc-head,.pt-head,.dc-head,.report-items-title,.strict>.head,thead th,h1,h2,h3')?.textContent || '';
  const cls=child?.className && typeof child.className==='string'
    ? child.className.split(/\s+/).filter(Boolean).slice(0,3).join('.')
    : '';
  const tag=child?.tagName?.toLowerCase() || 'block';
  return cleanText(explicit || `${tag}:${cls}:${heading}`) || `block:${block.dataset.documentBlockIndex || '0'}`;
}

function blockLabel(block) {
  if (!block) return 'الكتلة';
  const child=block.firstElementChild;
  const heading=child?.querySelector?.('.card-head,.pc-head,.pt-head,.dc-head,.report-items-title,.strict>.head,thead th,h1,h2,h3')?.textContent || '';
  if (cleanText(heading)) return shortText(heading);
  const cls=child?.className && typeof child.className==='string' ? child.className.split(/\s+/)[0] : '';
  return cls || 'كتلة محتوى';
}

function elementStyleKey(element) {
  const group=groupForElement(element) || 'heading';
  const block=element?.closest?.('.document-visible-block');
  const owner=blockKey(block);
  const label=shortText(element?.textContent || '',80);
  const siblings=block ? [...block.querySelectorAll(GROUPS[group]?.selector || ALL_HEADING_SELECTOR)] : [];
  const index=Math.max(0,siblings.indexOf(element));
  return `${group}|${owner}|${label}|${index}`;
}

function profileKey(documentKey) {
  const measure=document.querySelector('.constitution-flow-measure');
  const source=measure || document.querySelector('.constitution-paged-content');
  const title=cleanText(source?.querySelector('.title-block h1,h1')?.textContent || '');
  const headings=[...source?.querySelectorAll?.('.card-head,.dc-head,.pc-head,.pt-head,.report-items-title') || []]
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
  return { beforeRows:0, afterRows:DEFAULT_AFTER_ROWS };
}

function applyColorStyle(element, style, marker='group') {
  if (!element) return;
  if (style?.textEnabled && style.text) {
    element.style.setProperty('color',style.text,'important');
    element.dataset.printManualText='true';
    [...element.querySelectorAll('*')].forEach((child)=>child.style.setProperty('color','inherit','important'));
  } else if (element.dataset.printManualText==='true') {
    element.style.removeProperty('color');
    delete element.dataset.printManualText;
  }
  if (style?.fillEnabled && style.fill) {
    element.style.setProperty('background-color',style.fill,'important');
    element.dataset.printManualFill='true';
  } else if (element.dataset.printManualFill==='true') {
    element.style.removeProperty('background-color');
    delete element.dataset.printManualFill;
  }
  if ((style?.textEnabled && style.text) || (style?.fillEnabled && style.fill)) {
    element.dataset.printManualColor=marker;
  } else {
    delete element.dataset.printManualColor;
  }
}

function resetWorkbenchStyles(root) {
  root.querySelectorAll('[data-print-workbench-style="true"]').forEach((element)=>{
    if (element.dataset.printManualText==='true') element.style.removeProperty('color');
    if (element.dataset.printManualFill==='true') element.style.removeProperty('background-color');
    delete element.dataset.printManualText;
    delete element.dataset.printManualFill;
    delete element.dataset.printManualColor;
    delete element.dataset.printWorkbenchStyle;
  });
}

export default function PrintContentWorkbench() {
  const [editing,setEditing]=useState(false);
  const [documentKey,setDocumentKey]=useState('');
  const [profile,setProfile]=useState('');
  const [baseSettings,setBaseSettings]=useState({});
  const [workbench,setWorkbench]=useState(()=>normalizedWorkbench());
  const [selectedBlock,setSelectedBlock]=useState(null);
  const [selectedHeading,setSelectedHeading]=useState(null);
  const [dirty,setDirty]=useState(false);
  const [message,setMessage]=useState('');
  const applyFrame=useRef(null);

  const syncEnvironment=useCallback(()=>{
    const root=document.querySelector(PRINT_ROOT_SELECTOR);
    const nextKey=root?.dataset?.printDocument || '';
    const nextEditing=Boolean(root?.classList.contains('print-layout-editing'));
    setDocumentKey((current)=>current===nextKey?current:nextKey);
    setEditing((current)=>current===nextEditing?current:nextEditing);
    if (nextKey) {
      const nextProfile=profileKey(nextKey);
      setProfile((current)=>current===nextProfile?current:nextProfile);
    }
  },[]);

  useEffect(()=>{
    syncEnvironment();
    const observer=new MutationObserver(syncEnvironment);
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','data-print-document']});
    return ()=>observer.disconnect();
  },[syncEnvironment]);

  useEffect(()=>{
    if (!documentKey || !profile) return;
    let cancelled=false;
    (async()=>{
      const {data,error}=await supabase.from('print_presentation_overrides')
        .select('settings').eq('document_key',documentKey).maybeSingle();
      if (cancelled) return;
      if (error) {
        setMessage(`تعذر تحميل تنسيق المحتوى: ${error.message}`);
        return;
      }
      const settings=data?.settings || {};
      const profileSettings=settings.contentWorkbenchProfiles?.[profile] || {};
      setBaseSettings(settings);
      setWorkbench(normalizedWorkbench(profileSettings));
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
      resetWorkbenchStyles(body);
      const blocks=[...body.querySelectorAll(BLOCK_SELECTOR)];
      blocks.forEach((block)=>{
        const key=blockKey(block);
        block.dataset.printContentKey=key;
        const setting=workbench.blocks?.[key] || defaultBlockSetting();
        block.style.setProperty('--print-block-gap-before',`${Math.max(0,Number(setting.beforeRows)||0)*ROW_MM}mm`);
        block.style.setProperty('--print-block-gap-after',`${Math.max(0,Number(setting.afterRows ?? DEFAULT_AFTER_ROWS))*ROW_MM}mm`);
        if (selectedBlock?.key===key && !block.closest('.constitution-flow-measure')) block.dataset.printContentSelected='true';
        else delete block.dataset.printContentSelected;
      });

      Object.entries(GROUPS).forEach(([groupKey,group])=>{
        [...body.querySelectorAll(group.selector)].forEach((element)=>{
          const key=elementStyleKey(element);
          const style=workbench.elementStyles?.[key] || workbench.styles?.[groupKey] || {};
          applyColorStyle(element,style,workbench.elementStyles?.[key]?'element':'group');
          element.dataset.printWorkbenchStyle='true';
          element.dataset.printWorkbenchGroup=groupKey;
          element.dataset.printWorkbenchKey=key;
          if (selectedHeading?.key===key && !element.closest('.constitution-flow-measure')) element.dataset.printHeadingSelected='true';
          else delete element.dataset.printHeadingSelected;
        });
      });
    });
  },[selectedBlock,selectedHeading,workbench]);

  useEffect(()=>{
    cancelAnimationFrame(applyFrame.current);
    applyFrame.current=requestAnimationFrame(applySettings);
    const observer=new MutationObserver(()=>{
      cancelAnimationFrame(applyFrame.current);
      applyFrame.current=requestAnimationFrame(applySettings);
    });
    observer.observe(document.body,{subtree:true,childList:true});
    return ()=>{
      cancelAnimationFrame(applyFrame.current);
      observer.disconnect();
    };
  },[applySettings]);

  useEffect(()=>{
    const onClick=(event)=>{
      if (!editing || event.target.closest('.no-print')) return;
      const heading=event.target.closest(ALL_HEADING_SELECTOR);
      const block=event.target.closest('.document-visible-block');
      if (heading && heading.closest(BODY_SELECTOR)) {
        const group=groupForElement(heading);
        const key=elementStyleKey(heading);
        setSelectedHeading({key,group,label:shortText(heading.textContent || GROUPS[group]?.label || 'عنوان')});
      }
      if (block && block.closest(BODY_SELECTOR)) {
        setSelectedBlock({key:blockKey(block),label:blockLabel(block)});
      }
    };
    document.addEventListener('click',onClick,true);
    return ()=>document.removeEventListener('click',onClick,true);
  },[editing]);

  const selectedBlockSetting=useMemo(()=>{
    if (!selectedBlock?.key) return defaultBlockSetting();
    return workbench.blocks?.[selectedBlock.key] || defaultBlockSetting();
  },[selectedBlock,workbench.blocks]);

  const updateBlock=useCallback((patch)=>{
    if (!selectedBlock?.key) return;
    setWorkbench((previous)=>({
      ...previous,
      blocks:{
        ...(previous.blocks||{}),
        [selectedBlock.key]:{...(previous.blocks?.[selectedBlock.key]||defaultBlockSetting()),...patch},
      },
    }));
    setDirty(true);
    requestAnimationFrame(requestLayoutRefresh);
  },[requestLayoutRefresh,selectedBlock]);

  const moveUp=useCallback(()=>{
    if (!selectedBlock?.key) return;
    const before=Math.max(0,Number(selectedBlockSetting.beforeRows)||0);
    if (before>0) {
      updateBlock({beforeRows:before-1});
      return;
    }
    const measure=document.querySelector('.constitution-flow-measure .document-content-body');
    const blocks=measure?[...measure.querySelectorAll(BLOCK_SELECTOR)]:[];
    const index=blocks.findIndex((block)=>blockKey(block)===selectedBlock.key);
    if (index>0) {
      const previousKey=blockKey(blocks[index-1]);
      const previous=workbench.blocks?.[previousKey] || defaultBlockSetting();
      if ((Number(previous.afterRows)||0)>0) {
        setWorkbench((state)=>({
          ...state,
          blocks:{...state.blocks,[previousKey]:{...previous,afterRows:Math.max(0,Number(previous.afterRows)-1)}},
        }));
        setDirty(true);
        requestAnimationFrame(requestLayoutRefresh);
      }
    }
  },[requestLayoutRefresh,selectedBlock,selectedBlockSetting.beforeRows,updateBlock,workbench.blocks]);

  const moveDown=useCallback(()=>{
    updateBlock({beforeRows:Math.min(12,(Number(selectedBlockSetting.beforeRows)||0)+1)});
  },[selectedBlockSetting.beforeRows,updateBlock]);

  const updateGroupStyle=useCallback((groupKey,patch)=>{
    setWorkbench((previous)=>({
      ...previous,
      styles:{...(previous.styles||{}),[groupKey]:{...(previous.styles?.[groupKey]||{}),...patch}},
    }));
    setDirty(true);
  },[]);

  const updateElementStyle=useCallback((patch)=>{
    if (!selectedHeading?.key) return;
    setWorkbench((previous)=>({
      ...previous,
      elementStyles:{
        ...(previous.elementStyles||{}),
        [selectedHeading.key]:{...(previous.elementStyles?.[selectedHeading.key]||{}),...patch},
      },
    }));
    setDirty(true);
  },[selectedHeading]);

  const resetElementStyle=useCallback(()=>{
    if (!selectedHeading?.key) return;
    setWorkbench((previous)=>{
      const elementStyles={...(previous.elementStyles||{})};
      delete elementStyles[selectedHeading.key];
      return {...previous,elementStyles};
    });
    setDirty(true);
  },[selectedHeading]);

  const resetBlock=useCallback(()=>{
    if (!selectedBlock?.key) return;
    setWorkbench((previous)=>{
      const blocks={...(previous.blocks||{})};
      delete blocks[selectedBlock.key];
      return {...previous,blocks};
    });
    setDirty(true);
    requestAnimationFrame(requestLayoutRefresh);
  },[requestLayoutRefresh,selectedBlock]);

  const save=useCallback(async()=>{
    if (!documentKey || !profile) return;
    setMessage('جارٍ حفظ تنسيق المحتوى...');
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
    setMessage('تم حفظ ألوان ومسافات هذا النموذج');
  },[baseSettings,documentKey,profile,workbench]);

  if (!editing || !documentKey) return null;

  const selectedElementStyle=selectedHeading?.key ? (workbench.elementStyles?.[selectedHeading.key] || {}) : {};

  return (
    <aside className="print-content-workbench no-print" dir="rtl">
      <div className="pcw-title">تنسيق محتوى المطبوع</div>
      <div className="pcw-note">اضغط على أي كتلة لضبط مسافتها، أو على أي عنوان لتخصيص لونه.</div>

      {selectedBlock && (
        <section className="pcw-section">
          <strong>المسافات — {selectedBlock.label}</strong>
          <label>قبل العنصر
            <input type="range" min="0" max="12" step="1" value={Number(selectedBlockSetting.beforeRows)||0}
              onChange={(event)=>updateBlock({beforeRows:Number(event.target.value)})} />
            <span>{(Number(selectedBlockSetting.beforeRows)||0)*ROW_MM} مم</span>
          </label>
          <label>بعد العنصر
            <input type="range" min="0" max="12" step="1" value={Number(selectedBlockSetting.afterRows ?? DEFAULT_AFTER_ROWS)}
              onChange={(event)=>updateBlock({afterRows:Number(event.target.value)})} />
            <span>{Number(selectedBlockSetting.afterRows ?? DEFAULT_AFTER_ROWS)*ROW_MM} مم</span>
          </label>
          <div className="pcw-actions">
            <button type="button" onClick={moveUp}>↑ أعلى 2 مم</button>
            <button type="button" onClick={moveDown}>↓ أسفل 2 مم</button>
            <button type="button" onClick={resetBlock}>افتراضي</button>
          </div>
        </section>
      )}

      <section className="pcw-section">
        <strong>ألوان أنواع العناوين</strong>
        {Object.entries(GROUPS).map(([groupKey,group])=>{
          const style=workbench.styles?.[groupKey] || {};
          return (
            <div className="pcw-color-row" key={groupKey}>
              <span>{group.label}</span>
              <label className="pcw-check"><input type="checkbox" checked={Boolean(style.textEnabled)} onChange={(event)=>updateGroupStyle(groupKey,{textEnabled:event.target.checked})} /> نص</label>
              <input type="color" value={style.text || '#ffffff'} disabled={!style.textEnabled} onChange={(event)=>updateGroupStyle(groupKey,{text:event.target.value,textEnabled:true})} title="لون النص" />
              <label className="pcw-check"><input type="checkbox" checked={Boolean(style.fillEnabled)} onChange={(event)=>updateGroupStyle(groupKey,{fillEnabled:event.target.checked})} /> تعبئة</label>
              <input type="color" value={style.fill || '#7a1f2b'} disabled={!style.fillEnabled} onChange={(event)=>updateGroupStyle(groupKey,{fill:event.target.value,fillEnabled:true})} title="لون الخلفية" />
            </div>
          );
        })}
      </section>

      {selectedHeading && (
        <section className="pcw-section">
          <strong>العنوان المحدد — {selectedHeading.label}</strong>
          <div className="pcw-color-row single">
            <label className="pcw-check"><input type="checkbox" checked={Boolean(selectedElementStyle.textEnabled)} onChange={(event)=>updateElementStyle({textEnabled:event.target.checked})} /> نص خاص</label>
            <input type="color" value={selectedElementStyle.text || '#ffffff'} disabled={!selectedElementStyle.textEnabled} onChange={(event)=>updateElementStyle({text:event.target.value,textEnabled:true})} />
            <label className="pcw-check"><input type="checkbox" checked={Boolean(selectedElementStyle.fillEnabled)} onChange={(event)=>updateElementStyle({fillEnabled:event.target.checked})} /> تعبئة خاصة</label>
            <input type="color" value={selectedElementStyle.fill || '#7a1f2b'} disabled={!selectedElementStyle.fillEnabled} onChange={(event)=>updateElementStyle({fill:event.target.value,fillEnabled:true})} />
          </div>
          <button type="button" onClick={resetElementStyle}>استخدام إعداد نوع العنوان</button>
        </section>
      )}

      <div className="pcw-footer">
        <button type="button" className="primary" disabled={!dirty} onClick={save}>{dirty?'حفظ التغييرات':'محفوظ'}</button>
        {message && <span>{message}</span>}
      </div>

      <style jsx global>{`
        .print-content-workbench{position:fixed;left:12px;top:84px;z-index:10020;width:322px;max-height:calc(100vh - 104px);overflow:auto;background:#fff;border:1px solid #c9b5b5;box-shadow:0 12px 32px rgba(0,0,0,.14);padding:12px;color:#222;font-family:var(--font-body,Arial,sans-serif)}
        .pcw-title{font-size:14px;font-weight:700;color:#6f1d2a;margin-bottom:4px}.pcw-note{font-size:11px;line-height:1.55;color:#666;margin-bottom:10px}
        .pcw-section{border-top:1px solid #eadede;padding-top:10px;margin-top:10px;display:grid;gap:8px}.pcw-section>strong{font-size:12px;color:#6f1d2a}.pcw-section>label{display:grid;grid-template-columns:76px 1fr 44px;gap:7px;align-items:center;font-size:11px}.pcw-section input[type=range]{width:100%}
        .pcw-actions{display:flex;gap:6px;flex-wrap:wrap}.pcw-actions button,.pcw-section>button,.pcw-footer button{border:1px solid #c8b1b1;background:#fff;color:#5e222a;padding:5px 8px;font-size:11px;cursor:pointer}
        .pcw-color-row{display:grid;grid-template-columns:minmax(90px,1fr) auto 32px auto 32px;gap:5px;align-items:center;font-size:10.5px}.pcw-color-row.single{grid-template-columns:auto 32px auto 32px}.pcw-color-row input[type=color]{width:30px;height:26px;border:1px solid #ccc;padding:1px;background:#fff}.pcw-check{display:flex!important;grid-template-columns:none!important;gap:3px!important;align-items:center!important;white-space:nowrap}
        .pcw-footer{position:sticky;bottom:-12px;background:#fff;border-top:1px solid #eadede;margin:12px -12px -12px;padding:10px 12px;display:flex;align-items:center;gap:8px}.pcw-footer .primary{background:#6f1d2a;color:#fff;border-color:#6f1d2a}.pcw-footer button:disabled{opacity:.45;cursor:default}.pcw-footer span{font-size:10px;color:#666}
        .print-layout-editing .document-visible-block[data-print-content-selected=true]{outline:1px dashed #8b3332!important;outline-offset:1mm;cursor:pointer}.print-layout-editing .document-visible-block:hover{outline:1px dashed rgba(139,51,50,.35);outline-offset:.6mm}
        .print-layout-editing [data-print-heading-selected=true]{box-shadow:inset 0 0 0 1px #f0b323!important}.print-layout-editing ${ALL_HEADING_SELECTOR}{cursor:pointer}
      `}</style>
    </aside>
  );
}
