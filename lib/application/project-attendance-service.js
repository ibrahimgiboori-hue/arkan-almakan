import { projectAttendanceSupabaseRepository } from '@/lib/adapters/project-attendance-supabase';
import {
  assertProjectAttendanceRemoval,
  buildProjectAttendanceWorkspace,
  buildProjectAttendanceWriteRows,
  optimisticProjectAttendanceMarks,
  projectAttendanceSourceIds,
  verifiedProjectAttendanceMarks,
} from '@/lib/project-attendance.mjs';
import {
  pendingOperationCount,
  saveOperationWithQueue,
  syncPendingOperations,
} from '@/lib/verified-operation-write';

export function createProjectAttendanceService(repository=projectAttendanceSupabaseRepository){
  return Object.freeze({
    async loadDay({projectId,date}){
      if(!projectId||!date)return buildProjectAttendanceWorkspace({date});
      const context=await repository.loadDayContextSource({projectId,date});
      const ids=projectAttendanceSourceIds({
        date,
        assignmentRows:context.assignmentRows,
        projectContractorRows:context.projectContractorRows,
      });
      const entities=await repository.loadDayEntities({
        dayId:context.dayId,
        contractorIds:ids.contractorIds,
        laborerIds:ids.laborerIds,
      });
      return buildProjectAttendanceWorkspace({
        date,
        assignmentRows:context.assignmentRows,
        projectContractorRows:context.projectContractorRows,
        contractors:entities.contractors,
        laborers:entities.laborers,
        attendanceRows:entities.attendanceRows,
      });
    },

    async saveEntries({projectId,date,entries}){
      if(!entries?.length)return null;
      if(!projectId||!date)throw new Error('سياق المشروع أو تاريخ الحضور غير مكتمل.');
      const result=await saveOperationWithQueue({
        operation:'attendance',
        projectId,
        workDate:date,
        payload:{rows:buildProjectAttendanceWriteRows(entries)},
        batchId:null,
        sourceKind:'live',
        sourceRef:null,
        certainty:'confirmed',
      });
      const marks=result.status==='verified'
        ? verifiedProjectAttendanceMarks(result.receipt?.entity_snapshot,date)
        : optimisticProjectAttendanceMarks(entries,date,result.requestId);
      return Object.freeze({...result,marks});
    },

    async removeEntry({mark,date}){
      assertProjectAttendanceRemoval(mark,date);
      const removed=await repository.removeEntry(mark.id);
      if(!removed)throw new Error('لم يُحذف سجل الحضور؛ ربما تغيّر أو حُذف من جهة أخرى. حدّث اليوم قبل المحاولة مرة أخرى.');
      return true;
    },

    pendingCount(){
      return pendingOperationCount();
    },

    async syncPending(onProgress){
      return syncPendingOperations(onProgress);
    },
  });
}

export const projectAttendanceService=createProjectAttendanceService();
