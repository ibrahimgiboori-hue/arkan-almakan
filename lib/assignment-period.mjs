/**
 * Neutral period-overlap primitive shared across operational domains.
 * Domain modules must depend on this neutral primitive rather than on each other.
 */
export function assignmentOverlaps(assignment, from, to) {
  if (!assignment || !from || !to) return false;
  return (!assignment.valid_from || assignment.valid_from <= to)
    && (!assignment.valid_to || assignment.valid_to >= from);
}
