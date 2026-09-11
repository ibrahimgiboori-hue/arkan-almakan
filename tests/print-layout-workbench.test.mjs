import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const layout = read('app/print/layout.js');
const workbench = read('app/print/print-workbench.css');
const model = read('lib/print-layout-model.js');
const grid = read('lib/print-grid.js');

test('print layout model keeps the hidden grid immutable and the visible borders authoritative', () => {
  assert.match(grid, /PRINT_GRID_COLUMNS = PRINT_GRID_MAJOR_COLUMNS \* PRINT_GRID_SUBDIVISIONS/);
  assert.match(grid, /PRINT_GRID_ROW_MM = 2/);
  assert.match(model, /resizable:false/);
  assert.match(model, /visibleToReader:false/);
  assert.match(model, /role:'geometry-ruler'/);
  assert.match(model, /role:'design-authority'/);
  assert.match(model, /edges:Object\.freeze\(\['right','left','top','bottom'\]\)/);
  assert.match(model, /changes-visible-column-span-not-grid-column-width/);
  assert.match(model, /changes-visible-row-span-not-grid-row-height/);
  assert.match(model, /mayResizeHiddenGrid:false/);
});

test('content reflows inside visible boundaries while page materialization remains captain-only', () => {
  assert.match(model, /role:'reflow-inside-visible-bounds'/);
  assert.match(model, /widthAdaptation:'move-visible-left-or-right-boundary'/);
  assert.match(model, /heightAdaptation:'move-visible-top-or-bottom-boundary'/);
  assert.match(model, /source:'one-continuous-document-body'/);
  assert.match(model, /owner:'ConstitutionPagedFrame'/);
  assert.match(model, /browserOwnsPagination:false/);
  assert.match(model, /emitEmptyPhysicalPages:false/);
});

test('print preview uses side rails instead of stacking captain controls above the paper', () => {
  assert.match(layout, /import '\.\/print-workbench\.css'/);
  assert.match(workbench, /\.constitution-paged-layoutbar\{/);
  assert.match(workbench, /right:var\(--print-workbench-edge\)!important/);
  assert.match(workbench, /\.print-text-alignment-bar\{/);
  assert.match(workbench, /left:var\(--print-workbench-edge\)!important/);
  assert.match(workbench, /\.toolbar\.no-print,/);
  assert.match(workbench, /\.print-toolbar,/);
  assert.match(workbench, /\.qtoolbar\{/);
  assert.match(workbench, /padding-left:calc\(var\(--print-workbench-rail\)/);
  assert.match(workbench, /padding-right:calc\(var\(--print-workbench-rail\)/);
});

test('browser cannot create a second pagination layer inside captain sheets', () => {
  assert.match(workbench, /\.constitution-paged-sheet:last-of-type/);
  assert.match(workbench, /page-break-after:auto!important/);
  assert.match(workbench, /\.constitution-paged-sheet \.print-page-break-before/);
  assert.match(workbench, /\[data-print-boundary-before='force-page'\]/);
  assert.match(workbench, /page-break-before:auto!important/);
});
