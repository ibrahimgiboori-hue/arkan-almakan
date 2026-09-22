'use client';

import { useMemo } from 'react';

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PX_PER_MM = 96 / 25.4;
const DEFAULT_PAGE_BOUNDS = Object.freeze({ startRow:3, endRow:61, startCol:2, endCol:41 });

const NUMERIC_TOKENS = new Set([
  'item_no','qty','unit_price','line_total',
  'subtotal','vat_amount','grand_total','plain_total',
]);

const COMPACT_TOKENS = new Set([
  'payment_terms','terms','closing_text',
  'representative_name','representative_title',
  'bank_name','bank_account_no','bank_iban',
]);

const REPEAT_GROUPS = Object.freeze([
  {
    id:'line_items',
    tokens:new Set(['item_no','description_ar','description_en','unit','qty','unit_price','line_total']),
    baseUnitsPerVisualLine:2,
    wrapToken:'description_ar',
  },
  {
    id:'payment_terms',
    tokens:new Set(['payment_terms']),
    baseUnitsPerVisualLine:1,
    wrapToken:'payment_terms',
  },
  {
    id:'terms',
    tokens:new Set(['terms']),
    baseUnitsPerVisualLine:1,
    wrapToken:'terms',
  },
]);

function pxWidth(item) {
  if (Number.isFinite(Number(item?.widthPx))) return Math.max(1, Number(item.widthPx));
  if (Number.isFinite(Number(item?.width))) return Math.max(1, Number(item.width) * 7);
  return 18;
}

function pxHeight(item) {
  if (Number.isFinite(Number(item?.heightPx))) return Math.max(1, Number(item.heightPx));
  if (Number.isFinite(Number(item?.height))) return Math.max(1, Number(item.height) * 1.33);
  return 18;
}

function tokenValue(text, values) {
  const resolved = String(text || '').replace(/\{\{([a-z][a-z0-9_]*)\}\}/g, (_match, code) => {
    const value = values?.[code];
    if (value == null || value === '') return '';
    return String(value);
  });

  // A template may place optional tokens on their own visual line, e.g.
  // "{{description_ar}}\n{{description_en}}". When the optional value is empty,
  // that empty trailing line must NOT count as wrapped content; otherwise a normal
  // two-micro-row item becomes four micro-rows.
  const lines = resolved.replace(/\r\n/g, '\n').split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines.join('\n');
}

function measureWrappedLines(text, widthPx, font = '11px Arial') {
  const source = String(text ?? '');
  if (!source) return 1;

  const explicit = source.split(/\r?\n/);
  if (typeof document === 'undefined') return Math.max(1, explicit.length);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return Math.max(1, explicit.length);
  ctx.font = font;

  const available = Math.max(8, Number(widthPx || 0) - 10);
  let count = 0;

  for (const paragraph of explicit) {
    if (!paragraph) {
      count += 1;
      continue;
    }
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      count += 1;
      continue;
    }

    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || ctx.measureText(candidate).width <= available) {
        line = candidate;
        continue;
      }
      count += 1;
      line = word;

      if (ctx.measureText(line).width > available) {
        let piece = '';
        for (const char of line) {
          const next = piece + char;
          if (piece && ctx.measureText(next).width > available) {
            count += 1;
            piece = char;
          } else {
            piece = next;
          }
        }
        line = piece;
      }
    }
    if (line) count += 1;
  }

  return Math.max(1, count);
}

function boundsOf(model) {
  const raw = model?.pageBounds || DEFAULT_PAGE_BOUNDS;
  return {
    startRow:Number(raw.startRow || DEFAULT_PAGE_BOUNDS.startRow),
    endRow:Number(raw.endRow || DEFAULT_PAGE_BOUNDS.endRow),
    startCol:Number(raw.startCol || DEFAULT_PAGE_BOUNDS.startCol),
    endCol:Number(raw.endCol || DEFAULT_PAGE_BOUNDS.endCol),
  };
}

function cellWidthPx(cell, bounds, columnMap) {
  const start = Math.max(cell.col, bounds.startCol);
  const end = Math.min(cell.col + (cell.colSpan || 1) - 1, bounds.endCol);
  let width = 0;
  for (let col = start; col <= end; col += 1) width += pxWidth(columnMap.get(col));
  return width;
}

function groupForCell(cell) {
  const tokens = Array.isArray(cell?.tokens) ? cell.tokens : [];
  return REPEAT_GROUPS.find((group) => tokens.some((token) => group.tokens.has(token))) || null;
}

function isNumericCell(cell) {
  return Array.isArray(cell?.tokens) && cell.tokens.some((token) => NUMERIC_TOKENS.has(token));
}

function repeatRecords(groupId, repeatData) {
  const rows = repeatData?.[groupId];
  if (!Array.isArray(rows)) return [];
  return rows.filter(Boolean);
}

