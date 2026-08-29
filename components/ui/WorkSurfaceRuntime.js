'use client';

import { createContext, useContext, useEffect, useMemo } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { resolveWorkSurface, surfaceDataAttributes } from '@/lib/work-surface-constitution';
import { interfaceDataAttributes } from '@/lib/interface-constitution';

const WorkSurfaceContext = createContext(null);

export const WORK_SURFACE_EVENT = Object.freeze({
  PAGE_COMMAND: 'arkan:page-command-requested',
  CLOSE_CONTEXT: 'arkan:close-context-requested',
});

export function useWorkSurface() {
  return useContext(WorkSurfaceContext);
}

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return target.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';
}

function focusPageCommandTrigger() {
  const trigger = document.querySelector('[data-page-command-trigger="true"]');
  if (!(trigger instanceof HTMLElement)) return false;
  trigger.focus();
  if (trigger instanceof HTMLButtonElement) trigger.click();
  return true;
}

function closeNearestOpenContext() {
  const openDetails = Array.from(document.querySelectorAll('details[open]')).reverse();
  const contextual = openDetails.find((node) =>
    node.matches('[data-view-options], [data-action-placement="secondary-overflow"], [data-context-panel]')
  );
  if (contextual instanceof HTMLDetailsElement) {
    contextual.open = false;
    contextual.querySelector('summary')?.focus?.();
    return true;
  }
  return false;
}

export default function WorkSurfaceRuntime({ children }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const surface = useMemo(() => resolveWorkSurface(pathname, searchParams), [pathname, searchParams]);

  useEffect(() => {
    const shell = document.querySelector('.rawDashboardShell');
    if (!shell) return undefined;
    const attrs = { ...surfaceDataAttributes(surface), ...interfaceDataAttributes() };
    for (const [name, value] of Object.entries(attrs)) shell.setAttribute(name, String(value));
    shell.setAttribute('data-work-surface-policy', 'program-driven-notebook-v2');
    return () => {
      for (const name of Object.keys(attrs)) shell.removeAttribute(name);
      shell.removeAttribute('data-work-surface-policy');
    };
  }, [surface]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.defaultPrevented) return;
      const typing = isTypingTarget(event.target);

      if (!typing && event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        const handled = focusPageCommandTrigger();
        window.dispatchEvent(new CustomEvent(WORK_SURFACE_EVENT.PAGE_COMMAND, { detail:{ pathname, surface, handled } }));
        return;
      }

      if (!typing && event.key === 'Escape') {
        const handled = closeNearestOpenContext();
        window.dispatchEvent(new CustomEvent(WORK_SURFACE_EVENT.CLOSE_CONTEXT, { detail:{ pathname, surface, handled } }));
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pathname, surface]);

  return <WorkSurfaceContext.Provider value={surface}>{children}</WorkSurfaceContext.Provider>;
}
