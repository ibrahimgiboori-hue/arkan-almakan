'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { PROJECT_NAV_GROUPS, AREAS, projectNavigationHref } from '@/lib/app-constitution';
import { projectNavRequirement } from '@/lib/access-ui';
import { STAGE_AR } from '@/lib/projects';
import { money } from '@/lib/format';
import {
  WORK_PLATFORM_PRIMARY_OPERATION_KEY,
  WORK_PLATFORM_OPERATION_KEYS,
  WORK_PLATFORM_SECONDARY_SECTIONS,
  WORK_PLATFORM_OPERATION_COPY,
  PORTAL_DIRECT_WORK,
} from '@/lib/work-platform-constitution';
import {
  PORTAL_MANAGEMENT_SECTIONS,
  PORTAL_SECTION_ITEMS,
  canSeePortalDestination,
} from '@/lib/portal-section-constitution';
import { ConstitutionPage, PageHeader, Section, Notice, EmptyState } from '@/components/ui/ConstitutionUI';
import PortalActionMetrics from './PortalActionMetrics';
import styles from './workspace.module.css';

const PORTAL_COPY = Object.freeze({
  projects:{eyebrow:'PROJECTS',title:'المشاريع',description:'المشروع الجاري هو سياق العمل؛ التشغيل والإدارة يبقيان في مساحة واحدة.'},
  workforce:{eyebrow:'PEOPLE',title:'الموارد البشرية',description:'دورة الموظف من الاحتياج والتوظيف إلى الرواتب والالتزام ونهاية الخدمة.'},
  finance:{eyebrow:'FINANCE',title:'المالية',description:'المعاملات والخزينة والبنوك والتحصيل والسيولة والاعتمادات في سياق واحد.'},
  documents:{eyebrow:'DOCUMENTS',title:'المستندات',description:'العمل الجاري والمراجعة والمراسلات والأرشيف والنماذج من مساحة واحدة.'},
  admin:{eyebrow:'ADMIN',title:'الإدارة',description:'الشركة والدخول والهيكل وسير العمل والتدقيق والاستمرارية من بوابة واحدة.'},
});

const EMPTY_PULSE=Object.freeze({loading:false,financial:null,attendanceCount:0,outputCount:0,expenseTotal:0});

function riyadhDate(){
  return new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Riyadh'}).format(new Date());
}
function clampPercent(value){return Math.max(0,Math.min(100,Number(value||0)));}

function DirectWorkLayer({primaryHref,primaryLabel,primaryCopy,primaryStatus,secondaryHref,secondaryLabel,secondaryCopy}){
  if(!primaryHref)return null;
  return <Section className={styles.directLayer} title="ابدأ من هنا" description="العمل المباشر في موضع واحد؛ بقية الأدوات تبقى في طبقة الإدارة أدناه.">
    <div className={styles.operationDeck}>
      <Link className={styles.primaryOperation} href={primaryHref}>
        <div className={styles.primaryKicker}>ابدأ من هنا</div>
        <div className={styles.primaryOperationBody}><h2>{primaryLabel}</h2><p>{primaryCopy}</p></div>
        <div className={styles.primaryStatus}>{primaryStatus}</div>
        <div className={styles.primaryCta}>فتح {primaryLabel} <span>←</span></div>
      </Link>
      <div className={styles.quickOperations}>
        {secondaryHref?(
          <Link className={styles.quickOperation} href={secondaryHref}>
            <div><strong>{secondaryLabel}</strong><small>{secondaryCopy}</small></div><span className={styles.quickArrow}>←</span>
          </Link>
        ):(
          <div className={`${styles.quickOperation} ${styles.quickOperationInfo}`}>
            <div><strong>الإدارة والمتابعة</strong><small>{secondaryCopy||'بقية الأدوات تظهر في المستوى التالي دون تكرار أي وجهة.'}</small></div><span className={styles.quickArrow}>↓</span>
          </div>
        )}
      </div>
    </div>
  </Section>;
}

