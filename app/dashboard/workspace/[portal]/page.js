'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AREAS } from '@/lib/app-constitution';
import styles from './approach.module.css';

export default function PortalApproachStage(){
  const { portal }=useParams();
  const router=useRouter();
  const area=AREAS.find((item)=>item.key===portal&&item.key!=='home')||null;
  const isProjectPilot=portal==='projects';

  useEffect(()=>{
    if(!area||isProjectPilot)return;
    // بقية البوابات تبقى على مساراتها الحالية حتى نعتمد تشريح كل بوابة على حدة.
    router.replace(area.href);
  },[area,isProjectPilot,router]);

  if(!area){
    return <section className={styles.stage} data-navigation-stage="approach" data-living-branch-pilot="projects">
      <div className={styles.empty}>هذه البوابة غير متاحة.</div>
    </section>;
  }

  if(!isProjectPilot){
    return <section className={styles.stage} data-navigation-stage="compatibility-handoff" data-living-branch-pilot="projects">
      <div className={styles.empty}>جارٍ فتح البوابة…</div>
    </section>;
  }

  return <section className={styles.stage} data-navigation-stage="approach" data-portal="projects" data-living-branch-pilot="projects">
    <header className={styles.head}>
      <div className={styles.eyebrow}>بوابة المشاريع</div>
      <h1>المشاريع</h1>
      <p>اختر الحاضنة من القائمة. المساحة الكبيرة لا تكرر عناصر الملاحة؛ عند اختيار الحاضنة ستعرض هنا المشاريع الحقيقية التي ترعاها حاليًا.</p>
    </header>
  </section>;
}
