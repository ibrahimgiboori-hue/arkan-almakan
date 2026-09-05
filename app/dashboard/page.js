'use client';

import Link from 'next/link';
import { AREAS } from '@/lib/app-constitution';
import { filterAreasForAccess } from '@/lib/access-ui';
import { useDashboardSession } from '@/lib/dashboard-session-context';
import styles from './portal-hall.module.css';

const PORTAL_META = Object.freeze({
  projects: {
    title: 'المشاريع',
    description: 'العقود والنطاق والتنفيذ والتكلفة والمستخلصات وكل ما يخص المشروع من لحظة دخوله حتى إقفاله.',
  },
  workforce: {
    title: 'الموارد البشرية',
    description: 'الموظفون والحضور والإجازات والتوظيف والعقود وكل ما يخص دورة حياة الشخص داخل المنشأة.',
  },
  finance: {
    title: 'المالية',
    description: 'السلف والمصروفات والعهد والميزانية والاعتمادات المالية وما يترتب عليها من حركة ومتابعة.',
  },
  documents: {
    title: 'المستندات',
    description: 'النماذج والمحرر والأرشيف والصادر والوارد والمستندات التي تثبت العمل وتتحرك بين البوابات.',
  },
  admin: {
    title: 'الإدارة',
    description: 'إدارة الدخول والهيكل التنظيمي وبيانات المنشأة ومجلس الإدارة والأدوات العامة للنظام.',
  },
});

export default function Dashboard() {
  const me = useDashboardSession();
  const portals = filterAreasForAccess(AREAS, me?.access || {})
    .filter((area) => area.key !== 'home')
    .map((area) => ({
      ...area,
      ...(PORTAL_META[area.key] || { title:area.label, description:'' }),
    }));

  return (
    <section className={styles.hall} data-portal-hall="true" aria-labelledby="portal-hall-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>أركان المكان</p>
          <h1 id="portal-hall-title">بوابات العمل</h1>
          <p className={styles.intro}>اختر المكان الذي تريد العمل داخله. القوائم تبدأ بعد دخول البوابة، ولا تعيد وصف ما هو موجود أمامك.</p>
        </div>

        <nav className={styles.personal} aria-label="منظور العمل الشخصي">
          <Link href="/dashboard/my-work">أعمالي</Link>
          {me?.access?.approvals ? <Link href="/dashboard/my-work/approvals">بانتظار قراري</Link> : null}
        </nav>
      </header>

      <div className={styles.portals} role="list" aria-label="البوابات المتاحة">
        {portals.map((portal, index) => (
          <Link
            key={portal.key}
            href={portal.href}
            className={styles.portal}
            role="listitem"
            data-portal-key={portal.key}
          >
            <span className={styles.number} aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <span className={styles.copy}>
              <strong>{portal.title}</strong>
              {portal.description ? <small>{portal.description}</small> : null}
            </span>
            <span className={styles.enter} aria-hidden="true">دخول</span>
          </Link>
        ))}
      </div>

      {portals.length === 0 ? (
        <p className={styles.empty}>لا توجد بوابات متاحة لهذا الحساب حاليًا.</p>
      ) : null}
    </section>
  );
}
