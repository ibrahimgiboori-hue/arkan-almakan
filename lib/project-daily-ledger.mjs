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

export const PROJECT_MOVEMENTS_MAX_DAYS=31;

const SUMMARY_KEYS=Object.keys(PROJECT_DAILY_LEDGER_EMPTY_SUMMARY);

/** Days of the period (each a normalized daily ledger) → one list of rows carrying their date, and summed totals. */
export function mergeProjectDailyLedgers(days=[]){
  const summary={...PROJECT_DAILY_LEDGER_EMPTY_SUMMARY};
  const rows=[];
  for(const {date,ledger} of days||[]){
    for(const key of SUMMARY_KEYS)summary[key]+=Number(ledger?.summary?.[key]||0);
    for(const row of ledger?.rows||[])rows.push(Object.freeze({...row,id:`${date}:${row.id}`,date}));
  }
  rows.sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.time||'').localeCompare(String(b.time||''))||String(a.id).localeCompare(String(b.id)));
  return Object.freeze({rows:Object.freeze(rows),summary:Object.freeze(summary)});
}

/**
 * Narrow the movements sheet: by type, by contractor (the contractor named in the row; project-level
 * custody movements carry none and drop out) and by search text.
 */
export function filterProjectMovementRows(rows=[],{type='all',contractorName='',search=''}={}){
  const query=String(search||'').trim().toLowerCase();
  return filterProjectDailyLedgerRows(rows,type)
    .filter((row)=>!contractorName||String(row?.detail||'').split(' · ').includes(contractorName))
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
      const status=String(row.detail||'').split(' · ')[0];
      if(status==='كامل')summary.full+=1;
      else if(status==='نصف يوم')summary.half+=1;
      else if(status==='غياب')summary.absent+=1;
    }else if(row?.type==='output')summary.outputs+=1;
    else if(row?.type==='expense')summary.expenses+=amount;
    else if(row?.type==='custody'&&row.title==='صرف من العهدة')summary.custody+=amount;
    else if(row?.type==='advance')summary.advances+=amount;
    else if(row?.type==='payment')summary.payments+=amount;
  }
  return Object.freeze(summary);
}
