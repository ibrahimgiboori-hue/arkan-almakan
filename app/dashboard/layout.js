'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { AREAS, QUICK_ACTIONS, activeConstitutionItem } from '@/lib/app-constitution';
import { filterAreasForAccess } from '@/lib/access-ui';
import { dataEntryTheaterFor } from '@/lib/ui-governance';
import { logicalBackTarget } from '@/lib/navigation-history';
import FormBuilderResizeOverlay from '@/components/formbuilder/FormBuilderResizeOverlay';
import VacancyTargetingPanel from '@/components/recruitment/VacancyTargetingPanel';
import TypographyControls from '@/components/ui/TypographyControls';
import ProgramLinksPanel from '@/components/ui/ProgramLinksPanel';
import styles from './dashboard-redesign.module.css';
import './constitution-content.css';

const TODAY_HREF = '/dashboard/today';
const MY_WORK_HREF = '/dashboard/my-work';
const WORKSPACE_HREF = '/dashboard/workspace';

function cleanPortalLabel(value='') {
  return String(value).replace(/^بوابة\s+/, '').trim();
}

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [typographyOpen, setTypographyOpen] = useState(false);
  const [programLinksOpen, setProgramLinksOpen] = useState(false);

  const isToday = pathname === TODAY_HREF;
  const isMyWork = pathname === MY_WORK_HREF || pathname.startsWith(`${MY_WORK_HREF}/`);
  const isWorkspaceHome = pathname === WORKSPACE_HREF || pathname.startsWith(`${WORKSPACE_HREF}/`);
  const isProjectWorkspace = /^\/dashboard\/projects\/[^/]+(?:\/|$)/.test(pathname);
  const routeEntryTheater = dataEntryTheaterFor(pathname);

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
        supabase.from('v_my_capabilities').select('capability_key,module_key,scope_type,scope_key,source_key'),
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
        documents: fullAdmin || capabilities.some((item) => item.module_key === 'documents'),
        admin: fullAdmin || capabilities.some((item) => item.module_key === 'admin' || item.module_key === 'system'),
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
        setTypographyOpen(false);
        setProgramLinksOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const visibleAreas = useMemo(() => me ? filterAreasForAccess(AREAS, me.access) : [], [me]);
  const current = activeConstitutionItem(pathname);

  useEffect(() => {
    if (!ready || !me?.is_active || !me?.role) return;

    if (pathname === '/dashboard') {
      router.replace(TODAY_HREF);
      return;
    }
    if (isMyWork) {
      router.replace(`${TODAY_HREF}#my-work`);
      return;
    }

    if (me.access?.fullAdmin) return;
    if (isToday || isWorkspaceHome) return;
    if (isProjectWorkspace && me.access?.projectScoped) return;

    const currentAreaKey = current?.area?.key;
    if (!currentAreaKey || !visibleAreas.some((area) => area.key === currentAreaKey)) {
      router.replace(TODAY_HREF);
    }
  }, [ready, me, pathname, current, visibleAreas, router, isToday, isMyWork, isWorkspaceHome, isProjectWorkspace]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  function goBack() {
    setUserMenuOpen(false);
    setMobileOpen(false);
    setCommandOpen(false);
    router.push(logicalBackTarget(pathname, WORKSPACE_HREF));
  }

  const canUseFullArea = (areaKey) => Boolean(
    me?.access?.fullAdmin || (areaKey === 'projects' && me?.access?.projectsScreen)
  );

  const flatItems = useMemo(() => visibleAreas.flatMap((area) =>
    area.items
      .filter((item) => !item.hidden && (canUseFullArea(area.key) || item.href === area.href))
      .map((item) => ({ ...item, meta: area.label }))), [visibleAreas, me]);

  const results = useMemo(() => {
    const q = commandQuery.trim().toLowerCase();
    const base = [
      { label: 'فتح اليوم', href: TODAY_HREF, meta: 'ملخصي وأعمالي ومراسلاتي' },
      { label: 'فتح منصة الأعمال', href: WORKSPACE_HREF, meta: 'كل البوابات والأدوات المسموحة' },
      ...(me?.access?.fullAdmin ? QUICK_ACTIONS : []),
      ...flatItems,
    ];
    const unique = base.filter((item, index) => base.findIndex((candidate) => candidate.href === item.href) === index);
    if (!q) return unique.slice(0, 12);
    return unique.filter((item) => `${item.label} ${item.meta || ''}`.toLowerCase().includes(q)).slice(0, 12);
  }, [commandQuery, flatItems, me]);

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
  const avatarText = String(userLabel || 'م').trim().slice(0, 2) || 'م';
  const workPlatformActive = !isToday && !isMyWork;
  const showRouteBack = !isToday && !isWorkspaceHome && pathname !== '/dashboard' && !routeEntryTheater;
  const showGenericLevelStage = showRouteBack && !isProjectWorkspace && Boolean(current);
  const currentPortalLabel = cleanPortalLabel(current?.area?.label || 'منصة الأعمال');
  const currentLevelLabel = current?.label || currentPortalLabel;

  return (
    <div className={styles.root} data-ui-constitution="approved-v2">
      <header className={styles.globalBar}>
        <button className={styles.mobileMenuButton} onClick={() => setMobileOpen(true)} aria-label="فتح القائمة">≡</button>
        <Link href={TODAY_HREF} className={styles.wordmark}>أركان المكان <small>OS</small></Link>

        <nav className={styles.primaryNav} aria-label="التنقل الرئيسي">
          <Link href={TODAY_HREF} className={`${styles.primaryLink} ${isToday || isMyWork ? styles.primaryLinkActive : ''}`}>اليوم</Link>
          <Link href={WORKSPACE_HREF} className={`${styles.primaryLink} ${workPlatformActive ? styles.primaryLinkActive : ''}`}>منصة الأعمال</Link>
        </nav>

        <button className={styles.commandButton} onClick={() => setCommandOpen(true)} aria-haspopup="dialog">
          <span>ابحث أو نفّذ أمرًا — «افتح مشروع»</span>
          <span className={styles.commandHint}>Ctrl K</span>
        </button>

        <div className={styles.globalEnd}>
          <div style={{position:'relative'}}>
            <button
              type="button"
              className={styles.userMenu}
              onClick={() => setUserMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              style={{border:0,background:'transparent',color:'inherit',cursor:'pointer',font:'inherit'}}
            >
              <span className={styles.userAvatar}>{avatarText}</span>
              <div className={styles.userCopy}>
                <div className={styles.userName}>{userLabel}</div>
                <div className={styles.userRole}>{accessLabel}</div>
              </div>
            </button>
            {userMenuOpen && <div role="menu" style={{position:'absolute',top:'calc(100% + 10px)',insetInlineEnd:0,minWidth:245,padding:8,border:'1px solid var(--ui-border)',borderRadius:10,background:'var(--ui-paper,#fff)',boxShadow:'0 16px 40px rgba(0,0,0,.18)',zIndex:120,color:'var(--ui-ink,#111)'}}>
              <Link href={TODAY_HREF} onClick={()=>setUserMenuOpen(false)} style={{display:'block',padding:'9px 10px',borderRadius:7}}>اليوم وأعمالي</Link>
              <Link href={WORKSPACE_HREF} onClick={()=>setUserMenuOpen(false)} style={{display:'block',padding:'9px 10px',borderRadius:7}}>منصة الأعمال</Link>
              <button onClick={()=>{setUserMenuOpen(false);setProgramLinksOpen(true);}} style={{display:'block',width:'100%',textAlign:'start',padding:'9px 10px',border:0,background:'transparent',cursor:'pointer',font:'inherit',color:'inherit',fontWeight:800}}>روابط البرنامج</button>
              <button onClick={()=>{setUserMenuOpen(false);setTypographyOpen(true);}} style={{display:'block',width:'100%',textAlign:'start',padding:'9px 10px',border:0,background:'transparent',cursor:'pointer',font:'inherit',color:'inherit'}}>أحجام الخطوط</button>
              {me.access.manageAccess && <Link href="/dashboard/system-user" onClick={()=>setUserMenuOpen(false)} style={{display:'block',padding:'9px 10px',borderRadius:7,fontWeight:700}}>إدارة الدخول والصلاحيات</Link>}
              <Link href="/change-password" onClick={()=>setUserMenuOpen(false)} style={{display:'block',padding:'9px 10px',borderRadius:7}}>تغيير كلمة المرور</Link>
              <button onClick={signOut} style={{display:'block',width:'100%',textAlign:'start',padding:'9px 10px',border:0,background:'transparent',cursor:'pointer',font:'inherit',color:'inherit'}}>خروج</button>
            </div>}
          </div>
        </div>
      </header>

      {showRouteBack && (
        <div className="constitution-route-back-bar" data-hierarchy-back="true">
          <button type="button" className="constitution-entry-theater-back" onClick={goBack} aria-label="الرجوع إلى الشاشة السابقة">
            <span aria-hidden="true">←</span>
            <span>رجوع</span>
          </button>
          <div className="constitution-entry-theater-heading">
            <span>{currentPortalLabel}</span>
            <strong>{currentLevelLabel}</strong>
          </div>
        </div>
      )}

      <div
        className={pathname === '/dashboard' ? styles.homeContent : 'page constitution-content'}
        data-content-governance={pathname === '/dashboard' ? 'native-approved' : 'compat-approved'}
        data-hierarchy-stage={showGenericLevelStage ? 'true' : 'false'}
      >
        {showGenericLevelStage && (
          <section className="constitution-level-stage" aria-label={currentLevelLabel}>
            <div className="constitution-level-stage-main">
              <div className="constitution-level-stage-parent">{current?.area?.label || 'منصة الأعمال'}</div>
              <h1 className="constitution-level-stage-title">{currentLevelLabel}</h1>
              <p className="constitution-level-stage-description">أنت داخل مستوى أدنى من {currentPortalLabel}. الأدوات والبيانات هنا تتبع نفس هندسة البوابة، ثم ينتقل الإدخال إلى مسرحه الخاص.</p>
            </div>
            <div className="constitution-level-stage-meta">
              <strong>{currentPortalLabel}</strong>
              <span>السياق الأعلى</span>
            </div>
          </section>
        )}
        {pathname.startsWith('/dashboard/formbuilder/') && <FormBuilderResizeOverlay />}
        {me.access.hr && <VacancyTargetingPanel />}
        {children}
      </div>

      <ProgramLinksPanel open={programLinksOpen} onClose={()=>setProgramLinksOpen(false)} access={me.access} capabilities={me.capabilities}/>
      <TypographyControls open={typographyOpen} onClose={()=>setTypographyOpen(false)} />

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
            <section className={styles.mobileArea}><Link href={TODAY_HREF} onClick={()=>setMobileOpen(false)} className={styles.mobileAreaTitle}><span>اليوم وأعمالي</span><span>←</span></Link></section>
            <section className={styles.mobileArea}><Link href={WORKSPACE_HREF} onClick={()=>setMobileOpen(false)} className={styles.mobileAreaTitle}><span>منصة الأعمال</span><span>←</span></Link></section>
            <section className={styles.mobileArea}><button type="button" onClick={()=>{setMobileOpen(false);setProgramLinksOpen(true);}} className={styles.mobileAreaTitle} style={{width:'100%',border:0,background:'transparent',font:'inherit',cursor:'pointer'}}><span>روابط البرنامج</span><span>←</span></button></section>
            {me.access.manageAccess && <section className={styles.mobileArea}><Link href="/dashboard/system-user" onClick={()=>setMobileOpen(false)} className={styles.mobileAreaTitle}><span>إدارة الدخول والصلاحيات</span><span>←</span></Link></section>}
          </aside>
        </div>
      )}
    </div>
  );
}
