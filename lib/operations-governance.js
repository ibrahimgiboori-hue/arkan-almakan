/**
 * Operations governance — canonical read model for project/contractor/labor assignment.
 *
 * Constitutional ownership:
 * - project_contractors owns project <-> contractor engagement periods.
 * - labor_project_assignments owns laborer <-> project <-> contractor periods.
 * - laborers.contractor_id/project_id are legacy compatibility/cache fields only.
 * - valid_from/valid_to are the temporal authority for labor assignments; the
 *   assignment is_active mirror is deliberately not used for date eligibility.
 * - approved/historical snapshots remain frozen and do not re-resolve through this live model.
 *
 * Two paths intentionally exist:
 * - resolveProjectOperationRoster(): fast, date-scoped live read for operational UI.
 * - auditProjectOperationIntegrity(): full-history diagnostic read.
 *
 * KNOWN DB LIMITATION: fn_attach_contractor_to_project currently upserts one row per
 * project/contractor and cannot represent a real gap between engagement periods. This
 * resolver already models engagements as arrays so a future historical migration can
 * introduce multiple rows without redesigning the read API.
 */
import { assignmentOverlaps } from './assignment-period.mjs';

export const CONTRACTOR_DATE_STATE = Object.freeze({
  ELIGIBLE: 'eligible', OUT_OF_RANGE: 'out_of_range', NONE: 'none',
});

export const INTEGRITY_ISSUE = Object.freeze({
  NO_CONTRACTOR_ENGAGEMENT: 'no_contractor_engagement',
  OUTSIDE_ENGAGEMENT_PERIOD: 'outside_engagement_period',
  MISSING_CONTRACTOR_ENTITY: 'missing_contractor_entity',
  MISSING_LABORER_ENTITY: 'missing_laborer_entity',
});

export const LIVE_OPERATION_BLOCKER = Object.freeze({
  RELATIONSHIP_MISSING: 'relationship_missing',
  RELATIONSHIP_OUT_OF_RANGE: 'relationship_out_of_range',
  RELATIONSHIP_DISABLED_NOW: 'relationship_disabled_now',
  MISSING_CONTRACTOR_ENTITY: 'missing_contractor_entity',
  CONTRACTOR_ENTITY_INACTIVE: 'contractor_entity_inactive',
  ASSIGNMENT_NOT_VALID_FOR_DATE: 'assignment_not_valid_for_date',
  MISSING_LABORER_ENTITY: 'missing_laborer_entity',
  LABORER_ENTITY_INACTIVE: 'laborer_entity_inactive',
});

const compareDate = (a = '', b = '') => String(a || '').localeCompare(String(b || ''));

function engagementCoversDate(engagement, date) {
  return assignmentOverlaps({ valid_from: engagement?.start_date, valid_to: engagement?.end_date }, date, date);
}

function engagementDateState(engagements, date) {
  if (!engagements.length) return CONTRACTOR_DATE_STATE.NONE;
  return engagements.some((engagement) => engagementCoversDate(engagement, date))
    ? CONTRACTOR_DATE_STATE.ELIGIBLE : CONTRACTOR_DATE_STATE.OUT_OF_RANGE;
}

function selectEngagementForDate(engagements, date) {
  return engagements.filter((engagement) => engagementCoversDate(engagement, date))
    .sort((a, b) => compareDate(b.start_date, a.start_date))[0] || null;
}

function groupEngagements(projectContractors = []) {
  const map = new Map();
  for (const engagement of projectContractors || []) {
    if (!engagement?.contractor_id) continue;
    if (!map.has(engagement.contractor_id)) map.set(engagement.contractor_id, []);
    map.get(engagement.contractor_id).push(engagement);
  }
  for (const rows of map.values()) rows.sort((a, b) => compareDate(a.start_date, b.start_date));
  return map;
}

function groupAssignments(assignments = []) {
  const map = new Map();
  for (const assignment of assignments || []) {
    if (!assignment?.contractor_id) continue;
    if (!map.has(assignment.contractor_id)) map.set(assignment.contractor_id, []);
    map.get(assignment.contractor_id).push(assignment);
  }
  return map;
}

function assignmentWithinEngagementPeriod(assignment, engagement) {
  if (!assignment || !engagement) return false;
  if (engagement.start_date && (!assignment.valid_from || assignment.valid_from < engagement.start_date)) return false;
  if (engagement.end_date && (!assignment.valid_to || assignment.valid_to > engagement.end_date)) return false;
  return true;
}

