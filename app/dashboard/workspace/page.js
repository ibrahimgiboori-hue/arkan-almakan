'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { PROJECT_NAV_GROUPS, AREAS, projectNavigationHref } from '@/lib/app-constitution';
import { projectNavRequirement } from '@/lib/access-ui';
import { ConstitutionPage, PageHeader, Section, Notice, EmptyState } from '@/components/ui/ConstitutionUI';
import styles from './workspace.module.css';

const GLOBAL_PROJECT_TOOLS = [
  { label:'المشاريع', href:'/dashboard/projects', note:'إنشاء المشاريع وفتحها وإدارة بياناتها.' },
  { label:'عروض الأسعار', href:'/dashboard/quotes', note:'التسعير والعروض المرتبطة بالمشاريع.' },
  { label:'المقاولون', href:'/dashboard/contractors', note:'المقاولون وإسنادهم للمشاريع.' },
  { label:'العملاء والجهات', href:'/dashboard/entities', note:'العملاء والجهات المرتبطة بالأعمال.' },
];

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
    setProjectId(current=>current&&projects.some(p=>p.id===current)?current:(projects[0]?.id||''));
  })();return()=>{alive=false;};},[]);

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

  const projectApplicable=useMemo(()=>{
    if(!state||!projectId)return[];
    return state.capabilities.filter(c=>c.module_key==='projects'&&(c.scope_type==='all'||(c.scope_type==='project'&&c.scope_key===projectId)));
  },[state,projectId]);
  const projectKeys=useMemo(()=>new Set(projectApplicable.map(c=>c.capability_key)),[projectApplicable]);
  const selectedProject=state?.projects.find(p=>p.id===projectId)||null;
  const projectFull=Boolean(state?.fullAdmin||access?.fullProjects||projectApplicable.some(c=>c.source_key==='projects_full_access'));

  const visibleProjectGroups=useMemo(()=>PROJECT_NAV_GROUPS.map(group=>({
    ...group,
    items:group.items.filter(item=>{
      if(projectFull)return true;
      const required=projectNavRequirement(item.key);
      return required.length===0||required.some(key=>projectKeys.has(key));
    }),
  })).filter(group=>group.items.length>0),[projectFull,projectKeys]);

  if(!state||!access)return <ConstitutionPage><EmptyState title="جارٍ تجهيز منصة الأعمال" description="يتم تحميل البوابات والأدوات التي يسمح بها هذا الحساب."/></ConstitutionPage>;

  const allowedPortals=AREAS.filter(area=>{
    if(area.key==='home')return false;
    if(state.fullAdmin)return true;
    if(area.key==='projects')return access.projectScoped;
    if(area.key==='workforce')return access.hr;
    if(area.key==='finance')return access.finance;
    if(area.key==='documents')return access.documents;
    if(area.key==='admin')return access.admin;
    return false;
  });

  return <ConstitutionPage>
    <PageHeader eyebrow="WORK PLATFORM" title="منصة الأعمال" description="هذه هي شاشة العمل الممنوحة لهذا الحساب. ما يظهر فيها مصدره الصلاحيات فقط، ولا توجد نسخة أخرى موازية من الأدوات."/>
    {err&&<Notice tone="warning">{err}</Notice>}

    <Section title="نطاق الحساب">
      <div className={styles.summary}>
        <div className={styles.card}><span>البوابات المسموحة</span><strong>{allowedPortals.length}</strong></div>
        <div className={styles.card}><span>المشاريع المتاحة</span><strong>{state.projects.length}</strong></div>
        <div className={styles.card}><span>مستوى بوابة المشاريع</span><strong style={{fontSize:18}}>{access.fullProjects?'كامل':'مقيد'}</strong></div>
        <div className={styles.card}><span>الأدوات الحالية داخل المشروع</span><strong>{visibleProjectGroups.reduce((n,g)=>n+g.items.length,0)}</strong></div>
      </div>
      {access.fullProjects&&<div className="msg ok" style={{marginTop:12}}>لديك <strong>كامل بوابة المشاريع</strong>: جميع وظائف <span className={styles.fullBadge}>projects.*</span> الحالية والمستقبلية، بما فيها الإنشاء والتعديل والحذف والاعتماد والتصحيح والإصدار متى كانت الوظيفة من نطاق المشاريع.</div>}
    </Section>

    <Section title="بواباتي" description="إذا مُنح الحساب أكثر من بوابة فستظهر كلها هنا داخل منصة الأعمال نفسها.">
      {allowedPortals.length===0?<EmptyState title="لا توجد بوابة عمل" description="لم تُمنح لهذا الحساب صلاحية على أي بوابة تشغيلية."/>:<div className={styles.portalGrid}>{allowedPortals.map(area=><div key={area.key} className={styles.portal}><h3>{area.label}</h3><p>{area.key==='projects'&&access.fullProjects?'كامل البوابة بكل أدواتها الحالية والمستقبلية.':'تظهر الأدوات بحسب الصلاحيات المسندة.'}</p><div className={styles.quick} style={{marginTop:12}}><Link className="btn" href={area.href}>فتح {area.label}</Link></div></div>)}</div>}
    </Section>

    {access.projectScoped&&<>
      <Section title="إدارة بوابة المشاريع" description="المداخل العامة للبوابة قبل الدخول إلى مشروع محدد.">
        <div className={styles.tools}>{GLOBAL_PROJECT_TOOLS.map(tool=><div key={tool.href} className={styles.group}><h3>{tool.label}</h3><div className={styles.note}>{tool.note}</div><div style={{marginTop:10}}><Link className="btn ghost" href={tool.href}>فتح ←</Link></div></div>)}</div>
      </Section>

      <Section title="كل أدوات المشروع" description="اختر مشروعًا وستظهر تحته كل الأدوات التي يسمح بها مستوى هذا الحساب. مستخدم كامل بوابة المشاريع يرى جميع الأدوات بلا استثناء.">
        {state.projects.length===0?<EmptyState title="لا توجد مشاريع متاحة" description="أنشئ مشروعًا أو أسند مشروعًا لهذا الحساب أولًا."/>:<>
          <div className={styles.selector}><div className={`field ${styles.field}`}><label>المشروع</label><select value={projectId} onChange={e=>setProjectId(e.target.value)}>{state.projects.map(p=><option key={p.id} value={p.id}>{p.project_no||'—'} — {p.name_ar}</option>)}</select></div>{selectedProject&&<Link className="btn" href={`/dashboard/projects/${selectedProject.id}`}>فتح مساحة المشروع كاملة</Link>}</div>
          <div className={styles.projectStrip} style={{marginTop:12}}>{state.projects.map(p=><button key={p.id} className={`${styles.project} ${p.id===projectId?styles.activeProject:''}`} onClick={()=>setProjectId(p.id)}><small>{p.project_no||'—'}</small><strong>{p.name_ar}</strong><small>{p.city||'الموقع غير محدد'}</small></button>)}</div>
          {selectedProject&&<div className={styles.tools} style={{marginTop:14}}>{visibleProjectGroups.map(group=><div key={group.key} className={styles.group}><h3>{group.label}</h3><div className={styles.links}>{group.items.map(item=><Link key={item.key} className={styles.link} href={projectNavigationHref(selectedProject.id,item)}><span>{item.label}</span><small>فتح ←</small></Link>)}</div></div>)}</div>}
        </>}
      </Section>
    </>}
  </ConstitutionPage>;
}
