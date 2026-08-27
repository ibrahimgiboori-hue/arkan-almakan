'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { portalSectionDefinition } from '@/lib/portal-section-constitution';
import { loadPortalSectionData } from '@/lib/portal-section-data';
import { ConstitutionPage, Section, SummaryStrip, TableFrame, EmptyState, Notice } from '@/components/ui/ConstitutionUI';

function hasSectionAccess(definition, capabilityKeys, fullAdmin){
  if(fullAdmin)return true;
  if(!definition?.capabilities?.length)return true;
  return definition.capabilities.some(key=>capabilityKeys.has(key));
}

export default function PortalSectionPage(){
  const params=useParams();
  const portal=String(params?.portal||'');
  const sectionKey=String(params?.section||'');
  const definition=useMemo(()=>portalSectionDefinition(portal,sectionKey),[portal,sectionKey]);
  const [state,setState]=useState({loading:true,allowed:false,data:null,error:''});

  useEffect(()=>{
    let alive=true;
    (async()=>{
      if(!definition){
        if(alive)setState({loading:false,allowed:false,data:null,error:'هذا القسم غير معرف في دستور البوابات.'});
        return;
      }
      const session=(await supabase.auth.getSession()).data.session;
      if(!session){
        if(alive)setState({loading:false,allowed:false,data:null,error:'يلزم تسجيل الدخول.'});
        return;
      }
      const [userQ,capsQ,primaryQ]=await Promise.all([
        supabase.from('app_users').select('is_system_admin').eq('id',session.user.id).maybeSingle(),
        supabase.from('v_my_capabilities').select('capability_key'),
        supabase.rpc('fn_is_primary_user'),
      ]);
      const fullAdmin=primaryQ.data===true||Boolean(userQ.data?.is_system_admin);
      const keys=new Set((capsQ.data||[]).map(row=>row.capability_key));
      const allowed=hasSectionAccess(definition,keys,fullAdmin);
      if(!allowed){
        if(alive)setState({loading:false,allowed:false,data:null,error:'هذا القسم خارج الصلاحيات الممنوحة لهذا الحساب.'});
        return;
      }
      try{
        const data=await loadPortalSectionData(definition.dataKind);
        if(alive)setState({loading:false,allowed:true,data,error:''});
      }catch(error){
        if(alive)setState({loading:false,allowed:true,data:null,error:error?.message||'تعذر قراءة بيانات القسم.'});
      }
    })();
    return()=>{alive=false;};
  },[definition]);

  if(!definition)return <ConstitutionPage><EmptyState title="قسم غير معروف" description="المسار المطلوب غير موجود في دستور منصة الأعمال."/></ConstitutionPage>;
  if(state.loading)return <ConstitutionPage><EmptyState title={`جارٍ تجهيز ${definition.label}`} description="نقرأ البيانات من مصادرها الأصلية وفق صلاحيات الحساب."/></ConstitutionPage>;
  if(!state.allowed)return <ConstitutionPage><Notice tone="warning">{state.error}</Notice></ConstitutionPage>;

  const data=state.data;
  return <ConstitutionPage>
    {state.error&&<Notice tone="warning">تعذر تحميل البيانات الحالية: {state.error}</Notice>}
    {data?.summary?.length?<Section title="الملخص" description={definition.description}><SummaryStrip items={data.summary}/></Section>:null}
    <Section title={definition.label} description="هذه مساحة بيانات فعلية مبنية على المصادر الموجودة في النظام؛ عمليات الإدخال والتحرير ستدخل مسرحها المستقل عند تفعيلها.">
      {data?.rows?.length?(
        <TableFrame>
          <table>
            <thead><tr>{(data.columns||[]).map((column,index)=><th key={`${column}-${index}`}>{column}</th>)}</tr></thead>
            <tbody>{data.rows.map((row,rowIndex)=><tr key={rowIndex}>{row.map((cell,cellIndex)=><td key={cellIndex}>{cell??'—'}</td>)}</tr>)}</tbody>
          </table>
        </TableFrame>
      ):<EmptyState title="لا توجد بيانات مسجلة" description="القسم جاهز ويقرأ من قاعدة البيانات، لكن لا توجد سجلات مطابقة حاليًا."/>}
    </Section>
    {data?.note?<Notice tone="neutral">{data.note}</Notice>:null}
  </ConstitutionPage>;
}
