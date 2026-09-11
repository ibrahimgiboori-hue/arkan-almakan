import { itemBudgetSupabaseRepository } from '@/lib/adapters/item-budget-supabase';
import {
  buildDefaultItemBudget,
  buildItemBudgetLine,
  normalizeItemBudgetLinePatch,
  normalizeItemBudgetPatch,
} from '@/lib/item-budget.mjs';

export function createItemBudgetService(repository=itemBudgetSupabaseRepository){
  return Object.freeze({
    async loadWorkspace({itemId}){
      if(!itemId)throw new Error('البند غير محدد.');
      let budget=await repository.loadBudget(itemId);
      if(!budget){
        budget=await repository.createBudget(buildDefaultItemBudget(itemId));
        if(!budget?.id)throw new Error('تعذر إثبات إنشاء ميزانية البند.');
      }
      const projection=await repository.loadProjection(budget.id);
      return Object.freeze({
        budget:Object.freeze({...budget,...(projection.view||{})}),
        lines:Object.freeze(projection.lines||[]),
      });
    },

    async patchBudget({budgetId,fields}){
      if(!budgetId)throw new Error('الميزانية غير محددة.');
      const saved=await repository.updateBudget(budgetId,normalizeItemBudgetPatch(fields));
      if(!saved?.id)throw new Error('تعذر إثبات حفظ إعدادات الميزانية.');
      return saved;
    },

    async addLine({budgetId,kind}){
      if(!budgetId)throw new Error('الميزانية غير محددة.');
      const projection=await repository.loadProjection(budgetId);
      const maxOrder=projection.lines.length?Math.max(...projection.lines.map((line)=>Number(line.sort_order||0))):0;
      const created=await repository.createLine(buildItemBudgetLine({budgetId,sortOrder:maxOrder+1,kind}));
      if(!created?.id)throw new Error('تعذر إثبات إضافة بند الصرف.');
      return created;
    },

    async updateLine({lineId,fields}){
      if(!lineId)throw new Error('بند الصرف غير محدد.');
      const saved=await repository.updateLine(lineId,normalizeItemBudgetLinePatch(fields));
      if(!saved?.id)throw new Error('تعذر إثبات حفظ بند الصرف.');
      return saved;
    },

    async deleteLine({lineId}){
      if(!lineId)throw new Error('بند الصرف غير محدد.');
      await repository.deleteLine(lineId);
      return true;
    },

    async suggestCrew({budgetId,laborLineId,lock}){
      if(!budgetId||!laborLineId)throw new Error('بيانات بند الأجور غير مكتملة.');
      if(!['techs','workers'].includes(lock))throw new Error('جهة التثبيت في اقتراح الطاقم غير مدعومة.');
      return repository.suggestCrew({budgetId,laborLineId,lock});
    },
  });
}

export const itemBudgetService=createItemBudgetService();
