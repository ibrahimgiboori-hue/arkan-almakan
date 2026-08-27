import { redirect } from 'next/navigation';
import { PROGRAM_PORTAL_BY_KEY, PROGRAM_WORKSPACE_PATH } from '@/lib/program-links';

export default function ScopedWorkspaceEntry({ params }){
  const portal=String(params?.portal||'');
  const id=String(params?.id||'');
  if(!PROGRAM_PORTAL_BY_KEY[portal]) redirect(PROGRAM_WORKSPACE_PATH);
  if(portal==='projects'&&id) redirect(`/dashboard/projects/${encodeURIComponent(id)}`);
  redirect(PROGRAM_PORTAL_BY_KEY[portal].path);
}
