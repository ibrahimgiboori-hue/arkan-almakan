export const ARABIC_GREGORIAN_LATIN_LOCALE = 'ar-SA-u-ca-gregory-nu-latn';
export const LATIN_NUMBER_LOCALE = 'en-US';

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const EASTERN_ARABIC = '۰۱۲۳۴۵۶۷۸۹';
const NON_LATIN_NUMBER_MARKS = /[٠-٩۰-۹٬٫٪]/;

export function latinDigits(value) {
  if (value === null || value === undefined) return '';
  let text = String(value)
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_INDIC.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(EASTERN_ARABIC.indexOf(digit)));

  // نحول علامات الأرقام العربية فقط عندما تكون بين/بجوار أرقام، حتى تبقى
  // علامات الترقيم العربية العامة كما هي ولا يتغير النص العربي نفسه.
  text = text
    .replace(/([0-9])٬(?=[0-9])/g, '$1,')
    .replace(/([0-9])٫(?=[0-9])/g, '$1.')
    .replace(/([0-9])٪/g, '$1%');

  return text;
}

export function hasNonLatinNumerals(value) {
  return NON_LATIN_NUMBER_MARKS.test(String(value ?? ''));
}

export function formatLatinNumber(value, options = {}) {
  const number = Number(value || 0);
  return new Intl.NumberFormat(LATIN_NUMBER_LOCALE, options).format(number);
}

export function formatArabicGregorianDate(value, options = {}) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(ARABIC_GREGORIAN_LATIN_LOCALE, options).format(date);
}
