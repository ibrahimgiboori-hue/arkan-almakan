import { quoteEditorSupabaseRepository } from '@/lib/adapters/quote-editor-supabase';
import {
  buildQuoteEditorWorkspace,
  buildQuoteLineRecord,
  buildQuotePaymentRecord,
  nextQuoteSortOrder,
  sanitizeQuoteLinePatch,
  sanitizeQuotePartyPatch,
  sanitizeQuotePatch,
  sanitizeQuotePaymentPatch,
  workItemRecordFromLine,
  workItemSelectionPatch,
} from '@/lib/quote-editor.mjs';

function requireSingle(rows,message){
  if(!Array.isArray(rows)||rows.length!==1)throw new Error(message);
  return rows[0];
}

export function createQuoteEditorService(repository=quoteEditorSupabaseRepository){
  async function saveLineInternal({quoteId,lineId,fields}){
    const saved=requireSingle(
      await repository.updateLine(quoteId,lineId,sanitizeQuoteLinePatch(fields)),
      'لم يُحفظ البند؛ ربما تغيّر أو لا يتبع هذا العرض.'
    );
    if(saved.quotation_id!==quoteId)throw new Error('تعذر إثبات بقاء البند داخل العرض.');
    return saved;
  }

  return Object.freeze({
    async loadWorkspace({quoteId}){
      if(!quoteId)throw new Error('عرض السعر غير محدد.');
      const [quote,lines,payments,workItems,presets]=await Promise.all([
        repository.loadQuote(quoteId),repository.loadLines(quoteId),repository.loadPayments(quoteId),
        repository.loadWorkItems(),repository.loadPresets(),
      ]);
      return buildQuoteEditorWorkspace({quote,lines,payments,workItems,presets});
    },

    async patchQuote({quoteId,fields}){
      const clean=sanitizeQuotePatch(fields);
      if(!Object.keys(clean).length)return null;
      const saved=requireSingle(await repository.updateQuote(quoteId,clean),'لم يُحفظ العرض؛ ربما تغيّر أو لم يعد متاحًا.');
      if(saved.id!==quoteId)throw new Error('تعذر إثبات حفظ العرض الصحيح.');
      return saved;
    },

    async addLine({quoteId,kind}){
      const current=await repository.loadLines(quoteId);
      const record=buildQuoteLineRecord({quoteId,kind,sortOrder:nextQuoteSortOrder(current)});
      const saved=await repository.insertLine(record);
      if(!saved?.id||saved.quotation_id!==quoteId)throw new Error('تعذر إثبات إضافة البند داخل العرض.');
      return saved;
    },

    async insertAfter({quoteId,afterOrder,kind}){
      await repository.insertLineAfter({quoteId,afterOrder,kind:kind==='title'?'title':'item'});
      return repository.loadLines(quoteId);
    },

    async saveLine(args){
      return saveLineInternal(args);
    },

    async deleteLine({quoteId,lineId}){
      requireSingle(await repository.deleteLine(quoteId,lineId),'لم يُحذف البند؛ ربما تغيّر أو لا يتبع هذا العرض.');
      return true;
    },

    async moveLine({quoteId,lineId,direction}){
      const lines=await repository.loadLines(quoteId);
      const i=lines.findIndex((line)=>line.id===lineId);
      const j=i+Number(direction || 0);
      if(i<0||j<0||j>=lines.length)return lines;
      const a=lines[i],b=lines[j];
      try{
        requireSingle(await repository.setLineSort(quoteId,a.id,-1),'تعذر حجز موضع البند أثناء إعادة الترتيب.');
        requireSingle(await repository.setLineSort(quoteId,b.id,a.sort_order),'تعذر تحريك البند المجاور.');
        requireSingle(await repository.setLineSort(quoteId,a.id,b.sort_order),'تعذر إكمال ترتيب البند.');
      }catch(error){
        try{await repository.setLineSort(quoteId,b.id,b.sort_order);}catch{}
        try{await repository.setLineSort(quoteId,a.id,a.sort_order);}catch{}
        throw error;
      }
      return repository.loadLines(quoteId);
    },

    async pickWorkItem({quoteId,lineId,workItemId}){
      const workItem=await repository.loadWorkItem(workItemId);
      if(!workItem?.id)throw new Error('بند الدليل لم يعد موجودًا.');
      const line=await saveLineInternal({quoteId,lineId,fields:workItemSelectionPatch(workItem)});
      let usageWarning='';
      try{
        requireSingle(await repository.setWorkItemUseCount(workItem.id,Number(workItem.use_count || 0)+1),'تعذر إثبات تحديث عداد استخدام بند الدليل.');
      }catch(error){
        usageWarning='تم تطبيق البند على العرض، لكن تعذر تحديث عداد استخدامه في الدليل: '+(error?.message||error);
      }
      return Object.freeze({line,usageWarning});
    },

    async saveLineToLibrary({line}){
      const saved=await repository.insertWorkItem(workItemRecordFromLine(line));
      if(!saved?.id)throw new Error('تعذر إثبات إضافة البند إلى الدليل.');
      return saved;
    },

    async addPayment({quoteId}){
      const payments=await repository.loadPayments(quoteId);
      const saved=await repository.insertPayment(buildQuotePaymentRecord({quoteId,sortOrder:nextQuoteSortOrder(payments)}));
      if(!saved?.id||saved.quotation_id!==quoteId)throw new Error('تعذر إثبات إضافة الدفعة داخل العرض.');
      return saved;
    },

    async updatePayment({quoteId,paymentId,fields}){
      const saved=requireSingle(
        await repository.updatePayment(quoteId,paymentId,sanitizeQuotePaymentPatch(fields)),
        'لم تُحفظ الدفعة؛ ربما تغيّرت أو لا تتبع هذا العرض.'
      );
      if(saved.quotation_id!==quoteId)throw new Error('تعذر إثبات بقاء الدفعة داخل العرض.');
      return saved;
    },

    async deletePayment({quoteId,paymentId}){
      requireSingle(await repository.deletePayment(quoteId,paymentId),'لم تُحذف الدفعة؛ ربما تغيّرت أو لا تتبع هذا العرض.');
      return true;
    },

    async loadParty({quoteId}){
      if(!quoteId)throw new Error('عرض السعر غير محدد.');
      const [record,employees]=await Promise.all([repository.loadParty(quoteId),repository.loadActiveEmployees()]);
      if(!record?.id)throw new Error('تعذر تحميل بيانات أطراف العرض.');
      return Object.freeze({record:Object.freeze({...record}),employees:Object.freeze([...(employees || [])])});
    },

    async patchParty({quoteId,fields}){
      const clean=sanitizeQuotePartyPatch(fields);
      const saved=requireSingle(await repository.updateQuote(quoteId,clean),'لم تُحفظ بيانات الأطراف؛ ربما تغيّر العرض.');
      if(saved.id!==quoteId)throw new Error('تعذر إثبات حفظ أطراف العرض الصحيح.');
      return saved;
    },
  });
}

export const quoteEditorService=createQuoteEditorService();
