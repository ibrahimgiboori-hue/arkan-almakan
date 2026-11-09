import { projectDailyLedgerSupabaseRepository } from '@/lib/adapters/project-daily-ledger-supabase';
import { PROJECT_MOVEMENTS_MAX_DAYS, normalizeProjectDailyLedger } from '@/lib/project-daily-ledger.mjs';
import { projectLedgerRangeProblem } from '@/lib/project-operation-context.mjs';

export function createProjectDailyLedgerService(repository=projectDailyLedgerSupabaseRepository){
  return Object.freeze({
    /** Every movement of the project over a period — one call; rows carry their date and contractor. */
    async loadRange({projectId,from,to}){
      if(!projectId)return normalizeProjectDailyLedger({});
      const problem=projectLedgerRangeProblem(from,to,PROJECT_MOVEMENTS_MAX_DAYS);
      if(problem)throw new Error(problem);
      return normalizeProjectDailyLedger(await repository.loadRange({projectId,from,to}));
    },
  });
}

export const projectDailyLedgerService=createProjectDailyLedgerService();
