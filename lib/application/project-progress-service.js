import { projectProgressSupabaseRepository } from '@/lib/adapters/project-progress-supabase';
import { todayIsoInRiyadh } from '@/lib/format';
import {
  assertProgressClaimImpactAcknowledged,
  buildProgressEditPayload,
  buildProgressRecordPayload,
  buildProjectProgressWorkspace,
  progressEntryClaimImpact,
} from '@/lib/project-progress.mjs';

export function createProjectProgressService(repository=projectProgressSupabaseRepository){
  return Object.freeze({
    async loadWorkspace({projectId}){
      if(!projectId)throw new Error('المشروع غير محدد.');
      const rows=await repository.loadProgressRows(projectId);
      const itemIds=rows.map((row)=>row.project_item_id).filter(Boolean);
      const entries=await repository.loadEntries(itemIds);
      const claimIds=[...new Set(entries.map((entry)=>entry.claim_id).filter(Boolean))];
      const claims=await repository.loadClaims(claimIds);
      return buildProjectProgressWorkspace({progressRows:rows,entries,claims});
    },

    async record({item,form}){
      const payload=buildProgressRecordPayload({item,form,defaultDate:todayIsoInRiyadh()});
      const created=await repository.createEntry(payload);
      if(!created?.id)throw new Error('تعذر إثبات تسجيل الإنجاز.');
      return created;
    },

    async loadMutationImpact({entryId}){
      const entry=await repository.loadEntry(entryId);
      if(!entry)throw new Error('تعذر العثور على تسجيل الإنجاز؛ حدّث الصفحة.');
      const claim=entry.claim_id?await repository.loadClaim(entry.claim_id):null;
      return Object.freeze({entry,claim,impact:progressEntryClaimImpact(entry,claim)});
    },

    async updateEntry({entryId,draft,reason='',acknowledgeClaimImpact=false}){
      const current=await repository.loadEntry(entryId);
      if(!current)throw new Error('تعذر العثور على تسجيل الإنجاز؛ ربما حُذف من جهة أخرى.');
      const claim=current.claim_id?await repository.loadClaim(current.claim_id):null;
      const impact=assertProgressClaimImpactAcknowledged(current,claim,acknowledgeClaimImpact);
      const payload=buildProgressEditPayload({entry:current,draft,reason,editDate:todayIsoInRiyadh()});
      const saved=await repository.updateEntry(entryId,payload);
      return Object.freeze({saved,impact,claim});
    },

    async deleteEntry({entryId,acknowledgeClaimImpact=false}){
      const current=await repository.loadEntry(entryId);
      if(!current)throw new Error('تعذر العثور على تسجيل الإنجاز؛ ربما حُذف من جهة أخرى.');
      const claim=current.claim_id?await repository.loadClaim(current.claim_id):null;
      const impact=assertProgressClaimImpactAcknowledged(current,claim,acknowledgeClaimImpact);
      await repository.deleteEntry(entryId);
      return Object.freeze({deleted:true,impact,claim});
    },
  });
}

export const projectProgressService=createProjectProgressService();
