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

const PORTAL_COPY = Object.freeze({
  projects: {
    eyebrow: 'PROJECTS',
    title: 'المشاريع',
    description: 'المشروع الجاري هو سياق العمل. التشغيل وإدارة المشروع والوظائف العامة تبقى في مساحة واحدة.',
  },
  workforce: {
    eyebrow: 'PEOPLE',
    title: 'الموارد البشرية',
    description: 'الموظفون والتوظيف والعروض والعقود والإجازات من بوابة واحدة وبنفس طريقة العمل.',
  },
  finance: {
    eyebrow: 'FINANCE',
    title: 'المالية',
    description: 'الطلبات والاعتمادات والمديونيات والحركات المالية في سياق واحد واضح.',
  },
  documents: {
    eyebrow: 'DOCUMENTS',
    title: 'المستندات',
    description: 'إنشاء المستندات والأرشيف والصادر والوارد ومحرر النماذج من مساحة عمل واحدة.',
  },
  admin: {
    eyebrow: 'ADMIN',
    title: 'الإدارة',
    description: 'إدارة الشركة والدخول والصلاحيات والهيكل والنسخ الاحتياطي دون واجهة إدارية منفصلة.',
  },
});

// نفس هندسة «إدارة المشروع» لكل البوابات. المحتوى فقط هو الذي يتغير.
// لا تتكرر أي أداة بين مجالين، وأي أداة مستقبلية غير مصنفة تظهر مرة واحدة في «إضافية».
const PORTAL_MANAGEMENT_SECTIONS = Object.freeze({
  workforce: Object.freeze([
    {
      key:'people',
      label:'الأفراد',
      shortLabel:'الأفراد',
      description:'ملفات الموظفين والإجازات وما يرتبط بحالة الموظف أثناء الخدمة.',
      hrefs:Object.freeze(['/dashboard/employees','/dashboard/leaves']),
    },
    {
      key:'recruitment',
      label:'التوظيف',
      shortLabel:'التوظيف',
      description:'من المرشح والعرض الوظيفي إلى العقد والمباشرة والتهيئة.',
      hrefs:Object.freeze([
        '/dashboard/recruitment',
        '/dashboard/recruitment/offers',
        '/dashboard/recruitment/contracts',
        '/dashboard/recruitment/onboarding',
      ]),
    },
  ]),
  finance: Object.freeze([
    {
      key:'requests',
      label:'الطلبات والمديونيات',
      shortLabel:'الطلبات',
      description:'السلف والمديونيات والحركات التي تبدأ بطلب مالي.',
      hrefs:Object.freeze(['/dashboard/advances']),
    },
    {
      key:'approvals',
      label:'الاعتمادات',
      shortLabel:'الاعتمادات',
      description:'الطلبات التي وصلت إلى مسار المراجعة والاعتماد.',
      hrefs:Object.freeze(['/dashboard/approvals']),
    },
  ]),
  documents: Object.freeze([
    {
      key:'current',
      label:'العمل الجاري',
      shortLabel:'العمل الجاري',
      description:'إنشاء المستندات ومتابعة الصادر والوارد أثناء العمل.',
      hrefs:Object.freeze(['/dashboard/documents','/dashboard/register']),
    },
    {
      key:'archive',
      label:'الأرشيف',
      shortLabel:'الأرشيف',
      description:'الوصول إلى النسخ والسجلات المحفوظة بعد انتهاء العمل عليها.',
      hrefs:Object.freeze(['/dashboard/archive']),
    },
    {
      key:'templates',
      label:'النماذج',
      shortLabel:'النماذج',
      description:'بناء النماذج التي تستخدمها المستندات ومساحات الإدخال.',
      hrefs:Object.freeze(['/dashboard/formbuilder']),
    },
  ]),
  admin: Object.freeze([
    {
      key:'company',
      label:'الشركة',
      shortLabel:'الشركة',
      description:'بيانات الشركة ومجلس الإدارة والهيكل التنظيمي.',
      hrefs:Object.freeze(['/dashboard/board','/dashboard/settings','/dashboard/org-structure']),
    },
    {
      key:'access',
      label:'الدخول والصلاحيات',
      shortLabel:'الدخول',
      description:'إدارة دخول المستخدمين والصلاحيات ضمن المحرك المركزي.',
      hrefs:Object.freeze(['/dashboard/system-user']),
    },
    {
      key:'governance',
      label:'الحوكمة والاستمرارية',
      shortLabel:'الحوكمة',
      description:'حماية استمرارية النظام والنسخ الاحتياطي للبيانات.',
      hrefs:Object.freeze(['/dashboard/backup']),
    },
  ]),
});

