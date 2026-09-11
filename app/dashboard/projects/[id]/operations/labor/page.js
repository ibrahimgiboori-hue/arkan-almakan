'use client';

import ProjectLaborWorkspaceEngineered from './ProjectLaborWorkspaceEngineered';

// Architecture handoff: useProjectOperationContext is consumed inside ProjectLaborWorkspaceEngineered;
// this route intentionally owns no project-operation state or persistence.
export default function ProjectLaborPage(){
  return <ProjectLaborWorkspaceEngineered/>;
}
