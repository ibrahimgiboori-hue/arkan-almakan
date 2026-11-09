import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cellAddress,
  cellText,
  coerceCellValue,
  columnLetter,
  expandPasteMatrix,
  moveCell,
  normalizeRange,
  parseClipboardTable,
  parseDateText,
  parseNumberText,
  planClear,
  planFillDown,
  planPaste,
  rangeAddress,
  rangeMatrix,
  rangeStats,
  sheetColumns,
  toClipboardTable,
} from '../lib/sheet-engine.mjs';

const columns = [
  { key: '_index', label: '#', type: 'index' },
  { key: 'expense_date', label: 'التاريخ', type: 'date' },
  { key: 'amount', label: 'المبلغ', type: 'number', min: 0 },
  { key: 'category', label: 'التصنيف', type: 'select', options: [{ value: 'meals', label: 'وجبات' }, { value: 'transport', label: 'ترحيل' }] },
  { key: 'notes', label: 'البيان', type: 'text' },
  {
    key: 'payer', label: 'من دفع؟', type: 'select',
    options: [{ value: 'company', label: 'الشركة' }, { value: 'employee', label: 'موظف' }],
    onChange: (row, value) => ({ payer: value, paid_by_employee_id: value === 'employee' ? row.paid_by_employee_id : '' }),
  },
  {
    key: 'paid_by_employee_id', label: 'الموظف', type: 'select', emptyOption: 'اختر',
    visible: (row) => row.payer === 'employee',
    options: [{ value: 'e1', label: 'أحمد' }],
  },
  { key: '_action', label: 'إجراء', type: 'action' },
];

const rows = [
  { _id: 'a', expense_date: '2026-11-01', amount: '300', category: 'meals', notes: 'وجبات العمال', payer: 'company', paid_by_employee_id: '' },
  { _id: 'b', expense_date: '2026-11-02', amount: '150', category: 'transport', notes: 'ترحيل', payer: 'employee', paid_by_employee_id: 'e1' },
  { _id: 'c', expense_date: '', amount: '', category: 'meals', notes: '', payer: 'company', paid_by_employee_id: '' },
];

