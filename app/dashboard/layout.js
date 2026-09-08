'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { DashboardSessionProvider } from '@/lib/dashboard-session-context';
import { ACTION_CONTEXT_EVENT, isOnBehalfMode, normalizeActionContext } from '@/lib/action-context';
import { applyUiTheme, DEFAULT_UI_THEME, UI_THEME_EVENT } from '@/lib/ui-theme';
import { uiSkinDataAttributes, uiSlot } from '@/lib/ui-skin-contract';
import {
  loadCurrentActionContextSnapshot,
  loadCurrentUiThemeSnapshot,
  loadDashboardBootstrapSnapshot,
  signOutDashboardSession,
} from '@/lib/adapters/dashboard-bootstrap-supabase';
import { composeDashboardSession } from '@/lib/core/dashboard-session';
import { dashboardDeniedMessage } from '@/lib/presentation/dashboard-messages';
import ContextualDashboardNavigation from '@/components/ui/ContextualDashboardNavigation';
import WorkSurfaceRuntime from '@/components/ui/WorkSurfaceRuntime';
import ActiveDashboardSkinRuntime from '@/components/ui/ActiveDashboardSkinRuntime';
import WorkThresholdRuntime, { WorkThresholdMarker } from '@/components/ui/WorkThresholdRuntime';
import WorkSessionRuntime from '@/components/ui/WorkSessionRuntime';
import ActionNervousSystemRuntime from '@/components/ui/ActionNervousSystemRuntime';
import './ui-active-dashboard-skin.css';

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const [state, setState] = useState({ ready:false, allowed:false, message:'', me:null });

  useEffect(() => {
    let alive = true;

    (async () => {
      const snapshot = await loadDashboardBootstrapSnapshot(supabase);
      if (!alive) return;

      const decision = composeDashboardSession(snapshot);
      if (decision.kind === 'anonymous') {
        router.replace('/login');
        return;
      }

      applyUiTheme(snapshot.themeQ?.error ? DEFAULT_UI_THEME : snapshot.themeQ?.data?.ui_theme_preset);

      if (decision.kind === 'password_change_required') {
        router.replace('/change-password');
        return;
      }

      if (decision.kind === 'denied') {
        setState({ ready:true, allowed:false, message:dashboardDeniedMessage(decision.reason), me:null });
        return;
      }

      setState({ ready:true, allowed:true, message:'', me:decision.me });
    })();

    return () => { alive = false; };
  }, [router]);

  useEffect(() => {
    async function refreshTheme(event) {
      const supplied = event?.detail?.theme;
      if (supplied) {
        applyUiTheme(supplied);
        return;
      }
      const { data } = await loadCurrentUiThemeSnapshot(supabase);
      applyUiTheme(data?.ui_theme_preset || DEFAULT_UI_THEME);
    }
    window.addEventListener(UI_THEME_EVENT, refreshTheme);
    return () => window.removeEventListener(UI_THEME_EVENT, refreshTheme);
  }, []);

  useEffect(() => {
    async function refreshActionContext(event) {
      const supplied = event?.detail && typeof event.detail === 'object' ? event.detail : null;
      let raw = supplied;
      if (!raw) {
        const { data, error } = await loadCurrentActionContextSnapshot(supabase);
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
    await signOutDashboardSession(supabase);
    router.replace('/login');
  }

  const skinAttrs = uiSkinDataAttributes();

  if (!state.ready) {
    return (
      <div {...skinAttrs} data-ui-slot={uiSlot('systemState')} data-ui-state="loading" dir="rtl" role="status" aria-live="polite">
        <strong data-ui-part="system-state-title">جارٍ التحميل…</strong>
      </div>
    );
  }

  if (!state.allowed) {
    return (
      <div {...skinAttrs} data-ui-slot={uiSlot('systemState')} data-ui-state="denied" dir="rtl" role="alert">
        <strong data-ui-part="system-state-title">تعذر الدخول</strong>
        <span data-ui-part="system-state-message">{state.message}</span>
      </div>
    );
  }

  const actingOnBehalf = isOnBehalfMode(state.me?.actionContext);
  const showExceptionalIdentity = actingOnBehalf && state.me?.actionContext?.isPrimaryUser === true;

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
          <ActiveDashboardSkinRuntime>
            <ContextualDashboardNavigation me={state.me} onSignOut={signOut} />
            <WorkThresholdRuntime>
              <div
                className="appBodyStage"
                data-application-body="work-first-v3"
                data-ui-slot={uiSlot('applicationStage')}
              >
                <WorkSessionRuntime>
                  <ActionNervousSystemRuntime>
                    {showExceptionalIdentity ? (
                      <div
                        role="status"
                        aria-live="polite"
                        data-action-context-banner="true"
                        data-action-context-active="true"
                        data-ui-slot={uiSlot('actionContextBanner')}
                        className="appActionContextAlert"
                      >
                        <span>تسجيل الإجراء باسم <strong>{state.me.actionContext.realActorName || 'الشخص المحدد'}</strong></span>
                        <a href="/dashboard/settings#primary-action-mode">تغيير</a>
                      </div>
                    ) : null}
                    <main
                      className="rawDashboardContent"
                      data-work-book="true"
                      data-ui-slot={uiSlot('applicationContent')}
                    >
                      <WorkThresholdMarker />
                      <div
                        className="workSheetMount"
                        data-work-sheet-mount="true"
                        data-organ-host="route-content"
                        data-organ-preservation="in-place"
                        data-ui-slot={uiSlot('routeMount')}
                      >
                        {children}
                      </div>
                    </main>
                  </ActionNervousSystemRuntime>
                </WorkSessionRuntime>
              </div>
            </WorkThresholdRuntime>
          </ActiveDashboardSkinRuntime>
        </WorkSurfaceRuntime>
      </div>
    </DashboardSessionProvider>
  );
}
