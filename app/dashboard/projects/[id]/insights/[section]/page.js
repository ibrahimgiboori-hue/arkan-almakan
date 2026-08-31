'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { money, dateAr } from '@/lib/format';
import { projectNavRequirement } from '@/lib/access-ui';
import { ConstitutionPage, Section, SummaryStrip, TableFrame, EmptyState, Notice } from '@/components/ui/ConstitutionUI';

const SECTIONS=Object.freeze({
  planning:{key:'planning',label:'التخطيط والجدولة'},
  'cost-control':{key:'cost-control',label:'التحكم المالي'},
  changes:{key:'changes',label:'التغييرات'},
  correspondence:{key:'correspondence',label:'المراسلات الفنية'},
});

function n(value){return Number(value||0);}
function status(value){
  const map={draft:'مسودة',pending:'قيد الانتظار',submitted:'مرسل',approved:'معتمد',rejected:'مرفوض',closed:'مغلق',active:'نشط',completed:'مكتمل'};
  return map[String(value||'').toLowerCase()]||value||'—';
}

async function loadPlanning(projectId){
  const [itemsQ,durationQ,timingQ]=await Promise.all([
    supabase.from('project_items').select('id,sort_order,description_ar,unit,contract_qty,budget_cost,contract_value').eq('project_id',projectId).order('sort_order'),
    supabase.from('v_item_duration').select('project_item_id,days_spent,first_day,last_day,total_output').eq('project_id',projectId),
    supabase.from('project_cashflow_timing').select('project_item_id,forecast_start_date,forecast_end_date,distribution,note').eq('project_id',projectId),
  ]);
  const error=itemsQ.error||durationQ.error||timingQ.error;if(error)throw error;
  const durations=new Map((durationQ.data||[]).map(r=>[r.project_item_id,r]));
  const timing=new Map((timingQ.data||[]).map(r=>[r.project_item_id,r]));
  const rows=(itemsQ.data||[]).map(item=>{const d=durations.get(item.id)||{};const t=timing.get(item.id)||{};return [item.sort_order??'—',item.description_ar||'—',item.contract_qty??'—',item.unit||'—',dateAr(t.forecast_start_date||d.first_day),dateAr(t.forecast_end_date||d.last_day),d.days_spent??'—',d.total_output??0];});
  const planned=(timingQ.data||[]).filter(r=>r.forecast_start_date||r.forecast_end_date).length;
  return {summary:[{key:'items',label:'بنود المشروع',value:rows.length},{key:'planned',label:'لها توقيت',value:planned},{key:'started',label:'بدأ تنفيذها',value:(durationQ.data||[]).filter(r=>r.first_day).length}],columns:['#','البند','الكمية','الوحدة','البداية','النهاية','أيام التنفيذ','المنجز'],rows};
}

async function loadCostControl(projectId){
  const [financialQ,snapshotsQ]=await Promise.all([
    supabase.from('v_project_financials').select('*').eq('project_id',projectId).maybeSingle(),
    supabase.from('project_financial_snapshots').select('snapshot_at,label,current_contract_value,earned_value,known_actual_cost,cost_to_complete,current_result,expected_result,unallocated_cost,progress_pct,next_4w_outflow,next_4w_inflow,peak_funding_pressure').eq('project_id',projectId).order('snapshot_at',{ascending:false}).limit(24),
  ]);if(financialQ.error)throw financialQ.error;if(snapshotsQ.error)throw snapshotsQ.error;
  const f=financialQ.data||{};const snapshots=snapshotsQ.data||[];
  const rows=snapshots.map(r=>[dateAr(r.snapshot_at),r.label||'لقطة مالية',`${Math.round(n(r.progress_pct))}%`,money(r.current_contract_value),money(r.earned_value),money(r.known_actual_cost),money(r.current_result),money(r.next_4w_inflow),money(r.next_4w_outflow)]);
  return {summary:[{key:'contract',label:'قيمة العقد',value:money(f.contract_value)},{key:'earned',label:'القيمة المكتسبة',value:money(f.earned_value),note:`إنجاز ${Math.round(n(f.computed_progress_pct))}%`},{key:'cost',label:'التكلفة المعروفة',value:money(f.direct_cost_known)},{key:'result',label:'النتيجة الحالية',value:money(f.current_profit)}],columns:['التاريخ','اللقطة','الإنجاز','العقد','المكتسب','التكلفة','النتيجة','داخل 4 أسابيع','خارج 4 أسابيع'],rows};
}

async function loadChanges(projectId){
  const {data,error}=await supabase.from('change_orders').select('id,co_number,co_date,description,reason,status,owner_ref,duration_days,approved_at,created_at').eq('project_id',projectId).order('co_date',{ascending:false});if(error)throw error;const rows=data||[];
  return {summary:[{key:'count',label:'أوامر التغيير',value:rows.length},{key:'open',label:'غير معتمدة',value:rows.filter(r=>String(r.status||'').toLowerCase()!=='approved').length},{key:'days',label:'الأثر الزمني',value:`${rows.reduce((s,r)=>s+n(r.duration_days),0)} يوم`}],columns:['رقم التغيير','التاريخ','الوصف','السبب','الأثر الزمني','الحالة','اعتماد المالك'],rows:rows.map(r=>[r.co_number||'—',dateAr(r.co_date),r.description||'—',r.reason||'—',`${n(r.duration_days)} يوم`,status(r.status),r.owner_ref||dateAr(r.approved_at)])};
}

