/**
 * Operations governance — canonical operational read model.
 *
 * Constitutional ownership (verified against the live database):
 * - project_contractors owns the CURRENT project <-> contractor commercial/profile row
 *   (default pay basis, rates and charge rules). It is one row per project/contractor and
 *   is NOT the historical execution-period ledger.
 * - item_execution owns contractor <-> project-item execution assignments across time.
 *   A project item can have several assignments across time and can be split between
 *   contractors (share_qty/share_percent), so execution_id is the canonical write key.
 * - labor_project_assignments owns laborer <-> project <-> contractor periods.
 * - laborers.contractor_id/project_id are legacy compatibility/cache fields only.
 * - approved/historical attendance and financial snapshots remain frozen and never
 *   re-resolve through this live model.
 *
 * The UI must not decide "who operates this project today" from one table. It consumes
 * this resolver, which derives one operational projection from the three canonical
 * concept-specific sources above.
 */
import { assignmentOverlaps } from './assignment-period.mjs';

// Kept for backward compatibility with the unpublished Patch-1 API. The state now means
// operational evidence on the selected date, not project_contractors date validity.
export const CONTRACTOR_DATE_STATE = Object.freeze({
  ELIGIBLE: 'eligible',
  OUT_OF_RANGE: 'out_of_range',
  NONE: 'none',
});

export const CONTRACTOR_READINESS = Object.freeze({
  READY: 'ready',
  NEEDS_LABOR: 'needs_labor',
  READY_TO_START: 'ready_to_start',
  NEEDS_EXECUTION_ASSIGNMENT: 'needs_execution_assignment',
  BLOCKED: 'blocked',
  DATA_ISSUE: 'data_issue',
});

export const INTEGRITY_ISSUE = Object.freeze({
  STARTED_EXECUTION_WITHOUT_PROJECT_CONTRACTOR_PROFILE: 'started_execution_without_project_contractor_profile',
  LABOR_ASSIGNMENT_WITHOUT_PROJECT_CONTRACTOR_PROFILE: 'labor_assignment_without_project_contractor_profile',
  MISSING_CONTRACTOR_ENTITY: 'missing_contractor_entity',
  MISSING_LABORER_ENTITY: 'missing_laborer_entity',
});

export const LIVE_OPERATION_BLOCKER = Object.freeze({
  PROJECT_PROFILE_MISSING: 'project_profile_missing',
  PROJECT_PROFILE_DISABLED_NOW: 'project_profile_disabled_now',
  MISSING_CONTRACTOR_ENTITY: 'missing_contractor_entity',
  CONTRACTOR_ENTITY_INACTIVE: 'contractor_entity_inactive',
  ASSIGNMENT_NOT_VALID_FOR_DATE: 'assignment_not_valid_for_date',
  MISSING_LABORER_ENTITY: 'missing_laborer_entity',
  LABORER_ENTITY_INACTIVE: 'laborer_entity_inactive',
});

function executionCoversDate(execution, date) {
  if (!execution?.start_date || !date) return false;
  return execution.start_date <= date && (!execution.end_date || execution.end_date >= date);
}

function executionIsPlanned(execution) {
  return !!execution && !execution.start_date && !execution.end_date;
}

function groupByContractor(rows = []) {
  const map = new Map();
  for (const row of rows || []) {
    if (!row?.contractor_id) continue;
    if (!map.has(row.contractor_id)) map.set(row.contractor_id, []);
    map.get(row.contractor_id).push(row);
  }
  return map;
}

function profileByContractor(rows = []) {
  return new Map((rows || []).filter((row) => row?.contractor_id).map((row) => [row.contractor_id, row]));
}

export function detectOperationIntegrityIssues(projectContractors = [], itemExecutions = [], assignments = []) {
  const profiles = profileByContractor(projectContractors);
  const issues = [];

  for (const execution of itemExecutions || []) {
    if (!execution?.contractor_id || !execution.start_date) continue;
    if (!profiles.has(execution.contractor_id)) {
      issues.push({
        type: INTEGRITY_ISSUE.STARTED_EXECUTION_WITHOUT_PROJECT_CONTRACTOR_PROFILE,
        contractorId: execution.contractor_id,
        executionId: execution.id,
        projectItemId: execution.project_item_id,
        execution,
      });
    }
  }

  for (const assignment of assignments || []) {
    if (!assignment?.contractor_id) continue;
    if (!profiles.has(assignment.contractor_id)) {
      issues.push({
        type: INTEGRITY_ISSUE.LABOR_ASSIGNMENT_WITHOUT_PROJECT_CONTRACTOR_PROFILE,
        contractorId: assignment.contractor_id,
        laborerId: assignment.laborer_id,
        assignment,
      });
    }
  }

  return issues;
}

