'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { AREAS, PROJECT_NAV_GROUPS, projectNavigationHref } from '@/lib/app-constitution';
import { projectNavRequirement } from '@/lib/access-ui';
import { STAGE_AR } from '@/lib/projects';
import {
  PORTAL_DIRECT_WORK,
  WORK_PLATFORM_APPROVAL_CENTER,
  WORK_PLATFORM_OPERATION_COPY,
  WORK_PLATFORM_OPERATION_KEYS,
} from '@/lib/work-platform-constitution';
import {
  PORTAL_MANAGEMENT_SECTIONS,
  PORTAL_SECTION_ITEMS,
  canSeePortalDestination,
} from '@/lib/portal-section-constitution';
import { ConstitutionPage, PageHeader, Notice, EmptyState } from '@/components/ui/ConstitutionUI';
import styles from './unified-workspace.module.css';

const PORTAL_COPY = Object.freeze({
  projects:{eyebrow:'PROJECTS',title:'المشاريع',description:'كل أدوات المشروع في مساحة واحدة؛ لا توجد أداة مخفية خلف البحث.'},
  workforce:{eyebrow:'PEOPLE',title:'الموارد البشرية',description:'دورة الموظف والتوظيف والرواتب والالتزام في واجهة واحدة.'},
  finance:{eyebrow:'FINANCE',title:'المالية',description:'المعاملات والخزينة والبنوك والتحصيل في واجهة واحدة.'},
  documents:{eyebrow:'DOCUMENTS',title:'المستندات',description:'المستندات والمراجعة والمراسلات والأرشيف والنماذج في واجهة واحدة.'},
  admin:{eyebrow:'ADMIN',title:'الإدارة',description:'الشركة والدخول والهيكل وسير العمل والتدقيق والاستمرارية في واجهة واحدة.'},
});

const CENTRAL_APPROVAL_NAV_PATHS = new Set([
  '/dashboard/approvals',
  '/dashboard/my-work/approvals',
]);

function cacheKey(uid){ return `arkan.workspace.bootstrap:${uid}`; }
function readCache(uid){
  if(typeof window==='undefined'||!uid)return null;
  try{
    const raw=window.sessionStorage.getItem(cacheKey(uid));
    if(!raw)return null;
    const parsed=JSON.parse(raw);
    if(!parsed?.savedAt||Date.now()-parsed.savedAt>120000)return null;
    return parsed.state||null;
  }catch{return null;}
}
function writeCache(uid,state){
  if(typeof window==='undefined'||!uid||!state)return;
  try{window.sessionStorage.setItem(cacheKey(uid),JSON.stringify({savedAt:Date.now(),state}));}catch{}
}

function ToolLink({href,label,meta=''}){
  return <Link className={styles.toolLink} href={href}>
    <div><strong>{label}</strong>{meta&&<small>{meta}</small>}</div><span aria-hidden="true">←</span>
  </Link>;
}

function ToolGroup({title,description,items=[]}){
  if(!items.length)return null;
  return <section className={styles.toolGroup}>
    <header><div><span>مجموعة أدوات</span><h3>{title}</h3></div><p>{description}</p></header>
    <nav className={styles.toolLinks}>{items.map(item=><ToolLink key={item.href||item.key} href={item.href} label={item.label} meta={item.meta||''}/>)}</nav>
  </section>;
}

function CompleteCatalog({title,description,groups=[]}){
  const count=groups.reduce((sum,group)=>sum+(group.items?.length||0),0);
  return <section className={styles.catalog} aria-label={title}>
    <div className={styles.catalogHead}>
      <div><span>كل الأدوات</span><h2>{title}</h2><p>{description}</p></div>
      <b>{count} أداة ظاهرة</b>
    </div>
    <div className={styles.catalogGrid}>{groups.map(group=><ToolGroup key={group.key} title={group.label} description={group.description} items={group.items}/>)}</div>
  </section>;
}

