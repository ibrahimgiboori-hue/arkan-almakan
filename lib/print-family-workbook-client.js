'use client';

import { strFromU8, unzipSync } from 'fflate';

import {
  PRINT_FAMILY_REQUIRED_DRESS_CODES,
  PRINT_FAMILY_SYSTEM_SHEETS,
  PRINT_FAMILY_VARIABLE_HEADERS,
  getModelSheetNames,
} from './excel-print-family-contract.mjs';

function textValue(value) {
  if (value == null) return '';
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text;
    if (Array.isArray(value.richText)) return value.richText.map((part) => part?.text || '').join('');
    if ('result' in value) return textValue(value.result);
  }
  return String(value);
}

function sameRow(actual, expected) {
  return expected.every((value, index) => textValue(actual[index]).trim() === value);
}

function sheetCell(sheet, XLSX, row, col) {
  const address = XLSX.utils.encode_cell({ r:row - 1, c:col - 1 });
  return sheet?.[address]?.v ?? '';
}

function rowValues(sheet, XLSX, rowNo, count) {
  const values = [];
  for (let col = 1; col <= count; col += 1) values.push(sheetCell(sheet, XLSX, rowNo, col));
  return values;
}

function sheetLastRow(sheet, XLSX) {
  if (!sheet?.['!ref']) return 0;
  try {
    return XLSX.utils.decode_range(sheet['!ref']).e.r + 1;
  } catch {
    return 0;
  }
}


function xmlAttr(source, name) {
  const match = String(source || '').match(new RegExp('\\b' + name + '="([^"]*)"'));
  return match?.[1] || '';
}

function xmlColor(tag) {
  const rgb = xmlAttr(tag, 'rgb');
  return rgb ? { rgb } : null;
}

function parseOoxmlStyleTables(files) {
  const xml = files?.['xl/styles.xml'] ? strFromU8(files['xl/styles.xml']) : '';
  if (!xml) return [];

  const block = (name) => xml.match(new RegExp('<' + name + '\\b[^>]*>([\\s\\S]*?)<\\/' + name + '>'))?.[1] || '';
  const tags = (body, name) => Array.from(body.matchAll(new RegExp('<' + name + '\\b([^>]*)>([\\s\\S]*?)<\\/' + name + '>|<' + name + '\\b([^>]*)\\/>', 'g')))
    .map((m) => ({ attrs:m[1] || m[3] || '', body:m[2] || '' }));

  const fonts = tags(block('fonts'), 'font').map((item) => ({
    sz:Number(xmlAttr(item.body.match(/<sz\b[^>]*\/>/)?.[0] || '', 'val') || 0) || null,
    bold:/<b\b[^>]*\/>/.test(item.body),
    italic:/<i\b[^>]*\/>/.test(item.body),
    color:xmlColor(item.body.match(/<color\b[^>]*\/>/)?.[0] || ''),
  }));

  const fills = tags(block('fills'), 'fill').map((item) => {
    const fg = item.body.match(/<fgColor\b[^>]*\/>/)?.[0] || '';
    const bg = item.body.match(/<bgColor\b[^>]*\/>/)?.[0] || '';
    return { fgColor:xmlColor(fg), bgColor:xmlColor(bg) };
  });

  function borderSide(body, name) {
    const full = body.match(new RegExp('<' + name + '\\b([^>]*)>([\\s\\S]*?)<\\/' + name + '>|<' + name + '\\b([^>]*)\\/>'));
    if (!full) return null;
    const attrs = full[1] || full[3] || '';
    const inner = full[2] || '';
    const style = xmlAttr(attrs, 'style');
    if (!style) return null;
    const colorTag = inner.match(/<color\b[^>]*\/>/)?.[0] || '';
    return { style, color:xmlColor(colorTag) };
  }

  const borders = tags(block('borders'), 'border').map((item) => ({
    top:borderSide(item.body, 'top'),
    right:borderSide(item.body, 'right'),
    bottom:borderSide(item.body, 'bottom'),
    left:borderSide(item.body, 'left'),
  }));

  const xfsBody = block('cellXfs');
  return tags(xfsBody, 'xf').map((item) => {
    const fontId = Number(xmlAttr(item.attrs, 'fontId') || 0);
    const fillId = Number(xmlAttr(item.attrs, 'fillId') || 0);
    const borderId = Number(xmlAttr(item.attrs, 'borderId') || 0);
    const alignmentTag = item.body.match(/<alignment\b[^>]*\/>/)?.[0] || '';
    return {
      font:fonts[fontId] || {},
      fill:fills[fillId] || {},
      border:borders[borderId] || {},
      alignment:{
        horizontal:xmlAttr(alignmentTag, 'horizontal'),
        vertical:xmlAttr(alignmentTag, 'vertical'),
        wrapText:xmlAttr(alignmentTag, 'wrapText') === '1',
      },
    };
  });
}

