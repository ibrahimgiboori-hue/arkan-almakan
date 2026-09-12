export const PRINT_EMPTY_KIND = Object.freeze({
  TEXT:'text',
  NUMBER:'number',
  DATE:'date',
});

const NUMERIC_TYPES = new Set([
  'number','money','amount','currency','percent','percentage','quantity','qty','integer','decimal',
]);

const DATE_TYPES = new Set([
  'date','datetime','date_time','timestamp',
]);

export function isEmptyPrintValue(value){
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

export function printEmptyKind(fieldOrType){
  const type = String(
    typeof fieldOrType === 'string' ? fieldOrType : fieldOrType?.type || 'text'
  ).trim().toLowerCase();
  if(DATE_TYPES.has(type)) return PRINT_EMPTY_KIND.DATE;
  if(NUMERIC_TYPES.has(type)) return PRINT_EMPTY_KIND.NUMBER;
  return PRINT_EMPTY_KIND.TEXT;
}

export function printEmptyToken(fieldOrType){
  const kind = printEmptyKind(fieldOrType);
  if(kind === PRINT_EMPTY_KIND.DATE) return '..../..../......';
  if(kind === PRINT_EMPTY_KIND.NUMBER) return '—';
  return '';
}
