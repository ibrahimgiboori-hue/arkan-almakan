'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  PROJECT_OPERATION_CONTEXT_EVENT,
  normalizeProjectOperationContext,
  projectOperationContextKey,
  readProjectOperationContext,
  writeProjectOperationContext,
} from './project-operation-context.mjs';
import { todayIsoInRiyadh } from './format';

export function useProjectOperationContext(projectId) {
  const [context, setContext] = useState(() => normalizeProjectOperationContext({ date: todayIsoInRiyadh() }));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!projectId) return undefined;
    const sync = () => {
      setContext(readProjectOperationContext(projectId));
      setReady(true);
    };
    const onCustom = (event) => {
      if (event.detail?.projectId === projectId) setContext(event.detail.context);
    };
    const onStorage = (event) => {
      if (event.key === projectOperationContextKey(projectId)) sync();
    };
    sync();
    window.addEventListener(PROJECT_OPERATION_CONTEXT_EVENT, onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(PROJECT_OPERATION_CONTEXT_EVENT, onCustom);
      window.removeEventListener('storage', onStorage);
    };
  }, [projectId]);

  const patch = useCallback((value) => {
    setContext((current) => {
      const requested = typeof value === 'function' ? value(current) : value;
      const next = writeProjectOperationContext(projectId, requested || {});
      if (['date', 'contractorId', 'from', 'to', 'search'].every((key) => next[key] === current[key])) return current;
      return next;
    });
  }, [projectId]);

  const setDate = useCallback((value) => {
    patch((current) => ({ date: typeof value === 'function' ? value(current.date) : value }));
  }, [patch]);

  const setContractorId = useCallback((value) => {
    patch((current) => ({ contractorId: typeof value === 'function' ? value(current.contractorId) : value }));
  }, [patch]);

  const setRange = useCallback((from, to) => { patch({ from, to }); }, [patch]);
  const setSearch = useCallback((search) => { patch({ search }); }, [patch]);

  return { ...context, ready, setDate, setContractorId, setRange, setSearch, patchContext: patch };
}
