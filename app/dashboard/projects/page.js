'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { money } from '@/lib/format';
import { STAGE_AR, SCOPE_AR } from '@/lib/projects';
import { useLiveRefresh } from '@/lib/live';
import { ConstitutionPage, PageHeader, Section, Notice, Toolbar, EmptyState } from '@/components/ui/ConstitutionUI';
import styles from './projects-redesign.module.css';

function pct(value) {
  const n=Number(value||0);
  return Math.max(0,Math.min(100,Number.isFinite(n)?n:0));
}

export default function Projects(){
  const router=useRouter();
  const [rows,setRows]=useState(null); const [fin,setFin]=useState({});
  const [access,setAccess]=useState({full:false,canCreate:false,financialAll:false,financialProjects:new Set()});
  const [stage,setStage]=useState('all'); const [q,setQ]=useState(''); const [err,setErr]=useState(''); const [busy,setBusy]=useState(false);

  async function load(){
    setErr('');
    const session=(await supabase.auth.getSession()).data.session;
    const [projectsQ,financialsQ,capsQ,primaryQ,userQ]=await Promise.all([
      supabase.from('projects').select('id, project_no, name_ar, city, stage, status, supply_scope, contract_value, created_at').order('created_at',{ascending:false}),
      supabase.from('v_project_financials').select('project_id, current_profit, pending_collection, items_without_decision, computed_progress_pct'),
      supabase.from('v_my_capabilities').select('capability_key,scope_type,scope_key'),
      supabase.rpc('fn_is_primary_user'),
      session?.user?.id ? supabase.from('app_users').select('is_system_admin').eq('id',session.user.id).maybeSingle() : Promise.resolve({data:null,error:null}),
    ]);
    if(projectsQ.error){setErr('تعذر تحميل المشاريع: '+projectsQ.error.message);setRows([]);return;}
    const map={}; if(!financialsQ.error)(financialsQ.data||[]).forEach((item)=>{map[item.project_id]=item;});
    const caps=capsQ.data||[];
    const full=primaryQ.data===true||Boolean(userQ.data?.is_system_admin);
    const financialCaps=caps.filter((cap)=>['projects.financial_summary.view','finance.projects.view'].includes(cap.capability_key));
    setRows(projectsQ.data||[]);setFin(map);
    setAccess({
      full,
      canCreate:full||caps.some((cap)=>cap.capability_key==='projects.projects.create'),
      financialAll:full||financialCaps.some((cap)=>cap.scope_type==='all'),
      financialProjects:new Set(financialCaps.filter((cap)=>cap.scope_type==='project').map((cap)=>cap.scope_key)),
    });
  }
  useEffect(()=>{load();},[]); useLiveRefresh(load,['all']);

  async function createProject(){
    setErr('');setBusy(true);
    const {data:number,error:numberError}=await supabase.rpc('next_document_number',{p_doc_type:'PROJECT',p_prefix:'PRJ'});
    if(numberError){setErr('تعذّر توليد رقم المشروع: '+numberError.message);setBusy(false);return;}
    const {data,error}=await supabase.from('projects').insert({project_no:number,name_ar:'مشروع جديد',stage:'opportunity',status:'active',supply_scope:'labor_only'}).select('id').single();
    setBusy(false); if(error){setErr('تعذّر إنشاء المشروع: '+error.message);return;} router.push(`/dashboard/projects/${data.id}`);
  }

  const list=useMemo(()=>{
    if(!rows)return[]; const term=q.trim().toLowerCase();
    return rows.filter((row)=>stage==='all'||row.stage===stage).filter((row)=>!term||[row.name_ar,row.project_no,row.city].filter(Boolean).some((value)=>String(value).toLowerCase().includes(term)));
  },[rows,stage,q]);

  if(!rows)return <ConstitutionPage><EmptyState title="جارٍ تحميل المشاريع" description="يتم تحميل المشاريع والمؤشرات الحالية."/></ConstitutionPage>;
  const executionCount=rows.filter((row)=>row.stage==='execution').length;
  const opportunityCount=rows.filter((row)=>['opportunity','pricing','submitted'].includes(row.stage)).length;

  return <ConstitutionPage>
    <PageHeader eyebrow="PROJECTS" title="المشاريع" description="تظهر هنا المشاريع المسموح لهذا الحساب بالعمل عليها فقط." actions={access.canCreate?<Toolbar><button className="btn" onClick={createProject} disabled={busy}>{busy?'جارٍ الإنشاء…':'+ إضافة مشروع'}</button></Toolbar>:null}/>

    <Section title="ملخص المشاريع">
      <div className={styles.summaryStrip} aria-label="ملخص المشاريع">
        <div><strong>{rows.length}</strong><span>إجمالي المشاريع المتاحة</span></div>
        <div><strong>{executionCount}</strong><span>قيد التنفيذ</span></div>
        <div><strong>{opportunityCount}</strong><span>فرص وتسعير</span></div>
      </div>
    </Section>

    <Section title="البحث والتصفية">
      <div className={styles.toolbar}>
        <input className={styles.search} value={q} onChange={(event)=>setQ(event.target.value)} placeholder="ابحث باسم المشروع أو رقمه أو المدينة" aria-label="بحث في المشاريع"/>
        <div className={styles.filters}>
          <button className={`${styles.filter} ${stage==='all'?styles.filterActive:''}`} onClick={()=>setStage('all')}>الكل</button>
          <button className={`${styles.filter} ${stage==='execution'?styles.filterActive:''}`} onClick={()=>setStage('execution')}>قيد التنفيذ</button>
          <button className={`${styles.filter} ${stage==='opportunity'?styles.filterActive:''}`} onClick={()=>setStage('opportunity')}>فرص</button>
        </div>
      </div>
    </Section>

    {err&&<Notice tone="error">{err}</Notice>}

    <Section title="سجل المشاريع" description={`${list.length} مشروع مطابق للعرض الحالي`}>
      {list.length===0?<EmptyState title="لا توجد مشاريع مطابقة" description="لا توجد مشاريع مسندة تطابق البحث أو الفلتر الحالي."/>:<div className={styles.projectGrid} aria-label="بطاقات المشاريع">
        {list.map((project)=>{
          const f=fin[project.id]||{}; const progress=pct(f.computed_progress_pct); const pending=Number(f.pending_collection||0); const undecided=Number(f.items_without_decision||0); const profit=Number(f.current_profit||0);
          const showFinancials=access.full||access.financialAll||access.financialProjects.has(project.id);
          return <button key={project.id} className={styles.projectCard} onClick={()=>router.push(`/dashboard/projects/${project.id}`)}>
            <div className={styles.cardTop}><div className={styles.cardIdentity}><span className={styles.projectNo}>{project.project_no||'بدون رقم'}</span><h2>{project.name_ar}</h2></div><span className={`${styles.stageBadge} ${project.stage==='execution'?styles.stageExecution:''}`}>{STAGE_AR[project.stage]||project.stage||'—'}</span></div>
            <div className={styles.cardMeta}><span>{project.city||'المدينة غير محددة'}</span><span>{SCOPE_AR[project.supply_scope]||'النطاق غير محدد'}</span></div>
            <div className={styles.progressBlock}><div className={styles.progressLabel}><span>الإنجاز</span><strong>{progress.toFixed(0)}%</strong></div><div className={styles.progressRail}><span style={{width:`${progress}%`}}/></div></div>
            {showFinancials?<div className={styles.cardNumbers}><div><span>قيمة العقد</span><strong>{money(project.contract_value||0)}</strong></div><div><span>غير محصل</span><strong className={pending>0?styles.warn:''}>{money(pending)}</strong></div><div><span>الربح الحالي</span><strong className={profit<0?styles.danger:''}>{money(profit)}</strong></div></div>:<div className={styles.cardNumbers}><div><span>نطاق الحساب</span><strong>تشغيل المشروع</strong></div></div>}
            <div className={styles.cardFoot}><span>{undecided>0?`${undecided} بند بلا قرار تنفيذ`:'لا توجد قرارات تنفيذ معلقة'}</span><strong>فتح المشروع ←</strong></div>
          </button>;
        })}
      </div>}
    </Section>
  </ConstitutionPage>;
}
