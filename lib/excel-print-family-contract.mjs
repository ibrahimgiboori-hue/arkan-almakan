export const EXCEL_PRINT_FAMILY_SCHEMA = 'arkan-excel-print-family-v1';

export const PRINT_FAMILY_SYSTEM_SHEETS = Object.freeze([
  '_INDEX',
  '_VARIABLES',
  '_DRESS_CODE',
  '_BASE_A4_PORTRAIT_SAFE',
]);

export const PRINT_FAMILY_VARIABLE_HEADERS = Object.freeze([
  'فعال',
  'Variable Code',
  'الاسم العربي',
  'English Label',
  'Type',
  'Repeat Group',
  'Source',
  'Format',
  'مطلوب',
  'Default',
  'Example',
  'ملاحظات',
]);

export const PRINT_FAMILY_REQUIRED_DRESS_CODES = Object.freeze([
  'MAIN_TITLE',
  'SECTION_TITLE',
  'COLUMN_HEADER',
  'DYNAMIC_FIELD',
  'REPEAT_ROW',
  'FORMULA_CELL',
  'STATIC_DATA',
  'LETTERHEAD_RESERVED',
  'ABSOLUTE_NO_GO',
]);

export const PRINT_FAMILY_SAFE_GEOMETRY = Object.freeze({
  paper: 'A4',
  defaultOrientation: 'portrait',
  absoluteNoGoSideColumns: 3,
  absoluteNoGoLeft: Object.freeze(['B', 'C', 'D']),
  absoluteNoGoRight: Object.freeze(['AM', 'AN', 'AO']),
  safeContentLeftColumn: 'E',
  safeContentRightColumn: 'AL',
});

export function isSystemPrintFamilySheet(name) {
  return String(name || '').startsWith('_');
}

export function getModelSheetNames(sheetNames = []) {
  return sheetNames
    .map((name) => String(name || '').trim())
    .filter(Boolean)
    .filter((name) => !isSystemPrintFamilySheet(name));
}

export function normalizeVariableCode(value) {
  return String(value || '').trim();
}

export function validateVariableDefinitions(rows = []) {
  const errors = [];
  const seen = new Set();

  for (const [index, row] of rows.entries()) {
    const code = normalizeVariableCode(row?.code ?? row?.['Variable Code']);
    if (!code) {
      errors.push(`row ${index + 1}: missing Variable Code`);
      continue;
    }
    if (!/^[a-z][a-z0-9_]*$/.test(code)) {
      errors.push(`${code}: Variable Code must use lower_snake_case`);
    }
    if (seen.has(code)) errors.push(`${code}: duplicate Variable Code`);
    seen.add(code);

    const type = String(row?.type ?? row?.Type ?? '').trim();
    if (!type) errors.push(`${code}: missing Type`);
    const source = String(row?.source ?? row?.Source ?? '').trim();
    if (!source) errors.push(`${code}: missing Source`);
  }

  return errors;
}

export function validateDressCodeDefinitions(rows = []) {
  const roles = new Set(
    rows.map((row) => String(row?.role ?? row?.['Role Code'] ?? '').trim()).filter(Boolean)
  );
  return PRINT_FAMILY_REQUIRED_DRESS_CODES
    .filter((role) => !roles.has(role))
    .map((role) => `missing dress-code role ${role}`);
}
