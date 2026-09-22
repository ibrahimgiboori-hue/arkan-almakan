'use client';

import { useMemo } from 'react';

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PX_PER_MM = 96 / 25.4;
const DEFAULT_PAGE_BOUNDS = Object.freeze({ startRow:3, endRow:61, startCol:2, endCol:41 });
const CONTENT_START_ROW = 10;
const CONTENT_END_ROW = 57;
const FOOTER_START_ROW = 58;
const BASE_SIDE_MARGIN_UNITS = 3;
const SIDE_MARGIN_UNITS = Object.freeze({ small:2, medium:3, large:4 });

const NUMERIC_TOKENS = new Set([
  'item_no','qty','unit_price','line_total',
  'subtotal','vat_amount','grand_total','plain_total',
]);

const NO_WRAP_TOKENS = new Set([
  ...NUMERIC_TOKENS,
  'quote_no','bank_account_no','bank_iban',
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
    minWrappedSpan:4,
    renderedLineHeightPx:13.2,
    verticalPaddingPx:6,
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

function cellWidthPx(cell, bounds, columnsPx) {
  const start = Math.max(cell.col, bounds.startCol);
  const end = Math.min(cell.col + (cell.colSpan || 1) - 1, bounds.endCol);
  let width = 0;
  for (let col = start; col <= end; col += 1) {
    width += Number(columnsPx[col - bounds.startCol] || 0);
  }
  return width;
}

function groupForCell(cell) {
  const tokens = Array.isArray(cell?.tokens) ? cell.tokens : [];
  return REPEAT_GROUPS.find((group) => tokens.some((token) => group.tokens.has(token))) || null;
}

function isNumericCell(cell) {
  return Array.isArray(cell?.tokens) && cell.tokens.some((token) => NUMERIC_TOKENS.has(token));
}

function isNoWrapCell(cell) {
  return Array.isArray(cell?.tokens) && cell.tokens.some((token) => NO_WRAP_TOKENS.has(token));
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
  stationeryImages = {},
  whiteVeilOpacity = 0.82,
  headerHeightMm = 0,
  footerHeightMm = 0,
  sideMarginPreset = 'small',
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

    const rawColumnsPx = [];
    for (let col = bounds.startCol; col <= bounds.endCol; col += 1) {
      rawColumnsPx.push(pxWidth(columnMap.get(col)));
    }

    // The workbook was authored with three micro-cells of side protection.
    // Margin presets keep the Excel geometry but compress/expand only those guard
    // tracks: small=2, medium=3, large=4. Content proportions stay unchanged.
    const sideUnits = SIDE_MARGIN_UNITS[sideMarginPreset] || SIDE_MARGIN_UNITS.small;
    const guardFactor = sideUnits / BASE_SIDE_MARGIN_UNITS;
    const columnsPx = rawColumnsPx.map((value, index) => {
      const leftGuard = index < BASE_SIDE_MARGIN_UNITS;
      const rightGuard = index >= rawColumnsPx.length - BASE_SIDE_MARGIN_UNITS;
      return (leftGuard || rightGuard) ? value * guardFactor : value;
    });

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
      const widthCssPx = cellWidthPx(wrapCell, bounds, columnsPx) * colScaleMm * PX_PER_MM;

      const patternHeights = [];
      for (let r = startRow; r <= endRow; r += 1) {
        patternHeights.push(pxHeight(rowMap.get(r)));
      }
      const microRowPx = patternHeights.length
        ? patternHeights.reduce((sum, value) => sum + value, 0) / patternHeights.length
        : 14.25;

      const instanceSpans = instances.map((record) => {
        const merged = record ? { ...values, ...record } : values;
        const display = tokenValue(wrapCell.text, merged);
        const visualLines = measureWrappedLines(display, widthCssPx);

        if (definition.id === 'line_items') {
          // One unwrapped line keeps the workbook's normal two-micro-row height.
          // Once text wraps, honor the agreed minimum of four micro-rows, but do
          // NOT multiply every visual line by two. Instead fit the actual rendered
          // text into the minimum whole number of micro-rows. This removes the
          // large dead space seen with long descriptions.
          if (visualLines <= 1) return baseSpan;
          const requiredPx =
            visualLines * Number(definition.renderedLineHeightPx || 13.2)
            + Number(definition.verticalPaddingPx || 6);
          const fittedSpan = Math.ceil(requiredPx / Math.max(1, microRowPx));
          return Math.max(baseSpan, Number(definition.minWrappedSpan || 4), fittedSpan);
        }

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
      if (isNoWrapCell(cell)) continue;
      const widthCssPx = cellWidthPx(cell, bounds, columnsPx) * colScaleMm * PX_PER_MM;
      const visualLines = measureWrappedLines(display, widthCssPx);
      const rowIndex = cell.renderRow - 1;
      if (rowIndex >= 0 && rowIndex < expandedRowsPx.length) {
        const base = expandedRowsPx[rowIndex];
        expandedRowsPx[rowIndex] = Math.max(base, base * visualLines);
      }
    }

    const totalHeightMm = expandedRowsPx.reduce((sum, value) => sum + value, 0) * rowScaleMm;

    const totalExtraRows = groups.reduce((sum, group) => sum + group.extraRows, 0);
    return {
      bounds,
      columns:columnsPx.map((value) => `${value * colScaleMm}mm`).join(' '),
      rows:expandedRowsPx.map((value) => `${value * rowScaleMm}mm`).join(' '),
      rowSizesMm:expandedRowsPx.map((value) => value * rowScaleMm),
      baseRowSizesMm:baseRowsPx.map((value) => value * rowScaleMm),
      totalHeightMm,
      totalExtraRows,
      renderCells,
    };
  }, [model, values, effectiveRepeatData, sideMarginPreset]);

  if (!layout) {
    return <div className="empty"><h3>لا يوجد مخطط Excel مقروء لهذا النموذج</h3><p>أعد رفع ملف العائلة بعد حفظه من Excel.</p></div>;
  }

  const {
    bounds,
    columns,
    rowSizesMm,
    baseRowSizesMm,
    totalExtraRows,
    renderCells,
  } = layout;

  const visibleOverlays = (overlays || [])
    .filter((overlay) => overlay.modelSheet === model?.name)
    .filter((overlay) => {
      if (!overlay.showToggle) return true;
      const explicit = toggles?.[overlay.showToggle];
      if (explicit !== undefined && explicit !== null) return Boolean(explicit);
      const rule = (visibility || []).find((item) => item.toggle === overlay.showToggle);
      return rule ? Boolean(rule.defaultValue) : false;
    });

  const headerTrackCount = Math.max(0, CONTENT_START_ROW - bounds.startRow);
  const footerBaseTrackIndex = Math.max(headerTrackCount, FOOTER_START_ROW - bounds.startRow);
  const footerTrackIndex = Math.min(
    rowSizesMm.length,
    footerBaseTrackIndex + Math.max(0, Number(totalExtraRows || 0)),
  );

  const contentTopMm = baseRowSizesMm
    .slice(0, headerTrackCount)
    .reduce((sum, value) => sum + value, 0);
  const contentHeightMm = baseRowSizesMm
    .slice(headerTrackCount, footerBaseTrackIndex)
    .reduce((sum, value) => sum + value, 0);
  const flowRowSizesMm = rowSizesMm.slice(headerTrackCount, footerTrackIndex);

  const flowCells = renderCells.filter((cell) =>
    cell.row >= CONTENT_START_ROW && cell.row <= CONTENT_END_ROW
  );

  // A page break is not allowed inside a merged/logical element. This is what
  // prevents a table row, section title, totals row or footer row from being cut
  // by the physical footer. Oversized elements are the only exception.
  const forbiddenBreaks = new Set();
  for (const cell of flowCells) {
    const startRow = (cell.renderRow - 1) - headerTrackCount;
    const span = Math.max(1, Number(cell.renderRowSpan || 1));
    for (let boundary = startRow + 1; boundary < startRow + span; boundary += 1) {
      if (boundary > 0 && boundary < flowRowSizesMm.length) forbiddenBreaks.add(boundary);
    }
  }

  // The final acceptance / representative / bank block is one logical footer
  // element. It may move to the next page as a whole, but it must never be split
  // row-by-row across several pages.
  const footerTokens = new Set([
    'representative_name','representative_title',
    'bank_name','bank_account_no','bank_iban',
  ]);
  const footerGroupCells = flowCells.filter((cell) => {
    const tokens = Array.isArray(cell.tokens) ? cell.tokens : [];
    const text = String(cell.text || '');
    return tokens.some((token) => footerTokens.has(token))
      || /قبول العميل|ممثل أركان المكان|تفاصيل الحساب البنكي|الاسم:|التوقيع:|التاريخ:/.test(text);
  });
  if (footerGroupCells.length) {
    const footerStart = Math.min(...footerGroupCells.map(
      (cell) => (cell.renderRow - 1) - headerTrackCount
    ));
    const footerEnd = Math.max(...footerGroupCells.map(
      (cell) => (cell.renderRow - 1) - headerTrackCount + Math.max(1, Number(cell.renderRowSpan || 1))
    ));
    for (let boundary = footerStart + 1; boundary < footerEnd; boundary += 1) {
      if (boundary > 0 && boundary < flowRowSizesMm.length) forbiddenBreaks.add(boundary);
    }
  }

  // Section-start orphan rule:
  // A titled flow section may split across pages, but it must not START at the
  // bottom of a page if the page can hold only the title plus three micro-rows
  // of real section data. In that case the whole section start moves to the
  // next page. A split is allowed only after at least four data micro-rows have
  // appeared under the title.
  const sectionStartGuards = [
    { token:'payment_terms', title:/^شروط الدفع$/, minDataRows:4 },
    { token:'terms', title:/^الشروط والأحكام العامة$/, minDataRows:4 },
  ];

  for (const rule of sectionStartGuards) {
    const titleCell = flowCells.find((cell) => rule.title.test(String(cell.text || '').trim()));
    const dataCells = flowCells.filter((cell) =>
      Array.isArray(cell.tokens) && cell.tokens.includes(rule.token)
    );
    if (!titleCell || !dataCells.length) continue;

    const titleStart = (titleCell.renderRow - 1) - headerTrackCount;
    const dataStart = Math.min(...dataCells.map(
      (cell) => (cell.renderRow - 1) - headerTrackCount
    ));
    const sectionEnd = Math.max(...dataCells.map(
      (cell) => (cell.renderRow - 1) - headerTrackCount + Math.max(1, Number(cell.renderRowSpan || 1))
    ));

    const lastProtectedBoundary = Math.min(
      sectionEnd - 1,
      dataStart + Math.max(1, Number(rule.minDataRows || 4)) - 1,
    );

    for (let boundary = titleStart + 1; boundary <= lastProtectedBoundary; boundary += 1) {
      if (boundary > 0 && boundary < flowRowSizesMm.length) forbiddenBreaks.add(boundary);
    }
  }

  const pages = [];
  let pageStart = 0;
  const capacity = Math.max(1, contentHeightMm);

  while (pageStart < flowRowSizesMm.length) {
    let cursor = pageStart;
    let used = 0;

    while (
      cursor < flowRowSizesMm.length
      && used + flowRowSizesMm[cursor] <= capacity + 0.01
    ) {
      used += flowRowSizesMm[cursor];
      cursor += 1;
    }

    if (cursor >= flowRowSizesMm.length) {
      pages.push({ start:pageStart, end:flowRowSizesMm.length });
      break;
    }

    let pageEnd = cursor;
    while (pageEnd > pageStart && forbiddenBreaks.has(pageEnd)) pageEnd -= 1;

    if (pageEnd === pageStart) {
      // The next complete element is larger than the remaining page (or, in the
      // extreme case, larger than a full content area). Move it as one block.
      pageEnd = Math.min(flowRowSizesMm.length, pageStart + 1);
      while (pageEnd < flowRowSizesMm.length && forbiddenBreaks.has(pageEnd)) pageEnd += 1;
    }

    pages.push({ start:pageStart, end:pageEnd });
    pageStart = pageEnd;
  }

  if (!pages.length) pages.push({ start:0, end:0 });

  function columnOffsetMm(col) {
    const columnMap = new Map((model.columns || []).map((item) => [item.col, item]));
    let px = 0;
    for (let current = bounds.startCol; current < col; current += 1) px += pxWidth(columnMap.get(current));
    const totalPx = Array.from({length:bounds.endCol - bounds.startCol + 1}, (_, index) =>
      pxWidth(columnMap.get(bounds.startCol + index))
    ).reduce((sum, value) => sum + value, 0) || 1;
    return px * (A4_WIDTH_MM / totalPx);
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

  function renderStationery() {
    if (!stationeryImages?.letterhead) return null;
    return <img
      src={stationeryImages.letterhead}
      alt=""
      style={{
        position:'absolute',inset:0,width:'100%',height:'100%',
        objectFit:'fill',zIndex:0,pointerEvents:'none',
      }}
    />;
  }

  return <div style={{
    overflow:printMode ? 'visible' : 'auto',
    padding:printMode ? 0 : 12,
    background:printMode ? '#ececec' : 'var(--paper,#fff)',
  }}>
    {pages.map((page, pageIndex) => {
      const pageRows = flowRowSizesMm.slice(page.start, page.end);
      const pageCells = flowCells.filter((cell) => {
        const cellStart = (cell.renderRow - 1) - headerTrackCount;
        const cellEnd = cellStart + Math.max(1, Number(cell.renderRowSpan || 1));
        return cellStart >= page.start && cellEnd <= page.end;
      });

      const pageOverlays = visibleOverlays.map((overlay) => {
        const anchorCell = flowCells.find((cell) =>
          Array.isArray(cell.tokens) && cell.tokens.includes(overlay.anchorToken)
        );
        if (!anchorCell) return null;
        const anchorStart = (anchorCell.renderRow - 1) - headerTrackCount;
        if (anchorStart < page.start || anchorStart >= page.end) return null;
        return { overlay, anchorCell, anchorStart };
      }).filter(Boolean);

      return <div
        key={`page-${pageIndex}`}
        className="workbook-page"
        style={{
          position:'relative',
          width:`${A4_WIDTH_MM}mm`,
          height:`${A4_HEIGHT_MM}mm`,
          margin:'0 auto 8mm',
          background:'#fff',
          overflow:'hidden',
          boxSizing:'border-box',
          border:printMode ? 'none' : '1px solid var(--hair)',
          boxShadow:printMode ? '0 6px 28px rgba(0,0,0,.18)' : '0 8px 24px rgba(0,0,0,.08)',
          WebkitPrintColorAdjust:'exact',
          printColorAdjust:'exact',
        }}
      >
        {renderStationery()}

        <div
          aria-hidden="true"
          style={{
            position:'absolute',
            left:0,
            top:`${contentTopMm}mm`,
            width:'100%',
            height:`${contentHeightMm}mm`,
            background:`rgba(255,255,255,${Math.min(1, Math.max(0, Number(whiteVeilOpacity ?? 0.82)))})`,
            zIndex:10,
            pointerEvents:'none',
          }}
        />

        <div style={{
          position:'absolute',
          left:0,
          top:`${contentTopMm}mm`,
          width:`${A4_WIDTH_MM}mm`,
          display:'grid',
          gridTemplateColumns:columns,
          gridTemplateRows:pageRows.map((value) => `${value}mm`).join(' '),
          direction:'ltr',
          zIndex:20,
          boxSizing:'border-box',
        }}>
          {pageCells.map((cell) => {
            const startCol = Math.max(cell.col, bounds.startCol);
            const endCol = Math.min(cell.col + (cell.colSpan || 1) - 1, bounds.endCol);
            const cellStart = (cell.renderRow - 1) - headerTrackCount;
            const dynamic = Array.isArray(cell.tokens) && cell.tokens.length > 0;
            const numeric = isNumericCell(cell);
            const noWrap = isNoWrapCell(cell);
            const text = tokenValue(cell.text, cell.renderValues);

            return <div key={cell.renderKey} title={cell.address} style={{
              gridColumn:`${startCol - bounds.startCol + 1} / span ${Math.max(1, endCol - startCol + 1)}`,
              gridRow:`${cellStart - page.start + 1} / span ${Math.max(1, cell.renderRowSpan || 1)}`,
              border:dynamic ? '1px solid #8fbad9' : '1px solid rgba(205,186,186,.55)',
              background:dynamic ? 'rgba(221,235,247,.82)' : 'transparent',
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
              whiteSpace:noWrap ? 'nowrap' : 'pre-wrap',
              overflowWrap:noWrap ? 'normal' : 'break-word',
              wordBreak:noWrap ? 'keep-all' : 'normal',
              textAlign:'center',
              direction:noWrap ? 'ltr' : (/[؀-ۿ]/.test(text) ? 'rtl' : 'ltr'),
              lineHeight:1.2,
              boxSizing:'border-box',
            }}>
              {text}
            </div>;
          })}
        </div>

        {pageOverlays.map(({overlay, anchorCell, anchorStart}) => {
          const savedPosition = overlayPositions?.[overlay.id] || {};
          const xMm = Number(savedPosition.xMm ?? overlay.offsetXmm ?? 0);
          const yMm = Number(savedPosition.yMm ?? overlay.offsetYmm ?? 0);
          const src = overlayImages?.[overlay.variableCode] || overlayImages?.[overlay.id] || '';
          const leftMm = columnOffsetMm(anchorCell.col) + xMm;
          const topInPageContent = flowRowSizesMm
            .slice(page.start, anchorStart)
            .reduce((sum, value) => sum + value, 0);

          return <div
            key={`overlay::${overlay.id}::${pageIndex}`}
            onPointerDown={(event) => beginOverlayDrag(event, overlay)}
            title={editableOverlays ? 'اسحب لتحريك الطبقة' : overlay.id}
            style={{
              position:'absolute',
              left:`${leftMm}mm`,
              top:`${contentTopMm + topInPageContent + yMm}mm`,
              width:`${Math.max(1, Number(overlay.widthMm || 20))}mm`,
              height:`${Math.max(1, Number(overlay.heightMm || 20))}mm`,
              zIndex:Math.max(30, Number(overlay.zIndex || 30)),
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
      </div>;
    })}
  </div>;
}
