'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PROJECT_NAV_GROUPS, projectNavigationHref } from '@/lib/app-constitution';
import { projectNavRequirement } from '@/lib/access-ui';
import {
  PROJECT_APPROACH_REGIONS,
  normalizeProjectCare,
  normalizeProjectRegion,
  projectApproachHref,
  publishNavigationMirrorContext,
} from '@/lib/living-navigation';
import { STAGE_AR, SCOPE_AR } from '@/lib/projects';
import { requestWorkSessionNavigation } from './WorkSessionRuntime';
import styles from './ProjectAnatomyStage.module.css';

function allProjectItems(){
  return PROJECT_NAV_GROUPS.flatMap((group)=>group.items);
}

export default function ProjectAnatomyStage({ project, projectId, access, care, region }){
  const router=useRouter();
  const normalizedCare=normalizeProjectCare(care);
  const normalizedRegion=normalizeProjectRegion(region);
  const full=Boolean(access?.full);
  const keys=new Set(access?.keys||[]);
  const permitted=(item)=>{
    const required=projectNavRequirement(item.key);
    return !required.length||full||required.some((key)=>keys.has(key));
  };
  const items=allProjectItems().filter(permitted);
  const availableRegions=PROJECT_APPROACH_REGIONS.map((candidate)=>({
    ...candidate,
    items:candidate.itemKeys.map((key)=>items.find((item)=>item.key===key)).filter(Boolean),
  })).filter((candidate)=>candidate.items.length>0);
  const activeRegion=availableRegions.find((item)=>item.key===normalizedRegion)||null;
  const choices=activeRegion?.items||[];

  useEffect(()=>{
    publishNavigationMirrorContext({
      portalKey:'projects',
      subjectKind:'project',
      subjectId:String(projectId||''),
      subjectLabel:project?.name_ar||'المشروع المحدد',
    });
  },[project?.name_ar,projectId]);

  function go(href){
    if(!href)return;
    const accepted=requestWorkSessionNavigation(href);
    if(accepted)router.push(href);
  }

  if(!activeRegion){
    return <section className={styles.stage} data-biological-card="project" data-project-id={projectId} data-stage-leadership="stage">
      <div className={styles.eyebrow}>بطاقة المشروع</div>
      <h1 className={styles.title}>{project.name_ar||'مشروع'}</h1>
      <p className={styles.sub}>{project.project_no||'بدون رقم مشروع'}</p>

      <dl className={styles.identity}>
        <div><dt>المرحلة</dt><dd>{STAGE_AR[project.stage]||project.stage||'—'}</dd></div>
        <div><dt>المدينة</dt><dd>{project.city||'غير محددة'}</dd></div>
        <div><dt>نطاق التوريد</dt><dd>{SCOPE_AR[project.supply_scope]||project.supply_scope||'غير محدد'}</dd></div>
        <div><dt>صفة أركان</dt><dd>{project.our_role||'غير محددة'}</dd></div>
        <div><dt>تاريخ المباشرة</dt><dd>{project.commencement_date||'غير محدد'}</dd></div>
        <div><dt>مدة التنفيذ</dt><dd>{project.duration_days?`${project.duration_days} يوم`:'غير محددة'}</dd></div>
      </dl>

      <p className={styles.note}>أنت الآن داخل المشروع. من هذه النقطة تقود المساحة الكبيرة الرحلة، بينما تعكس القائمة المشروع وتشريحه فقط.</p>

      <div className={styles.choices} role="list" aria-label="مناطق المشروع">
        {availableRegions.map((candidate)=><button
          key={candidate.key}
          type="button"
          className={styles.choice}
          onClick={()=>go(projectApproachHref(projectId,{care:normalizedCare,region:candidate.key}))}
          role="listitem"
        >
          <strong>{candidate.label}</strong><span aria-hidden="true">‹</span>
        </button>)}
      </div>
    </section>;
  }

  return <section className={styles.stage} data-navigation-stage="project-region" data-project-id={projectId} data-project-region={activeRegion.key} data-stage-leadership="stage">
    <div className={styles.eyebrow}>{project.name_ar||'المشروع'}</div>
    <h1 className={styles.title}>{activeRegion.label}</h1>
    <p className={styles.sub}>اختر العمل الذي تريد الدخول إليه. القائمة تعكس هذه المنطقة فقط، والعمل الحقيقي يبدأ من اختيارك هنا.</p>
    <div className={styles.choices} role="list">
      {choices.length?choices.map((item)=>{
        const href=projectNavigationHref(projectId,item,{care:normalizedCare,region:activeRegion.key});
        return <button key={item.key} type="button" className={styles.choice} onClick={()=>go(href)} role="listitem">
          <strong>{item.label}</strong><span aria-hidden="true">‹</span>
        </button>;
      }):<div className={styles.empty}>لا توجد أعمال متاحة ضمن صلاحياتك الحالية في هذه المنطقة.</div>}
    </div>
  </section>;
}
