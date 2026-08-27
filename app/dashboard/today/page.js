'use client';

import Link from 'next/link';
import { ConstitutionPage, PageHeader } from '@/components/ui/ConstitutionUI';
import MyWorkPage from '../my-work/page';

export default function TodayPage(){
  return <ConstitutionPage>
    <PageHeader
      eyebrow="TODAY"
      title="اليوم"
      description="مساحتك الشخصية وتواصل العمل اليومي: مهام، توجيهات ومراسلات بين الزملاء والإدارات. الإجراءات والاعتمادات النظامية مكانها الثابت داخل بوابات منصة الأعمال."
      actions={<Link className="btn" href="/dashboard/workspace">منصة الأعمال ←</Link>}
    />

    <div id="my-work" style={{scrollMarginTop:120}}>
      <MyWorkPage />
    </div>
  </ConstitutionPage>;
}
