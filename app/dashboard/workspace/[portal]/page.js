'use client';

import { useLayoutEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import WorkPlatformPage from '../page';
import { PROGRAM_PORTAL_BY_KEY, PROGRAM_WORKSPACE_PATH } from '@/lib/program-links';

const PORTAL_EYEBROW=Object.freeze({
  projects:'PROJECTS',
  workforce:'PEOPLE',
  finance:'FINANCE',
  documents:'DOCUMENTS',
  admin:'ADMIN',
});

export default function PortalWorkspaceEntry(){
  const { portal } = useParams();
  const router = useRouter();
  const key = String(portal || '');
  const valid = Boolean(PROGRAM_PORTAL_BY_KEY[key]);

  useLayoutEffect(()=>{
    if(!valid){
      router.replace(PROGRAM_WORKSPACE_PATH);
      return;
    }

    try{window.localStorage.setItem('arkan.workspace.portal',key);}catch{}
    const eyebrow=PORTAL_EYEBROW[key];

    function activatePortal(){
      const tabs=[...document.querySelectorAll('[role="tab"]')];
      const target=tabs.find(tab=>String(tab.querySelector('small')?.textContent||'').trim()===eyebrow);
      if(!target) return false;
      if(target.getAttribute('aria-selected')!=='true') target.click();
      return true;
    }

    if(activatePortal()) return;
    const observer=new MutationObserver(()=>{
      if(activatePortal()) observer.disconnect();
    });
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>observer.disconnect();
  },[key,valid,router]);

  if(!valid) return null;
  return <WorkPlatformPage/>;
}
