'use client';

import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AREAS } from '@/lib/app-constitution';
import { useDashboardSession } from '@/lib/dashboard-session-context';
import { livingPortalGroups } from '@/lib/portal-living-navigation';
import { requestWorkSessionNavigation } from '@/components/ui/WorkSessionRuntime';

export default function PortalApproachStage(){
  const { portal }=useParams();
  const router=useRouter();
  const searchParams=useSearchParams();
  const session=useDashboardSession();
  const area=AREAS.find((item)=>item.key===portal&&item.key!=='home')||null;
  const groups=area?livingPortalGroups(portal,session):[];
  const groupKey=searchParams.get('group')||'';
  const group=groups.find((item)=>item.key===groupKey)||null;

  useEffect(()=>{
    if(!area||!groupKey||!group){
      router.replace('/dashboard');
    }
  },[area,group,groupKey,router]);

  function go(href){
    if(!href)return;
    const accepted=requestWorkSessionNavigation(href);
    if(accepted)router.push(href);
  }

  if(!area||!group){
    return <section data-navigation-stage="approach" data-living-branch-scope="all-portals">
      <div data-workspace-empty="true">جارٍ العودة إلى مساحة الخمول…</div>
    </section>;
  }

  return <section
    data-navigation-stage="portal-group"
    data-stage-leadership="stage"
    data-portal={portal}
    data-portal-group={group.key}
    data-living-branch-scope="all-portals"
  >
    <header data-workspace-head="true">
      <div data-workspace-eyebrow="true">{area.label}</div>
      <h1 data-workspace-title="true">{group.label}</h1>
      <p data-workspace-description="true">من هنا تقود المساحة الكبيرة الاختيار، بينما تتحول القائمة إلى مرآة هادئة للمجموعة وما تحتويه.</p>
    </header>

    <div data-workspace-choices="true" role="list" aria-label={group.label}>
      {group.items.map((item)=><button
        key={item.href}
        type="button"
        data-workspace-choice="true"
        onClick={()=>go(item.href)}
        role="listitem"
      >
        <span data-workspace-choice-copy="true">
          <strong>{item.label}</strong>
          {item.description?<small>{item.description}</small>:null}
        </span>
        <span data-workspace-choice-mark="true" aria-hidden="true">‹</span>
      </button>)}
    </div>
  </section>;
}