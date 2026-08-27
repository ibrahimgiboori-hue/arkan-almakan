'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import RawDashboardNavigation from '@/components/ui/RawDashboardNavigation';
import './raw-tokens.css';
import './raw-phase.css';

/**
 * RAW PROGRAMMING SHELL
 *
 * One minimal navigation surface only. No decorative dashboard chrome,
 * duplicated shortcuts, portal overlays, or secondary navigation systems.
 *
 * raw-tokens.css is imported once here so raw-phase components can share one
 * visual source without bringing back a second interface layer.
 */
export default function DashboardLayout({ children }) {
  const router = useRouter();
  const [state, setState] = useState({ ready:false, allowed:false, message:'', me:null });

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
        setState({ ready:true, allowed:false, message:'تعذر التحقق من الحساب.', me:null });
        return;
      }

      const userRow = userQ.data || null;
      if (userRow?.must_change_password) {
        router.replace('/change-password');
        return;
      }

      if (!userRow?.is_active || !userRow?.role) {
        setState({ ready:true, allowed:false, message:'حسابك غير مهيأ لاستخدام النظام حاليًا.', me:null });
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

      setState({
        ready:true,
        allowed:true,
        message:'',
        me:{ ...userRow, email:session.user.email, capabilities, capabilityKeys, access },
      });
    })();

    return () => { alive = false; };
  }, [router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  if (!state.ready) {
    return <div style={{padding:24,fontFamily:'inherit'}}>جارٍ التحميل…</div>;
  }

  if (!state.allowed) {
    return <div style={{padding:24,fontFamily:'inherit'}}>{state.message}</div>;
  }

  return (
    <>
      <RawDashboardNavigation me={state.me} onSignOut={signOut} />
      {children}
    </>
  );
}
