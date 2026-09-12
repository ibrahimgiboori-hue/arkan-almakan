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
  if (!block) return 'كتلة محتوى';
  const child=block.firstElementChild;
  const heading=child?.querySelector?.('.card-head,.pc-head,.pt-head,.dc-head,.report-items-title,.strict>.head,thead th,h1,h2,h3')?.textContent || '';
  if (cleanText(heading)) return shortText(heading);
  if (child?.classList?.contains('footer-row')) return 'بيانات الشركة / الختم';
  if (child?.classList?.contains('sigtable')) return 'التوقيعات';
  if (child?.classList?.contains('fill')) return 'مساحة مرنة';
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
  root.querySelectorAll('[data-print-workbench-spacing="true"]').forEach((element)=>{
    element.style.removeProperty('margin-top');
    element.style.removeProperty('margin-bottom');
    delete element.dataset.printWorkbenchSpacing;
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
  const [blockOptions,setBlockOptions]=useState([]);
  const [dirty,setDirty]=useState(false);
  const [message,setMessage]=useState('');
  const [dockStyle,setDockStyle]=useState({});
  const applyFrame=useRef(null);

  const refreshDock=useCallback(()=>{
    const bar=document.querySelector('.constitution-paged-layoutbar');
    if (!bar) return;
    const rect=bar.getBoundingClientRect();
    const viewportWidth=window.innerWidth || document.documentElement.clientWidth || 1280;
    const viewportHeight=window.innerHeight || document.documentElement.clientHeight || 800;
    const width=Math.min(Math.max(270,Math.min(340,rect.width || 300)),Math.max(270,viewportWidth-24));
    const right=Math.max(12,viewportWidth-rect.right);
    const top=Math.min(Math.max(12,rect.bottom+8),Math.max(12,viewportHeight-220));
    setDockStyle({right,top,width,maxHeight:Math.max(190,viewportHeight-top-12)});
  },[]);

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
    setBlockOptions(options);
    setSelectedBlock((current)=>{
      if (current && options.some((option)=>option.key===current.key)) return current;
      return options[0] || null;
    });
  },[]);

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
    refreshBlocks();
    refreshDock();
  },[refreshBlocks,refreshDock]);

  useEffect(()=>{
    syncEnvironment();
    const observer=new MutationObserver(syncEnvironment);
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','data-print-document']});
    window.addEventListener('resize',refreshDock);
    window.addEventListener('scroll',refreshDock,true);
    return ()=>{
      observer.disconnect();
      window.removeEventListener('resize',refreshDock);
      window.removeEventListener('scroll',refreshDock,true);
    };
  },[refreshDock,syncEnvironment]);

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
        const beforeRows=Math.max(0,Number(setting.beforeRows)||0);
        const afterRows=Math.max(0,Number(setting.afterRows ?? DEFAULT_AFTER_ROWS));
        const beforeMm=beforeRows*ROW_MM;
        const afterMm=afterRows*ROW_MM;
        block.style.setProperty('--print-block-gap-before',`${beforeMm}mm`);
        block.style.setProperty('--print-block-gap-after',`${afterMm}mm`);
        const child=block.firstElementChild;
        if (child) {
          child.style.setProperty('margin-top',`${beforeMm}mm`,'important');
          child.style.setProperty('margin-bottom',`${afterMm}mm`,'important');
          child.dataset.printWorkbenchSpacing='true';
        }
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

  const previousBlockKey=useCallback(()=>{
    if (!selectedBlock?.key) return null;
    const index=blockOptions.findIndex((option)=>option.key===selectedBlock.key);
    return index>0?blockOptions[index-1].key:null;
  },[blockOptions,selectedBlock]);

  const compactAbove=useCallback(()=>{
    if (!selectedBlock?.key) return;
    const previousKey=previousBlockKey();
    setWorkbench((state)=>{
      const blocks={...(state.blocks||{})};
      blocks[selectedBlock.key]={...(blocks[selectedBlock.key]||defaultBlockSetting()),beforeRows:0};
      if (previousKey) blocks[previousKey]={...(blocks[previousKey]||defaultBlockSetting()),afterRows:0};
      return {...state,blocks};
    });
    setDirty(true);
    requestAnimationFrame(requestLayoutRefresh);
  },[previousBlockKey,requestLayoutRefresh,selectedBlock]);

  const moveUp=useCallback(()=>{
    if (!selectedBlock?.key) return;
    const before=Math.max(0,Number(selectedBlockSetting.beforeRows)||0);
    if (before>0) {
      updateBlock({beforeRows:before-1});
      return;
    }
    const previousKey=previousBlockKey();
    if (previousKey) {
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
  },[previousBlockKey,requestLayoutRefresh,selectedBlock,selectedBlockSetting.beforeRows,updateBlock,workbench.blocks]);

  const moveDown=useCallback(()=>{
    updateBlock({beforeRows:Math.min(12,(Number(selectedBlockSetting.beforeRows)||0)+1)});
  },[selectedBlockSetting.beforeRows,updateBlock]);

  const compactAll=useCallback(()=>{
    const blocks={};
    blockOptions.forEach((option)=>{blocks[option.key]={beforeRows:0,afterRows:0};});
    setWorkbench((state)=>({...state,blocks}));
    setDirty(true);
    requestAnimationFrame(requestLayoutRefresh);
  },[blockOptions,requestLayoutRefresh]);

  const restoreAllSpacing=useCallback(()=>{
    setWorkbench((state)=>({...state,blocks:{}}));
    setDirty(true);
    requestAnimationFrame(requestLayoutRefresh);
  },[requestLayoutRefresh]);

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

  const openCaptain=useCallback(()=>{
    const button=document.querySelector('.constitution-paged-layoutbar button');
    if (!button) {
      setMessage('لم يتم العثور على لوحة القبطان في هذه الصفحة');
      return;
    }
    button.click();
    requestAnimationFrame(()=>{
      refreshDock();
      refreshBlocks();
    });
  },[refreshBlocks,refreshDock]);

  if (!documentKey) return null;

  const selectedElementStyle=selectedHeading?.key ? (workbench.elementStyles?.[selectedHeading.key] || {}) : {};

  return (
    <aside className={`print-content-workbench no-print ${editing?'is-editing':'is-closed'}`} dir="rtl" style={dockStyle}>
      <div className="pcw-title">التخطيط والألوان</div>
      {!editing ? (
        <>
          <div className="pcw-note">قرّب العناصر، ألغِ الفراغات، واختر ألوان عناوين الجداول والحقول.</div>
          <button type="button" className="pcw-open" onClick={openCaptain}>فتح تحرير المسافات والألوان</button>
          {message && <div className="pcw-message">{message}</div>}
        </>
      ) : (
        <>
          <div className="pcw-note">اختر كتلة من القائمة أو اضغط عليها داخل الورقة. كل ما تحتها ينسحب تلقائيًا عند تقليل المسافة.</div>

          <section className="pcw-section">
            <strong>اختيار العنصر</strong>
            <select className="pcw-block-select" value={selectedBlock?.key || ''}
              onChange={(event)=>{
                const option=blockOptions.find((item)=>item.key===event.target.value);
                setSelectedBlock(option || null);
              }}>
              {blockOptions.map((option)=><option value={option.key} key={option.key}>{option.label}</option>)}
            </select>
            {selectedBlock && <>
              <label>فراغ قبله
                <input type="range" min="0" max="12" step="1" value={Number(selectedBlockSetting.beforeRows)||0}
                  onChange={(event)=>updateBlock({beforeRows:Number(event.target.value)})} />
                <span>{(Number(selectedBlockSetting.beforeRows)||0)*ROW_MM} مم</span>
              </label>
              <label>فراغ بعده
                <input type="range" min="0" max="12" step="1" value={Number(selectedBlockSetting.afterRows ?? DEFAULT_AFTER_ROWS)}
                  onChange={(event)=>updateBlock({afterRows:Number(event.target.value)})} />
                <span>{Number(selectedBlockSetting.afterRows ?? DEFAULT_AFTER_ROWS)*ROW_MM} مم</span>
              </label>
              <div className="pcw-actions">
                <button type="button" onClick={moveUp}>↑ قرب 2 مم</button>
                <button type="button" onClick={moveDown}>↓ أبعد 2 مم</button>
                <button type="button" onClick={compactAbove}>التصاق بما قبله</button>
                <button type="button" onClick={resetBlock}>افتراضي</button>
              </div>
            </>}
            <div className="pcw-actions wide">
              <button type="button" onClick={compactAll}>ضغط كل الفراغات</button>
              <button type="button" onClick={restoreAllSpacing}>إرجاع المسافات الافتراضية</button>
            </div>
          </section>

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
        </>
      )}

      <style jsx global>{`
        .print-content-workbench{position:fixed;z-index:10020;overflow:auto;background:#fff;border:1px solid #c9b5b5;border-radius:8px;box-shadow:0 10px 28px rgba(0,0,0,.14);padding:11px;color:#222;font-family:var(--font-body,Arial,sans-serif);box-sizing:border-box}
        .print-content-workbench.is-closed{overflow:visible}.pcw-title{font-size:14px;font-weight:700;color:#6f1d2a;margin-bottom:5px}.pcw-note{font-size:11px;line-height:1.55;color:#666;margin-bottom:9px}.pcw-open{width:100%;border:1px solid #7a1f2b;background:#7a1f2b;color:#fff;padding:8px 7px;font:inherit;font-size:11.5px;cursor:pointer}.pcw-message{font-size:10px;color:#6f1d2a;margin-top:6px}
        .pcw-section{border-top:1px solid #eadede;padding-top:9px;margin-top:9px;display:grid;gap:7px}.pcw-section>strong{font-size:12px;color:#6f1d2a}.pcw-section>label{display:grid;grid-template-columns:70px 1fr 42px;gap:6px;align-items:center;font-size:10.5px}.pcw-section input[type=range]{width:100%;accent-color:#8B3332}.pcw-block-select{width:100%;min-width:0;border:1px solid #c9c1c1;background:#fff;padding:6px;font:inherit;font-size:11px;color:#222}
        .pcw-actions{display:flex;gap:5px;flex-wrap:wrap}.pcw-actions.wide{border-top:1px dashed #eadede;padding-top:7px}.pcw-actions button,.pcw-section>button,.pcw-footer button{border:1px solid #c8b1b1;background:#fff;color:#5e222a;padding:5px 7px;font-size:10.5px;cursor:pointer}.pcw-actions button:hover,.pcw-section>button:hover{background:#fbf4f4}
        .pcw-color-row{display:grid;grid-template-columns:minmax(82px,1fr) auto 30px auto 30px;gap:4px;align-items:center;font-size:10px}.pcw-color-row.single{grid-template-columns:auto 30px auto 30px}.pcw-color-row input[type=color]{width:28px;height:25px;border:1px solid #ccc;padding:1px;background:#fff}.pcw-check{display:flex!important;grid-template-columns:none!important;gap:3px!important;align-items:center!important;white-space:nowrap}
        .pcw-footer{position:sticky;bottom:-11px;background:#fff;border-top:1px solid #eadede;margin:10px -11px -11px;padding:9px 11px;display:flex;align-items:center;gap:7px}.pcw-footer .primary{background:#6f1d2a;color:#fff;border-color:#6f1d2a}.pcw-footer button:disabled{opacity:.45;cursor:default}.pcw-footer span{font-size:9.5px;color:#666}
        .print-layout-editing .document-visible-block[data-print-content-selected=true]{outline:1.5px dashed #8b3332!important;outline-offset:1mm;cursor:pointer}.print-layout-editing .document-visible-block:hover{outline:1px dashed rgba(139,51,50,.45);outline-offset:.6mm}.print-layout-editing [data-print-heading-selected=true]{box-shadow:inset 0 0 0 1.5px #f0b323!important}.print-layout-editing ${ALL_HEADING_SELECTOR}{cursor:pointer}
        @media(max-width:900px){.print-content-workbench{left:12px!important;right:12px!important;bottom:12px!important;top:auto!important;width:auto!important;max-height:48vh!important}}
      `}</style>
    </aside>
  );
}