function detectEntityIntegrityIssues({ contractorIds = [], laborerIds = [], contractors = [], laborers = [] }) {
  const contractorSet = new Set((contractors || []).map((row) => row.id));
  const laborerSet = new Set((laborers || []).map((row) => row.id));
  const issues = [];

  for (const contractorId of new Set(contractorIds.filter(Boolean))) {
    if (!contractorSet.has(contractorId)) {
      issues.push({ type:INTEGRITY_ISSUE.MISSING_CONTRACTOR_ENTITY, contractorId });
    }
  }
  for (const laborerId of new Set(laborerIds.filter(Boolean))) {
    if (!laborerSet.has(laborerId)) {
      issues.push({ type:INTEGRITY_ISSUE.MISSING_LABORER_ENTITY, laborerId });
    }
  }
  return issues;
}

function contractorLiveBlockers({ projectProfilePresent, projectProfileEnabledNow, contractorEntityPresent, contractorEntityActiveNow }) {
  const blockers = [];
  if (!projectProfilePresent) blockers.push(LIVE_OPERATION_BLOCKER.PROJECT_PROFILE_MISSING);
  else if (!projectProfileEnabledNow) blockers.push(LIVE_OPERATION_BLOCKER.PROJECT_PROFILE_DISABLED_NOW);
  if (!contractorEntityPresent) blockers.push(LIVE_OPERATION_BLOCKER.MISSING_CONTRACTOR_ENTITY);
  else if (!contractorEntityActiveNow) blockers.push(LIVE_OPERATION_BLOCKER.CONTRACTOR_ENTITY_INACTIVE);
  return blockers;
}

function laborerLiveBlockers({ contractorBlockers, assignmentDateEligible, laborerEntityPresent, laborerEntityActiveNow }) {
  const blockers = [...contractorBlockers];
  if (!assignmentDateEligible) blockers.push(LIVE_OPERATION_BLOCKER.ASSIGNMENT_NOT_VALID_FOR_DATE);
  if (!laborerEntityPresent) blockers.push(LIVE_OPERATION_BLOCKER.MISSING_LABORER_ENTITY);
  else if (!laborerEntityActiveNow) blockers.push(LIVE_OPERATION_BLOCKER.LABORER_ENTITY_INACTIVE);
  return [...new Set(blockers)];
}

function readinessForContractor({ hasIntegrityIssue, availableForNewLiveOperation, executionDateEligible, plannedExecutionCount, laborAvailableCount }) {
  if (hasIntegrityIssue) return CONTRACTOR_READINESS.DATA_ISSUE;
  if (!availableForNewLiveOperation) return CONTRACTOR_READINESS.BLOCKED;
  if (executionDateEligible && laborAvailableCount > 0) return CONTRACTOR_READINESS.READY;
  if (executionDateEligible) return CONTRACTOR_READINESS.NEEDS_LABOR;
  if (plannedExecutionCount > 0) return CONTRACTOR_READINESS.READY_TO_START;
  return CONTRACTOR_READINESS.NEEDS_EXECUTION_ASSIGNMENT;
}