export default function WorkbookModelPreview({
  model,
  values = {},
  repeatData = {},
  repeatGroups = {},
  visibility = [],
  toggles = {},
  overlays = [],
  overlayImages = {},
  overlayPositions = {},
  editableOverlays = false,
  onOverlayMove,
  printMode = false,
}) {
  const effectiveRepeatData = Object.keys(repeatData || {}).length ? repeatData : (repeatGroups || {});

  const layout = useMemo(() => {
    if (!model?.cells?.length) return null;

    const bounds = boundsOf(model);
    const columnMap = new Map((model.columns || []).map((item) => [item.col, item]));
    const rowMap = new Map((model.rows || []).map((item) => [item.row, item]));

    const columnsPx = [];
    for (let col = bounds.startCol; col <= bounds.endCol; col += 1) {
      columnsPx.push(pxWidth(columnMap.get(col)));
    }

    const baseRowsPx = [];
    for (let row = bounds.startRow; row <= bounds.endRow; row += 1) {
      baseRowsPx.push(pxHeight(rowMap.get(row)));
    }

    const baseWidthPx = columnsPx.reduce((sum, value) => sum + value, 0) || 1;
    const baseHeightPx = baseRowsPx.reduce((sum, value) => sum + value, 0) || 1;
    const colScaleMm = A4_WIDTH_MM / baseWidthPx;
    const rowScaleMm = A4_HEIGHT_MM / baseHeightPx;

    const sourceCells = model.cells.filter((cell) => {
      const endRow = cell.row + (cell.rowSpan || 1) - 1;
      const endCol = cell.col + (cell.colSpan || 1) - 1;
      return endRow >= bounds.startRow && cell.row <= bounds.endRow
        && endCol >= bounds.startCol && cell.col <= bounds.endCol;
    });

    const groups = REPEAT_GROUPS.map((definition) => {
      const cells = sourceCells.filter((cell) => groupForCell(cell)?.id === definition.id);
      if (!cells.length) return null;
      const startRow = Math.min(...cells.map((cell) => cell.row));
      const endRow = Math.max(...cells.map((cell) => cell.row + (cell.rowSpan || 1) - 1));
      const baseSpan = endRow - startRow + 1;
      const records = repeatRecords(definition.id, effectiveRepeatData);
      const instances = records.length ? records : [null];

      const wrapCell = cells.find((cell) => Array.isArray(cell.tokens) && cell.tokens.includes(definition.wrapToken))
        || cells[0];
      const widthCssPx = cellWidthPx(wrapCell, bounds, columnMap) * colScaleMm * PX_PER_MM;

      const instanceSpans = instances.map((record) => {
        const merged = record ? { ...values, ...record } : values;
        const display = tokenValue(wrapCell.text, merged);
        const visualLines = measureWrappedLines(display, widthCssPx);
        return Math.max(baseSpan, definition.baseUnitsPerVisualLine * visualLines);
      });

      const totalSpan = instanceSpans.reduce((sum, span) => sum + span, 0);
      return {
        ...definition,
        cells,
        startRow,
        endRow,
        baseSpan,
        instances,
        instanceSpans,
        totalSpan,
        extraRows:Math.max(0, totalSpan - baseSpan),
      };
    }).filter(Boolean).sort((a,b) => a.startRow - b.startRow);

    const extraBefore = (row) => groups
      .filter((group) => group.endRow < row)
      .reduce((sum, group) => sum + group.extraRows, 0);

    const expandedRowsPx = [];
    for (let row = bounds.startRow; row <= bounds.endRow; row += 1) {
      const group = groups.find((item) => item.startRow === row);
      if (group) {
        const pattern = [];
        for (let r = group.startRow; r <= group.endRow; r += 1) {
          pattern.push(pxHeight(rowMap.get(r)));
        }
        const unitHeight = pattern.length
          ? pattern.reduce((sum, value) => sum + value, 0) / pattern.length
          : pxHeight(rowMap.get(row));

        for (const span of group.instanceSpans) {
          for (let index = 0; index < span; index += 1) expandedRowsPx.push(unitHeight);
        }
        row = group.endRow;
        continue;
      }
      if (groups.some((item) => row > item.startRow && row <= item.endRow)) continue;
      expandedRowsPx.push(pxHeight(rowMap.get(row)));
    }

    const renderCells = [];
    const groupedAddresses = new Set(groups.flatMap((group) => group.cells.map((cell) => cell.address)));

    for (const cell of sourceCells) {
      if (groupedAddresses.has(cell.address)) continue;
      renderCells.push({
        ...cell,
        renderKey:cell.address,
        renderRow:(cell.row - bounds.startRow + 1) + extraBefore(cell.row),
        renderRowSpan:cell.rowSpan || 1,
        renderValues:values,
      });
    }

    for (const group of groups) {
      const baseRenderRow = (group.startRow - bounds.startRow + 1) + extraBefore(group.startRow);
      let offset = 0;
      group.instances.forEach((record, index) => {
        const span = group.instanceSpans[index];
        const recordValues = record ? { ...values, ...record } : values;
        for (const cell of group.cells) {
          renderCells.push({
            ...cell,
            renderKey:`${cell.address}::${group.id}::${index}`,
            renderRow:baseRenderRow + offset + (cell.row - group.startRow),
            renderRowSpan:span,
            renderValues:recordValues,
          });
        }
        offset += span;
      });
    }

    // Compact non-repeat rows grow one micro-row per visual line.
    for (const cell of renderCells) {
      if ((cell.renderRowSpan || 1) !== 1) continue;
      if (groupForCell(cell)) continue;
      if (!Array.isArray(cell.tokens) || !cell.tokens.some((token) => COMPACT_TOKENS.has(token))) continue;

      const display = tokenValue(cell.text, cell.renderValues);
      const widthCssPx = cellWidthPx(cell, bounds, columnMap) * colScaleMm * PX_PER_MM;
      const visualLines = measureWrappedLines(display, widthCssPx);
      const rowIndex = cell.renderRow - 1;
      if (rowIndex >= 0 && rowIndex < expandedRowsPx.length) {
        const base = expandedRowsPx[rowIndex];
        expandedRowsPx[rowIndex] = Math.max(base, base * visualLines);
      }
    }

    const totalHeightMm = expandedRowsPx.reduce((sum, value) => sum + value, 0) * rowScaleMm;

    return {
      bounds,
      columns:columnsPx.map((value) => `${value * colScaleMm}mm`).join(' '),
      rows:expandedRowsPx.map((value) => `${value * rowScaleMm}mm`).join(' '),
      totalHeightMm,
      renderCells,
    };
  }, [model, values, effectiveRepeatData]);

  if (!layout) {
    return <div className="empty"><h3>لا يوجد مخطط Excel مقروء لهذا النموذج</h3><p>أعد رفع ملف العائلة بعد حفظه من Excel.</p></div>;
  }

  const { bounds, columns, rows, totalHeightMm, renderCells } = layout;

  const visibleOverlays = (overlays || [])
    .filter((overlay) => overlay.modelSheet === model?.name)
    .filter((overlay) => {
      if (!overlay.showToggle) return true;
      const explicit = toggles?.[overlay.showToggle];
      if (explicit !== undefined && explicit !== null) return Boolean(explicit);
      const rule = (visibility || []).find((item) => item.toggle === overlay.showToggle);
      return rule ? Boolean(rule.defaultValue) : false;
    });

  function overlayAnchor(overlay) {
    return renderCells.find((cell) => Array.isArray(cell.tokens) && cell.tokens.includes(overlay.anchorToken)) || null;
  }

  function columnOffsetMm(col) {
    const columnMap = new Map((model.columns || []).map((item) => [item.col, item]));
    let px = 0;
    for (let current = bounds.startCol; current < col; current += 1) px += pxWidth(columnMap.get(current));
    const totalPx = Array.from({length:bounds.endCol - bounds.startCol + 1}, (_, index) =>
      pxWidth(columnMap.get(bounds.startCol + index))
    ).reduce((sum, value) => sum + value, 0) || 1;
    return px * (A4_WIDTH_MM / totalPx);
  }

  function rowOffsetMm(renderRow) {
    const parts = String(rows || '').split(' ').filter(Boolean).map((value) => Number(String(value).replace('mm','')) || 0);
    return parts.slice(0, Math.max(0, renderRow - 1)).reduce((sum, value) => sum + value, 0);
  }

  function beginOverlayDrag(event, overlay) {
    if (!editableOverlays || overlay.movable === false) return;
    event.preventDefault();
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const current = overlayPositions?.[overlay.id] || {};
    const baseX = Number(current.xMm ?? overlay.offsetXmm ?? 0);
    const baseY = Number(current.yMm ?? overlay.offsetYmm ?? 0);
    const target = event.currentTarget;
    target.setPointerCapture?.(pointerId);

    const move = (moveEvent) => {
      onOverlayMove?.(overlay.id, {
        xMm:Math.round((baseX + (moveEvent.clientX - startX) / PX_PER_MM) * 10) / 10,
        yMm:Math.round((baseY + (moveEvent.clientY - startY) / PX_PER_MM) * 10) / 10,
      }, false);
    };
    const up = (upEvent) => {
      target.releasePointerCapture?.(pointerId);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      onOverlayMove?.(overlay.id, {
        xMm:Math.round((baseX + (upEvent.clientX - startX) / PX_PER_MM) * 10) / 10,
        yMm:Math.round((baseY + (upEvent.clientY - startY) / PX_PER_MM) * 10) / 10,
      }, true);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  }

  return <div style={{
    overflow:printMode ? 'visible' : 'auto',
    padding:printMode ? 0 : 12,
    background:printMode ? '#fff' : 'var(--paper,#fff)',
  }}>
    <div style={{
      display:'grid',
      gridTemplateColumns:columns,
      gridTemplateRows:rows,
      width:`${A4_WIDTH_MM}mm`,
      minHeight:`${A4_HEIGHT_MM}mm`,
      height:`${Math.max(A4_HEIGHT_MM, totalHeightMm)}mm`,
      position:'relative',
      direction:'ltr',
      background:'#fff',
      border:printMode ? 'none' : '1px solid var(--hair)',
      boxShadow:printMode ? 'none' : '0 8px 24px rgba(0,0,0,.08)',
      boxSizing:'border-box',
      overflow:'visible',
    }}>
      {renderCells.map((cell) => {
        const startCol = Math.max(cell.col, bounds.startCol);
        const endCol = Math.min(cell.col + (cell.colSpan || 1) - 1, bounds.endCol);
        const dynamic = Array.isArray(cell.tokens) && cell.tokens.length > 0;
        const numeric = isNumericCell(cell);
        const text = tokenValue(cell.text, cell.renderValues);

        return <div key={cell.renderKey} title={cell.address} style={{
          gridColumn:`${startCol - bounds.startCol + 1} / span ${Math.max(1, endCol - startCol + 1)}`,
          gridRow:`${cell.renderRow} / span ${Math.max(1, cell.renderRowSpan || 1)}`,
          border:dynamic ? '1px solid #8fbad9' : '1px solid rgba(205,186,186,.55)',
          background:dynamic ? 'rgba(221,235,247,.82)' : '#fff',
          color:dynamic ? '#17365D' : '#2E2E30',
          fontSize:numeric ? '10px' : '11px',
          fontWeight:dynamic ? 650 : 500,
          fontVariantNumeric:numeric ? 'tabular-nums' : undefined,
          display:'flex',
          alignItems:'center',
          justifyContent:'center',
          padding:numeric ? '1px 2px' : '2px 5px',
          minWidth:0,
          minHeight:0,
          overflow:'hidden',
          whiteSpace:numeric ? 'nowrap' : 'pre-wrap',
          overflowWrap:numeric ? 'normal' : 'break-word',
          wordBreak:numeric ? 'keep-all' : 'normal',
          textAlign:'center',
          direction:numeric ? 'ltr' : (/[؀-ۿ]/.test(text) ? 'rtl' : 'ltr'),
          lineHeight:1.2,
          boxSizing:'border-box',
        }}>
          {text}
        </div>;
      })}

      {visibleOverlays.map((overlay) => {
        const anchorCell = overlayAnchor(overlay);
        if (!anchorCell) return null;

        const savedPosition = overlayPositions?.[overlay.id] || {};
        const xMm = Number(savedPosition.xMm ?? overlay.offsetXmm ?? 0);
        const yMm = Number(savedPosition.yMm ?? overlay.offsetYmm ?? 0);
        const src = overlayImages?.[overlay.variableCode] || overlayImages?.[overlay.id] || '';

        const leftMm = columnOffsetMm(anchorCell.col) + xMm;
        const topMm = rowOffsetMm(anchorCell.renderRow) + yMm;

        return <div
          key={`overlay::${overlay.id}`}
          onPointerDown={(event) => beginOverlayDrag(event, overlay)}
          title={editableOverlays ? 'اسحب لتحريك الطبقة' : overlay.id}
          style={{
            position:'absolute',
            left:`${leftMm}mm`,
            top:`${topMm}mm`,
            width:`${Math.max(1, Number(overlay.widthMm || 20))}mm`,
            height:`${Math.max(1, Number(overlay.heightMm || 20))}mm`,
            zIndex:Number(overlay.zIndex || 20),
            cursor:editableOverlays ? 'move' : 'default',
            touchAction:'none',
            pointerEvents:editableOverlays ? 'auto' : 'none',
            display:'flex',
            alignItems:'center',
            justifyContent:'center',
          }}
        >
          {src
            ? <img src={src} alt="" style={{width:'100%',height:'100%',objectFit:'contain',display:'block'}} />
            : <div style={{
                width:'100%',height:'100%',
                border:'1px dashed #7A1832',
                color:'#7A1832',
                background:'rgba(255,255,255,.6)',
                fontSize:'10px',
                display:'flex',
                alignItems:'center',
                justifyContent:'center',
              }}>{overlay.id === 'stamp' ? 'الختم' : overlay.id === 'signature' ? 'التوقيع' : overlay.id}</div>}
        </div>;
      })}
    </div>
  </div>;
}
