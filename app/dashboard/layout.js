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
import { filterAreasForAccess } from '@/lib/access-ui';
import { SYSTEM } from '@/lib/system-constitution';
import FormBuilderResizeOverlay from '@/components/formbuilder/FormBuilderResizeOverlay';
import VacancyTargetingPanel from '@/components/recruitment/VacancyTargetingPanel';
import styles from './dashboard-redesign.module.css';
import './constitution-content.css';

const TODAY_HREF = '/dashboard/today';
const MY_WORK_HREF = '/dashboard/my-work';

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const isToday = pathname === TODAY_HREF;
  const isMyWork = pathname === MY_WORK_HREF || pathname.startsWith(`${MY_WORK_HREF}/`);
  const isProjectWorkspace = /^\/dashboard\/projects\/[^/]+(?:\/|$)/.test(pathname);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace('/login');
        return;
      }
      const [userQ, capabilitiesQ, primaryQ] = await Promise.all([
        supabase
          .from('app_users')
          .select('role, is_active, is_system_admin, must_change_password, employees(full_name_ar, employee_no, job_title)')
          .eq('id', data.session.user.id)
          .maybeSingle(),
        supabase.from('v_my_capabilities').select('capability_key,module_key,scope_type,scope_key'),
        supabase.rpc('fn_is_primary_user'),
      ]);
      if (!alive) return;
      const row = userQ.data || null;
      if (row?.must_change_password) {
        router.replace('/change-password');
        return;
      }
      const capabilities = capabilitiesQ.error ? [] : (capabilitiesQ.data || []);
      const capabilityKeys = new Set(capabilities.map((item) => item.capability_key));
      const fullAdmin = primaryQ.data === true || Boolean(row?.is_system_admin);
      const projectCaps = capabilities.filter((item) => item.module_key === 'projects');
      const projectsScreen = fullAdmin || projectCaps.some((item) => item.scope_type === 'all');
      const projectScoped = fullAdmin || projectCaps.length > 0;
      const access = {
        fullAdmin,
        projects: projectsScreen,
        projectsScreen,
        projectScoped,
        hr: fullAdmin || capabilities.some((item) => item.module_key === 'hr'),
        finance: fullAdmin || capabilities.some((item) => item.module_key === 'finance'),
        manageAccess: fullAdmin || capabilityKeys.has('system.access.manage_access'),
        approvals: fullAdmin || capabilityKeys.has('system.approvals.view'),
      };
      setMe({ email: data.session.user.email, ...row, capabilities, capabilityKeys, access });
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
        setUserMenuOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const visibleAreas = useMemo(() => me ? filterAreasForAccess(AREAS, me.access) : [], [me]);
  const current = activeConstitutionItem(pathname);

  useEffect(() => {
    if (!ready || !me?.is_active || !me?.role || me.access?.fullAdmin) return;
    if (pathname === '/dashboard') {
      router.replace(TODAY_HREF);
      return;
    }
    if (isToday || isMyWork) return;
    if (isProjectWorkspace && me.access?.projectScoped) return;
    const currentAreaKey = current?.area?.key;
    if (!currentAreaKey || !visibleAreas.some((area) => area.key === currentAreaKey)) {
      router.replace(TODAY_HREF);
    }
  }, [ready, me, pathname, current, visibleAreas, router, isToday, isMyWork, isProjectWorkspace]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  const activeArea = isToday
    ? { key: 'today', label: 'اليوم', href: TODAY_HREF, items: [] }
    : isMyWork
      ? { key: 'my-work', label: 'أعمالي', href: MY_WORK_HREF, items: [] }
      : current?.area && visibleAreas.some((area) => area.key === current.area.key)
        ? current.area
        : visibleAreas[0] || AREAS[0];
  const currentLabel = isToday ? 'مركزي الشخصي' : isMyWork ? 'مركز العمل الشخصي' : (current?.label || activeArea.label);

  const canUseFullArea = (areaKey) => Boolean(
    me?.access?.fullAdmin || (areaKey === 'projects' && me?.access?.projectsScreen)
  );
  const contextItems = isProjectWorkspace || isToday || isMyWork
    ? []
    : activeArea.items.filter((item) => item.href !== activeArea.href && !item.hidden && canUseFullArea(activeArea.key));
  const flatItems = useMemo(() => visibleAreas.flatMap((area) =>
    area.items
      .filter((item) => !item.hidden && (canUseFullArea(area.key) || item.href === area.href))
      .map((item) => ({ ...item, meta: area.label }))), [visibleAreas, me]);

  const results = useMemo(() => {
    const q = commandQuery.trim().toLowerCase();
    const personal = [
      ...(!me?.access?.fullAdmin ? [{ label: 'فتح اليوم', href: TODAY_HREF, meta: 'مركزي الشخصي' }] : []),
      { label: 'فتح أعمالي', href: MY_WORK_HREF, meta: 'المهام والمراسلات' },
    ];
    const quick = me?.access?.fullAdmin
      ? [...personal, ...QUICK_ACTIONS]
      : [...personal, ...visibleAreas.map((area) => ({ label:`فتح ${area.label}`, href:area.href, meta:area.label }))];
    const all = [...quick, ...flatItems];
    const unique = all.filter((item, index) => all.findIndex((candidate) => candidate.href === item.href) === index);
    if (!q) return unique.slice(0, 9);
    return unique.filter((item) => `${item.label} ${item.meta || ''}`.toLowerCase().includes(q)).slice(0, 12);
  }, [commandQuery, flatItems, me, visibleAreas]);

  function go(href) {
    setCommandOpen(false);
    setMobileOpen(false);
    setUserMenuOpen(false);
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
  const projectHasOverview = me.capabilityKeys?.has('projects.overview.view') || me.capabilityKeys?.has('projects.projects.view');
  const accessLabel = me.access.fullAdmin
    ? 'مدير النظام'
    : me.access.projectsScreen
      ? 'كامل بوابة المشاريع'
      : me.access.projectScoped && projectHasOverview
        ? 'مشرف مشروع'
        : me.access.projectScoped
          ? 'مشرف موقع'
          : 'مستخدم النظام';
  const userLabel = emp?.full_name_ar || me.email;
  const displayDate = new Intl.DateTimeFormat(`${SYSTEM.locale}-u-ca-${SYSTEM.calendar}`, {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: SYSTEM.timezone,
  }).format(new Date());
  const primaryAction = me.access.fullAdmin && !isMyWork ? (AREA_PRIMARY_ACTIONS[activeArea.key] || null) : null;
  const homeHref = me.access.fullAdmin ? '/dashboard' : TODAY_HREF;

  return (
    <div className={styles.root} data-ui-constitution="approved-v2">
      <header className={styles.globalBar}>
        <button className={styles.mobileMenuButton} onClick={() => setMobileOpen(true)} aria-label="فتح القائمة">≡</button>
        <Link href={homeHref} className={styles.wordmark}>أركان المكان <small>OS</small></Link>

        <nav className={styles.primaryNav} aria-label="التنقل الرئيسي">
          {!me.access.fullAdmin && (
            <Link href={TODAY_HREF} className={`${styles.primaryLink} ${isToday ? styles.primaryLinkActive : ''}`}>اليوم</Link>
          )}
          <Link href={MY_WORK_HREF} className={`${styles.primaryLink} ${isMyWork ? styles.primaryLinkActive : ''}`}>أعمالي</Link>
          {visibleAreas.map((area) => (
            <Link
              key={area.key}
              href={area.href}
              className={`${styles.primaryLink} ${!isToday && !isMyWork && activeArea.key === area.key ? styles.primaryLinkActive : ''}`}
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
          {(me.access.fullAdmin || me.access.finance) && <Link href="/dashboard/approvals" className={styles.alertLink}>سجل الاعتمادات</Link>}
          <div style={{position:'relative'}}>
            <button
              type="button"
              className={styles.userMenu}
              onClick={() => setUserMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              style={{border:0,background:'transparent',color:'inherit',cursor:'pointer',font:'inherit'}}
            >
              <span className={styles.userAvatar}>مد</span>
              <div className={styles.userCopy}>
                <div className={styles.userName}>{userLabel}</div>
                <div className={styles.userRole}>{accessLabel}</div>
              </div>
            </button>
            {userMenuOpen && <div role="menu" style={{position:'absolute',top:'calc(100% + 10px)',insetInlineEnd:0,minWidth:245,padding:8,border:'1px solid var(--hair)',borderRadius:10,background:'var(--paper,#fff)',boxShadow:'0 16px 40px rgba(0,0,0,.18)',zIndex:120,color:'var(--ink,#111)'}}>
              <Link href={MY_WORK_HREF} onClick={()=>setUserMenuOpen(false)} style={{display:'block',padding:'9px 10px',borderRadius:7}}>أعمالي</Link>
              {!me.access.fullAdmin && <Link href={TODAY_HREF} onClick={()=>setUserMenuOpen(false)} style={{display:'block',padding:'9px 10px',borderRadius:7}}>صلاحياتي ونطاق عملي</Link>}
              {me.access.manageAccess && <Link href="/dashboard/system-user" onClick={()=>setUserMenuOpen(false)} style={{display:'block',padding:'9px 10px',borderRadius:7,fontWeight:700}}>إدارة الدخول والصلاحيات</Link>}
              <Link href="/change-password" onClick={()=>setUserMenuOpen(false)} style={{display:'block',padding:'9px 10px',borderRadius:7}}>تغيير كلمة المرور</Link>
              <button onClick={signOut} style={{display:'block',width:'100%',textAlign:'start',padding:'9px 10px',border:0,background:'transparent',cursor:'pointer',font:'inherit',color:'inherit'}}>خروج</button>
            </div>}
          </div>
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
        {me.access.hr && <VacancyTargetingPanel />}
        {children}
      </div>

      {commandOpen && (
        <div className={styles.paletteBackdrop} onMouseDown={() => setCommandOpen(false)}>
          <div className={styles.palette} role="dialog" aria-modal="true" aria-label="البحث والأوامر" onMouseDown={(e) => e.stopPropagation()}>
            <div className={styles.paletteInputWrap}>
              <input autoFocus className={styles.paletteInput} value={commandQuery} onChange={(e) => setCommandQuery(e.target.value)} placeholder="ابحث عن مشروع، موظف، مستند أو إجراء…" />
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
            {!me.access.fullAdmin && (
              <section className={styles.mobileArea}>
                <Link href={TODAY_HREF} onClick={() => setMobileOpen(false)} className={styles.mobileAreaTitle}>
                  <span>اليوم</span><span>←</span>
                </Link>
              </section>
            )}
            <section className={styles.mobileArea}>
              <Link href={MY_WORK_HREF} onClick={() => setMobileOpen(false)} className={styles.mobileAreaTitle}>
                <span>أعمالي</span><span>←</span>
              </Link>
            </section>
            {me.access.manageAccess && <section className={styles.mobileArea}>
              <Link href="/dashboard/system-user" onClick={() => setMobileOpen(false)} className={styles.mobileAreaTitle}>
                <span>إدارة الدخول والصلاحيات</span><span>←</span>
              </Link>
            </section>}
            {visibleAreas.map((area) => (
              <section key={area.key} className={styles.mobileArea}>
                <Link href={area.href} onClick={() => setMobileOpen(false)} className={styles.mobileAreaTitle}>
                  <span>{area.label}</span><span>←</span>
                </Link>
                {canUseFullArea(area.key) && <div className={styles.mobileLinks}>
                  {area.items.filter((item) => item.href !== area.href && !item.hidden).map((item) => (
                    <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={`${styles.mobileLink} ${matchesConstitutionPath(pathname, item.href) ? styles.mobileLinkActive : ''}`}>
                      {item.label}
                    </Link>
                  ))}
                </div>}
              </section>
            ))}
          </aside>
        </div>
      )}
    </div>
  );
}