export function buildProjectOperationRoster({
  projectId,
  date,
  projectContractors = [],
  itemExecutions = [],
  assignments = [],
  contractors = [],
  laborers = [],
}) {
  if (!projectId) throw new Error('buildProjectOperationRoster: projectId is required');
  if (!date) throw new Error('buildProjectOperationRoster: date is required');

  const profiles = profileByContractor(projectContractors);
  const executionsByContractor = groupByContractor(itemExecutions);
  const assignmentsByContractor = groupByContractor(assignments);
  const contractorById = new Map((contractors || []).map((row) => [row.id, row]));
  const laborerById = new Map((laborers || []).map((row) => [row.id, row]));
  const contractorIds = new Set([
    ...profiles.keys(),
    ...executionsByContractor.keys(),
    ...assignmentsByContractor.keys(),
  ]);

  const relationshipIssues = detectOperationIntegrityIssues(projectContractors, itemExecutions, assignments);
  const entityIssues = detectEntityIntegrityIssues({
    contractorIds:[...contractorIds],
    laborerIds:assignments.map((row) => row.laborer_id),
    contractors,
    laborers,
  });
  const integrityIssues = [...relationshipIssues, ...entityIssues];

  const contractorEntries = [];
  for (const contractorId of contractorIds) {
    const projectProfile = profiles.get(contractorId) || null;
    const projectProfilePresent = !!projectProfile;
    const projectProfileEnabledNow = projectProfilePresent && projectProfile.is_active !== false;
    const executionAssignments = executionsByContractor.get(contractorId) || [];
    const executionAssignmentsForSelectedDate = executionAssignments.filter((row) => executionCoversDate(row, date));
    const plannedExecutionAssignments = executionAssignments.filter(executionIsPlanned);
    const executionDateEligible = executionAssignmentsForSelectedDate.length > 0;

    const contractor = contractorById.get(contractorId) || null;
    const contractorEntityPresent = !!contractor;
    const contractorEntityActiveNow = contractorEntityPresent && contractor.is_active !== false;
    const liveOperationBlockers = contractorLiveBlockers({
      projectProfilePresent,
      projectProfileEnabledNow,
      contractorEntityPresent,
      contractorEntityActiveNow,
    });
    const availableForNewLiveOperation = liveOperationBlockers.length === 0;

    const laborerEntries = (assignmentsByContractor.get(contractorId) || []).map((assignment) => {
      const laborer = laborerById.get(assignment.laborer_id) || null;
      const assignmentDateEligible = assignmentOverlaps(assignment, date, date);
      const laborerEntityPresent = !!laborer;
      const laborerEntityActiveNow = laborerEntityPresent && laborer.is_active !== false;
      const blockers = laborerLiveBlockers({
        contractorBlockers:liveOperationBlockers,
        assignmentDateEligible,
        laborerEntityPresent,
        laborerEntityActiveNow,
      });
      return {
        laborerId:assignment.laborer_id,
        laborer,
        assignment,
        assignmentDateEligible,
        laborerEntityPresent,
        laborerEntityActiveNow,
        eligibleForSelectedDate:assignmentDateEligible,
        liveOperationBlockers:blockers,
        availableForNewLiveOperation:assignmentDateEligible && blockers.length === 0,
        laborClass:assignment.labor_class || laborer?.labor_class || null,
        trade:assignment.trade || laborer?.trade || null,
      };
    }).sort((a, b) => String(a.laborer?.full_name || '').localeCompare(String(b.laborer?.full_name || ''), 'ar'));

    const eligibleForSelectedDateLaborerCount = laborerEntries.filter((row) => row.eligibleForSelectedDate).length;
    const availableForNewLiveOperationLaborerCount = laborerEntries.filter((row) => row.availableForNewLiveOperation).length;
    const historicallyActiveForSelectedDate = executionDateEligible || eligibleForSelectedDateLaborerCount > 0;
    const hasHistoricalRows = executionAssignments.length > 0 || laborerEntries.length > 0;
    const dateState = historicallyActiveForSelectedDate
      ? CONTRACTOR_DATE_STATE.ELIGIBLE
      : hasHistoricalRows ? CONTRACTOR_DATE_STATE.OUT_OF_RANGE : CONTRACTOR_DATE_STATE.NONE;
    const contractorIssues = integrityIssues.filter((issue) => issue.contractorId === contractorId);
    const readiness = readinessForContractor({
      hasIntegrityIssue:contractorIssues.length > 0,
      availableForNewLiveOperation,
      executionDateEligible,
      plannedExecutionCount:plannedExecutionAssignments.length,
      laborAvailableCount:availableForNewLiveOperationLaborerCount,
    });

    contractorEntries.push({
      contractorId,
      contractor,
      projectProfile,
      projectProfilePresent,
      projectProfileEnabledNow,
      executionAssignments,
      executionAssignmentsForSelectedDate,
      plannedExecutionAssignments,
      executionDateEligible,
      contractorEntityPresent,
      contractorEntityActiveNow,
      historicallyActiveForSelectedDate,
      liveOperationBlockers,
      availableForNewLiveOperation,
      readyForDailyOperation:readiness === CONTRACTOR_READINESS.READY,
      readiness,
      integrityIssues:contractorIssues,
      laborers:laborerEntries,
      laborerCountLoaded:laborerEntries.length,
      eligibleForSelectedDateLaborerCount,
      availableForNewLiveOperationLaborerCount,
      hasNoLaborersLoaded:laborerEntries.length === 0,
      hasNoLaborersEligibleForSelectedDate:eligibleForSelectedDateLaborerCount === 0,
      hasNoLaborersAvailableForNewLiveOperation:availableForNewLiveOperationLaborerCount === 0,

      // Backward-compatible Patch-1 aliases. They no longer use project_contractors dates.
      dateState,
      relationshipDateEligible:historicallyActiveForSelectedDate,
      relationshipEnabledNow:projectProfileEnabledNow,
      eligibleForSelectedDate:historicallyActiveForSelectedDate,
      selectedEngagement:projectProfile,
      engagements:projectProfile ? [projectProfile] : [],
    });
  }

  contractorEntries.sort((a, b) => String(a.contractor?.name_ar || '').localeCompare(String(b.contractor?.name_ar || ''), 'ar'));

  const eligibleForSelectedDateContractorCount = contractorEntries.filter((row) => row.eligibleForSelectedDate).length;
  const availableForNewLiveOperationContractorCount = contractorEntries.filter((row) => row.availableForNewLiveOperation).length;
  const readyForDailyOperationContractorCount = contractorEntries.filter((row) => row.readyForDailyOperation).length;
  const eligibleForSelectedDateLaborerCount = contractorEntries.reduce((sum, row) => sum + row.eligibleForSelectedDateLaborerCount, 0);
  const availableForNewLiveOperationLaborerCount = contractorEntries.reduce((sum, row) => sum + row.availableForNewLiveOperationLaborerCount, 0);
  const executionAssignmentCountForSelectedDate = contractorEntries.reduce((sum, row) => sum + row.executionAssignmentsForSelectedDate.length, 0);
  const plannedExecutionAssignmentCount = contractorEntries.reduce((sum, row) => sum + row.plannedExecutionAssignments.length, 0);
  const internalExecutionAssignmentCountForSelectedDate = (itemExecutions || []).filter((row) => !row.contractor_id && executionCoversDate(row, date)).length;

  return {
    projectId,
    date,
    contractors:contractorEntries,
    hasNoProjectContractorProfiles:projectContractors.length === 0,
    hasNoContractorEngagements:projectContractors.length === 0, // deprecated alias
    hasContractorsEligibleForSelectedDate:eligibleForSelectedDateContractorCount > 0,
    hasDataIntegrityIssues:integrityIssues.length > 0,
    integrityIssues,
    summary:{
      projectContractorProfileCount:projectContractors.length,
      eligibleForSelectedDateContractorCount,
      availableForNewLiveOperationContractorCount,
      readyForDailyOperationContractorCount,
      eligibleForSelectedDateLaborerCount,
      availableForNewLiveOperationLaborerCount,
      executionAssignmentCountForSelectedDate,
      plannedExecutionAssignmentCount,
      internalExecutionAssignmentCountForSelectedDate,
      integrityIssueCount:integrityIssues.length,
    },
  };
}

