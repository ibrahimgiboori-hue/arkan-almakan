'use client';

import { createContext, useContext, useEffect, useMemo } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { resolveWorkSurface, surfaceDataAttributes } from '@/lib/work-surface-constitution';

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

export default function WorkSurfaceRuntime({ children }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const surface = useMemo(() => resolveWorkSurface(pathname, searchParams), [pathname, searchParams]);

  useEffect(() => {
    const shell = document.querySelector('.rawDashboardShell');
    if (!shell) return undefined;
    const attrs = surfaceDataAttributes(surface);
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
        window.dispatchEvent(new CustomEvent(WORK_SURFACE_EVENT.PAGE_COMMAND, { detail:{ pathname, surface } }));
        return;
      }

      if (!typing && event.key === 'Escape') {
        window.dispatchEvent(new CustomEvent(WORK_SURFACE_EVENT.CLOSE_CONTEXT, { detail:{ pathname, surface } }));
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pathname, surface]);

  return <WorkSurfaceContext.Provider value={surface}>{children}</WorkSurfaceContext.Provider>;
}
