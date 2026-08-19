'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import FormBuilderResizeOverlay from '@/components/formbuilder/FormBuilderResizeOverlay';
import VacancyTargetingPanel from '@/components/recruitment/VacancyTargetingPanel';

const NAV = [
  { group: 'الموارد البشرية', items: [
    { href: '/dashboard', label: 'لوحة المتابعة' },
    { href: '/dashboard/employees', label: 'الموظفون' },
    { href: '/dashboard/recruitment', label: 'التوظيف والمرشحون' },
    { href: '/dashboard/recruitment/offers', label: 'العروض الوظيفية' },
    { href: '/dashboard/recruitment/contracts', label: 'مسودات عقود العمل' },
    { href: '/dashboard/recruitment/onboarding', label: 'المباشرة والتهيئة' },
    { href: '/dashboard/board', label: 'مجلس الإدارة' },
    { href: '/dashboard/leaves', label: 'الإجازات' },
    { href: '/dashboard/advances', label: 'السلف والمديونيات' },
  ]},
  { group: 'المشاريع والتسعير', items: [
    { href: '/dashboard/entities', label: 'العملاء والجهات' },
    { href: '/dashboard/projects', label: 'المشاريع' },
    { href: '/dashboard/quotes', label: 'عروض الأسعار وجداول الكميات' },
    { href: '/dashboard/contractors', label: 'المقاولون' },
  ]},
  { group: 'التنفيذ', items: [
    { href: '/dashboard/site-operations', label: 'تشغيل الموقع' },
    { href: '/dashboard/timesheet', label: 'التايم شيت' },
    { href: '/dashboard/timesheet/settlement', label: 'تسوية المقاولين' },
    { href: '/dashboard/labor', label: 'الأيدي العاملة' },
    { href: '/dashboard/expenses', label: 'مصروفات وحسابات المقاولين' },
  ]},
  { group: 'المستندات', items: [
    { href: '/dashboard/archive', label: 'الأرشيف' },
    { href: '/dashboard/register', label: 'الصادر والوارد' },
    { href: '/dashboard/documents', label: 'النماذج والمستندات' },
    { href: '/dashboard/approvals', label: 'سجل الاعتمادات' },
    { href: '/dashboard/formbuilder', label: 'محرر النماذج' },
  ]},
  { group: 'الإعدادات', items: [
    { href: '/dashboard/settings', label: 'بيانات الشركة' },
    { href: '/dashboard/system-user', label: 'مستخدم النظام' },
    { href: '/dashboard/org-structure', label: 'الهيكل التنظيمي' },
    { href: '/dashboard/backup', label: 'النسخ الاحتياطي' },
  ]},
];

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace('/login'); return; }
      const { data: row } = await supabase
        .from('app_users')
        .select('role, is_active, is_system_admin, employees(full_name_ar, employee_no, job_title)')
        .eq('id', data.session.user.id)
        .maybeSingle();
      if (!alive) return;
      setMe({ email: data.session.user.email, ...row });
      setReady(true);
    })();
    return () => { alive = false; };
  }, [router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  if (!ready) return <div className="empty">جارٍ التحميل</div>;

  if (!me?.is_active || !me?.role) return (
    <div className="login-wrap"><div className="login">
      <div className="msg err">حسابك غير مهيأ لاستخدام النظام حاليًا.</div>
      <button className="btn ghost" style={{width:'100%',marginTop:14,justifyContent:'center'}} onClick={signOut}>خروج</button>
    </div></div>
  );

  const emp = me.employees;
  const accessLabel = me.is_system_admin ? 'مدير النظام' : 'مستخدم النظام';

  const isOn = (href) => {
    if (pathname === href) return true;
    if (href === '/dashboard') return false;
    if (!pathname.startsWith(href + '/')) return false;
    const deeper = NAV.flatMap((g) => g.items.map((i) => i.href))
      .filter((h) => h !== href && h.startsWith(href + '/'));
    return !deeper.some((h) => pathname === h || pathname.startsWith(h + '/'));
  };

  return (
    <div className="shell">
      <aside className="side">
        <div className="side-head"><div className="name">أركان المكان</div><div className="sub">النظام الإداري</div></div>
        <nav className="nav">
          {NAV.map((g)=><div key={g.group}>
            <div className="nav-group">{g.group}</div>
            {g.items.map((it)=><Link key={it.href} href={it.href} className={isOn(it.href)?'on':''}>{it.label}</Link>)}
          </div>)}
        </nav>
        <div className="side-foot">
          <div className="who">{emp?.full_name_ar || me.email}</div>
          <div className="role">{accessLabel}</div>
          <button onClick={signOut}>خروج</button>
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <span className="crumb">شركة أركان المكان للمقاولات</span>
          <span className="crumb mono">{new Date().toLocaleDateString('ar-SA-u-ca-gregory')}</span>
        </div>
        <div className="page">
          {pathname.startsWith('/dashboard/formbuilder/') && <FormBuilderResizeOverlay />}
          <VacancyTargetingPanel />
          {children}
        </div>
      </div>
    </div>
  );
}
