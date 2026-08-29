// دستور تنسيق النصوص في المطبوعات — اختيار المستخدم اليدوي يعلو على التخمين التلقائي.
// هذا الملف هو المصدر الوحيد لأوضاع المحاذاة التي يسمح بها القبطان.

export const PRINT_TEXT_GOVERNANCE_VERSION = '1.0';

export const PRINT_TEXT_ALIGNMENTS = Object.freeze({
  RIGHT: 'right',
  CENTER: 'center',
  LEFT: 'left',
  JUSTIFY: 'justify',
});

export const PRINT_TEXT_ALIGNMENT_OPTIONS = Object.freeze([
  Object.freeze({ key:PRINT_TEXT_ALIGNMENTS.RIGHT, label:'يمين' }),
  Object.freeze({ key:PRINT_TEXT_ALIGNMENTS.CENTER, label:'وسط' }),
  Object.freeze({ key:PRINT_TEXT_ALIGNMENTS.LEFT, label:'يسار' }),
  Object.freeze({ key:PRINT_TEXT_ALIGNMENTS.JUSTIFY, label:'ممتد / كشيدة' }),
]);

export const PRINT_TEXT_POLICY = Object.freeze({
  owner:'user',
  unit:'individual-text-block',
  manualOverridePriority:'absolute',
  automaticAlignment:'fallback-only',
  persistence:'per-print-instance',
  storage:'print_layout_overrides-instance-prefixed-record',
  supportedAlignments:Object.freeze(Object.values(PRINT_TEXT_ALIGNMENTS)),
  justifyPolicy:'full-line-justify-with-justified-last-line',
  mutateTextContentForKashida:false,
  preserveDocumentDirection:true,
});

const ALLOWED = new Set(Object.values(PRINT_TEXT_ALIGNMENTS));

export function normalizePrintTextAlignment(value) {
  const clean = String(value || '').trim().toLowerCase();
  return ALLOWED.has(clean) ? clean : null;
}

export function printTextInstanceStorageKey(documentKey, pathname) {
  const doc = String(documentKey || 'unknown').trim() || 'unknown';
  const path = String(pathname || '/').split('?')[0] || '/';
  return `text-instance:${doc}:${path}`;
}
