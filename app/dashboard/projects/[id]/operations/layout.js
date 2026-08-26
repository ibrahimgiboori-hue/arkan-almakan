'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import styles from './operation-theater.module.css';

export default function OperationsLayout({ children }) {
  const { id } = useParams();
  const pathname = usePathname();
  const base = `/dashboard/projects/${id}/operations`;
  const isAttendance = pathname === base || pathname === `${base}/`;
  const isExpenses = pathname === `${base}/expenses` || pathname === `${base}/expenses/`;
  const isTheater = isAttendance || isExpenses;

  if (!isTheater) return <section data-operation-shell="true">{children}</section>;

  return (
    <section className={styles.theater} data-operation-shell="true" data-focus-theater="true">
      <header className={styles.focusBar}>
        <div className={styles.identity}>
          <Link href="/dashboard/workspace" className={styles.back}>← منصة الأعمال</Link>
          <div>
            <span>مسرح العمليات</span>
            <strong>الحضور والمصروفات</strong>
          </div>
        </div>
        <nav className={styles.tabs} aria-label="أدوات مسرح العمليات">
          <Link href={base} className={isAttendance ? styles.activeTab : styles.tab} aria-current={isAttendance ? 'page' : undefined}>
            <span className={styles.dot} /> الحضور
          </Link>
          <Link href={`${base}/expenses`} className={isExpenses ? styles.activeTab : styles.tab} aria-current={isExpenses ? 'page' : undefined}>
            <span className={styles.dot} /> المصروفات
          </Link>
        </nav>
      </header>
      <main className={styles.stage}>{children}</main>
    </section>
  );
}
