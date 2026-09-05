import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('stamp and signature assets have one shared renderer', () => {
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

  assert.match(quote, /import PrintMarks/);
  assert.match(quote, /renderOverlay=/);
  assert.match(quote, /pageIndex===pageCount-1/);
  assert.match(quote, /showStamp=\{Boolean\(q\.show_stamp\)\}/);
  assert.match(quote, /showSignature=\{Boolean\(q\.show_signature\)\}/);
  assert.doesNotMatch(quote, /stamp_image_path|signature_image_path|getPublicUrl/);
});

test('quotation keeps shared mark dragging and persistence wired', () => {
  const quote = source('app/print/quote/[id]/page.js');

  assert.match(quote, /stamp_x_mm/);
  assert.match(quote, /stamp_y_mm/);
  assert.match(quote, /sign_x_mm/);
  assert.match(quote, /sign_y_mm/);
  assert.match(quote, /stampProps=\{\{onPointerDown:startDrag\('stamp'\)\}\}/);
  assert.match(quote, /signatureProps=\{\{onPointerDown:startDrag\('sign'\)\}\}/);
  assert.match(quote, /onPointerMove=\{onMove\}/);
  assert.match(quote, /onPointerUp=\{endDrag\}/);
  assert.match(quote, /supabase\.from\('quotations'\)\.update\(fields\)/);
});
