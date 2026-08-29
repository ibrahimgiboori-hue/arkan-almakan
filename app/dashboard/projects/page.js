'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { money } from '@/lib/format';
import { STAGE_AR, SCOPE_AR } from '@/lib/projects';
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
  SummaryStrip,
  FilterSurface,
  RecordList,
  RecordRow,
  RecordSummary,
} from '@/components/ui/ConstitutionUI';

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
    router.push(`/dashboard/projects/${data.id}`);
  }

  const list=useMemo(()=>{
    if(!rows)return[];
    const term=q.trim().toLowerCase();
    return rows
      .filter((row)=>stage==='all'||row.stage===stage)
      .filter((row)=>!term||[row.name_ar,row.project_no,row.city].filter(Boolean).some((value)=>String(value).toLowerCase().includes(term)));
  },[rows,stage,q]);

  if(!rows)return <ConstitutionPage><EmptyState title="جارٍ تحميل المشاريع" description="يتم تحميل المشاريع والمؤشرات الحالية."/></ConstitutionPage>;

  const executionCount=rows.filter((row)=>row.stage==='execution').length;
  const opportunityCount=rows.filter((row)=>['opportunity','pricing','submitted'].includes(row.stage)).length;

  return <ConstitutionPage>
    <PageHeader
      eyebrow="PROJECTS"
      title="المشاريع"
      description="دفتر المشاريع المتاحة لهذا الحساب؛ افتح أي سطر لتكمل العمل داخل المشروع نفسه."
      actions={canCreate?<Toolbar><button className="btn" onClick={createProject} disabled={busy}>{busy?'جارٍ الإنشاء…':'+ إضافة مشروع'}</button></Toolbar>:null}
    />

    <SummaryStrip
      label="ملخص المشاريع"
      items={[
        {key:'all',value:rows.length,label:'المشاريع المتاحة'},
        {key:'execution',value:executionCount,label:'قيد التنفيذ'},
        {key:'opportunity',value:opportunityCount,label:'فرص وتسعير'},
      ]}
    />

    <FilterSurface>
      <input value={q} onChange={(event)=>setQ(event.target.value)} placeholder="ابحث باسم المشروع أو رقمه أو المدينة" aria-label="بحث في المشاريع"/>
      <Toolbar>
        <button type="button" className="btn ghost" aria-pressed={stage==='all'} onClick={()=>setStage('all')}>الكل</button>
        <button type="button" className="btn ghost" aria-pressed={stage==='execution'} onClick={()=>setStage('execution')}>قيد التنفيذ</button>
        <button type="button" className="btn ghost" aria-pressed={stage==='opportunity'} onClick={()=>setStage('opportunity')}>فرص</button>
      </Toolbar>
      <span>{list.length} مطابق</span>
    </FilterSurface>

    {err&&<Notice tone="error">{err}</Notice>}

    <Section title="سجل المشاريع" description="كل مشروع سطر عمل؛ التفاصيل تظهر عند فتحه بدل تحويل الصفحة إلى بطاقات منفصلة.">
      {list.length===0?<EmptyState title="لا توجد مشاريع مطابقة" description="غيّر البحث أو الفلتر الحالي."/>:<RecordList label="سجل المشاريع">
        {list.map((project)=>{
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
            onOpen={()=>router.push(`/dashboard/projects/${project.id}`)}
            ariaLabel={`فتح مشروع ${project.name_ar}`}
          >
            <RecordSummary
              kicker={project.project_no||'بدون رقم'}
              title={project.name_ar}
              badge={STAGE_AR[project.stage]||project.stage||'—'}
              meta={[project.city||'المدينة غير محددة',SCOPE_AR[project.supply_scope]||'النطاق غير محدد']}
              metrics={metrics}
              progress={progress}
              note={undecided>0?`${undecided} بند بلا قرار تنفيذ`:'لا توجد قرارات تنفيذ معلقة'}
            />
          </RecordRow>;
        })}
      </RecordList>}
    </Section>
  </ConstitutionPage>;
}
