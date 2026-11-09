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

/* ---------- movements over a period: one read-only sheet for the project ---------- */

// The database returns the whole period in one call (fn_project_ledger_range), each row with its date and contractor.
export const PROJECT_MOVEMENTS_MAX_DAYS=92;

/** Narrow the movements sheet by type, contractor (exact id; project-level custody has none) and search text. */
export function filterProjectMovementRows(rows=[],{type='all',contractorId='',search=''}={}){
  const query=String(search||'').trim().toLowerCase();
  return filterProjectDailyLedgerRows(rows,type)
    .filter((row)=>!contractorId||row?.contractorId===contractorId)
    .filter((row)=>!query||[row?.title,row?.detail,row?.value].filter(Boolean).some((value)=>String(value).toLowerCase().includes(query)));
}

/** Totals of the rows a filter leaves (so the strip always describes what the sheet shows). */
export function summarizeProjectMovementRows(rows=[]){
  const summary={...PROJECT_DAILY_LEDGER_EMPTY_SUMMARY};
  for(const row of rows||[]){
    const amount=Number(row?.amount||0);
    summary.movements+=1;
    if(row?.type==='attendance'){
      summary.attendance+=1;
      if(row.statusCode==='full')summary.full+=1;
      else if(row.statusCode==='half')summary.half+=1;
      else if(row.statusCode==='absent')summary.absent+=1;
    }else if(row?.type==='output')summary.outputs+=1;
    else if(row?.type==='expense')summary.expenses+=amount;
    else if(row?.type==='custody'&&row.statusCode==='spend')summary.custody+=amount;
    else if(row?.type==='advance')summary.advances+=amount;
    else if(row?.type==='payment')summary.payments+=amount;
  }
  return Object.freeze(summary);
}
