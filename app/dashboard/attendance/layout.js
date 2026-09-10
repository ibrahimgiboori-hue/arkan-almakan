'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href:'/dashboard/attendance', label:'معمل الحضور' },
  { href:'/dashboard/attendance/external-review', label:'المراجعة الخارجية' },
];

export default function AttendanceLayout({ children }) {
  const pathname = usePathname();

  return <>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'0 0 16px',padding:'10px 12px',border:'1px solid rgba(148,163,184,.24)',borderRadius:14,background:'rgba(255,255,255,.72)'}}>
      {ITEMS.map((item) => {
        const active = item.href === '/dashboard/attendance'
          ? pathname === item.href
          : pathname?.startsWith(item.href);
        return <Link
          key={item.href}
          href={item.href}
          className={active ? 'btn' : 'btn ghost'}
          style={{textDecoration:'none'}}
          aria-current={active ? 'page' : undefined}
        >{item.label}</Link>;
      })}
    </div>
    {children}
  </>;
}
