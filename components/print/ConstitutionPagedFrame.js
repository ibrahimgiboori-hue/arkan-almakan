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
  getPrintDefinition,
  getPrintLayoutPolicy,
  printGovernanceClassName,
} from '@/lib/print-governance';
import {
  PRINT_GRID_COLUMNS,
  PRINT_GRID_MAJOR_COLUMNS,
  PRINT_GRID_ROW_MM,
} from '@/lib/print-grid';
import { PrintLayoutProvider } from '@/components/print/PrintLayoutContext';
import PagedTableGridEditor from '@/components/print/PagedTableGridEditor';
import PrintMarks from '@/components/print/PrintMarks';

const assetUrl = (path) => path ? supabase.storage.from('brand').getPublicUrl(path).data.publicUrl : null;
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value)));
const snap = (value) => Math.round(Number(value) * 2) / 2;
const MIN_MARGIN = 8;
const MAX_MARGIN = 30;
const MIN_SAFE_BOTTOM = 20;
const MAX_SAFE_BOTTOM = 90;
const CSS_PX_PER_MM = 96 / 25.4;

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

function samePagination(left, right) {
  if (left === right) return true;
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((page, pageIndex) => (
    Array.isArray(page)
    && Array.isArray(right[pageIndex])
    && page.length === right[pageIndex].length
    && page.every((item, itemIndex) => item === right[pageIndex][itemIndex])
  ));
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

export default function ConstitutionPagedFrame({
  documentKey,
  cfg,
  children,
  showLetterhead = true,
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
  autoPaginate = false,
}) {
  const definition = getPrintDefinition(documentKey);
  const layout = getPrintLayoutPolicy(documentKey);
  const rawPages = Children.toArray(children);
  const flow = useMemo(() => decomposeFlow(children), [children]);
  const flowMeasureRef = useRef(null);
  const [flowPagination, setFlowPagination] = useState(null);

  const explicitDirection = direction === 'ltr' ? 'ltr' : direction === 'rtl' ? 'rtl' : null;
  const inferredDirection = rawPages.find((page) => page?.props?.dir === 'ltr' || page?.props?.dir === 'rtl')?.props?.dir || null;
  const docDirection = explicitDirection || inferredDirection || 'rtl';
  const docTextAlign = docDirection === 'ltr' ? 'left' : 'right';

  const top = Number(contentTopMm ?? layout.topMm ?? cfg?.letterhead_top_mm ?? 47);
  const bottom = Number(contentBottomMm ?? layout.bottomMm ?? cfg?.letterhead_bottom_mm ?? 39);
  const sideFallback = Number(contentSideMm ?? layout.sideMm ?? cfg?.letterhead_side_mm ?? 19);
  const defaultLeft = clamp(contentLeftMm ?? sideFallback, MIN_MARGIN, MAX_MARGIN);
  const defaultRight = clamp(contentRightMm ?? sideFallback, MIN_MARGIN, MAX_MARGIN);
  const defaultBlockGap = clamp(layout.grid?.blockGapMm ?? 3, 1, 8);
  const defaultSectionGap = clamp(layout.grid?.sectionGapMm ?? 6, 2, 14);
  const defaultSafeBottom = clamp(layout.safeBottomMm ?? bottom, Math.max(MIN_SAFE_BOTTOM, bottom), MAX_SAFE_BOTTOM);

  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState({
    leftMm:defaultLeft,
    rightMm:defaultRight,
    safeBottomMm:defaultSafeBottom,
    blockGapMm:defaultBlockGap,
    sectionGapMm:defaultSectionGap,
    grids:{}, rows:{},
  });

  const loadOverrides = useCallback(async () => {
    const { data, error } = await supabase
      .from('print_layout_overrides')
      .select('scope,scope_key,settings')
      .in('scope_key', [definition.family, documentKey]);
    if (error) return;
    const familySettings = (data || []).find((x)=>x.scope==='family' && x.scope_key===definition.family)?.settings || {};
    const documentSettings = (data || []).find((x)=>x.scope==='document' && x.scope_key===documentKey)?.settings || {};
    const merged = mergeSettings(familySettings, documentSettings);
    const legacySide = merged.sideMm;
    setDraft({
      ...merged,
      leftMm:clamp(merged.leftMm ?? legacySide ?? defaultLeft, MIN_MARGIN, MAX_MARGIN),
      rightMm:clamp(merged.rightMm ?? legacySide ?? defaultRight, MIN_MARGIN, MAX_MARGIN),
      safeBottomMm:clamp(merged.safeBottomMm ?? defaultSafeBottom, Math.max(MIN_SAFE_BOTTOM, bottom), MAX_SAFE_BOTTOM),
      blockGapMm:clamp(merged.blockGapMm ?? defaultBlockGap, 1, 8),
      sectionGapMm:clamp(merged.sectionGapMm ?? defaultSectionGap, 2, 14),
      grids:merged.grids || {}, rows:merged.rows || {},
    });
  }, [bottom, defaultBlockGap, defaultLeft, defaultRight, defaultSafeBottom, defaultSectionGap, definition.family, documentKey]);

  useEffect(() => { loadOverrides(); }, [loadOverrides]);

  const setMargin = useCallback((key, value) => {
    setDraft((previous)=>({ ...previous, [key]:snap(clamp(value, MIN_MARGIN, MAX_MARGIN)) }));
  }, []);
  const setSafeBottom = useCallback((value) => {
    setDraft((previous)=>({
      ...previous,
      safeBottomMm:snap(clamp(value, Math.max(MIN_SAFE_BOTTOM, bottom), MAX_SAFE_BOTTOM)),
    }));
  }, [bottom]);
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
        gridSchemaVersion:4,
        gridColumns:PRINT_GRID_COLUMNS,
        gridMajorColumns:PRINT_GRID_MAJOR_COLUMNS,
        gridRowMm:PRINT_GRID_ROW_MM,
        leftMm:draft.leftMm,
        rightMm:draft.rightMm,
        safeBottomMm:draft.safeBottomMm,
        blockGapMm:draft.blockGapMm,
        sectionGapMm:draft.sectionGapMm,
        grids:draft.grids || {}, rows:draft.rows || {},
      },
      updated_by_user_id:user?.id || null,
      updated_at:new Date().toISOString(),
    };
    const { error } = await supabase.from('print_layout_overrides').upsert(payload, { onConflict:'scope,scope_key' });
    if (error) { setMessage(`تعذر الحفظ: ${error.message}`); return; }
    if (scope === 'family') await supabase.from('print_layout_overrides').delete().eq('scope','document').eq('scope_key',documentKey);
    setMessage(scope === 'family' ? 'تم حفظ إعدادات القبطان لعائلة المطبوعات' : 'تم حفظ إعدادات القبطان لهذا المطبوع');
    await loadOverrides();
  }

  async function followFamily() {
    const { error } = await supabase.from('print_layout_overrides').delete().eq('scope','document').eq('scope_key',documentKey);
    if (error) setMessage(`تعذر الرجوع: ${error.message}`);
    else { setMessage('أصبح المطبوع يتبع إعدادات القبطان للعائلة'); await loadOverrides(); }
  }

  function resetDraft() {
    setDraft({
      leftMm:defaultLeft,
      rightMm:defaultRight,
      safeBottomMm:defaultSafeBottom,
      blockGapMm:defaultBlockGap,
      sectionGapMm:defaultSectionGap,
      grids:{}, rows:{},
    });
    setMessage('عادت إعدادات القبطان الافتراضية في المعاينة؛ احفظها إذا أردت تثبيتها');
  }

  const left = clamp(draft.leftMm ?? defaultLeft, MIN_MARGIN, MAX_MARGIN);
  const right = clamp(draft.rightMm ?? defaultRight, MIN_MARGIN, MAX_MARGIN);
  const safeBottom = clamp(draft.safeBottomMm ?? defaultSafeBottom, Math.max(MIN_SAFE_BOTTOM, bottom), MAX_SAFE_BOTTOM);
  const grid = { ...(layout.grid || {}), blockGapMm:draft.blockGapMm, sectionGapMm:draft.sectionGapMm };

  useEffect(() => {
    onLayoutChange?.({
      leftMm:left,
      rightMm:right,
      topMm:top,
      bottomMm:safeBottom,
      letterheadBottomMm:bottom,
      safeBottomMm:safeBottom,
      blockGapMm:grid.blockGapMm,
      sectionGapMm:grid.sectionGapMm,
    });
  }, [bottom, grid.blockGapMm, grid.sectionGapMm, left, onLayoutChange, right, safeBottom, top]);

  const contextValue = useMemo(()=>({
    editing,
    gridLayouts:draft.grids || {}, rowHeights:draft.rows || {},
    setGridLayout, setRowHeight,
  }), [draft.grids, draft.rows, editing, setGridLayout, setRowHeight]);

  const landscape = layout.orientation === 'landscape';
  const pageHeightMm = landscape ? 210 : 297;
  const pageWidthMm = landscape ? 297 : 210;
  const hasSplitLetterhead = Boolean(cfg?.header_image_path || cfg?.footer_image_path || cfg?.watermark_image_path);
  const useSplitLetterhead = showLetterhead && hasSplitLetterhead && (landscape || !cfg?.letterhead_image_path);
  const full = showLetterhead && cfg?.letterhead_image_path && !useSplitLetterhead ? assetUrl(cfg.letterhead_image_path) : null;
  const header = useSplitLetterhead ? assetUrl(cfg?.header_image_path) : null;
  const footer = useSplitLetterhead ? assetUrl(cfg?.footer_image_path) : null;
  const watermark = useSplitLetterhead ? assetUrl(cfg?.watermark_image_path) : null;
  const classes = printGovernanceClassName(documentKey);
  const contentStyle = {
    paddingTop:`${top}mm`, paddingBottom:`${safeBottom}mm`, paddingLeft:`${left}mm`, paddingRight:`${right}mm`,
    direction:docDirection, textAlign:docTextAlign,
    '--print-grid-columns':String(grid.columns || PRINT_GRID_COLUMNS),
    '--print-grid-major-columns':String(grid.majorColumns || PRINT_GRID_MAJOR_COLUMNS),
    '--print-grid-row':`${Number(grid.rowMm ?? PRINT_GRID_ROW_MM)}mm`,
    '--print-block-gap':`${Number(grid.blockGapMm ?? 3)}mm`,
    '--print-section-gap':`${Number(grid.sectionGapMm ?? 6)}mm`,
    '--print-safe-bottom':`${safeBottom}mm`,
  };

  useLayoutEffect(() => {
    if (!autoPaginate) {
      setFlowPagination(null);
      return;
    }
    const host = flowMeasureRef.current;
    const measureRoot = host?.querySelector('[data-print-flow-root="true"]');
    if (!measureRoot) return;
    const domBlocks = [...measureRoot.children];
    if (!flow.blocks.length) {
      setFlowPagination((previous) => samePagination(previous, [[]]) ? previous : [[]]);
      return;
    }
    if (domBlocks.length !== flow.blocks.length) {
      // A custom component expanded into a different DOM shape. Fail safely as
      // one page rather than inventing a second pagination law for that route.
      setFlowPagination((previous) => samePagination(previous, [flow.blocks.map((_, index)=>index)])
        ? previous
        : [flow.blocks.map((_, index)=>index)]);
      return;
    }

    const availablePx = Math.max(1, (pageHeightMm - top - safeBottom) * CSS_PX_PER_MM);
    const pages = [];
    let current = [];
    let used = 0;

    domBlocks.forEach((element, index) => {
      const height = Math.max(1, outerHeight(element));
      const forcedBreak = element.dataset.printBreakBefore === 'page'
        || element.classList.contains('print-page-break-before');

      if (forcedBreak && current.length) {
        pages.push(current);
        current = [];
        used = 0;
      }

      if (current.length && used + height > availablePx + 1) {
        pages.push(current);
        current = [];
        used = 0;
      }

      current.push(index);
      used += height;
    });

    if (current.length || !pages.length) pages.push(current);
    setFlowPagination((previous) => samePagination(previous, pages) ? previous : pages);
  }, [autoPaginate, flow.blocks, pageHeightMm, safeBottom, top]);

  const pages = autoPaginate
    ? (flowPagination || [flow.blocks.map((_, index)=>index)]).map((indexes, pageIndex) => (
        composeFlowPage(flow.root, indexes.map((index)=>flow.blocks[index]), pageIndex)
      ))
    : rawPages;
  const pageCount = pages.length;
  const formatPageNumber = pageNumberFormatter || ((current,total)=> docDirection === 'ltr' ? `Page ${current} of ${total}` : `صفحة ${current} من ${total}`);

  function startSafeBottomDrag(event) {
    if (!editing) return;
    event.preventDefault();
    event.stopPropagation();
    const sheet = event.currentTarget.closest('.constitution-paged-sheet');
    const rect = sheet?.getBoundingClientRect();
    if (!rect) return;

    const apply = (clientY) => {
      const fromTopMm = ((clientY - rect.top) / Math.max(1, rect.height)) * pageHeightMm;
      setSafeBottom(pageHeightMm - fromTopMm);
    };
    const move = (moveEvent) => apply(moveEvent.clientY);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const measureRoot = autoPaginate && flow.root && isValidElement(flow.root)
    ? cloneElement(flow.root, { 'data-print-flow-root':'true' }, flow.blocks)
    : autoPaginate
      ? <div data-print-flow-root="true">{flow.blocks}</div>
      : null;

  return (
    <PrintLayoutProvider value={contextValue}>
      <PagedTableGridEditor editing={editing} gridLayouts={draft.grids || {}} rowHeights={draft.rows || {}}
        setGridLayout={setGridLayout} setRowHeight={setRowHeight} documentKey={documentKey} pageCount={pageCount} />

      <div className="constitution-paged-layoutbar no-print" role="region" aria-label="القبطان للطباعة">
        <button type="button" className={editing ? 'active' : ''} onClick={()=>setEditing((v)=>!v)}>
          {editing ? 'إنهاء ضبط القبطان' : 'القبطان للطباعة'}
        </button>
        {editing && <>
          <label>الهامش الأيسر <input type="range" min={MIN_MARGIN} max={MAX_MARGIN} step="0.5" value={left} onChange={(e)=>setMargin('leftMm',e.target.value)} /><strong>{left.toFixed(1)} مم</strong></label>
          <label>الهامش الأيمن <input type="range" min={MIN_MARGIN} max={MAX_MARGIN} step="0.5" value={right} onChange={(e)=>setMargin('rightMm',e.target.value)} /><strong>{right.toFixed(1)} مم</strong></label>
          <label>حد الذيل الآمن <input type="range" min={Math.max(MIN_SAFE_BOTTOM,bottom)} max={MAX_SAFE_BOTTOM} step="0.5" value={safeBottom} onChange={(e)=>setSafeBottom(e.target.value)} /><strong>{safeBottom.toFixed(1)} مم</strong></label>
          <label>تباعد الكتل <input type="range" min="1" max="8" step="0.5" value={draft.blockGapMm} onChange={(e)=>setDraft((p)=>({...p,blockGapMm:snap(e.target.value)}))} /><strong>{Number(draft.blockGapMm).toFixed(1)} مم</strong></label>
          <label>تباعد الأقسام <input type="range" min="2" max="14" step="0.5" value={draft.sectionGapMm} onChange={(e)=>setDraft((p)=>({...p,sectionGapMm:snap(e.target.value)}))} /><strong>{Number(draft.sectionGapMm).toFixed(1)} مم</strong></label>
          <button type="button" onClick={()=>saveLayout('document')}>حفظ لهذا المطبوع</button>
          <button type="button" onClick={()=>saveLayout('family')}>حفظ للعائلة</button>
          <button type="button" onClick={followFamily}>استخدام إعدادات العائلة</button>
          <button type="button" onClick={resetDraft}>إعادة الافتراضي</button>
        </>}
        {message && <span>{message}</span>}
      </div>

      {autoPaginate && (
        <div
          ref={flowMeasureRef}
          className={`constitution-flow-measure ${classes}`}
          style={{
            width:`${pageWidthMm}mm`,
            paddingTop:`${top}mm`,
            paddingBottom:`${safeBottom}mm`,
            paddingLeft:`${left}mm`,
            paddingRight:`${right}mm`,
            direction:docDirection,
            textAlign:docTextAlign,
          }}
          aria-hidden="true"
        >
          {measureRoot}
        </div>
      )}

      <div className="constitution-paged-pages" data-print-pages={pageCount} data-document-direction={docDirection}
        onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerLeave}>
        {pages.map((page,pageIndex)=>(
          <section className={`constitution-paged-sheet print-page ${pageClassName} ${editing ? 'layout-editing' : ''}`.trim()} key={page.key || pageIndex} dir={docDirection}>
            <div className="constitution-paged-assets print-assets" aria-hidden="true">
              {full && <img src={full} className="constitution-paged-full print-master-full" alt="" />}
              {header && <img src={header} className="constitution-paged-header print-master-header" alt="" style={{height:`${Number(cfg?.header_height_mm || 40)}mm`}} />}
              {footer && <img src={footer} className="constitution-paged-footer print-master-footer" alt="" style={{height:`${Number(cfg?.footer_height_mm || 32)}mm`}} />}
              {watermark && <img src={watermark} className="constitution-paged-watermark print-master-watermark" alt="" />}
            </div>
            {editing && <>
              <div className="constitution-paged-grid-overlay no-print" style={{top:`${top}mm`,right:`${right}mm`,bottom:`${safeBottom}mm`,left:`${left}mm`}} />
              <div
                className="constitution-safe-zone-guide no-print"
                style={{bottom:`${safeBottom}mm`,left:`${left}mm`,right:`${right}mm`}}
                onPointerDown={startSafeBottomDrag}
                title="اسحب لتحديد نهاية المحتوى وبداية الذيل الآمن"
              >
                <span>حد الذيل الآمن</span>
              </div>
            </>}
            <main className={`constitution-paged-content print-content ${contentClassName}`.trim()} dir={docDirection} style={contentStyle}>
              <div className={`${classes} ${editing ? 'print-layout-editing' : ''}`.trim()} dir={docDirection}
                data-print-document={documentKey} data-print-family={definition.family} data-print-status={definition.status}
                data-print-governance-version={PRINT_GOVERNANCE_VERSION}>{page}</div>
            </main>
            {showPageNumbers && pageCount > 0 && <div className="constitution-paged-number" dir={docDirection} style={{bottom:`${Math.max(2,bottom-5)}mm`}}>{formatPageNumber(pageIndex+1,pageCount)}</div>}
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
          .constitution-paged-layoutbar{position:sticky;top:0;z-index:28;max-width:210mm;margin:8px auto 0;padding:8px 10px;background:#fff;border:1px solid #c7c7c7;display:flex;gap:7px;align-items:center;flex-wrap:wrap;direction:rtl;box-shadow:0 1px 6px rgba(0,0,0,.08)}
          .constitution-paged-layoutbar button{font:inherit;font-size:12px;padding:6px 9px;border:1px solid #aaa;background:#fff;color:#222;cursor:pointer}.constitution-paged-layoutbar button.active{background:#8B3332;border-color:#8B3332;color:#fff}.constitution-paged-layoutbar label{display:flex;align-items:center;gap:5px;font-size:11.5px;color:#333}.constitution-paged-layoutbar input[type=range]{width:86px;accent-color:#8B3332}.constitution-paged-layoutbar strong{font-size:11px;min-width:44px}.constitution-paged-layoutbar span{font-size:11.5px;color:#444}
          .constitution-flow-measure{position:fixed!important;z-index:-1000!important;left:-10000px!important;top:0!important;height:auto!important;min-height:0!important;box-sizing:border-box!important;visibility:hidden!important;pointer-events:none!important;background:#fff!important;font-size:9pt;line-height:1.45;overflow:visible!important}
          .constitution-paged-pages{padding:24px 14px 60px;display:flex;flex-direction:column;align-items:center;gap:20px;background:#efeaea}.constitution-paged-sheet{position:relative;width:210mm;height:297mm;background:#fff;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.16)}.constitution-paged-sheet.dragging{cursor:grabbing;user-select:none}.constitution-paged-assets{position:absolute;inset:0;z-index:0;pointer-events:none}.constitution-paged-full{position:absolute;inset:0;width:210mm;height:297mm;object-fit:fill;display:block}.constitution-paged-header{position:absolute;top:0;right:0;width:210mm;object-fit:fill;display:block}.constitution-paged-footer{position:absolute;bottom:0;right:0;width:210mm;object-fit:fill;display:block}.constitution-paged-watermark{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);max-width:120mm;max-height:160mm;object-fit:contain;display:block}
          .constitution-paged-content{position:relative;z-index:1;width:210mm;height:297mm;box-sizing:border-box;font-size:9pt;line-height:1.45;overflow:hidden}.constitution-paged-content>.print-constitution{width:100%;min-width:0;position:relative;z-index:2}.constitution-paged-grid-overlay{position:absolute;z-index:9;pointer-events:none;background-image:linear-gradient(to right,rgba(139,51,50,.13) 1px,transparent 1px),linear-gradient(to right,rgba(139,51,50,.045) 1px,transparent 1px),linear-gradient(to bottom,rgba(60,60,60,.055) 1px,transparent 1px);background-size:calc(100% / ${PRINT_GRID_MAJOR_COLUMNS}) 100%,calc(100% / ${PRINT_GRID_COLUMNS}) 100%,100% ${PRINT_GRID_ROW_MM}mm;border:1px dashed rgba(139,51,50,.28)}.constitution-paged-number{position:absolute;z-index:4;right:0;left:0;text-align:center;font-size:7.5pt;color:#6b6b6d;pointer-events:none}
          .constitution-safe-zone-guide{position:absolute;z-index:16;border-top:2px solid rgba(139,51,50,.82);height:12px;cursor:ns-resize;touch-action:none}.constitution-safe-zone-guide::before{content:'';position:absolute;right:0;left:0;top:-7px;height:14px;background:transparent}.constitution-safe-zone-guide span{position:absolute;right:0;bottom:4px;padding:2px 5px;background:#fff;border:1px solid rgba(139,51,50,.45);color:#8B3332;font-size:10px;line-height:1;white-space:nowrap}
          .print-page-break-before{break-before:page!important;page-break-before:always!important}
          @media print{@page{size:A4 portrait;margin:0}.constitution-paged-layoutbar,.constitution-paged-grid-overlay,.constitution-safe-zone-guide,.constitution-flow-measure{display:none!important}.constitution-paged-pages{padding:0;gap:0;background:#fff;display:block}.constitution-paged-sheet{width:210mm;height:297mm;box-shadow:none;margin:0;break-after:page;page-break-after:always;break-inside:avoid;page-break-inside:avoid}.constitution-paged-sheet:last-child{break-after:auto;page-break-after:auto}}
        `}</style>
      </div>
    </PrintLayoutProvider>
  );
}
