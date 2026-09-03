'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ACTION_SIGNAL_STATE, normalizeActionSignalSpec } from '@/lib/action-nervous-system';
import { canTreatAsPersistentLink, normalizeInnervationLink } from '@/lib/persistent-innervation';
import { useWorkSession } from './WorkSessionRuntime';

const ActionNervousSystemContext = createContext(null);

function normalizeError(error) {
  if (!error) return 'تعذر إكمال الإجراء.';
  if (typeof error === 'string') return error;
  return String(error.message || error.details || error.hint || 'تعذر إكمال الإجراء.');
}

function persistentLinksFrom(result) {
  const input = Array.isArray(result?.innervationLinks) ? result.innervationLinks : [];
  return input
    .map((link) => normalizeInnervationLink(link))
    .filter((link) => canTreatAsPersistentLink(link));
}

function setOptionalAttribute(node, name, value) {
  if (!node) return;
  if (value === null || value === undefined || value === '') node.removeAttribute(name);
  else node.setAttribute(name, String(value));
}

export function useActionNervousSystem() {
  const value = useContext(ActionNervousSystemContext);
  if (!value) throw new Error('useActionNervousSystem must be used inside ActionNervousSystemRuntime');
  return value;
}

export default function ActionNervousSystemRuntime({ children }) {
  const workSession = useWorkSession();
  const activeKeysRef = useRef(new Set());
  const [signal, setSignal] = useState({
    phase:ACTION_SIGNAL_STATE.READY,
    activeKey:null,
    label:'',
    subject:null,
    error:null,
    startedAt:null,
  });

  const run = useCallback(async (input, executor) => {
    const spec = normalizeActionSignalSpec(input);
    if (typeof executor !== 'function') throw new Error(`Action ${spec.key} requires an executor`);
    if (activeKeysRef.current.has(spec.key)) {
      return { ok:false, duplicate:true, error:'الإجراء قيد التنفيذ بالفعل.' };
    }

    // الاتصال بالعصب المركزي يعني أن المستخدم بدأ فعلًا إجراءً؛ هنا فقط
    // تتحول جلسة العمل من IDLE إلى WORKING. مجرد دخول منطقة العمل لا يفعل ذلك.
    workSession.begin({ subject:spec.subject || null });
    activeKeysRef.current.add(spec.key);
    setSignal({
      phase:ACTION_SIGNAL_STATE.ACTING,
      activeKey:spec.key,
      label:spec.label,
      subject:spec.subject,
      error:null,
      startedAt:Date.now(),
    });

    try {
      const result = await executor();
      if (result?.error) throw result.error;

      const confirmed = result?.serverConfirmed === true;
      if (!confirmed) {
        setSignal({ phase:ACTION_SIGNAL_STATE.READY, activeKey:null, label:'', subject:null, error:null, startedAt:null });
        return { ...result, ok:result?.ok !== false, serverConfirmed:false };
      }

      const persistentInnervationLinks = persistentLinksFrom(result);
      setSignal({
        phase:ACTION_SIGNAL_STATE.CONFIRMED,
        activeKey:spec.key,
        label:spec.label,
        subject:spec.subject,
        error:null,
        startedAt:null,
      });

      if (result?.completion?.serverConfirmed === true) {
        workSession.complete({
          ...result.completion,
          subject:result.completion.subject || spec.subject || null,
        });
      }

      window.setTimeout(() => {
        setSignal((current) => current.activeKey === spec.key
          ? { phase:ACTION_SIGNAL_STATE.READY, activeKey:null, label:'', subject:null, error:null, startedAt:null }
          : current);
      }, 520);

      return {
        ...result,
        ok:true,
        serverConfirmed:true,
        subject:spec.subject,
        persistentInnervationLinks,
      };
    } catch (error) {
      const message = normalizeError(error);
      setSignal({
        phase:ACTION_SIGNAL_STATE.FAILED,
        activeKey:spec.key,
        label:spec.label,
        subject:spec.subject,
        error:message,
        startedAt:null,
      });
      return { ok:false, error, message, serverConfirmed:false, subject:spec.subject };
    } finally {
      activeKeysRef.current.delete(spec.key);
    }
  }, [workSession]);

  const clearError = useCallback(() => {
    setSignal((current) => current.phase === ACTION_SIGNAL_STATE.FAILED
      ? { phase:ACTION_SIGNAL_STATE.READY, activeKey:null, label:'', subject:null, error:null, startedAt:null }
      : current);
  }, []);

  useEffect(() => {
    const shell = document.querySelector('.rawDashboardShell');
    if (!shell) return undefined;
    shell.setAttribute('data-action-nervous-system', 'hybrid-v1');
    shell.setAttribute('data-action-signal-state', signal.phase);
    setOptionalAttribute(shell, 'data-action-active-key', signal.activeKey);
    setOptionalAttribute(shell, 'data-action-entity-type', signal.subject?.entityType);
    setOptionalAttribute(shell, 'data-action-entity-id', signal.subject?.entityId);
    setOptionalAttribute(shell, 'data-action-stage', signal.subject?.stageKey);
    return () => {
      shell.removeAttribute('data-action-nervous-system');
      shell.removeAttribute('data-action-signal-state');
      shell.removeAttribute('data-action-active-key');
      shell.removeAttribute('data-action-entity-type');
      shell.removeAttribute('data-action-entity-id');
      shell.removeAttribute('data-action-stage');
    };
  }, [signal]);

  const value = useMemo(() => Object.freeze({
    ...signal,
    run,
    clearError,
    isActing:(key = null) => signal.phase === ACTION_SIGNAL_STATE.ACTING && (!key || signal.activeKey === key),
  }), [clearError, run, signal]);

  return (
    <ActionNervousSystemContext.Provider value={value}>
      {children}
    </ActionNervousSystemContext.Provider>
  );
}
