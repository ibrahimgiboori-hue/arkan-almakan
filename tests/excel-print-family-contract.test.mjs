import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRINT_FAMILY_SAFE_GEOMETRY,
  PRINT_FAMILY_SYSTEM_SHEETS,
  getModelSheetNames,
  validateDressCodeDefinitions,
  validateVariableDefinitions,
} from '../lib/excel-print-family-contract.mjs';
import {
  PRINT_FAMILIES,
  PRINT_FAMILY_MIGRATION_ORDER,
  findPrintFamilyByRoute,
  validatePrintFamilyCatalog,
} from '../lib/print-family-catalog.mjs';

test('system sheets never become printable model sheets', () => {
  assert.deepEqual(
    getModelSheetNames([...PRINT_FAMILY_SYSTEM_SHEETS, 'عرض سعر كميات - بضريبة']),
    ['عرض سعر كميات - بضريبة']
  );
});

test('side protection is exactly three columns on both sides', () => {
  assert.equal(PRINT_FAMILY_SAFE_GEOMETRY.absoluteNoGoSideColumns, 3);
  assert.deepEqual(PRINT_FAMILY_SAFE_GEOMETRY.absoluteNoGoLeft, ['B', 'C', 'D']);
  assert.deepEqual(PRINT_FAMILY_SAFE_GEOMETRY.absoluteNoGoRight, ['AM', 'AN', 'AO']);
  assert.equal(PRINT_FAMILY_SAFE_GEOMETRY.safeContentLeftColumn, 'E');
  assert.equal(PRINT_FAMILY_SAFE_GEOMETRY.safeContentRightColumn, 'AL');
});

test('variable definitions reject invented or duplicated codes', () => {
  assert.deepEqual(validateVariableDefinitions([
    { code:'client_name', Type:'TEXT', Source:'DYNAMIC' },
    { code:'grand_total', Type:'MONEY', Source:'CALCULATED' },
  ]), []);
  assert.ok(validateVariableDefinitions([
    { code:'Client Name', Type:'TEXT', Source:'DYNAMIC' },
    { code:'client_name', Type:'TEXT', Source:'DYNAMIC' },
    { code:'client_name', Type:'TEXT', Source:'DYNAMIC' },
  ]).length >= 2);
});

test('dress code requires the semantic roles Excel uses as its visual language', () => {
  const rows = [
    'MAIN_TITLE','SECTION_TITLE','COLUMN_HEADER','DYNAMIC_FIELD','REPEAT_ROW',
    'FORMULA_CELL','STATIC_DATA','LETTERHEAD_RESERVED','ABSOLUTE_NO_GO',
  ].map((role) => ({ role }));
  assert.deepEqual(validateDressCodeDefinitions(rows), []);
});

test('all current print routes belong to one declared family', () => {
  assert.deepEqual(validatePrintFamilyCatalog(), []);
  assert.equal(PRINT_FAMILY_MIGRATION_ORDER.length, Object.keys(PRINT_FAMILIES).length);
  assert.equal(findPrintFamilyByRoute('app/print/quote/[id]').id, 'quotations');
  assert.equal(findPrintFamilyByRoute('/app/print/treasury-voucher/[id]/').id, 'treasury_vouchers');
  assert.equal(findPrintFamilyByRoute('app/print/[id]').id, 'general_documents');
});