function assignmentWithinAnyEngagement(assignment, engagements = []) {
  return engagements.some((engagement) => assignmentWithinEngagementPeriod(assignment, engagement));
}

export function detectOperationIntegrityIssues(projectContractors = [], assignments = []) {
  const engagementsByContractor = groupEngagements(projectContractors);
  const issues = [];
  for (const assignment of assignments || []) {
    const engagements = engagementsByContractor.get(assignment.contractor_id) || [];
    if (!engagements.length) {
      issues.push({ type:INTEGRITY_ISSUE.NO_CONTRACTOR_ENGAGEMENT, contractorId:assignment.contractor_id, laborerId:assignment.laborer_id, assignment });
      continue;
    }
    if (!assignmentWithinAnyEngagement(assignment, engagements)) {
      issues.push({ type:INTEGRITY_ISSUE.OUTSIDE_ENGAGEMENT_PERIOD, contractorId:assignment.contractor_id, laborerId:assignment.laborer_id, assignment });
    }
  }
  return issues;
}

function detectEntityIntegrityIssues({ contractorIds = [], laborerIds = [], contractors = [], laborers = [] }) {
  const contractorSet = new Set((contractors || []).map((row) => row.id));
  const laborerSet = new Set((laborers || []).map((row) => row.id));
  const issues = [];
  for (const contractorId of new Set(contractorIds.filter(Boolean))) {
    if (!contractorSet.has(contractorId)) issues.push({ type:INTEGRITY_ISSUE.MISSING_CONTRACTOR_ENTITY, contractorId });
  }
  for (const laborerId of new Set(laborerIds.filter(Boolean))) {
    if (!laborerSet.has(laborerId)) issues.push({ type:INTEGRITY_ISSUE.MISSING_LABORER_ENTITY, laborerId });
  }
  return issues;
}

