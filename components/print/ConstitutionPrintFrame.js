'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import PrintFrame from '@/components/print/PrintFrame';
import { PrintLayoutProvider } from '@/components/print/PrintLayoutContext';
import {
  PRINT_GOVERNANCE_VERSION,
  getPrintDefinition,
  getPrintLayoutPolicy,
  printGovernanceClassName,
} from '@/lib/print-governance';

const MIN_SIDE_MM = 10;
const MAX_SIDE_MM = 24;
const MIN_COLUMN_PCT = 4;

const DEFAULT_TABLE_WEIGHTS = {
  'projects-finance:info-table:4': [13, 37, 13, 37],
  'projects-finance:data-table:8': [4, 22, 8, 19, 8, 11, 13, 15],
  'projects-finance:data-table:6': [5, 35, 10, 22, 10, 18],
  'projects-finance:summary-table:2': [72, 28],
  'projects-finance:payment-table:4': [12, 38, 10, 40],
};

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, Number(v)));
}

function normalizeWeights(list, count) {
  const source = Array.isArray(list) && list.length === count
    ? list.map(Number)
    : Array.from({ length:count }, () => 100 / count);
  const total = source.reduce((s, x) => s + (Number.isFinite(x) ? x : 0), 0) || 100;
  return source.map(x => (Number(x) / total) * 100);
}

function mergeSettings(familySettings = {}, documentSettings = {}) {
  return {
    ...familySettings,
    ...documentSettings,
    grids: {
      ...(familySettings.grids || {}),
      ...(documentSettings.grids || {}),
    },
  };
}

function tableKind(table) {
  return ['info-table','data-table','summary-table','payment-table']
    .find(name => table.classList.contains(name)) || null;
}

function firstLogicalRow(table) {
  return table.tHead?.rows?.[0] || table.tBodies?.[0]?.rows?.[0] || null;
}

