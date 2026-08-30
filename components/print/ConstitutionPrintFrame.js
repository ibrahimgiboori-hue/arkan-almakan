'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import PrintFrame from '@/components/print/PrintFrame';
import { PrintLayoutProvider } from '@/components/print/PrintLayoutContext';
import TableBoundaryEditor from '@/components/print/TableBoundaryEditor';
import {
  PRINT_GRID_COLUMNS,
  PRINT_GRID_MAJOR_COLUMNS,
  PRINT_GRID_ROW_MM,
} from '@/lib/print-grid';
import {
  PRINT_GOVERNANCE_VERSION,
  getPrintDefinition,
  getPrintLayoutPolicy,
  printGovernanceClassName,
} from '@/lib/print-governance';
import {
  PRINT_FONT_MAX_DELTA_PT,
  PRINT_FONT_MIN_DELTA_PT,
  PRINT_FONT_STEP_PT,
  PRINT_LAYOUT_SETTINGS_VERSION,
  mergePrintLayoutSettings,
  normalizePrintFontDelta,
  printTypographyStyle,
} from '@/lib/print-layout-settings';

const MIN_SIDE_MM = 10;
const MAX_SIDE_MM = 24;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

function positive(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

export default function ConstitutionPrintFrame({
  documentKey,
  className = '',
  children,
  ...frameProps
}) {
  const definition = getPrintDefinition(documentKey);
  const family = definition.family;
  const layout = getPrintLayoutPolicy(documentKey);
  const classes = printGovernanceClassName(documentKey, className);
  const rootRef = useRef(null);

  const letterheadActive = frameProps.showLetterhead !== false;
  const safeTop = letterheadActive ? positive(frameProps.cfg?.letterhead_top_mm) : 0;
  const safeBottom = letterheadActive ? positive(frameProps.cfg?.letterhead_bottom_mm) : 0;
  const safeSide = letterheadActive ? positive(frameProps.cfg?.letterhead_side_mm, MIN_SIDE_MM) : MIN_SIDE_MM;

  // القالب أو المستند يستطيع طلب مساحة أكبر، لكنه لا يستطيع اختراق
  // المنطقة الآمنة التي يملكها القبطان للترويسة والتذييل والهوامش.
  const requestedTop = positive(frameProps.contentTopMm ?? layout.topMm ?? safeTop, safeTop);
  const requestedBottom = positive(frameProps.contentBottomMm ?? layout.bottomMm ?? safeBottom, safeBottom);
  const governedTop = Math.max(requestedTop, safeTop);
  const governedBottom = Math.max(requestedBottom, safeBottom);
  const governedSideFloor = clamp(Math.max(MIN_SIDE_MM, safeSide), MIN_SIDE_MM, MAX_SIDE_MM);

  const defaultSide = clamp(
    Math.max(
      positive(frameProps.contentSideMm ?? layout.sideMm ?? safeSide, governedSideFloor),
      governedSideFloor,
    ),
    governedSideFloor,
    MAX_SIDE_MM,
  );

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    sideMm:defaultSide,
    grids:{},
    rows:{},
    typography:{ fontDeltaPt:0 },
  });
  const [message, setMessage] = useState('');

  const loadOverrides = useCallback(async () => {
    const { data, error } = await supabase
      .from('print_layout_overrides')
      .select('scope,scope_key,settings')
      .in('scope_key', [family, documentKey]);

    if (error) {
      setDraft({ sideMm:defaultSide, grids:{}, rows:{}, typography:{fontDeltaPt:0} });
      return;
    }

    const familySettings = (data || [])
      .find(item => item.scope === 'family' && item.scope_key === family)?.settings || {};
    const documentSettings = (data || [])
      .find(item => item.scope === 'document' && item.scope_key === documentKey)?.settings || {};
    const merged = mergePrintLayoutSettings(
      familySettings,
      documentSettings,
      { sideMm:defaultSide, fontDeltaPt:0 },
    );
    setDraft({
      ...merged,
      sideMm:clamp(
        Math.max(positive(merged.sideMm ?? defaultSide, defaultSide), governedSideFloor),
        governedSideFloor,
        MAX_SIDE_MM,
      ),
      grids:merged.grids || {},
      rows:merged.rows || {},
      typography:{
        ...(merged.typography || {}),
        fontDeltaPt:normalizePrintFontDelta(merged.typography?.fontDeltaPt || 0),
      },
    });
  }, [defaultSide, documentKey, family, governedSideFloor]);

  useEffect(() => { loadOverrides(); }, [loadOverrides]);

  const setSideMm = useCallback((value) => {
    setDraft(previous => ({
      ...previous,
      sideMm:clamp(value, governedSideFloor, MAX_SIDE_MM),
    }));
  }, [governedSideFloor]);

  const setGridLayout = useCallback((key, value) => {
    setDraft(previous => {
      const grids = { ...(previous.grids || {}) };
      if (value == null) delete grids[key];
      else grids[key] = value;
      return { ...previous, grids };
    });
  }, []);

  const setRowHeight = useCallback((key, value) => {
    setDraft(previous => {
      const rows = { ...(previous.rows || {}) };
      if (value == null) delete rows[key];
      else rows[key] = Number(value);
      return { ...previous, rows };
    });
  }, []);

  const setFontDelta = useCallback((value) => {
    setDraft(previous => ({
      ...previous,
      typography:{
        ...(previous.typography || {}),
        fontDeltaPt:normalizePrintFontDelta(value),
      },
    }));
  }, []);

  function changeFont(delta) {
    setFontDelta(Number(draft.typography?.fontDeltaPt || 0) + delta);
  }

  async function saveLayout(scope) {
    setMessage('جارٍ حفظ خصائص المطبوع...');
    const scopeKey = scope === 'family' ? family : documentKey;
    const { data:{ user } } = await supabase.auth.getUser();
    const payload = {
      scope,
      scope_key:scopeKey,
      settings:{
        layoutSettingsVersion:PRINT_LAYOUT_SETTINGS_VERSION,
        gridSchemaVersion:3,
        gridColumns:PRINT_GRID_COLUMNS,
        gridMajorColumns:PRINT_GRID_MAJOR_COLUMNS,
        gridRowMm:PRINT_GRID_ROW_MM,
        sideMm:draft.sideMm,
        grids:draft.grids || {},
        rows:draft.rows || {},
        typography:{
          fontDeltaPt:normalizePrintFontDelta(draft.typography?.fontDeltaPt || 0),
        },
      },
      updated_by_user_id:user?.id || null,
      updated_at:new Date().toISOString(),
    };
    const { error } = await supabase
      .from('print_layout_overrides')
      .upsert(payload, { onConflict:'scope,scope_key' });
    if (error) {
      setMessage(`تعذر الحفظ: ${error.message}`);
      return;
    }
    if (scope === 'family') {
      await supabase.from('print_layout_overrides')
        .delete().eq('scope','document').eq('scope_key',documentKey);
      setMessage('تم حفظ خصائص الطباعة الموحدة للعائلة');
    } else {
      setMessage('تم حفظ خصائص هذا المطبوع');
    }
    await loadOverrides();
  }

  async function followFamily() {
    setMessage('جارٍ الرجوع لخصائص العائلة...');
    const { error } = await supabase.from('print_layout_overrides')
      .delete().eq('scope','document').eq('scope_key',documentKey);
    if (error) setMessage(`تعذر الرجوع: ${error.message}`);
    else {
      setMessage('أصبح المطبوع يتبع خصائص العائلة');
      await loadOverrides();
    }
  }

  function resetDraft() {
    setDraft({ sideMm:defaultSide, grids:{}, rows:{}, typography:{fontDeltaPt:0} });
    setMessage('عادت خصائص القبطان الافتراضية في المعاينة؛ احفظها إذا أردت تثبيتها');
  }

  const contextValue = useMemo(() => ({
    editing,
    gridLayouts:draft.grids || {},
    rowHeights:draft.rows || {},
    setGridLayout,
    setRowHeight,
  }), [draft.grids, draft.rows, editing, setGridLayout, setRowHeight]);

  const rootSelector = `.print-page .print-doc-${documentKey}`;
  const flowPagination = layout.paginationMode === 'flow';
  const fontDelta = normalizePrintFontDelta(draft.typography?.fontDeltaPt || 0);

  return (
    <PrintLayoutProvider value={contextValue}>
      <TableBoundaryEditor
        editing={editing}
        gridLayouts={draft.grids || {}}
        setGridLayout={setGridLayout}
        documentKey={documentKey}
        rootSelector={rootSelector}
        refreshKey={children}
      />

      <div className="print-layoutbar no-print" role="region" aria-label="خصائص المطبوع">
        <button type="button" className={editing ? 'active' : ''} onClick={() => setEditing(value => !value)}>
          {editing ? 'إغلاق خصائص المطبوع' : 'خصائص المطبوع'}
        </button>
        {editing && <>
          <span className="print-layout-value">
            حدود الخلايا: اسحب أي فاصل بين عمودين · نقرتان تعيدان الجدول للوضع الافتراضي
          </span>
          <span className="print-layout-font-control" aria-label="حجم الخط العام">
            <span>الخط العام</span>
            <button type="button" onClick={() => changeFont(-PRINT_FONT_STEP_PT)} disabled={fontDelta <= PRINT_FONT_MIN_DELTA_PT}>−0.5</button>
            <strong>{fontDelta > 0 ? '+' : ''}{fontDelta.toFixed(1)} pt</strong>
            <button type="button" onClick={() => changeFont(PRINT_FONT_STEP_PT)} disabled={fontDelta >= PRINT_FONT_MAX_DELTA_PT}>+0.5</button>
            <button type="button" onClick={() => setFontDelta(0)} disabled={fontDelta === 0}>الافتراضي</button>
          </span>
          <span className="print-layout-value">
            {PRINT_GRID_MAJOR_COLUMNS} عمودًا / {PRINT_GRID_COLUMNS} وحدة · صف {PRINT_GRID_ROW_MM} مم
          </span>
          <span className="print-layout-value">
            الهامش: <strong>{Number(draft.sideMm).toFixed(1)} مم</strong>
            {letterheadActive ? ` · الحد الآمن ${governedSideFloor.toFixed(1)} مم` : ''}
          </span>
          <button type="button" onClick={() => saveLayout('document')}>حفظ لهذا المطبوع</button>
          <button type="button" onClick={() => saveLayout('family')}>حفظ للعائلة</button>
          <button type="button" onClick={followFamily}>استخدام خصائص العائلة</button>
          <button type="button" onClick={resetDraft}>إعادة الافتراضي</button>
        </>}
        {message && <span className="print-layout-message">{message}</span>}
      </div>

      <PrintFrame
        {...frameProps}
        balancePolicy={flowPagination ? null : layout.balance}
        flowPagination={flowPagination}
        contentTopMm={governedTop}
        contentBottomMm={governedBottom}
        contentSideMm={draft.sideMm}
        layoutEditing={editing}
        onContentSideChange={setSideMm}
      >
        <div
          ref={rootRef}
          className={`${classes} ${editing ? 'print-layout-editing' : ''}`.trim()}
          style={printTypographyStyle(draft)}
          data-print-document={documentKey}
          data-print-family={family}
          data-print-status={definition.status}
          data-print-pagination={layout.paginationMode}
          data-print-letterhead={letterheadActive ? 'active' : 'off'}
          data-print-safe-top-mm={governedTop}
          data-print-safe-bottom-mm={governedBottom}
          data-print-safe-side-mm={draft.sideMm}
          data-print-font-delta-pt={fontDelta}
          data-print-layout-settings-version={PRINT_LAYOUT_SETTINGS_VERSION}
          data-print-governance-version={PRINT_GOVERNANCE_VERSION}
        >
          {children}
        </div>
      </PrintFrame>

      <style jsx global>{`
        .print-layoutbar{position:sticky;top:0;z-index:22;max-width:210mm;margin:8px auto 0;padding:8px 10px;background:#fff;border:1px solid #c7c7c7;display:flex;gap:7px;align-items:center;flex-wrap:wrap;direction:rtl;box-shadow:0 1px 6px rgba(0,0,0,.06)}
        .print-layoutbar button{font:inherit;font-size:12px;padding:6px 9px;border:1px solid #aaa;background:#fff;color:#222;cursor:pointer}
        .print-layoutbar button.active{background:#8B3332;border-color:#8B3332;color:#fff}
        .print-layoutbar button:disabled{opacity:.42;cursor:not-allowed}
        .print-layout-value,.print-layout-message{font-size:11.5px;color:#444}
        .print-layout-font-control{display:flex;align-items:center;gap:5px;padding:3px 5px;border:1px solid #ddd;background:#fafafa;font-size:11.5px;color:#333}
        .print-layout-font-control strong{min-width:48px;text-align:center;font-variant-numeric:tabular-nums}
        @media print{.print-layoutbar{display:none!important}}
      `}</style>
    </PrintLayoutProvider>
  );
}