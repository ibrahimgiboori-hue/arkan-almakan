export const LABOR_CLASS_AR = Object.freeze({
  worker:'عامل',
  technician:'صنايعي',
  foreman:'فورمان',
});

export function laborClassLabel(value) {
  return LABOR_CLASS_AR[value] || 'غير مصنف';
}

export function summarizeLaborClasses(rows = [], key = 'laborClass') {
  const summary = { total:0, technician:0, worker:0, foreman:0, other:0 };
  for (const row of rows || []) {
    const value = row?.[key] ?? row?.laborClass ?? row?.labor_class;
    summary.total += 1;
    if (Object.prototype.hasOwnProperty.call(LABOR_CLASS_AR, value)) summary[value] += 1;
    else summary.other += 1;
  }
  return summary;
}

export function laborClassSummaryLabel(summary = {}) {
  const parts = [];
  if (summary.technician) parts.push(`${summary.technician} ${summary.technician === 1 ? 'صنايعي' : 'صنايعية'}`);
  if (summary.worker) parts.push(`${summary.worker} ${summary.worker === 1 ? 'عامل' : 'عمال'}`);
  if (summary.foreman) parts.push(`${summary.foreman} ${summary.foreman === 1 ? 'فورمان' : 'فورمانات'}`);
  if (summary.other) parts.push(`${summary.other} غير مصنف`);
  return parts.join(' · ') || 'لا توجد عمالة';
}
