'use client';

import { useMemo } from 'react';

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PX_PER_MM = 96 / 25.4;
const DEFAULT_PAGE_BOUNDS = Object.freeze({ startRow:3, endRow:61, startCol:2, endCol:41 });
const COMPACT_TOKENS = new Set([
  'payment_terms','terms','closing_text',
  'representative_name','representative_title',
  'bank_name','bank_account_no','bank_iban',
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
  return String(text || '').replace(/\{\{([a-z][a-z0-9_]*)\}\}/g, (_match, code) => {
    const value = values?.[code];
    if (value == null || value === '') return '';
    return String(value);
  });
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

export default function WorkbookModelPreview({ model, values = {}, printMode = false }) {
  const layout = useMemo(() => {
    if (!model?.cells?.length) return null;

    const bounds = boundsOf(model);
    const columnMap = new Map((model.columns || []).map((item) => [item.col, item]));
    const rowMap = new Map((model.rows || []).map((item) => [item.row, item]));

    const columnsPx = [];
    for (let col = bounds.startCol; col <= bounds.endCol; col += 1) {
      columnsPx.push(pxWidth(columnMap.get(col)));
    }
    const rowsPx = [];
    for (let row = bounds.startRow; row <= bounds.endRow; row += 1) {
      rowsPx.push(pxHeight(rowMap.get(row)));
    }

    const baseWidthPx = columnsPx.reduce((sum, value) => sum + value, 0) || 1;
    const baseHeightPx = rowsPx.reduce((sum, value) => sum + value, 0) || 1;
    const colScaleMm = A4_WIDTH_MM / baseWidthPx;
    const rowScaleMm = A4_HEIGHT_MM / baseHeightPx;

    const visibleCells = model.cells.filter((cell) => {
      const endRow = cell.row + (cell.rowSpan || 1) - 1;
      const endCol = cell.col + (cell.colSpan || 1) - 1;
      return endRow >= bounds.startRow && cell.row <= bounds.endRow
        && endCol >= bounds.startCol && cell.col <= bounds.endCol;
    });

    // Compact exception rows grow one micro-row per visual line. The changed row
    // height automatically pushes every grid item below it while preserving all
    // other workbook gaps.
    for (const cell of visibleCells) {
      if ((cell.rowSpan || 1) !== 1) continue;
      if (!Array.isArray(cell.tokens) || !cell.tokens.some((token) => COMPACT_TOKENS.has(token))) continue;

      const localCol = Math.max(cell.col, bounds.startCol);
      const localEndCol = Math.min(cell.col + (cell.colSpan || 1) - 1, bounds.endCol);
      let cellWidthPx = 0;
      for (let col = localCol; col <= localEndCol; col += 1) {
        cellWidthPx += pxWidth(columnMap.get(col));
      }
      const display = tokenValue(cell.text, values);
      const widthCssPx = cellWidthPx * colScaleMm * PX_PER_MM;
      const visualLines = measureWrappedLines(display, widthCssPx);
      const rowIndex = cell.row - bounds.startRow;
      if (rowIndex >= 0 && rowIndex < rowsPx.length) {
        const base = pxHeight(rowMap.get(cell.row));
        rowsPx[rowIndex] = Math.max(rowsPx[rowIndex], base * visualLines);
      }
    }

    const totalHeightMm = rowsPx.reduce((sum, value) => sum + value, 0) * rowScaleMm;

    return {
      bounds,
      columns:columnsPx.map((value) => `${value * colScaleMm}mm`).join(' '),
      rows:rowsPx.map((value) => `${value * rowScaleMm}mm`).join(' '),
      totalHeightMm,
      visibleCells,
    };
  }, [model, values]);

  if (!layout) {
    return <div className="empty"><h3>لا يوجد مخطط Excel مقروء لهذا النموذج</h3><p>أعد رفع ملف العائلة بعد حفظه من Excel.</p></div>;
  }

  const { bounds, columns, rows, totalHeightMm, visibleCells } = layout;

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
      {visibleCells.map((cell) => {
        const startCol = Math.max(cell.col, bounds.startCol);
        const endCol = Math.min(cell.col + (cell.colSpan || 1) - 1, bounds.endCol);
        const startRow = Math.max(cell.row, bounds.startRow);
        const endRow = Math.min(cell.row + (cell.rowSpan || 1) - 1, bounds.endRow);
        const dynamic = Array.isArray(cell.tokens) && cell.tokens.length > 0;
        const numeric = isNumericCell(cell);
        const text = tokenValue(cell.text, values);

        return <div key={cell.address} title={cell.address} style={{
          gridColumn:`${startCol - bounds.startCol + 1} / span ${Math.max(1, endCol - startCol + 1)}`,
          gridRow:`${startRow - bounds.startRow + 1} / span ${Math.max(1, endRow - startRow + 1)}`,
          border:dynamic ? '1px solid #8fbad9' : '1px solid rgba(205,186,186,.55)',
          background:dynamic ? 'rgba(221,235,247,.82)' : '#fff',
          color:dynamic ? '#17365D' : '#2E2E30',
          fontSize:'11px',
          fontWeight:dynamic ? 650 : 500,
          display:'flex',
          alignItems:'center',
          justifyContent:'center',
          padding:'2px 5px',
          minWidth:0,
          minHeight:0,
          overflow:'hidden',
          whiteSpace:'pre-wrap',
          overflowWrap:'anywhere',
          textAlign:'center',
          direction:/[\u0600-\u06FF]/.test(text) ? 'rtl' : 'ltr',
          lineHeight:1.25,
          boxSizing:'border-box',
        }}>
          {text}
        </div>;
      })}
    </div>
  </div>;
}
