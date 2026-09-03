'use client';

import { useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AREAS } from '@/lib/app-constitution';
import { useDashboardSession } from '@/lib/dashboard-session-context';
import {
  PORTAL_EXISTING_DESTINATION_CAPABILITIES,
  PORTAL_SECTION_ITEMS,
} from '@/lib/portal-section-constitution';
import { SHELL_PORTAL_GROUPS } from '@/lib/navigation-shell-constitution';
import { PROJECT_GUARDIANS, portalApproachHref } from '@/lib/living-navigation';
import { requestWorkSessionNavigation } from '@/components/ui/WorkSessionRuntime';
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

  const tools=useMemo(()=>{
    if(!area)return[];
    return uniqueByHref([...(area.items||[]),...(PORTAL_SECTION_ITEMS[portal]||[])])
      .filter((item)=>!item.hidden&&!item.legacy)
      .filter((item)=>canSeeItem(session,item));
  },[area,portal,session]);

  const groups=useMemo(()=>{
    if(!area||portal==='projects')return[];
    const byHref=new Map(tools.map((item)=>[item.href,item]));
    const configured=SHELL_PORTAL_GROUPS[portal]||[];
    const result=configured.map((group)=>({
      key:group.key,
      label:group.label,
      items:(group.hrefs||[]).map((href)=>byHref.get(href)).filter(Boolean),
    })).filter((group)=>group.items.length);
    const assigned=new Set(configured.flatMap((group)=>group.hrefs||[]));
    const extras=tools.filter((item)=>!assigned.has(item.href));
    if(extras.length)result.push({key:'more',label:'المزيد',items:extras});
    return result;
  },[area,portal,tools]);

  if(!area){
    return <div className={styles.stage}><div className={styles.empty}>هذه البوابة غير متاحة.</div></div>;
  }

  const requested=searchParams.get('group')||'';
  const selected=groups.find((group)=>group.key===requested)||null;
  const projectsGuardians=portal==='projects'
    ? PROJECT_GUARDIANS.filter((guardian)=>guardian.entityKind==='project'||tools.some((item)=>item.href===guardian.href))
    : [];
  const choices=portal==='projects' ? projectsGuardians : (selected?selected.items:groups);
  const title=portal==='projects'
    ? 'المشاريع'
    : selected?selected.label:String(area.label||'').replace(/^بوابة\s+/,'');
  const description=portal==='projects'
    ? 'اختر الحاضنة الحالية. أسماء المشاريع الحقيقية لا تعيش في القائمة؛ ستظهر هنا بحسب حالتها.'
    : selected
      ? 'هذه المسارات تظهر هنا كخيارات فعلية؛ القائمة تحتفظ بها كتوضيح للسياق فقط.'
      : 'اختر المسار الذي تريد الاقتراب منه. القائمة تعرض فرعًا حيًا واحدًا، والمسرح يستلم الاختيار التالي.';

  function openChoice(choice){
    const href=portal==='projects'
      ? choice.href
      : selected?choice.href:portalApproachHref(portal,choice.key);
    if(!href)return;
    const accepted=requestWorkSessionNavigation(href);
    if(accepted)router.push(href);
  }

  return <section className={styles.stage} data-navigation-stage="approach" data-portal={portal} data-group={selected?.key||''}>
    <header className={styles.head}>
      <div className={styles.eyebrow}>{portal==='projects'?'حاضنات الحالة':selected?'منطقة الملاحة':'البوابة'}</div>
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
        <span><strong>{choice.label}</strong></span>
        <span className={styles.choiceMark} aria-hidden="true">‹</span>
      </button>):<div className={styles.empty}>لا توجد مسارات متاحة ضمن صلاحياتك الحالية.</div>}
    </div>
  </section>;
}
