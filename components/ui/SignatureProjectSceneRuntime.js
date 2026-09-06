'use client';

import { useEffect, useMemo } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const VIEW_SCENES = Object.freeze({
  overview:'overview',
  scope:'scope',
  progress:'progress',
  claims:'claims',
  guarantees:'guarantees',
  docs:'documents',
  settings:'settings',
});

const PATH_SCENES = Object.freeze([
  ['/operations/labor', 'labor'],
  ['/operations/output', 'daily-output'],
  ['/operations/movements', 'movements'],
  ['/operations/reports', 'timesheet-reports'],
  ['/operations/expenses', 'expenses'],
  ['/operations/custody', 'custody'],
  ['/operations/finance', 'payments'],
  ['/insights/planning', 'planning'],
  ['/insights/changes', 'changes'],
  ['/insights/cost-control', 'cost-control'],
  ['/insights/correspondence', 'correspondence'],
  ['/quotes', 'quotes'],
  ['/documents', 'documents'],
  ['/materials', 'materials'],
  ['/operations', 'attendance'],
]);

export function signatureProjectScene(pathname, view) {
  const match = String(pathname || '').match(/^\/dashboard\/projects\/[^/]+(\/.*)?$/);
  if (!match) return null;

  const suffix = match[1] || '';
  if (!suffix) return VIEW_SCENES[view] || 'overview';

  const scene = PATH_SCENES.find(([route]) => suffix === route || suffix.startsWith(`${route}/`));
  return scene?.[1] || 'overview';
}

export default function SignatureProjectSceneRuntime() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = searchParams.get('view') || 'overview';
  const scene = useMemo(() => signatureProjectScene(pathname, view), [pathname, view]);

  useEffect(() => {
    const root = document.documentElement;
    if (!root) return undefined;

    if (scene) root.setAttribute('data-signature-project-scene', scene);
    else root.removeAttribute('data-signature-project-scene');

    return () => root.removeAttribute('data-signature-project-scene');
  }, [scene]);

  return null;
}
