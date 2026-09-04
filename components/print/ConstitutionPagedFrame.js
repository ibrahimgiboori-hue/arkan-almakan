'use client';

import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { supabase } from '@/lib/supabase';
import {
  PRINT_GOVERNANCE_VERSION,
  PRINT_FLOW_BOUNDARY,
  PRINT_FLOW_KIND,
  PRINT_LETTERHEAD_SOURCE,
  PRINT_ORIENTATION,
  PRINT_PAPER_ROTATION,
  defaultPrintColumnLabels,
  getPrintDefinition,
  getPrintLayoutPolicy,
  getPrintReportColumns,
  printGovernanceClassName,
} from '@/lib/print-governance';
import {
  PRINT_GRID_COLUMNS,
  PRINT_GRID_MAJOR_COLUMNS,
  PRINT_GRID_ROW_MM,
} from '@/lib/print-grid';
import { PrintLayoutProvider } from '@/components/print/PrintLayoutContext';
import { PrintPresentationProvider } from '@/components/print/PrintPresentationContext';
import PagedTableGridEditor from '@/components/print/PagedTableGridEditor';
import PrintMarks from '@/components/print/PrintMarks';

const assetUrl = (path) => path ? supabase.storage.from('brand').getPublicUrl(path).data.publicUrl : null;
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value)));
const snap = (value) => Math.round(Number(value) * 2) / 2;
const finiteMm = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const MAX_MARGIN = 90;
const CSS_PX_PER_MM = 96 / 25.4;
const CAPTAIN_GEOMETRY_SCHEMA = 6;

function pxToMm(value) {
  return Number(value || 0) / CSS_PX_PER_MM;
}

function mmCssFromPx(value) {
  return `${pxToMm(value).toFixed(4)}mm`;
}

function mergeSettings(familySettings = {}, documentSettings = {}) {
  return {
    ...familySettings,
    ...documentSettings,
    grids:{ ...(familySettings.grids || {}), ...(documentSettings.grids || {}) },
    rows:{ ...(familySettings.rows || {}), ...(documentSettings.rows || {}) },
  };
}

function outerHeight(element) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.height
    + (parseFloat(style.marginTop) || 0)
    + (parseFloat(style.marginBottom) || 0);
}

function decomposeFlow(children) {
  const roots = Children.toArray(children);
  if (roots.length === 1 && isValidElement(roots[0])) {
    const root = roots[0];
    return { root, blocks:Children.toArray(root.props.children) };
  }
  return { root:null, blocks:roots };
}

function composeFlowPage(root, blocks, pageIndex) {
  if (root && isValidElement(root)) {
    return cloneElement(root, { key:`captain-flow-page-${pageIndex}` }, blocks);
  }
  return <div key={`captain-flow-page-${pageIndex}`}>{blocks}</div>;
}

function isHtmlElement(node, tag) {
  return isValidElement(node) && typeof node.type === 'string' && node.type.toLowerCase() === tag;
}

function repeatableTableParts(table) {
  if (!isValidElement(table) || table.props?.['data-print-flow'] !== PRINT_FLOW_KIND.REPEATABLE_TABLE) return null;
  const children = Children.toArray(table.props.children);
  const bodies = children.filter((child)=>isHtmlElement(child,'tbody'));
  if (bodies.length !== 1) return null;
  const body = bodies[0];
  return {
    children,
    body,
    rows:Children.toArray(body.props.children),
  };
}

function tableFragment(table, parts, rows, fragmentKey, includeFoot) {
  const children = parts.children.flatMap((child) => {
    if (child === parts.body) return [cloneElement(parts.body, { key:`${fragmentKey}-body` }, rows)];
    if (isHtmlElement(child,'tfoot') && !includeFoot) return [];
    return [child];
  });
  return cloneElement(table, {
    key:fragmentKey,
    'data-print-flow-fragment':'true',
  }, children);
}

function pushPage(pages, current) {
  if (current.length) pages.push(current);
  return [];
}

function sourceLabel(source) {
  if (source === PRINT_LETTERHEAD_SOURCE.PREPRINTED) return 'ورق مطبوع مسبقًا';
  if (source === PRINT_LETTERHEAD_SOURCE.NONE) return 'بدون ليترهيد';
  return 'ليترهيد داخل المستند';
}

function measuredLineBands(element) {
  if (!element || typeof document === 'undefined' || typeof NodeFilter === 'undefined') return [];
  const rowRect = element.getBoundingClientRect();
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const rects = [];

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node?.nodeValue?.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) {
      if (rect.width < 0.5 || rect.height < 0.5) continue;
      rects.push({
        top:Math.max(0, rect.top - rowRect.top),
        bottom:Math.min(rowRect.height, rect.bottom - rowRect.top),
      });
    }
    range.detach?.();
  }

  rects.sort((a,b)=>a.top-b.top || a.bottom-b.bottom);
  const bands = [];
  for (const rect of rects) {
    const last = bands[bands.length - 1];
    if (!last || rect.top >= last.bottom - 0.75) {
      bands.push({ ...rect });
    } else {
      last.top = Math.min(last.top, rect.top);
      last.bottom = Math.max(last.bottom, rect.bottom);
    }
  }
  return bands;
}

function visualLineSeams(element) {
  const bands = measuredLineBands(element);
  if (!bands.length) return { bands:[], seams:[] };
  const seams = bands.map((band,index) => {
    const next = bands[index + 1];
    if (!next) return band.bottom;
    const gap = Math.max(0, next.top - band.bottom);
    return band.bottom + gap / 2;
  });
  return { bands, seams };
}

function chooseVisualLineBreak(element, startPx, maxEndPx, rowHeightPx, mustSplit) {
  const { bands, seams } = visualLineSeams(element);
  if (!bands.length) return null;
  const remainingBands = bands.filter((band)=>band.bottom > startPx + 0.5);
  const candidates = seams.filter((seam)=>
    seam > startPx + 1
    && seam <= maxEndPx + 0.5
    && seam < rowHeightPx - 1
  );
  if (!candidates.length) return null;

  const preferred = candidates.filter((candidate) => {
    const before = remainingBands.filter((band)=>band.bottom <= candidate + 0.75).length;
    const after = remainingBands.filter((band)=>band.top >= candidate - 0.75).length;
    const enoughBefore = before >= 2 || remainingBands.length <= 2;
    const noSingleWidow = after === 0 || after >= 2;
    return enoughBefore && noSingleWidow;
  });
  if (preferred.length) return preferred[preferred.length - 1];

  // إذا كان الصف يستطيع الانتقال كاملًا إلى صفحة جديدة، لا نترك سطرًا يتيمًا فقط لملء الفراغ.
  if (!mustSplit) return null;
  return candidates[candidates.length - 1];
}

