import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARKAN_LETTERHEAD_PROFILE,
  PRINT_DOCUMENTS,
  PRINT_GOVERNANCE_VERSION,
  PRINT_LINE_FLOW_POLICY,
  PRINT_STATUS,
  PRINT_WORD_STANDARD,
  getPrintLayoutPolicy,
} from '../lib/print-governance.js';

test('all registered print routes are governed by the current captain version', () => {
  const entries = Object.entries(PRINT_DOCUMENTS);
  assert.ok(entries.length > 0);
  for (const [key, definition] of entries) {
    assert.equal(definition.status, PRINT_STATUS.GOVERNED, key);
    assert.equal(definition.governedVersion, PRINT_GOVERNANCE_VERSION, key);
    assert.ok(Array.isArray(definition.routes) && definition.routes.length > 0, key);
  }
});

test('captain geometry is anchored to the Word A4 physical standard', () => {
  assert.deepEqual(PRINT_WORD_STANDARD, {
    id:'word-standard-a4-v1',
    portraitWidthMm:210,
    portraitHeightMm:297,
    landscapeWidthMm:297,
    landscapeHeightMm:210,
    bodyMarginMm:25.4,
    headerFromEdgeMm:12.7,
    footerFromEdgeMm:12.7,
  });
  assert.equal(ARKAN_LETTERHEAD_PROFILE.watermarkBlocksContent, false);
  assert.ok(ARKAN_LETTERHEAD_PROFILE.portraitTopArtworkMm > 0);
  assert.ok(ARKAN_LETTERHEAD_PROFILE.portraitBottomArtworkMm > 0);
});

test('row pagination no longer uses fixed row capacities', () => {
  assert.equal('pagination' in (PRINT_DOCUMENTS.timesheet_report.layout || {}), false);
  assert.equal('pagination' in (PRINT_DOCUMENTS.expense_report.layout || {}), false);
  assert.equal(typeof PRINT_DOCUMENTS.timesheet_report.layout?.pagination, 'undefined');
  assert.equal(typeof PRINT_DOCUMENTS.expense_report.layout?.pagination, 'undefined');
});

test('visual line seams are owned by the one paged captain', () => {
  assert.equal(PRINT_LINE_FLOW_POLICY.owner, 'ConstitutionPagedFrame');
  assert.equal(PRINT_LINE_FLOW_POLICY.measurementUnit, 'visual-line-box');
  assert.equal(PRINT_LINE_FLOW_POLICY.geometryUnit, 'mm');
  assert.equal(PRINT_LINE_FLOW_POLICY.splitOnlyAfterCompletedLine, true);
  assert.equal(PRINT_LINE_FLOW_POLICY.avoidSingleLineWidowWhenPossible, true);
});

test('document layout is derived from family policy plus document overrides', () => {
  const payroll = getPrintLayoutPolicy('payroll_run');
  const expense = getPrintLayoutPolicy('expense_report');
  assert.equal(payroll.orientation, 'landscape');
  assert.equal(expense.orientation, 'portrait');
  assert.equal(payroll.paper.bodyMarginMm, 25.4);
  assert.equal(expense.lineFlow.owner, 'ConstitutionPagedFrame');
});
