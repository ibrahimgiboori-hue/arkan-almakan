'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const LOGIN='/login';

export default function MuhammadTorkyEntry(){
  const router=useRouter();

  useEffect(()=>{
    let alive=true;
    supabase.auth.getSession().then(({data})=>{
      if(!alive)return;
      router.replace(data.session?'/dashboard/approvals':LOGIN);
    });
    return()=>{alive=false;};
  },[router]);

  return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',direction:'rtl'}}>جارٍ فتح مكتب الاعتمادات…</main>;
}
