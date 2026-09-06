import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const printSource = fs.readFileSync('app/print/quote/[id]/page.js', 'utf8');
const editorSource = fs.readFileSync('app/dashboard/quotes/[id]/terms/page.js', 'utf8');
const layoutSource = fs.readFileSync('app/dashboard/quotes/[id]/layout.js', 'utf8');

test('quotation print never infers hourly billing from labor-only or hidden quantity', () => {
  assert.doesNotMatch(printSource, /الأسعار المذكورة أعلاه بالساعة/);
  assert.doesNotMatch(printSource, /The above rates are hourly rates/);
  assert.doesNotMatch(printSource, /supply_scope\s*===\s*['"]labor_only['"]/);
});

test('offer-specific conditions and general contractual terms are separate', () => {
  assert.match(printSource, /quoteSpecificTerms=\(q\.terms_text\|\|''\)/);
  assert.match(printSource, /sourceTerms=\(Array\.isArray\(q\.terms_structured\)\?q\.terms_structured:\[\]\)\.filter\(hasTermContent\)/);
  assert.match(printSource, /شروط عرض السعر/);
  assert.match(printSource, /الشروط والأحكام العامة/);
});

test('quote text editor exposes the two term classes clearly', () => {
  assert.match(editorSource, /شروط عرض السعر — تظهر بعد جدول الأسعار دون عنوان/);
  assert.match(editorSource, /الشروط والأحكام العامة/);
  assert.match(editorSource, /لا يضيف البرنامج وصفًا تلقائيًا مثل «بالساعة»/);
});

test('quote workflow exposes a direct text and terms editor action', () => {
  assert.match(layoutSource, /نصوص وشروط العرض/);
  assert.match(layoutSource, /\/dashboard\/quotes\/\$\{id\}\/terms/);
});
