import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIRECT_EXPENSE_VALIDATION,
  DirectExpenseValidationError,
  createDirectExpenseDraft,
  directExpensePayload,
  duplicateDirectExpenseSeed,
  storedExpenseToDraft,
  summarizeDirectExpenseGrid,
  validateDirectExpenseGrid,
} from '../lib/project-direct-expenses.mjs';

const idFactory=()=> 'draft-1';

test('maps stored direct expenses into editable grid rows without losing reimbursement state',()=>{
  const row=storedExpenseToDraft({
    id:'expense-1',expense_date:'2026-09-12',amount:125.5,notes:'مواد موقع',category:'مواد',payer:'contractor',charge_to:'arkan',
    project_item_id:'item-1',paid_by_employee_id:'employee-1',is_recoverable:true,reimbursement_status:'pending',reimbursed_amount:25,
  },'2026-09-12',idFactory);
  assert.equal(row._id,'draft-1');
  assert.equal(row.persisted,true);
  assert.equal(row.payer,'employee');
  assert.equal(row.amount,'125.5');
  assert.equal(row.reimbursed_amount,25);
});

test('serializes only persistence-owned direct expense fields',()=>{
  const payload=directExpensePayload({
    expense_date:'2026-09-12',amount:'50.25',notes:'  وقود  ',category:'وقود',payer:'contractor',charge_to:'contractor',
    project_item_id:'',paid_by_employee_id:'employee-should-not-persist',is_recoverable:true,
  },'2026-09-12');
  assert.deepEqual(payload,{
    expense_date:'2026-09-12',amount:50.25,notes:'وقود',category:'وقود',payer:'contractor',charge_to:'contractor',
    project_item_id:null,paid_by_employee_id:null,is_recoverable:false,
  });
});

test('requires amount and description together for every used row',()=>{
  assert.throws(
    ()=>validateDirectExpenseGrid([{amount:'100',notes:''}]),
    (error)=>error instanceof DirectExpenseValidationError&&error.code===DIRECT_EXPENSE_VALIDATION.INCOMPLETE,
  );
});

test('requires the paying employee when payer is employee',()=>{
  assert.throws(
    ()=>validateDirectExpenseGrid([{amount:'100',notes:'سلفة شراء',payer:'employee',paid_by_employee_id:''}]),
    (error)=>error instanceof DirectExpenseValidationError&&error.code===DIRECT_EXPENSE_VALIDATION.EMPLOYEE_REQUIRED,
  );
});

test('summarizes saved, ready, new and employee-reimbursement amounts consistently',()=>{
  const rows=[
    {persisted:true,amount:'100',notes:'أ',paid_by_employee_id:'e1',reimbursed_amount:30},
    {persisted:true,amount:'50',notes:'ب',paid_by_employee_id:'',reimbursed_amount:0},
    {persisted:false,amount:'25',notes:'ج',paid_by_employee_id:'',reimbursed_amount:0},
    {persisted:false,amount:'80',notes:'',paid_by_employee_id:'',reimbursed_amount:0},
  ];
  const summary=summarizeDirectExpenseGrid(rows);
  assert.equal(summary.savedRows.length,2);
  assert.equal(summary.validRows.length,3);
  assert.equal(summary.newRows.length,1);
  assert.equal(summary.savedTotal,150);
  assert.equal(summary.currentGridTotal,175);
  assert.equal(summary.employeeDue,70);
});

test('duplicate seed carries classification context but not amount or description',()=>{
  const seed=duplicateDirectExpenseSeed({
    expense_date:'2026-09-11',category:'وجبات',payer:'employee',charge_to:'arkan',project_item_id:'item-7',paid_by_employee_id:'e7',amount:99,notes:'لا تنسخ',
  },'2026-09-12');
  assert.deepEqual(seed,{
    expense_date:'2026-09-11',category:'وجبات',payer:'employee',charge_to:'arkan',project_item_id:'item-7',paid_by_employee_id:'e7',
  });
  const draft=createDirectExpenseDraft('2026-09-12',seed,idFactory);
  assert.equal(draft.amount,'');
  assert.equal(draft.notes,'');
});
