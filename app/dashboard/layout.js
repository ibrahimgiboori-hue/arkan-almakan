'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { DashboardSessionProvider } from '@/lib/dashboard-session-context';
import { ACTION_CONTEXT_EVENT, isOnBehalfMode, normalizeActionContext } from '@/lib/action-context';
import { applyUiTheme, DEFAULT_UI_THEME, UI_THEME_EVENT } from '@/lib/ui-theme';
import { uiSkinDataAttributes } from '@/lib/ui-skin-contract';
import ContextualDashboardNavigation from '@/components/ui/ContextualDashboardNavigation';
import WorkSurfaceRuntime from '@/components/ui/WorkSurfaceRuntime';
import UISkinBridgeRuntime from '@/components/ui/UISkinBridgeRuntime';
import PortalExperienceRuntime from '@/components/ui/PortalExperienceRuntime';
import WorkThresholdRuntime, { WorkThresholdMarker } from '@/components/ui/WorkThresholdRuntime';
import WorkSessionRuntime from '@/components/ui/WorkSessionRuntime';
import ActionNervousSystemRuntime from '@/components/ui/ActionNervousSystemRuntime';
import './raw-tokens.css';
import './raw-phase.css';
import './app-shell-v2.css';
import './app-body-v3.css';
import './body-resuscitation.css';
import './portal-experience.css';
import './ui-skin-contract.css';

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

      const [userQ, capsQ, primaryQ, actionQ, themeQ] = await Promise.all([
        supabase
          .from('app_users')
          .select('employee_id,role,is_active,is_system_admin,must_change_password')
          .eq('id', session.user.id)
          .maybeSingle(),
        supabase.from('v_my_capabilities').select('capability_key,module_key,scope_type,scope_key,source_key'),
        supabase.rpc('fn_is_primary_user'),
        supabase.rpc('fn_my_action_context'),
        supabase.from('app_settings').select('ui_theme_preset').eq('id',1).maybeSingle(),
      ]);

      if (!alive) return;
      applyUiTheme(themeQ.error ? DEFAULT_UI_THEME : themeQ.data?.ui_theme_preset);

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
      const manageAccess = fullAdmin || capabilityKeys.has('system.access.manage_access');
      const access = {
        fullAdmin,
        projects: projectsScreen,
        projectsScreen,
        projectScoped,
        hr: fullAdmin || capabilities.some((item) => item.module_key === 'hr'),
        finance: fullAdmin || capabilities.some((item) => item.module_key === 'finance'),
        documents: fullAdmin || capabilities.some((item) => item.module_key === 'documents'),
        admin: fullAdmin || capabilities.some((item) => item.module_key === 'admin') || manageAccess,
        manageAccess,
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
    function refreshTheme(event) {
      const supplied = event?.detail?.theme;
      if (supplied) {
        applyUiTheme(supplied);
        return;
      }
      supabase.from('app_settings').select('ui_theme_preset').eq('id',1).maybeSingle()
        .then(({ data }) => applyUiTheme(data?.ui_theme_preset || DEFAULT_UI_THEME));
    }
    window.addEventListener(UI_THEME_EVENT, refreshTheme);
    return () => window.removeEventListener(UI_THEME_EVENT, refreshTheme);
  }, []);

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

  useEffect(() => {
    const actionContext = state.me?.actionContext;
    if (!isOnBehalfMode(actionContext) || !actionContext?.expiresAt || typeof window === 'undefined') return undefined;

    const expiresAt = new Date(actionContext.expiresAt).getTime();
    if (!Number.isFinite(expiresAt)) return undefined;
    const delay = Math.max(0, expiresAt - Date.now() + 1000);
    const timer = window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent(ACTION_CONTEXT_EVENT));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [state.me?.actionContext?.actingMode, state.me?.actionContext?.expiresAt]);

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
  const showExceptionalIdentity = actingOnBehalf && state.me?.actionContext?.isPrimaryUser === true;
  const skinAttrs = uiSkinDataAttributes();

  return (
    <DashboardSessionProvider value={state.me}>
      <div
        {...skinAttrs}
        className="rawDashboardShell"
        data-work-kernel="operational-notebook-v1"
        data-viewport-policy="fluid-full-width"
        data-navigation-shell="contextual-slide-v2"
        data-action-mode={actingOnBehalf ? 'on_behalf_of' : 'self'}
        data-real-actor-employee-id={state.me?.actionContext?.realActorEmployeeId || undefined}
      >
        <WorkSurfaceRuntime>
          <UISkinBridgeRuntime>
            <PortalExperienceRuntime>
              <ContextualDashboardNavigation me={state.me} onSignOut={signOut} />
              <WorkThresholdRuntime>
                <div className="appBodyStage" data-application-body="work-first-v3">
                  <WorkSessionRuntime>
                    <ActionNervousSystemRuntime>
                      {showExceptionalIdentity ? (
                        <div
                          role="status"
                          aria-live="polite"
                          data-action-context-banner="true"
                          data-action-context-active="true"
                          className="appActionContextAlert"
                        >
                          <span>تسجيل الإجراء باسم <strong>{state.me.actionContext.realActorName || 'الشخص المحدد'}</strong></span>
                          <a href="/dashboard/settings#primary-action-mode">تغيير</a>
                        </div>
                      ) : null}
                      <main className="rawDashboardContent" data-work-book="true">
                        <WorkThresholdMarker />
                        <div
                          className="workSheetMount"
                          data-work-sheet-mount="true"
                          data-organ-host="route-content"
                          data-organ-preservation="in-place"
                        >
                          {children}
                        </div>
                      </main>
                    </ActionNervousSystemRuntime>
                  </WorkSessionRuntime>
                </div>
              </WorkThresholdRuntime>
            </PortalExperienceRuntime>
          </UISkinBridgeRuntime>
        </WorkSurfaceRuntime>
      </div>
    </DashboardSessionProvider>
  );
}