function DailyWorkCenter({items=[],approvalCount=0}){
  return <section className={styles.shortcutBand} aria-label="مركز العمل السريع">
    <div className={styles.shortcutIntro}>
      <span>ابدأ من هنا</span>
      <strong>مركز العمل السريع</strong>
      <small>أهم 2–3 أدوات تشغيلية فقط. الاعتمادات لها مدخل واحد ثابت على اليسار.</small>
    </div>
    <div className={styles.shortcutLinks}>
      {items.map((item,index)=><Link key={item.href} className={index===0?styles.shortcutPrimary:styles.shortcutSecondary} href={item.href}><div><strong>{item.label}</strong><small>{item.copy}</small></div><span>فتح ←</span></Link>)}
    </div>
    <Link className={styles.approvalShortcut} href={WORK_PLATFORM_APPROVAL_CENTER.href}>
      <div className={styles.approvalShortcutHead}><span>مدخل ثابت</span><strong>{WORK_PLATFORM_APPROVAL_CENTER.label}</strong></div>
      <div className={styles.approvalCounter}>{approvalCount}</div>
      <small>{approvalCount===1?'معاملة تنتظر إجراءك':approvalCount===2?'معاملتان تنتظران إجراءك':`${approvalCount} معاملات تنتظر إجراءك`}</small>
      <b>فتح مركز الاعتمادات ←</b>
    </Link>
  </section>;
}

