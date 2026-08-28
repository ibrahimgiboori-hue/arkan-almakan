'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { DashboardSessionProvider } from '@/lib/dashboard-session-context';
import RawDashboardNavigation from '@/components/ui/RawDashboardNavigation';
import './raw-tokens.css';
import './raw-phase.css';

// دفتر التشغيل له عرض منطقي واحد على سطح المكتب.
// 1912px هو المرجع البصري المعتمد من لقطة التشغيل المرجعية.
// لا نحاول تغيير Browser Zoom نفسه؛ نعوضه داخل غلاف البرنامج مرة واحدة عند فتح الجلسة.
const STANDARD_DASHBOARD_WIDTH = 1912;
const SCALE_STORAGE_PREFIX = 'arkan-dashboard-opening-scale-v1:';

function resolveOpeningScale(userId) {
  if (typeof window === 'undefined') return 1;
  const key = `${SCALE_STORAGE_PREFIX}${userId}`;
  const stored = Number(window.sessionStorage.getItem(key));
  if (Number.isFinite(stored) && stored > 0) return stored;

  // لا نفرض دفتر سطح المكتب المصغر على الهواتف؛ الاستجابة المحمولة تبقى مستقلة.
  if (window.innerWidth < 900) {
    window.sessionStorage.setItem(key, '1');
    return 1;
  }

  const scale = window.innerWidth / STANDARD_DASHBOARD_WIDTH;
  const safeScale = Math.max(0.5, Math.min(2, scale));
  window.sessionStorage.setItem(key, String(safeScale));
  return safeScale;
}

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const [state, setState] = useState({ ready:false, allowed:false, message:'', me:null, openingScale:1 });

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data:{ session } } = await supabase.auth.getSession();
      if (!alive) return;

      if (!session) {
        router.replace('/login');
        return;
      }

      const [userQ, capsQ, primaryQ] = await Promise.all([
        supabase
          .from('app_users')
          .select('role,is_active,is_system_admin,must_change_password')
          .eq('id', session.user.id)
          .maybeSingle(),
        supabase.from('v_my_capabilities').select('capability_key,module_key,scope_type,scope_key,source_key'),
        supabase.rpc('fn_is_primary_user'),
      ]);

      if (!alive) return;

      if (userQ.error) {
        setState({ ready:true, allowed:false, message:'تعذر التحقق من الحساب.', me:null, openingScale:1 });
        return;
      }

      const userRow = userQ.data || null;
      if (userRow?.must_change_password) {
        router.replace('/change-password');
        return;
      }

      if (!userRow?.is_active || !userRow?.role) {
        setState({ ready:true, allowed:false, message:'حسابك غير مهيأ لاستخدام النظام حاليًا.', me:null, openingScale:1 });
        return;
      }

      const capabilities = capsQ.error ? [] : (capsQ.data || []);
      const capabilityKeys = new Set(capabilities.map((item) => item.capability_key));
      const fullAdmin = primaryQ.data === true || Boolean(userRow.is_system_admin);
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
        documents: fullAdmin || capabilities.some((item) => item.module_key === 'documents') || capabilityKeys.has('system.approvals.view'),
        admin: fullAdmin || capabilities.some((item) => item.module_key === 'admin' || item.module_key === 'system'),
        manageAccess: fullAdmin || capabilityKeys.has('system.access.manage_access'),
        approvals: fullAdmin || capabilityKeys.has('system.approvals.view'),
      };
      const openingScale = resolveOpeningScale(session.user.id);

      setState({
        ready:true,
        allowed:true,
        message:'',
        openingScale,
        me:{ ...userRow, email:session.user.email, userId:session.user.id, capabilities, capabilityKeys, access },
      });
    })();

    return () => { alive = false; };
  }, [router]);

  async function signOut() {
    if (typeof window !== 'undefined' && state.me?.userId) {
      window.sessionStorage.removeItem(`${SCALE_STORAGE_PREFIX}${state.me.userId}`);
    }
    await supabase.auth.signOut();
    router.replace('/login');
  }

  if (!state.ready) {
    return <div style={{padding:24,fontFamily:'inherit'}}>جارٍ التحميل…</div>;
  }

  if (!state.allowed) {
    return <div style={{padding:24,fontFamily:'inherit'}}>{state.message}</div>;
  }

  const desktopNotebook = typeof window !== 'undefined' && window.innerWidth >= 900;
  const shellStyle = desktopNotebook ? {
    width:`${STANDARD_DASHBOARD_WIDTH}px`,
    zoom:state.openingScale,
  } : undefined;

  return (
    <DashboardSessionProvider value={state.me}>
      <div
        className="rawDashboardShell"
        data-work-kernel="operational-notebook-v1"
        data-opening-scale="session-normalized"
        style={shellStyle}
      >
        <RawDashboardNavigation me={state.me} onSignOut={signOut} />
        <main className="rawDashboardContent" data-work-book="true">
          <div className="workSheetMount" data-work-sheet-mount="true">{children}</div>
        </main>
      </div>
    </DashboardSessionProvider>
  );
}
