export const PROJECT_DAILY_LEDGER_EMPTY_SUMMARY=Object.freeze({
  attendance:0,full:0,half:0,absent:0,outputs:0,expenses:0,custody:0,advances:0,payments:0,movements:0,
});

export const PROJECT_DAILY_LEDGER_FILTERS=Object.freeze([
  Object.freeze(['all','الكل']),
  Object.freeze(['attendance','الحضور']),
  Object.freeze(['output','الإنجاز']),
  Object.freeze(['expense','المصروفات']),
  Object.freeze(['custody','العهدة']),
  Object.freeze(['advance','السلف']),
  Object.freeze(['payment','الدفعات']),
]);

const money=(value)=>Number(value||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

export function normalizeProjectDailyLedger(payload={}){
  const rows=Array.isArray(payload?.rows)?payload.rows.map((row)=>({
    ...row,
    value:row.valueText||(row.amount!==null&&row.amount!==undefined?`${money(row.amount)} ر.س`:null),
  })):[];
  return Object.freeze({
    rows:Object.freeze(rows),
    summary:Object.freeze({...PROJECT_DAILY_LEDGER_EMPTY_SUMMARY,...(payload?.summary||{})}),
  });
}

export function filterProjectDailyLedgerRows(rows=[],filter='all'){
  return filter==='all'?(rows||[]):(rows||[]).filter((row)=>row?.type===filter);
}
