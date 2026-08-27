'use client';

import { useLayoutEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import WorkPlatformPage from '../page';
import { PROGRAM_PORTAL_BY_KEY, PROGRAM_WORKSPACE_PATH } from '@/lib/program-links';

export default function PortalWorkspaceEntry(){
  const { portal } = useParams();
  const router = useRouter();
  const key = String(portal || '');
  const valid = Boolean(PROGRAM_PORTAL_BY_KEY[key]);

  useLayoutEffect(()=>{
    if(!valid){ router.replace(PROGRAM_WORKSPACE_PATH); return; }
    try{ window.localStorage.setItem('arkan.workspace.portal',key); }catch{}
  },[key,valid,router]);

  if(!valid) return null;
  return <WorkPlatformPage/>;
}
