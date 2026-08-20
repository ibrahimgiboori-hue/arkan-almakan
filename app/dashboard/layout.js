'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import FormBuilderResizeOverlay from '@/components/formbuilder/FormBuilderResizeOverlay';
import VacancyTargetingPanel from '@/components/recruitment/VacancyTargetingPanel';
import styles from './dashboard-redesign.module.css';

const AREAS = [
  {
    key: 'home',
    label: 'اليوم',
    href: '/dashboard',
    items: [
      { href: '/dashboard', label: 'مركز القيادة' },
    ],
  },
  {
    key: 'projects',
    label: 'المشاريع',
    href: '/dashboard/projects',
    items: [
      { href: '/dashboard/projects', label: 'المشاريع' },
      { href: '/dashboard/site-operations', label: 'التشغيل اليومي', hidden: true },
      { href: '/dashboard/site-operations/reports', label: 'تقارير التايم شيت' },
      { href: '/dashboard/site-operations/data-safety', label: 'سلامة بيانات التشغيل' },
      { href: '/dashboard/quotes', label: 'عروض الأسعار' },
      { href: '/dashboard/contractors', label: 'المقاولون' },
      { href: '/dashboard/entities', label: 'العملاء والجهات' },
    ],
  },
  {
    key: 'workforce',
    label: 'القوى العاملة',
    href: '/dashboard/employees',
    items: [
      { href: '/dashboard/employees', label: 'الموظفون' },
      { href: '/dashboard/recruitment', label: 'التوظيف والمرشحون' },
      { href: '/dashboard/recruitment/offers', label: 'العروض الوظيفية' },
      { href: '/dashboard/recruitment/contracts', label: 'مسودات العقود' },
      { href: '/dashboard/recruitment/onboarding', label: 'المباشرة والتهيئة' },
      { href: '/dashboard/leaves', label: 'الإجازات' },
    ],
  },
  {
    key: 'finance',
    label: 'المالية',
    href: '/dashboard/advances',
    items: [
      { href: '/dashboard/advances', label: 'السلف والمديونيات' },
      { href: '/dashboard/approvals', label: 'سجل الاعتمادات' },
    ],
  },
  {
    key: 'documents',
    label: 'المستندات',
    href: '/dashboard/documents',
    items: [
      { href: '/dashboard/documents', label: 'النماذج والمستندات' },
      { href: '/dashboard/archive', label: 'الأرشيف' },
      { href: '/dashboard/register', label: 'الصادر والوارد' },
      { href: '/dashboard/formbuilder', label: 'محرر النماذج' },
    ],
  },
  {
    key: 'admin',
    label: 'الإدارة',
    href: '/dashboard/board',
    items: [
      { href: '/dashboard/board', label: 'مجلس الإدارة' },
      { href: '/dashboard/settings', label: 'بيانات الشركة' },
      { href: '/dashboard/system-user', label: 'مستخدم النظام' },
      { href: '/dashboard/org-structure', label: 'الهيكل التنظيمي' },
      { href: '/dashboard/backup', label: 'النسخ الاحتياطي' },
    ],
  },
];

const QUICK_ACTIONS = [
  { label: 'إضافة موظف', href: '/dashboard/employees/new', meta: 'قوى عاملة' },
  { label: 'فتح المشاريع', href: '/dashboard/projects', meta: 'مشاريع' },
  { label: 'إنشاء مستند', href: '/dashboard/documents', meta: 'مستندات' },
  { label: 'فتح عروض الأسعار', href: '/dashboard/quotes', meta: 'مشاريع' },
];

function matchesPath(pathname, href) {
  if (pathname === href) return true;
  if (href === '/dashboard') return false;
  return pathname.startsWith(href + '/');
}

