/**
 * Canonical separation between laborer PROFILE fields and project ASSIGNMENT fields.
 * Editing profile data must never silently rewrite a project/contractor assignment.
 *
 * contractor_id on INSERT is retained temporarily only for legacy compatibility with
 * older screens. It is not constitutional assignment truth and is never reasserted on edit.
 */
import { SYSTEM } from './system-constitution.js';

export const LABORER_PROFILE_FIELDS = Object.freeze([
  'full_name', 'iqama_no', 'iqama_expiry', 'nationality', 'labor_class', 'trade',
  'group_code', 'pay_basis', 'daily_rate', 'monthly_salary', 'salary_days',
  'piece_rate', 'piece_unit', 'deduct_absence', 'phone',
]);

const NUMERIC_FIELDS = Object.freeze(['daily_rate', 'monthly_salary', 'piece_rate']);

export function buildLaborerSavePayload(formValues = {}, { contractorId, isNew } = {}) {
  const payload = {};
  for (const key of LABORER_PROFILE_FIELDS) payload[key] = formValues[key];
  NUMERIC_FIELDS.forEach((key) => {
    const value = payload[key];
    payload[key] = value === '' || value === null || value === undefined ? null : Number(value);
  });
  payload.salary_days = SYSTEM.payroll.monthlyDailyDivisor;
  payload.iqama_expiry = payload.iqama_expiry || null;

  if (isNew) {
    if (!contractorId) throw new Error('buildLaborerSavePayload: contractorId is required to register a new laborer');
    payload.contractor_id = contractorId; // legacy compatibility only
  }
  return payload;
}
