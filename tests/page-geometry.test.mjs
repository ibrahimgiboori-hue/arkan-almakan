import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PAGE_SAFE_AREA_FALLBACK,
  centralSafeArea,
  contentBoxMm,
  documentSafeAreaOverride,
  normaliseSafeAreaInput,
  resolvePageSafeArea,
  safeAreaWarnings,
} from '../lib/page-geometry.mjs';

const settings = { page_safe_top_mm: '47', page_safe_bottom_mm: 39, page_safe_right_mm: 16.5, page_safe_left_mm: '16.5' };

test('central safe area reads the four app_settings columns', () => {
  assert.deepEqual(centralSafeArea(settings), { topMm: 47, bottomMm: 39, rightMm: 16.5, leftMm: 16.5 });
});

test('missing columns fall back per edge to the pre-existing effective geometry', () => {
  assert.deepEqual(centralSafeArea({}), { ...PAGE_SAFE_AREA_FALLBACK });
  assert.deepEqual(centralSafeArea({ page_safe_top_mm: 50 }), { ...PAGE_SAFE_AREA_FALLBACK, topMm: 50 });
});

test('portrait pages use the four central values exactly — no hidden Word minimum', () => {
  const area = resolvePageSafeArea({ central: centralSafeArea(settings) });
  assert.deepEqual(area, { topMm: 47, bottomMm: 39, rightMm: 16.5, leftMm: 16.5 });
});

test('a document override replaces only the edges it names', () => {
  const area = resolvePageSafeArea({ central: centralSafeArea(settings), override: { leftMm: 30, topMm: '' } });
  assert.deepEqual(area, { topMm: 47, bottomMm: 39, rightMm: 16.5, leftMm: 30 });
  assert.deepEqual(documentSafeAreaOverride({ rightMm: 'x', bottomMm: null }), {});
});

test('landscape with the letterhead on the long sides rotates the four values with the paper', () => {
  const central = centralSafeArea(settings);
  assert.deepEqual(
    resolvePageSafeArea({ central, orientation: 'landscape', sideReservedLetterhead: true, paperRotation: 'clockwise' }),
    { topMm: 16.5, bottomMm: 16.5, rightMm: 47, leftMm: 39 },
  );
  assert.deepEqual(
    resolvePageSafeArea({ central, orientation: 'landscape', sideReservedLetterhead: true, paperRotation: 'counterclockwise' }),
    { topMm: 16.5, bottomMm: 16.5, rightMm: 39, leftMm: 47 },
  );
});

test('landscape with the letterhead still across the top keeps top/bottom', () => {
  const central = centralSafeArea(settings);
  assert.deepEqual(resolvePageSafeArea({ central, orientation: 'landscape' }), central);
});

test('plain paper uses the side margin on every edge', () => {
  assert.deepEqual(
    resolvePageSafeArea({ central: centralSafeArea(settings), letterheadSource: 'none' }),
    { topMm: 16.5, bottomMm: 16.5, rightMm: 16.5, leftMm: 16.5 },
  );
});

test('content box is the paper minus the four edges', () => {
  assert.deepEqual(contentBoxMm({ topMm: 47, bottomMm: 39, rightMm: 16.5, leftMm: 16.5 }), { widthMm: 177, heightMm: 211 });
  assert.deepEqual(contentBoxMm({ topMm: 10, bottomMm: 10, rightMm: 10, leftMm: 10 }, 'landscape'), { widthMm: 277, heightMm: 190 });
});

test('warnings explain overlaps and tiny content areas but never block', () => {
  assert.deepEqual(safeAreaWarnings({ topMm: 47, bottomMm: 39, rightMm: 16.5, leftMm: 16.5 }, { artwork: { topMm: 34.23, bottomMm: 19.13 } }), []);
  const overlap = safeAreaWarnings({ topMm: 20, bottomMm: 10, rightMm: 16.5, leftMm: 16.5 }, { artwork: { topMm: 34.23, bottomMm: 19.13 } });
  assert.equal(overlap.length, 2);
  assert.match(overlap[0], /الترويسة/);
  assert.match(safeAreaWarnings({ topMm: 10, bottomMm: 10, rightMm: 3, leftMm: 10 })[0], /5 مم/);
});

test('input normalisation rejects blanks, out-of-range values and a crushed content box', () => {
  assert.deepEqual(normaliseSafeAreaInput({ topMm: '47', bottomMm: '39', rightMm: '16.5', leftMm: '16.54' }), {
    ok: true,
    values: { page_safe_top_mm: 47, page_safe_bottom_mm: 39, page_safe_right_mm: 16.5, page_safe_left_mm: 16.5 },
    errors: [],
  });
  assert.equal(normaliseSafeAreaInput({ topMm: '', bottomMm: 39, rightMm: 16, leftMm: 16 }).ok, false);
  assert.equal(normaliseSafeAreaInput({ topMm: 120, bottomMm: 39, rightMm: 16, leftMm: 16 }).ok, false);
  // every edge is in range, but 210 − 90 − 90 leaves only 30 mm of width
  const crushed = normaliseSafeAreaInput({ topMm: 40, bottomMm: 30, rightMm: 90, leftMm: 90 });
  assert.equal(crushed.ok, false);
  assert.match(crushed.errors[0], /صغيرة جدًا/);
});