function canSliceRow(row, domRow) {
  if (!isValidElement(row) || !domRow) return false;
  if (row.props?.['data-print-row-atomic'] === true || row.props?.['data-print-row-atomic'] === 'true') return false;
  if (row.props?.['data-print-row-role'] === 'total') return false;
  if (domRow.querySelector('img,svg,canvas,video,input,textarea,select')) return false;
  const cells = Children.toArray(row.props.children);
  const domCells = [...domRow.children];
  if (!cells.length || cells.length !== domCells.length) return false;
  return cells.every((cell)=>
    (isHtmlElement(cell,'td') || isHtmlElement(cell,'th'))
    && Number(cell.props?.rowSpan || 1) === 1
  );
}

function measuredRowSlice(row, domRow, startPx, endPx, key) {
  if (!canSliceRow(row,domRow)) return null;
  const rowHeightPx = domRow.getBoundingClientRect().height;
  const sliceHeightPx = Math.max(1, endPx - startPx);
  const cells = Children.toArray(row.props.children);
  const domCells = [...domRow.children];
  const slicedCells = cells.map((cell,index) => {
    const style = window.getComputedStyle(domCells[index]);
    const padding = [style.paddingTop,style.paddingRight,style.paddingBottom,style.paddingLeft]
      .map((value)=>mmCssFromPx(parseFloat(value) || 0))
      .join(' ');
    const cellStyle = {
      ...(cell.props.style || {}),
      padding:0,
      height:mmCssFromPx(sliceHeightPx),
      overflow:'hidden',
      verticalAlign:'top',
    };
    return cloneElement(cell, {
      key:`${key}-cell-${index}`,
      style:cellStyle,
    }, (
      <div className="print-line-slice-viewport" style={{height:mmCssFromPx(sliceHeightPx)}}>
        <div
          className="print-line-slice-content"
          style={{
            minHeight:mmCssFromPx(rowHeightPx),
            padding,
            transform:`translateY(-${pxToMm(startPx).toFixed(4)}mm)`,
          }}
        >
          {cell.props.children}
        </div>
      </div>
    ));
  });
  return cloneElement(row, {
    key,
    'data-print-row-slice':'true',
    'data-print-row-slice-start-mm':pxToMm(startPx).toFixed(3),
    'data-print-row-slice-end-mm':pxToMm(endPx).toFixed(3),
    style:{ ...(row.props.style || {}), height:mmCssFromPx(sliceHeightPx) },
  }, slicedCells);
}

