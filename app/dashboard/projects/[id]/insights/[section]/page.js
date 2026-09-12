'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PROJECT_INSIGHT_SECTIONS } from '@/lib/project-insights.mjs';
import { projectInsightsService } from '@/lib/application/project-insights-service';
import { ConstitutionPage, Section, SummaryStrip, TableFrame, EmptyState, Notice } from '@/components/ui/ConstitutionUI';

export default function ProjectInsightPage(){
  const params=useParams();
  const projectId=String(params?.id || '');
  const sectionKey=String(params?.section || '');
  const definition=PROJECT_INSIGHT_SECTIONS[sectionKey] || null;
  const [state,setState]=useState({loading:true,allowed:false,project:null,data:null,error:''});

  useEffect(()=>{
    let alive=true;
    setState((current)=>({...current,loading:true,error:''}));
    (async()=>{
      try{
        const workspace=await projectInsightsService.loadWorkspace({projectId,sectionKey});
        if(alive)setState({
          loading:false,
          allowed:workspace.allowed,
          project:workspace.project,
          data:workspace.data,
          error:workspace.error || '',
        });
      }catch(error){
        if(alive)setState({loading:false,allowed:false,project:null,data:null,error:error?.message || 'تعذر فتح قسم المشروع.'});
      }
    })();
    return()=>{alive=false;};
  },[projectId,sectionKey]);

  if(!definition)return <ConstitutionPage><EmptyState title="قسم غير معروف"/></ConstitutionPage>;
  if(state.loading)return <ConstitutionPage><EmptyState title={`جارٍ تجهيز ${definition.label}`}/></ConstitutionPage>;
  if(!state.allowed)return <ConstitutionPage><Notice tone="warning">{state.error}</Notice></ConstitutionPage>;
  const data=state.data;
  return <ConstitutionPage>
    <section className="constitution-level-stage" aria-label={definition.label} data-project-insight-workspace="engineered-v1">
      <div className="constitution-level-stage-main">
        <div className="constitution-level-stage-parent">{state.project?.project_no || 'المشروع'} · {state.project?.city || 'الموقع غير محدد'}</div>
        <h1 className="constitution-level-stage-title">{definition.label}</h1>
      </div>
    </section>
    {state.error&&<Notice tone="warning">تعذر تحميل البيانات الحالية: {state.error}</Notice>}
    {data?.summary?.length?<Section title="الملخص"><SummaryStrip items={data.summary}/></Section>:null}
    <Section>
      {data?.rows?.length?<TableFrame><table><thead><tr>{data.columns.map((column,index)=><th key={`${column}-${index}`}>{column}</th>)}</tr></thead><tbody>{data.rows.map((row,rowIndex)=><tr key={rowIndex}>{row.map((cell,cellIndex)=><td key={cellIndex}>{cell ?? '—'}</td>)}</tr>)}</tbody></table></TableFrame>:<EmptyState title="لا توجد بيانات"/>}
    </Section>
  </ConstitutionPage>;
}
