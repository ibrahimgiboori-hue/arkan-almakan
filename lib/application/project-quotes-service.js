import { projectQuotesSupabaseRepository } from '@/lib/adapters/project-quotes-supabase';
import { SYSTEM } from '@/lib/system-constitution';
import { buildProjectQuoteRecord, buildProjectQuotesWorkspace } from '@/lib/project-quotes.mjs';

const settledValue=(result,fallback)=>result.status==='fulfilled'?result.value:fallback;
const settledError=(result,label)=>result.status==='rejected'?`${label}: ${result.reason?.message || result.reason}`:null;

export function createProjectQuotesService(repository=projectQuotesSupabaseRepository){
  return Object.freeze({
    async loadWorkspace({projectId}){
      if(!projectId)throw new Error('المشروع غير محدد.');
      const quotes=await repository.loadQuotes(projectId);
      const ids=quotes.map((quote)=>quote.id).filter(Boolean);

      const [totalsResult,capabilitiesResult,primaryResult,...approvalResults]=await Promise.allSettled([
        repository.loadTotals(ids),
        repository.loadCapabilities(),
        repository.isPrimaryUser(),
        ...ids.map((quoteId)=>repository.loadApprovalState(quoteId)),
      ]);

      const totals=settledValue(totalsResult,[]);
      const capabilities=settledValue(capabilitiesResult,[]);
      const primary=settledValue(primaryResult,false);
      const approvalStates=ids.map((quoteId,index)=>Object.freeze({
        quoteId,
        state:settledValue(approvalResults[index],null),
      }));
      const readErrors=[
        settledError(totalsResult,'إجماليات العروض'),
        settledError(capabilitiesResult,'صلاحيات عروض الأسعار'),
        settledError(primaryResult,'التحقق من المستخدم الرئيسي'),
        ...approvalResults.map((result,index)=>settledError(result,`حالة مراجعة العرض ${quotes[index]?.quote_no || ids[index]}`)),
      ].filter(Boolean);

      return Object.freeze({
        ...buildProjectQuotesWorkspace({quotes,totals,approvalStates,capabilities,primary,projectId}),
        readErrors:Object.freeze(readErrors),
      });
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
