'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { PROJECT_NAV_GROUPS, projectNavigationHref } from '@/lib/app-constitution';
import styles from './sheet-tabs.module.css';

// أوراق اليوم في مصنف المشروع: كل أداة تشغيل يومية ورقة، والتنقل بينها من تبويبات
// أسفل الشاشة مثل إكسل. التاريخ والمقاول محفوظان في سياق المشروع فيبقيان كما هما بين الأوراق.
export const PROJECT_DAY_SHEETS = Object.freeze(
  PROJECT_NAV_GROUPS
    .flatMap((group) => group.items)
    .filter((item) => typeof item.suffix === 'string' && item.suffix.startsWith('/operations') && item.key !== 'timesheet-reports'),
);

export default function ProjectSheetTabs() {
  const { id: projectId } = useParams();
  const pathname = usePathname() || '';
  if (!projectId) return null;
  const hrefs = PROJECT_DAY_SHEETS.map((item) => projectNavigationHref(projectId, item));
  const activeIndex = hrefs.reduce((best, href, index) => (
    (pathname === href || pathname.startsWith(`${href}/`)) && (best < 0 || href.length > hrefs[best].length) ? index : best
  ), -1);
  return (
    <nav className={styles.tabs} aria-label="أوراق اليوم في مصنف المشروع" data-workbook-tabs="true">
      {PROJECT_DAY_SHEETS.map((item, index) => (
        <Link
          key={item.key}
          href={hrefs[index]}
          className={index === activeIndex ? styles.active : styles.tab}
          aria-current={index === activeIndex ? 'page' : undefined}
          prefetch={false}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
