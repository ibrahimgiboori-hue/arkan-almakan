import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync('app/ui-signature-tailoring.css', 'utf8');

test('Signature empty states are styled before semantic hydration', () => {
  assert.match(css, /\.rawDashboardShell \.empty \{/);
  assert.match(css, /min-height:\s*178px/);
  assert.match(css, /var\(--signature-context-art\)/);
});

test('Signature loading state remains distinct from ordinary empty states', () => {
  assert.match(css, /\[data-ui-slot='empty'\]\[data-ui-state='loading'\]/);
  assert.match(css, /signatureLoadingSpin/);
  assert.match(css, /نجهّز مساحة العمل/);
});

test('document template catalog uses larger Signature cards instead of the dense tile wall', () => {
  assert.match(css, /a\[href\^='\/dashboard\/documents\/new\/'\]/);
  assert.match(css, /grid-template-columns:\s*repeat\(auto-fit, minmax\(310px, 1fr\)\)/);
  assert.match(css, /min-height:\s*168px/);
});

test('screen tailoring never reaches into print', () => {
  assert.doesNotMatch(css, /@media\s+print/i);
}
);
