import { projectDailyLedgerSupabaseRepository } from '@/lib/adapters/project-daily-ledger-supabase';
import {
  PROJECT_MOVEMENTS_MAX_DAYS,
  mergeProjectDailyLedgers,
  normalizeProjectDailyLedger,
} from '@/lib/project-daily-ledger.mjs';
import { projectLedgerRangeProblem, projectOperationDays } from '@/lib/project-operation-context.mjs';

const PARALLEL_DAYS=6;

export function createProjectDailyLedgerService(repository=projectDailyLedgerSupabaseRepository){
  const service={
    async load({projectId,date}){
      if(!projectId||!date)return normalizeProjectDailyLedger({});
      return normalizeProjectDailyLedger(await repository.load({projectId,date}));
    },

    /** Every movement of the project over a period: the canonical daily ledger, day by day, merged into one sheet. */
    async loadRange({projectId,from,to}){
      if(!projectId)return mergeProjectDailyLedgers([]);
      const problem=projectLedgerRangeProblem(from,to,PROJECT_MOVEMENTS_MAX_DAYS);
      if(problem)throw new Error(problem);
      const dates=projectOperationDays(from,to,PROJECT_MOVEMENTS_MAX_DAYS);
      const days=[];
      for(let index=0;index<dates.length;index+=PARALLEL_DAYS){
        const batch=dates.slice(index,index+PARALLEL_DAYS);
        days.push(...await Promise.all(batch.map(async(date)=>({date,ledger:await service.load({projectId,date})}))));
      }
      return mergeProjectDailyLedgers(days);
    },
  };
  return Object.freeze(service);
}

export const projectDailyLedgerService=createProjectDailyLedgerService();