function contractorLiveBlockers({ dateState, relationshipEnabledNow, contractorEntityPresent, contractorEntityActiveNow }) {
  const blockers = [];
  if (dateState === CONTRACTOR_DATE_STATE.NONE) blockers.push(LIVE_OPERATION_BLOCKER.RELATIONSHIP_MISSING);
  if (dateState === CONTRACTOR_DATE_STATE.OUT_OF_RANGE) blockers.push(LIVE_OPERATION_BLOCKER.RELATIONSHIP_OUT_OF_RANGE);
  if (!relationshipEnabledNow) blockers.push(LIVE_OPERATION_BLOCKER.RELATIONSHIP_DISABLED_NOW);
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

export function buildProjectOperationRoster({ projectId, date, projectContractors = [], assignments = [], contractors = [], laborers = [] }) {
  if (!projectId) throw new Error('buildProjectOperationRoster: projectId is required');
  if (!date) throw new Error('buildProjectOperationRoster: date is required');

  const contractorById = new Map((contractors || []).map((row) => [row.id, row]));
  const laborerById = new Map((laborers || []).map((row) => [row.id, row]));
  const engagementsByContractor = groupEngagements(projectContractors);
  const assignmentsByContractor = groupAssignments(assignments);
  const contractorIds = new Set([...engagementsByContractor.keys(), ...assignmentsByContractor.keys()]);
  const contractorEntries = [];

  for (const contractorId of contractorIds) {
    const engagements = engagementsByContractor.get(contractorId) || [];
    const dateState = engagementDateState(engagements, date);
    const relationshipDateEligible = dateState === CONTRACTOR_DATE_STATE.ELIGIBLE;
    const selectedEngagement = selectEngagementForDate(engagements, date);
    const relationshipEnabledNow = engagements.some((engagement) => engagement.is_active !== false);
    const contractor = contractorById.get(contractorId) || null;
    const contractorEntityPresent = !!contractor;
    const contractorEntityActiveNow = contractorEntityPresent && contractor.is_active !== false;
    const liveOperationBlockers = contractorLiveBlockers({ dateState, relationshipEnabledNow, contractorEntityPresent, contractorEntityActiveNow });
    const availableForNewLiveOperation = relationshipDateEligible && relationshipEnabledNow && contractorEntityActiveNow;

    const laborerEntries = (assignmentsByContractor.get(contractorId) || []).map((assignment) => {
      const laborer = laborerById.get(assignment.laborer_id) || null;
      const assignmentDateEligible = assignmentOverlaps(assignment, date, date);
      const laborerEntityPresent = !!laborer;
      const laborerEntityActiveNow = laborerEntityPresent && laborer.is_active !== false;
      const eligibleForSelectedDate = relationshipDateEligible && assignmentDateEligible;
      const blockers = laborerLiveBlockers({ contractorBlockers:liveOperationBlockers, assignmentDateEligible, laborerEntityPresent, laborerEntityActiveNow });
      const available = eligibleForSelectedDate && relationshipEnabledNow && contractorEntityActiveNow && laborerEntityActiveNow;
      return {
        laborerId:assignment.laborer_id, laborer, assignment, assignmentDateEligible,
        laborerEntityPresent, laborerEntityActiveNow, eligibleForSelectedDate,
        liveOperationBlockers:blockers, availableForNewLiveOperation:available,
        laborClass:assignment.labor_class || laborer?.labor_class || null,
        trade:assignment.trade || laborer?.trade || null,
      };
    }).sort((a, b) => String(a.laborer?.full_name || '').localeCompare(String(b.laborer?.full_name || ''), 'ar'));

    const eligibleForSelectedDateLaborerCount = laborerEntries.filter((row) => row.eligibleForSelectedDate).length;
    const availableForNewLiveOperationLaborerCount = laborerEntries.filter((row) => row.availableForNewLiveOperation).length;
    contractorEntries.push({
      contractorId, contractor, engagements, selectedEngagement, dateState,
      relationshipDateEligible, relationshipEnabledNow, contractorEntityPresent,
      contractorEntityActiveNow, eligibleForSelectedDate:relationshipDateEligible,
      liveOperationBlockers, availableForNewLiveOperation, laborers:laborerEntries,
      laborerCountLoaded:laborerEntries.length,
      eligibleForSelectedDateLaborerCount, availableForNewLiveOperationLaborerCount,
      hasNoLaborersLoaded:laborerEntries.length === 0,
      hasNoLaborersEligibleForSelectedDate:eligibleForSelectedDateLaborerCount === 0,
      hasNoLaborersAvailableForNewLiveOperation:availableForNewLiveOperationLaborerCount === 0,
    });
  }

  contractorEntries.sort((a, b) => String(a.contractor?.name_ar || '').localeCompare(String(b.contractor?.name_ar || ''), 'ar'));
  const relationshipIssues = detectOperationIntegrityIssues(projectContractors, assignments);
  const entityIssues = detectEntityIntegrityIssues({ contractorIds:[...contractorIds], laborerIds:assignments.map((row) => row.laborer_id), contractors, laborers });
  const integrityIssues = [...relationshipIssues, ...entityIssues];
  const eligibleForSelectedDateContractorCount = contractorEntries.filter((row) => row.eligibleForSelectedDate).length;
  const availableForNewLiveOperationContractorCount = contractorEntries.filter((row) => row.availableForNewLiveOperation).length;
  const eligibleForSelectedDateLaborerCount = contractorEntries.reduce((sum, row) => sum + row.eligibleForSelectedDateLaborerCount, 0);
  const availableForNewLiveOperationLaborerCount = contractorEntries.reduce((sum, row) => sum + row.availableForNewLiveOperationLaborerCount, 0);

  return {
    projectId, date, contractors:contractorEntries,
    hasNoContractorEngagements:projectContractors.length === 0,
    hasContractorsEligibleForSelectedDate:eligibleForSelectedDateContractorCount > 0,
    hasDataIntegrityIssues:integrityIssues.length > 0, integrityIssues,
    summary:{ eligibleForSelectedDateContractorCount, availableForNewLiveOperationContractorCount, eligibleForSelectedDateLaborerCount, availableForNewLiveOperationLaborerCount, integrityIssueCount:integrityIssues.length },
  };
}

export async function resolveProjectOperationRoster({ supabase, projectId, date }) {
  if (!supabase) throw new Error('resolveProjectOperationRoster: supabase client is required');
  if (!projectId) throw new Error('resolveProjectOperationRoster: projectId is required');
  if (!date) throw new Error('resolveProjectOperationRoster: date is required');
  const [pcQ, assignmentQ] = await Promise.all([
    supabase.from('project_contractors').select('id,contractor_id,basis,worker_daily,tech_daily,start_date,end_date,is_active').eq('project_id', projectId),
    supabase.from('labor_project_assignments').select('id,laborer_id,contractor_id,labor_class,trade,pay_basis,daily_rate,valid_from,valid_to,is_active').eq('project_id', projectId).lte('valid_from', date).or(`valid_to.is.null,valid_to.gte.${date}`),
  ]);
  if (pcQ.error) throw pcQ.error;
  if (assignmentQ.error) throw assignmentQ.error;
  return hydrateRoster({ supabase, projectId, date, projectContractors:pcQ.data || [], assignments:assignmentQ.data || [] });
}

export async function auditProjectOperationIntegrity({ supabase, projectId }) {
  if (!supabase) throw new Error('auditProjectOperationIntegrity: supabase client is required');
  if (!projectId) throw new Error('auditProjectOperationIntegrity: projectId is required');
  const [pcQ, assignmentQ] = await Promise.all([
    supabase.from('project_contractors').select('id,contractor_id,start_date,end_date,is_active').eq('project_id', projectId),
    supabase.from('labor_project_assignments').select('id,laborer_id,contractor_id,valid_from,valid_to,is_active').eq('project_id', projectId),
  ]);
  if (pcQ.error) throw pcQ.error;
  if (assignmentQ.error) throw assignmentQ.error;
  const projectContractors = pcQ.data || [];
  const assignments = assignmentQ.data || [];
  const contractorIds = [...new Set([...projectContractors.map((row) => row.contractor_id), ...assignments.map((row) => row.contractor_id)].filter(Boolean))];
  const laborerIds = [...new Set(assignments.map((row) => row.laborer_id).filter(Boolean))];
  const [contractorQ, laborerQ] = await Promise.all([
    contractorIds.length ? supabase.from('contractors').select('id').in('id', contractorIds) : Promise.resolve({ data:[], error:null }),
    laborerIds.length ? supabase.from('laborers').select('id').in('id', laborerIds) : Promise.resolve({ data:[], error:null }),
  ]);
  if (contractorQ.error) throw contractorQ.error;
  if (laborerQ.error) throw laborerQ.error;
  const integrityIssues = [
    ...detectOperationIntegrityIssues(projectContractors, assignments),
    ...detectEntityIntegrityIssues({ contractorIds, laborerIds, contractors:contractorQ.data || [], laborers:laborerQ.data || [] }),
  ];
  return { projectId, integrityIssues, issueCount:integrityIssues.length };
}

async function hydrateRoster({ supabase, projectId, date, projectContractors, assignments }) {
  const contractorIds = [...new Set([...projectContractors.map((row) => row.contractor_id), ...assignments.map((row) => row.contractor_id)].filter(Boolean))];
  const laborerIds = [...new Set(assignments.map((row) => row.laborer_id).filter(Boolean))];
  const [contractorQ, laborerQ] = await Promise.all([
    contractorIds.length ? supabase.from('contractors').select('id,name_ar,operation_alias,contractor_no,is_active').in('id', contractorIds) : Promise.resolve({ data:[], error:null }),
    laborerIds.length ? supabase.from('laborers').select('id,full_name,labor_class,trade,daily_rate,is_active').in('id', laborerIds) : Promise.resolve({ data:[], error:null }),
  ]);
  if (contractorQ.error) throw contractorQ.error;
  if (laborerQ.error) throw laborerQ.error;
  return buildProjectOperationRoster({ projectId, date, projectContractors, assignments, contractors:contractorQ.data || [], laborers:laborerQ.data || [] });
}

export function rosterAllContractorEntries(roster) { return roster?.contractors || []; }
export function rosterContractorsEligibleForSelectedDate(roster) { return (roster?.contractors || []).filter((row) => row.eligibleForSelectedDate); }
export function rosterContractorsAvailableForNewLiveOperation(roster) { return (roster?.contractors || []).filter((row) => row.availableForNewLiveOperation); }
export function rosterLaborersEligibleForSelectedDate(roster, contractorId) {
  const entry = (roster?.contractors || []).find((row) => row.contractorId === contractorId);
  return entry ? entry.laborers.filter((row) => row.eligibleForSelectedDate) : [];
}
export function rosterLaborersAvailableForNewLiveOperation(roster, contractorId) {
  const entry = (roster?.contractors || []).find((row) => row.contractorId === contractorId);
  return entry ? entry.laborers.filter((row) => row.availableForNewLiveOperation) : [];
}
export function rosterIntegrityIssues(roster) { return roster?.integrityIssues || []; }