async function loadCorrespondence(projectId){
  const [siteQ,docsQ]=await Promise.all([
    supabase.from('site_documents').select('id,doc_kind,doc_date,title,description,file_path,created_at').eq('project_id',projectId).order('doc_date',{ascending:false}).limit(100),
    supabase.from('documents').select('id,doc_number,subject,status,issued_at,sent_at,created_at').eq('project_id',projectId).order('created_at',{ascending:false}).limit(100),
  ]);if(siteQ.error)throw siteQ.error;if(docsQ.error)throw docsQ.error;
  const rows=[...(siteQ.data||[]).map(r=>['مستند موقع',r.doc_kind||'—',r.title||'—',dateAr(r.doc_date||r.created_at),'—']),...(docsQ.data||[]).map(r=>['مستند نظام',r.doc_number||'—',r.subject||'—',dateAr(r.issued_at||r.sent_at||r.created_at),status(r.status)])];
  return {summary:[{key:'site',label:'مستندات الموقع',value:(siteQ.data||[]).length},{key:'docs',label:'مستندات النظام',value:(docsQ.data||[]).length},{key:'all',label:'الإجمالي',value:rows.length}],columns:['المصدر','الرقم / النوع','الموضوع','التاريخ','الحالة'],rows};
}

const LOADERS={planning:loadPlanning,'cost-control':loadCostControl,changes:loadChanges,correspondence:loadCorrespondence};

export default function ProjectInsightPage(){
  const params=useParams();
  const projectId=String(params?.id||'');
  const sectionKey=String(params?.section||'');
  const definition=SECTIONS[sectionKey]||null;
  const [state,setState]=useState({loading:true,allowed:false,project:null,data:null,error:''});

  const required=useMemo(()=>definition?projectNavRequirement(definition.key):[],[definition]);

  useEffect(()=>{
    let alive=true;
    (async()=>{
      if(!definition||!projectId){if(alive)setState({loading:false,allowed:false,project:null,data:null,error:'القسم أو المشروع غير معروف.'});return;}
      const session=(await supabase.auth.getSession()).data.session;if(!session)return;
      const [userQ,capsQ,primaryQ,projectQ]=await Promise.all([
        supabase.from('app_users').select('is_system_admin').eq('id',session.user.id).maybeSingle(),
        supabase.from('v_my_capabilities').select('capability_key,scope_type,scope_key,source_key').or(`scope_type.eq.all,and(scope_type.eq.project,scope_key.eq.${projectId})`),
        supabase.rpc('fn_is_primary_user'),
        supabase.from('projects').select('id,project_no,name_ar,city,stage').eq('id',projectId).maybeSingle(),
      ]);
      const full=primaryQ.data===true||Boolean(userQ.data?.is_system_admin)||(capsQ.data||[]).some(c=>c.source_key==='projects_full_access');
      const keys=new Set((capsQ.data||[]).map(c=>c.capability_key));
      const allowed=full||required.length===0||required.some(key=>keys.has(key));
      if(!allowed){if(alive)setState({loading:false,allowed:false,project:projectQ.data||null,data:null,error:'هذا القسم خارج صلاحياتك في المشروع.'});return;}
      try{const data=await LOADERS[sectionKey](projectId);if(alive)setState({loading:false,allowed:true,project:projectQ.data||null,data,error:''});}
      catch(error){if(alive)setState({loading:false,allowed:true,project:projectQ.data||null,data:null,error:error?.message||'تعذر تحميل بيانات القسم.'});}
    })();
    return()=>{alive=false;};
  },[definition,projectId,required,sectionKey]);

  if(!definition)return <ConstitutionPage><EmptyState title="قسم غير معروف"/></ConstitutionPage>;
  if(state.loading)return <ConstitutionPage><EmptyState title={`جارٍ تجهيز ${definition.label}`}/></ConstitutionPage>;
  if(!state.allowed)return <ConstitutionPage><Notice tone="warning">{state.error}</Notice></ConstitutionPage>;
  const data=state.data;
  return <ConstitutionPage>
    <section className="constitution-level-stage" aria-label={definition.label}>
      <div className="constitution-level-stage-main">
        <div className="constitution-level-stage-parent">{state.project?.project_no||'المشروع'} · {state.project?.city||'الموقع غير محدد'}</div>
        <h1 className="constitution-level-stage-title">{definition.label}</h1>
      </div>
    </section>
    {state.error&&<Notice tone="warning">تعذر تحميل البيانات الحالية: {state.error}</Notice>}
    {data?.summary?.length?<Section title="الملخص"><SummaryStrip items={data.summary}/></Section>:null}
    <Section>
      {data?.rows?.length?<TableFrame><table><thead><tr>{data.columns.map((c,i)=><th key={`${c}-${i}`}>{c}</th>)}</tr></thead><tbody>{data.rows.map((r,ri)=><tr key={ri}>{r.map((c,ci)=><td key={ci}>{c??'—'}</td>)}</tr>)}</tbody></table></TableFrame>:<EmptyState title="لا توجد بيانات"/>}
    </Section>
  </ConstitutionPage>;
}
