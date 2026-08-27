'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function MyWorkLayout({children}){
  const pathname=usePathname();
  const [approvalCount,setApprovalCount]=useState(0);

  const refresh=useCallback(async()=>{
    const {data,error}=await supabase.rpc('fn_my_approval_inbox');
    if(!error)setApprovalCount((data||[]).length);
  },[]);

  useEffect(()=>{refresh();},[refresh,pathname]);

  const approvalsActive=pathname?.startsWith('/dashboard/my-work/approvals');
  return <>
    <nav aria-label="مسارات أعمالي" style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',padding:'12px 18px',borderBottom:'1px solid var(--ui-border,#d6d6d6)',background:'var(--ui-surface,#fff)',position:'sticky',top:0,zIndex:20}}>
      <Link href="/dashboard/my-work" style={{textDecoration:'none',fontWeight:800,padding:'9px 13px',borderRadius:9,border:'1px solid var(--ui-border,#ccc)',background:approvalsActive?'transparent':'var(--ui-primary,#7c2b28)',color:approvalsActive?'var(--ui-text,#222)':'#fff'}}>تواصل العمل</Link>
      <Link href="/dashboard/my-work/approvals" style={{textDecoration:'none',fontWeight:800,padding:'9px 13px',borderRadius:9,border:'1px solid var(--ui-border,#ccc)',background:approvalsActive?'var(--ui-primary,#7c2b28)':'transparent',color:approvalsActive?'#fff':'var(--ui-text,#222)'}}>اعتمادات بانتظاري {approvalCount>0?`(${approvalCount})`:''}</Link>
    </nav>
    {children}
  </>;
}
