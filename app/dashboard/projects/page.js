'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { money } from '@/lib/format';
import { PROJECT_CARE_AR, SCOPE_AR, STAGE_AR, projectCaretakerState } from '@/lib/projects';
import { normalizeProjectCare, projectApproachHref } from '@/lib/living-navigation';
import { useLiveRefresh } from '@/lib/live';
import { useDashboardSession } from '@/lib/dashboard-session-context';
import { canUseAnyCapability, canUseCapability } from '@/lib/access-ui';
import {
  ConstitutionPage,
  PageHeader,
  Section,
  Notice,
  Toolbar,
  EmptyState,
  FilterSurface,
  RecordList,
  RecordRow,
  RecordSummary,
} from '@/components/ui/ConstitutionUI';

function pct(value) {
  const n=Number(value||0);
  return Math.max(0,Math.min(100,Number.isFinite(n)?n:0));
}

function bump(map,id,key){
  if(!id)return;
  map[id]=map[id]||{activeAssignments:0,openClaims:0,openSettlements:0,openCustodies:0};
  map[id][key]+=1;
}

export default function Projects(){
  const router=useRouter();
  const searchParams=useSearchParams();
  const session=useDashboardSession();
  const care=normalizeProjectCare(searchParams.get('care'));
  const [rows,setRows]=useState(null);
  const [fin,setFin]=useState({});
  const [facts,setFacts]=useState({});
  const [q,setQ]=useState('');
  const [err,setErr]=useState('');
  const [busy,setBusy]=useState(false);

  const canCreate=canUseCapability(session,'projects.projects.create','all');

  async function load(){
    setErr('');
    const [projectsQ,financialsQ,contractorsQ,laborQ,claimsQ,settlementsQ,custodiesQ]=await Promise.all([
      supabase.from('projects').select('id, project_no, name_ar, city, stage, status, supply_scope, contract_value, manual_progress_pct, created_at').order('created_at',{ascending:false}),
      supabase.from('v_project_financials').select('project_id, current_profit, pending_collection, retention_held, custody_balance, owner_recovery_pending, items_without_decision, unclassified_spend, computed_progress_pct'),
      supabase.from('project_contractors').select('project_id,is_active,start_date,end_date'),
      supabase.from('labor_project_assignments').select('project_id,is_active,valid_from,valid_to'),
      supabase.from('progress_claims').select('project_id,status,collected_at'),
      supabase.from('contractor_settlements').select('project_id,status,paid_at'),
      supabase.from('custodies').select('project_id,status'),
    ]);
    if(projectsQ.error){setErr('تعذر تحميل المشاريع: '+projectsQ.error.message);setRows([]);return;}

    const financialMap={};
    if(!financialsQ.error)(financialsQ.data||[]).forEach((item)=>{financialMap[item.project_id]=item;});

    const factMap={};
    if(!contractorsQ.error)(contractorsQ.data||[]).forEach((row)=>{if(row.is_active!==false&&!row.end_date)bump(factMap,row.project_id,'activeAssignments');});
    if(!laborQ.error)(laborQ.data||[]).forEach((row)=>{if(row.is_active!==false&&!row.valid_to)bump(factMap,row.project_id,'activeAssignments');});
    if(!claimsQ.error)(claimsQ.data||[]).forEach((row)=>{if(!['collected','rejected'].includes(row.status)&&!row.collected_at)bump(factMap,row.project_id,'openClaims');});
    if(!settlementsQ.error)(settlementsQ.data||[]).forEach((row)=>{if(!['paid','closed','cancelled'].includes(row.status)&&!row.paid_at)bump(factMap,row.project_id,'openSettlements');});
    if(!custodiesQ.error)(custodiesQ.data||[]).forEach((row)=>{if(row.status==='open')bump(factMap,row.project_id,'openCustodies');});

    setRows(projectsQ.data||[]);
    setFin(financialMap);
    setFacts(factMap);
  }

  useEffect(()=>{load();},[]);
  useLiveRefresh(load,['all']);

  async function createProject(){
    setErr('');setBusy(true);
    const {data:number,error:numberError}=await supabase.rpc('next_document_number',{p_doc_type:'PROJECT',p_prefix:'PRJ'});
    if(numberError){setErr('تعذّر توليد رقم المشروع: '+numberError.message);setBusy(false);return;}
    const {data,error}=await supabase.from('projects').insert({project_no:number,name_ar:'مشروع جديد',stage:'awarded',status:'active',supply_scope:'labor_only'}).select('id').single();
    setBusy(false);
    if(error){setErr('تعذّر إنشاء المشروع: '+error.message);return;}
    router.push(projectApproachHref(data.id,{care:'prep'}));
  }

  const classified=useMemo(()=>{
    if(!rows)return[];
    return rows.map((project)=>({
      project,
      care:projectCaretakerState(project,fin[project.id]||{},facts[project.id]||{}),
    }));
  },[rows,fin,facts]);

  const list=useMemo(()=>{
    const term=q.trim().toLowerCase();
    return classified
      .filter((row)=>row.care===care)
      .filter(({project})=>!term||[project.name_ar,project.project_no,project.city].filter(Boolean).some((value)=>String(value).toLowerCase().includes(term)));
  },[classified,care,q]);

  if(!rows)return <ConstitutionPage><EmptyState title="جارٍ تحميل المشاريع"/></ConstitutionPage>;

  return <ConstitutionPage data-navigation-stage="biological-children">
    <PageHeader
      title={PROJECT_CARE_AR[care]||'المشاريع'}
      description="المشروعات الحقيقية التي تنطبق عليها هذه الحالة الآن. تتغير الحاضنة بتغير حقائق التنفيذ والالتزامات، بينما تبقى هوية المشروع ثابتة."
      actions={canCreate&&care==='prep'?<Toolbar><button className="btn" onClick={createProject} disabled={busy}>{busy?'جارٍ الإنشاء…':'مشروع جديد'}</button></Toolbar>:null}
    />

    <FilterSurface>
      <input value={q} onChange={(event)=>setQ(event.target.value)} placeholder="اسم المشروع أو رقمه أو المدينة" aria-label="بحث في المشاريع"/>
      <span>{list.length}</span>
    </FilterSurface>

    {err&&<Notice tone="error">{err}</Notice>}

    <Section title={PROJECT_CARE_AR[care]||'المشاريع'}>
      {list.length===0?<EmptyState title="لا توجد مشاريع في هذه الحالة"/>:<RecordList label={PROJECT_CARE_AR[care]||'المشاريع'}>
        {list.map(({project})=>{
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
          const closingNote=care==='closing'?'منتهٍ ميدانيًا — قيد الإقفال':null;
          return <RecordRow
            key={project.id}
            onOpen={()=>router.push(projectApproachHref(project.id,{care}))}
            ariaLabel={`فتح مشروع ${project.name_ar}`}
          >
            <RecordSummary
              kicker={project.project_no||'بدون رقم'}
              title={project.name_ar}
              badge={STAGE_AR[project.stage]||project.stage||'—'}
              meta={[project.city||'المدينة غير محددة',SCOPE_AR[project.supply_scope]||'النطاق غير محدد']}
              metrics={metrics}
              progress={progress}
              note={closingNote||(undecided>0?`${undecided} بند بلا قرار تنفيذ`:null)}
            />
          </RecordRow>;
        })}
      </RecordList>}
    </Section>
  </ConstitutionPage>;
}
