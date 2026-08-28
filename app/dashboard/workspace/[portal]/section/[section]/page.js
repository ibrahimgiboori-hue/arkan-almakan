'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { portalSectionDefinition } from '@/lib/portal-section-constitution';
import { loadPortalSectionData } from '@/lib/portal-section-data';
import { INVOICE_POLICY } from '@/lib/invoice-policy';
import { ConstitutionPage, Section, SummaryStrip, TableFrame, EmptyState, Notice } from '@/components/ui/ConstitutionUI';
import ApprovalGuidanceList from '@/components/approval/ApprovalGuidanceList';
import ProcedureRouteMatrix from '@/components/admin/ProcedureRouteMatrix';
import WorkforceOperationalSection from '@/components/workforce/WorkforceOperationalSection';

const WORKFORCE_OPERATIONAL_KINDS=new Set(['hr-payroll','hr-compliance','hr-end-service','hr-performance']);

function hasSectionAccess(definition, capabilityKeys, fullAdmin){
  if(fullAdmin)return true;
  if(!definition?.capabilities?.length)return true;
  return definition.capabilities.some(key=>capabilityKeys.has(key));
}

function date(value){return value?new Date(value).toLocaleDateString('ar-SA'):'—';}

async function loadAdminCatalogs(){
  const [{data:sequences,error:sErr},{data:clauses,error:cErr}]=await Promise.all([
    supabase.from('number_sequences').select('doc_type,year,prefix,last_number').order('doc_type'),
    supabase.from('contract_clause_library').select('code,title,category,is_active,risk_level,updated_at').order('sort_order').limit(150),
  ]);
  if(sErr)throw sErr;if(cErr)throw cErr;
  const rows=[
    ...(sequences||[]).map(row=>['تسلسل',row.doc_type||'—',row.year||'—',row.prefix||'—',row.last_number??'—']),
    ...(clauses||[]).map(row=>['بند عقد',row.title||row.code||'—',row.category||'—',row.is_active===false?'غير نشط':'نشط',row.risk_level||date(row.updated_at)]),
  ];
  return {
    columns:['النوع','الاسم','السنة / التصنيف','البادئة / الحالة','آخر رقم / المخاطر'],
    rows,
    summary:[
      {key:'seq',label:'التسلسلات',value:(sequences||[]).length,note:'ترقيم تلقائي'},
      {key:'clauses',label:'بنود العقود',value:(clauses||[]).length,note:'في المكتبة'},
      {key:'active',label:'بنود نشطة',value:(clauses||[]).filter(row=>row.is_active!==false).length,note:'متاحة للاستخدام'},
    ],
    note:'هذه القيم مرجعية للنظام؛ تعديلها لاحقًا سيدخل مسرح إدخال مستقل مع حفظ أثر التغيير.',
  };
}

async function loadSection(definition){
  if(definition?.dataKind==='admin-procedure-routes')return {custom:'procedure-routes'};
  if(definition?.dataKind==='admin-catalogs')return loadAdminCatalogs();
  if(WORKFORCE_OPERATIONAL_KINDS.has(definition?.dataKind))return {custom:'workforce-operational'};
  return loadPortalSectionData(definition.dataKind);
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
        const data=await loadSection(definition);
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

  if(definition.dataKind==='admin-procedure-routes')return <ConstitutionPage>
    <Section title="دستور حركة المعاملات" description="كل سطر عملية فعلية في البرنامج. حدّد هل تحتاج إجراءً، هل تصعد داخل بوابتها، وما مجال الجهات التي تستطيع «سنارة الإجراء» عرضها للمستخدم أثناء المعاملة.">
      <ProcedureRouteMatrix/>
    </Section>
    <Notice tone="neutral">أي قدرة جديدة تضاف إلى محرك الصلاحيات ستظهر تلقائيًا هنا كعملية غير مصنفة. لا توجد قائمة موازية تحتاج تحديثًا يدويًا.</Notice>
  </ConstitutionPage>;

  if(state.data?.custom==='workforce-operational')return <ConstitutionPage>
    <Section title={definition.label} description={definition.description}>
      <WorkforceOperationalSection dataKind={definition.dataKind}/>
    </Section>
  </ConstitutionPage>;

  const data=state.data;
  const isInvoiceSection=definition.dataKind==='finance-invoices';
  return <ConstitutionPage>
    {state.error&&<Notice tone="warning">تعذر تحميل البيانات الحالية: {state.error}</Notice>}
    {isInvoiceSection&&<Notice tone="warning"><strong>{INVOICE_POLICY.preliminaryLabel}:</strong> {INVOICE_POLICY.preliminaryNotice.replace(`${INVOICE_POLICY.preliminaryLabel} — `,'')}</Notice>}
    {data?.summary?.length?<Section title="الملخص" description={definition.description}><SummaryStrip items={data.summary}/></Section>:null}
    <Section title={definition.label} description={isInvoiceSection?'هذه المساحة لمتابعة طلبات إصدار الفاتورة الضريبية وتسجيل الفاتورة الصادرة من نظام الفوترة المعتمد والتحصيل؛ لا تصدر فاتورة ضريبية رسمية من أركان المكان.':'هذه مساحة بيانات فعلية مبنية على المصادر الموجودة في النظام؛ وإذا احتاجت معاملة اعتمادًا أو إجراءً يظهر المسؤول والملاحظة والإجراء بجانبها مباشرة.'}>
      <ApprovalGuidanceList dataKind={definition.dataKind}/>
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
