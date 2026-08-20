'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import styles from './operations-shell.module.css';

const TABS = [
  { path:'', label:'الحضور' },
  { path:'/output', label:'الإنجاز اليومي' },
  { path:'/expenses', label:'المصروفات' },
  { path:'/custody', label:'العهدة' },
  { path:'/finance', label:'السلف والدفعات' },
  { path:'/movements', label:'حركات اليوم' },
];

export default function OperationsLayout({ children }) {
  const { id } = useParams();
  const pathname = usePathname();
  const base = `/dashboard/projects/${id}/operations`;

  return <section className={styles.shell}>
    <nav className={styles.localNav} aria-label="أقسام التشغيل اليومي">
      <div className={styles.navIdentity}><span>OPERATIONS</span><strong>تشغيل المشروع</strong></div>
      <div className={styles.tabs}>
        {TABS.map((tab) => {
          const href = `${base}${tab.path}`;
          const active = tab.path ? pathname.startsWith(href) : pathname === base;
          return <Link key={tab.path || 'attendance'} href={href} className={active ? styles.active : ''}>{tab.label}</Link>;
        })}
      </div>
    </nav>
    <div className={styles.content}>{children}</div>
  </section>;
}
