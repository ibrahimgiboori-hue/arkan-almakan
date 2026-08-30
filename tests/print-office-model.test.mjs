import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OFFICE_BLOCK_KIND,
  OFFICE_COLUMN_ROLE,
  OFFICE_ROW_MODE,
  OFFICE_SPLIT_POLICY,
  defaultOfficeBlockSpan,
  officeComposition,
  resolveOfficeColumnRole,
  resolveOfficeFieldSpan,
  resolveOfficeMetadataFieldSpan,
  resolveOfficeRowMode,
  resolveOfficeRowValue,
  resolveOfficeSplitPolicy,
  resolveOfficeTableColumns,
} from '../lib/print-office-model.js';

test('information blocks can share a row while summaries use full width', () => {
  assert.equal(defaultOfficeBlockSpan({ kind:'cards' }), 6);
  assert.equal(defaultOfficeBlockSpan({ kind:'totals' }), 12);
  assert.equal(defaultOfficeBlockSpan({ kind:'cards', officeSpan:4 }), 4);
});

test('field spans preserve the 48-unit template grid', () => {
  assert.equal(resolveOfficeFieldSpan({ span:12 }, {}), 12);
  assert.equal(resolveOfficeFieldSpan({}, { fieldColumns:4 }), 12);
  assert.equal(resolveOfficeFieldSpan({}, { fieldColumns:3 }), 16);
  assert.equal(resolveOfficeFieldSpan({}, { fieldColumns:2 }), 24);
});

test('metadata spans make common report rows rectangular and compact', () => {
  assert.equal(resolveOfficeMetadataFieldSpan({ rawKey:'reference', value:'DRAFT-RPT-20260829-AHMAD' }), 24);
  assert.equal(resolveOfficeMetadataFieldSpan({ rawKey:'issued_at', value:'30/08/2026' }), 24);
  assert.equal(resolveOfficeMetadataFieldSpan({ rawKey:'report_date', value:'29/08/2026' }), 12);
  assert.equal(resolveOfficeMetadataFieldSpan({ rawKey:'project_name_text', value:'مشروع نابكو – مستشفى الأمير سلطان العسكري' }), 36);
  assert.equal(resolveOfficeMetadataFieldSpan({ rawKey:'report_subject', value:'تقرير الأعمال المنفذة وموقف المستخلصات' }), 48);
});

test('split policy follows Word and Excel semantics', () => {
  assert.equal(resolveOfficeSplitPolicy({ kind:'text' }), OFFICE_SPLIT_POLICY.FLOW);
  assert.equal(resolveOfficeSplitPolicy({ kind:'table' }), OFFICE_SPLIT_POLICY.ROWS);
  assert.equal(resolveOfficeSplitPolicy({ kind:'cards' }), OFFICE_SPLIT_POLICY.KEEP);
});

test('semantic table roles own widths and preserve the full table rectangle', () => {
  const columns = [
    { key:'item', span:10 },
    { key:'quantity', span:5 },
    { key:'unit', span:4 },
    { key:'rate', span:6 },
    { key:'work_value', span:7 },
    { key:'paid_value', span:6 },
    { key:'pending_value', span:6 },
    { key:'po_reference', span:7 },
    { key:'status', span:25 },
  ];
  assert.equal(resolveOfficeColumnRole(columns[0]), OFFICE_COLUMN_ROLE.DESCRIPTION);
  assert.equal(resolveOfficeColumnRole(columns.at(-1)), OFFICE_COLUMN_ROLE.STATUS);
  const layout = resolveOfficeTableColumns(columns);
  const total = layout.reduce((sum, column) => sum + column.widthPct, 0);
  assert.ok(Math.abs(total - 96) < 0.0001);
  assert.ok(layout.at(-1).widthPct > layout[0].widthPct);
});

test('package rows normalize visual quantity, unit and rate without mutating stored data', () => {
  const row = {
    item:'أعمال الحدادة',
    quantity:'0000',
    unit:'م²',
    rate:'8000',
    work_value:8000,
    status:'تم رفع مستخلص المقطوعية بقيمة 8,000 ريال',
  };
  const mode = resolveOfficeRowMode(row);
  assert.equal(mode, OFFICE_ROW_MODE.PACKAGE);
  assert.equal(resolveOfficeRowValue(row, { key:'quantity', role:OFFICE_COLUMN_ROLE.QUANTITY }, mode), 1);
  assert.equal(resolveOfficeRowValue(row, { key:'unit', role:OFFICE_COLUMN_ROLE.UNIT }, mode), 'مقطوعية');
  assert.equal(resolveOfficeRowValue(row, { key:'rate', role:OFFICE_COLUMN_ROLE.UNIT_PRICE }, mode), 8000);
  assert.equal(row.quantity, '0000');
  assert.equal(row.unit, 'م²');
});

test('composition emits semantic blocks without page geometry', () => {
  const blocks = officeComposition([
    { id:'meta', kind:'cards' },
    { id:'summary', kind:'totals' },
    { id:'body', kind:'text', key:'body' },
    { id:'lines', kind:'table' },
  ]);

  assert.deepEqual(blocks.map((block) => block.kind), [
    OFFICE_BLOCK_KIND.INFO,
    OFFICE_BLOCK_KIND.SUMMARY,
    OFFICE_BLOCK_KIND.PROSE,
    OFFICE_BLOCK_KIND.TABLE,
  ]);
  assert.deepEqual(blocks.map((block) => block.span), [6,12,12,12]);
  assert.deepEqual(blocks.map((block) => block.split), ['keep','keep','flow','rows']);
});