function ooxmlSheetPathMap(files) {
  const out = new Map();
  const workbookXml = files?.['xl/workbook.xml'] ? strFromU8(files['xl/workbook.xml']) : '';
  const relsXml = files?.['xl/_rels/workbook.xml.rels'] ? strFromU8(files['xl/_rels/workbook.xml.rels']) : '';
  const rels = new Map();
  for (const match of relsXml.matchAll(/<Relationship\b([^>]*)\/>/g)) {
    const attrs = match[1] || '';
    const id = xmlAttr(attrs, 'Id');
    const target = xmlAttr(attrs, 'Target');
    if (id && target) rels.set(id, target);
  }
  for (const match of workbookXml.matchAll(/<sheet\b([^>]*)\/>/g)) {
    const attrs = match[1] || '';
    const name = xmlAttr(attrs, 'name');
    const rid = xmlAttr(attrs, 'r:id');
    const target = rels.get(rid);
    if (!name || !target) continue;
    const clean = target.replace(/^\//, '').replace(/^\.\//, '');
    out.set(name, clean.startsWith('xl/') ? clean : 'xl/' + clean);
  }
  return out;
}

function parseOoxmlSheetStyles(files, sheetNames) {
  const styles = parseOoxmlStyleTables(files);
  const paths = ooxmlSheetPathMap(files);
  const result = new Map();

  for (const name of sheetNames || []) {
    const path = paths.get(name);
    const xml = path && files?.[path] ? strFromU8(files[path]) : '';
    const map = new Map();
    if (xml) {
      for (const match of xml.matchAll(/<c\b([^>]*)/g)) {
        const attrs = match[1] || '';
        const address = xmlAttr(attrs, 'r');
        const styleIndex = Number(xmlAttr(attrs, 's') || 0);
        if (address && styles[styleIndex]) map.set(address, styles[styleIndex]);
      }
    }
    result.set(name, map);
  }
  return result;
}

function parseVariables(sheet, XLSX) {
  if (!sheet) return [];
  const out = [];
  const lastRow = sheetLastRow(sheet, XLSX);
  for (let row = 4; row <= lastRow; row += 1) {
    const code = textValue(sheetCell(sheet, XLSX, row, 2)).trim();
    if (!code) continue;
    out.push({
      enabled:textValue(sheetCell(sheet, XLSX, row, 1)).trim(),
      code,
      labelAr:textValue(sheetCell(sheet, XLSX, row, 3)).trim(),
      labelEn:textValue(sheetCell(sheet, XLSX, row, 4)).trim(),
      type:textValue(sheetCell(sheet, XLSX, row, 5)).trim(),
      repeatGroup:textValue(sheetCell(sheet, XLSX, row, 6)).trim(),
      source:textValue(sheetCell(sheet, XLSX, row, 7)).trim(),
      format:textValue(sheetCell(sheet, XLSX, row, 8)).trim(),
      required:textValue(sheetCell(sheet, XLSX, row, 9)).trim(),
      defaultValue:textValue(sheetCell(sheet, XLSX, row, 10)).trim(),
      example:textValue(sheetCell(sheet, XLSX, row, 11)).trim(),
      notes:textValue(sheetCell(sheet, XLSX, row, 12)).trim(),
    });
  }
  return out;
}

function parseFlowRules(sheet, XLSX) {
  if (!sheet) return {};
  const rules = {};
  const lastRow = sheetLastRow(sheet, XLSX);
  for (let row = 4; row <= lastRow; row += 1) {
    const code = textValue(sheetCell(sheet, XLSX, row, 1)).trim();
    if (!code) continue;
    rules[code] = {
      label:textValue(sheetCell(sheet, XLSX, row, 2)).trim(),
      value:sheetCell(sheet, XLSX, row, 3),
      unit:textValue(sheetCell(sheet, XLSX, row, 4)).trim(),
      appliesTo:textValue(sheetCell(sheet, XLSX, row, 5)).trim(),
      behavior:textValue(sheetCell(sheet, XLSX, row, 6)).trim(),
      editable:textValue(sheetCell(sheet, XLSX, row, 7)).trim(),
      notes:textValue(sheetCell(sheet, XLSX, row, 8)).trim(),
    };
  }
  return rules;
}

function parseVisibility(sheet, XLSX) {
  if (!sheet) return [];
  const out = [];
  const lastRow = sheetLastRow(sheet, XLSX);
  for (let row = 4; row <= lastRow; row += 1) {
    const toggle = textValue(sheetCell(sheet, XLSX, row, 1)).trim();
    if (!toggle) continue;
    out.push({
      toggle,
      label:textValue(sheetCell(sheet, XLSX, row, 2)).trim(),
      elementType:textValue(sheetCell(sheet, XLSX, row, 3)).trim(),
      target:textValue(sheetCell(sheet, XLSX, row, 4)).trim(),
      offBehavior:textValue(sheetCell(sheet, XLSX, row, 5)).trim(),
      reflow:textValue(sheetCell(sheet, XLSX, row, 6)).trim(),
      defaultValue:Boolean(sheetCell(sheet, XLSX, row, 7)),
      appliesTo:textValue(sheetCell(sheet, XLSX, row, 8)).trim(),
      priority:Number(sheetCell(sheet, XLSX, row, 9) || 0),
      notes:textValue(sheetCell(sheet, XLSX, row, 10)).trim(),
    });
  }
  return out.sort((a,b) => a.priority - b.priority);
}

function parseOverlays(sheet, XLSX) {
  if (!sheet) return [];
  const out = [];
  const lastRow = sheetLastRow(sheet, XLSX);
  for (let row = 4; row <= lastRow; row += 1) {
    const modelSheet = textValue(sheetCell(sheet, XLSX, row, 1)).trim();
    const id = textValue(sheetCell(sheet, XLSX, row, 2)).trim();
    if (!modelSheet || !id) continue;
    out.push({
      modelSheet,
      id,
      variableCode:textValue(sheetCell(sheet, XLSX, row, 3)).trim(),
      sourceSetting:textValue(sheetCell(sheet, XLSX, row, 4)).trim(),
      anchorToken:textValue(sheetCell(sheet, XLSX, row, 5)).trim(),
      offsetXmm:Number(sheetCell(sheet, XLSX, row, 6) || 0),
      offsetYmm:Number(sheetCell(sheet, XLSX, row, 7) || 0),
      widthMm:Number(sheetCell(sheet, XLSX, row, 8) || 0),
      heightMm:Number(sheetCell(sheet, XLSX, row, 9) || 0),
      showToggle:textValue(sheetCell(sheet, XLSX, row, 10)).trim(),
      movable:Boolean(sheetCell(sheet, XLSX, row, 11)),
      zIndex:Number(sheetCell(sheet, XLSX, row, 12) || 0),
      flowSpace:Number(sheetCell(sheet, XLSX, row, 13) || 0),
      notes:textValue(sheetCell(sheet, XLSX, row, 14)).trim(),
    });
  }
  return out;
}

function parsePlacedAssets(sheet, XLSX) {
  if (!sheet) return [];
  const out = [];
  const lastRow = sheetLastRow(sheet, XLSX);
  for (let row = 4; row <= lastRow; row += 1) {
    const modelSheet = textValue(sheetCell(sheet, XLSX, row, 1)).trim();
    const id = textValue(sheetCell(sheet, XLSX, row, 2)).trim();
    if (!modelSheet || !id) continue;
    out.push({
      modelSheet,
      id,
      label:textValue(sheetCell(sheet, XLSX, row, 3)).trim(),
      sourceSetting:textValue(sheetCell(sheet, XLSX, row, 4)).trim(),
      anchorRange:textValue(sheetCell(sheet, XLSX, row, 5)).trim(),
      widthMm:Number(sheetCell(sheet, XLSX, row, 6) || 0),
      heightMm:Number(sheetCell(sheet, XLSX, row, 7) || 0),
      fitMode:textValue(sheetCell(sheet, XLSX, row, 8)).trim() || 'contain',
      repeat:textValue(sheetCell(sheet, XLSX, row, 9)).trim() || 'once',
      showToggle:textValue(sheetCell(sheet, XLSX, row, 10)).trim(),
      zIndex:Number(sheetCell(sheet, XLSX, row, 11) || 0),
      replacesPlaceholder:textValue(sheetCell(sheet, XLSX, row, 12)).trim(),
      notes:textValue(sheetCell(sheet, XLSX, row, 13)).trim(),
    });
  }
  return out;
}

function mergeSpanFor(sheet, row, col) {
  const merges = Array.isArray(sheet?.['!merges']) ? sheet['!merges'] : [];
  const merge = merges.find((item) => item.s.r === row - 1 && item.s.c === col - 1);
  if (!merge) return { rowSpan:1, colSpan:1 };
  return {
    rowSpan:merge.e.r - merge.s.r + 1,
    colSpan:merge.e.c - merge.s.c + 1,
  };
}

function parseRangeBounds(value, XLSX, fallback = 'B3:AO61') {
  const text = textValue(value).trim() || fallback;
  try {
    const range = XLSX.utils.decode_range(text);
    return {
      range:text,
      startRow:range.s.r + 1,
      endRow:range.e.r + 1,
      startCol:range.s.c + 1,
      endCol:range.e.c + 1,
      rowCount:range.e.r - range.s.r + 1,
      colCount:range.e.c - range.s.c + 1,
    };
  } catch {
    const range = XLSX.utils.decode_range(fallback);
    return {
      range:fallback,
      startRow:range.s.r + 1,
      endRow:range.e.r + 1,
      startCol:range.s.c + 1,
      endCol:range.e.c + 1,
      rowCount:range.e.r - range.s.r + 1,
      colCount:range.e.c - range.s.c + 1,
    };
  }
}

function parsePageConfig(flowRules, XLSX) {
  const pageBounds = parseRangeBounds(flowRules.PAGE_CANVAS_RANGE?.value || 'B3:AO61', XLSX, 'B3:AO61');
  const contentFrameBounds = flowRules.CONTENT_FRAME_RANGE?.value
    ? parseRangeBounds(flowRules.CONTENT_FRAME_RANGE.value, XLSX, textValue(flowRules.CONTENT_FRAME_RANGE.value))
    : null;
  const widthMm = Number(flowRules.PAGE_WIDTH_MM?.value || 210);
  const heightMm = Number(flowRules.PAGE_HEIGHT_MM?.value || 297);
  const boundarySource = textValue(flowRules.BOUNDARY_SOURCE?.value).trim();
  const boundaryAuthoritative = String(flowRules.BOUNDARY_IS_AUTHORITATIVE?.value || '').toUpperCase() === 'TRUE';
  return {
    pageBounds,
    widthMm:Number.isFinite(widthMm) && widthMm > 0 ? widthMm : 210,
    heightMm:Number.isFinite(heightMm) && heightMm > 0 ? heightMm : 297,
    contentFrameBounds,
    noStationery:String(flowRules.NO_STATIONERY?.value || '').toUpperCase() === 'TRUE',
    boundarySource,
    boundaryAuthoritative,
    boundaryStyle:textValue(flowRules.BOUNDARY_STYLE?.value).trim(),
    mode:contentFrameBounds ? 'A4_CARRIER_A5_CONTENT' : 'FLOW_PAGE',
  };
}

function normalizeStyleColor(color) {
  const rgb = String(color?.rgb || '').replace(/^FF/i, '');
  return /^[0-9A-F]{6}$/i.test(rgb) ? '#' + rgb.toUpperCase() : '';
}

function colorLuminance(hex) {
  const match = String(hex || '').match(/^#([0-9A-F]{6})$/i);
  if (!match) return null;
  const value = match[1];
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function visibleFill(color) {
  const value = String(color || '').toUpperCase();
  return Boolean(value && value !== '#FFFFFF' && value !== '#FFF' && value !== '#00000000');
}

function semanticFillRole(color) {
  const match = String(color || '').match(/^#([0-9A-F]{6})$/i);
  if (!match) return '';
  const value = match[1];
  const r = parseInt(value.slice(0,2),16);
  const g = parseInt(value.slice(2,4),16);
  const b = parseInt(value.slice(4,6),16);

  // Road-map convention for treasury vouchers:
  // warm yellow = fixed/static zone, light cyan/blue = dynamic/variable zone.
  const isStatic = r >= 205 && g >= 135 && b <= 95 && r - b >= 120;
  const isVariable = b >= 175 && g >= 175 && r <= 205 && b - r >= 20;
  if (isStatic) return 'static';
  if (isVariable) return 'variable';
  return '';
}

function normalizeBorderSide(side) {
  const style = String(side?.style || '').trim();
  if (!style) return null;
  const explicitColor = normalizeStyleColor(side?.color);
  const luminance = colorLuminance(explicitColor);
  const mediumOrThick = style === 'thick' || style === 'medium' || style === 'mediumDashed'
    || style === 'mediumDashDot' || style === 'mediumDashDotDot' || style === 'double';
  const intentional = mediumOrThick || (luminance != null && luminance <= 115);
  const widthMm = style === 'thick' || style === 'double'
    ? 0.55
    : mediumOrThick
      ? 0.38
      : 0.2;
  const lineStyle = /dash/i.test(style) ? 'dashed' : /dot/i.test(style) ? 'dotted' : 'solid';
  return {
    widthMm,
    lineStyle,
    color:explicitColor || '#111111',
    intentional,
    style,
  };
}

function normalizeCellStyle(style) {
  const source = style && typeof style === 'object' ? style : {};
  const fillColor = normalizeStyleColor(source?.fill?.fgColor || source?.fill?.bgColor);
  const fontColor = normalizeStyleColor(source?.font?.color);
  const alignment = source?.alignment || {};
  return {
    fillColor,
    semanticRole:semanticFillRole(fillColor),
    fontColor,
    fontSizePt:Number(source?.font?.sz || 0) || null,
    bold:Boolean(source?.font?.bold),
    italic:Boolean(source?.font?.italic),
    horizontal:String(alignment?.horizontal || '').trim(),
    vertical:String(alignment?.vertical || '').trim(),
    wrapText:Boolean(alignment?.wrapText),
    borders:{
      top:normalizeBorderSide(source?.border?.top),
      right:normalizeBorderSide(source?.border?.right),
      bottom:normalizeBorderSide(source?.border?.bottom),
      left:normalizeBorderSide(source?.border?.left),
    },
  };
}

function hasRenderableStyle(style) {
  const normalized = normalizeCellStyle(style);
  const hasIntentionalBorder = Boolean(
    normalized.borders.top?.intentional
    || normalized.borders.right?.intentional
    || normalized.borders.bottom?.intentional
    || normalized.borders.left?.intentional
  );
  return Boolean(
    visibleFill(normalized.fillColor)
    || normalized.fontColor
    || normalized.bold
    || normalized.italic
    || normalized.fontSizePt
    || hasIntentionalBorder
  );
}

function hasAnyBorderStyle(style) {
  const normalized = normalizeCellStyle(style);
  return Boolean(
    normalized.borders.top
    || normalized.borders.right
    || normalized.borders.bottom
    || normalized.borders.left
  );
}

function pruneVoucherCellNoise(cells) {
  const edges = [];
  for (const cell of cells) {
    const rowSpan = Math.max(1, Number(cell.rowSpan || 1));
    const colSpan = Math.max(1, Number(cell.colSpan || 1));
    const endRow = cell.row + rowSpan - 1;
    const endCol = cell.col + colSpan - 1;
    const borders = cell.style?.borders || {};

    if (borders.top?.intentional) edges.push({cell,side:'top',axis:'h',line:cell.row,start:cell.col,end:endCol,border:borders.top,span:colSpan});
    if (borders.bottom?.intentional) edges.push({cell,side:'bottom',axis:'h',line:endRow + 1,start:cell.col,end:endCol,border:borders.bottom,span:colSpan});
    if (borders.left?.intentional) edges.push({cell,side:'left',axis:'v',line:cell.col,start:cell.row,end:endRow,border:borders.left,span:rowSpan});
    if (borders.right?.intentional) edges.push({cell,side:'right',axis:'v',line:endCol + 1,start:cell.row,end:endRow,border:borders.right,span:rowSpan});
  }

  function strong(edge) {
    const style = String(edge.border?.style || '');
    return Number(edge.border?.widthMm || 0) >= 0.38 || style === 'thick' || style === 'double';
  }

  function sameVisual(edge, other) {
    return edge.axis === other.axis
      && edge.line === other.line
      && String(edge.border?.color || '') === String(other.border?.color || '')
      && String(edge.border?.lineStyle || '') === String(other.border?.lineStyle || '');
  }

  function trueContinuation(edge) {
    if (strong(edge) || Number(edge.span || 1) > 1) return true;
    return edges.some((other) => {
      if (other === edge || !sameVisual(edge, other)) return false;
      // Duplicated left/right or top/bottom definitions for the SAME one-cell segment
      // are not a continuation; they are just Excel's grid stored twice.
      const exactDuplicate = other.start === edge.start && other.end === edge.end;
      if (exactDuplicate) return false;
      // Keep only genuine adjacent runs along the same geometric line.
      return other.end + 1 === edge.start || edge.end + 1 === other.start;
    });
  }

  for (const edge of edges) {
    if (trueContinuation(edge)) continue;
    if (edge.cell?.style?.borders) edge.cell.style.borders[edge.side] = null;
  }
  return cells;
}

function extractModelSheet(sheet, XLSX, name, pageConfig, rawStyleMap = new Map(), options = {}) {
  const pageBounds = pageConfig.pageBounds;
  const cells = [];
  const tokenCells = [];
  const staticCells = [];
  const tokenSet = new Set();

  if (!sheet?.['!ref']) {
    return { name, tokens:[], tokenLabels:{}, cells:[], columns:[], rows:[], hasQty:false, hasVat:false, pageBounds, pageConfig };
  }

  const used = XLSX.utils.decode_range(sheet['!ref']);
  for (let r = used.s.r; r <= used.e.r; r += 1) {
    for (let c = used.s.c; c <= used.e.c; c += 1) {
      const address = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[address];
      const rawStyle = rawStyleMap.get(address) || cell?.s || null;
      if (!cell && !rawStyle) continue;
      const text = cell?.v == null ? '' : textValue(cell.v);
      const preserveExactBorders = Boolean(options.preserveExactBorders);
      if (
        !text.trim()
        && !hasRenderableStyle(rawStyle)
        && !(preserveExactBorders && hasAnyBorderStyle(rawStyle))
      ) continue;
      const span = mergeSpanFor(sheet, r + 1, c + 1);
      const tokens = Array.from(text.matchAll(/\{\{([a-z][a-z0-9_]*)\}\}/g)).map((match) => match[1]);
      tokens.forEach((token) => tokenSet.add(token));

      const entry = {
        address,
        row:r + 1,
        col:c + 1,
        rowSpan:span.rowSpan,
        colSpan:span.colSpan,
        text,
        tokens,
        style:normalizeCellStyle(rawStyle),
      };
      cells.push(entry);
      if (tokens.length) tokenCells.push(entry);
      else staticCells.push(entry);
    }
  }

  const tokenLabels = {};
  for (const tokenCell of tokenCells) {
    for (const token of tokenCell.tokens) {
      const candidates = staticCells
        .map((candidate) => {
          const tokenEndCol = tokenCell.col + tokenCell.colSpan - 1;
          const candidateEndCol = candidate.col + candidate.colSpan - 1;
          const overlap = candidate.col <= tokenEndCol && candidateEndCol >= tokenCell.col;
          const above = candidate.row < tokenCell.row && tokenCell.row - candidate.row <= 4 && overlap;
          const sameRowLeft = candidate.row === tokenCell.row && candidateEndCol < tokenCell.col && tokenCell.col - candidateEndCol <= 14;
          if (!above && !sameRowLeft) return null;
          const score = sameRowLeft
            ? (tokenCell.col - candidateEndCol)
            : 100 + (tokenCell.row - candidate.row) * 10 + Math.abs(candidate.col - tokenCell.col);
          return { candidate, score };
        })
        .filter(Boolean)
        .sort((a,b) => a.score - b.score);

      if (candidates.length && !tokenLabels[token]) tokenLabels[token] = candidates[0].candidate.text;
    }
  }

  const columns = (sheet['!cols'] || []).map((col, index) => ({
    col:index + 1,
    width:col?.wch ?? null,
    widthPx:col?.wpx ?? null,
  })).filter((item) => item.width != null || item.widthPx != null);

  const rows = (sheet['!rows'] || []).map((row, index) => ({
    row:index + 1,
    height:row?.hpt ?? null,
    heightPx:row?.hpx ?? null,
  })).filter((item) => item.height != null || item.heightPx != null);

  if (!options.preserveExactBorders) pruneVoucherCellNoise(cells);

  const tokens = Array.from(tokenSet);
  return {
    name,
    tokens,
    tokenLabels,
    cells,
    columns,
    rows,
    hasQty:tokens.includes('qty'),
    hasVat:tokens.includes('vat_amount'),
    pageBounds,
    pageConfig,
  };
}

function placedAssetsForModel(placedAssets, modelName) {
  return placedAssets.filter((asset) => asset.modelSheet === modelName || asset.modelSheet === 'ALL');
}

function buildUiSchema(workbook, XLSX, familyId, modelSheets, rawStyleMaps = new Map()) {
  const variables = parseVariables(workbook.Sheets?.['_VARIABLES'], XLSX);
  const flowRules = parseFlowRules(workbook.Sheets?.['_FLOW_RULES'], XLSX);
  const visibility = parseVisibility(workbook.Sheets?.['_VISIBILITY'], XLSX);
  const overlays = parseOverlays(workbook.Sheets?.['_OVERLAYS'], XLSX);
  const placedAssets = parsePlacedAssets(workbook.Sheets?.['_PLACED_ASSETS'], XLSX);
  const pageConfig = parsePageConfig(flowRules, XLSX);
  const preserveExactBorders = familyId === 'treasury_vouchers';
  const models = modelSheets.map((name) => ({
    ...extractModelSheet(
      workbook.Sheets?.[name],
      XLSX,
      name,
      pageConfig,
      rawStyleMaps.get(name) || new Map(),
      { preserveExactBorders }
    ),
    placedAssets:placedAssetsForModel(placedAssets, name),
  }));
  return {
    schema:'arkan-workbook-ui-v5',
    familyId,
    variables,
    flowRules,
    visibility,
    overlays,
    placedAssets,
    pageBounds:pageConfig.pageBounds,
    pageConfig,
    models,
  };
}

export async function inspectPrintFamilyWorkbook(file, family, options = {}) {
  if (!file) return { errors:['لم يتم اختيار ملف.'], warnings:[], modelSheets:[], uiSchema:null };
  if (!/\.xlsx$/i.test(file.name || '')) {
    return { errors:['يجب رفع ملف Excel بصيغة .xlsx فقط.'], warnings:[], modelSheets:[], uiSchema:null };
  }

  let XLSX;
  let workbook;
  try {
    const module = await import('xlsx');
    XLSX = module.default || module;
    const buffer = await file.arrayBuffer();
    workbook = XLSX.read(buffer, {
      type:'array',
      cellDates:true,
      cellStyles:true,
      dense:false,
    });
    workbook.__arkanRawStyleMaps = parseOoxmlSheetStyles(
      unzipSync(new Uint8Array(buffer)),
      Array.isArray(workbook?.SheetNames) ? workbook.SheetNames : []
    );
  } catch (error) {
    return {
      errors:[`تعذّر قراءة ملف Excel: ${error?.message || error}`],
      warnings:[],
      modelSheets:[],
      uiSchema:null,
    };
  }

  const errors = [];
  const warnings = [];
  const sheetNames = Array.isArray(workbook?.SheetNames) ? workbook.SheetNames : [];

  if (!sheetNames.length) {
    return { errors:['ملف Excel لا يحتوي صفحات قابلة للقراءة.'], warnings:[], modelSheets:[], uiSchema:null };
  }

  for (const required of PRINT_FAMILY_SYSTEM_SHEETS) {
    if (!sheetNames.includes(required)) errors.push(`الصفحة الإلزامية ${required} غير موجودة.`);
  }

  const variables = workbook.Sheets?.['_VARIABLES'];
  if (variables) {
    const headers = rowValues(variables, XLSX, 3, PRINT_FAMILY_VARIABLE_HEADERS.length);
    if (!sameRow(headers, PRINT_FAMILY_VARIABLE_HEADERS)) {
      errors.push('رؤوس صفحة _VARIABLES لا تطابق العقد المعتمد.');
    }
  }

  const dress = workbook.Sheets?.['_DRESS_CODE'];
  if (dress) {
    const roles = new Set();
    const lastRow = sheetLastRow(dress, XLSX);
    for (let row = 4; row <= lastRow; row += 1) {
      const role = textValue(sheetCell(dress, XLSX, row, 1)).trim();
      if (role) roles.add(role);
    }
    for (const required of PRINT_FAMILY_REQUIRED_DRESS_CODES) {
      if (!roles.has(required)) errors.push(`_DRESS_CODE ينقصه الدور ${required}.`);
    }
  }

  const modelSheets = getModelSheetNames(sheetNames);
  const protectedModels = Array.from(new Set([
    ...(family?.models || []),
    ...(options.protectedModels || []),
  ]));

  for (const model of protectedModels) {
    if (!modelSheets.includes(model)) {
      errors.push(`لا يمكن حذف النموذج «${model}» بمجرد حذف الـSheet. أعد الصفحة أو استخدم إجراء إيقاف نموذج من داخل النظام.`);
    }
  }

  const knownModels = options.protectedModels || family?.models || [];
  const addedModels = modelSheets.filter((name) => !knownModels.includes(name));
  if (addedModels.length) {
    warnings.push(`سيتم تسجيل ${addedModels.length} نموذج جديد من أسماء الـSheets: ${addedModels.join('، ')}`);
  }

  const uiSchema = buildUiSchema(
    workbook,
    XLSX,
    family?.id || '',
    modelSheets,
    workbook.__arkanRawStyleMaps || new Map()
  );

  if (family?.id === 'treasury_vouchers') {
    for (const model of uiSchema.models || []) {
      const amountLabels = (model.cells || []).filter((cell) =>
        !(cell.tokens || []).length && /مبلغ\s*\/?|المبلغ/.test(String(cell.text || '').trim())
      );
      const staticAmounts = (model.cells || []).filter((cell) =>
        !(cell.tokens || []).length && /^\s*\d+(?:[.,]\d{1,2})?\s*$/.test(String(cell.text || ''))
      );
      for (const cell of staticAmounts) {
        const nearby = amountLabels.some((label) =>
          label.row === cell.row
          && label.col > cell.col
          && label.col - (cell.col + Math.max(1, Number(cell.colSpan || 1)) - 1) <= 12
        );
        if (nearby) {
          errors.push(`${model.name}: توجد قيمة مبلغ ثابتة في الخلية ${cell.address} (${cell.text}). استبدلها بمتغير {{amount_number}} حتى لا يتعارض المبلغ مع بيانات السند.`);
        }
      }
    }
  }

  warnings.push(`تمت قراءة ${uiSchema.variables.length} متغيرًا و${uiSchema.models.length} تصميمًا و${uiSchema.placedAssets.length} أصلًا موضوعًا لتغذية واجهة البرنامج.`);

  return {
    errors,
    warnings,
    modelSheets,
    sheetNames,
    uiSchema,
  };
}
