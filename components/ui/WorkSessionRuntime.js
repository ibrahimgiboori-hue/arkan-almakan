'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { WORK_COMPLETION_KIND, WORK_SESSION_STATE } from '@/lib/work-session-constitution';
import { normalizeInnervationSubject } from '@/lib/persistent-innervation';

export const WORK_SESSION_EVENT = Object.freeze({
  BEGIN: 'arkan:work-session-begin',
  COMPLETE: 'arkan:work-session-completed',
  RESET: 'arkan:work-session-reset',
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

export default function WorkSessionRuntime({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sessionSubject, setSessionSubject] = useState(null);
  const [started, setStarted] = useState(false);
  const [completion, setCompletion] = useState(null);

  const begin = useCallback((detail = {}) => {
    setCompletion(null);
    setSessionSubject(normalizeInnervationSubject(detail.subject || detail || {}));
    setStarted(true);
    return true;
  }, []);

  const complete = useCallback((detail) => {
    const next = normalizeCompletion(detail);
    if (!next) return false;
    setSessionSubject(next.subject || null);
    setStarted(false);
    setCompletion(next);
    return true;
  }, []);

  const reset = useCallback(() => {
    setStarted(false);
    setSessionSubject(null);
    setCompletion(null);
  }, []);

  // المسار الجديد يعيد الجلسة إلى IDLE؛ مجرد دخول منطقة العمل ليس WORKING.
  useEffect(() => {
    reset();
  }, [pathname, reset]);

  useEffect(() => {
    function onBegin(event) { begin(event?.detail || {}); }
    function onComplete(event) { complete(event?.detail || {}); }
    function onReset() { reset(); }
    window.addEventListener(WORK_SESSION_EVENT.BEGIN, onBegin);
    window.addEventListener(WORK_SESSION_EVENT.COMPLETE, onComplete);
    window.addEventListener(WORK_SESSION_EVENT.RESET, onReset);
    return () => {
      window.removeEventListener(WORK_SESSION_EVENT.BEGIN, onBegin);
      window.removeEventListener(WORK_SESSION_EVENT.COMPLETE, onComplete);
      window.removeEventListener(WORK_SESSION_EVENT.RESET, onReset);
    };
  }, [begin, complete, reset]);

  const state = completion
    ? WORK_SESSION_STATE.RELEASED
    : started
      ? WORK_SESSION_STATE.WORKING
      : WORK_SESSION_STATE.IDLE;

  useEffect(() => {
    const shell = document.querySelector('.rawDashboardShell');
    if (!shell) return undefined;
    shell.setAttribute('data-work-session-state', state);
    return () => shell.removeAttribute('data-work-session-state');
  }, [state]);

  const value = useMemo(() => Object.freeze({
    state,
    subject:sessionSubject,
    completion,
    begin,
    complete,
    reset,
  }), [begin, complete, completion, reset, sessionSubject, state]);

  function act(action) {
    if (!action) return;
    if (action.reset || !action.href || action.href === pathname) reset();
    if (action.href && action.href !== pathname) router.push(action.href);
  }

  return (
    <WorkSessionContext.Provider value={value}>
      {completion ? <CompletedSurface completion={completion} onAction={act} /> : children}
    </WorkSessionContext.Provider>
  );
}
