export async function assignExistingLaborers({ supabase, workers, projectId, contractorId, effectiveFrom }) {
  const queue = (workers || []).filter((worker) => worker?.id);
  if (!queue.length) return { assigned: 0, failed: [] };

  const failed = [];
  let assigned = 0;

  for (const worker of queue) {
    const { error } = await supabase.rpc('fn_assign_existing_laborer', {
      p_laborer_id: worker.id,
      p_project_id: projectId,
      p_contractor_id: contractorId,
      p_effective_from: effectiveFrom,
    });
    if (error) failed.push({ worker, error });
    else assigned += 1;
  }

  return { assigned, failed };
}