export default function WorkPlatformPage(){
  const [state,setState]=useState(null);
  const [err,setErr]=useState('');
  const [projectId,setProjectId]=useState('');
  const [portalKey,setPortalKey]=useState('projects');
  const [managementKey,setManagementKey]=useState('execution');
  const [portalManagementKey,setPortalManagementKey]=useState('');
  const [pulse,setPulse]=useState(EMPTY_PULSE);
  const [switchOpen,setSwitchOpen]=useState(false);
  const [projectQuery,setProjectQuery]=useState('');

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
    const savedProject=typeof window!=='undefined'?window.localStorage.getItem('arkan.workspace.project'):'';
    setProjectId(current=>current&&projects.some(p=>p.id===current)?current:savedProject&&projects.some(p=>p.id===savedProject)?savedProject:projects[0]?.id||'');
  })();return()=>{alive=false;};},[]);

  useEffect(()=>{if(typeof window!=='undefined'&&projectId)window.localStorage.setItem('arkan.workspace.project',projectId);},[projectId]);
  useEffect(()=>{if(typeof window!=='undefined'&&portalKey)window.localStorage.setItem('arkan.workspace.portal',portalKey);},[portalKey]);

  useEffect(()=>{
    if(!projectId)return;
    let alive=true;
    (async()=>{
      setPulse(previous=>({...previous,loading:true}));
      const today=riyadhDate();
      const [financialQ,dayQ,expensesQ,outputQ]=await Promise.all([
        supabase.from('v_project_financials').select('computed_progress_pct,days_remaining,custody_balance,items_without_decision,unclassified_spend').eq('project_id',projectId).maybeSingle(),
        supabase.from('timesheet_days').select('id').eq('project_id',projectId).eq('work_date',today).limit(1).maybeSingle(),
        supabase.from('v_day_expenses').select('amount').eq('project_id',projectId).eq('work_date',today),
        supabase.from('v_day_output').select('day_item_id').eq('project_id',projectId).eq('work_date',today),
      ]);
      let attendanceCount=0;
      if(dayQ.data?.id){
        const attendanceQ=await supabase.from('attendance').select('id').eq('day_id',dayQ.data.id);
        attendanceCount=(attendanceQ.data||[]).length;
      }
      if(!alive)return;
      setPulse({loading:false,financial:financialQ.data||null,attendanceCount,outputCount:(outputQ.data||[]).length,expenseTotal:(expensesQ.data||[]).reduce((sum,row)=>sum+Number(row.amount||0),0)});
    })();
    return()=>{alive=false;};
  },[projectId]);

  const capabilityKeys=useMemo(()=>new Set((state?.capabilities||[]).map(c=>c.capability_key)),[state]);

  const access=useMemo(()=>{
    if(!state)return null;
    const caps=state.capabilities;
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
  const activePortalCopy=activePortal?PORTAL_COPY[activePortal.key]||{eyebrow:'WORK',title:activePortal.label.replace(/^بوابة\s+/,''),description:'أدوات العمل المسموحة لهذا الحساب.'}:null;

  const activePortalItems=useMemo(()=>{
    if(!activePortal)return[];
    const combined=[
      ...(activePortal.items||[]).filter(item=>!item.hidden),
      ...(PORTAL_SECTION_ITEMS[activePortal.key]||[]),
    ];
    const unique=combined.filter((item,index)=>combined.findIndex(candidate=>candidate.href===item.href)===index);
    return unique.filter(item=>canSeePortalDestination(item,capabilityKeys,state?.fullAdmin));
  },[activePortal,capabilityKeys,state?.fullAdmin]);

  const portalDirect=activePortal&&activePortal.key!=='projects'?PORTAL_DIRECT_WORK[activePortal.key]||null:null;
  const requestedPrimary=activePortalItems.find(item=>item.href===portalDirect?.primaryHref)||null;
  const requestedSecondary=activePortalItems.find(item=>item.href===portalDirect?.secondaryHref)||null;
  const portalPrimaryItem=requestedPrimary||activePortalItems[0]||null;
  const portalSecondaryItem=requestedSecondary||activePortalItems.find(item=>item.href!==portalPrimaryItem?.href)||null;
  const portalDirectHrefs=useMemo(()=>new Set([portalPrimaryItem?.href,portalSecondaryItem?.href].filter(Boolean)),[portalPrimaryItem,portalSecondaryItem]);

  const portalSections=useMemo(()=>{
    if(!activePortal||activePortal.key==='projects')return[];
    const itemByHref=new Map(activePortalItems.map(item=>[item.href,item]));
    const configured=PORTAL_MANAGEMENT_SECTIONS[activePortal.key]||[];
    const sections=configured.map(section=>({
      ...section,
      items:section.hrefs.map(href=>itemByHref.get(href)).filter(Boolean).filter(item=>!portalDirectHrefs.has(item.href)),
    })).filter(section=>section.items.length>0);
    const assigned=new Set(configured.flatMap(section=>section.hrefs));
    const extra=activePortalItems.filter(item=>!assigned.has(item.href)&&!portalDirectHrefs.has(item.href));
    if(extra.length)sections.push({key:'additional',label:'أدوات إضافية',shortLabel:'إضافية',description:'وجهات حقيقية لم توضع بعد في مجال دائم؛ تظهر هنا مرة واحدة فقط.',items:extra});
    return sections;
  },[activePortal,activePortalItems,portalDirectHrefs]);

  useEffect(()=>{
    if(activePortal?.key==='projects')return;
    if(!portalSections.length){setPortalManagementKey('');return;}
    setPortalManagementKey(current=>portalSections.some(section=>section.key===current)?current:portalSections[0].key);
  },[activePortal?.key,portalSections]);
  const activePortalSection=portalSections.find(section=>section.key===portalManagementKey)||portalSections[0]||null;

  const selectedProject=state?.projects.find(p=>p.id===projectId)||null;
  const otherProjects=useMemo(()=>state?.projects.filter(p=>p.id!==projectId)||[],[state,projectId]);
  const filteredOtherProjects=useMemo(()=>{
    const q=projectQuery.trim().toLowerCase();
    return q?otherProjects.filter(project=>`${project.project_no||''} ${project.name_ar||''} ${project.city||''}`.toLowerCase().includes(q)):otherProjects;
  },[otherProjects,projectQuery]);

  const projectApplicable=useMemo(()=>!state||!projectId?[]:state.capabilities.filter(c=>c.module_key==='projects'&&(c.scope_type==='all'||(c.scope_type==='project'&&c.scope_key===projectId))),[state,projectId]);
  const projectKeys=useMemo(()=>new Set(projectApplicable.map(c=>c.capability_key)),[projectApplicable]);
  const projectFull=Boolean(state?.fullAdmin||access?.fullProjects||projectApplicable.some(c=>c.source_key==='projects_full_access'));
  const visibleProjectItems=useMemo(()=>PROJECT_NAV_GROUPS.flatMap(group=>group.items).filter(item=>projectFull||projectNavRequirement(item.key).length===0||projectNavRequirement(item.key).some(key=>projectKeys.has(key))),[projectFull,projectKeys]);
  const projectItemByKey=useMemo(()=>new Map(visibleProjectItems.map(item=>[item.key,item])),[visibleProjectItems]);
  const operationItems=useMemo(()=>WORK_PLATFORM_OPERATION_KEYS.map(key=>projectItemByKey.get(key)).filter(Boolean),[projectItemByKey]);
  const primaryOperation=operationItems.find(item=>item.key===WORK_PLATFORM_PRIMARY_OPERATION_KEY)||operationItems[0]||null;
  const quickOperations=operationItems.filter(item=>item.key!==primaryOperation?.key);

  const secondarySections=useMemo(()=>{
    const configured=WORK_PLATFORM_SECONDARY_SECTIONS.map(section=>({...section,items:section.itemKeys.map(key=>projectItemByKey.get(key)).filter(Boolean)})).filter(section=>section.items.length>0);
    const assigned=new Set([...WORK_PLATFORM_OPERATION_KEYS,...WORK_PLATFORM_SECONDARY_SECTIONS.flatMap(section=>section.itemKeys)]);
    const extra=visibleProjectItems.filter(item=>!assigned.has(item.key));
    return extra.length?[...configured,{key:'additional',label:'أدوات إضافية',shortLabel:'إضافية',description:'أدوات جديدة ظهرت في بوابة المشاريع ولم تُصنف بعد.',items:extra}]:configured;
  },[visibleProjectItems,projectItemByKey]);

  useEffect(()=>{if(secondarySections.length&&!secondarySections.some(section=>section.key===managementKey))setManagementKey(secondarySections[0].key);},[secondarySections,managementKey]);
  const activeManagement=secondarySections.find(section=>section.key===managementKey)||secondarySections[0]||null;

  function chooseProject(id){setProjectId(id);setSwitchOpen(false);setProjectQuery('');}
  function operationStatus(key){
    if(pulse.loading)return 'جارٍ قراءة حالة اليوم…';
    if(key==='attendance')return pulse.attendanceCount?`${pulse.attendanceCount} تسجيل حضور اليوم`:'لم يبدأ تسجيل الحضور اليوم';
    if(key==='expenses')return pulse.expenseTotal?`${money(pulse.expenseTotal)} مصروفات اليوم`:'لا توجد مصروفات مسجلة اليوم';
    return 'جاهز للعمل';
  }

  if(!state||!access)return <ConstitutionPage><EmptyState title="جارٍ تجهيز منصة الأعمال" description="يتم تحميل سياق العمل والأدوات التي يسمح بها هذا الحساب."/></ConstitutionPage>;

  const progress=clampPercent(pulse.financial?.computed_progress_pct);

  return <ConstitutionPage>
    <PageHeader eyebrow="WORK PLATFORM" title="منصة الأعمال" description="واجهة واحدة لكل الحسابات. ما يتغير هو البوابات والأدوات المسموحة، لا شكل البرنامج ولا طريقة الملاحة."/>
    {err&&<Notice tone="warning">{err}</Notice>}

    {allowedPortals.length>1&&<section className={styles.portalSwitcher} aria-label="بوابات العمل">
      <div className={styles.portalSwitcherCopy}><span>مساحة العمل</span><strong>اختر البوابة</strong></div>
      <div className={styles.portalTabs} role="tablist">
        {allowedPortals.map(area=>{
          const copy=PORTAL_COPY[area.key];const active=activePortal?.key===area.key;
          return <button key={area.key} type="button" role="tab" aria-selected={active} className={active?styles.portalTabActive:styles.portalTab} onClick={()=>setPortalKey(area.key)}><small>{copy?.eyebrow||'WORK'}</small><span>{copy?.title||area.label.replace(/^بوابة\s+/,'')}</span></button>;
        })}
      </div>
    </section>}

    {activePortal?.key==='projects'&&access.projectScoped&&<section className={styles.portalStage} aria-label="بوابة المشاريع">
      {state.projects.length===0?(
        <Section title="المشروع الجاري"><EmptyState title="لا توجد مشاريع متاحة" description={access.fullProjects?'لا يوجد مشروع مسجل حاليًا ضمن بوابة المشاريع.':'لم يُسند أي مشروع إلى هذا الحساب.'}/></Section>
      ):selectedProject&&<section className={styles.cockpit} aria-label="المشروع الجاري">
        <div className={styles.projectHero}>
          <div className={styles.heroMain}>
            <div className={styles.heroKicker}>PROJECTS · المشروع الجاري</div>
            <div className={styles.heroTitleRow}>
              <h1>{selectedProject.name_ar}</h1>
              <div className={styles.heroActions}>
                <span className={styles.stageBadge}>{STAGE_AR[selectedProject.stage]||selectedProject.stage||'غير محدد'}</span>
                {otherProjects.length>0&&<button type="button" className={styles.switchButton} onClick={()=>setSwitchOpen(open=>!open)} aria-expanded={switchOpen}>تبديل المشروع <small>{otherProjects.length}</small></button>}
              </div>
            </div>
            <div className={styles.heroMeta}>
              <span>{selectedProject.project_no||'—'}</span><span>•</span><span>{selectedProject.city||'الموقع غير محدد'}</span><span>•</span><span>{projectFull?'كامل أدوات المشروع':'أدوات حسب الصلاحية'}</span>
              <span className={styles.heroMetaProgress}><b>الإنجاز {pulse.loading?'…':`${Math.round(progress)}%`}</b><i><em style={{width:`${progress}%`}}/></i></span>
            </div>
          </div>
          <PortalActionMetrics portalKey="projects" projectId={selectedProject.id}/>
        </div>
        {switchOpen&&otherProjects.length>0&&<div className={styles.switchPanel}>
          <div className={styles.switchPanelHead}><div><strong>انتقل إلى مشروع آخر</strong><small>يتغير سياق العرض فقط؛ لا تتغير بيانات المشروع الحالي.</small></div><button type="button" onClick={()=>{setSwitchOpen(false);setProjectQuery('');}}>إغلاق</button></div>
          {otherProjects.length>5&&<input className={styles.switchSearch} value={projectQuery} onChange={e=>setProjectQuery(e.target.value)} placeholder="ابحث باسم المشروع أو الرقم أو المدينة…" autoFocus/>}
          <div className={styles.switchList}>{filteredOtherProjects.length?filteredOtherProjects.map(project=><button key={project.id} type="button" className={styles.switchProject} onClick={()=>chooseProject(project.id)}><span className={styles.switchNo}>{project.project_no||'—'}</span><strong>{project.name_ar}</strong><small>{project.city||'الموقع غير محدد'}</small><span className={styles.switchArrow}>←</span></button>):<div className={styles.switchEmpty}>لا يوجد مشروع مطابق.</div>}</div>
        </div>}
      </section>}

      {selectedProject&&primaryOperation&&<DirectWorkLayer
        primaryHref={projectNavigationHref(selectedProject.id,primaryOperation)}
        primaryLabel={primaryOperation.label}
        primaryCopy={WORK_PLATFORM_OPERATION_COPY[primaryOperation.key]||'فتح أداة العمل الرئيسية.'}
        primaryStatus={operationStatus(primaryOperation.key)}
        secondaryHref={quickOperations[0]?projectNavigationHref(selectedProject.id,quickOperations[0]):null}
        secondaryLabel={quickOperations[0]?.label}
        secondaryCopy={quickOperations[0]?operationStatus(quickOperations[0].key):'بقية الأدوات تظهر في إدارة المشروع أدناه.'}
      />}

      {selectedProject&&activeManagement&&<Section className={styles.managementLayer} title="إدارة المشروع" description="التقارير والمالية والتنفيذ وملف المشروع؛ مجال واحد نشط في كل مرة.">
        <div className={styles.managementShell}>
          <div className={styles.managementTabs} role="tablist" aria-label="مجالات إدارة المشروع">{secondarySections.map(section=><button key={section.key} type="button" role="tab" aria-selected={managementKey===section.key} className={managementKey===section.key?styles.managementTabActive:styles.managementTab} onClick={()=>setManagementKey(section.key)}>{section.shortLabel||section.label}</button>)}</div>
          <div className={styles.managementPanel} role="tabpanel"><div className={styles.managementIntro}><span>المجال الحالي</span><h3>{activeManagement.label}</h3><p>{activeManagement.description}</p></div><nav className={styles.managementLinks}>{activeManagement.items.map(item=><Link key={item.key} href={projectNavigationHref(selectedProject.id,item)}><strong>{item.label}</strong><span>فتح ←</span></Link>)}</nav></div>
        </div>
      </Section>}
    </section>}

    {activePortal&&activePortal.key!=='projects'&&<section className={styles.portalStage} aria-label={activePortalCopy?.title}>
      <section className={styles.genericPortalCockpit} aria-label={activePortalCopy?.title}>
        <div className={styles.projectHero}>
          <div className={styles.heroMain}>
            <div className={styles.heroKicker}>{activePortalCopy?.eyebrow} · البوابة الحالية</div>
            <div className={styles.heroTitleRow}><h1>{activePortalCopy?.title}</h1></div>
            <div className={styles.heroMeta}><span>{activePortalCopy?.description}</span></div>
          </div>
          <PortalActionMetrics portalKey={activePortal.key}/>
        </div>
      </section>

      {portalPrimaryItem?<DirectWorkLayer
        primaryHref={portalPrimaryItem.href}
        primaryLabel={portalPrimaryItem.label}
        primaryCopy={requestedPrimary?portalDirect?.primaryCopy||'فتح نقطة العمل الرئيسية في هذه البوابة.':'أقرب نقطة عمل مباشرة تسمح بها صلاحيات هذا الحساب.'}
        primaryStatus={portalDirect?.primaryStatus||'جاهز للعمل'}
        secondaryHref={portalSecondaryItem?.href||null}
        secondaryLabel={portalSecondaryItem?.label}
        secondaryCopy={requestedSecondary?portalDirect?.secondaryCopy:'وصول مباشر إلى أداة ثانية مسموحة دون تكرارها في الإدارة.'}
      />:<Section title="لا توجد أدوات متاحة"><EmptyState title="لا توجد وجهة تشغيل مسموحة" description="البوابة موجودة ضمن نطاق الحساب، لكن لا توجد أداة قراءة متاحة وفق الصلاحيات الحالية."/></Section>}

      {activePortalSection&&<Section className={styles.managementLayer} title={`إدارة ${activePortalCopy?.title}`} description="مجال واحد نشط في كل مرة، وكل وجهة لها مدخل واحد فقط.">
        <div className={styles.managementShell}>
          <div className={styles.managementTabs} role="tablist" aria-label={`مجالات ${activePortalCopy?.title}`}>{portalSections.map(section=><button key={section.key} type="button" role="tab" aria-selected={portalManagementKey===section.key} className={portalManagementKey===section.key?styles.managementTabActive:styles.managementTab} onClick={()=>setPortalManagementKey(section.key)}>{section.shortLabel||section.label}</button>)}</div>
          <div className={styles.managementPanel} role="tabpanel"><div className={styles.managementIntro}><span>المجال الحالي</span><h3>{activePortalSection.label}</h3><p>{activePortalSection.description}</p></div><nav className={styles.managementLinks}>{activePortalSection.items.map(item=><Link key={item.href} href={item.href}><strong>{item.label}</strong><span>فتح ←</span></Link>)}</nav></div>
        </div>
      </Section>}
    </section>}
  </ConstitutionPage>;
}
