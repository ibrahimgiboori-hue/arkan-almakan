'use client';

import { useEffect } from 'react';
import html2canvas from 'html2canvas';

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

const CAPTURE_DPI=300;
const CSS_DPI=96;
const CAPTURE_SCALE=CAPTURE_DPI/CSS_DPI;

function nextPaint(){
  return new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
}

function pagePhysicalSize(orientation){
  return orientation==='landscape'
    ? {widthMm:297,heightMm:210}
    : {widthMm:210,heightMm:297};
}

export default function ExactPrintMirror({documentKey,pageCount,orientation='portrait'}){
  useEffect(()=>{
    let disposed=false;
    let timer=null;
    let observer=null;
    let resizeObserver=null;
    let capturePromise=null;
    let sourceRevision=0;
    const nativePrint=window.print.bind(window);

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

    const capturePage=async(page,index)=>{
      const canvas=await html2canvas(page,{
        backgroundColor:'#ffffff',
        scale:CAPTURE_SCALE,
        useCORS:true,
        allowTaint:false,
        logging:false,
        imageTimeout:5000,
        removeContainer:true,
        onclone:(clonedDocument,clonedElement)=>{
          clonedElement.style.boxShadow='none';
          clonedElement.style.margin='0';
          clonedElement.style.transform='none';
          clonedElement.classList.remove('layout-editing','dragging');
          clonedElement.querySelectorAll(REMOVE_SELECTOR).forEach((node)=>node.remove());
          clonedDocument.documentElement.style.background='#fff';
          clonedDocument.body.style.background='#fff';
        },
      });

      const wrapper=document.createElement('section');
      wrapper.className=PAGE_CLASS;
      wrapper.dataset.pageIndex=String(index);
      wrapper.dataset.captureDpi=String(CAPTURE_DPI);

      const image=document.createElement('img');
      image.alt='';
      image.draggable=false;
      image.src=canvas.toDataURL('image/png');
      image.width=canvas.width;
      image.height=canvas.height;
      image.style.display='block';
      image.style.width='100%';
      image.style.height='100%';
      image.style.objectFit='fill';
      image.style.imageRendering='auto';

      wrapper.appendChild(image);
      return wrapper;
    };

    const sync=async(force=false)=>{
      if(disposed)return false;
      if(capturePromise&&!force)return capturePromise;

      const revision=++sourceRevision;
      capturePromise=(async()=>{
        const pages=findPages();
        if(!pages.length)return false;

        mirror.dataset.captureState='rendering';
        const fragment=document.createDocumentFragment();
        for(let index=0;index<pages.length;index+=1){
          if(disposed)return false;
          fragment.appendChild(await capturePage(pages[index],index));
        }

        if(disposed||revision<sourceRevision)return false;
        mirror.replaceChildren(fragment);
        mirror.dataset.pageCount=String(pages.length);
        mirror.dataset.snapshotAt=String(Date.now());
        mirror.dataset.captureState='ready';
        return true;
      })();

      try{return await capturePromise;}
      catch(error){
        mirror.dataset.captureState='error';
        console.error('Captain exact print capture failed',error);
        return false;
      }finally{
        capturePromise=null;
      }
    };

    const schedule=()=>{
      if(disposed||window.matchMedia?.('print')?.matches)return;
      sourceRevision+=1;
      if(timer)window.clearTimeout(timer);
      timer=window.setTimeout(()=>{sync(true);},180);
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

    const exactPrint=async()=>{
      if(disposed)return;
      mirror.dataset.captureState='rendering';
      const ok=await sync(true);
      if(!ok){
        nativePrint();
        return;
      }
      await nextPaint();
      nativePrint();
    };

    const onKeyDown=(event)=>{
      if((event.ctrlKey||event.metaKey)&&String(event.key).toLowerCase()==='p'){
        event.preventDefault();
        exactPrint();
      }
    };

    const previousCaptainPrint=window.__arkanCaptainPrint;
    const previousWindowPrint=window.print;
    window.__arkanCaptainPrint=exactPrint;
    window.print=exactPrint;
    window.addEventListener('keydown',onKeyDown,true);

    const start=async()=>{
      try{await document.fonts?.ready;}catch{}
      if(disposed)return;
      await nextPaint();
      await sync(true);
      attachObservers();
    };
    start();

    return()=>{
      disposed=true;
      if(timer)window.clearTimeout(timer);
      observer?.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener('keydown',onKeyDown,true);
      if(window.__arkanCaptainPrint===exactPrint)window.__arkanCaptainPrint=previousCaptainPrint;
      if(window.print===exactPrint)window.print=previousWindowPrint;
      mirror?.remove();
    };
  },[documentKey,pageCount,orientation]);

  const {widthMm,heightMm}=pagePhysicalSize(orientation);

  return <style jsx global>{`
    @media screen{
      body > .${MIRROR_CLASS}{display:none!important}
    }
    @page{size:${widthMm}mm ${heightMm}mm;margin:0}
    @media print{
      html,body{
        width:${widthMm}mm!important;
        min-width:${widthMm}mm!important;
        margin:0!important;
        padding:0!important;
        background:#fff!important;
      }
      body > *:not(.${MIRROR_CLASS}){
        display:none!important;
      }
      body > .${MIRROR_CLASS}{
        display:block!important;
        visibility:visible!important;
        position:static!important;
        inset:auto!important;
        width:${widthMm}mm!important;
        margin:0!important;
        padding:0!important;
        background:#fff!important;
        -webkit-print-color-adjust:exact!important;
        print-color-adjust:exact!important;
      }
      body > .${MIRROR_CLASS} > .${PAGE_CLASS}{
        display:block!important;
        width:${widthMm}mm!important;
        height:${heightMm}mm!important;
        margin:0!important;
        padding:0!important;
        overflow:hidden!important;
        background:#fff!important;
        box-shadow:none!important;
        break-after:page!important;
        page-break-after:always!important;
        break-inside:avoid!important;
        page-break-inside:avoid!important;
      }
      body > .${MIRROR_CLASS} > .${PAGE_CLASS}:last-child{
        break-after:auto!important;
        page-break-after:auto!important;
      }
      body > .${MIRROR_CLASS} > .${PAGE_CLASS} > img{
        display:block!important;
        width:${widthMm}mm!important;
        height:${heightMm}mm!important;
        max-width:none!important;
        max-height:none!important;
        margin:0!important;
        padding:0!important;
        border:0!important;
      }
    }
  `}</style>;
}