test('letters and addresses follow Excel and skip structural columns', () => {
  assert.deepEqual([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnLetter), ['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
  const sheet = sheetColumns(columns);
  assert.deepEqual(sheet.map((c) => `${c.letter}:${c.key}`), ['A:expense_date', 'B:amount', 'C:category', 'D:notes', 'E:payer', 'F:paid_by_employee_id']);
  assert.equal(cellAddress(1, 3), 'B4');
  assert.equal(rangeAddress(normalizeRange({ row: 2, col: 3 }, { row: 0, col: 1 })), 'B1:D3');
  assert.equal(rangeAddress(normalizeRange({ row: 0, col: 0 })), 'A1');
  assert.deepEqual(moveCell({ row: 0, col: 0 }, { rowDelta: -1, colDelta: 9 }, { rowCount: 3, colCount: 6 }), { row: 0, col: 5 });
});

test('clipboard round-trips Excel text, including quoted cells with tabs and line breaks', () => {
  assert.deepEqual(parseClipboardTable('1\t2\n3\t4\n'), [['1', '2'], ['3', '4']]);
  assert.deepEqual(parseClipboardTable('"a\tb"\t"line1\nline2"\t"say ""hi"""\r\nx\t\ty'), [['a\tb', 'line1\nline2', 'say "hi"'], ['x', '', 'y']]);
  assert.deepEqual(parseClipboardTable(''), []);
  assert.deepEqual(parseClipboardTable('single'), [['single']]);
  const matrix = [['a\tb', 'x'], ['line1\nline2', 'say "hi"']];
  assert.deepEqual(parseClipboardTable(toClipboardTable(matrix)), matrix);
});

test('numbers and dates are read the way people paste them', () => {
  assert.equal(parseNumberText('1,234.50'), 1234.5);
  assert.equal(parseNumberText('١٬٢٣٤٫٥'), 1234.5);
  assert.equal(parseNumberText('(300)'), -300);
  assert.equal(parseNumberText('40 ر.س'), 40);
  assert.equal(parseNumberText('SAR 1,000'), 1000);
  assert.equal(parseNumberText(''), '');
  assert.equal(parseNumberText('12abc'), null);
  assert.equal(parseNumberText('1,23'), null);
  assert.equal(parseDateText('2026-11-05'), '2026-11-05');
  assert.equal(parseDateText('2026/11/5'), '2026-11-05');
  assert.equal(parseDateText('05/11/2026'), '2026-11-05');
  assert.equal(parseDateText('٥/١١/٢٠٢٦'), '2026-11-05');
  assert.equal(parseDateText('5-11-26'), '2026-11-05');
  assert.equal(parseDateText('46331'), '2026-11-05');
  assert.equal(parseDateText('31/02/2026'), null);
  assert.equal(parseDateText('tomorrow'), null);
});

test('values are coerced to the column type, lists match by label or value', () => {
  const [, date, amount, category, notes] = columns;
  assert.deepEqual(coerceCellValue(amount, '1,200.00'), { ok: true, value: '1200' });
  assert.equal(coerceCellValue(amount, '-5').ok, false);
  assert.match(coerceCellValue(amount, 'abc').error, /ليس رقمًا/);
  assert.deepEqual(coerceCellValue(date, '05/11/2026'), { ok: true, value: '2026-11-05' });
  assert.deepEqual(coerceCellValue(category, ' ترحيل '), { ok: true, value: 'transport' });
  assert.deepEqual(coerceCellValue(category, 'meals'), { ok: true, value: 'meals' });
  assert.match(coerceCellValue(category, 'حديد').error, /غير موجود في قائمة التصنيف/);
  assert.equal(coerceCellValue(category, '').ok, false);
  assert.deepEqual(coerceCellValue(notes, 'a\nb'), { ok: true, value: 'a b' });
  assert.equal(coerceCellValue({ type: 'badge' }, 'x').ok, false);
});

test('paste from Excel fills existing rows, appends new ones and reports bad cells by address', () => {
  const clip = parseClipboardTable('05/11/2026\t1,200\tترحيل\tسقالات\n06/11/2026\t40\tحديد\tأسمنت\n07/11/2026\t25\tوجبات\tغداء\n');
  const plan = planPaste({ rows, columns, start: { row: 2, col: 0 }, matrix: clip });
  assert.deepEqual(plan.patches, [{ rowIndex: 2, patch: { expense_date: '2026-11-05', amount: '1200', category: 'transport', notes: 'سقالات' } }]);
  assert.deepEqual(plan.append, [
    { expense_date: '2026-11-06', amount: '40', notes: 'أسمنت' },
    { expense_date: '2026-11-07', amount: '25', category: 'meals', notes: 'غداء' },
  ]);
  assert.deepEqual(plan.errors, [{ address: 'C4', message: '«حديد» غير موجود في قائمة التصنيف' }]);
  assert.equal(plan.written, 11);
});

test('paste respects column hooks, hidden cells and locked rows', () => {
  const plan = planPaste({ rows, columns, start: { row: 0, col: 4 }, matrix: [['موظف', 'أحمد'], ['الشركة', 'أحمد']], isRowEditable: (row) => row._id !== 'b' });
  assert.deepEqual(plan.patches, [{ rowIndex: 0, patch: { payer: 'employee', paid_by_employee_id: 'e1' } }]);
  assert.equal(plan.skipped, 2);
});

test('a single copied value fills a bigger selection, a block tiles when it divides evenly', () => {
  assert.deepEqual(expandPasteMatrix([['x']], normalizeRange({ row: 0, col: 0 }, { row: 1, col: 1 })), [['x', 'x'], ['x', 'x']]);
  assert.deepEqual(expandPasteMatrix([['a', 'b']], normalizeRange({ row: 0, col: 0 }, { row: 1, col: 1 })), [['a', 'b'], ['a', 'b']]);
  assert.deepEqual(expandPasteMatrix([['a', 'b', 'c']], normalizeRange({ row: 0, col: 0 }, { row: 1, col: 1 })), [['a', 'b', 'c']]);
});

test('fill down copies the first row, clear empties only clearable cells', () => {
  const range = normalizeRange({ row: 0, col: 1 }, { row: 2, col: 3 });
  assert.deepEqual(planFillDown({ rows, columns, range }).patches, [
    { rowIndex: 1, patch: { amount: '300', category: 'meals', notes: 'وجبات العمال' } },
    { rowIndex: 2, patch: { amount: '300', category: 'meals', notes: 'وجبات العمال' } },
  ]);
  assert.deepEqual(planClear({ rows, columns, range: normalizeRange({ row: 0, col: 1 }, { row: 0, col: 5 }) }).patches, [
    { rowIndex: 0, patch: { amount: '', notes: '' } },
  ]);
});

test('copy and the status bar read what the person sees', () => {
  const range = normalizeRange({ row: 0, col: 0 }, { row: 1, col: 5 });
  assert.deepEqual(rangeMatrix({ rows, columns, range }), [
    ['2026-11-01', '300', 'وجبات', 'وجبات العمال', 'الشركة', ''],
    ['2026-11-02', '150', 'ترحيل', 'ترحيل', 'موظف', 'أحمد'],
  ]);
  assert.equal(cellText(columns[6], rows[0]), '');
  assert.equal(cellText({ key: '_status', type: 'badge', text: (row) => (row.amount ? 'محفوظ' : 'جديد') }, rows[0]), 'محفوظ');
  assert.deepEqual(rangeStats({ rows, columns, range: normalizeRange({ row: 0, col: 1 }, { row: 2, col: 1 }) }), {
    cells: 3, count: 2, numericCount: 2, sum: 450, average: 225, min: 150, max: 300,
  });
});

test('the shared ledger grid carries the Excel layer for every screen that uses it', async () => {
  const fs = await import('node:fs');
  const grid = fs.readFileSync('components/ui/RawGrid.js', 'utf8');
  for (const needle of [
    "from '@/lib/sheet-engine.mjs'",
    "data-sheet-engine={sheetEnabled ? 'excel' : undefined}",
    'data-sheet-bar="formula"',
    'data-sheet-bar="status"',
    'data-sheet-letters="true"',
    'onPaste={onPaste}',
    'onCopy={(event) => copyRange(event)}',
    'planPaste({',
    'planFillDown({',
    'planClear({',
    'onAppendRows',
    'onPatchRows',
  ]) assert.ok(grid.includes(needle), `RawGrid lost ${needle}`);
  const expenses = fs.readFileSync('app/dashboard/projects/[id]/operations/direct-expense-panel.js', 'utf8');
  assert.ok(expenses.includes('onAppendRows={appendPastedRows}'), 'daily expenses must accept pasted rows beyond the grid');
});

test('formula columns read their computed value and the total row sums like Excel', async () => {
  const { columnTotal } = await import('../lib/sheet-engine.mjs');
  const lines = [{ qty: '3', price: '400' }, { qty: '40', price: '18.5' }, { qty: '', price: '95' }];
  const total = { key: 'total', label: 'الإجمالي', type: 'computed', numeric: true, formula: 'الكمية × سعر الوحدة', compute: (row) => (row.qty && row.price ? Number(row.qty) * Number(row.price) : null), total: 'sum' };
  assert.deepEqual(lines.map((row) => cellText(total, row)), ['1200', '740', '']);
  assert.equal(sheetColumns([total])[0].numeric, true);
  assert.equal(sheetColumns([total])[0].editable, false);
  assert.equal(columnTotal(total, lines), 1940);
  assert.equal(columnTotal({ key: 'qty', type: 'number', total: 'count' }, lines), 2);
  assert.equal(columnTotal({ key: 'qty', type: 'number', total: 'average' }, lines), 21.5);
  assert.equal(columnTotal({ key: 'qty', type: 'number' }, lines), null);
  assert.equal(columnTotal({ key: 'x', total: (rows) => `${rows.length} صفوف` }, lines), '3 صفوف');
  assert.equal(planPaste({ rows: lines, columns: [total], start: { row: 0, col: 0 }, matrix: [['9']] }).written, 0);
});

test('a sheet batch saves row by row and stops at the first rejected row', async () => {
  const { saveSheetRows, sheetBatchMessage } = await import('../lib/sheet-batch.mjs');
  const calls = [];
  const result = await saveSheetRows([{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }], async (row) => {
    calls.push(row.n);
    if (row.n === 3) throw new Error('المبلغ مطلوب.');
    return { status: row.n === 2 ? 'queued' : 'verified', pendingCount: row.n === 2 ? 1 : 1 };
  });
  assert.deepEqual(calls, [1, 2, 3]);
  assert.equal(result.verified, 1);
  assert.equal(result.queued, 1);
  assert.equal(result.failure.row.n, 3);
  assert.match(sheetBatchMessage(result, 'حركة'), /حُفظ 1 حركة .* 1 محفوظ على هذا الجهاز .* توقف الحفظ عند صف لم يُقبل: المبلغ مطلوب\./);
});

test('output and finance sheets: saved rows lock, new rows validate by sheet row number', async () => {
  const output = await import('../lib/project-operation-output.mjs');
  const finance = await import('../lib/project-operation-finance.mjs');
  let n = 0;
  const id = () => `d${++n}`;
  const saved = output.storedOutputToRow({ id: 'x', work_date: '2026-11-08', contractor_id: 'c1', project_item_id: 'i1', group_output: 12.5, unit: 'م2', notes: null });
  assert.deepEqual(saved, { _id: 'saved-x', id: 'x', persisted: true, date: '2026-11-08', contractor_id: 'c1', item_id: 'i1', qty: '12.5', notes: '', unit: 'م2' });
  const outRows = [saved, output.createOutputDraft({ item_id: 'i1', qty: '4' }, id), output.createOutputDraft({ qty: '3' }, id), output.createOutputDraft({}, id)];
  const outCheck = output.validateOutputDrafts(outRows);
  assert.deepEqual(outCheck.ready.map((row) => row._id), ['d1']);
  assert.deepEqual(outCheck.errors, ['الصف 3: اختر البند.']);

  const finRows = [
    ...finance.storedFinanceRows({ advances: [{ id: 'a', amount: 100, notes: 'x' }], payments: [{ id: 'p', amount: 50, source: 'cash', reference: 'R1', notes: null }] }),
    finance.createFinanceDraft({ kind: 'payment', amount: '75', reference: 'T-9' }, id),
    finance.createFinanceDraft({ notes: 'بلا مبلغ' }, id),
  ];
  assert.deepEqual(finRows.slice(0, 2).map((row) => [row.kind, row.amount, row.persisted]), [['advance', '100', true], ['payment', '50', true]]);
  const finCheck = finance.validateFinanceDrafts(finRows);
  assert.deepEqual(finCheck.ready.map((row) => row.reference), ['T-9']);
  assert.deepEqual(finCheck.errors, ['الصف 4: المبلغ مطلوب.']);
});

test('project ledgers: output, advances/payments and expenses carry their own day and contractor', async () => {
  const output = await import('../lib/project-operation-output.mjs');
  const finance = await import('../lib/project-operation-finance.mjs');
  const expenses = await import('../lib/project-direct-expenses.mjs');
  let n = 0;
  const id = () => `n${++n}`;

  // Output: a contractor may record only the items assigned to him on that day (or any item when he has none).
  const items = [{ id: 'i1' }, { id: 'i2' }];
  const links = [{ contractor_id: 'c1', project_item_id: 'i1', is_active: true, start_date: '2026-11-01', end_date: null }];
  const itemsFor = (contractor, date) => output.availableOutputItems(items, links, contractor, date);
  assert.deepEqual(itemsFor('c1', '2026-11-05').map((item) => item.id), ['i1']);
  assert.deepEqual(itemsFor('c2', '2026-11-05').map((item) => item.id), ['i1', 'i2']);
  const outRows = [
    output.createOutputDraft({ date: '2026-11-05', contractor_id: 'c1', item_id: 'i1', qty: '4' }, id),
    output.createOutputDraft({ date: '2026-11-05', contractor_id: 'c1', item_id: 'i2', qty: '4' }, id),
    output.createOutputDraft({ date: '2026-11-05', item_id: 'i1', qty: '2' }, id),
    output.createOutputDraft({ date: '2026-10-05', contractor_id: 'c2', item_id: 'i2', qty: '1' }, id),
  ];
  const outCheck = output.validateOutputDrafts(outRows, { itemsFor, from: '2026-11-01', to: '2026-11-09' });
  assert.deepEqual(outCheck.ready.map((row) => row._id), ['n1']);
  assert.deepEqual(outCheck.errors, [
    'الصف 2: البند غير مسند لهذا المقاول في 2026-11-05.',
    'الصف 3: اختر المقاول.',
    'الصف 4: التاريخ خارج فترة العرض — وسّع الفلترة لتشمله.',
  ]);

  // Advances & payments: saved rows sort by day; new rows need a day and a contractor.
  const stored = finance.storedFinanceRows({
    advances: [{ id: 'a', contractor_id: 'c1', advance_date: '2026-11-07', amount: 100 }],
    payments: [{ id: 'p', contractor_id: 'c2', payment_date: '2026-11-03', amount: 50, source: 'cash' }],
  });
  assert.deepEqual(stored.map((row) => `${row.date}:${row.kind}:${row.contractor_id}`), ['2026-11-03:payment:c2', '2026-11-07:advance:c1']);
  assert.deepEqual(finance.summarizeFinanceLedger(stored), { advanceTotal: 100, paymentTotal: 50, total: 150 });
  const finCheck = finance.validateFinanceDrafts([
    ...stored,
    finance.createFinanceDraft({ date: '2026-11-08', contractor_id: 'c1', amount: '75' }, id),
    finance.createFinanceDraft({ date: '2026-11-08', amount: '20' }, id),
  ], { ledger: true, from: '2026-11-01', to: '2026-11-09' });
  assert.equal(finCheck.ready.length, 1);
  assert.deepEqual(finCheck.errors, ['الصف 4: اختر المقاول.']);

  // Expenses: only saved lines really edited are updated; new lines are created per contractor.
  const savedA = expenses.storedExpenseToDraft({ id: 'e1', contractor_id: 'c1', expense_date: '2026-11-04', amount: 300, notes: 'وجبات', category: 'وجبات' }, '', id);
  const savedB = expenses.storedExpenseToDraft({ id: 'e2', contractor_id: 'c2', expense_date: '2026-11-05', amount: 90, notes: 'نقل', category: 'ترحيل' }, '', id);
  const baseline = { e1: expenses.directExpenseSignature(savedA), e2: expenses.directExpenseSignature(savedB) };
  const plan = expenses.planDirectExpenseLedger([
    savedA,
    { ...savedB, amount: '95' },
    expenses.createDirectExpenseDraft('2026-11-09', { contractor_id: 'c1', quantity: '3', unit_price: '40', notes: 'سقالات' }, id),
    expenses.createDirectExpenseDraft('2026-11-09', { contractor_id: 'c2', amount: '25', notes: 'ماء' }, id),
    expenses.createDirectExpenseDraft('2026-11-09', { contractor_id: 'c1', amount: '10', notes: 'ثلج' }, id),
    expenses.createDirectExpenseDraft('2026-11-09', { amount: '10', notes: 'بلا مقاول' }, id),
    expenses.createDirectExpenseDraft('2026-11-09', {}, id),
  ], { baseline, from: '2026-11-01', to: '2026-11-09' });
  assert.deepEqual(plan.updates.map((row) => row.id), ['e2']);
  assert.deepEqual(plan.creates.map((group) => `${group.contractorId}:${group.rows.length}`), ['c1:2', 'c2:1']);
  assert.equal(expenses.directExpensePayload(plan.creates[0].rows[0]).amount, 120);
  assert.deepEqual(plan.errors, ['الصف 6: اختر المقاول.']);
});

test('every read-only table in the dashboard gets the Excel layer, without touching sheets or print previews', async () => {
  const fs = await import('node:fs');
  const layout = fs.readFileSync('app/dashboard/layout.js', 'utf8');
  const runtime = fs.readFileSync('components/ui/SheetTableRuntime.js', 'utf8');
  assert.match(layout, /<WorkThresholdMarker \/>\s*<SheetTableRuntime \/>/);
  assert.ok(runtime.includes("const SCOPE = '[data-work-sheet-mount]'"));
  for (const excluded of ['[data-sheet-engine]', '[data-print-flow-root]', '[data-print-content]', '[data-sheet="off"]']) {
    assert.ok(runtime.includes(excluded), `runtime must exclude ${excluded}`);
  }
  for (const behaviour of ["addEventListener('copy'", 'toClipboardTable(matrix)', 'parseNumberText', "'Escape'", 'isEditableFocus()']) {
    assert.ok(runtime.includes(behaviour), `runtime lost ${behaviour}`);
  }
});
