'use client';

import ProjectCustodyWorkspaceEngineered from './ProjectCustodyWorkspaceEngineered';

// Architecture handoff: useProjectOperationContext is consumed inside ProjectCustodyWorkspaceEngineered;
// this route intentionally owns no financial state, Supabase access, evidence storage or guarded writes.
export default function CustodyPage(){
  return <ProjectCustodyWorkspaceEngineered/>;
}
