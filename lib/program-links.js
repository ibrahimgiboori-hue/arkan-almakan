export const PROGRAM_ROOT_PATH = '/';
export const PROGRAM_TODAY_PATH = '/dashboard/today';
export const PROGRAM_WORKSPACE_PATH = '/dashboard/workspace';

export const PROGRAM_PORTALS = Object.freeze([
  { key:'projects', label:'بوابة المشاريع', path:'/dashboard/workspace/projects' },
  { key:'workforce', label:'بوابة الموارد البشرية', path:'/dashboard/workspace/workforce' },
  { key:'finance', label:'بوابة المالية', path:'/dashboard/workspace/finance' },
  { key:'documents', label:'بوابة المستندات', path:'/dashboard/workspace/documents' },
  { key:'admin', label:'بوابة الإدارة', path:'/dashboard/workspace/admin' },
]);

export const PROGRAM_PORTAL_BY_KEY = Object.freeze(
  Object.fromEntries(PROGRAM_PORTALS.map((portal)=>[portal.key,portal]))
);

export function portalProgramPath(key=''){
  return PROGRAM_PORTAL_BY_KEY[key]?.path || PROGRAM_WORKSPACE_PATH;
}

export function projectProgramPath(projectId=''){
  return projectId
    ? `/dashboard/workspace/projects/scope/${encodeURIComponent(String(projectId))}`
    : portalProgramPath('projects');
}
