'use client';

import { useMemo, useRef, useState } from 'react';

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export default function ResizableLayoutGrid({ items = [], onResize, isTable = false }) {
  const gridRef = useRef(null);
  const dragRef = useRef(null);
  const [draft, setDraft] = useState({});
  const [active, setActive] = useState(-1);

  const spans = useMemo(
    () => items.map((item, index) => clamp(Number(draft[index] ?? item.span ?? (isTable ? 2 : 6)), 1, 12)),
    [items, draft, isTable]
  );

  function startResize(event, index) {
    event.preventDefault();
    event.stopPropagation();
    const grid = gridRef.current;
    if (!grid) return;

    const rect = grid.getBoundingClientRect();
    const step = rect.width / 12;
    dragRef.current = {
      index,
      startX: event.clientX,
      startSpan: spans[index],
      step,
      pointerId: event.pointerId,
    };
    setActive(index);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveResize(event) {
    const d = dragRef.current;
    if (!d) return;

    // الشبكة RTL: السحب إلى اليسار يوسّع الخلية، وإلى اليمين يضيّقها.
    const delta = d.startX - event.clientX;
    const next = clamp(d.startSpan + Math.round(delta / d.step), 1, 12);
    setDraft((prev) => ({ ...prev, [d.index]: next }));
  }

  function endResize(event) {
    const d = dragRef.current;
    if (!d) return;
    const next = clamp(Number(draft[d.index] ?? spans[d.index]), 1, 12);
    dragRef.current = null;
    setActive(-1);
    setDraft((prev) => {
      const copy = { ...prev };
      delete copy[d.index];
      return copy;
    });
    if (next !== Number(items[d.index]?.span || (isTable ? 2 : 6))) {
      onResize?.(d.index, next);
    }
    event.currentTarget.releasePointerCapture?.(d.pointerId);
  }

  if (!items.length) return null;

  return (
    <div className="layout-resize-wrap">
      <div className="layout-resize-note">
        اسحب الحافة اليسرى لأي خلية لتغيير عرضها. كل خطوة تمثل جزءاً من شبكة A4 المكوّنة من 12 عموداً،
        وهي عملياً مثل دمج خلايا Excel. التفاف النص تلقائي.
      </div>

      <div ref={gridRef} className={`layout-resize-grid ${isTable ? 'table-grid' : ''}`}>
        {items.map((item, index) => {
          const span = spans[index];
          return (
            <div
              key={`${item.key || 'field'}-${index}`}
              className={`layout-resize-cell ${active === index ? 'active' : ''}`}
              style={{ gridColumn: `span ${span}` }}
            >
              <div className="layout-resize-cell-label">{item.label || 'حقل بلا تسمية'}</div>
              <div className="layout-resize-cell-meta">
                <span className="mono">{item.key || '—'}</span>
                <strong>{span}/12</strong>
              </div>
              <div
                className="layout-resize-handle"
                role="separator"
                aria-orientation="vertical"
                aria-label={`تغيير عرض ${item.label || 'الحقل'}`}
                title="اسحب لتغيير العرض"
                onPointerDown={(e) => startResize(e, index)}
                onPointerMove={moveResize}
                onPointerUp={endResize}
                onPointerCancel={endResize}
              />
            </div>
          );
        })}
      </div>

      <style jsx>{`
        .layout-resize-wrap{margin:12px 0 16px;border:1px solid var(--hair);background:#faf9f8;padding:12px;direction:rtl}
        .layout-resize-note{font-size:12.5px;line-height:1.7;color:var(--ink-soft);margin-bottom:10px}
        .layout-resize-grid{position:relative;display:grid;grid-template-columns:repeat(12,minmax(0,1fr));grid-auto-flow:row;gap:5px;padding:7px;background-image:linear-gradient(to left,rgba(139,51,50,.09) 1px,transparent 1px);background-size:calc(100% / 12) 100%;border:1px solid #d8caca;min-height:68px;overflow:hidden}
        .layout-resize-grid.table-grid{grid-auto-flow:column;grid-template-rows:1fr;grid-auto-columns:minmax(0,1fr)}
        .layout-resize-cell{position:relative;min-width:0;min-height:54px;padding:9px 13px 8px 8px;border:1px solid #bfa9a8;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.04);overflow:hidden;transition:border-color .12s,background .12s}
        .layout-resize-cell.active{border-color:#8B3332;background:#fff8f7;z-index:3}
        .layout-resize-cell-label{font-size:13px;font-weight:700;color:#5f2524;line-height:1.4;overflow-wrap:anywhere}
        .layout-resize-cell-meta{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:7px;font-size:11px;color:var(--ink-soft)}
        .layout-resize-cell-meta strong{font-variant-numeric:tabular-nums;color:#8B3332;white-space:nowrap}
        .layout-resize-cell-meta .mono{direction:ltr;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .layout-resize-handle{position:absolute;left:-3px;top:0;bottom:0;width:9px;cursor:col-resize;touch-action:none;z-index:4}
        .layout-resize-handle::after{content:'';position:absolute;left:4px;top:8px;bottom:8px;width:2px;background:#b98987;opacity:.55}
        .layout-resize-cell:hover .layout-resize-handle::after,.layout-resize-cell.active .layout-resize-handle::after{background:#8B3332;opacity:1}
        @media(max-width:900px){.layout-resize-wrap{overflow-x:auto}.layout-resize-grid{min-width:760px}}
      `}</style>
    </div>
  );
}
