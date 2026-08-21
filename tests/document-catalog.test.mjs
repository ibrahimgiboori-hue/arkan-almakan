import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DOCUMENT_CATALOG,
  DOCUMENT_CATEGORY_META,
  DOCUMENT_CATALOG_VERSION,
} from '../lib/document-catalog.mjs';

test('الكتالوج يحتوي 121 نموذجًا إداريًا فعليًا', () => {
  assert.equal(DOCUMENT_CATALOG.length, 121);
  assert.equal(new Set(DOCUMENT_CATALOG.map((item) => item.code)).size, 121);
  assert.equal(new Set(DOCUMENT_CATALOG.map((item) => item.nameAr)).size, 121);
});

test('كل عائلة جديدة تحتوي عشرة نماذج', () => {
  const newCategories = Object.keys(DOCUMENT_CATEGORY_META).slice(0, 12);
  for (const category of newCategories) {
    const expected = category === 'projects_operations' ? 11 : 10;
    assert.equal(DOCUMENT_CATALOG.filter((item) => item.category === category).length, expected, category);
  }
});

test('كل نموذج مرتبط بدستور 48 وحدة وله أقسام تعبئة واعتماد', () => {
  const allowedRelations = new Set(['employee', 'project', 'party', 'general']);
  for (const item of DOCUMENT_CATALOG) {
    assert.equal(item.constitutionVersion, DOCUMENT_CATALOG_VERSION);
    assert.equal(item.layout.gridColumns, 48);
    assert.equal(item.layout.schemaVersion, 3);
    assert.ok(item.descriptionAr.length > 20, item.code);
    assert.ok(item.relationScope.length > 0, item.code);
    assert.ok(item.relationScope.every((scope) => allowedRelations.has(scope)), item.code);
    assert.ok(item.layout.sections.some((section) => section.kind === 'cards'), item.code);
    assert.ok(item.layout.sections.some((section) => section.kind === 'text'), item.code);
    assert.ok(item.layout.sections.some((section) => section.kind === 'signatures'), item.code);

    for (const section of item.layout.sections) {
      for (const field of [...(section.fields || []), ...(section.columns || [])]) {
        assert.ok(Number(field.span) >= 1 && Number(field.span) <= 48, `${item.code}:${field.key}`);
      }
      if (section.kind === 'table') {
        assert.equal(section.columns.reduce((sum, field) => sum + field.span, 0), 48, item.code);
        const textual = section.columns.filter((field) => !['money', 'number', 'date'].includes(field.type));
        const numeric = section.columns.filter((field) => ['money', 'number'].includes(field.type));
        if (textual.length && numeric.length) {
          assert.ok(Math.max(...textual.map((field) => field.span)) > Math.min(...numeric.map((field) => field.span)), item.code);
        }
      }
    }
  }
});