export default function WorkPlatformPage(){
  const [state,setState]=useState(null);
  const [err,setErr]=useState('');
  const [projectId,setProjectId]=useState('');
  const [portalKey,setPortalKey]=useState('projects');
  const [switchOpen,setSwitchOpen]=useState(false);
  const [projectQuery,setProjectQuery]=useState('');

  useEffect(()=>{let alive=true;(async()=>{
    setErr('');
    const session=(await supabase.auth.getSession()).data.session;
    if(!session)return;
    const uid=session.user.id;
    const cached=readCache(uid);
    if(cached&&alive){
      setState(cached);
      const savedProject=typeof window!=='undefined'?window.localStorage.getItem('arkan.workspace.project'):'';
      const projects=cached.projects||[];
      setProjectId(current=>current&&projects.some(p=>p.id===current)?current:savedProject&&projects.some(p=>p.id===savedProject)?savedProject:projects[0]?.id||'');
    }

    const [userQ,capsQ,projectsQ,primaryQ,approvalsQ]=await Promise.all([
      supabase.from('app_users').select('is_system_admin,employees(full_name_ar,job_title)').eq('id',uid).maybeSingle(),
      supabase.from('v_my_capabilities').select('capability_key,module_key,scope_type,scope_key,source_key'),
      supabase.from('projects').select('id,project_no,name_ar,city,stage,status').order('project_no'),
      supabase.rpc('fn_is_primary_user'),
      supabase.rpc('fn_my_approval_inbox'),
    ]);
    if(!alive)return;
    if(capsQ.error||projectsQ.error)setErr('تعذر تحديث بعض عناصر منصة الأعمال؛ تم إبقاء الأدوات التي كانت محملة بالفعل.');
    const capabilities=capsQ.error?(cached?.capabilities||[]):(capsQ.data||[]);
    const projects=projectsQ.error?(cached?.projects||[]):(projectsQ.data||[]);
    const approvalCount=approvalsQ.error
      ? Number(cached?.approvalCount||0)
      : new Set((approvalsQ.data||[]).map(row=>row.workflow_id).filter(Boolean)).size;
    const fresh={uid,employee:userQ.data?.employees||cached?.employee||null,capabilities,projects,approvalCount,fullAdmin:primaryQ.data===true||Boolean(userQ.data?.is_system_admin)};
    setState(fresh); writeCache(uid,fresh);
    const savedProject=typeof window!=='undefined'?window.localStorage.getItem('arkan.workspace.project'):'';
    setProjectId(current=>current&&projects.some(p=>p.id===current)?current:savedProject&&projects.some(p=>p.id===savedProject)?savedProject:projects[0]?.id||'');
  })();return()=>{alive=false;};},[]);

  useEffect(()=>{if(typeof window!=='undefined'&&projectId)window.localStorage.setItem('arkan.workspace.project',projectId);},[projectId]);
  useEffect(()=>{if(typeof window!=='undefined'&&portalKey)window.localStorage.setItem('arkan.workspace.portal',portalKey);},[portalKey]);

  const capabilityKeys=useMemo(()=>new Set((state?.capabilities||[]).map(c=>c.capability_key)),[state]);
  const access=useMemo(()=>{
    if(!state)return null;
    const caps=state.capabilities||[];
    const projectCaps=caps.filter(c=>c.module_key==='projects');
    return {
      fullProjects:state.fullAdmin||projectCaps.some(c=>c.source_key==='projects_full_access'&&c.scope_type==='all'),
      projectScoped:state.fullAdmin||projectCaps.length>0,
      hr:state.fullAdmin||caps.some(c=>c.module_key==='hr'),
      finance:state.fullAdmin||caps.some(c=>c.module_key==='finance'),
      documents:state.fullAdmin||caps.some(c=>c.module_key==='documents')||capabilityKeys.has('system.approvals.view'),
      admin:state.fullAdmin||caps.some(c=>c.module_key==='admin'||c.module_key==='system'),
    };
  },[state,capabilityKeys]);

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

  useEffect(()=>{
    if(!allowedPortals.length)return;
    const saved=typeof window!=='undefined'?window.localStorage.getItem('arkan.workspace.portal'):'';
    setPortalKey(current=>allowedPortals.some(area=>area.key===current)?current:saved&&allowedPortals.some(area=>area.key===saved)?saved:allowedPortals.some(area=>area.key==='projects')?'projects':allowedPortals[0].key);
  },[allowedPortals]);

  const activePortal=allowedPortals.find(area=>area.key===portalKey)||allowedPortals[0]||null;
  const activePortalCopy=activePortal?PORTAL_COPY[activePortal.key]:null;
  const selectedProject=state?.projects?.find(p=>p.id===projectId)||null;
  const otherProjects=useMemo(()=>state?.projects?.filter(p=>p.id!==projectId)||[],[state,projectId]);
  const filteredOtherProjects=useMemo(()=>{
    const q=projectQuery.trim().toLowerCase();
    return q?otherProjects.filter(project=>`${project.project_no||''} ${project.name_ar||''} ${project.city||''}`.toLowerCase().includes(q)):otherProjects;
  },[otherProjects,projectQuery]);

  const projectApplicable=useMemo(()=>!state||!projectId?[]:(state.capabilities||[]).filter(c=>c.module_key==='projects'&&(c.scope_type==='all'||(c.scope_type==='project'&&c.scope_key===projectId))),[state,projectId]);
  const projectKeys=useMemo(()=>new Set(projectApplicable.map(c=>c.capability_key)),[projectApplicable]);
  const projectFull=Boolean(state?.fullAdmin||access?.fullProjects||projectApplicable.some(c=>c.source_key==='projects_full_access'));
  const visibleProjectItems=useMemo(()=>PROJECT_NAV_GROUPS.flatMap(group=>group.items).filter(item=>projectFull||projectNavRequirement(item.key).length===0||projectNavRequirement(item.key).some(key=>projectKeys.has(key))),[projectFull,projectKeys]);
  const visibleProjectKeys=useMemo(()=>new Set(visibleProjectItems.map(item=>item.key)),[visibleProjectItems]);

  const projectGroups=useMemo(()=>{
    if(!selectedProject)return[];
    const groups=PROJECT_NAV_GROUPS.map(group=>({
      key:group.key,label:group.label,description:group.key==='daily'?'التسجيل والتشغيل اليومي للمشروع.':group.key==='operational-finance'?'المالية التابعة لهذا المشروع دون خلطها بالمالية العامة.':group.key==='execution'?'الإسناد والقياسات والتخطيط والتغييرات.':group.key==='review'?'المتابعة والمستخلصات والضمانات.':'ملف المشروع ومستنداته وإعداداته.',
      items:group.items.filter(item=>visibleProjectKeys.has(item.key)).map(item=>({key:item.key,label:item.label,href:item.href||projectNavigationHref(selectedProject.id,item)})),
    })).filter(group=>group.items.length);
    if(state?.fullAdmin){
      groups.push({key:'project-register',label:'السجل العام',description:'أدوات عامة مرتبطة ببوابة المشاريع.',items:[
        {key:'all-projects',label:'كل المشاريع',href:'/dashboard/projects'},
        {key:'all-contractors',label:'المقاولون',href:'/dashboard/contractors'},
        {key:'entities',label:'العملاء والجهات',href:'/dashboard/entities'},
      ]});
    }
    return groups;
  },[selectedProject,visibleProjectKeys,state?.fullAdmin]);

  const projectShortcuts=useMemo(()=>{
    if(!selectedProject)return[];
    return WORK_PLATFORM_OPERATION_KEYS
      .map(key=>visibleProjectItems.find(item=>item.key===key))
      .filter(Boolean)
      .slice(0,3)
      .map(item=>({href:item.href||projectNavigationHref(selectedProject.id,item),label:item.label,copy:WORK_PLATFORM_OPERATION_COPY[item.key]||'فتح الأداة مباشرة.'}));
  },[selectedProject,visibleProjectItems]);

  const activePortalItems=useMemo(()=>{
    if(!activePortal||activePortal.key==='projects')return[];
    const combined=[...(activePortal.items||[]),...(PORTAL_SECTION_ITEMS[activePortal.key]||[])];
    const unique=combined.filter((item,index)=>combined.findIndex(candidate=>candidate.href===item.href)===index);
    return unique
      .filter(item=>!CENTRAL_APPROVAL_NAV_PATHS.has(item.href))
      .filter(item=>canSeePortalDestination(item,capabilityKeys,state?.fullAdmin));
  },[activePortal,capabilityKeys,state?.fullAdmin]);

  const portalGroups=useMemo(()=>{
    if(!activePortal||activePortal.key==='projects')return[];
    const itemByHref=new Map(activePortalItems.map(item=>[item.href,item]));
    const configured=PORTAL_MANAGEMENT_SECTIONS[activePortal.key]||[];
    const groups=configured.map(section=>({
      key:section.key,label:section.label,description:section.description,
      items:section.hrefs.map(href=>itemByHref.get(href)).filter(Boolean).map(item=>({href:item.href,label:item.label,key:item.sectionKey||item.href})),
    })).filter(group=>group.items.length);
    const assigned=new Set(configured.flatMap(section=>section.hrefs));
    const extra=activePortalItems.filter(item=>!assigned.has(item.href));
    if(extra.length)groups.push({key:'additional',label:'أدوات إضافية',description:'كل أداة مسموحة لم تُصنف في مجموعة ثابتة تظهر هنا بدل أن تختفي.',items:extra.map(item=>({href:item.href,label:item.label,key:item.href}))});
    return groups;
  },[activePortal,activePortalItems]);

  const portalShortcuts=useMemo(()=>{
    if(!activePortal||activePortal.key==='projects')return[];
    const config=PORTAL_DIRECT_WORK[activePortal.key]||{};
    const preferred=(config.daily||[]).map(entry=>{
      const item=activePortalItems.find(candidate=>candidate.href===entry.href);
      return item?{href:item.href,label:item.label,copy:entry.copy||'فتح الأداة مباشرة.'}:null;
    }).filter(Boolean);
    const used=new Set(preferred.map(item=>item.href));
    const fallback=activePortalItems
      .filter(item=>!used.has(item.href))
      .slice(0,Math.max(0,3-preferred.length))
      .map(item=>({href:item.href,label:item.label,copy:'فتح الأداة مباشرة.'}));
    return [...preferred,...fallback].slice(0,3);
  },[activePortal,activePortalItems]);

  function chooseProject(id){setProjectId(id);setSwitchOpen(false);setProjectQuery('');}

  if(!state||!access)return <ConstitutionPage><EmptyState title="جارٍ تجهيز منصة الأعمال" description="تظهر الواجهة أولًا ثم تُحدّث الصلاحيات والبيانات في الخلفية."/></ConstitutionPage>;

  return <ConstitutionPage>
    <PageHeader eyebrow="WORK PLATFORM" title="منصة الأعمال" description="واجهة واحدة فقط. البحث مساعد، أما جميع الأدوات المسموحة فتظهر داخل البوابة نفسها."/>
    {err&&<Notice tone="warning">{err}</Notice>}

    <section className={styles.portalSwitcher} aria-label="بوابات العمل">
      <div className={styles.portalSwitcherCopy}><span>مساحة العمل</span><strong>البوابات</strong><small>نفس الهيكل في كل بوابة.</small></div>
      <div className={styles.portalTabs}>{allowedPortals.map(area=>{const copy=PORTAL_COPY[area.key];const active=activePortal?.key===area.key;return <button key={area.key} type="button" className={active?styles.portalTabActive:styles.portalTab} onClick={()=>setPortalKey(area.key)}><small>{copy?.eyebrow||'WORK'}</small><strong>{copy?.title||area.label}</strong></button>;})}</div>
    </section>

    {activePortal?.key==='projects'&&<section className={styles.stage}>
      {state.projects.length===0?<EmptyState title="لا توجد مشاريع متاحة" description={access.fullProjects?'لا يوجد مشروع مسجل حاليًا.':'لم يُسند أي مشروع لهذا الحساب.'}/>:selectedProject&&<>
        <section className={styles.hero}>
          <div><span>PROJECTS · المشروع الجاري</span><h1>{selectedProject.name_ar}</h1><p>{selectedProject.project_no||'—'} · {selectedProject.city||'الموقع غير محدد'} · {STAGE_AR[selectedProject.stage]||selectedProject.stage||'المرحلة غير محددة'}</p></div>
          <div className={styles.heroActions}>{otherProjects.length>0&&<button type="button" onClick={()=>setSwitchOpen(open=>!open)}>تبديل المشروع <b>{otherProjects.length}</b></button>}</div>
        </section>
        {switchOpen&&<section className={styles.switchPanel}><div className={styles.switchHead}><strong>اختر المشروع</strong><button type="button" onClick={()=>{setSwitchOpen(false);setProjectQuery('');}}>إغلاق</button></div>{otherProjects.length>5&&<input value={projectQuery} onChange={e=>setProjectQuery(e.target.value)} placeholder="ابحث باسم المشروع أو الرقم أو المدينة…" autoFocus/>}<div className={styles.switchGrid}>{filteredOtherProjects.map(project=><button key={project.id} type="button" onClick={()=>chooseProject(project.id)}><span>{project.project_no||'—'}</span><strong>{project.name_ar}</strong><small>{project.city||'الموقع غير محدد'}</small></button>)}</div></section>}
        <DailyWorkCenter items={projectShortcuts} approvalCount={state.approvalCount||0}/>
        <CompleteCatalog title="كل أدوات المشروع" description="كل أدوات التشغيل والمشروع ظاهرة هنا، بينما الاعتمادات لها مدخل موحد واحد في مركز العمل أعلاه." groups={projectGroups}/>
      </>}
    </section>}

    {activePortal&&activePortal.key!=='projects'&&<section className={styles.stage}>
      <section className={styles.hero}><div><span>{activePortalCopy?.eyebrow} · البوابة الحالية</span><h1>{activePortalCopy?.title}</h1><p>{activePortalCopy?.description}</p></div></section>
      <DailyWorkCenter items={portalShortcuts} approvalCount={state.approvalCount||0}/>
      <CompleteCatalog title={`كل أدوات ${activePortalCopy?.title}`} description="كل وجهة تشغيلية يسمح بها هذا الحساب تظهر هنا دائمًا؛ الاعتمادات فقط لها مدخل موحد في مركز العمل أعلاه." groups={portalGroups}/>
    </section>}
  </ConstitutionPage>;
}
