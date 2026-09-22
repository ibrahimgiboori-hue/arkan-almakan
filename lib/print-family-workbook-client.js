'use client';

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

function mergeSpanFor(sheet, row, col) {
  const merges = Array.isArray(sheet?.['!merges']) ? sheet['!merges'] : [];
  const merge = merges.find((item) => item.s.r === row - 1 && item.s.c === col - 1);
  if (!merge) return { rowSpan:1, colSpan:1 };
  return {
    rowSpan:merge.e.r - merge.s.r + 1,
    colSpan:merge.e.c - merge.s.c + 1,
  };
}

function parsePageBounds(value, XLSX) {
  const text = textValue(value).trim() || 'B3:AO61';
  try {
    const range = XLSX.utils.decode_range(text);
    return {
      range:text,
      startRow:range.s.r + 1,
      endRow:range.e.r + 1,
      startCol:range.s.c + 1,
      endCol:range.e.c + 1,
    };
  } catch {
    return { range:'B3:AO61', startRow:3, endRow:61, startCol:2, endCol:41 };
  }
}

function extractModelSheet(sheet, XLSX, name, pageBounds) {
  const cells = [];
  const tokenCells = [];
  const staticCells = [];
  const tokenSet = new Set();

  if (!sheet?.['!ref']) {
    return { name, tokens:[], tokenLabels:{}, cells:[], columns:[], rows:[], hasQty:false, hasVat:false, pageBounds };
  }

  const used = XLSX.utils.decode_range(sheet['!ref']);
  for (let r = used.s.r; r <= used.e.r; r += 1) {
    for (let c = used.s.c; c <= used.e.c; c += 1) {
      const address = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[address];
      if (!cell || cell.v == null || textValue(cell.v).trim() === '') continue;

      const text = textValue(cell.v);
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
  };
}

function buildUiSchema(workbook, XLSX, familyId, modelSheets) {
  const variables = parseVariables(workbook.Sheets?.['_VARIABLES'], XLSX);
  const flowRules = parseFlowRules(workbook.Sheets?.['_FLOW_RULES'], XLSX);
  const visibility = parseVisibility(workbook.Sheets?.['_VISIBILITY'], XLSX);
  const overlays = parseOverlays(workbook.Sheets?.['_OVERLAYS'], XLSX);
  const pageBounds = parsePageBounds(flowRules.PAGE_CANVAS_RANGE?.value || 'B3:AO61', XLSX);
  const models = modelSheets.map((name) => extractModelSheet(workbook.Sheets?.[name], XLSX, name, pageBounds));
  return {
    schema:'arkan-workbook-ui-v3',
    familyId,
    variables,
    flowRules,
    visibility,
    overlays,
    pageBounds,
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

  const uiSchema = buildUiSchema(workbook, XLSX, family?.id || '', modelSheets);
  warnings.push(`تمت قراءة ${uiSchema.variables.length} متغيرًا و${uiSchema.models.length} تصميمًا لتغذية واجهة البرنامج.`);

  return {
    errors,
    warnings,
    modelSheets,
    sheetNames,
    uiSchema,
  };
}
