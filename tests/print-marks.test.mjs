import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('stamp and signature assets have one shared renderer owned by the paged captain', () => {
  const marks = source('components/print/PrintMarks.js');
  const pagedFrame = source('components/print/ConstitutionPagedFrame.js');
  const frame = source('components/print/ConstitutionPrintFrame.js');
  const quote = source('app/print/quote/[id]/page.js');

  assert.match(marks, /stamp_image_path/);
  assert.match(marks, /signature_image_path/);
  assert.match(marks, /print-master-stamp/);
  assert.match(marks, /print-master-signature/);

  assert.match(pagedFrame, /import PrintMarks/);
  assert.match(pagedFrame, /<PrintMarks/);
  assert.match(pagedFrame, /pageIndex === pageCount - 1/);
  assert.doesNotMatch(pagedFrame, /cfg\?\.stamp_image_path/);
  assert.doesNotMatch(pagedFrame, /cfg\?\.signature_image_path/);

  assert.match(frame, /import ConstitutionPagedFrame/);
  assert.match(frame, /showStamp=\{showStamp\}/);
  assert.match(frame, /showSignature=\{showSignature\}/);

  assert.match(quote, /import ConstitutionPrintFrame/);
  assert.doesNotMatch(quote, /import PrintMarks/);
  assert.match(quote, /showStamp=\{Boolean\(q\.show_stamp\)\}/);
  assert.match(quote, /showSignature=\{Boolean\(q\.show_signature\)\}/);
  assert.doesNotMatch(quote, /stamp_image_path|signature_image_path|getPublicUrl/);
});

test('quotation delegates mark placement to the shared captain with no retired coordinate API', () => {
  const quote = source('app/print/quote/[id]/page.js');

  assert.match(quote, /<ConstitutionPrintFrame/);
  assert.match(quote, /showStamp=\{Boolean\(q\.show_stamp\)\}/);
  assert.match(quote, /showSignature=\{Boolean\(q\.show_signature\)\}/);
  assert.doesNotMatch(quote, /stamp_x_mm|stamp_y_mm|sign_x_mm|sign_y_mm/);
  assert.doesNotMatch(quote, /renderOverlay=|onPointerMove=|onPointerUp=|onPointerLeave=/);
});
