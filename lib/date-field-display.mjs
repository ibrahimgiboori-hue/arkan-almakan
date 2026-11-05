/**
 * What a native date field should show when the browser's own drawing can't be trusted.
 *
 * Chrome with an Arabic UI draws the empty placeholder ("يوم/شهر/سنة") with reversed,
 * disconnected letters, and draws filled values in the operating system's date order —
 * no CSS reaches inside either. LatinDigitsRuntime hides Chrome's text and paints this
 * module's text over the field instead (rules in app/globals.css):
 *
 *   - empty            → a correctly shaped Arabic hint (or the field's own placeholder)
 *   - filled           → the system date format dd/mm/yyyy (and HH:mm), Latin digits
 *   - being typed into → nothing: Chrome's own segments stay visible while editing
 *
 * Pure module: no DOM, so it is unit-tested directly.
 */

export const DATE_FIELD_HINTS = Object.freeze({
  date: 'يوم/شهر/سنة',
  'datetime-local': 'يوم/شهر/سنة — الوقت',
});

export const DATE_FIELD_LANG = 'en-GB';

// Isolate the digits left-to-right inside Arabic text without changing the box direction.
const LRI = '\u2066';
const PDI = '\u2069';

export function isOverlaidDateType(type) {
  return Object.prototype.hasOwnProperty.call(DATE_FIELD_HINTS, String(type || '').toLowerCase());
}

/** "2026-11-05" → "05/11/2026"; "2026-11-05T14:30" → "05/11/2026 14:30". Unknown shapes → ''. */
export function formatDateFieldValue(type, value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(value || ''));
  if (!match) return '';
  const [, year, month, day, hour, minute] = match;
  const date = `${day}/${month}/${year}`;
  if (String(type).toLowerCase() === 'datetime-local') return hour ? `${date} ${hour}:${minute}` : '';
  return date;
}

/**
 * @returns {{ mode: 'hint' | 'value' | 'off', display: string }}
 *   mode 'off' leaves the browser's native drawing alone.
 */
export function dateFieldDisplay({ type, value = '', placeholder = '', editing = false } = {}) {
  const key = String(type || '').toLowerCase();
  if (!isOverlaidDateType(key) || editing) return { mode: 'off', display: '' };
  if (!value) {
    const hint = String(placeholder || '').trim() || DATE_FIELD_HINTS[key];
    return { mode: 'hint', display: hint };
  }
  const text = formatDateFieldValue(key, value);
  return text ? { mode: 'value', display: `${LRI}${text}${PDI}` } : { mode: 'off', display: '' };
}
