import { projectScopeSupabaseRepository } from '@/lib/adapters/project-scope-supabase';
import { itemExecutionState } from '@/lib/projects';
import {
  buildProjectExecutionAssignmentPayload,
  buildProjectExecutionEndPayload,
  buildProjectExecutionStartPayload,
  buildProjectScopeInsertAfter,
  buildProjectScopeNewItem,
  buildProjectScopeWorkspace,
  normalizeProjectScopeItemPatch,
} from '@/lib/project-scope.mjs';

export function createProjectScopeService(repository=projectScopeSupabaseRepository){
  return Object.freeze({
    async loadWorkspace({projectId}){
      if(!projectId)throw new Error('المشروع غير محدد.');
      const primary=await repository.loadPrimary(projectId);
      const executionIds=(primary.executions||[]).map((execution)=>execution.id).filter(Boolean);
      const actuals=executionIds.length?await repository.loadActuals(executionIds):[];
      return buildProjectScopeWorkspace({...primary,actuals});
    },

    async loadCalculations({projectId}){
      if(!projectId)return {items:[],budgets:[],states:[]};
      return repository.loadCalculations(projectId);
    },

    async addLine({projectId,kind}){
      const orders=await repository.loadItemOrders(projectId);
      const maxOrder=orders.length?Math.max(...orders.map((row)=>Number(row.sort_order||0))):0;
      const created=await repository.createItem(buildProjectScopeNewItem({projectId,sortOrder:maxOrder+1,kind}));
      if(!created?.id)throw new Error('تعذر إثبات إضافة السطر إلى نطاق المشروع.');
      return created;
    },

    async insertAfter({projectId,afterOrder,kind}){
      const before=await repository.loadItemOrders(projectId);
      const result=await repository.insertItemAfter(buildProjectScopeInsertAfter({projectId,afterOrder,kind}));
      const after=await repository.loadItemOrders(projectId);
      if(after.length!==before.length+1)throw new Error('تعذر إثبات إدراج السطر في نطاق المشروع.');
      return Object.freeze({result,items:after});
    },

    async updateItem({itemId,fields}){
      if(!itemId)throw new Error('البند غير محدد.');
      return repository.updateItem(itemId,normalizeProjectScopeItemPatch(fields));
    },

    async deleteItem({itemId}){
      if(!itemId)throw new Error('البند غير محدد.');
      const result=await repository.deleteItemSafely(itemId);
      if(!result?.deleted)throw new Error('لم يُحذف البند؛ أعد تحميل الصفحة وحاول مرة أخرى.');
      return Object.freeze({
        deleted:true,
        cancelledPlannedAssignments:Number(result.cancelled_planned_assignments||0),
        result,
      });
    },

    async moveItem({projectId,itemId,direction}){
      if(![-1,1].includes(Number(direction)))throw new Error('اتجاه تحريك البند غير مدعوم.');
      const items=await repository.loadItemOrders(projectId);
      const index=items.findIndex((row)=>row.id===itemId);
      const target=index+Number(direction);
      if(index<0)throw new Error('تعذر العثور على البند في ترتيب المشروع.');
      if(target<0||target>=items.length)return Object.freeze({moved:false});
      await repository.swapOrders(items[index],items[target]);
      return Object.freeze({moved:true});
    },

    async saveExecutionAssignment({itemId,form,executionId=null}){
      const before=await repository.loadItemExecutions(itemId);
      const payload=buildProjectExecutionAssignmentPayload({itemId,form,executionId});
      const result=await repository.saveExecutionAssignment(payload);
      const after=await repository.loadItemExecutions(itemId);
      if(executionId){
        if(!after.some((execution)=>execution.id===executionId))throw new Error('تعذر إثبات تحديث الإسناد المطلوب.');
      }else if(!after.length||(before.length===0&&after.length===0)){
        throw new Error('تعذر إثبات إضافة الإسناد إلى البند.');
      }
      return Object.freeze({result,executions:after});
    },

    async startExecution({executionId,date}){
      const result=await repository.startExecution(buildProjectExecutionStartPayload(executionId,date));
      const proof=await repository.loadExecution(executionId);
      if(!proof?.id||!proof.start_date)throw new Error('تعذر إثبات بدء تنفيذ الإسناد.');
      return Object.freeze({result,proof});
    },

    async endExecution({executionId,form}){
      await repository.endExecution(buildProjectExecutionEndPayload({executionId,form}));
      const proof=await repository.loadExecution(executionId);
      if(!proof?.id||!proof.end_date)throw new Error('تعذر إثبات إقفال الإسناد.');
      return proof;
    },

    async cancelExecution({executionId}){
      const before=await repository.loadExecution(executionId);
      if(!before)throw new Error('الإسناد غير موجود أو أُلغي من جهة أخرى.');
      if(itemExecutionState(before)!=='planned')throw new Error('الإسناد الذي بدأ تنفيذه لا يُلغى؛ يجب إنهاؤه ليبقى تاريخه.');
      const result=await repository.cancelExecution(executionId);
      const proof=await repository.loadExecution(executionId);
      const cancelled=!proof||proof.status==='cancelled'||proof.is_active===false||result===true||result?.cancelled===true;
      if(!cancelled)throw new Error('تعذر إثبات إلغاء الإسناد المخطط.');
      return Object.freeze({cancelled:true,result,proof});
    },
  });
}

export const projectScopeService=createProjectScopeService();
