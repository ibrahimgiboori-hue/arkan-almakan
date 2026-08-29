'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { DashboardSessionProvider } from '@/lib/dashboard-session-context';
import { ACTION_CONTEXT_EVENT, isOnBehalfMode, normalizeActionContext } from '@/lib/action-context';
import RawDashboardNavigation from '@/components/ui/RawDashboardNavigation';
import './raw-tokens.css';
import './raw-phase.css';

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

      const [userQ, capsQ, primaryQ, actionQ] = await Promise.all([
        supabase
          .from('app_users')
          .select('employee_id,role,is_active,is_system_admin,must_change_password')
          .eq('id', session.user.id)
          .maybeSingle(),
        supabase.from('v_my_capabilities').select('capability_key,module_key,scope_type,scope_key,source_key'),
        supabase.rpc('fn_is_primary_user'),
        supabase.rpc('fn_my_action_context'),
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
      const isPrimaryUser = primaryQ.data === true;
      const fullAdmin = isPrimaryUser || Boolean(userRow.is_system_admin);
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
      const actionContext = normalizeActionContext(actionQ.error ? null : actionQ.data, {
        systemActorUserId:session.user.id,
        systemActorEmployeeId:userRow.employee_id,
        isPrimaryUser,
      });

      setState({
        ready:true,
        allowed:true,
        message:'',
        me:{ ...userRow, email:session.user.email, userId:session.user.id, capabilities, capabilityKeys, access, actionContext },
      });
    })();

    return () => { alive = false; };
  }, [router]);

  useEffect(() => {
    async function refreshActionContext(event) {
      const supplied = event?.detail && typeof event.detail === 'object' ? event.detail : null;
      let raw = supplied;
      if (!raw) {
        const { data, error } = await supabase.rpc('fn_my_action_context');
        if (error) return;
        raw = data;
      }

      setState((current) => {
        if (!current.me) return current;
        const actionContext = normalizeActionContext(raw, {
          systemActorUserId:current.me.userId,
          systemActorEmployeeId:current.me.employee_id,
          isPrimaryUser:current.me.actionContext?.isPrimaryUser,
        });
        return { ...current, me:{ ...current.me, actionContext } };
      });
    }

    function refreshWhenVisible() {
      if (document.visibilityState === 'visible') refreshActionContext();
    }

    if (typeof window === 'undefined') return undefined;
    window.addEventListener(ACTION_CONTEXT_EVENT, refreshActionContext);
    window.addEventListener('focus', refreshActionContext);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.removeEventListener(ACTION_CONTEXT_EVENT, refreshActionContext);
      window.removeEventListener('focus', refreshActionContext);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);

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

  const actingOnBehalf = isOnBehalfMode(state.me?.actionContext);

  return (
    <DashboardSessionProvider value={state.me}>
      <div
        className="rawDashboardShell"
        data-work-kernel="operational-notebook-v1"
        data-viewport-policy="fluid-full-width"
        data-action-mode={actingOnBehalf ? 'on_behalf_of' : 'self'}
        data-real-actor-employee-id={state.me?.actionContext?.realActorEmployeeId || undefined}
      >
        <RawDashboardNavigation me={state.me} onSignOut={signOut} />
        {actingOnBehalf ? (
          <div
            role="status"
            aria-live="polite"
            data-action-context-banner="true"
            style={{
              position:'sticky',top:0,zIndex:35,
              padding:'9px 18px',
              borderBottom:'1px solid var(--raw-line, #d8c8a8)',
              background:'var(--raw-paper-strong, #fff8dd)',
              color:'var(--raw-ink, #2f2924)',
              display:'flex',gap:10,alignItems:'center',justifyContent:'center',flexWrap:'wrap',
              fontSize:13.5,
            }}
          >
            <strong>الوضع الخاص مفعّل:</strong>
            <span>تنفذ الآن نيابة عن <strong>{state.me.actionContext.realActorName || 'الشخص المحدد'}</strong></span>
            <span>· المُسجّل النظامي هو حسابك الحالي</span>
            <a href="/dashboard/settings" style={{fontWeight:700,textDecoration:'underline'}}>إدارة الوضع من الإعدادات</a>
          </div>
        ) : null}
        <main className="rawDashboardContent" data-work-book="true">
          <div className="workSheetMount" data-work-sheet-mount="true">{children}</div>
        </main>
      </div>
    </DashboardSessionProvider>
  );
}
