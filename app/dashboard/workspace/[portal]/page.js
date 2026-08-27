'use client';

import { useLayoutEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import WorkPlatformPage from '../page';
import { PROGRAM_PORTAL_BY_KEY, PROGRAM_WORKSPACE_PATH } from '@/lib/program-links';

export default function PortalWorkspaceEntry(){
  const { portal } = useParams();
  const router = useRouter();
  const [ready,setReady] = useState(false);
  const key = String(portal || '');

  useLayoutEffect(()=>{
    if(!PROGRAM_PORTAL_BY_KEY[key]){
      router.replace(PROGRAM_WORKSPACE_PATH);
      return;
    }
    try{window.localStorage.setItem('arkan.workspace.portal',key);}catch{}
    setReady(true);
  },[key,router]);

  if(!ready) return null;
  return <WorkPlatformPage/>;
}
