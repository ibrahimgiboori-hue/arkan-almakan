'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { ACTION_SIGNAL_STATE, normalizeActionSignalSpec } from '@/lib/action-nervous-system';
import { useWorkSession } from './WorkSessionRuntime';

const ActionNervousSystemContext = createContext(null);

function normalizeError(error) {
  if (!error) return 'تعذر إكمال الإجراء.';
  if (typeof error === 'string') return error;
  return String(error.message || error.details || error.hint || 'تعذر إكمال الإجراء.');
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
    error:null,
    startedAt:null,
  });

  const run = useCallback(async (input, executor) => {
    const spec = normalizeActionSignalSpec(input);
    if (typeof executor !== 'function') throw new Error(`Action ${spec.key} requires an executor`);
    if (activeKeysRef.current.has(spec.key)) {
      return { ok:false, duplicate:true, error:'الإجراء قيد التنفيذ بالفعل.' };
    }

    activeKeysRef.current.add(spec.key);
    setSignal({
      phase:ACTION_SIGNAL_STATE.ACTING,
      activeKey:spec.key,
      label:spec.label,
      error:null,
      startedAt:Date.now(),
    });

    try {
      const result = await executor();
      if (result?.error) throw result.error;

      // لا نعلن النجاح لمجرد أن Promise انتهى. العضو يجب أن يؤكد نجاح الخادم صراحة.
      const confirmed = result?.serverConfirmed === true;
      if (!confirmed) {
        setSignal({
          phase:ACTION_SIGNAL_STATE.READY,
          activeKey:null,
          label:'',
          error:null,
          startedAt:null,
        });
        return { ...result, ok:result?.ok !== false, serverConfirmed:false };
      }

      setSignal({
        phase:ACTION_SIGNAL_STATE.CONFIRMED,
        activeKey:spec.key,
        label:spec.label,
        error:null,
        startedAt:null,
      });

      if (result?.completion?.serverConfirmed === true) {
        workSession.complete(result.completion);
      }

      window.setTimeout(() => {
        setSignal((current) => current.activeKey === spec.key
          ? { phase:ACTION_SIGNAL_STATE.READY, activeKey:null, label:'', error:null, startedAt:null }
          : current);
      }, 520);

      return { ...result, ok:true, serverConfirmed:true };
    } catch (error) {
      const message = normalizeError(error);
      setSignal({
        phase:ACTION_SIGNAL_STATE.FAILED,
        activeKey:spec.key,
        label:spec.label,
        error:message,
        startedAt:null,
      });
      return { ok:false, error, message, serverConfirmed:false };
    } finally {
      activeKeysRef.current.delete(spec.key);
    }
  }, [workSession]);

  const clearError = useCallback(() => {
    setSignal((current) => current.phase === ACTION_SIGNAL_STATE.FAILED
      ? { phase:ACTION_SIGNAL_STATE.READY, activeKey:null, label:'', error:null, startedAt:null }
      : current);
  }, []);

  const value = useMemo(() => Object.freeze({
    ...signal,
    run,
    clearError,
    isActing:(key = null) => signal.phase === ACTION_SIGNAL_STATE.ACTING && (!key || signal.activeKey === key),
  }), [clearError, run, signal]);

  return (
    <ActionNervousSystemContext.Provider value={value}>
      <div
        data-action-nervous-system="hybrid-v1"
        data-action-signal-state={signal.phase}
        data-action-active-key={signal.activeKey || undefined}
      >
        {children}
      </div>
    </ActionNervousSystemContext.Provider>
  );
}
