'use client';

import { useDashboardSession } from '@/lib/dashboard-session-context';
import { ConstitutionPage,Section,Notice } from '@/components/ui/ConstitutionUI';
import DisciplinaryActionsTable from '@/components/workforce/DisciplinaryActionsTable';

export default function DisciplinarySectionPage(){
  const me=useDashboardSession();
  const allowed=Boolean(me?.access?.fullAdmin)||me?.capabilityKeys?.has('hr.disciplinary.view');
  if(!allowed)return <ConstitutionPage><Notice tone="warning">هذا القسم خارج الصلاحيات الممنوحة لهذا الحساب.</Notice></ConstitutionPage>;
  return <ConstitutionPage>
    <Section title="الإجراءات التأديبية" description="إنشاء الإجراء وتوثيق المخالفة ومتابعة حالته من سجل واحد. قرار الاعتماد يبقى في مركز الاعتمادات.">
      <DisciplinaryActionsTable/>
    </Section>
  </ConstitutionPage>;
}