export default function ConstitutionPagedFrame({
  documentKey,
  cfg,
  children,
  showStamp = false,
  showSignature = false,
  stampSizeMm,
  signatureSizeMm,
  stampStyle,
  signatureStyle,
  contentTopMm,
  contentBottomMm,
  contentSideMm,
  contentLeftMm,
  contentRightMm,
  direction = 'auto',
  pageClassName = '',
  contentClassName = '',
  showPageNumbers = true,
  pageNumberFormatter,
  renderOverlay,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  onLayoutChange,
}) {
  const definition = getPrintDefinition(documentKey);
  const layout = getPrintLayoutPolicy(documentKey);
  const paper = layout.paper;
  const letterheadProfile = layout.letterheadProfile;
  const reportColumns = useMemo(()=>getPrintReportColumns(documentKey), [documentKey]);
  const defaultLabels = useMemo(()=>defaultPrintColumnLabels(documentKey), [documentKey]);
  const flow = useMemo(() => decomposeFlow(children), [children]);
  const flowMeasureRef = useRef(null);
  const [renderedPages, setRenderedPages] = useState(null);

  const roots = Children.toArray(children);
  const explicitDirection = direction === 'ltr' ? 'ltr' : direction === 'rtl' ? 'rtl' : null;
  const inferredDirection = roots.find((page) => page?.props?.dir === 'ltr' || page?.props?.dir === 'rtl')?.props?.dir || null;
  const docDirection = explicitDirection || inferredDirection || 'rtl';
  const docTextAlign = docDirection === 'ltr' ? 'left' : 'right';

  const wordMarginMm = finiteMm(paper?.bodyMarginMm,25.4);
  const minMarginMm = wordMarginMm;
  const defaultTop = clamp(Math.max(finiteMm(contentTopMm,wordMarginMm),wordMarginMm),minMarginMm,MAX_MARGIN);
  const defaultBottom = clamp(Math.max(finiteMm(contentBottomMm,wordMarginMm),wordMarginMm),minMarginMm,MAX_MARGIN);
  const requestedSide = finiteMm(contentSideMm,wordMarginMm);
  const defaultLeft = clamp(Math.max(finiteMm(contentLeftMm,requestedSide),wordMarginMm),minMarginMm,MAX_MARGIN);
  const defaultRight = clamp(Math.max(finiteMm(contentRightMm,requestedSide),wordMarginMm),minMarginMm,MAX_MARGIN);
  const defaultBlockGap = clamp(layout.grid?.blockGapMm ?? 3, 1, 8);
  const defaultSectionGap = clamp(layout.grid?.sectionGapMm ?? 6, 2, 14);

  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState({
    topMm:defaultTop,
    bottomMm:defaultBottom,
    leftMm:defaultLeft,
    rightMm:defaultRight,
    blockGapMm:defaultBlockGap,
    sectionGapMm:defaultSectionGap,
    orientation:layout.orientation || PRINT_ORIENTATION.PORTRAIT,
    letterheadSource:layout.letterheadSource || PRINT_LETTERHEAD_SOURCE.DIGITAL,
    paperRotation:layout.paperRotation || PRINT_PAPER_ROTATION.CLOCKWISE,
    grids:{}, rows:{},
  });
  const [presentationLabels, setPresentationLabels] = useState(defaultLabels);

  const loadOverrides = useCallback(async () => {
    const { data, error } = await supabase
      .from('print_layout_overrides')
      .select('scope,scope_key,settings')
      .in('scope_key', [definition.family, documentKey]);
    if (!error) {
      const familySettings = (data || []).find((x)=>x.scope==='family' && x.scope_key===definition.family)?.settings || {};
      const documentSettings = (data || []).find((x)=>x.scope==='document' && x.scope_key===documentKey)?.settings || {};
      const merged = mergeSettings(familySettings, documentSettings);
      const geometryCurrent = Number(merged.gridSchemaVersion || 0) >= CAPTAIN_GEOMETRY_SCHEMA;
      setDraft({
        ...merged,
        topMm:clamp(geometryCurrent ? (merged.topMm ?? defaultTop) : defaultTop, minMarginMm, MAX_MARGIN),
        bottomMm:clamp(geometryCurrent ? (merged.bottomMm ?? defaultBottom) : defaultBottom, minMarginMm, MAX_MARGIN),
        leftMm:clamp(geometryCurrent ? (merged.leftMm ?? defaultLeft) : defaultLeft, minMarginMm, MAX_MARGIN),
        rightMm:clamp(geometryCurrent ? (merged.rightMm ?? defaultRight) : defaultRight, minMarginMm, MAX_MARGIN),
        blockGapMm:clamp(merged.blockGapMm ?? defaultBlockGap, 1, 8),
        sectionGapMm:clamp(merged.sectionGapMm ?? defaultSectionGap, 2, 14),
        orientation:geometryCurrent && Object.values(PRINT_ORIENTATION).includes(merged.orientation)
          ? merged.orientation
          : (layout.orientation || PRINT_ORIENTATION.PORTRAIT),
        letterheadSource:geometryCurrent && Object.values(PRINT_LETTERHEAD_SOURCE).includes(merged.letterheadSource)
          ? merged.letterheadSource
          : (layout.letterheadSource || PRINT_LETTERHEAD_SOURCE.DIGITAL),
        paperRotation:geometryCurrent && Object.values(PRINT_PAPER_ROTATION).includes(merged.paperRotation)
          ? merged.paperRotation
          : (layout.paperRotation || PRINT_PAPER_ROTATION.CLOCKWISE),
        grids:merged.grids || {}, rows:merged.rows || {},
      });
    }

    // قد لا تكون migration الجديدة مطبقة بعد في بيئة preview؛ عندها تبقى العناوين الافتراضية بلا تعطيل للطباعة.
    const presentation = await supabase
      .from('print_presentation_overrides')
      .select('settings')
      .eq('document_key', documentKey)
      .maybeSingle();
    const labels = presentation.data?.settings?.labels || {};
    setPresentationLabels({ ...defaultLabels, ...labels });
  }, [defaultBlockGap, defaultBottom, defaultLabels, defaultLeft, defaultRight, defaultSectionGap, defaultTop, definition.family, documentKey, layout.letterheadSource, layout.orientation, layout.paperRotation, minMarginMm]);

  useEffect(() => { loadOverrides(); }, [loadOverrides]);

  const setEdge = useCallback((key, value) => {
    setDraft((previous)=>({ ...previous, [key]:snap(clamp(value, minMarginMm, MAX_MARGIN)) }));
  }, [minMarginMm]);
  const setGridLayout = useCallback((key, value) => {
    setDraft((previous)=>{
      const grids = { ...(previous.grids || {}) };
      if (value == null) delete grids[key]; else grids[key] = value;
      return { ...previous, grids };
    });
  }, []);
  const setRowHeight = useCallback((key, value) => {
    setDraft((previous)=>{
      const rows = { ...(previous.rows || {}) };
      if (value == null) delete rows[key]; else rows[key] = Number(value);
      return { ...previous, rows };
    });
  }, []);

  async function saveLayout(scope) {
    setMessage('جارٍ الحفظ...');
    const scopeKey = scope === 'family' ? definition.family : documentKey;
    const { data:{ user } } = await supabase.auth.getUser();
    const payload = {
      scope,
      scope_key:scopeKey,
      settings:{
        gridSchemaVersion:CAPTAIN_GEOMETRY_SCHEMA,
        gridColumns:PRINT_GRID_COLUMNS,
        gridMajorColumns:PRINT_GRID_MAJOR_COLUMNS,
        gridRowMm:PRINT_GRID_ROW_MM,
        topMm:draft.topMm,
        bottomMm:draft.bottomMm,
        leftMm:draft.leftMm,
        rightMm:draft.rightMm,
        blockGapMm:draft.blockGapMm,
        sectionGapMm:draft.sectionGapMm,
        orientation:draft.orientation,
        letterheadSource:draft.letterheadSource,
        paperRotation:draft.paperRotation,
        grids:draft.grids || {}, rows:draft.rows || {},
      },
      updated_by_user_id:user?.id || null,
      updated_at:new Date().toISOString(),
    };
    const { error } = await supabase.from('print_layout_overrides').upsert(payload, { onConflict:'scope,scope_key' });
    if (error) { setMessage(`تعذر الحفظ: ${error.message}`); return; }
    if (scope === 'family') await supabase.from('print_layout_overrides').delete().eq('scope','document').eq('scope_key',documentKey);
    setMessage(scope === 'family' ? 'تم حفظ هندسة القبطان لعائلة المطبوعات' : 'تم حفظ هندسة هذا المطبوع');
    await loadOverrides();
  }

  async function savePresentation() {
    setMessage('جارٍ حفظ عناوين التقرير...');
    const { data:{ user } } = await supabase.auth.getUser();
    const labels = Object.fromEntries(reportColumns.map((column)=>[
      column.field,
      String(presentationLabels[column.field] || column.label).trim() || column.label,
    ]));
    const { error } = await supabase.from('print_presentation_overrides').upsert({
      document_key:documentKey,
      settings:{ labels },
      updated_by_user_id:user?.id || null,
      updated_at:new Date().toISOString(),
    }, { onConflict:'document_key' });
    if (error) { setMessage(`تعذر حفظ العناوين: ${error.message}`); return; }
    setMessage('تم حفظ عناوين هذا التقرير دون تغيير مفاتيح البيانات');
  }

  async function followFamily() {
    const { error } = await supabase.from('print_layout_overrides').delete().eq('scope','document').eq('scope_key',documentKey);
    if (error) setMessage(`تعذر الرجوع: ${error.message}`);
    else { setMessage('أصبح المطبوع يتبع هندسة العائلة'); await loadOverrides(); }
  }

  function resetDraft() {
    setDraft({
      topMm:defaultTop,
      bottomMm:defaultBottom,
      leftMm:defaultLeft,
      rightMm:defaultRight,
      blockGapMm:defaultBlockGap,
      sectionGapMm:defaultSectionGap,
      orientation:layout.orientation || PRINT_ORIENTATION.PORTRAIT,
      letterheadSource:layout.letterheadSource || PRINT_LETTERHEAD_SOURCE.DIGITAL,
      paperRotation:layout.paperRotation || PRINT_PAPER_ROTATION.CLOCKWISE,
      grids:{}, rows:{},
    });
    setPresentationLabels(defaultLabels);
    setMessage('عادت إعدادات Word القياسية وبروفايل الليترهيد المقاس؛ احفظ ما تريد تثبيته');
  }

  const orientation = draft.orientation || PRINT_ORIENTATION.PORTRAIT;
  const letterheadSource = draft.letterheadSource || PRINT_LETTERHEAD_SOURCE.DIGITAL;
  const paperRotation = draft.paperRotation || PRINT_PAPER_ROTATION.CLOCKWISE;
  const landscape = orientation === PRINT_ORIENTATION.LANDSCAPE;
  const pageHeightMm = landscape ? finiteMm(paper?.landscapeHeightMm,210) : finiteMm(paper?.portraitHeightMm,297);
  const pageWidthMm = landscape ? finiteMm(paper?.landscapeWidthMm,297) : finiteMm(paper?.portraitWidthMm,210);
  const letterheadTop = finiteMm(letterheadProfile?.portraitTopArtworkMm,34.23);
  const letterheadBottom = finiteMm(letterheadProfile?.portraitBottomArtworkMm,19.13);
  const headerClearanceMm = finiteMm(paper?.headerFromEdgeMm,12.7);
  const footerClearanceMm = finiteMm(paper?.footerFromEdgeMm,12.7);
  const hasSplitLetterhead = Boolean(cfg?.header_image_path || cfg?.footer_image_path || cfg?.watermark_image_path);
  const rotatedDigitalMaster = letterheadSource === PRINT_LETTERHEAD_SOURCE.DIGITAL
    && landscape
    && Boolean(cfg?.letterhead_image_path);
  const sideReservedLetterhead = landscape && (
    letterheadSource === PRINT_LETTERHEAD_SOURCE.PREPRINTED || rotatedDigitalMaster
  );
  const topBottomReservedLetterhead = letterheadSource !== PRINT_LETTERHEAD_SOURCE.NONE && !sideReservedLetterhead;

  const requestedTop = clamp(draft.topMm ?? defaultTop,minMarginMm,MAX_MARGIN);
  const requestedBottom = clamp(draft.bottomMm ?? defaultBottom,minMarginMm,MAX_MARGIN);
  const requestedLeft = clamp(draft.leftMm ?? defaultLeft,minMarginMm,MAX_MARGIN);
  const requestedRight = clamp(draft.rightMm ?? defaultRight,minMarginMm,MAX_MARGIN);
  const physicalLeft = sideReservedLetterhead
    ? Math.max(requestedLeft, paperRotation === PRINT_PAPER_ROTATION.CLOCKWISE ? letterheadBottom : letterheadTop)
    : requestedLeft;
  const physicalRight = sideReservedLetterhead
    ? Math.max(requestedRight, paperRotation === PRINT_PAPER_ROTATION.CLOCKWISE ? letterheadTop : letterheadBottom)
    : requestedRight;
  const top = topBottomReservedLetterhead
    ? Math.max(requestedTop, letterheadTop + headerClearanceMm)
    : requestedTop;
  const bottom = topBottomReservedLetterhead
    ? Math.max(requestedBottom, letterheadBottom + footerClearanceMm)
    : requestedBottom;
  const grid = { ...(layout.grid || {}), blockGapMm:draft.blockGapMm, sectionGapMm:draft.sectionGapMm };

  useEffect(() => {
    onLayoutChange?.({
      orientation,
      letterheadSource,
      paperRotation,
      leftMm:physicalLeft,
      rightMm:physicalRight,
      requestedLeftMm:requestedLeft,
      requestedRightMm:requestedRight,
      requestedTopMm:requestedTop,
      requestedBottomMm:requestedBottom,
      topMm:top,
      bottomMm:bottom,
      wordBodyMarginMm:wordMarginMm,
      headerFromEdgeMm:headerClearanceMm,
      footerFromEdgeMm:footerClearanceMm,
      letterheadTopArtworkMm:letterheadTop,
      letterheadBottomArtworkMm:letterheadBottom,
      blockGapMm:grid.blockGapMm,
      sectionGapMm:grid.sectionGapMm,
    });
  }, [bottom, footerClearanceMm, grid.blockGapMm, grid.sectionGapMm, headerClearanceMm, letterheadBottom, letterheadSource, letterheadTop, onLayoutChange, orientation, paperRotation, physicalLeft, physicalRight, requestedBottom, requestedLeft, requestedRight, requestedTop, top, wordMarginMm]);

  const layoutContext = useMemo(()=>({
    editing,
    gridLayouts:draft.grids || {}, rowHeights:draft.rows || {},
    setGridLayout, setRowHeight,
  }), [draft.grids, draft.rows, editing, setGridLayout, setRowHeight]);
  const presentationContext = useMemo(()=>({
    labels:presentationLabels,
    editing,
  }), [editing, presentationLabels]);

  const renderDigitalLetterhead = letterheadSource === PRINT_LETTERHEAD_SOURCE.DIGITAL;
  const useSplitLetterhead = renderDigitalLetterhead
    && hasSplitLetterhead
    && !rotatedDigitalMaster
    && !cfg?.letterhead_image_path;
  const full = renderDigitalLetterhead && cfg?.letterhead_image_path && !useSplitLetterhead ? assetUrl(cfg.letterhead_image_path) : null;
  const header = useSplitLetterhead ? assetUrl(cfg?.header_image_path) : null;
  const footer = useSplitLetterhead ? assetUrl(cfg?.footer_image_path) : null;
  const watermark = useSplitLetterhead ? assetUrl(cfg?.watermark_image_path) : null;
  const classes = printGovernanceClassName(documentKey,'',orientation);
  const contentStyle = {
    paddingTop:`${top}mm`,
    paddingBottom:`${bottom}mm`,
    paddingLeft:`${physicalLeft}mm`,
    paddingRight:`${physicalRight}mm`,
    direction:docDirection,
    textAlign:docTextAlign,
    '--print-grid-columns':String(grid.columns || PRINT_GRID_COLUMNS),
    '--print-grid-major-columns':String(grid.majorColumns || PRINT_GRID_MAJOR_COLUMNS),
    '--print-grid-row':`${Number(grid.rowMm ?? PRINT_GRID_ROW_MM)}mm`,
    '--print-block-gap':`${Number(grid.blockGapMm ?? 3)}mm`,
    '--print-section-gap':`${Number(grid.sectionGapMm ?? 6)}mm`,
    '--print-safe-bottom':`${bottom}mm`,
  };
  const availablePx = Math.max(1, (pageHeightMm - top - bottom) * CSS_PX_PER_MM);
  const presentationSignature = JSON.stringify(presentationLabels);

  useLayoutEffect(() => {
    const host = flowMeasureRef.current;
    const measureRoot = host?.querySelector('[data-print-flow-root="true"]');
    if (!measureRoot) return;
    const domBlocks = [...measureRoot.children];
    if (!flow.blocks.length) {
      setRenderedPages([composeFlowPage(flow.root, [], 0)]);
      return;
    }

    // إذا اختلف شكل React عن DOM فلا نسمح للمتصفح أن يخترع تجزئة داخل الورقة.
    if (domBlocks.length !== flow.blocks.length) {
      setRenderedPages(flow.blocks.map((block,index)=>composeFlowPage(flow.root,[block],index)));
      return;
    }

    const pages = [];
    let current = [];
    let used = 0;
    const newPage = () => {
      current = pushPage(pages,current);
      used = 0;
    };

    flow.blocks.forEach((block, blockIndex) => {
      const element = domBlocks[blockIndex];
      const boundary = element?.dataset?.printBoundaryBefore || block?.props?.['data-print-boundary-before'];
      if (boundary === PRINT_FLOW_BOUNDARY.FORCE_PAGE && current.length) newPage();

      // ALLOW حد دلالي عام داخل القبطان: نقيس بصمة الكتلة الحقيقية بعد الرسم.
      // إذا كانت الكتلة كاملة تدخل في صفحة جديدة لكنها لا تدخل في المساحة المتبقية،
      // نلتقط الحد وننقل بدايتها. أمّا الكتلة الأكبر من صفحة كاملة فلا نفرض عليها صفحة؛
      // نترك آلية التجزئة الخاصة بها تملأ المساحة وتقسمها عند حدودها الداخلية.
      if (boundary === PRINT_FLOW_BOUNDARY.ALLOW && current.length) {
        const measuredBlockHeight = Math.max(1, outerHeight(element));
        if (measuredBlockHeight <= availablePx + 1 && used + measuredBlockHeight > availablePx + 1) newPage();
      }

      const tableParts = repeatableTableParts(block);
      const domRows = tableParts ? [...element.querySelectorAll(':scope > tbody > tr')] : [];
      const domHead = tableParts ? element.querySelector(':scope > thead') : null;
      const domFoot = tableParts ? element.querySelector(':scope > tfoot') : null;

      if (tableParts && domRows.length === tableParts.rows.length) {
        const headHeight = domHead ? outerHeight(domHead) : 0;
        const footHeight = domFoot ? outerHeight(domFoot) : 0;
        const rowHeights = domRows.map((row)=>Math.max(1,outerHeight(row)));
        const freshRowCapacity = Math.max(1,availablePx - headHeight);
        let rowIndex = 0;
        let rowStartPx = 0;
        let fragmentIndex = 0;

        while (rowIndex < tableParts.rows.length || rowStartPx > 0) {
          if (current.length && used + headHeight > availablePx - 1) newPage();
          const pageRoom = Math.max(1,availablePx - used);
          const fragmentRows = [];
          let fragmentHeight = headHeight;

          while (rowIndex < tableParts.rows.length) {
            const reactRow = tableParts.rows[rowIndex];
            const domRow = domRows[rowIndex];
            const rowHeight = rowHeights[rowIndex] || Math.max(1,outerHeight(domRow));
            const remainingHeight = Math.max(1,rowHeight - rowStartPx);
            const roomForRow = Math.max(0,pageRoom - fragmentHeight);

            if (remainingHeight <= roomForRow + 1) {
              if (rowStartPx > 0) {
                const finalSlice = measuredRowSlice(
                  reactRow,
                  domRow,
                  rowStartPx,
                  rowHeight,
                  `print-row-${blockIndex}-${rowIndex}-final-${fragmentIndex}`,
                );
                fragmentRows.push(finalSlice || reactRow);
              } else {
                fragmentRows.push(reactRow);
              }
              fragmentHeight += remainingHeight;
              rowIndex += 1;
              rowStartPx = 0;
              continue;
            }

            const mustSplit = rowStartPx > 0 || remainingHeight > freshRowCapacity + 1;
            const maxEndPx = rowStartPx + roomForRow;
            const breakPx = canSliceRow(reactRow,domRow)
              ? chooseVisualLineBreak(domRow,rowStartPx,maxEndPx,rowHeight,mustSplit)
              : null;

            if (breakPx && breakPx > rowStartPx + 1) {
              const slice = measuredRowSlice(
                reactRow,
                domRow,
                rowStartPx,
                breakPx,
                `print-row-${blockIndex}-${rowIndex}-slice-${fragmentIndex}`,
              );
              if (slice) {
                fragmentRows.push(slice);
                fragmentHeight += breakPx - rowStartPx;
                rowStartPx = breakPx;
              }
            }
            break;
          }

          if (!fragmentRows.length) {
            // بقي جزء لا يدخل في الفراغ الحالي ويمكن أن يعيش طبيعيًا في صفحة جديدة.
            if (current.length || used > 0) {
              newPage();
              continue;
            }
            // فشل آمن لعنصر لا يملك حدود سطر قابلة للقياس حتى على صفحة كاملة.
            const reactRow = tableParts.rows[rowIndex];
            const domRow = domRows[rowIndex];
            const rowHeight = rowHeights[rowIndex] || Math.max(1,outerHeight(domRow));
            fragmentRows.push(reactRow);
            fragmentHeight += Math.max(1,rowHeight - rowStartPx);
            rowIndex += 1;
            rowStartPx = 0;
          }

          const allRowsDone = rowIndex >= tableParts.rows.length && rowStartPx === 0;
          const footFits = !allRowsDone || footHeight <= 0 || fragmentHeight + footHeight <= pageRoom + 1;
          const includeFoot = allRowsDone && footFits;
          if (includeFoot) fragmentHeight += footHeight;

          current.push(tableFragment(
            block,
            tableParts,
            fragmentRows,
            `print-table-${blockIndex}-${fragmentIndex}`,
            includeFoot,
          ));
          used += fragmentHeight;
          fragmentIndex += 1;

          if (allRowsDone) {
            if (!includeFoot && footHeight > 0) {
              newPage();
              const footOnly = tableFragment(
                block,
                tableParts,
                [],
                `print-table-${blockIndex}-foot-${fragmentIndex}`,
                true,
              );
              current.push(footOnly);
              used += headHeight + footHeight;
            }
            break;
          }
          newPage();
        }
        return;
      }

      const height = Math.max(1, outerHeight(element));
      const keepWithNext = element?.dataset?.printKeepWithNext === 'true'
        || block?.props?.['data-print-keep-with-next'] === true
        || block?.props?.['data-print-keep-with-next'] === 'true';
      const nextHeight = keepWithNext && domBlocks[blockIndex + 1]
        ? Math.max(1, outerHeight(domBlocks[blockIndex + 1]))
        : 0;
      if (current.length && used + height + nextHeight > availablePx + 1) newPage();
      current.push(block);
      used += height;
    });

    if (current.length || !pages.length) pages.push(current);
    setRenderedPages(pages.map((blocks,pageIndex)=>composeFlowPage(flow.root,blocks,pageIndex)));
  }, [availablePx, flow.blocks, flow.root, pageHeightMm, physicalLeft, physicalRight, presentationSignature, bottom, top]);

  const pages = renderedPages || [composeFlowPage(flow.root, flow.blocks, 0)];
  const pageCount = pages.length;
  const formatPageNumber = pageNumberFormatter || ((current,total)=> docDirection === 'ltr' ? `Page ${current} of ${total}` : `صفحة ${current} من ${total}`);

  function startBottomDrag(event) {
    if (!editing) return;
    event.preventDefault();
    event.stopPropagation();
    const sheet = event.currentTarget.closest('.constitution-paged-sheet');
    const rect = sheet?.getBoundingClientRect();
    if (!rect) return;
    const apply = (clientY) => {
      const fromTopMm = ((clientY - rect.top) / Math.max(1, rect.height)) * pageHeightMm;
      setEdge('bottomMm',pageHeightMm - fromTopMm);
    };
    const move = (moveEvent) => apply(moveEvent.clientY);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const measureRoot = flow.root && isValidElement(flow.root)
    ? cloneElement(flow.root, { 'data-print-flow-root':'true' }, flow.blocks)
    : <div data-print-flow-root="true">{flow.blocks}</div>;

  const masterFullStyle = rotatedDigitalMaster
    ? {
        width:'210mm', height:'297mm', left:'50%', top:'50%', right:'auto', bottom:'auto',
        transform:`translate(-50%,-50%) rotate(${paperRotation === PRINT_PAPER_ROTATION.CLOCKWISE ? '90deg' : '-90deg'})`,
        transformOrigin:'center',
      }
    : { inset:0, width:`${pageWidthMm}mm`, height:`${pageHeightMm}mm` };

  return (
    <PrintPresentationProvider value={presentationContext}>
      <PrintLayoutProvider value={layoutContext}>
        <PagedTableGridEditor editing={editing} gridLayouts={draft.grids || {}} rowHeights={draft.rows || {}}
          setGridLayout={setGridLayout} setRowHeight={setRowHeight} documentKey={documentKey} pageCount={pageCount} />

        <div className="constitution-paged-layoutbar no-print" role="region" aria-label="القبطان للطباعة">
          <button type="button" className={editing ? 'active' : ''} onClick={()=>setEditing((value)=>!value)}>
            {editing ? 'إنهاء ضبط القبطان' : 'القبطان للطباعة'}
          </button>
          {editing && <>
            <label>اتجاه الطباعة
              <select value={orientation} onChange={(event)=>setDraft((previous)=>({ ...previous, orientation:event.target.value }))}>
                <option value={PRINT_ORIENTATION.PORTRAIT}>عمودي</option>
                <option value={PRINT_ORIENTATION.LANDSCAPE}>أفقي</option>
              </select>
            </label>
            <label>الليترهيد
              <select value={letterheadSource} onChange={(event)=>setDraft((previous)=>({ ...previous, letterheadSource:event.target.value }))}>
                <option value={PRINT_LETTERHEAD_SOURCE.DIGITAL}>داخل المستند</option>
                <option value={PRINT_LETTERHEAD_SOURCE.PREPRINTED}>ورق مطبوع مسبقًا</option>
                <option value={PRINT_LETTERHEAD_SOURCE.NONE}>بدون ليترهيد</option>
              </select>
            </label>
            {landscape && letterheadSource === PRINT_LETTERHEAD_SOURCE.PREPRINTED && (
              <label>تدوير الورقة
                <select value={paperRotation} onChange={(event)=>setDraft((previous)=>({ ...previous, paperRotation:event.target.value }))}>
                  <option value={PRINT_PAPER_ROTATION.CLOCKWISE}>مع عقارب الساعة</option>
                  <option value={PRINT_PAPER_ROTATION.COUNTERCLOCKWISE}>عكس عقارب الساعة</option>
                </select>
              </label>
            )}
            <label>هامش Word العلوي <input type="range" min={minMarginMm} max={MAX_MARGIN} step="0.5" value={requestedTop} onChange={(event)=>setEdge('topMm',event.target.value)} /><strong>{top.toFixed(1)} مم فعلي</strong></label>
            <label>هامش Word السفلي <input type="range" min={minMarginMm} max={MAX_MARGIN} step="0.5" value={requestedBottom} onChange={(event)=>setEdge('bottomMm',event.target.value)} /><strong>{bottom.toFixed(1)} مم فعلي</strong></label>
            <label>الهامش الأيسر <input type="range" min={minMarginMm} max={MAX_MARGIN} step="0.5" value={requestedLeft} onChange={(event)=>setEdge('leftMm',event.target.value)} /><strong>{physicalLeft.toFixed(1)} مم</strong></label>
            <label>الهامش الأيمن <input type="range" min={minMarginMm} max={MAX_MARGIN} step="0.5" value={requestedRight} onChange={(event)=>setEdge('rightMm',event.target.value)} /><strong>{physicalRight.toFixed(1)} مم</strong></label>
            <label>تباعد الكتل <input type="range" min="1" max="8" step="0.5" value={draft.blockGapMm} onChange={(event)=>setDraft((previous)=>({...previous,blockGapMm:snap(event.target.value)}))} /><strong>{Number(draft.blockGapMm).toFixed(1)} مم</strong></label>
            <label>تباعد الأقسام <input type="range" min="2" max="14" step="0.5" value={draft.sectionGapMm} onChange={(event)=>setDraft((previous)=>({...previous,sectionGapMm:snap(event.target.value)}))} /><strong>{Number(draft.sectionGapMm).toFixed(1)} مم</strong></label>
            <button type="button" onClick={()=>saveLayout('document')}>حفظ هندسة هذا المطبوع</button>
            <button type="button" onClick={()=>saveLayout('family')}>حفظ هندسة العائلة</button>
            <button type="button" onClick={followFamily}>استخدام هندسة العائلة</button>
            <button type="button" onClick={resetDraft}>إعادة Word القياسي</button>
            <span className="constitution-paper-mode">{landscape ? 'أفقي' : 'عمودي'} · {sourceLabel(letterheadSource)}</span>
            <span className="constitution-paper-standard">Word 25.4 مم · Header 12.7 · Footer 12.7 · Letterhead {letterheadTop.toFixed(2)}/{letterheadBottom.toFixed(2)}</span>
          </>}
          {message && <span>{message}</span>}
        </div>

        {editing && reportColumns.length > 0 && (
          <div className="constitution-presentation-editor no-print" role="region" aria-label="عناوين التقرير">
            <strong>عناوين الأعمدة</strong>
            {reportColumns.map((column)=>(
              <label key={column.field}>{column.label}
                <input
                  value={presentationLabels[column.field] || column.label}
                  onChange={(event)=>setPresentationLabels((previous)=>({ ...previous, [column.field]:event.target.value }))}
                />
              </label>
            ))}
            <button type="button" onClick={savePresentation}>حفظ عناوين هذا التقرير</button>
          </div>
        )}

        <div
          ref={flowMeasureRef}
          className={`constitution-flow-measure ${classes}`}
          style={{
            width:`${pageWidthMm}mm`,
            paddingTop:`${top}mm`,
            paddingBottom:`${bottom}mm`,
            paddingLeft:`${physicalLeft}mm`,
            paddingRight:`${physicalRight}mm`,
            direction:docDirection,
            textAlign:docTextAlign,
          }}
          aria-hidden="true"
        >
          {measureRoot}
        </div>

        <div
          className="constitution-paged-pages"
          data-print-pages={pageCount}
          data-document-direction={docDirection}
          data-print-orientation={orientation}
          data-print-letterhead-source={letterheadSource}
          data-print-paper-rotation={paperRotation}
          data-print-geometry-schema={CAPTAIN_GEOMETRY_SCHEMA}
          data-print-line-seams="visual-line-box"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
        >
          {pages.map((page,pageIndex)=>(
            <section
              className={`constitution-paged-sheet print-page ${pageClassName} ${editing ? 'layout-editing' : ''}`.trim()}
              key={page.key || pageIndex}
              dir={docDirection}
              style={{ width:`${pageWidthMm}mm`, height:`${pageHeightMm}mm` }}
              data-print-page-physical="true"
              data-print-physical-letterhead-reservation={letterheadSource === PRINT_LETTERHEAD_SOURCE.PREPRINTED ? 'true' : 'false'}
            >
              <div className="constitution-paged-assets print-assets" aria-hidden="true">
                {full && <img src={full} className="constitution-paged-full print-master-full" alt="" style={masterFullStyle} />}
                {header && <img src={header} className="constitution-paged-header print-master-header" alt="" style={{height:`${Number(cfg?.header_height_mm || 40)}mm`,width:`${pageWidthMm}mm`}} />}
                {footer && <img src={footer} className="constitution-paged-footer print-master-footer" alt="" style={{height:`${Number(cfg?.footer_height_mm || 32)}mm`,width:`${pageWidthMm}mm`}} />}
                {watermark && <img src={watermark} className="constitution-paged-watermark print-master-watermark" alt="" />}
              </div>
              {editing && <>
                <div className="constitution-paged-grid-overlay no-print" style={{top:`${top}mm`,right:`${physicalRight}mm`,bottom:`${bottom}mm`,left:`${physicalLeft}mm`}} />
                <div
                  className="constitution-safe-zone-guide no-print"
                  style={{bottom:`${bottom}mm`,left:`${physicalLeft}mm`,right:`${physicalRight}mm`}}
                  onPointerDown={startBottomDrag}
                  title="اسحب لتحديد نهاية المحتوى مع بقاء حدود Word والليترهيد محمية"
                >
                  <span>نهاية المحتوى الآمنة</span>
                </div>
              </>}
              <main
                className={`constitution-paged-content print-content ${contentClassName}`.trim()}
                dir={docDirection}
                style={{ ...contentStyle, width:`${pageWidthMm}mm`, height:`${pageHeightMm}mm` }}
                data-print-content="true"
                data-print-safe-zone="true"
              >
                <div
                  className={`${classes} ${editing ? 'print-layout-editing' : ''}`.trim()}
                  dir={docDirection}
                  data-print-document={documentKey}
                  data-print-family={definition.family}
                  data-print-status={definition.status}
                  data-print-governance-version={PRINT_GOVERNANCE_VERSION}
                >{page}</div>
              </main>
              {showPageNumbers && pageCount > 0 && (
                <div className="constitution-paged-number" dir={docDirection} style={{bottom:`${Math.max(2,footerClearanceMm-5)}mm`}}>
                  {formatPageNumber(pageIndex+1,pageCount)}
                </div>
              )}
              {pageIndex === pageCount - 1 && (
                <PrintMarks
                  cfg={cfg}
                  showStamp={showStamp}
                  showSignature={showSignature}
                  stampSizeMm={stampSizeMm}
                  signatureSizeMm={signatureSizeMm}
                  stampStyle={stampStyle}
                  signatureStyle={signatureStyle}
                />
              )}
              {renderOverlay?.({pageIndex,pageCount})}
            </section>
          ))}
          <style jsx global>{`
            .constitution-paged-layoutbar{position:sticky;top:0;z-index:28;max-width:297mm;margin:8px auto 0;padding:8px 10px;background:#fff;border:1px solid #c7c7c7;display:flex;gap:7px;align-items:center;flex-wrap:wrap;direction:rtl;box-shadow:0 1px 6px rgba(0,0,0,.08)}
            .constitution-paged-layoutbar button,.constitution-presentation-editor button{font:inherit;font-size:12px;padding:6px 9px;border:1px solid #aaa;background:#fff;color:#222;cursor:pointer}.constitution-paged-layoutbar button.active{background:#8B3332;border-color:#8B3332;color:#fff}.constitution-paged-layoutbar label{display:flex;align-items:center;gap:5px;font-size:11.5px;color:#333}.constitution-paged-layoutbar input[type=range]{width:86px;accent-color:#8B3332}.constitution-paged-layoutbar select{font:inherit;font-size:11.5px;padding:4px 6px;background:#fff;border:1px solid #bbb}.constitution-paged-layoutbar strong{font-size:11px;min-width:62px}.constitution-paged-layoutbar span{font-size:11.5px;color:#444}.constitution-paper-mode{font-weight:700}.constitution-paper-standard{color:#6b6b6d!important}
            .constitution-presentation-editor{position:sticky;top:48px;z-index:27;max-width:297mm;margin:6px auto;padding:8px 10px;background:#fff;border:1px solid #d5d5d5;display:flex;gap:8px;align-items:center;flex-wrap:wrap;direction:rtl}.constitution-presentation-editor>strong{font-size:12px}.constitution-presentation-editor label{display:flex;align-items:center;gap:4px;font-size:10.5px;color:#555}.constitution-presentation-editor input{width:130px;font:inherit;font-size:11.5px;padding:4px 5px;border:1px solid #bbb}
            .constitution-flow-measure{position:fixed!important;z-index:-1000!important;left:-10000px!important;top:0!important;height:auto!important;min-height:0!important;box-sizing:border-box!important;visibility:hidden!important;pointer-events:none!important;background:#fff!important;font-size:9pt;line-height:1.45;overflow:visible!important}
            .constitution-paged-pages{padding:24px 14px 60px;display:flex;flex-direction:column;align-items:center;gap:20px;background:#efeaea}.constitution-paged-sheet{position:relative;background:#fff;overflow:hidden;box-sizing:border-box;box-shadow:0 1px 6px rgba(0,0,0,.16)}.constitution-paged-sheet.dragging{cursor:grabbing;user-select:none}.constitution-paged-assets{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:hidden}.constitution-paged-full{position:absolute;object-fit:fill;display:block}.constitution-paged-header{position:absolute;top:0;right:0;object-fit:fill;display:block}.constitution-paged-footer{position:absolute;bottom:0;right:0;object-fit:fill;display:block}.constitution-paged-watermark{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);max-width:60%;max-height:60%;object-fit:contain;display:block}
            .constitution-paged-content{position:relative;z-index:1;box-sizing:border-box;font-size:9pt;line-height:1.45;overflow:hidden}.constitution-paged-content>.print-constitution{width:100%;min-width:0;position:relative;z-index:2}.constitution-paged-grid-overlay{position:absolute;z-index:9;pointer-events:none;background-image:linear-gradient(to right,rgba(139,51,50,.13) 1px,transparent 1px),linear-gradient(to right,rgba(139,51,50,.045) 1px,transparent 1px),linear-gradient(to bottom,rgba(60,60,60,.055) 1px,transparent 1px);background-size:calc(100% / ${PRINT_GRID_MAJOR_COLUMNS}) 100%,calc(100% / ${PRINT_GRID_COLUMNS}) 100%,100% ${PRINT_GRID_ROW_MM}mm;border:1px dashed rgba(139,51,50,.28)}.constitution-paged-number{position:absolute;z-index:4;right:0;left:0;text-align:center;font-size:7.5pt;color:#6b6b6d;pointer-events:none}
            .constitution-safe-zone-guide{position:absolute;z-index:16;border-top:2px solid rgba(139,51,50,.82);height:12px;cursor:ns-resize;touch-action:none}.constitution-safe-zone-guide::before{content:'';position:absolute;right:0;left:0;top:-7px;height:14px;background:transparent}.constitution-safe-zone-guide span{position:absolute;right:0;bottom:4px;padding:2px 5px;background:#fff;border:1px solid rgba(139,51,50,.45);color:#8B3332;font-size:10px;line-height:1;white-space:nowrap}
            [data-print-flow='${PRINT_FLOW_KIND.REPEATABLE_TABLE}']{break-inside:auto!important;page-break-inside:auto!important}[data-print-flow='${PRINT_FLOW_KIND.REPEATABLE_TABLE}']>tbody>tr{break-inside:avoid!important;page-break-inside:avoid!important}.print-line-slice-viewport{position:relative;width:100%;overflow:hidden;box-sizing:border-box}.print-line-slice-content{width:100%;box-sizing:border-box;transform-origin:top left}tr[data-print-row-slice='true']{break-inside:avoid!important;page-break-inside:avoid!important}
            .print-page-break-before{break-before:page!important;page-break-before:always!important}
            @media print{@page{size:A4 ${orientation};margin:0}.constitution-paged-layoutbar,.constitution-presentation-editor,.constitution-paged-grid-overlay,.constitution-safe-zone-guide,.constitution-flow-measure{display:none!important}.constitution-paged-pages{padding:0;gap:0;background:#fff;display:block}.constitution-paged-sheet{box-shadow:none;margin:0;break-after:page;page-break-after:always;break-inside:avoid;page-break-inside:avoid}.constitution-paged-sheet:last-child{break-after:auto;page-break-after:auto}}
          `}</style>
        </div>
      </PrintLayoutProvider>
    </PrintPresentationProvider>
  );
}