function mergeUniqueRows(...groups) {
  const map = new Map();
  for (const rows of groups) {
    for (const row of rows || []) {
      if (row?.id) map.set(row.id, row);
    }
  }
  return [...map.values()];
}

export async function resolveProjectOperationRoster({ supabase, projectId, date }) {
  if (!supabase) throw new Error('resolveProjectOperationRoster: supabase client is required');
  if (!projectId) throw new Error('resolveProjectOperationRoster: projectId is required');
  if (!date) throw new Error('resolveProjectOperationRoster: date is required');

  const executionSelect = 'id,project_item_id,project_id,mode,contractor_id,start_date,end_date,is_active,share_qty,share_percent,status';
  const [pcQ, laborQ, executionDateQ, executionPlannedQ] = await Promise.all([
    supabase.from('project_contractors')
      .select('id,project_id,contractor_id,basis,worker_daily,tech_daily,start_date,end_date,is_active')
      .eq('project_id', projectId),
    supabase.from('labor_project_assignments')
      .select('id,project_id,laborer_id,contractor_id,labor_class,trade,pay_basis,daily_rate,valid_from,valid_to,is_active')
      .eq('project_id', projectId)
      .lte('valid_from', date)
      .or(`valid_to.is.null,valid_to.gte.${date}`),
    supabase.from('v_item_execution_assignments')
      .select(executionSelect)
      .eq('project_id', projectId)
      .lte('start_date', date)
      .or(`end_date.is.null,end_date.gte.${date}`),
    supabase.from('v_item_execution_assignments')
      .select(executionSelect)
      .eq('project_id', projectId)
      .is('start_date', null)
      .is('end_date', null),
  ]);

  for (const query of [pcQ, laborQ, executionDateQ, executionPlannedQ]) {
    if (query.error) throw query.error;
  }

  return hydrateRoster({
    supabase,
    projectId,
    date,
    projectContractors:pcQ.data || [],
    itemExecutions:mergeUniqueRows(executionDateQ.data, executionPlannedQ.data),
    assignments:laborQ.data || [],
  });
}

