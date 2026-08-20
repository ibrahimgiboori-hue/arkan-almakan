'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import './portal.css';

export default function ContractorLayout({children}){
  const pathname=usePathname();const router=useRouter();
  const [context,setContext]=useState(null);const [ready,setReady]=useState(pathname==='/contractor/login');
  useEffect(()=>{
    if(pathname==='/contractor/login'){setReady(true);return;}
    let alive=true;(async()=>{
      const {data:{session}}=await supabase.auth.getSession();
      if(!session){router.replace('/contractor/login');return;}
      const {data,error}=await supabase.rpc('fn_portal_dashboard');
      if(!alive)return;
      if(error){await supabase.auth.signOut();router.replace('/contractor/login');return;}
      setContext(data);setReady(true);
    })();return()=>{alive=false};
  },[pathname,router]);
  if(pathname==='/contractor/login')return children;
  async function logout(){await supabase.auth.signOut();router.replace('/contractor/login');}
  if(!ready)return <div className="portal-loading">جارٍ فتح بوابة المقاول…</div>;
  return <div className="contractor-shell" dir="rtl">
    <header><Link href="/contractor"><b>أركان المكان</b><span>بوابة المقاولين</span></Link><div><span>{context?.account?.displayName}</span><button onClick={logout}>خروج</button></div></header>
    <main>{children}</main>
  </div>;
}