function activeItemFor(pathname) {
  return AREAS.flatMap((area) => area.items.map((item) => ({ ...item, area })))
    .filter((item) => matchesPath(pathname, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0] || null;
}

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace('/login');
        return;
      }
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

  useEffect(() => {
    function onKeyDown(event) {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === 'Escape') {
        setCommandOpen(false);
        setMobileOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  const current = activeItemFor(pathname);
  const activeArea = current?.area || AREAS[0];
  const currentLabel = current?.label || activeArea.label;
  const contextItems = activeArea.items.filter((item) => item.href !== activeArea.href && !item.hidden);
  const flatItems = useMemo(() => AREAS.flatMap((area) =>
    area.items.filter((item) => !item.hidden).map((item) => ({ ...item, meta: area.label }))), []);

  const results = useMemo(() => {
    const q = commandQuery.trim().toLowerCase();
    const all = [...QUICK_ACTIONS, ...flatItems];
    const unique = all.filter((item, index) => all.findIndex((candidate) => candidate.href === item.href) === index);
    if (!q) return unique.slice(0, 9);
    return unique.filter((item) =>
      `${item.label} ${item.meta || ''}`.toLowerCase().includes(q)).slice(0, 12);
  }, [commandQuery, flatItems]);

  function go(href) {
    setCommandOpen(false);
    setMobileOpen(false);
    setCommandQuery('');
    router.push(href);
  }

  if (!ready) return (
    <div className={styles.loadingScreen}>
      <div className={styles.loadingBox} aria-label="جارٍ تحميل النظام">
        <div className={styles.loadingBar} />
        <div className={styles.loadingBar} />
      </div>
    </div>
  );

  if (!me?.is_active || !me?.role) return (
    <div className="login-wrap"><div className="login">
      <div className="msg err">حسابك غير مهيأ لاستخدام النظام حاليًا.</div>
      <button className="btn ghost" style={{width:'100%',marginTop:14,justifyContent:'center'}} onClick={signOut}>خروج</button>
    </div></div>
  );

  const emp = me.employees;
  const accessLabel = me.is_system_admin ? 'مدير النظام' : 'مستخدم النظام';
  const userLabel = emp?.full_name_ar || me.email;
  const displayDate = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date());

  const primaryAction = activeArea.key === 'workforce'
    ? { label: 'إضافة موظف', href: '/dashboard/employees/new' }
    : activeArea.key === 'documents'
      ? { label: 'إنشاء مستند', href: '/dashboard/documents' }
      : activeArea.key === 'projects'
        ? null
        : activeArea.key === 'finance'
          ? { label: 'السلف والمديونيات', href: '/dashboard/advances' }
          : activeArea.key === 'admin'
            ? { label: 'بيانات الشركة', href: '/dashboard/settings' }
            : { label: 'فتح المشاريع', href: '/dashboard/projects' };

  return (
    <div className={styles.root}>
      <header className={styles.globalBar}>
        <button className={styles.mobileMenuButton} onClick={() => setMobileOpen(true)} aria-label="فتح القائمة">≡</button>
        <Link href="/dashboard" className={styles.wordmark}>أركان المكان <small>OS</small></Link>

        <nav className={styles.primaryNav} aria-label="مساحات العمل الرئيسية">
          {AREAS.map((area) => (
            <Link
              key={area.key}
              href={area.href}
              className={`${styles.primaryLink} ${activeArea.key === area.key ? styles.primaryLinkActive : ''}`}
            >
              {area.label}
            </Link>
          ))}
        </nav>

        <button className={styles.commandButton} onClick={() => setCommandOpen(true)} aria-haspopup="dialog">
          <span>ابحث أو نفّذ أمرًا — «افتح مشروع»</span>
          <span className={styles.commandHint}>Ctrl K</span>
        </button>

        <div className={styles.globalEnd}>
          <Link href="/dashboard/approvals" className={styles.alertLink}>سجل الاعتمادات</Link>
          <div className={styles.userMenu}>
            <span className={styles.userAvatar}>مد</span>
            <div className={styles.userCopy}>
              <div className={styles.userName}>{userLabel}</div>
              <div className={styles.userRole}>{accessLabel}</div>
            </div>
          </div>
          <button className={styles.signOut} onClick={signOut}>خروج</button>
        </div>
      </header>

      <div className={styles.contextBar}>
        <div className={styles.contextIdentity}>
          <span className={styles.contextTitle}>{activeArea.label}</span>
          <span className={styles.contextCrumb}>{currentLabel} · {displayDate}</span>
        </div>

        {contextItems.length > 0 && (
          <nav className={styles.contextTabs} aria-label={`أدوات ${activeArea.label}`}>
            {contextItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.contextTab} ${matchesPath(pathname, item.href) ? styles.contextTabActive : ''}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}

        <div className={styles.contextActions}>
          {primaryAction && primaryAction.href !== pathname && (
            <Link className={styles.contextActionPrimary} href={primaryAction.href}>{primaryAction.label}</Link>
          )}
        </div>
      </div>

      <div className={pathname === '/dashboard' ? styles.homeContent : `page ${styles.legacyContent}`}>
        {pathname.startsWith('/dashboard/formbuilder/') && <FormBuilderResizeOverlay />}
        <VacancyTargetingPanel />
        {children}
      </div>

      {commandOpen && (
        <div className={styles.paletteBackdrop} onMouseDown={() => setCommandOpen(false)}>
          <div className={styles.palette} role="dialog" aria-modal="true" aria-label="البحث والأوامر" onMouseDown={(e) => e.stopPropagation()}>
            <div className={styles.paletteInputWrap}>
              <input
                autoFocus
                className={styles.paletteInput}
                value={commandQuery}
                onChange={(e) => setCommandQuery(e.target.value)}
                placeholder="ابحث عن مشروع، موظف، مستند أو إجراء…"
              />
              <span className={styles.paletteEsc}>ESC</span>
            </div>
            <div className={styles.paletteResults}>
              <div className={styles.paletteLabel}>{commandQuery ? 'النتائج' : 'وصول سريع'}</div>
              {results.length === 0 ? (
                <div className={styles.paletteEmpty}>لا توجد نتيجة مطابقة.</div>
              ) : results.map((item, index) => (
                <button key={`${item.href}-${index}`} className={styles.paletteResult} onClick={() => go(item.href)}>
                  <span className={styles.paletteResultTitle}>{item.label}</span>
                  <span className={styles.paletteResultMeta}>{item.meta}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {mobileOpen && (
        <div className={styles.mobileOverlay} onMouseDown={() => setMobileOpen(false)}>
          <aside className={styles.mobileDrawer} onMouseDown={(e) => e.stopPropagation()}>
            <div className={styles.mobileDrawerHead}>
              <strong>أركان المكان</strong>
              <button className={styles.mobileClose} onClick={() => setMobileOpen(false)} aria-label="إغلاق القائمة">×</button>
            </div>
            {AREAS.map((area) => (
              <section key={area.key} className={styles.mobileArea}>
                <Link href={area.href} onClick={() => setMobileOpen(false)} className={styles.mobileAreaTitle}>
                  <span>{area.label}</span><span>←</span>
                </Link>
                <div className={styles.mobileLinks}>
                  {area.items.filter((item) => item.href !== area.href && !item.hidden).map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`${styles.mobileLink} ${matchesPath(pathname, item.href) ? styles.mobileLinkActive : ''}`}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </aside>
        </div>
      )}
    </div>
  );
}
