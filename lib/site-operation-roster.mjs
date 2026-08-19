export function assignmentCoversDate(assignment, date) {
  if (!assignment || !date) return false;
  return (!assignment.valid_from || assignment.valid_from <= date)
    && (!assignment.valid_to || assignment.valid_to >= date);
}

function latestFirst(a, b) {
  return String(b.valid_from || '').localeCompare(String(a.valid_from || ''));
}

export function resolveRosterAssignment(assignments, date) {
  const rows = (assignments || []).filter(Boolean);
  const active = rows.filter((row) => assignmentCoversDate(row, date)).sort(latestFirst)[0];
  if (active) return { assignment: active, eligible: true };

  const previous = rows
    .filter((row) => row.valid_to && row.valid_to < date)
    .sort((a, b) => String(b.valid_to).localeCompare(String(a.valid_to)))[0];
  if (previous) return { assignment: previous, eligible: false };

  const upcoming = rows
    .filter((row) => row.valid_from && row.valid_from > date)
    .sort((a, b) => String(a.valid_from).localeCompare(String(b.valid_from)))[0];
  if (upcoming) return { assignment: upcoming, eligible: false };

  return { assignment: rows.sort(latestFirst)[0] || null, eligible: false };
}
