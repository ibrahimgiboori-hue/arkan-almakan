'use client';

import { useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AREAS } from '@/lib/app-constitution';
import { useDashboardSession } from '@/lib/dashboard-session-context';
import {
  PORTAL_EXISTING_DESTINATION_CAPABILITIES,
  PORTAL_MANAGEMENT_SECTIONS,
  PORTAL_SECTION_ITEMS,
} from '@/lib/portal-section-constitution';
import { portalApproachHref } from '@/lib/living-navigation';
import styles from './approach.module.css';

function uniqueByHref(items=[]){
  const seen=new Set();
  return items.filter((item)=>{
    if(!item?.href||seen.has(item.href))return false;
    seen.add(item.href);return true;
  });
}

function canSeeItem(session,item){
  if(session?.access?.fullAdmin)return true;
  const keys=session?.capabilityKeys||new Set();
  const required=item?.capabilities||PORTAL_EXISTING_DESTINATION_CAPABILITIES[item?.href]||[];
  return !required.length||required.some((key)=>keys.has(key));
}

export default function PortalApproachStage(){
  const { portal }=useParams();
  const router=useRouter();
  const searchParams=useSearchParams();
  const session=useDashboardSession();
  const area=AREAS.find((item)=>item.key===portal&&item.key!=='home')||null;

  const groups=useMemo(()=>{
    if(!area)return[];
    const tools=uniqueByHref([...(area.items||[]),...(PORTAL_SECTION_ITEMS[portal]||[])])
      .filter((item)=>!item.hidden&&!item.legacy)
      .filter((item)=>canSeeItem(session,item));
    const byHref=new Map(tools.map((item)=>[item.href,item]));
    return (PORTAL_MANAGEMENT_SECTIONS[portal]||[]).map((group)=>({
      ...group,
      items:(group.hrefs||[]).map((href)=>byHref.get(href)).filter(Boolean),
    })).filter((group)=>group.items.length);
  },[area,portal,session]);

  if(!area){
    return <div className={styles.stage}><div className={styles.empty}>هذه البوابة غير متاحة.</div></div>;
  }

  const requested=searchParams.get('group')||'';
  const selected=groups.find((group)=>group.key===requested)||null;
  const choices=selected?selected.items:groups;
  const title=selected?selected.label:String(area.label||'').replace(/^بوابة\s+/,'');
  const description=selected?.description||'اختر المسار الذي تريد الاقتراب منه. الاختيار التالي ينتقل إلى مساحة العمل المناسبة.';

  function openChoice(choice){
    if(selected){router.push(choice.href);return;}
    router.push(portalApproachHref(portal,choice.key));
  }

  return <section className={styles.stage} data-navigation-stage="approach" data-portal={portal} data-group={selected?.key||''}>
    <header className={styles.head}>
      <div className={styles.eyebrow}>{selected?'منطقة الملاحة':'البوابة'}</div>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
    <div className={styles.choices} role="list">
      {choices.length?choices.map((choice)=><button
        key={choice.href||choice.key}
        type="button"
        className={styles.choice}
        onClick={()=>openChoice(choice)}
        role="listitem"
      >
        <span>
          <strong>{choice.label}</strong>
          {!selected&&choice.description?<small>{choice.description}</small>:null}
        </span>
        <span className={styles.choiceMark} aria-hidden="true">‹</span>
      </button>):<div className={styles.empty}>لا توجد مسارات متاحة ضمن صلاحياتك الحالية.</div>}
    </div>
  </section>;
}
