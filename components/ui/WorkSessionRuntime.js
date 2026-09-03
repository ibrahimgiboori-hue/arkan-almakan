'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { WORK_COMPLETION_KIND, WORK_SESSION_STATE } from '@/lib/work-session-constitution';
import { normalizeInnervationSubject } from '@/lib/persistent-innervation';
import styles from './WorkSessionRuntime.module.css';

export const WORK_SESSION_EVENT = Object.freeze({
  BEGIN: 'arkan:work-session-begin',
  COMPLETE: 'arkan:work-session-completed',
  RESET: 'arkan:work-session-reset',
  DIRTY: 'arkan:work-session-dirty',
  CLEAN: 'arkan:work-session-clean',
  NAVIGATE: 'arkan:work-session-navigate',
});

const WorkSessionContext = createContext(null);

const COMPLETION_LABELS = Object.freeze({
  [WORK_COMPLETION_KIND.SAVED]: 'تم الحفظ',
  [WORK_COMPLETION_KIND.DRAFTED]: 'تم حفظ المسودة',
  [WORK_COMPLETION_KIND.SENT_FOR_REVIEW]: 'تم الإرسال للمراجعة',
  [WORK_COMPLETION_KIND.SENT_FOR_APPROVAL]: 'تم الإرسال للاعتماد',
  [WORK_COMPLETION_KIND.SENT_FOR_AWARENESS]: 'تم الإرسال للإحاطة',
  [WORK_COMPLETION_KIND.APPROVED]: 'تم الاعتماد',
  [WORK_COMPLETION_KIND.REJECTED]: 'تم الرفض',
  [WORK_COMPLETION_KIND.RETURNED]: 'تمت الإعادة',
});

function normalizeAction(action) {
  if (!action || typeof action !== 'object') return null;
  const label = String(action.label || '').trim();
  if (!label) return null;
  const href = action.href ? String(action.href) : null;
  return Object.freeze({ label, href, reset:action.reset === true });
}

function normalizeCompletion(detail = {}) {
  if (detail?.serverConfirmed !== true) return null;

  const kind = Object.values(WORK_COMPLETION_KIND).includes(detail.kind)
    ? detail.kind
    : WORK_COMPLETION_KIND.SAVED;
  const title = String(detail.title || COMPLETION_LABELS[kind] || 'تم الإجراء').trim();
  const message = String(detail.message || '').trim();
  const reference = String(detail.reference || '').trim();
  const destination = String(detail.destination || '').trim();
  const primaryAction = normalizeAction(detail.primaryAction);
  const secondaryAction = normalizeAction(detail.secondaryAction);
  const subject = normalizeInnervationSubject(detail.subject || {});

  return Object.freeze({
    kind,
    title,
    message,
    reference,
    destination,
    subject,
    primaryAction,
    secondaryAction,
    completedAt: detail.completedAt || new Date().toISOString(),
  });
}

function normalizePendingWork(detail = {}) {
  const id = String(detail.id || detail.key || 'active-work').trim() || 'active-work';
  const label = String(detail.label || detail.title || 'العمل الحالي').trim() || 'العمل الحالي';
  const message = String(detail.message || '').trim();
  return {
    id,
    label,
    message,
    saveDraft:typeof detail.saveDraft === 'function' ? detail.saveDraft : null,
    discardChanges:typeof detail.discardChanges === 'function' ? detail.discardChanges : null,
    dirty:true,
  };
}

function normalizeNavigation(detail = {}) {
  const href = typeof detail === 'string' ? detail : detail?.href;
  if (!href) return null;
  return {
    href:String(href),
    replace:typeof detail === 'object' && detail?.replace === true,
  };
}

export function useWorkSession() {
  const value = useContext(WorkSessionContext);
  if (!value) throw new Error('useWorkSession must be used inside WorkSessionRuntime');
  return value;
}

export function emitWorkSessionBegin(detail = {}) {
  if (typeof window === 'undefined') return false;
  window.dispatchEvent(new CustomEvent(WORK_SESSION_EVENT.BEGIN, { detail }));
  return true;
}

