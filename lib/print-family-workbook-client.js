'use client';

import {
  PRINT_FAMILY_REQUIRED_DRESS_CODES,
  PRINT_FAMILY_SYSTEM_SHEETS,
  PRINT_FAMILY_VARIABLE_HEADERS,
  getModelSheetNames,
} from './excel-print-family-contract.mjs';

function fillArgb(cell) {
  const fill = cell?.fill;
  if (!fill || fill.type !== 'pattern' || fill.pattern !== 'solid') return '';
  return String(fill.fgColor?.argb || '').toUpperCase().replace(/^FF/, '');
}

function rowValues(sheet, rowNo, count) {
  const values = [];
  for (let col = 1; col <= count; col += 1) values.push(sheet.getCell(rowNo, col).value);
  return values;
}

function sameRow(actual, expected) {
  return expected.every((value, index) => String(actual[index] ?? '').trim() === value);
}

export async function inspectPrintFamilyWorkbook(file, family, options = {}) {
  if (!file) return { errors:['لم يتم اختيار ملف.'], warnings:[], modelSheets:[] };
  if (!/\.xlsx$/i.test(file.name || '')) {
    return { errors:['يجب رفع ملف Excel بصيغة .xlsx فقط.'], warnings:[], modelSheets:[] };
  }

  const ExcelModule = await import('exceljs');
  const ExcelJS = ExcelModule.default || ExcelModule;
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch (error) {
    return { errors:[`تعذّر قراءة ملف Excel: ${error?.message || error}`], warnings:[], modelSheets:[] };
  }

  const errors = [];
  const warnings = [];
  const sheetNames = workbook.worksheets.map((sheet) => sheet.name);

  for (const required of PRINT_FAMILY_SYSTEM_SHEETS) {
    if (!sheetNames.includes(required)) errors.push(`الصفحة الإلزامية ${required} غير موجودة.`);
  }

  const variables = workbook.getWorksheet('_VARIABLES');
  if (variables) {
    const headers = rowValues(variables, 3, PRINT_FAMILY_VARIABLE_HEADERS.length);
    if (!sameRow(headers, PRINT_FAMILY_VARIABLE_HEADERS)) {
      errors.push('رؤوس صفحة _VARIABLES لا تطابق العقد المعتمد.');
    }
  }

  const dress = workbook.getWorksheet('_DRESS_CODE');
  if (dress) {
    const roles = new Set();
    for (let row = 4; row <= dress.rowCount; row += 1) {
      const role = String(dress.getCell(row, 1).value || '').trim();
      if (role) roles.add(role);
    }
    for (const required of PRINT_FAMILY_REQUIRED_DRESS_CODES) {
      if (!roles.has(required)) errors.push(`_DRESS_CODE ينقصه الدور ${required}.`);
    }
  }

  const base = workbook.getWorksheet('_BASE_A4_PORTRAIT_SAFE');
  if (base) {
    for (const address of ['B30','C30','D30','AM30','AN30','AO30']) {
      if (fillArgb(base.getCell(address)) !== 'F4CCCC') {
        errors.push(`${address} يجب أن يبقى ضمن منطقة الحظر الجانبية.`);
      }
    }
    if (fillArgb(base.getCell('E30')) === 'F4CCCC' || fillArgb(base.getCell('AL30')) === 'F4CCCC') {
      errors.push('منطقة الحظر الجانبية تجاوزت 3 أعمدة.');
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

  const addedModels = modelSheets.filter((name) => !(options.protectedModels || family?.models || []).includes(name));
  if (addedModels.length) {
    warnings.push(`سيتم تسجيل ${addedModels.length} نموذج جديد من أسماء الـSheets: ${addedModels.join('، ')}`);
  }

  return {
    errors,
    warnings,
    modelSheets,
    workbook,
  };
}