const EMPTY_PULSE = Object.freeze({
  loading: false,
  financial: null,
  attendanceCount: 0,
  outputCount: 0,
  expenseTotal: 0,
});

function riyadhDate(){
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Riyadh',
  }).format(new Date());
}

function clampPercent(value){
  return Math.max(0, Math.min(100, Number(value || 0)));
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
    setProjectId(current=>{
      if(current&&projects.some(p=>p.id===current))return current;
      if(savedProject&&projects.some(p=>p.id===savedProject))return savedProject;
      return projects[0]?.id||'';
    });
  })();return()=>{alive=false;};},[]);

  useEffect(()=>{
    if(typeof window!=='undefined'&&projectId)window.localStorage.setItem('arkan.workspace.project',projectId);
  },[projectId]);

  useEffect(()=>{
    if(typeof window!=='undefined'&&portalKey)window.localStorage.setItem('arkan.workspace.portal',portalKey);
  },[portalKey]);

  useEffect(()=>{
    if(!projectId)return;
    let alive=true;
    (async()=>{
      setPulse(previous=>({...previous,loading:true}));
      const today=riyadhDate();
      const [financialQ,dayQ,expensesQ,outputQ]=await Promise.all([
        supabase.from('v_project_financials')
          .select('computed_progress_pct,days_remaining,custody_balance,items_without_decision,unclassified_spend')
          .eq('project_id',projectId).maybeSingle(),
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
      setPulse({
        loading:false,
        financial:financialQ.data||null,
        attendanceCount,
        outputCount:(outputQ.data||[]).length,
        expenseTotal:(expensesQ.data||[]).reduce((sum,row)=>sum+Number(row.amount||0),0),
      });
    })();
    return()=>{alive=false;};
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
    setPortalKey(current=>{
      if(allowedPortals.some(area=>area.key===current))return current;
      if(saved&&allowedPortals.some(area=>area.key===saved))return saved;
      if(allowedPortals.some(area=>area.key==='projects'))return 'projects';
      return allowedPortals[0].key;
    });
  },[allowedPortals]);

  const activePortal=allowedPortals.find(area=>area.key===portalKey)||allowedPortals[0]||null;
  const activePortalCopy=activePortal?PORTAL_COPY[activePortal.key]||{eyebrow:'WORK',title:activePortal.label.replace(/^بوابة\s+/,'')||activePortal.label,description:'أدوات العمل المسموحة لهذا الحساب.'}:null;
  const activePortalItems=useMemo(()=>{
    if(!activePortal)return[];
    return (activePortal.items||[]).filter(item=>!item.hidden);
  },[activePortal]);

  const portalSections=useMemo(()=>{
    if(!activePortal||activePortal.key==='projects')return[];
    const itemByHref=new Map(activePortalItems.map(item=>[item.href,item]));
    const configured=PORTAL_MANAGEMENT_SECTIONS[activePortal.key]||[];
    const sections=configured.map(section=>({
      ...section,
      items:section.hrefs.map(href=>itemByHref.get(href)).filter(Boolean),
    })).filter(section=>section.items.length>0);
    const assigned=new Set(configured.flatMap(section=>section.hrefs));
    const extra=activePortalItems.filter(item=>!assigned.has(item.href));
    if(extra.length){
      sections.push({
        key:'additional',
        label:'أدوات إضافية',
        shortLabel:'إضافية',
        description:'أدوات جديدة في البوابة لم تُصنف بعد؛ تظهر هنا مرة واحدة حتى يوضع لها موقعها الدائم.',
        items:extra,
      });
    }
    return sections.length?sections:[{
      key:'all',
      label:activePortalCopy?.title||'الأدوات',
      shortLabel:'الأدوات',
      description:'الأدوات المسموحة في هذه البوابة.',
      items:activePortalItems,
    }];
  },[activePortal,activePortalItems,activePortalCopy]);

  useEffect(()=>{
    if(activePortal?.key==='projects')return;
    if(!portalSections.length){
      setPortalManagementKey('');
      return;
    }
    setPortalManagementKey(current=>portalSections.some(section=>section.key===current)?current:portalSections[0].key);
  },[activePortal?.key,portalSections]);

  const activePortalSection=portalSections.find(section=>section.key===portalManagementKey)||portalSections[0]||null;

  const selectedProject=state?.projects.find(p=>p.id===projectId)||null;
  const otherProjects=useMemo(()=>state?.projects.filter(p=>p.id!==projectId)||[],[state,projectId]);
  const filteredOtherProjects=useMemo(()=>{
    const q=projectQuery.trim().toLowerCase();
    if(!q)return otherProjects;
    return otherProjects.filter(project=>`${project.project_no||''} ${project.name_ar||''} ${project.city||''}`.toLowerCase().includes(q));
  },[otherProjects,projectQuery]);

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
  const primaryOperation=operationItems.find(item=>item.key===WORK_PLATFORM_PRIMARY_OPERATION_KEY)||operationItems[0]||null;
  const quickOperations=operationItems.filter(item=>item.key!==primaryOperation?.key);

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
    return extra.length?[...configured,{key:'additional',label:'أدوات إضافية',shortLabel:'إضافية',description:'أدوات جديدة ظهرت في بوابة المشاريع ولم تُصنف بعد.',items:extra}]:configured;
  },[visibleProjectItems,projectItemByKey]);

  useEffect(()=>{
    if(secondarySections.length&&!secondarySections.some(section=>section.key===managementKey)){
      setManagementKey(secondarySections[0].key);
    }
  },[secondarySections,managementKey]);

  const activeManagement=secondarySections.find(section=>section.key===managementKey)||secondarySections[0]||null;

  const projectPortalEntries=useMemo(()=>{
    if(!state||!access?.projectScoped)return[];
    const area=AREAS.find(item=>item.key==='projects');
    return (area?.items||[]).filter(item=>!item.hidden).filter(item=>{
      if(access.fullProjects||state.fullAdmin)return true;
      const required=PORTAL_CAPABILITY[item.href];
      return !required||state.capabilities.some(cap=>cap.capability_key===required);
    });
  },[state,access]);

  function chooseProject(id){
    setProjectId(id);
    setSwitchOpen(false);
    setProjectQuery('');
  }

  function operationStatus(key){
    if(pulse.loading)return 'جارٍ قراءة حالة اليوم…';
    if(key==='attendance')return pulse.attendanceCount?`${pulse.attendanceCount} تسجيل حضور اليوم`:'لم يبدأ تسجيل الحضور اليوم';
    if(key==='expenses')return pulse.expenseTotal?`${money(pulse.expenseTotal)} مصروفات اليوم`:'لا توجد مصروفات مسجلة اليوم';
    return 'جاهز للعمل';
  }

  if(!state||!access)return <ConstitutionPage><EmptyState title="جارٍ تجهيز منصة الأعمال" description="يتم تحميل سياق العمل والأدوات التي يسمح بها هذا الحساب."/></ConstitutionPage>;

  const progress=clampPercent(pulse.financial?.computed_progress_pct);
  const daysRemaining=pulse.financial?.days_remaining;
  const reviewCount=Number(pulse.financial?.items_without_decision||0)+Number(pulse.financial?.unclassified_spend||0);

  return <ConstitutionPage>
    <PageHeader
      eyebrow="WORK PLATFORM"
      title="منصة الأعمال"
      description="واجهة واحدة لكل الحسابات. ما يتغير هو البوابات والأدوات المسموحة، لا شكل البرنامج ولا طريقة الملاحة."
    />
    {err&&<Notice tone="warning">{err}</Notice>}

    {allowedPortals.length>1&&(
      <section className={styles.portalSwitcher} aria-label="بوابات العمل">
        <div className={styles.portalSwitcherCopy}>
          <span>مساحة العمل</span>
          <strong>اختر البوابة</strong>
        </div>
        <div className={styles.portalTabs} role="tablist">
          {allowedPortals.map(area=>{
            const copy=PORTAL_COPY[area.key];
            const active=activePortal?.key===area.key;
            return <button key={area.key} type="button" role="tab" aria-selected={active} className={active?styles.portalTabActive:styles.portalTab} onClick={()=>setPortalKey(area.key)}>
              <small>{copy?.eyebrow||'WORK'}</small>
              <span>{copy?.title||area.label.replace(/^بوابة\s+/,'')}</span>
            </button>;
          })}
        </div>
      </section>
    )}

    {activePortal?.key==='projects'&&access.projectScoped&&(
      <>
        {state.projects.length===0?(
          <Section title="المشروع الجاري"><EmptyState title="لا توجد مشاريع متاحة" description={access.fullProjects?'لا يوجد مشروع مسجل حاليًا ضمن بوابة المشاريع.':'لم يُسند أي مشروع إلى هذا الحساب.'}/></Section>
        ):selectedProject&&(
          <section className={styles.cockpit} aria-label="المشروع الجاري">
            <div className={styles.projectHero}>
              <div className={styles.heroMain}>
                <div className={styles.heroKicker}>المشروع الجاري</div>
                <div className={styles.heroTitleRow}>
                  <div>
                    <div className={styles.projectNo}>{selectedProject.project_no||'—'}</div>
                    <h1>{selectedProject.name_ar}</h1>
                  </div>
                  <div className={styles.heroActions}>
                    <span className={styles.stageBadge}>{STAGE_AR[selectedProject.stage]||selectedProject.stage||'غير محدد'}</span>
                    {otherProjects.length>0&&<button type="button" className={styles.switchButton} onClick={()=>setSwitchOpen(open=>!open)} aria-expanded={switchOpen}>تبديل المشروع <small>{otherProjects.length}</small></button>}
                  </div>
                </div>
                <div className={styles.heroMeta}><span>{selectedProject.city||'الموقع غير محدد'}</span><span>•</span><span>{projectFull?'كامل أدوات المشروع':'أدوات حسب الصلاحية'}</span></div>
                <div className={styles.heroProgress} aria-label={`إنجاز المشروع ${Math.round(progress)}%`}>
                  <div className={styles.heroProgressHead}><span>الإنجاز الكلي</span><strong>{pulse.loading?'…':`${Math.round(progress)}%`}</strong></div>
                  <div className={styles.heroTrack}><span style={{width:`${progress}%`}}/></div>
                </div>
              </div>
              <div className={styles.heroMetrics}>
                <div className={styles.heroMetric}><span>المدة</span><strong>{pulse.loading?'…':daysRemaining===null||daysRemaining===undefined?'—':daysRemaining<0?`${Math.abs(daysRemaining)} يوم تأخير`:`${daysRemaining} يوم`}</strong><small>{daysRemaining!==null&&daysRemaining!==undefined&&daysRemaining>=0?'متبقية':'حسب بيانات المشروع'}</small></div>
                <div className={styles.heroMetric}><span>اليوم</span><strong>{pulse.loading?'…':pulse.attendanceCount}</strong><small>تسجيل حضور</small></div>
                <div className={`${styles.heroMetric} ${reviewCount>0?styles.heroMetricAlert:''}`}><span>يحتاج مراجعة</span><strong>{pulse.loading?'…':reviewCount}</strong><small>{reviewCount?'حركة أو بند':'لا توجد ملاحظات حرجة'}</small></div>
              </div>
            </div>

            {switchOpen&&otherProjects.length>0&&<div className={styles.switchPanel}>
              <div className={styles.switchPanelHead}><div><strong>انتقل إلى مشروع آخر</strong><small>لن يتغير أي شيء في المشروع الحالي؛ يتغير فقط سياق العرض والعمل.</small></div><button type="button" onClick={()=>{setSwitchOpen(false);setProjectQuery('');}}>إغلاق</button></div>
              {otherProjects.length>5&&<input className={styles.switchSearch} value={projectQuery} onChange={e=>setProjectQuery(e.target.value)} placeholder="ابحث باسم المشروع أو الرقم أو المدينة…" autoFocus/>}
              <div className={styles.switchList}>{filteredOtherProjects.length?filteredOtherProjects.map(project=><button key={project.id} type="button" className={styles.switchProject} onClick={()=>chooseProject(project.id)}><span className={styles.switchNo}>{project.project_no||'—'}</span><strong>{project.name_ar}</strong><small>{project.city||'الموقع غير محدد'}</small><span className={styles.switchArrow}>←</span></button>):<div className={styles.switchEmpty}>لا يوجد مشروع مطابق.</div>}</div>
            </div>}
          </section>
        )}

        {selectedProject&&primaryOperation&&(
          <Section title="ابدأ عمل اليوم" description="التركيز التشغيلي محصور في الحضور والمصروفات؛ بقية الأدوات تبقى خارج مسرح اليوم.">
            <div className={styles.operationDeck}>
              <Link className={styles.primaryOperation} href={projectNavigationHref(selectedProject.id,primaryOperation)}>
                <div className={styles.primaryKicker}>ابدأ من هنا</div>
                <div className={styles.primaryOperationBody}>
                  <h2>{primaryOperation.label}</h2>
                  <p>{WORK_PLATFORM_OPERATION_COPY[primaryOperation.key]||'فتح أداة العمل الرئيسية.'}</p>
                </div>
                <div className={styles.primaryStatus}>{operationStatus(primaryOperation.key)}</div>
                <div className={styles.primaryCta}>فتح {primaryOperation.label} <span>←</span></div>
              </Link>

              {quickOperations.length>0&&<div className={styles.quickOperations}>{quickOperations.map(item=><Link key={item.key} className={styles.quickOperation} href={projectNavigationHref(selectedProject.id,item)}>
                <div><strong>{item.label}</strong><small>{operationStatus(item.key)}</small></div><span className={styles.quickArrow}>←</span>
              </Link>)}</div>}
            </div>
          </Section>
        )}

        {selectedProject&&activeManagement&&(
          <Section title="إدارة المشروع" description="التقارير والمالية والتنفيذ وملف المشروع تظهر كمجال واحد في كل مرة.">
            <div className={styles.managementShell}>
              <div className={styles.managementTabs} role="tablist" aria-label="مجالات إدارة المشروع">
                {secondarySections.map(section=><button key={section.key} type="button" role="tab" aria-selected={managementKey===section.key} className={managementKey===section.key?styles.managementTabActive:styles.managementTab} onClick={()=>setManagementKey(section.key)}>{section.shortLabel||section.label}</button>)}
              </div>
              <div className={styles.managementPanel} role="tabpanel">
                <div className={styles.managementIntro}><span>المجال الحالي</span><h3>{activeManagement.label}</h3><p>{activeManagement.description}</p></div>
                <nav className={styles.managementLinks}>{activeManagement.items.map(item=><Link key={item.key} href={projectNavigationHref(selectedProject.id,item)}><strong>{item.label}</strong><span>فتح ←</span></Link>)}</nav>
              </div>
            </div>
          </Section>
        )}

        {projectPortalEntries.length>0&&<div className={styles.portalUtility}>
          <div className={styles.portalUtilityTitle}><strong>إدارة بوابة المشاريع</strong><span>وظائف عامة وليست جزءًا من تشغيل المشروع الجاري</span></div>
          <nav className={styles.portalUtilityLinks} aria-label="إدارة بوابة المشاريع">{projectPortalEntries.map(item=><Link key={item.href} href={item.href} title={WORK_PLATFORM_PORTAL_ENTRY_COPY[item.href]||item.label}>{item.label==='المشاريع'?'سجل المشاريع':item.label}</Link>)}</nav>
        </div>}
      </>
    )}

    {activePortal&&activePortal.key!=='projects'&&activePortalSection&&(
      <section className={styles.genericPortalCockpit} aria-label={activePortalCopy?.title}>
        <div className={styles.projectHero}>
          <div className={styles.heroMain}>
            <div className={styles.heroKicker}>{activePortalCopy?.eyebrow}</div>
            <div className={styles.heroTitleRow}>
              <div>
                <div className={styles.projectNo}>البوابة الحالية</div>
                <h1>{activePortalCopy?.title}</h1>
              </div>
            </div>
            <div className={styles.heroMeta}>
              <span>{activePortalCopy?.description}</span>
            </div>
          </div>
          <div className={styles.heroMetrics}>
            <div className={styles.heroMetric}><span>المجالات</span><strong>{portalSections.length}</strong><small>مجال عمل منظم</small></div>
            <div className={styles.heroMetric}><span>الأدوات</span><strong>{activePortalItems.length}</strong><small>أداة متاحة</small></div>
            <div className={styles.heroMetric}><span>الوصول</span><strong>{state.fullAdmin?'كامل':'محدد'}</strong><small>{state.fullAdmin?'حسب صلاحية المدير':'حسب صلاحيات الحساب'}</small></div>
          </div>
        </div>

        <Section title={`إدارة ${activePortalCopy?.title}`} description="نفس هندسة إدارة المشروع: مجال واحد نشط في كل مرة، ولا تظهر الأداة في أكثر من مكان.">
          <div className={styles.managementShell}>
            <div className={styles.managementTabs} role="tablist" aria-label={`مجالات ${activePortalCopy?.title}`}>
              {portalSections.map(section=><button key={section.key} type="button" role="tab" aria-selected={portalManagementKey===section.key} className={portalManagementKey===section.key?styles.managementTabActive:styles.managementTab} onClick={()=>setPortalManagementKey(section.key)}>{section.shortLabel||section.label}</button>)}
            </div>
            <div className={styles.managementPanel} role="tabpanel">
              <div className={styles.managementIntro}>
                <span>المجال الحالي</span>
                <h3>{activePortalSection.label}</h3>
                <p>{activePortalSection.description}</p>
              </div>
              <nav className={styles.managementLinks}>
                {activePortalSection.items.map(item=><Link key={item.href} href={item.href}><strong>{item.label}</strong><span>فتح ←</span></Link>)}
              </nav>
            </div>
          </div>
        </Section>
      </section>
    )}
  </ConstitutionPage>;
}
