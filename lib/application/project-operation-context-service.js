import { projectOperationContextSupabaseRepository } from '@/lib/adapters/project-operation-context-supabase';
import { selectRosterAssignmentsForDate } from '@/lib/site-operation-roster.mjs';

const naturalCompare=(a='',b='')=>String(a).localeCompare(String(b),'ar',{numeric:true,sensitivity:'base'});

export function createProjectOperationContextService(repository=projectOperationContextSupabaseRepository){
  return Object.freeze({
    async loadContractors({projectId,date}){
      if(!projectId||!date)return [];
      const [links,assignmentRows]=await Promise.all([
        repository.loadLinks({projectId,date}),
        repository.loadAssignments({projectId,date}),
      ]);
      const assignments=selectRosterAssignmentsForDate(assignmentRows,date);
      const ids=[...new Set([
        ...(links||[]).map((row)=>row.contractor_id),
        ...assignments.map((row)=>row.contractor_id),
      ].filter(Boolean))];
      const contractors=await repository.loadContractors(ids);
      return (contractors||[]).map((contractor)=>({
        ...contractor,
        project_basis:(links||[]).find((row)=>row.contractor_id===contractor.id)?.basis||null,
      })).sort((a,b)=>naturalCompare(a.name_ar,b.name_ar));
    },
  });
}

export const projectOperationContextService=createProjectOperationContextService();
