'use client';

import { useMemo } from 'react';

const PX_PER_MM = 96 / 25.4;
const DEFAULT_PAGE_BOUNDS = Object.freeze({ startRow:3, endRow:61, startCol:2, endCol:41 });
const PORTRAIT_CONTENT_START_ROW = 10;
const PORTRAIT_CONTENT_END_ROW = 57;
const PORTRAIT_FOOTER_START_ROW = 58;
const BASE_SIDE_MARGIN_UNITS = 3;
const SIDE_MARGIN_UNITS = Object.freeze({ small:2, medium:3, large:4 });

const NUMERIC_TOKENS = new Set([
  'item_no','qty','unit_price','line_total',
  'subtotal','vat_amount','grand_total','plain_total',
  'amount_number','amount_riyal','amount_halalah',
]);

const NO_WRAP_TOKENS = new Set([
  ...NUMERIC_TOKENS,
  'quote_no','bank_account_no','bank_iban',
  'voucher_no','voucher_page_no','book_no','party_id_number',
  'voucher_date_gregorian','voucher_date_hijri',
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
  const raw = model?.pageBounds || model?.pageConfig?.pageBounds || DEFAULT_PAGE_BOUNDS;
  return {
    range:raw.range,
    startRow:Number(raw.startRow || DEFAULT_PAGE_BOUNDS.startRow),
    endRow:Number(raw.endRow || DEFAULT_PAGE_BOUNDS.endRow),
    startCol:Number(raw.startCol || DEFAULT_PAGE_BOUNDS.startCol),
    endCol:Number(raw.endCol || DEFAULT_PAGE_BOUNDS.endCol),
  };
}

function pageConfigOf(model) {
  const page = model?.pageConfig || {};
  const widthMm = Number(page.widthMm || 210);
  const heightMm = Number(page.heightMm || 297);
  return {
    ...page,
    widthMm:Number.isFinite(widthMm) && widthMm > 0 ? widthMm : 210,
    heightMm:Number.isFinite(heightMm) && heightMm > 0 ? heightMm : 297,
    contentFrameBounds:page.contentFrameBounds || null,
    mode:page.contentFrameBounds ? 'A4_CARRIER_A5_CONTENT' : 'FLOW_PAGE',
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

function isInsideBounds(cell, bounds) {
  const endRow = cell.row + (cell.rowSpan || 1) - 1;
  const endCol = cell.col + (cell.colSpan || 1) - 1;
  return endRow >= bounds.startRow && cell.row <= bounds.endRow
    && endCol >= bounds.startCol && cell.col <= bounds.endCol;
}

function isOutsideFrame(cell, frame) {
  if (!frame) return false;
  const endRow = cell.row + (cell.rowSpan || 1) - 1;
  const endCol = cell.col + (cell.colSpan || 1) - 1;
  return endRow < frame.startRow || cell.row > frame.endRow
    || endCol < frame.startCol || cell.col > frame.endCol;
}

function isGuideCell(cell, pageConfig) {
  const frame = pageConfig?.contentFrameBounds;
  if (!frame || !isOutsideFrame(cell, frame)) return false;
  const text = String(cell.text || '').trim();
  return /^\d+$/.test(text);
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
  sideMarginPreset = 'small',
  editableOverlays = false,
  onOverlayMove,
  printMode = false,
}) {
  const effectiveRepeatData = Object.keys(repeatData || {}).length ? repeatData : (repeatGroups || {});

  const layout = useMemo(() => {
    if (!model?.cells?.length) return null;
    const pageConfig = pageConfigOf(model);
    const carrierMode = pageConfig.mode === 'A4_CARRIER_A5_CONTENT';
    const bounds = boundsOf(model);
    const columnMap = new Map((model.columns || []).map((item) => [item.col, item]));
    const rowMap = new Map((model.rows || []).map((item) => [item.row, item]));

    const rawColumnsPx = [];
    for (let col = bounds.startCol; col <= bounds.endCol; col += 1) {
      rawColumnsPx.push(pxWidth(columnMap.get(col)));
    }

    const sideUnits = SIDE_MARGIN_UNITS[sideMarginPreset] || SIDE_MARGIN_UNITS.small;
    const guardFactor = sideUnits / BASE_SIDE_MARGIN_UNITS;
    const columnsPx = carrierMode
      ? rawColumnsPx
      : rawColumnsPx.map((value, index) => {
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
    const colScaleMm = pageConfig.widthMm / baseWidthPx;
    const rowScaleMm = pageConfig.heightMm / baseHeightPx;

    const sourceCells = model.cells
      .filter((cell) => isInsideBounds(cell, bounds))
      .filter((cell) => !isGuideCell(cell, pageConfig));

    const groups = carrierMode ? [] : REPEAT_GROUPS.map((definition) => {
      const cells = sourceCells.filter((cell) => groupForCell(cell)?.id === definition.id);
      if (!cells.length) return null;
      const startRow = Math.min(...cells.map((cell) => cell.row));
      const endRow = Math.max(...cells.map((cell) => cell.row + (cell.rowSpan || 1) - 1));
      const baseSpan = endRow - startRow + 1;
      const records = repeatRecords(definition.id, effectiveRepeatData);
      const instances = records.length ? records : [null];
      const wrapCell = cells.find((cell) => Array.isArray(cell.tokens) && cell.tokens.includes(definition.wrapToken)) || cells[0];
      const widthCssPx = cellWidthPx(wrapCell, bounds, columnsPx) * colScaleMm * PX_PER_MM;
      const patternHeights = [];
      for (let r = startRow; r <= endRow; r += 1) patternHeights.push(pxHeight(rowMap.get(r)));
      const microRowPx = patternHeights.length
        ? patternHeights.reduce((sum, value) => sum + value, 0) / patternHeights.length
        : 14.25;
      const instanceSpans = instances.map((record) => {
        const merged = record ? { ...values, ...record } : values;
        const display = tokenValue(wrapCell.text, merged);
        const visualLines = measureWrappedLines(display, widthCssPx);
        if (definition.id === 'line_items') {
          if (visualLines <= 1) return baseSpan;
          const requiredPx = visualLines * Number(definition.renderedLineHeightPx || 13.2)
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
        for (let r = group.startRow; r <= group.endRow; r += 1) pattern.push(pxHeight(rowMap.get(r)));
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

    if (!carrierMode) {
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
    }

    const totalHeightMm = expandedRowsPx.reduce((sum, value) => sum + value, 0) * rowScaleMm;
    const totalExtraRows = groups.reduce((sum, group) => sum + group.extraRows, 0);
    return {
      pageConfig,
      carrierMode,
      bounds,
      columns:columnsPx.map((value) => `${value * colScaleMm}mm`).join(' '),
      rows:expandedRowsPx.map((value) => `${value * rowScaleMm}mm`).join(' '),
      rowSizesMm:expandedRowsPx.map((value) => value * rowScaleMm),
      baseRowSizesMm:baseRowsPx.map((value) => value * rowScaleMm),
      totalHeightMm,
      totalExtraRows,
      renderCells,
      colScaleMm,
      rowScaleMm,
    };
  }, [model, values, effectiveRepeatData, sideMarginPreset]);

  if (!layout) {
    return <div className="empty"><h3>لا يوجد مخطط Excel مقروء لهذا النموذج</h3><p>أعد رفع ملف العائلة بعد حفظه من Excel.</p></div>;
  }

  const {
    pageConfig,
    carrierMode,
    bounds,
    columns,
    rows,
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

  const contentStartRow = carrierMode
    ? (pageConfig.contentFrameBounds?.startRow || bounds.startRow)
    : PORTRAIT_CONTENT_START_ROW;
  const contentEndRow = carrierMode
    ? (pageConfig.contentFrameBounds?.endRow || bounds.endRow)
    : PORTRAIT_CONTENT_END_ROW;
  const footerStartRow = carrierMode ? bounds.endRow + 1 : PORTRAIT_FOOTER_START_ROW;

  const headerTrackCount = Math.max(0, contentStartRow - bounds.startRow);
  const footerBaseTrackIndex = Math.max(headerTrackCount, footerStartRow - bounds.startRow);
  const footerTrackIndex = carrierMode
    ? rowSizesMm.length
    : Math.min(rowSizesMm.length, footerBaseTrackIndex + Math.max(0, Number(totalExtraRows || 0)));

  const contentTopMm = baseRowSizesMm.slice(0, headerTrackCount).reduce((sum, value) => sum + value, 0);
  const contentHeightMm = carrierMode
    ? baseRowSizesMm.slice(headerTrackCount, footerBaseTrackIndex).reduce((sum, value) => sum + value, 0)
    : baseRowSizesMm.slice(headerTrackCount, footerBaseTrackIndex).reduce((sum, value) => sum + value, 0);
  const flowRowSizesMm = rowSizesMm.slice(headerTrackCount, footerTrackIndex);

  const flowCells = renderCells.filter((cell) => cell.row >= contentStartRow && cell.row <= contentEndRow);

  function buildPages() {
    if (carrierMode) return [{ start:0, end:flowRowSizesMm.length }];
    const forbiddenBreaks = new Set();
    for (const cell of flowCells) {
      const startRow = (cell.renderRow - 1) - headerTrackCount;
      const span = Math.max(1, Number(cell.renderRowSpan || 1));
      for (let boundary = startRow + 1; boundary < startRow + span; boundary += 1) {
        if (boundary > 0 && boundary < flowRowSizesMm.length) forbiddenBreaks.add(boundary);
      }
    }

    const footerTokens = new Set(['representative_name','representative_title','bank_name','bank_account_no','bank_iban']);
    const footerGroupCells = flowCells.filter((cell) => {
      const tokens = Array.isArray(cell.tokens) ? cell.tokens : [];
      const text = String(cell.text || '');
      return tokens.some((token) => footerTokens.has(token))
        || /قبول العميل|ممثل أركان المكان|تفاصيل الحساب البنكي|الاسم:|التوقيع:|التاريخ:/.test(text);
    });
    if (footerGroupCells.length) {
      const footerStart = Math.min(...footerGroupCells.map((cell) => (cell.renderRow - 1) - headerTrackCount));
      const footerEnd = Math.max(...footerGroupCells.map(
        (cell) => (cell.renderRow - 1) - headerTrackCount + Math.max(1, Number(cell.renderRowSpan || 1))
      ));
      for (let boundary = footerStart + 1; boundary < footerEnd; boundary += 1) {
        if (boundary > 0 && boundary < flowRowSizesMm.length) forbiddenBreaks.add(boundary);
      }
    }

    const sectionStartGuards = [
      { token:'payment_terms', title:/^شروط الدفع$/, minDataRows:4 },
      { token:'terms', title:/^الشروط والأحكام العامة$/, minDataRows:4 },
    ];
    for (const rule of sectionStartGuards) {
      const titleCell = flowCells.find((cell) => rule.title.test(String(cell.text || '').trim()));
      const dataCells = flowCells.filter((cell) => Array.isArray(cell.tokens) && cell.tokens.includes(rule.token));
      if (!titleCell || !dataCells.length) continue;
      const titleStart = (titleCell.renderRow - 1) - headerTrackCount;
      const dataStart = Math.min(...dataCells.map((cell) => (cell.renderRow - 1) - headerTrackCount));
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
      while (cursor < flowRowSizesMm.length && used + flowRowSizesMm[cursor] <= capacity + 0.01) {
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
        pageEnd = Math.min(flowRowSizesMm.length, pageStart + 1);
        while (pageEnd < flowRowSizesMm.length && forbiddenBreaks.has(pageEnd)) pageEnd += 1;
      }
      pages.push({ start:pageStart, end:pageEnd });
      pageStart = pageEnd;
    }
    return pages.length ? pages : [{ start:0, end:0 }];
  }

  const pages = buildPages();

  function columnOffsetMm(col) {
    const columnMap = new Map((model.columns || []).map((item) => [item.col, item]));
    const rawColumnsPx = [];
    for (let current = bounds.startCol; current <= bounds.endCol; current += 1) rawColumnsPx.push(pxWidth(columnMap.get(current)));
    const columnsPx = carrierMode ? rawColumnsPx : rawColumnsPx.map((value, index) => {
      const leftGuard = index < BASE_SIDE_MARGIN_UNITS;
      const rightGuard = index >= rawColumnsPx.length - BASE_SIDE_MARGIN_UNITS;
      const sideUnits = SIDE_MARGIN_UNITS[sideMarginPreset] || SIDE_MARGIN_UNITS.small;
      const guardFactor = sideUnits / BASE_SIDE_MARGIN_UNITS;
      return (leftGuard || rightGuard) ? value * guardFactor : value;
    });
    let px = 0;
    for (let current = bounds.startCol; current < col; current += 1) px += columnsPx[current - bounds.startCol] || 0;
    const totalPx = columnsPx.reduce((sum, value) => sum + value, 0) || 1;
    return px * (pageConfig.widthMm / totalPx);
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
    if (carrierMode || pageConfig.noStationery || !stationeryImages?.letterhead) return null;
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
    display:'flex',
    flexDirection:'column',
    gap:carrierMode ? '8mm' : '10mm',
    alignItems:'center',
  }}>
    {pages.map((page, pageIndex) => {
      const pageOffsetRows = carrierMode ? 0 : page.start;
      const pageRows = carrierMode
        ? rows
        : [
          ...baseRowSizesMm.slice(0, headerTrackCount),
          ...flowRowSizesMm.slice(page.start, page.end),
          ...baseRowSizesMm.slice(footerBaseTrackIndex),
        ].map((value) => `${value}mm`).join(' ');

      const pageCells = carrierMode ? renderCells : renderCells.filter((cell) => {
        const flowIndex = (cell.renderRow - 1) - headerTrackCount;
        const isHeader = cell.row < contentStartRow;
        const isFooter = cell.row >= footerStartRow;
        return isHeader || isFooter || (flowIndex >= page.start && flowIndex < page.end);
      });

      return <div
        key={`page-${pageIndex}`}
        className="workbook-preview-page"
        style={{
          position:'relative',
          width:`${pageConfig.widthMm}mm`,
          minHeight:`${pageConfig.heightMm}mm`,
          background:'#fff',
          boxSizing:'border-box',
          overflow:'hidden',
          breakAfter:'page',
          boxShadow:printMode ? 'none' : '0 10px 22px rgba(15,23,42,.12)',
        }}
      >
        {renderStationery()}
        {!carrierMode ? <div
          aria-hidden="true"
          style={{
            position:'absolute',
            left:0,
            top:`${contentTopMm}mm`,
            width:'100%',
            height:`${contentHeightMm}mm`,
            background:`rgba(255,255,255,${Math.max(0, Math.min(1, Number(whiteVeilOpacity ?? 0.82)))})`,
            zIndex:2,
            pointerEvents:'none',
          }}
        /> : null}

        <div style={{
          position:'relative',
          display:'grid',
          gridTemplateColumns:columns,
          gridTemplateRows:pageRows,
          width:'100%',
          minHeight:'100%',
          zIndex:10,
        }}>
          {pageCells.map((cell) => {
            const isHeader = !carrierMode && cell.row < contentStartRow;
            const isFooter = !carrierMode && cell.row >= footerStartRow;
            const localRow = carrierMode
              ? cell.renderRow
              : isHeader
                ? cell.renderRow
                : isFooter
                  ? headerTrackCount + (page.end - page.start) + (cell.row - footerStartRow) + 1
                  : cell.renderRow - headerTrackCount - pageOffsetRows + headerTrackCount;
            const numeric = isNumericCell(cell);
            const noWrap = isNoWrapCell(cell);
            const text = tokenValue(cell.text, cell.renderValues);
            const dynamic = Array.isArray(cell.tokens) && cell.tokens.length > 0;
            return <div
              key={`${pageIndex}-${cell.renderKey}`}
              style={{
                gridColumn:`${cell.col - bounds.startCol + 1} / span ${cell.colSpan || 1}`,
                gridRow:`${localRow} / span ${Math.max(1, Number(cell.renderRowSpan || 1))}`,
                border:printMode ? '1px solid rgba(160,120,120,.28)' : '1px solid rgba(71,85,105,.18)',
                background:printMode ? 'transparent' : (dynamic ? 'rgba(219,234,254,.72)' : 'rgba(255,255,255,.82)'),
                color:'#111827',
                padding:'2px 4px',
                fontSize:numeric ? '10px' : '11px',
                fontWeight:numeric ? 700 : 500,
                lineHeight:1.25,
                whiteSpace:noWrap ? 'nowrap' : 'pre-wrap',
                overflow:'hidden',
                overflowWrap:noWrap ? 'normal' : 'break-word',
                wordBreak:noWrap ? 'keep-all' : 'normal',
                textAlign:'center',
                direction:noWrap ? 'ltr' : (/[\u0600-\u06FF]/.test(text) ? 'rtl' : 'ltr'),
                display:'flex',
                alignItems:'center',
                justifyContent:'center',
                position:'relative',
                zIndex:12,
              }}
              title={cell.address}
            >{text}</div>;
          })}
        </div>

        {visibleOverlays.map((overlay) => {
          const anchorCell = renderCells.find((cell) => Array.isArray(cell.tokens) && cell.tokens.includes(overlay.anchorToken));
          if (!anchorCell) return null;
          const current = overlayPositions?.[overlay.id] || {};
          const xMm = Number(current.xMm ?? overlay.offsetXmm ?? 0);
          const yMm = Number(current.yMm ?? overlay.offsetYmm ?? 0);
          const pageOffsetMm = carrierMode ? 0 : contentTopMm;
          const topMm = (anchorCell.renderRow - 1) * (rowSizesMm[0] || 4) + yMm + pageOffsetMm;
          const leftMm = columnOffsetMm(anchorCell.col) + xMm;
          const src = overlayImages?.[overlay.id] || overlayImages?.[overlay.variableCode] || '';
          return <div
            key={overlay.id}
            onPointerDown={(event) => beginOverlayDrag(event, overlay)}
            style={{
              position:'absolute',
              left:`${leftMm}mm`,
              top:`${topMm}mm`,
              width:`${Number(overlay.widthMm || 28)}mm`,
              height:`${Number(overlay.heightMm || 18)}mm`,
              zIndex:Number(overlay.zIndex || 30) + 20,
              cursor:editableOverlays && overlay.movable !== false ? 'move' : 'default',
              pointerEvents:editableOverlays ? 'auto' : 'none',
            }}
          >
            {src ? <img src={src} alt={overlay.id} style={{ width:'100%', height:'100%', objectFit:'contain' }} /> : <div style={{
              width:'100%',height:'100%',border:'1px dashed #7c2d12',borderRadius:999,
              display:'grid',placeItems:'center',fontSize:10,color:'#7c2d12',background:'rgba(255,247,237,.6)',
            }}>{overlay.id}</div>}
          </div>;
        })}
      </div>;
    })}
  </div>;
}
