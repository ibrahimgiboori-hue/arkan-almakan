'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { PROJECT_NAV_GROUPS, AREAS, projectNavigationHref } from '@/lib/app-constitution';
import { projectNavRequirement } from '@/lib/access-ui';
import { STAGE_AR } from '@/lib/projects';
import {
  WORK_PLATFORM_OPERATION_KEYS,
  WORK_PLATFORM_SECONDARY_SECTIONS,
  WORK_PLATFORM_OPERATION_COPY,
  WORK_PLATFORM_PORTAL_ENTRY_COPY,
} from '@/lib/work-platform-constitution';
import { ConstitutionPage, PageHeader, Section, Notice, EmptyState } from '@/components/ui/ConstitutionUI';
import styles from './workspace.module.css';

const PORTAL_CAPABILITY = Object.freeze({
  '/dashboard/projects': 'projects.projects.view',
  '/dashboard/quotes': 'projects.quotes.view',
  '/dashboard/contractors': 'projects.contractors.view',
  '/dashboard/entities': 'projects.entities.view',
});

export default function WorkPlatformPage(){
  const [state,setState]=useState(null);
  const [err,setErr]=useState('');
  const [projectId,setProjectId]=useState('');

  useEffect(()=>{let alive=true;(async()=>{
    setErr('');
    const session=(await supabase.auth.getSession()).data.session;
    if(!session)return;
    const uid=session.user.id;
    const [userQ,capsQ,projectsQ,primaryQ]=await Promise.all([
      supabase.from('app_users').select('is_system_admin,employees(full_name_ar,job_title)').eq('id',uid).maybeSingle(),
      supabase.from('v_my_capabilities').select('capability_key,module_key,scope_type,scope_key,source_key'),
      supabase.from('projects').select('id,project_no,name_ar,city,stage,status').order('project_no'),
      supabase.rpc('fn_is_primary_user'),
    ]);
    if(!alive)return;
    if(capsQ.error||projectsQ.error)setErr('تعذر تحميل بعض عناصر منصة الأعمال وفق الصلاحيات الحالية.');
    const capabilities=capsQ.data||[];
    const fullAdmin=primaryQ.data===true||Boolean(userQ.data?.is_system_admin);
    const projects=projectsQ.data||[];
    setState({uid,employee:userQ.data?.employees||null,capabilities,projects,fullAdmin});
    const saved=typeof window!=='undefined'?window.localStorage.getItem('arkan.workspace.project'):'';
    setProjectId(current=>{
      if(current&&projects.some(p=>p.id===current))return current;
      if(saved&&projects.some(p=>p.id===saved))return saved;
      return projects[0]?.id||'';
    });
  })();return()=>{alive=false;};},[]);

  useEffect(()=>{
    if(typeof window!=='undefined'&&projectId)window.localStorage.setItem('arkan.workspace.project',projectId);
  },[projectId]);

  const access=useMemo(()=>{
    if(!state)return null;
    const caps=state.capabilities;
    const projectCaps=caps.filter(c=>c.module_key==='projects');
    const fullProjects=state.fullAdmin||projectCaps.some(c=>c.source_key==='projects_full_access'&&c.scope_type==='all');
    const projectScoped=state.fullAdmin||projectCaps.length>0;
    const hr=state.fullAdmin||caps.some(c=>c.module_key==='hr');
    const finance=state.fullAdmin||caps.some(c=>c.module_key==='finance');
    const documents=state.fullAdmin||caps.some(c=>c.module_key==='documents');
    const admin=state.fullAdmin||caps.some(c=>c.module_key==='admin'||c.module_key==='system');
    return {fullProjects,projectScoped,hr,finance,documents,admin};
  },[state]);

  const selectedProject=state?.projects.find(p=>p.id===projectId)||null;
  const otherProjects=useMemo(()=>state?.projects.filter(p=>p.id!==projectId)||[],[state,projectId]);

  const projectApplicable=useMemo(()=>{
    if(!state||!projectId)return[];
    return state.capabilities.filter(c=>c.module_key==='projects'&&(c.scope_type==='all'||(c.scope_type==='project'&&c.scope_key===projectId)));
  },[state,projectId]);
  const projectKeys=useMemo(()=>new Set(projectApplicable.map(c=>c.capability_key)),[projectApplicable]);
  const projectFull=Boolean(state?.fullAdmin||access?.fullProjects||projectApplicable.some(c=>c.source_key==='projects_full_access'));

  const visibleProjectItems=useMemo(()=>PROJECT_NAV_GROUPS
    .flatMap(group=>group.items)
    .filter(item=>{
      if(projectFull)return true;
      const required=projectNavRequirement(item.key);
      return required.length===0||required.some(key=>projectKeys.has(key));
    }),[projectFull,projectKeys]);

  const projectItemByKey=useMemo(()=>new Map(visibleProjectItems.map(item=>[item.key,item])),[visibleProjectItems]);
  const operationItems=useMemo(()=>WORK_PLATFORM_OPERATION_KEYS.map(key=>projectItemByKey.get(key)).filter(Boolean),[projectItemByKey]);

  const secondarySections=useMemo(()=>{
    const configured=WORK_PLATFORM_SECONDARY_SECTIONS.map(section=>({
      ...section,
      items:section.itemKeys.map(key=>projectItemByKey.get(key)).filter(Boolean),
    })).filter(section=>section.items.length>0);
    const assigned=new Set([
      ...WORK_PLATFORM_OPERATION_KEYS,
      ...WORK_PLATFORM_SECONDARY_SECTIONS.flatMap(section=>section.itemKeys),
    ]);
    const extra=visibleProjectItems.filter(item=>!assigned.has(item.key));
    return extra.length?[...configured,{key:'additional',label:'أدوات إضافية',description:'أي أداة جديدة في بوابة المشاريع تظهر هنا تلقائيًا حتى لا تُحجب عن صاحب الصلاحية الكاملة.',items:extra}]:configured;
  },[visibleProjectItems,projectItemByKey]);

  const allowedPortals=useMemo(()=>{
    if(!state||!access)return[];
    return AREAS.filter(area=>{
      if(area.key==='home')return false;
      if(state.fullAdmin)return true;
      if(area.key==='projects')return access.projectScoped;
      if(area.key==='workforce')return access.hr;
      if(area.key==='finance')return access.finance;
      if(area.key==='documents')return access.documents;
      if(area.key==='admin')return access.admin;
      return false;
    });
  },[state,access]);

  const projectPortalEntries=useMemo(()=>{
    if(!state||!access?.projectScoped)return[];
    const area=AREAS.find(item=>item.key==='projects');
    return (area?.items||[]).filter(item=>!item.hidden).filter(item=>{
      if(access.fullProjects||state.fullAdmin)return true;
      const required=PORTAL_CAPABILITY[item.href];
      return !required||state.capabilities.some(cap=>cap.capability_key===required);
    });
  },[state,access]);

  const otherPortals=allowedPortals.filter(area=>area.key!=='projects');
  const secondaryCount=secondarySections.reduce((total,section)=>total+section.items.length,0);

  if(!state||!access)return <ConstitutionPage><EmptyState title="جارٍ تجهيز منصة الأعمال" description="يتم تحميل نطاق العمل والأدوات التي يسمح بها هذا الحساب."/></ConstitutionPage>;

  return <ConstitutionPage>
    <PageHeader
      eyebrow="WORK PLATFORM"
      title="منصة الأعمال"
      description="مساحة تنفيذ واحدة محكومة بالصلاحيات: اختر سياق العمل أولًا، ثم نفّذ منه مباشرة دون قوائم مكررة أو مسارات متوازية."
    />
    {err&&<Notice tone="warning">{err}</Notice>}

    {access.projectScoped&&(
      <>
        <Section title="المشروع الجاري" description="هذا هو سياق العمل الحالي. كل أدوات التشغيل والإدارة أسفل هذه المنطقة تخص هذا المشروع فقط.">
          {state.projects.length===0?(
            <EmptyState title="لا توجد مشاريع متاحة" description={access.fullProjects?'لا يوجد مشروع مسجل حاليًا ضمن بوابة المشاريع.':'لم يُسند أي مشروع إلى هذا الحساب.'}/>
          ):(
            <div className={styles.focusLayout}>
              {selectedProject&&(
                <div className={styles.activeProjectCard}>
                  <div className={styles.activeEyebrow}>المشروع النشط</div>
                  <div className={styles.activeTop}>
                    <div>
                      <div className={styles.projectNo}>{selectedProject.project_no||'—'}</div>
                      <h2>{selectedProject.name_ar}</h2>
                    </div>
                    <span className={styles.stageBadge}>{STAGE_AR[selectedProject.stage]||selectedProject.stage||'غير محدد'}</span>
                  </div>
                  <div className={styles.activeMeta}>
                    <span>{selectedProject.city||'الموقع غير محدد'}</span>
                    <span>{operationItems.length} أداة تشغيل متاحة الآن</span>
                  </div>
                  <div className={styles.focusRule}>غيّر المشروع من القائمة الجانبية فقط؛ لا تتكرر بطاقة المشروع النشط في أي مكان آخر.</div>
                </div>
              )}

              {otherProjects.length>0&&(
                <aside className={styles.projectSwitcher} aria-label="تبديل المشروع">
                  <div className={styles.switcherTitle}>تبديل المشروع</div>
                  <div className={styles.switcherList}>
                    {otherProjects.map(project=><button key={project.id} type="button" className={styles.switchProject} onClick={()=>setProjectId(project.id)}>
                      <span className={styles.switchNo}>{project.project_no||'—'}</span>
                      <strong>{project.name_ar}</strong>
                      <small>{project.city||'الموقع غير محدد'}</small>
                    </button>)}
                  </div>
                </aside>
              )}
            </div>
          )}
        </Section>

        {selectedProject&&operationItems.length>0&&(
          <Section title="التشغيل الآن" description="فقط الأعمال التي تُنفذ مباشرة في الموقع أو خلال يوم العمل. التقارير والمالية والمتابعة ليست ضمن هذه المنطقة.">
            <div className={styles.operationGrid}>
              {operationItems.map((item,index)=><Link key={item.key} className={styles.operationAction} href={projectNavigationHref(selectedProject.id,item)}>
                <span className={styles.operationIndex}>{String(index+1).padStart(2,'0')}</span>
                <strong>{item.label}</strong>
                <small>{WORK_PLATFORM_OPERATION_COPY[item.key]||'فتح الأداة وتنفيذ العمل مباشرة.'}</small>
                <span className={styles.operationArrow}>فتح ←</span>
              </Link>)}
            </div>
          </Section>
        )}

        {selectedProject&&secondaryCount>0&&(
          <details className={styles.secondaryPanel}>
            <summary>
              <span><strong>إدارة المشروع</strong><small>التنفيذ، المالية، التقارير، والملف المرجعي</small></span>
              <span className={styles.secondaryCount}>{secondaryCount} أدوات</span>
            </summary>
            <div className={styles.secondaryBody}>
              {secondarySections.map(section=><section key={section.key} className={styles.secondaryGroup}>
                <div className={styles.secondaryHeading}><h3>{section.label}</h3><p>{section.description}</p></div>
                <div className={styles.secondaryLinks}>{section.items.map(item=><Link key={item.key} href={projectNavigationHref(selectedProject.id,item)}><span>{item.label}</span><span>←</span></Link>)}</div>
              </section>)}
            </div>
          </details>
        )}

        {projectPortalEntries.length>0&&(
          <Section title="إدارة بوابة المشاريع" description="وظائف عامة للبوابة وليست أدوات تشغيل للمشروع الجاري؛ لذلك تبقى في المستوى الأخير.">
            <nav className={styles.portalActions} aria-label="إدارة بوابة المشاريع">
              {projectPortalEntries.map(item=><Link key={item.href} className={styles.portalAction} href={item.href}>
                <span><strong>{item.label==='المشاريع'?'سجل المشاريع':item.label}</strong><small>{WORK_PLATFORM_PORTAL_ENTRY_COPY[item.href]||'فتح الوظيفة العامة للبوابة.'}</small></span>
                <span>←</span>
              </Link>)}
            </nav>
          </Section>
        )}
      </>
    )}

    {otherPortals.length>0&&(
      <Section title="بوابات أخرى ضمن صلاحيتك" description="تظهر هنا فقط إذا كان الحساب مخولًا بأكثر من نطاق عمل.">
        <nav className={styles.otherPortals}>{otherPortals.map(area=><Link key={area.key} href={area.href}>{area.label}<span>←</span></Link>)}</nav>
      </Section>
    )}
  </ConstitutionPage>;
}
