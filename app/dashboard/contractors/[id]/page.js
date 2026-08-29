'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { money } from '@/lib/format';
import { CHARGE_AR } from '@/lib/projects';
import { ConstitutionPage, PageHeader, Section, SummaryStrip, TableFrame, EmptyState, Notice, Toolbar } from '@/components/ui/ConstitutionUI';

const KIND_AR={sub_company:'شركة باطن',labor_contractor:'مقاول أنفار',supplier:'مورد مواد',equipment:'مؤجر معدات'};

export default function ContractorDetail(){
  const {id}=useParams();
  const [state,setState]=useState({loading:true,contractor:null,projects:[],account:[],error:''});

  useEffect(()=>{
    let alive=true;
    (async()=>{
      const [contractorQ,projectsQ,accountQ]=await Promise.all([
        supabase.from('contractors').select('*').eq('id',id).maybeSingle(),
        supabase.from('project_contractors').select('project_id,is_active,start_date,end_date,projects(id,project_no,name_ar,status)').eq('contractor_id',id).order('start_date',{ascending:false}),
        supabase.from('v_contractor_account').select('*').eq('contractor_id',id),
      ]);
      if(!alive)return;
      const error=contractorQ.error||projectsQ.error||accountQ.error;
      setState({loading:false,contractor:contractorQ.data||null,projects:projectsQ.data||[],account:accountQ.data||[],error:error?.message||''});
    })();
    return()=>{alive=false;};
  },[id]);

  if(state.loading)return <ConstitutionPage><EmptyState title="جارٍ تحميل المقاول"/></ConstitutionPage>;
  if(!state.contractor)return <ConstitutionPage><Notice tone="warning">{state.error||'لم يُعثر على المقاول أو لا تملك صلاحية عرضه.'}</Notice></ConstitutionPage>;
  const c=state.contractor;
  const balance=state.account.reduce((sum,row)=>sum+Number(row.balance_before_works||0),0);

  return <ConstitutionPage>
    <PageHeader eyebrow="CONTRACTOR" title={c.name_ar} description={`${c.contractor_no||'—'} · ${KIND_AR[c.kind]||c.kind||'مقاول'}`} actions={<Toolbar><Link className="btn ghost" href="/dashboard/contractors">سجل المقاولين</Link><Link className="btn" href={`/dashboard/labor?contractor=${c.id}`}>العمالة</Link></Toolbar>}/>
    {state.error&&<Notice tone="warning">تعذر تحميل جزء من البيانات المرتبطة: {state.error}</Notice>}
    <Section title="ملخص المقاول">
      <SummaryStrip items={[
        {key:'status',label:'الحالة',value:c.is_active?'نشط':'غير نشط'},
        {key:'basis',label:'أساس التعاقد',value:c.default_basis||'—'},
        {key:'worker',label:'يومية العامل',value:c.worker_daily?money(c.worker_daily):'—'},
        {key:'tech',label:'يومية الصنايعي',value:c.tech_daily?money(c.tech_daily):'—'},
        {key:'balance',label:'الرصيد المسجل',value:money(balance)},
      ]}/>
    </Section>
    <Section title="بيانات التواصل والاتفاق">
      <TableFrame><table><tbody>
        <tr><th>مسؤول التواصل</th><td>{c.contact_name||'—'}</td><th>الجوال</th><td dir="ltr">{c.mobile||'—'}</td></tr>
        <tr><th>التخصصات</th><td>{c.specialties||'—'}</td><th>التقييم</th><td>{c.rating?`${c.rating}/5`:'—'}</td></tr>
        <tr><th>السكن على</th><td>{CHARGE_AR[c.housing_charge_to]||'—'}</td><th>النقل على</th><td>{CHARGE_AR[c.transport_charge_to]||'—'}</td></tr>
        <tr><th>الوجبات على</th><td>{CHARGE_AR[c.meals_charge_to]||'—'}</td><th>العدد والأدوات على</th><td>{CHARGE_AR[c.tools_charge_to]||'—'}</td></tr>
      </tbody></table></TableFrame>
    </Section>
    <Section title="المشاريع المرتبطة" description={`${state.projects.length} ارتباط`}>
      {!state.projects.length?<EmptyState title="لا توجد مشاريع مرتبطة"/>:<TableFrame><table><thead><tr><th>المشروع</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>{state.projects.map(link=><tr key={`${link.project_id}-${link.start_date||''}`}><td><strong>{link.projects?.project_no||'—'}</strong><div className="hint">{link.projects?.name_ar||'—'}</div></td><td>{link.is_active?'نشط':'منتهٍ'}</td><td>{link.projects?.id?<Link className="btn ghost" href={`/dashboard/projects/${link.projects.id}`}>فتح المشروع</Link>:'—'}</td></tr>)}</tbody></table></TableFrame>}
    </Section>
  </ConstitutionPage>;
}
