'use client';

import Link from 'next/link';
import SafeAreaEditor from '@/components/print/SafeAreaEditor';
import { ConstitutionPage, PageHeader, Section } from '@/components/ui/ConstitutionUI';

export default function PageGeometrySettingsPage() {
  return (
    <ConstitutionPage>
      <PageHeader
        eyebrow="الإعدادات"
        title="المساحات الآمنة للصفحة"
        description="أربع قيم تحددها مرة واحدة، وتسري على كل مطبوعات البرنامج: عروض الأسعار، الخطابات، السندات، المسيرات والتقارير."
      />
      <Section
        title="حدود المحتوى على ورقة A4"
        description="القيم بالمليمتر من حافة الورقة. المستند الواحد يمكنه تثبيت هوامش خاصة به من شاشة طباعته، وغير ذلك يتبع هذه القيم."
        boundary
      >
        <SafeAreaEditor />
        <div style={{ padding: '0 16px 16px' }}>
          <Link className="btn ghost" href="/dashboard/settings">العودة إلى الإعدادات</Link>
        </div>
      </Section>
    </ConstitutionPage>
  );
}
