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

export async function inspectPrintFamilyWorkbook(file, family, options = {}) {
  if (!file) return { errors:['لم يتم اختيار ملف.'], warnings:[], modelSheets:[] };
  if (!/\.xlsx$/i.test(file.name || '')) {
    return { errors:['يجب رفع ملف Excel بصيغة .xlsx فقط.'], warnings:[], modelSheets:[] };
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
      cellStyles:false,
      dense:false,
    });
  } catch (error) {
    return {
      errors:[`تعذّر قراءة ملف Excel: ${error?.message || error}`],
      warnings:[],
      modelSheets:[],
    };
  }

  const errors = [];
  const warnings = [];
  const sheetNames = Array.isArray(workbook?.SheetNames) ? workbook.SheetNames : [];

  if (!sheetNames.length) {
    return { errors:['ملف Excel لا يحتوي صفحات قابلة للقراءة.'], warnings:[], modelSheets:[] };
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

  if (sheetNames.includes('_FLOW_RULES')) {
    warnings.push('تمت قراءة صفحة _FLOW_RULES وسيحتفظ النظام بها داخل ملف العائلة المعتمد.');
  }

  return {
    errors,
    warnings,
    modelSheets,
    sheetNames,
  };
}
