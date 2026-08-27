'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import styles from './workspace.module.css';

export default function PortalActionMetrics({portalKey,projectId=null}){
  const [rows,setRows]=useState(null);

  useEffect(()=>{
    if(!portalKey)return;
    let alive=true;
    (async()=>{
      const {data}=await supabase.rpc('fn_portal_work_center',{p_portal_key:portalKey,p_project_id:portalKey==='projects'?projectId||null:null});
      if(alive)setRows(data||[]);
    })();
    return()=>{alive=false;};
  },[portalKey,projectId]);

  const counts=useMemo(()=>{
    if(!rows)return null;
    // لا نعد مخاطبة مرتبطة بمسار اعتماد مرة ثانية بجانب الاعتماد الأصلي.
    const base=rows.filter(row=>row.item_kind==='approval'||!row.workflow_id);
    return {
      mine:base.filter(row=>row.is_mine).length,
      portal:base.filter(row=>row.is_portal).length,
      sent:base.filter(row=>row.is_sent).length,
    };
  },[rows]);

  function href(view){
    const q=new URLSearchParams({view});
    if(portalKey==='projects'&&projectId)q.set('project',projectId);
    return `/dashboard/workspace/${portalKey}/approvals?${q.toString()}`;
  }

  const items=[
    ['mine','بانتظار إجراءك','موجّه لك شخصيًا'],
    ['portal','بانتظار البوابة','لم يستلمه شخص بعد'],
    ['sent','صادر منك','بانتظار جهة أخرى'],
  ];

  return <div className={styles.heroMetrics} aria-label="الإجراءات والاعتمادات">
    {items.map(([key,label,hint])=><Link key={key} href={href(key)} className={styles.heroMetric} style={{color:'inherit',textDecoration:'none'}}>
      <span>{label}</span><strong>{counts?counts[key]:'…'}</strong><small>{hint}</small>
    </Link>)}
  </div>;
}
