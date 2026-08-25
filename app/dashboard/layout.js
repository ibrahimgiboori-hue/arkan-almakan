'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  AREAS,
  QUICK_ACTIONS,
  AREA_PRIMARY_ACTIONS,
  activeConstitutionItem,
  matchesConstitutionPath,
} from '@/lib/app-constitution';
import { SYSTEM } from '@/lib/system-constitution';
import FormBuilderResizeOverlay from '@/components/formbuilder/FormBuilderResizeOverlay';
import VacancyTargetingPanel from '@/components/recruitment/VacancyTargetingPanel';
import styles from './dashboard-redesign.module.css';
import './constitution-content.css';

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

  const isProjectWorkspace = /^\/dashboard\/projects\/[^/]+$/.test(pathname);
  const current = activeConstitutionItem(pathname);
  const activeArea = current?.area || AREAS[0];
  const currentLabel = current?.label || activeArea.label;
  const contextItems = isProjectWorkspace
    ? []
    : activeArea.items.filter((item) => item.href !== activeArea.href && !item.hidden);
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
  const displayDate = new Intl.DateTimeFormat(`${SYSTEM.locale}-u-ca-${SYSTEM.calendar}`, {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: SYSTEM.timezone,
  }).format(new Date());

  const primaryAction = AREA_PRIMARY_ACTIONS[activeArea.key] || null;

  return (
    <div className={styles.root} data-ui-constitution="approved-v2">
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

      {!isProjectWorkspace && (
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
                  className={`${styles.contextTab} ${matchesConstitutionPath(pathname, item.href) ? styles.contextTabActive : ''}`}
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
      )}

      <div
        className={pathname === '/dashboard' ? styles.homeContent : 'page constitution-content'}
        data-content-governance={pathname === '/dashboard' ? 'native-approved' : 'compat-approved'}
      >
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
                      className={`${styles.mobileLink} ${matchesConstitutionPath(pathname, item.href) ? styles.mobileLinkActive : ''}`}
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
