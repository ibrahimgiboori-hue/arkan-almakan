import { PRINT_GRID_COLUMNS, PRINT_GRID_ROW_MM } from '@/lib/print-grid';

/**
 * ARKAN print layout model
 *
 * The hidden grid is a ruler, never the visible design. Its column widths and
 * vertical row unit are immutable. The visible document is formed by four-sided
 * borders that snap to that ruler. Content reflows inside the visible region;
 * it must never resize the hidden grid itself.
 */
export const PRINT_LAYOUT_MODEL_VERSION = '1.0';

export const PRINT_LAYOUT_MODEL = Object.freeze({
  hiddenGrid:Object.freeze({
    columns:PRINT_GRID_COLUMNS,
    rowUnitMm:PRINT_GRID_ROW_MM,
    columnGeometry:'fixed-logical-tracks',
    rowGeometry:'fixed-vertical-unit',
    resizable:false,
    visibleToReader:false,
    role:'geometry-ruler',
  }),
  visibleDesign:Object.freeze({
    role:'design-authority',
    edges:Object.freeze(['right','left','top','bottom']),
    snapToHiddenGrid:true,
    sharedBorderIsSingleBoundary:true,
    horizontalMovement:'changes-visible-column-span-not-grid-column-width',
    verticalMovement:'changes-visible-row-span-not-grid-row-height',
  }),
  content:Object.freeze({
    role:'reflow-inside-visible-bounds',
    mayReflow:true,
    mayResizeHiddenGrid:false,
    widthAdaptation:'move-visible-left-or-right-boundary',
    heightAdaptation:'move-visible-top-or-bottom-boundary',
  }),
  pagination:Object.freeze({
    source:'one-continuous-document-body',
    owner:'ConstitutionPagedFrame',
    browserOwnsPagination:false,
    emitEmptyPhysicalPages:false,
    physicalPageIsOutput:true,
  }),
});

export function printVisibleBoundaryModel() {
  return PRINT_LAYOUT_MODEL;
}
