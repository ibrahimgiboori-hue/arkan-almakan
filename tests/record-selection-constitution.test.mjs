import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const constitution=fs.readFileSync('lib/work-surface-constitution.js','utf8');
const helpers=fs.readFileSync('lib/record-selection.js','utf8');
const grid=fs.readFileSync('components/ui/RawGrid.js','utf8');
const action=fs.readFileSync('components/ui/ProgramAction.js','utf8');
const kernel=fs.readFileSync('components/ui/WorkSheetKernel.js','utf8');
const payroll=fs.readFileSync('app/dashboard/workspace/workforce/section/payroll/page.js','utf8');
const payrollPrint=fs.readFileSync('app/print/payroll/[id]/page.js','utf8');
const budget=fs.readFileSync('app/dashboard/operating-budget/page.js','utf8');
const budgetPrint=fs.readFileSync('app/print/operating-budget/page.js','utf8');

test('selection is a constitutional action scope and never a cosmetic checkbox',()=>{
  assert.match(constitution,/WORK_ACTION_SCOPE/);
  assert.match(constitution,/explicit-record-set-action-scope-v1/);
  assert.match(constitution,/selection-alone-never-mutates-data/);
  assert.match(constitution,/server-snapshot-validated-batch-source-only/);
  assert.match(constitution,/derivedReports: 'print-export-only-unless-explicit-governed-batch-source'/);
  assert.match(constitution,/bulkDecision: 'deny-unless-action-explicitly-declares'/);
});

test('shared ledger owns multi-selection and visible select-all semantics',()=>{
  assert.match(grid,/selection = null/);
  assert.match(grid,/selectionState\(rows, selected/);
  assert.match(grid,/data-selection-surface/);
  assert.match(grid,/data-record-selected/);
  assert.match(grid,/visibleKeys/);
  assert.match(helpers,/appendSelectionToUrl/);
  assert.match(helpers,/filterBySelection/);
});

test('program actions know when their target is the selected record set',()=>{
  assert.match(action,/selectionCount/);
  assert.match(action,/data-action-scope/);
  assert.match(action,/data-selection-required/);
  assert.match(action,/bulkDecisionAllowed/);
  assert.match(kernel,/WorkSelectionDock/);
  assert.match(kernel,/data-selection-dock/);
});

test('payroll can print and submit exactly the selected employees',()=>{
  assert.match(payroll,/printSelected/);
  assert.match(payroll,/appendSelectionToUrl\(`\/print\/payroll/);
  assert.match(payroll,/رفع المحدد للمالية/);
  assert.match(payroll,/fn_submit_payroll_batch/);
  assert.match(payroll,/selection=\{\{/);
  assert.match(payrollPrint,/filterBySelection\(lines,selectedIds,'id'\)/);
  assert.match(payrollPrint,/الموظفون المحددون فقط/);
});

test('operating budget treats selection as report scope, not an invented transaction',()=>{
  assert.match(budget,/selectedStatementIds/);
  assert.match(budget,/printSelectedStatement/);
  assert.match(budget,/طباعة المحدد/);
  assert.doesNotMatch(budget,/submitSelectedStatement|approveSelectedStatement|fn_submit.*budget.*selected/i);
  assert.match(budgetPrint,/filterBySelection\(rows, selectedIds, 'line_id'\)/);
  assert.match(budgetPrint,/البنود المحددة/);
});
