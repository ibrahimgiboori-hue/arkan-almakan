'use client';

import { useEffect } from 'react';

const MIRROR_CLASS='arkan-exact-print-mirror';
const PAGE_CLASS='arkan-exact-print-page';
const REMOVE_SELECTOR=[
  '.no-print',
  '.paged-grid-boundary',
  '.paged-table-row-boundary',
  '.paged-table-outer-boundary',
  '.paged-grid-height',
  '.boundary-box-handle',
  '.boundary-box-editor',
  '.constitution-paged-grid-overlay',
  '.constitution-safe-zone-guide',
].join(',');

function copyComputedStyle(source,target){
  const computed=window.getComputedStyle(source);
  for(let index=0;index<computed.length;index+=1){
    const property=computed[index];
    const value=computed.getPropertyValue(property);
    if(value)target.style.setProperty(property,value,computed.getPropertyPriority(property));
  }
}

function cloneVisualTree(source){
  const clone=source.cloneNode(true);
  const sourceNodes=[source,...source.querySelectorAll('*')];
  const cloneNodes=[clone,...clone.querySelectorAll('*')];
  const count=Math.min(sourceNodes.length,cloneNodes.length);

  for(let index=0;index<count;index+=1){
    copyComputedStyle(sourceNodes[index],cloneNodes[index]);
    if(sourceNodes[index] instanceof HTMLInputElement && cloneNodes[index] instanceof HTMLInputElement){
      cloneNodes[index].value=sourceNodes[index].value;
      cloneNodes[index].checked=sourceNodes[index].checked;
    }
    if(sourceNodes[index] instanceof HTMLTextAreaElement && cloneNodes[index] instanceof HTMLTextAreaElement){
      cloneNodes[index].value=sourceNodes[index].value;
      cloneNodes[index].textContent=sourceNodes[index].value;
    }
    if(sourceNodes[index] instanceof HTMLSelectElement && cloneNodes[index] instanceof HTMLSelectElement){
      cloneNodes[index].value=sourceNodes[index].value;
    }
  }

  clone.querySelectorAll(REMOVE_SELECTOR).forEach((node)=>node.remove());
  clone.classList.add(PAGE_CLASS);
  clone.classList.remove('layout-editing','dragging');
  clone.style.boxShadow='none';
  clone.style.margin='0';
  clone.style.transform='none';
  clone.setAttribute('data-exact-screen-print','true');
  return clone;
}

export default function ExactPrintMirror({documentKey,pageCount,orientation='portrait'}){
  useEffect(()=>{
    let disposed=false;
    let timer=null;
    let observer=null;
    let resizeObserver=null;
    let mirror=document.querySelector('body > .'+MIRROR_CLASS+'[data-print-document-key="'+documentKey+'"]');

    if(!mirror){
      mirror=document.createElement('div');
      mirror.className=MIRROR_CLASS;
      mirror.dataset.printDocumentKey=documentKey;
      mirror.setAttribute('aria-hidden','true');
      document.body.appendChild(mirror);
    }

    const findPages=()=>{
      const hosts=[...document.querySelectorAll('.constitution-paged-pages')];
      const host=hosts.find((node)=>node.querySelector('[data-print-document="'+documentKey+'"]'));
      if(!host)return [];
      return [...host.querySelectorAll(':scope > [data-print-page-physical="true"]')];
    };

    const sync=()=>{
      if(disposed||window.matchMedia?.('print')?.matches)return;
      const pages=findPages();
      if(!pages.length)return;
      const fragment=document.createDocumentFragment();
      pages.forEach((page)=>fragment.appendChild(cloneVisualTree(page)));
      mirror.replaceChildren(fragment);
      mirror.dataset.pageCount=String(pages.length);
      mirror.dataset.snapshotAt=String(Date.now());
    };

    const schedule=()=>{
      if(disposed)return;
      if(timer)window.clearTimeout(timer);
      timer=window.setTimeout(sync,80);
    };

    const attachObservers=()=>{
      const pages=findPages();
      const host=pages[0]?.parentElement;
      if(!host)return;
      observer=new MutationObserver(schedule);
      observer.observe(host,{subtree:true,childList:true,attributes:true,characterData:true});
      resizeObserver=new ResizeObserver(schedule);
      resizeObserver.observe(host);
      pages.forEach((page)=>resizeObserver.observe(page));
    };

    const refreshBeforePrint=()=>{
      if(!mirror.childElementCount)sync();
    };

    document.fonts?.ready?.then(()=>{schedule();attachObservers();}).catch(()=>{schedule();attachObservers();});
    if(!document.fonts?.ready){schedule();attachObservers();}

    window.addEventListener('beforeprint',refreshBeforePrint);
    window.addEventListener('resize',schedule);

    return()=>{
      disposed=true;
      if(timer)window.clearTimeout(timer);
      observer?.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener('beforeprint',refreshBeforePrint);
      window.removeEventListener('resize',schedule);
      mirror?.remove();
    };
  },[documentKey,pageCount,orientation]);

  return <style jsx global>{`
    @media screen{
      body > .${MIRROR_CLASS}{display:none!important}
    }
    @page{size:A4 ${orientation};margin:0}
    @media print{
      html,body{
        margin:0!important;
        padding:0!important;
        background:#fff!important;
      }
      body > *:not(.${MIRROR_CLASS}){
        display:none!important;
      }
      body > .${MIRROR_CLASS}{
        display:block!important;
        -webkit-print-color-adjust:exact!important;
        print-color-adjust:exact!important;
        visibility:visible!important;
        position:static!important;
        inset:auto!important;
        margin:0!important;
        padding:0!important;
        background:#fff!important;
      }
      body > .${MIRROR_CLASS} > .${PAGE_CLASS}{
        box-shadow:none!important;
        margin:0!important;
        break-after:page!important;
        page-break-after:always!important;
        break-inside:avoid!important;
        page-break-inside:avoid!important;
      }
      body > .${MIRROR_CLASS} > .${PAGE_CLASS}:last-child{
        break-after:auto!important;
        page-break-after:auto!important;
      }
    }
  `}</style>;
}
