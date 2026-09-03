'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { WORK_COMPLETION_KIND, WORK_SESSION_STATE } from '@/lib/work-session-constitution';
import { normalizeInnervationSubject } from '@/lib/persistent-innervation';

export const WORK_SESSION_EVENT = Object.freeze({
  BEGIN: 'arkan:work-session-begin',
  DIRTY: 'arkan:work-session-dirty',
  CLEAN: 'arkan:work-session-clean',
  NAVIGATE: 'arkan:work-session-navigate',
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

export function emitWorkSessionDirty(detail = {}) {
  if (typeof window === 'undefined') return false;
  window.dispatchEvent(new CustomEvent(WORK_SESSION_EVENT.DIRTY, { detail }));
  return true;
}

export function emitWorkSessionClean() {
  if (typeof window === 'undefined') return false;
  window.dispatchEvent(new CustomEvent(WORK_SESSION_EVENT.CLEAN));
  return true;
}

// الملاحة تطلب الانتقال فقط. إذا كان هناك تقدم غير محفوظ، الجلسة ترفض الانتقال
// لحظيًا وتعرض خيارات حقيقية قبل أن تسمح بتغيير المسار.
export function requestWorkSessionNavigation(href, options = {}) {
  if (typeof window === 'undefined' || !href) return true;
  const detail = { href:String(href), replace:options.replace === true, accepted:true };
  window.dispatchEvent(new CustomEvent(WORK_SESSION_EVENT.NAVIGATE, { detail }));
  return detail.accepted !== false;
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

function UnsavedNavigationGuard({ pending, canSaveDraft, busy, error, onContinue, onSaveDraft, onDiscard }) {
  if (!pending) return null;
  return (
    <section className="appUnsavedNavigationGuard" data-unsaved-navigation-guard="true" aria-live="polite">
      <div className="appUnsavedNavigationCopy">
        <strong>لديك تقدم غير محفوظ في هذا الإجراء.</strong>
        <span>أكمل ما بدأته أو احفظ مسودة قبل الانتقال. تجاهل التقدم قد لا يضمن حفظ ما لم يُحفظ بعد.</span>
        {error ? <span className="appUnsavedNavigationError">{error}</span> : null}
      </div>
      <div className="appUnsavedNavigationActions">
        <button type="button" onClick={onContinue} disabled={busy}>إكمال الإجراء</button>
        {canSaveDraft ? <button type="button" onClick={onSaveDraft} disabled={busy}>{busy ? 'جارٍ حفظ المسودة…' : 'حفظ مسودة والمتابعة'}</button> : null}
        <button type="button" className="appUnsavedDiscard" onClick={onDiscard} disabled={busy}>تجاهل والمتابعة</button>
      </div>
    </section>
  );
}

export default function WorkSessionRuntime({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sessionSubject, setSessionSubject] = useState(null);
  const [started, setStarted] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [draftSaver, setDraftSaver] = useState(null);
  const [pendingNavigation, setPendingNavigation] = useState(null);
  const [guardBusy, setGuardBusy] = useState(false);
  const [guardError, setGuardError] = useState('');
  const [completion, setCompletion] = useState(null);

  const begin = useCallback((detail = {}) => {
    setCompletion(null);
    setSessionSubject(normalizeInnervationSubject(detail.subject || detail || {}));
    setStarted(true);
    return true;
  }, []);

  const markDirty = useCallback((detail = {}) => {
    setCompletion(null);
    setStarted(true);
    setDirty(true);
    setGuardError('');
    if (typeof detail?.saveDraft === 'function') setDraftSaver(() => detail.saveDraft);
    if (detail?.subject) setSessionSubject(normalizeInnervationSubject(detail.subject));
    return true;
  }, []);

  const markClean = useCallback(() => {
    setDirty(false);
    setDraftSaver(null);
    setPendingNavigation(null);
    setGuardError('');
    return true;
  }, []);

  const complete = useCallback((detail) => {
    const next = normalizeCompletion(detail);
    if (!next) return false;
    setSessionSubject(next.subject || null);
    setStarted(false);
    setDirty(false);
    setDraftSaver(null);
    setPendingNavigation(null);
    setGuardError('');
    setCompletion(next);
    return true;
  }, []);

  const reset = useCallback(() => {
    setStarted(false);
    setDirty(false);
    setDraftSaver(null);
    setPendingNavigation(null);
    setGuardBusy(false);
    setGuardError('');
    setSessionSubject(null);
    setCompletion(null);
  }, []);

  // المسار الجديد يعيد الجلسة إلى IDLE؛ مجرد دخول منطقة العمل ليس WORKING.
  useEffect(() => {
    reset();
  }, [pathname, reset]);

  useEffect(() => {
    function onBegin(event) { begin(event?.detail || {}); }
    function onDirty(event) { markDirty(event?.detail || {}); }
    function onClean() { markClean(); }
    function onComplete(event) { complete(event?.detail || {}); }
    function onReset() { reset(); }
    function onNavigate(event) {
      const detail = event?.detail;
      if (!detail?.href) return;
      if (!dirty) {
        detail.accepted = true;
        return;
      }
      detail.accepted = false;
      setPendingNavigation({ href:String(detail.href), replace:detail.replace === true });
      setGuardError('');
    }
    window.addEventListener(WORK_SESSION_EVENT.BEGIN, onBegin);
    window.addEventListener(WORK_SESSION_EVENT.DIRTY, onDirty);
    window.addEventListener(WORK_SESSION_EVENT.CLEAN, onClean);
    window.addEventListener(WORK_SESSION_EVENT.NAVIGATE, onNavigate);
    window.addEventListener(WORK_SESSION_EVENT.COMPLETE, onComplete);
    window.addEventListener(WORK_SESSION_EVENT.RESET, onReset);
    return () => {
      window.removeEventListener(WORK_SESSION_EVENT.BEGIN, onBegin);
      window.removeEventListener(WORK_SESSION_EVENT.DIRTY, onDirty);
      window.removeEventListener(WORK_SESSION_EVENT.CLEAN, onClean);
      window.removeEventListener(WORK_SESSION_EVENT.NAVIGATE, onNavigate);
      window.removeEventListener(WORK_SESSION_EVENT.COMPLETE, onComplete);
      window.removeEventListener(WORK_SESSION_EVENT.RESET, onReset);
    };
  }, [begin, complete, dirty, markClean, markDirty, reset]);

  useEffect(() => {
    if (!dirty) return undefined;
    function beforeUnload(event) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  const state = completion
    ? WORK_SESSION_STATE.RELEASED
    : dirty
      ? WORK_SESSION_STATE.DIRTY
      : started
        ? WORK_SESSION_STATE.WORKING
        : WORK_SESSION_STATE.IDLE;

  useEffect(() => {
    const shell = document.querySelector('.rawDashboardShell');
    if (!shell) return undefined;
    shell.setAttribute('data-work-session-state', state);
    shell.setAttribute('data-work-session-dirty', dirty ? 'true' : 'false');
    return () => {
      shell.removeAttribute('data-work-session-state');
      shell.removeAttribute('data-work-session-dirty');
    };
  }, [dirty, state]);

  const value = useMemo(() => Object.freeze({
    state,
    dirty,
    subject:sessionSubject,
    completion,
    begin,
    markDirty,
    markClean,
    complete,
    reset,
  }), [begin, complete, completion, dirty, markClean, markDirty, reset, sessionSubject, state]);

  function performNavigation(target) {
    if (!target?.href) return;
    if (target.replace) router.replace(target.href);
    else router.push(target.href);
  }

  function continueCurrentWork() {
    setPendingNavigation(null);
    setGuardError('');
  }

  async function saveDraftAndContinue() {
    if (!pendingNavigation || typeof draftSaver !== 'function' || guardBusy) return;
    setGuardBusy(true);
    setGuardError('');
    try {
      const result = await draftSaver();
      const confirmed = result === true || result?.serverConfirmed === true;
      if (!confirmed) {
        setGuardError('لم يؤكد النظام حفظ المسودة. ابقَ في الإجراء وتحقق من الحفظ قبل الانتقال.');
        return;
      }
      const target = pendingNavigation;
      setDirty(false);
      setDraftSaver(null);
      setPendingNavigation(null);
      performNavigation(target);
    } catch (error) {
      setGuardError(error?.message ? `تعذر حفظ المسودة: ${error.message}` : 'تعذر حفظ المسودة.');
    } finally {
      setGuardBusy(false);
    }
  }

  function discardAndContinue() {
    if (!pendingNavigation) return;
    const target = pendingNavigation;
    setDirty(false);
    setDraftSaver(null);
    setPendingNavigation(null);
    setGuardError('');
    performNavigation(target);
  }

  function act(action) {
    if (!action) return;
    if (action.reset || !action.href || action.href === pathname) reset();
    if (action.href && action.href !== pathname) router.push(action.href);
  }

  return (
    <WorkSessionContext.Provider value={value}>
      {completion ? <CompletedSurface completion={completion} onAction={act} /> : <>
        <UnsavedNavigationGuard
          pending={pendingNavigation}
          canSaveDraft={typeof draftSaver === 'function'}
          busy={guardBusy}
          error={guardError}
          onContinue={continueCurrentWork}
          onSaveDraft={saveDraftAndContinue}
          onDiscard={discardAndContinue}
        />
        {children}
      </>}
    </WorkSessionContext.Provider>
  );
}
