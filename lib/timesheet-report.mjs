export const TIMESHEET_STATUS = Object.freeze({
  full: Object.freeze({ label:'حضور كامل', short:'✓', factor:1 }),
  half: Object.freeze({ label:'نصف يوم', short:'½', factor:0.5 }),
  absent: Object.freeze({ label:'غياب', short:'غ', factor:0 }),
  stopped: Object.freeze({ label:'حاضر والعمل متوقف', short:'ت', factor:1 }),
  leave: Object.freeze({ label:'إجازة', short:'إ', factor:0 }),
  unrecorded: Object.freeze({ label:'غياب', short:'غ', factor:0 }),
});

const DAY_MS = 24 * 60 * 60 * 1000;

export function isoDate(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  const date = new Date(value);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

export function displayDate(value) {
  const iso = isoDate(value);
  return iso ? iso.split('-').reverse().join('/') : '—';
}

export function arabicDayName(value) {
  const iso = isoDate(value);
  if (!iso) return '—';
  return ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'][new Date(`${iso}T12:00:00`).getDay()];
}

export function dateRange(from, to, maximumDays = 370) {
  if (!from || !to || to < from) return [];
  const start = Date.parse(`${from}T12:00:00Z`);
  const end = Date.parse(`${to}T12:00:00Z`);
  const count = Math.floor((end - start) / DAY_MS) + 1;
  if (!Number.isFinite(count) || count < 1 || count > maximumDays) return [];
  return Array.from({ length:count }, (_, index) => new Date(start + index * DAY_MS).toISOString().slice(0, 10));
}

export function chunk(items, size) {
  const rows = Array.isArray(items) ? items : [];
  const safeSize = Math.max(1, Number(size) || 1);
  const pages = [];
  for (let index = 0; index < rows.length; index += safeSize) pages.push(rows.slice(index, index + safeSize));
  return pages.length ? pages : [[]];
}

export function assignmentOverlaps(assignment, from, to) {
  if (!assignment || !from || !to) return false;
  return (!assignment.valid_from || assignment.valid_from <= to)
    && (!assignment.valid_to || assignment.valid_to >= from);
}

export function attendanceKey(laborerId, workDate) {
  return `${laborerId}|${isoDate(workDate)}`;
}

export function statusDefinition(status) {
  return TIMESHEET_STATUS[status] || TIMESHEET_STATUS.unrecorded;
}

export function attendanceFactor(status) {
  return statusDefinition(status).factor;
}

export function buildAttendanceMap(rows = []) {
  return Object.fromEntries((rows || []).map((row) => [attendanceKey(row.laborer_id, row.work_date), row]));
}

export function summarizeAttendance(rows = [], laborerIds = null) {
  const allowed = laborerIds ? new Set(laborerIds) : null;
  const summary = { full:0, half:0, absent:0, stopped:0, leave:0, recorded:0, workdays:0 };
  for (const row of rows || []) {
    if (allowed && !allowed.has(row.laborer_id)) continue;
    if (Object.prototype.hasOwnProperty.call(summary, row.status)) summary[row.status] += 1;
    summary.recorded += 1;
    summary.workdays += attendanceFactor(row.status);
  }
  return summary;
}

export function workerPeriodDays(laborerId, rows = []) {
  return (rows || []).reduce((total, row) => (
    row.laborer_id === laborerId ? total + attendanceFactor(row.status) : total
  ), 0);
}
