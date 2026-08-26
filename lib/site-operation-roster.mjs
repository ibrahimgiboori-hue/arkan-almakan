import { assignmentOverlaps } from './assignment-period.mjs';

export function assignmentCoversDate(assignment, date) {
  if (!assignment || !date) return false;
  return assignmentOverlaps(assignment, date, date);
}

function compareLatest(a, b) {
  const byStart = String(b?.valid_from || '').localeCompare(String(a?.valid_from || ''));
  if (byStart) return byStart;
  return String(b?.id || '').localeCompare(String(a?.id || ''));
}

function latest(rows) {
  return [...(rows || [])].sort(compareLatest)[0] || null;
}

export function resolveRosterAssignment(assignments, date) {
  const rows = (assignments || []).filter(Boolean);
  const active = latest(rows.filter((row) => assignmentCoversDate(row, date)));
  if (active) return { assignment: active, eligible: true };

  const previous = rows
    .filter((row) => row.valid_to && row.valid_to < date)
    .sort((a, b) => String(b.valid_to).localeCompare(String(a.valid_to)) || compareLatest(a, b))[0];
  if (previous) return { assignment: previous, eligible: false };

  const upcoming = rows
    .filter((row) => row.valid_from && row.valid_from > date)
    .sort((a, b) => String(a.valid_from).localeCompare(String(b.valid_from)) || String(a.id || '').localeCompare(String(b.id || '')))[0];
  if (upcoming) return { assignment: upcoming, eligible: false };

  return { assignment: latest(rows), eligible: false };
}

function groupByLaborer(assignments) {
  const groups = new Map();
  for (const row of assignments || []) {
    if (!row?.laborer_id) continue;
    if (!groups.has(row.laborer_id)) groups.set(row.laborer_id, []);
    groups.get(row.laborer_id).push(row);
  }
  return groups;
}

export function selectRosterAssignmentsForDate(assignments, date) {
  const selected = [];
  for (const rows of groupByLaborer(assignments).values()) {
    const resolved = resolveRosterAssignment(rows, date);
    if (resolved.eligible && resolved.assignment) selected.push(resolved.assignment);
  }
  return selected.sort(compareLatest);
}

export function assignmentsOverlappingPeriod(assignments, from, to, { contractorId = null } = {}) {
  if (!from || !to || to < from) return [];
  return (assignments || []).filter((row) =>
    (!contractorId || row?.contractor_id === contractorId) && assignmentOverlaps(row, from, to));
}

export function selectRosterAssignmentsForPeriod(assignments, from, to, { contractorId = null } = {}) {
  const overlapping = assignmentsOverlappingPeriod(assignments, from, to, { contractorId });
  const selected = [];
  for (const rows of groupByLaborer(overlapping).values()) {
    const row = latest(rows);
    if (row) selected.push(row);
  }
  return selected.sort(compareLatest);
}

export function rosterContractorIdsForPeriod(assignments, from, to) {
  return [...new Set(assignmentsOverlappingPeriod(assignments, from, to)
    .map((row) => row.contractor_id)
    .filter(Boolean))];
}
