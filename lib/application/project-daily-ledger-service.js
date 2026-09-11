import { projectDailyLedgerSupabaseRepository } from '@/lib/adapters/project-daily-ledger-supabase';
import { normalizeProjectDailyLedger } from '@/lib/project-daily-ledger.mjs';

export function createProjectDailyLedgerService(repository=projectDailyLedgerSupabaseRepository){
  return Object.freeze({
    async load({projectId,date}){
      if(!projectId||!date)return normalizeProjectDailyLedger({});
      return normalizeProjectDailyLedger(await repository.load({projectId,date}));
    },
  });
}

export const projectDailyLedgerService=createProjectDailyLedgerService();
