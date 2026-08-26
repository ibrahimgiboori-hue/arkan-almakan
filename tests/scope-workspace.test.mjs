import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEM_EXECUTION_AR, ITEM_EXECUTION_CLASS, itemExecutionState } from '../lib/projects.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const scope = read('components/ProjScope.js');
const dialog = read('components/ui/ConstitutionDialog.js');
const confirm = read('components/ui/ConfirmDialog.js');

test('the scope screen asks its questions inside the system, never through the browser', () => {
  assert.equal(scope.includes('window.confirm'), false);
  assert.equal(scope.includes('window.alert'), false);
  assert.equal(scope.includes('window.prompt'), false);
  assert.equal(scope.includes("import ConfirmDialog from '@/components/ui/ConfirmDialog'"), true);
});

test('every destructive scope action routes through one confirm path', () => {
  // لا حوار تأكيد محلي جديد: كلاهما يمر بـconfirmAction ثم runConfirmAction.
  assert.match(scope, /function requestDeleteItem\(/);
  assert.match(scope, /function requestCancelAssignment\(/);
  assert.match(scope, /async function runConfirmAction\(/);
  assert.equal((scope.match(/<ConfirmDialog/g) || []).length, 1);
});

test('the performing functions no longer decide whether to ask', () => {
  // del/delDecision صارتا تنفيذًا خالصًا ترمي الخطأ ليعرضه الحوار في مكانه.
  const del = scope.slice(scope.indexOf('async function del(id)'), scope.indexOf('function requestDeleteItem'));
  assert.equal(del.includes('confirm'), false);
  assert.match(del, /throw new Error/);

  const cancel = scope.slice(scope.indexOf('async function delDecision('), scope.indexOf('if (!items) return'));
  assert.equal(cancel.includes('confirm'), false);
  assert.match(cancel, /throw new Error/);
});

test('execution state vocabulary has exactly one home', () => {
  assert.equal(/const SAR\s*=/.test(scope), false, 'the local status dictionary must be gone');
  assert.equal(scope.includes('ITEM_EXECUTION_AR'), true);
  assert.equal(scope.includes('itemExecutionState'), true);
  // كل حالة يعرفها المحلل لها تسمية وصنف — لا حالة تُعرض undefined.
  for (const state of ['unassigned', 'planned', 'active', 'paused', 'ended']) {
    assert.equal(typeof ITEM_EXECUTION_AR[state], 'string', state);
    assert.equal(typeof ITEM_EXECUTION_CLASS[state], 'string', state);
  }
});

test('assignment state is derived, never guessed per screen', () => {
  assert.equal(itemExecutionState(null), 'unassigned');
  assert.equal(itemExecutionState({}), 'planned');
  assert.equal(itemExecutionState({ start_date:'2026-08-01' }), 'active');
  assert.equal(itemExecutionState({ start_date:'2026-08-01', status:'paused' }), 'paused');
  assert.equal(itemExecutionState({ start_date:'2026-08-01', is_active:false }), 'paused');
  assert.equal(itemExecutionState({ start_date:'2026-08-01', end_date:'2026-08-20' }), 'ended');
  // الإسناد المنتهي يبقى منتهيًا حتى لو بقيت رايات أخرى قديمة عليه.
  assert.equal(itemExecutionState({ start_date:'2026-08-01', end_date:'2026-08-20', is_active:false }), 'ended');
});

test('the scope screen uses the Riyadh day, not the UTC day', () => {
  assert.equal(scope.includes("new Date().toISOString().slice(0,10)"), false);
  assert.equal(scope.includes('todayIsoInRiyadh'), true);
});

test('the scope table no longer stacks its own navigation or inline panels', () => {
  assert.equal(scope.includes('rowsplit stickybar'), false);
  assert.equal(scope.includes("<div className=\"section\" style={{marginTop:0,overflowX:'auto'}}>"), false);
  assert.equal(scope.includes('<nav'), false);
});

test('stacked dialogs cannot leave the page scroll-locked', () => {
  // حفظ/استرجاع overflow لكل حوار على حدة يقفل الصفحة عند إغلاق حوارين معًا.
  assert.match(dialog, /openDialogCount/);
  assert.equal(dialog.includes('const previousOverflow'), false);
  assert.match(dialog, /function unlockPageScroll/);
});

test('only the topmost dialog answers Escape', () => {
  assert.match(dialog, /querySelectorAll\('\[data-constitution-dialog\]'\)/);
  assert.equal(dialog.includes(':last-of-type'), false, 'last-of-type matches every dialog in its own backdrop');
});

test('stacked dialogs do not duplicate a DOM id', () => {
  assert.equal(dialog.includes('"constitution-dialog-title"'), false);
  assert.match(dialog, /useId\(\)/);
});

test('a dialog effect does not re-run on every parent render', () => {
  // onClose يُمرَّر كدالة سهمية، فوجودها في deps كان يقفل/يفك التمرير كل رسم.
  assert.match(dialog, /onCloseRef/);
  assert.match(dialog, /\}, \[open\]\);/);
});

test('a confirm in progress cannot be dismissed into an unknown state', () => {
  assert.match(confirm, /disabled=\{busy\}/);
  assert.match(confirm, /busy \? \(\) => \{\} : onCancel/);
  assert.match(confirm, /error \?/);
});
