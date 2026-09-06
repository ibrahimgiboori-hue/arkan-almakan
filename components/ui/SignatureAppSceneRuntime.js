'use client';

import { useEffect, useMemo } from 'react';
import { usePathname } from 'next/navigation';

const ROUTE_SCENES = Object.freeze([
  ['/dashboard/recruitment/onboarding', 'workforce-onboarding'],
  ['/dashboard/recruitment/contracts', 'workforce-contracts'],
  ['/dashboard/recruitment/offers', 'workforce-offers'],
  ['/dashboard/leave-history-import', 'workforce-leave-history'],
  ['/dashboard/operating-budget', 'finance-budget'],
  ['/dashboard/system-user', 'admin-access'],
  ['/dashboard/org-structure', 'admin-structure'],
  ['/dashboard/formbuilder', 'documents-builder'],
  ['/dashboard/my-work/approvals', 'work-approvals'],
  ['/dashboard/recruitment', 'workforce-recruitment'],
  ['/dashboard/attendance', 'workforce-attendance'],
  ['/dashboard/employees', 'workforce-employees'],
  ['/dashboard/leaves', 'workforce-leaves'],
  ['/dashboard/advances', 'finance-advances'],
  ['/dashboard/expenses', 'finance-expenses'],
  ['/dashboard/approvals', 'work-approvals'],
  ['/dashboard/archive', 'documents-archive'],
  ['/dashboard/register', 'documents-register'],
  ['/dashboard/documents', 'documents-library'],
  ['/dashboard/board', 'admin-board'],
  ['/dashboard/settings', 'admin-company'],
  ['/dashboard/backup', 'admin-backup'],
  ['/dashboard/quotes', 'projects-quotes'],
  ['/dashboard/contractors', 'projects-contractors'],
  ['/dashboard/entities', 'projects-clients'],
  ['/dashboard/projects', 'projects-portfolio'],
  ['/dashboard/my-work', 'work-my-work'],
  ['/dashboard', 'home'],
]);

export function signatureAppScene(pathname) {
  const path = String(pathname || '');
  if (!path.startsWith('/dashboard')) return null;
  if (/^\/dashboard\/projects\/[^/]+(?:\/|$)/.test(path)) return null;
  const match = ROUTE_SCENES.find(([route]) => path === route || path.startsWith(`${route}/`));
  return match?.[1] || 'home';
}

export default function SignatureAppSceneRuntime() {
  const pathname = usePathname();
  const scene = useMemo(() => signatureAppScene(pathname), [pathname]);

  useEffect(() => {
    const root = document.documentElement;
    if (!root) return undefined;
    if (scene) root.setAttribute('data-signature-app-scene', scene);
    else root.removeAttribute('data-signature-app-scene');
    return () => root.removeAttribute('data-signature-app-scene');
  }, [scene]);

  return null;
}
