import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import {
  PRINT_FAMILY_REQUIRED_DRESS_CODES,
  PRINT_FAMILY_SAFE_GEOMETRY,
  PRINT_FAMILY_SYSTEM_SHEETS,
  PRINT_FAMILY_VARIABLE_HEADERS,
  getModelSheetNames,
} from '../lib/excel-print-family-contract.mjs';
import { PRINT_FAMILIES, validatePrintFamilyCatalog } from '../lib/print-family-catalog.mjs';

const root = process.cwd();
const violations = [...validatePrintFamilyCatalog()];

function fillArgb(cell) {
  const fill = cell?.fill;
  if (!fill || fill.type !== 'pattern' || fill.pattern !== 'solid') return '';
  return String(fill.fgColor?.argb || '').toUpperCase().replace(/^FF/, '');
}

function sameRow(actual, expected) {
  return expected.every((value, index) => String(actual[index] ?? '').trim() === value);
}

async function inspectWorkbook(relative, { expectedModels = null } = {}) {
  const full = path.join(root, relative);
  if (!fs.existsSync(full)) {
    violations.push(`${relative}: workbook missing`);
    return;
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(full);
  const sheetNames = workbook.worksheets.map((sheet) => sheet.name);

  for (const required of PRINT_FAMILY_SYSTEM_SHEETS) {
    if (!sheetNames.includes(required)) violations.push(`${relative}: missing system sheet ${required}`);
  }

  const variables = workbook.getWorksheet('_VARIABLES');
  if (variables) {
    const headers = [];
    for (let col = 1; col <= PRINT_FAMILY_VARIABLE_HEADERS.length; col += 1) {
      headers.push(variables.getCell(3, col).value);
    }
    if (!sameRow(headers, PRINT_FAMILY_VARIABLE_HEADERS)) {
      violations.push(`${relative}: _VARIABLES row 3 does not match the governed header contract`);
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
      if (!roles.has(required)) violations.push(`${relative}: _DRESS_CODE missing ${required}`);
    }
  }

  const base = workbook.getWorksheet('_BASE_A4_PORTRAIT_SAFE');
  if (base) {
    const blocked = ['B30', 'C30', 'D30', 'AM30', 'AN30', 'AO30'];
    for (const address of blocked) {
      if (fillArgb(base.getCell(address)) !== 'F4CCCC') {
        violations.push(`${relative}: ${address} must remain an absolute no-go cell`);
      }
    }
    if (fillArgb(base.getCell('E30')) === 'F4CCCC' || fillArgb(base.getCell('AL30')) === 'F4CCCC') {
      violations.push(`${relative}: side no-go area exceeded ${PRINT_FAMILY_SAFE_GEOMETRY.absoluteNoGoSideColumns} columns`);
    }
  }

  if (expectedModels) {
    const actualModels = getModelSheetNames(sheetNames);
    for (const model of expectedModels) {
      if (!actualModels.includes(model)) violations.push(`${relative}: missing model sheet "${model}"`);
    }
    for (const model of actualModels) {
      if (!expectedModels.includes(model)) violations.push(`${relative}: unregistered model sheet "${model}"`);
    }
  }
}

const starter = path.join(root, 'public/print-families/_starter-a4-portrait.xlsx');
if (fs.existsSync(starter)) await inspectWorkbook('public/print-families/_starter-a4-portrait.xlsx');

for (const [familyId, family] of Object.entries(PRINT_FAMILIES)) {
  const full = path.join(root, family.workbook);
  if (family.migrationStage === 'ready') {
    await inspectWorkbook(family.workbook, { expectedModels: family.models });
  } else if (fs.existsSync(full)) {
    await inspectWorkbook(family.workbook, { expectedModels: family.models });
  }
}

if (violations.length) {
  console.error('\nEXCEL PRINT FAMILY AUDIT FAILED\n');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log('Excel print family audit passed: catalog, workbook contract, dress code, variables sheet, and 3-column side safety are governed.');