export default function ConstitutionPrintFrame({
  documentKey,
  className = '',
  children,
  ...frameProps
}) {
  const definition = getPrintDefinition(documentKey);
  const layout = getPrintLayoutPolicy(documentKey);
  const classes = printGovernanceClassName(documentKey, className);
  const rootRef = useRef(null);
  const defaultSide = clamp(
    layout.sideMm ?? frameProps.contentSideMm ?? frameProps.cfg?.letterhead_side_mm ?? 19,
    MIN_SIDE_MM,
    MAX_SIDE_MM,
  );

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ sideMm:defaultSide, grids:{} });
  const [message, setMessage] = useState('');

  async function loadOverrides() {
    const { data, error } = await supabase
      .from('print_layout_overrides')
      .select('scope,scope_key,settings')
      .in('scope_key', [definition.family, documentKey]);

    if (error) {
      setDraft({ sideMm:defaultSide, grids:{} });
      return;
    }

    const family = (data || []).find(x => x.scope === 'family' && x.scope_key === definition.family)?.settings || {};
    const document = (data || []).find(x => x.scope === 'document' && x.scope_key === documentKey)?.settings || {};
    const merged = mergeSettings(family, document);
    setDraft({
      ...merged,
      sideMm:clamp(merged.sideMm ?? defaultSide, MIN_SIDE_MM, MAX_SIDE_MM),
      grids:merged.grids || {},
    });
  }

  useEffect(() => {
    loadOverrides();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentKey, definition.family]);

  const setSideMm = (value) => {
    setDraft(prev => ({ ...prev, sideMm:clamp(value, MIN_SIDE_MM, MAX_SIDE_MM) }));
  };

  const setGridWeights = (key, weights) => {
    setDraft(prev => ({
      ...prev,
      grids:{ ...(prev.grids || {}), [key]:weights },
    }));
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tables = [...root.querySelectorAll('table.info-table, table.data-table, table.summary-table, table.payment-table')];
    const cleanup = [];

    tables.forEach((table) => {
      const kind = tableKind(table);
      const row = firstLogicalRow(table);
      if (!kind || !row) return;
      const cells = [...row.cells].filter(cell => Number(cell.colSpan || 1) === 1);
      if (cells.length < 2 || cells.length !== row.cells.length) return;

      const key = `${definition.family}:${kind}:${cells.length}`;
      const defaults = normalizeWeights(DEFAULT_TABLE_WEIGHTS[key], cells.length);
      const current = normalizeWeights(draft.grids?.[key] || defaults, cells.length);
      cells.forEach((cell, i) => { cell.style.width = `${current[i]}%`; });

      if (!editing) return;

      cells.forEach((cell, index) => {
        if (index === cells.length - 1) return;
        const handle = document.createElement('span');
        handle.className = 'print-col-resizer no-print';
        handle.title = 'اسحب لتغيير عرض العمود — نقرتان لإعادة الوزنية';
        cell.style.position = 'relative';
        cell.appendChild(handle);

        const onDown = (event) => {
          event.preventDefault();
          event.stopPropagation();
          const startX = event.clientX;
          const width = table.getBoundingClientRect().width || 1;
          const start = normalizeWeights(draft.grids?.[key] || defaults, cells.length);

          const onMove = (moveEvent) => {
            const deltaPct = ((moveEvent.clientX - startX) / width) * 100;
            let a = start[index] - deltaPct;
            let b = start[index + 1] + deltaPct;
            if (a < MIN_COLUMN_PCT) { b -= (MIN_COLUMN_PCT - a); a = MIN_COLUMN_PCT; }
            if (b < MIN_COLUMN_PCT) { a -= (MIN_COLUMN_PCT - b); b = MIN_COLUMN_PCT; }
            const next = [...start];
            next[index] = a;
            next[index + 1] = b;
            cells.forEach((c, i) => { c.style.width = `${next[i]}%`; });
            setGridWeights(key, next);
          };

          const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
          };
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        };

        const onDouble = (event) => {
          event.preventDefault();
          event.stopPropagation();
          cells.forEach((c, i) => { c.style.width = `${defaults[i]}%`; });
          setGridWeights(key, defaults);
        };

        handle.addEventListener('pointerdown', onDown);
        handle.addEventListener('dblclick', onDouble);
        cleanup.push(() => {
          handle.removeEventListener('pointerdown', onDown);
          handle.removeEventListener('dblclick', onDouble);
          handle.remove();
        });
      });
    });

    return () => cleanup.forEach(fn => fn());
  }, [editing, draft.grids, definition.family]);

  async function saveLayout(scope) {
    setMessage('جارٍ الحفظ...');
    const scopeKey = scope === 'family' ? definition.family : documentKey;
    const { data:{ user } } = await supabase.auth.getUser();
    const payload = {
      scope,
      scope_key:scopeKey,
      settings:{ sideMm:draft.sideMm, grids:draft.grids || {} },
      updated_by_user_id:user?.id || null,
      updated_at:new Date().toISOString(),
    };
    const { error } = await supabase.from('print_layout_overrides').upsert(payload, { onConflict:'scope,scope_key' });
    if (error) {
      setMessage(`تعذر الحفظ: ${error.message}`);
      return;
    }
    if (scope === 'family') {
      await supabase.from('print_layout_overrides').delete().eq('scope','document').eq('scope_key',documentKey);
      setMessage('تم حفظ الوزنية للعائلة');
    } else {
      setMessage('تم حفظ الوزنية لهذا المطبوع');
    }
    await loadOverrides();
  }

  async function followFamily() {
    setMessage('جارٍ الرجوع لوزنية العائلة...');
    const { error } = await supabase.from('print_layout_overrides')
      .delete().eq('scope','document').eq('scope_key',documentKey);
    if (error) setMessage(`تعذر الرجوع: ${error.message}`);
    else {
      setMessage('أصبح المطبوع يتبع وزنية العائلة');
      await loadOverrides();
    }
  }

  function resetDraft() {
    setDraft({ sideMm:defaultSide, grids:{} });
    setMessage('تمت إعادة الوزنية الافتراضية في المعاينة؛ احفظها إذا أردت تثبيتها');
  }

  const contextValue = useMemo(() => ({
    editing,
    gridWeights:draft.grids || {},
    setGridWeights,
  }), [editing, draft.grids]);

  return (
    <PrintLayoutProvider value={contextValue}>
      <div className="print-layoutbar no-print" role="region" aria-label="ضبط وزنية المطبوع">
        <button type="button" className={editing ? 'active' : ''} onClick={() => setEditing(v => !v)}>
          {editing ? 'إنهاء ضبط توزيع الخلايا' : 'ضبط توزيع الخلايا'}
        </button>
        {editing && <>
          <span className="print-layout-value">الهامش الجانبي: <strong>{Number(draft.sideMm).toFixed(1)} مم</strong></span>
          <button type="button" onClick={() => saveLayout('document')}>حفظ لهذا المطبوع</button>
          <button type="button" onClick={() => saveLayout('family')}>حفظ للعائلة</button>
          <button type="button" onClick={followFamily}>استخدام وزنية العائلة</button>
          <button type="button" onClick={resetDraft}>إعادة الوزنية الافتراضية</button>
        </>}
        {message && <span className="print-layout-message">{message}</span>}
      </div>

      <PrintFrame
        {...frameProps}
        contentTopMm={layout.topMm ?? frameProps.contentTopMm}
        contentBottomMm={layout.bottomMm ?? frameProps.contentBottomMm}
        contentSideMm={draft.sideMm}
        layoutEditing={editing}
        onContentSideChange={setSideMm}
      >
        <div
          ref={rootRef}
          className={classes}
          data-print-document={documentKey}
          data-print-family={definition.family}
          data-print-status={definition.status}
          data-print-governance-version={PRINT_GOVERNANCE_VERSION}
        >
          {children}
        </div>
      </PrintFrame>

      <style jsx global>{`
        .print-layoutbar{position:sticky;top:0;z-index:22;max-width:210mm;margin:8px auto 0;padding:8px 10px;background:#fff;border:1px solid #c7c7c7;display:flex;gap:7px;align-items:center;flex-wrap:wrap;direction:rtl;box-shadow:0 1px 6px rgba(0,0,0,.06)}
        .print-layoutbar button{font:inherit;font-size:12px;padding:6px 9px;border:1px solid #aaa;background:#fff;color:#222;cursor:pointer}
        .print-layoutbar button.active{background:#8B3332;border-color:#8B3332;color:#fff}
        .print-layout-value,.print-layout-message{font-size:11.5px;color:#444}
        .print-col-resizer{position:absolute;left:-4px;top:-1px;bottom:-1px;width:8px;cursor:col-resize;z-index:8;background:transparent}
        .print-col-resizer::after{content:'';position:absolute;left:3.5px;top:0;bottom:0;border-left:1px dashed rgba(139,51,50,.32)}
        .print-col-resizer:hover::after{border-left-color:rgba(139,51,50,.75)}
        @media print{.print-layoutbar,.print-col-resizer{display:none!important}}
      `}</style>
    </PrintLayoutProvider>
  );
}
