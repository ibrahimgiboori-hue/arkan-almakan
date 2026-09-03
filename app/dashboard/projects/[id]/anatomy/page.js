'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useDashboardSession } from '@/lib/dashboard-session-context';
import ProjectAnatomyStage from '@/components/ui/ProjectAnatomyStage';

export default function ProjectAnatomyPage(){
  const { id }=useParams();
  const searchParams=useSearchParams();
  const session=useDashboardSession();
  const [project,setProject]=useState(null);
  const [error,setError]=useState('');

  useEffect(()=>{
    let alive=true;
    (async()=>{
      const {data,error:queryError}=await supabase
        .from('projects')
        .select('id,project_no,name_ar,city,stage,status,supply_scope,our_role,commencement_date,duration_days')
        .eq('id',id)
        .maybeSingle();
      if(!alive)return;
      if(queryError||!data){setError(queryError?.message||'لم يُعثر على المشروع.');return;}
      setProject(data);
    })();
    return()=>{alive=false;};
  },[id]);

  const access=useMemo(()=>{
    const caps=(session?.capabilities||[]).filter((cap)=>
      cap.module_key==='projects'&&
      (cap.scope_type==='all'||(cap.scope_type==='project'&&String(cap.scope_key)===String(id)))
    );
    const full=Boolean(session?.access?.fullAdmin)||caps.some((cap)=>cap.source_key==='projects_full_access');
    return {full,keys:[...new Set(caps.map((cap)=>cap.capability_key))]};
  },[id,session]);

  if(error)return <div className="msg err" style={{margin:24}}>{error}</div>;
  if(!project)return <div className="empty" style={{padding:24}}>جارٍ تحميل بطاقة المشروع…</div>;

  return <ProjectAnatomyStage
    project={project}
    projectId={id}
    access={access}
    care={searchParams.get('care')||'active'}
    region={searchParams.get('region')||''}
  />;
}
