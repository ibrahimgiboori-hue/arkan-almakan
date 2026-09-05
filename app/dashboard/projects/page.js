'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { money } from '@/lib/format';
import { STAGE_AR, SCOPE_AR } from '@/lib/projects';
import { useLiveRefresh } from '@/lib/live';
import { useDashboardSession } from '@/lib/dashboard-session-context';
import { canUseAnyCapability, canUseCapability, preferredProjectHref } from '@/lib/access-ui';
import {
  ConstitutionPage,
  PageHeader,
  Notice,
  Toolbar,
  EmptyState,
  FilterSurface,
  RecordList,
  RecordRow,
  RecordSummary,
} from '@/components/ui/ConstitutionUI';
import { PortalHall, PortalLiveZone, PortalRegistry } from '@/components/ui/PortalHall';

function pct(value) {
  const n=Number(value||0);
  return Math.max(0,Math.min(100,Number.isFinite(n)?n:0));
}

export default function Projects(){
  const router=useRouter();
  const session=useDashboardSession();
  const [rows,setRows]=useState(null);
  const [fin,setFin]=useState({});
  const [stage,setStage]=useState('all');
  const [q,setQ]=useState('');
  const [registryOpen,setRegistryOpen]=useState(false);
  const [err,setErr]=useState('');
  const [busy,setBusy]=useState(false);

  const canCreate=canUseCapability(session,'projects.projects.create','all');

  async function load(){
    setErr('');
    const [projectsQ,financialsQ]=await Promise.all([
      supabase.from('projects').select('id, project_no, name_ar, city, stage, status, supply_scope, contract_value, created_at').order('created_at',{ascending:false}),
      supabase.from('v_project_financials').select('project_id, current_profit, pending_collection, items_without_decision, computed_progress_pct'),
    ]);
    if(projectsQ.error){setErr('تعذر تحميل المشاريع: '+projectsQ.error.message);setRows([]);return;}
    const map={};
    if(!financialsQ.error)(financialsQ.data||[]).forEach((item)=>{map[item.project_id]=item;});
    setRows(projectsQ.data||[]);
    setFin(map);
  }

  useEffect(()=>{load();},[]);
  useLiveRefresh(load,['all']);

  async function createProject(){
    setErr('');setBusy(true);
    const {data:number,error:numberError}=await supabase.rpc('next_document_number',{p_doc_type:'PROJECT',p_prefix:'PRJ'});
    if(numberError){setErr('تعذّر توليد رقم المشروع: '+numberError.message);setBusy(false);return;}
    const {data,error}=await supabase.from('projects').insert({project_no:number,name_ar:'مشروع جديد',stage:'opportunity',status:'active',supply_scope:'labor_only'}).select('id').single();
    setBusy(false);
    if(error){setErr('تعذّر إنشاء المشروع: '+error.message);return;}
    router.push(`/dashboard/projects/${data.id}?view=settings`);
  }

  const split=useMemo(()=>{
    if(!rows)return {live:[],registry:[]};
    return {
      live:rows.filter((row)=>row.stage==='execution'),
      registry:rows.filter((row)=>row.stage!=='execution'),
    };
  },[rows]);

  const registryList=useMemo(()=>{
    const term=q.trim().toLowerCase();
    return split.registry
      .filter((row)=>stage==='all'||row.stage===stage||(stage==='opportunity'&&['opportunity','pricing','submitted'].includes(row.stage)))
      .filter((row)=>!term||[row.name_ar,row.project_no,row.city].filter(Boolean).some((value)=>String(value).toLowerCase().includes(term)));
  },[split.registry,stage,q]);
  const filtering=stage!=='all'||Boolean(q.trim());
  const effectiveRegistryOpen=registryOpen||filtering;

  if(!rows)return <ConstitutionPage><EmptyState title="جارٍ تحميل المشاريع"/></ConstitutionPage>;

  function projectRow(project){
    const f=fin[project.id]||{};
    const progress=pct(f.computed_progress_pct);
    const pending=Number(f.pending_collection||0);
    const undecided=Number(f.items_without_decision||0);
    const profit=Number(f.current_profit||0);
    const showFinancials=canUseAnyCapability(
      session,
      ['projects.financial_summary.view','finance.projects.view'],
      'project',
      project.id,
    );
    const metrics=showFinancials ? [
      {key:'contract',label:'قيمة العقد',value:money(project.contract_value||0)},
      {key:'pending',label:'غير محصل',value:money(pending)},
      {key:'profit',label:'الربح الحالي',value:money(profit)},
    ] : [];
    return <RecordRow
      key={project.id}
      onOpen={()=>router.push(preferredProjectHref(session,project.id))}
      ariaLabel={`فتح مشروع ${project.name_ar}`}
    >
      <RecordSummary
        kicker={project.project_no||'بدون رقم'}
        title={project.name_ar}
        badge={STAGE_AR[project.stage]||project.stage||'—'}
        meta={[project.city||'المدينة غير محددة',SCOPE_AR[project.supply_scope]||'النطاق غير محدد']}
        metrics={metrics}
        progress={progress}
        note={undecided>0?`${undecided} بند بلا قرار تنفيذ`:null}
      />
    </RecordRow>;
  }

  return <ConstitutionPage>
    <PageHeader
      eyebrow="بوابة المشاريع"
      title="المشاريع"
      description="ابدأ بالمشاريع التي يجري تنفيذها الآن. السجل الكامل والأعمال غير الجارية تبقى في طبقة ثانية عند الحاجة."
      actions={canCreate?<Toolbar><button className="btn" onClick={createProject} disabled={busy}>{busy?'جارٍ الإنشاء…':'مشروع جديد'}</button></Toolbar>:null}
    />

    {err&&<Notice tone="error">{err}</Notice>}

    <PortalHall portalKey="projects">
      <PortalLiveZone
        title="قيد التنفيذ الآن"
        description="هذه هي مساحة العمل اليومية داخل بوابة المشاريع؛ فتح المشروع ينقلك مباشرة إلى موقفه."
        count={split.live.length}
      >
        {split.live.length===0
          ? <EmptyState title="لا توجد مشاريع قيد التنفيذ حاليًا" description="ستظهر هنا المشاريع فور انتقالها إلى مرحلة التنفيذ."/>
          : <RecordList label="المشاريع قيد التنفيذ">{split.live.map(projectRow)}</RecordList>}
      </PortalLiveZone>

      <PortalRegistry
        title="بقية المشاريع"
        description="الفرص والتسعير والترسية والمشاريع المقفلة؛ افتح السجل فقط عندما تحتاج البحث أو الرجوع إليها."
        count={split.registry.length}
        open={effectiveRegistryOpen}
        onToggle={(event)=>{if(!filtering)setRegistryOpen(event.currentTarget.open);}}
      >
        <FilterSurface>
          <input value={q} onChange={(event)=>setQ(event.target.value)} placeholder="اسم المشروع أو رقمه أو المدينة" aria-label="بحث في بقية المشاريع"/>
          <Toolbar>
            <button type="button" className="btn ghost" aria-pressed={stage==='all'} onClick={()=>setStage('all')}>الكل</button>
            <button type="button" className="btn ghost" aria-pressed={stage==='opportunity'} onClick={()=>setStage('opportunity')}>فرص وتسعير</button>
            <button type="button" className="btn ghost" aria-pressed={stage==='awarded'} onClick={()=>setStage('awarded')}>ترسية</button>
            <button type="button" className="btn ghost" aria-pressed={stage==='closed'} onClick={()=>setStage('closed')}>مقفل</button>
            <button type="button" className="btn ghost" aria-pressed={stage==='lost'} onClick={()=>setStage('lost')}>خسارة</button>
          </Toolbar>
          <span>{registryList.length}</span>
        </FilterSurface>

        {registryList.length===0
          ? <EmptyState title="لا توجد مشاريع مطابقة في بقية السجل"/>
          : <RecordList label="بقية المشاريع">{registryList.map(projectRow)}</RecordList>}
      </PortalRegistry>
    </PortalHall>
  </ConstitutionPage>;
}
