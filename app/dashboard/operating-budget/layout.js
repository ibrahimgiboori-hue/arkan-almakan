'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

export default function OperatingBudgetLayout({ children }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const month = searchParams.get('month');
  const suffix = month ? `?month=${encodeURIComponent(month)}` : '';
  const analysisActive = pathname === '/dashboard/operating-budget/analysis';

  return <div data-operating-budget-world="true">
    <nav
      aria-label="ميزانية وتشغيل الشركة"
      style={{
        display:'flex',
        gap:6,
        alignItems:'center',
        padding:'7px 0 10px',
        marginBottom:4,
        borderBottom:'1px solid var(--raw-border, #ddd)',
      }}
    >
      <Link
        className={`btn ghost${!analysisActive ? ' active' : ''}`}
        aria-current={!analysisActive ? 'page' : undefined}
        href={`/dashboard/operating-budget${suffix}`}
      >تشغيل الميزانية</Link>
      <Link
        className={`btn ghost${analysisActive ? ' active' : ''}`}
        aria-current={analysisActive ? 'page' : undefined}
        href={`/dashboard/operating-budget/analysis${suffix}`}
      >قراءة الشهر</Link>
    </nav>
    {children}
  </div>;
}
