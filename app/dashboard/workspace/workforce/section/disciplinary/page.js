'use client';

import { useEffect,useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ConstitutionPage,Section,EmptyState,Notice } from '@/components/ui/ConstitutionUI';
import DisciplinaryActionsTable from '@/components/workforce/DisciplinaryActionsTable';

export default function DisciplinarySectionPage(){
  const [state,setState]=useState({loading:true,allowed:false,error:''});
  useEffect(()=>{let alive=true;(async()=>{
    const session=(await supabase.auth.getSession()).data.session;
    if(!session){if(alive)setState({loading:false,allowed:false,error:'يلزم تسجيل الدخول.'});return;}
    const [capsQ,primaryQ,userQ]=await Promise.all([
      supabase.from('v_my_capabilities').select('capability_key'),supabase.rpc('fn_is_primary_user'),supabase.from('app_users').select('is_system_admin').eq('id',session.user.id).maybeSingle(),
    ]);
    const keys=new Set((capsQ.data||[]).map(r=>r.capability_key));
    const allowed=primaryQ.data===true||Boolean(userQ.data?.is_system_admin)||keys.has('hr.disciplinary.view');
    if(alive)setState({loading:false,allowed,error:allowed?'':'هذا القسم خارج الصلاحيات الممنوحة لهذا الحساب.'});
  })();return()=>{alive=false;};},[]);
  if(state.loading)return <ConstitutionPage><EmptyState title="جارٍ تجهيز العلاقات والإجراءات" description="نقرأ المعاملات ومساراتها الحالية."/></ConstitutionPage>;
  if(!state.allowed)return <ConstitutionPage><Notice tone="warning">{state.error}</Notice></ConstitutionPage>;
  return <ConstitutionPage>
    <Section title="العلاقات والإجراءات" description="كل معاملة تعرض في نفس السطر حالتها التشغيلية وموقع الإجراء الحالي. زر «إجراء» يقرأ الخيارات من دستور حركة المعاملات في بوابة الإدارة.">
      <DisciplinaryActionsTable/>
    </Section>
  </ConstitutionPage>;
}
