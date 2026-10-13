import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceInstallmentAmount, buildAdvanceProcedureSlots } from '../lib/advance-request.mjs';
import { getWorkflowActions } from '../lib/workflow-actions.js';
import { resolvePrintDocument } from '../lib/print-governance.js';

test('a submitted advance inherits the governed finance print route', () => {
  const definition = resolvePrintDocument('/print/advance/request-fixture');
  assert.equal(definition.key, 'advance_request');
  assert.equal(definition.family, 'corporate-finance');
});

test('request installments share financial rounding and reject invalid division', () => {
  assert.equal(advanceInstallmentAmount('200.00', 1), 200);
  assert.equal(advanceInstallmentAmount(100, 3), 33.33);
  for (const [amount, count] of [[200, 0], [200, 1.5], [NaN, 1], [200, ''], ['', 1]]) {
    assert.equal(advanceInstallmentAmount(amount, count), null);
  }
});

test('an unreviewed request prints pending actions and manual signature fields', () => {
  const slots = buildAdvanceProcedureSlots([], 'موظف الاختبار');
  assert.deepEqual(slots.electronic.map((item) => item.action), getWorkflowActions('advance').map((item) => item.label));
  assert.ok(slots.electronic.every((item) => item.state === 'بانتظار الإجراء' && item.date === null && !item.actor));
  assert.equal(slots.manual[0].name, 'موظف الاختبار');
  assert.equal(slots.manual.length, 4);
});

test('procedure snapshots preserve the actual actor and decision without implying approval', () => {
  const slots = buildAdvanceProcedureSlots([
    { step_order:1, scenario_snapshot:'normal', action_label_snapshot:'مراجعة الموارد البشرية', actor_name:'القائم بالإجراء', actor_title:'مسؤول الموارد البشرية', decision:'approved', decision_date:'2026-10-13' },
    { step_order:2, scenario_snapshot:'normal', action_label_snapshot:'مراجعة مالية', actor_name:'المحاسب', decision:'rejected', decision_date:'2026-10-14' },
  ]);
  assert.equal(slots.electronic[0].action, 'مراجعة الموارد البشرية');
  assert.equal(slots.electronic[0].title, 'مسؤول الموارد البشرية');
  assert.equal(slots.electronic[0].date, '2026-10-13');
  assert.equal(slots.electronic[1].state, 'مرفوض');
  assert.equal(slots.electronic[2].state, 'بانتظار الإجراء');
  assert.equal(slots.manual[1].name, 'القائم بالإجراء');
});

test('exceptional advance procedures use the shared workflow scenario', () => {
  const slots = buildAdvanceProcedureSlots([{ step_order:1, scenario_snapshot:'exceptional', decision:'approved' }]);
  assert.deepEqual(slots.electronic.map((item) => item.action), getWorkflowActions('advance', { exceptional:true }).map((item) => item.label));
});