export function emitWorkSessionCompletion(detail) {
  if (typeof window === 'undefined') return false;
  if (detail?.serverConfirmed !== true) return false;
  window.dispatchEvent(new CustomEvent(WORK_SESSION_EVENT.COMPLETE, { detail }));
  return true;
}

export function emitWorkSessionDirty(detail = {}) {
  if (typeof window === 'undefined') return false;
  window.dispatchEvent(new CustomEvent(WORK_SESSION_EVENT.DIRTY, { detail }));
  return true;
}

export function clearWorkSessionDirty(detail = {}) {
  if (typeof window === 'undefined') return false;
  window.dispatchEvent(new CustomEvent(WORK_SESSION_EVENT.CLEAN, { detail }));
  return true;
}

export function requestWorkNavigation(href, options = {}) {
  if (typeof window === 'undefined' || !href) return false;
  window.dispatchEvent(new CustomEvent(WORK_SESSION_EVENT.NAVIGATE, {
    detail:{ href, replace:options.replace === true },
  }));
  return true;
}

export function resetWorkSession() {
  if (typeof window === 'undefined') return false;
  window.dispatchEvent(new CustomEvent(WORK_SESSION_EVENT.RESET));
  return true;
}

function CompletedSurface({ completion, onAction }) {
  return (
    <section
      className="appCompletedSurface"
      data-work-session-state={WORK_SESSION_STATE.RELEASED}
      data-completion-kind={completion.kind}
      data-completed-entity-type={completion.subject?.entityType || undefined}
      data-completed-entity-id={completion.subject?.entityId || undefined}
      data-completed-stage={completion.subject?.stageKey || undefined}
      aria-live="polite"
      aria-label="خاتمة جلسة العمل"
    >
      <div className="appCompletedMark">تم</div>
      <h1>{completion.title}</h1>
      {completion.message ? <p>{completion.message}</p> : null}
      {(completion.destination || completion.reference) ? (
        <div className="appCompletedMeta">
          {completion.destination ? <span>{completion.destination}</span> : null}
          {completion.reference ? <span>{completion.reference}</span> : null}
        </div>
      ) : null}
      {(completion.primaryAction || completion.secondaryAction) ? (
        <div className="appCompletedActions" data-completion-actions="true">
          {completion.primaryAction ? (
            <button type="button" onClick={() => onAction(completion.primaryAction)}>{completion.primaryAction.label}</button>
          ) : null}
          {completion.secondaryAction ? (
            <button type="button" onClick={() => onAction(completion.secondaryAction)}>{completion.secondaryAction.label}</button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function LeaveWorkDialog({ work, busy, error, onContinue, onSaveDraft, onDiscard }) {
  return (
    <div className={styles.backdrop} role="presentation" data-work-leave-gate="true">
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="work-leave-title"
        aria-describedby="work-leave-description"
      >
        <p className={styles.kicker}>العمل لم ينته بعد</p>
        <h2 id="work-leave-title">لديك تغييرات غير محفوظة في {work?.label || 'العمل الحالي'}</h2>
        <p id="work-leave-description" className={styles.description}>
          {work?.message || 'يمكنك إكمال العمل، أو حفظه كمسودة ثم الانتقال، أو تجاهل التغييرات غير المحفوظة.'}
        </p>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <div className={styles.actions}>
          <button type="button" onClick={onContinue} disabled={busy}>إكمال العمل</button>
          {work?.saveDraft ? (
            <button type="button" onClick={onSaveDraft} disabled={busy}>حفظ كمسودة والانتقال</button>
          ) : null}
          <button type="button" className={styles.discard} onClick={onDiscard} disabled={busy}>تجاهل التغييرات والانتقال</button>
        </div>
      </section>
    </div>
  );
}

export default function WorkSessionRuntime({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sessionSubject, setSessionSubject] = useState(null);
  const [started, setStarted] = useState(false);
  const [completion, setCompletion] = useState(null);
  const [pendingWork, setPendingWork] = useState(null);
  const [navigationIntent, setNavigationIntent] = useState(null);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveError, setLeaveError] = useState('');

  const begin = useCallback((detail = {}) => {
    setCompletion(null);
    setSessionSubject(normalizeInnervationSubject(detail.subject || detail || {}));
    setStarted(true);
    return true;
  }, []);

  const markDirty = useCallback((detail = {}) => {
    setCompletion(null);
    setStarted(true);
    setPendingWork(normalizePendingWork(detail));
    return true;
  }, []);

  const clearDirty = useCallback((detail = {}) => {
    const targetId = String(detail?.id || detail?.key || '').trim();
    setPendingWork((current) => {
      if (!current) return null;
      if (targetId && current.id !== targetId) return current;
      return null;
    });
    return true;
  }, []);

  const complete = useCallback((detail) => {
    const next = normalizeCompletion(detail);
    if (!next) return false;
    setSessionSubject(next.subject || null);
    setStarted(false);
    setPendingWork(null);
    setNavigationIntent(null);
    setLeaveError('');
    setCompletion(next);
    return true;
  }, []);

  const reset = useCallback(() => {
    setStarted(false);
    setSessionSubject(null);
    setCompletion(null);
    setPendingWork(null);
    setNavigationIntent(null);
    setLeaveBusy(false);
    setLeaveError('');
  }, []);

  const navigateResolved = useCallback((intent) => {
    if (!intent?.href) return false;
    if (intent.replace) router.replace(intent.href);
    else router.push(intent.href);
    return true;
  }, [router]);

  const requestNavigation = useCallback((detail) => {
    const intent = normalizeNavigation(detail);
    if (!intent) return false;
    if (pendingWork?.dirty) {
      setLeaveError('');
      setNavigationIntent(intent);
      return false;
    }
    return navigateResolved(intent);
  }, [navigateResolved, pendingWork]);

  // المسار الجديد يعيد الجلسة إلى IDLE فقط بعد أن تم السماح بالمغادرة.
  // طلبات الملاحة التي تمر عبر البوابة المركزية لا تصل هنا وهي DIRTY.
  useEffect(() => {
    reset();
  }, [pathname, reset]);

  useEffect(() => {
    function onBegin(event) { begin(event?.detail || {}); }
    function onComplete(event) { complete(event?.detail || {}); }
    function onReset() { reset(); }
    function onDirty(event) { markDirty(event?.detail || {}); }
    function onClean(event) { clearDirty(event?.detail || {}); }
    function onNavigate(event) { requestNavigation(event?.detail || {}); }
    window.addEventListener(WORK_SESSION_EVENT.BEGIN, onBegin);
    window.addEventListener(WORK_SESSION_EVENT.COMPLETE, onComplete);
    window.addEventListener(WORK_SESSION_EVENT.RESET, onReset);
    window.addEventListener(WORK_SESSION_EVENT.DIRTY, onDirty);
    window.addEventListener(WORK_SESSION_EVENT.CLEAN, onClean);
    window.addEventListener(WORK_SESSION_EVENT.NAVIGATE, onNavigate);
    return () => {
      window.removeEventListener(WORK_SESSION_EVENT.BEGIN, onBegin);
      window.removeEventListener(WORK_SESSION_EVENT.COMPLETE, onComplete);
      window.removeEventListener(WORK_SESSION_EVENT.RESET, onReset);
      window.removeEventListener(WORK_SESSION_EVENT.DIRTY, onDirty);
      window.removeEventListener(WORK_SESSION_EVENT.CLEAN, onClean);
      window.removeEventListener(WORK_SESSION_EVENT.NAVIGATE, onNavigate);
    };
  }, [begin, clearDirty, complete, markDirty, requestNavigation, reset]);

  // روابط البرنامج العادية تمر من نفس بوابة المغادرة بدون أن نطلب من كل صفحة
  // إعادة اختراع حارس خاص بها. الأفعال البرمجية غير القائمة على رابط تستخدم requestWorkNavigation.
  useEffect(() => {
    if (!pendingWork?.dirty) return undefined;

    function onDocumentClick(event) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;

      const current = new URL(window.location.href);
      const next = new URL(anchor.href, current.href);
      if (next.origin !== current.origin) return;
      const nextHref = `${next.pathname}${next.search}${next.hash}`;
      const currentHref = `${current.pathname}${current.search}${current.hash}`;
      if (nextHref === currentHref) return;

      event.preventDefault();
      requestNavigation({ href:nextHref });
    }

    function onBeforeUnload(event) {
      event.preventDefault();
      event.returnValue = '';
    }

    document.addEventListener('click', onDocumentClick, true);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('click', onDocumentClick, true);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [pendingWork, requestNavigation]);

  const state = completion
    ? WORK_SESSION_STATE.RELEASED
    : started
      ? WORK_SESSION_STATE.WORKING
      : WORK_SESSION_STATE.IDLE;

  useEffect(() => {
    const shell = document.querySelector('.rawDashboardShell');
    if (!shell) return undefined;
    shell.setAttribute('data-work-session-state', state);
    shell.setAttribute('data-work-dirty', pendingWork?.dirty ? 'true' : 'false');
    return () => {
      shell.removeAttribute('data-work-session-state');
      shell.removeAttribute('data-work-dirty');
    };
  }, [pendingWork, state]);

  const value = useMemo(() => Object.freeze({
    state,
    subject:sessionSubject,
    completion,
    hasUnsavedChanges:Boolean(pendingWork?.dirty),
    pendingWork,
    begin,
    complete,
    reset,
    markDirty,
    clearDirty,
    requestNavigation,
  }), [begin, clearDirty, complete, completion, markDirty, pendingWork, requestNavigation, reset, sessionSubject, state]);

  function act(action) {
    if (!action) return;
    if (action.reset || !action.href || action.href === pathname) reset();
    if (action.href && action.href !== pathname) requestNavigation({ href:action.href });
  }

  function continueWorking() {
    if (leaveBusy) return;
    setNavigationIntent(null);
    setLeaveError('');
  }

  async function saveDraftAndLeave() {
    if (!navigationIntent || !pendingWork?.saveDraft || leaveBusy) return;
    setLeaveBusy(true);
    setLeaveError('');
    try {
      const result = await pendingWork.saveDraft();
      if (result === false) throw new Error('تعذر حفظ المسودة.');
      const intent = navigationIntent;
      setPendingWork(null);
      setNavigationIntent(null);
      setLeaveBusy(false);
      navigateResolved(intent);
    } catch (error) {
      setLeaveBusy(false);
      setLeaveError(error?.message || 'تعذر حفظ المسودة. بقيت في مكانك ولم تُفقد التغييرات.');
    }
  }

  async function discardAndLeave() {
    if (!navigationIntent || leaveBusy) return;
    setLeaveBusy(true);
    setLeaveError('');
    try {
      if (pendingWork?.discardChanges) await pendingWork.discardChanges();
      const intent = navigationIntent;
      setPendingWork(null);
      setNavigationIntent(null);
      setLeaveBusy(false);
      navigateResolved(intent);
    } catch (error) {
      setLeaveBusy(false);
      setLeaveError(error?.message || 'تعذر تجاهل التغييرات بأمان. بقيت في مكانك.');
    }
  }

  return (
    <WorkSessionContext.Provider value={value}>
      {completion ? <CompletedSurface completion={completion} onAction={act} /> : children}
      {navigationIntent && pendingWork?.dirty ? (
        <LeaveWorkDialog
          work={pendingWork}
          busy={leaveBusy}
          error={leaveError}
          onContinue={continueWorking}
          onSaveDraft={saveDraftAndLeave}
          onDiscard={discardAndLeave}
        />
      ) : null}
    </WorkSessionContext.Provider>
  );
}
