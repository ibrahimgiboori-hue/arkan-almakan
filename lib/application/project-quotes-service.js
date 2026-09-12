import { projectQuotesSupabaseRepository } from '@/lib/adapters/project-quotes-supabase';
import { SYSTEM } from '@/lib/system-constitution';
import { buildProjectQuoteRecord, buildProjectQuotesWorkspace } from '@/lib/project-quotes.mjs';

export function createProjectQuotesService(repository=projectQuotesSupabaseRepository){
  return Object.freeze({
    async loadWorkspace({projectId}){
      if(!projectId)throw new Error('المشروع غير محدد.');
      const [quotes,capabilities,primary]=await Promise.all([
        repository.loadQuotes(projectId),
        repository.loadCapabilities(),
        repository.isPrimaryUser(),
      ]);
      const ids=quotes.map((quote)=>quote.id).filter(Boolean);
      const [totals,approvalStates]=await Promise.all([
        repository.loadTotals(ids),
        Promise.all(ids.map(async(quoteId)=>Object.freeze({
          quoteId,
          state:await repository.loadApprovalState(quoteId),
        }))),
      ]);
      return buildProjectQuotesWorkspace({quotes,totals,approvalStates,capabilities,primary,projectId});
    },

    async createQuote({projectId,kind='quotation',language='ar'}){
      if(!projectId)throw new Error('المشروع غير محدد.');
      const boq=kind==='boq';
      const [quoteNo,settings]=await Promise.all([
        repository.nextDocumentNumber({docType:boq?'BOQ':'QUOTE',prefix:boq?'BOQ':'QT'}),
        repository.loadSettings(),
      ]);
      const record=buildProjectQuoteRecord({
        projectId,
        kind,
        language,
        quoteNo,
        settings,
        systemVatRate:SYSTEM.vatRate,
      });
      const saved=await repository.insertQuote(record);
      if(!saved?.id||saved.project_id!==projectId||saved.quote_no!==quoteNo){
        throw new Error('تعذر إثبات إنشاء عرض السعر داخل المشروع.');
      }
      return saved;
    },
  });
}

export const projectQuotesService=createProjectQuotesService();
