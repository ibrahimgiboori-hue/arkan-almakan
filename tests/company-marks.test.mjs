import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { companyMarkLocation, exposedCompanyMarks, isPrivateMarkPath, privateMarkPath } from '../lib/company-marks.mjs';

test('stamp and signature live in the private vault; old public paths still resolve until re-uploaded', () => {
  assert.deepEqual({ ...companyMarkLocation('company-marks/stamp.png') }, { bucket: 'company-marks', key: 'stamp.png', private: true });
  assert.deepEqual({ ...companyMarkLocation('stamp_image_path.png') }, { bucket: 'brand', key: 'stamp_image_path.png', private: false });
  assert.equal(companyMarkLocation(''), null);
  assert.equal(privateMarkPath('stamp_image_path', 'Stamp.PNG'), 'company-marks/stamp.png');
  assert.equal(privateMarkPath('signature_image_path', 'sig.jpeg'), 'company-marks/signature.jpg');
  assert.equal(privateMarkPath('signature_image_path', 'sig.svg'), 'company-marks/signature.png');
  assert.throws(() => privateMarkPath('company_logo_path', 'x.png'));
  assert.deepEqual(exposedCompanyMarks({ stamp_image_path: 'stamp_image_path.png', signature_image_path: 'company-marks/signature.png' }), ['stamp_image_path']);
  assert.equal(isPrivateMarkPath('company-marks/x.png'), true);
});

test('every stamp/signature image goes through the one resolver — no public link anywhere', () => {
  const files = ['components/print/PrintMarks.js', 'lib/adapters/quote-editor-supabase.js', 'app/dashboard/quotes/[id]/workbook-print/page.js', 'app/dashboard/settings/page.js'];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /company-marks-client/, file);
    assert.doesNotMatch(source, /getPublicUrl\([^)]*(stamp|signature)/i, file);
  }
  const marks = fs.readFileSync('components/print/PrintMarks.js', 'utf8');
  assert.match(marks, /company-mark-denied no-print/);
});

test('the vault migration is private and limited to the primary user or the CEO', () => {
  const sql = fs.readFileSync('supabase/migrations/20261109200000_private_company_marks.sql', 'utf8');
  assert.match(sql, /'company-marks', 'company-marks', false/);
  for (const op of ['select', 'insert', 'update', 'delete']) {
    assert.match(sql, new RegExp(`for ${op} to authenticated`), op);
  }
  assert.equal((sql.match(/fn_is_primary_user\(\) or public\.current_app_role\(\) = 'ceo'/g) || []).length >= 4, true);
  assert.doesNotMatch(sql, /to anon|to public/);
});
