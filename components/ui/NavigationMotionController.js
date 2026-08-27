'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { recordLogicalRoute, rememberNavigationOrigin } from '@/lib/navigation-history';

const DASHBOARD_PREFIX = '/dashboard';

function reducedMotion(){
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function pathDepth(value=''){
  return String(value).split('/').filter(Boolean).length;
}

function visible(element){
  if(!(element instanceof Element)) return false;
  const style=window.getComputedStyle(element);
  if(style.display==='none'||style.visibility==='hidden') return false;
  const rect=element.getBoundingClientRect();
  return rect.width>0&&rect.height>0;
}

function animateElement(element,intent='lateral'){
  if(!element||reducedMotion()||typeof element.animate!=='function') return;
  const x=intent==='back'?10:intent==='forward'?-10:-5;
  const scale=intent==='lateral'?.997:.999;
  element.getAnimations?.().forEach(animation=>{
    if(animation.id==='arkan-navigation-motion') animation.cancel();
  });
  const animation=element.animate([
    {opacity:.84,transform:`translate3d(${x}px,0,0) scale(${scale})`},
    {opacity:1,transform:'translate3d(0,0,0) scale(1)'},
  ],{
    duration:intent==='lateral'?190:220,
    easing:'cubic-bezier(.20,.78,.24,1)',
    fill:'both',
  });
  animation.id='arkan-navigation-motion';
}

function contentRoot(){
  return document.querySelector('[data-content-governance]');
}

function findTabTarget(tab){
  const tablist=tab.closest('[role="tablist"]');
  if(!tablist) return null;
  const panel=tablist.parentElement?.querySelector?.('[role="tabpanel"]');
  if(panel&&visible(panel)) return panel;
  const bottom=tablist.getBoundingClientRect().bottom;
  return [...document.querySelectorAll('section[aria-label]')]
    .filter(section=>visible(section)&&section.getBoundingClientRect().top>=bottom-2)
    .sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top)[0]||null;
}

export default function NavigationMotionController(){
  const pathname=usePathname();
  const previousPath=useRef(pathname);
  const intentRef=useRef('lateral');

  useEffect(()=>{
    recordLogicalRoute(pathname);
  },[pathname]);

  useEffect(()=>{
    function onPointer(event){
      if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey) return;
      const target=event.target instanceof Element?event.target:null;
      if(!target) return;

      const tab=target.closest('[role="tab"]');
      if(tab){
        requestAnimationFrame(()=>requestAnimationFrame(()=>animateElement(findTabTarget(tab)||contentRoot(),'lateral')));
        return;
      }

      const anchor=target.closest('a[href]');
      if(!anchor||anchor.target||anchor.hasAttribute('download')) return;
      const href=anchor.getAttribute('href')||'';
      if(!href||href.startsWith('#')) return;
      let url;
      try{url=new URL(anchor.href,window.location.href);}catch{return;}
      if(url.origin!==window.location.origin||!url.pathname.startsWith(DASHBOARD_PREFIX)) return;

      const source=`${window.location.pathname}${window.location.search}${window.location.hash}`;
      const destination=`${url.pathname}${url.search}${url.hash}`;
      // الدستور: الأداة تتذكر الشاشة التي فُتحت منها فعلياً، لا مجرد Browser History.
      rememberNavigationOrigin(destination,source);

      const currentDepth=pathDepth(window.location.pathname);
      const nextDepth=pathDepth(url.pathname);
      const intent=nextDepth>currentDepth?'forward':nextDepth<currentDepth?'back':'lateral';
      intentRef.current=intent;

      if(url.pathname===window.location.pathname&&url.search!==window.location.search){
        requestAnimationFrame(()=>animateElement(contentRoot(),intent));
      }
    }

    function onPopState(){
      intentRef.current='back';
      requestAnimationFrame(()=>animateElement(contentRoot(),'back'));
    }

    document.addEventListener('click',onPointer,true);
    window.addEventListener('popstate',onPopState);
    return()=>{
      document.removeEventListener('click',onPointer,true);
      window.removeEventListener('popstate',onPopState);
    };
  },[]);

  useEffect(()=>{
    if(previousPath.current===pathname){
      previousPath.current=pathname;
      return;
    }
    const intent=intentRef.current||'lateral';
    previousPath.current=pathname;
    requestAnimationFrame(()=>{
      animateElement(contentRoot(),intent);
      intentRef.current='lateral';
    });
  },[pathname]);

  return null;
}