export async function auditProjectOperationIntegrity({ supabase, projectId }) {
  if (!supabase) throw new Error('auditProjectOperationIntegrity: supabase client is required');
  if (!projectId) throw new Error('auditProjectOperationIntegrity: projectId is required');

  const [pcQ, executionQ, laborQ] = await Promise.all([
    supabase.from('project_contractors').select('id,project_id,contractor_id,is_active').eq('project_id', projectId),
    supabase.from('v_item_execution_assignments').select('id,project_item_id,project_id,contractor_id,start_date,end_date,is_active').eq('project_id', projectId),
    supabase.from('labor_project_assignments').select('id,project_id,laborer_id,contractor_id,valid_from,valid_to,is_active').eq('project_id', projectId),
  ]);
  for (const query of [pcQ, executionQ, laborQ]) {
    if (query.error) throw query.error;
  }

  const projectContractors = pcQ.data || [];
  const itemExecutions = executionQ.data || [];
  const assignments = laborQ.data || [];
  const contractorIds = [...new Set([
    ...projectContractors.map((row) => row.contractor_id),
    ...itemExecutions.map((row) => row.contractor_id),
    ...assignments.map((row) => row.contractor_id),
  ].filter(Boolean))];
  const laborerIds = [...new Set(assignments.map((row) => row.laborer_id).filter(Boolean))];

  const [contractorQ, laborerQ] = await Promise.all([
    contractorIds.length ? supabase.from('contractors').select('id').in('id', contractorIds) : Promise.resolve({ data:[], error:null }),
    laborerIds.length ? supabase.from('laborers').select('id').in('id', laborerIds) : Promise.resolve({ data:[], error:null }),
  ]);
  if (contractorQ.error) throw contractorQ.error;
  if (laborerQ.error) throw laborerQ.error;

  const integrityIssues = [
    ...detectOperationIntegrityIssues(projectContractors, itemExecutions, assignments),
    ...detectEntityIntegrityIssues({ contractorIds, laborerIds, contractors:contractorQ.data || [], laborers:laborerQ.data || [] }),
  ];
  return { projectId, integrityIssues, issueCount:integrityIssues.length };
}

async function hydrateRoster({ supabase, projectId, date, projectContractors, itemExecutions, assignments }) {
  const contractorIds = [...new Set([
    ...projectContractors.map((row) => row.contractor_id),
    ...itemExecutions.map((row) => row.contractor_id),
    ...assignments.map((row) => row.contractor_id),
  ].filter(Boolean))];
  const laborerIds = [...new Set(assignments.map((row) => row.laborer_id).filter(Boolean))];
  const [contractorQ, laborerQ] = await Promise.all([
    contractorIds.length
      ? supabase.from('contractors').select('id,name_ar,operation_alias,contractor_no,is_active').in('id', contractorIds)
      : Promise.resolve({ data:[], error:null }),
    laborerIds.length
      ? supabase.from('laborers').select('id,full_name,labor_class,trade,daily_rate,is_active').in('id', laborerIds)
      : Promise.resolve({ data:[], error:null }),
  ]);
  if (contractorQ.error) throw contractorQ.error;
  if (laborerQ.error) throw laborerQ.error;

  return buildProjectOperationRoster({
    projectId,
    date,
    projectContractors,
    itemExecutions,
    assignments,
    contractors:contractorQ.data || [],
    laborers:laborerQ.data || [],
  });
}

export function rosterAllContractorEntries(roster) { return roster?.contractors || []; }
export function rosterContractorsEligibleForSelectedDate(roster) { return (roster?.contractors || []).filter((row) => row.eligibleForSelectedDate); }
export function rosterContractorsAvailableForNewLiveOperation(roster) { return (roster?.contractors || []).filter((row) => row.availableForNewLiveOperation); }
export function rosterContractorsReadyForDailyOperation(roster) { return (roster?.contractors || []).filter((row) => row.readyForDailyOperation); }
export function rosterLaborersEligibleForSelectedDate(roster, contractorId) {
  const entry = (roster?.contractors || []).find((row) => row.contractorId === contractorId);
  return entry ? entry.laborers.filter((row) => row.eligibleForSelectedDate) : [];
}
export function rosterLaborersAvailableForNewLiveOperation(roster, contractorId) {
  const entry = (roster?.contractors || []).find((row) => row.contractorId === contractorId);
  return entry ? entry.laborers.filter((row) => row.availableForNewLiveOperation) : [];
}
export function rosterIntegrityIssues(roster) { return roster?.integrityIssues || []; }
