/**
 * Sheet engine — the Excel behaviour of every ledger grid, as pure functions.
 *
 * RawGrid (components/ui/RawGrid.js) renders the cells; this module decides what a
 * sheet does: column letters and cell addresses, range selection, copy as
 * tab-separated text Excel understands, paste from Excel (values coerced to each
 * column's type and validated), fill down, clear, and the status-bar numbers.
 *
 * Pure module: no React, no DOM — unit-tested directly.
 */

import { latinDigits } from './latin-digits.js';

/** Column types a person can type into. */
export const SHEET_EDITABLE_TYPES = Object.freeze(['text', 'number', 'money', 'date', 'select', 'multiline']);
/** Column types that are not sheet cells at all (no letter, not selectable). */
export const SHEET_STRUCTURAL_TYPES = Object.freeze(['index', 'action', 'selection']);

const editableTypes = new Set(SHEET_EDITABLE_TYPES);
const structuralTypes = new Set(SHEET_STRUCTURAL_TYPES);
const numericTypes = new Set(['number', 'money']);

/** 0 → A, 25 → Z, 26 → AA. */
export function columnLetter(index) {
  let n = Math.floor(Number(index));
  if (!Number.isFinite(n) || n < 0) return '';
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/** Sheet cell address: column 0, row 0 → "A1". */
export function cellAddress(col, row) {
  return `${columnLetter(col)}${row + 1}`;
}

/** The grid columns that are sheet cells, with their letter and position. */
export function sheetColumns(columns = []) {
  const out = [];
  columns.forEach((column, gridIndex) => {
    const type = column?.type || 'custom';
    if (structuralTypes.has(type)) return;
    const sheetIndex = out.length;
    out.push(Object.freeze({
      key: column.key,
      column,
      gridIndex,
      sheetIndex,
      letter: columnLetter(sheetIndex),
      editable: editableTypes.has(type),
      numeric: numericTypes.has(type) || Boolean(column.sheetNumeric) || column.numeric === true,
    }));
  });
  return out;
}

export function normalizeRange(anchor, focus = anchor) {
  if (!anchor) return null;
  const end = focus || anchor;
  return {
    top: Math.min(anchor.row, end.row),
    bottom: Math.max(anchor.row, end.row),
    left: Math.min(anchor.col, end.col),
    right: Math.max(anchor.col, end.col),
  };
}

export function rangeContains(range, row, col) {
  return Boolean(range) && row >= range.top && row <= range.bottom && col >= range.left && col <= range.right;
}

export function rangeSize(range) {
  if (!range) return 0;
  return (range.bottom - range.top + 1) * (range.right - range.left + 1);
}

export function rangeAddress(range) {
  if (!range) return '';
  const first = cellAddress(range.left, range.top);
  return rangeSize(range) === 1 ? first : `${first}:${cellAddress(range.right, range.bottom)}`;
}

/** Move a cell position, clamped to the sheet. */
export function moveCell(position, { rowDelta = 0, colDelta = 0 }, { rowCount, colCount }) {
  const clamp = (value, max) => Math.max(0, Math.min(max - 1, value));
  return { row: clamp(position.row + rowDelta, rowCount), col: clamp(position.col + colDelta, colCount) };
}

/* ---------- clipboard ---------- */

/** Parse what Excel / Google Sheets put on the clipboard (tab-separated, quoted cells). */
export function parseClipboardTable(text) {
  const source = String(text ?? '').replace(/\r\n?/g, '\n');
  if (!source) return [];
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let atCellStart = true;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"' && atCellStart) { quoted = true; atCellStart = false; continue; }
    if (ch === '\t') { row.push(cell); cell = ''; atCellStart = true; continue; }
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; atCellStart = true; continue; }
    cell += ch;
    atCellStart = false;
  }
  if (cell !== '' || row.length || !atCellStart) { row.push(cell); rows.push(row); }
  return rows;
}

/** Matrix → tab-separated text that pastes into Excel cell by cell. */
export function toClipboardTable(matrix = []) {
  const quote = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[\t\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return matrix.map((row) => row.map(quote).join('\t')).join('\n');
}

/** A single copied value pasted onto a bigger selection fills it, like Excel. */
export function expandPasteMatrix(matrix, range) {
  if (!range || !matrix.length) return matrix;
  const height = range.bottom - range.top + 1;
  const width = range.right - range.left + 1;
  const sourceHeight = matrix.length;
  const sourceWidth = Math.max(...matrix.map((row) => row.length));
  const tiles = height % sourceHeight === 0 && width % sourceWidth === 0 && (height > sourceHeight || width > sourceWidth);
  if (!tiles) return matrix;
  return Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => matrix[r % sourceHeight][c % sourceWidth] ?? ''));
}

/* ---------- values ---------- */

/** "1,234.50", "١٬٢٣٤٫٥٠", "(300)", "SAR 40", "40 ر.س" → number; '' → ''; junk → null. */
export function parseNumberText(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  let text = latinDigits(String(raw ?? '')).trim();
  if (!text) return '';
  text = text.replace(/[  \s]/g, '').replace(/ر\.?س\.?|SAR|﷼/gi, '').replace(/٬/g, ',').replace(/٫/g, '.');
  let negative = false;
  if (/^\(.*\)$/.test(text)) { negative = true; text = text.slice(1, -1); }
  if (/^-/.test(text)) { negative = !negative; text = text.slice(1); }
  if (!/^\d{1,3}(,\d{3})*(\.\d+)?$|^\d+(\.\d+)?$|^\.\d+$/.test(text)) return null;
  const value = Number(text.replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

const pad2 = (value) => String(value).padStart(2, '0');

function validIso(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Dates as people paste them: 2026-11-05, 2026/11/05, 05/11/2026 (day first), 5-11-26, Excel serial 46331. */
export function parseDateText(raw) {
  const text = latinDigits(String(raw ?? '')).trim().replace(/[‎‏⁦-⁩]/g, '');
  if (!text) return '';
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(text);
  if (match) return validIso(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(text);
  if (match) {
    const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
    return validIso(year, Number(match[2]), Number(match[1]));
  }
  if (/^\d{5}$/.test(text)) {
    const serial = Number(text);
    if (serial > 20000 && serial < 80000) {
      const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
    }
  }
  return null;
}

const looseText = (value) => latinDigits(String(value ?? '')).trim().replace(/\s+/g, ' ').toLowerCase();

export function resolveColumnOptions(column, row) {
  const options = typeof column?.options === 'function' ? column.options(row) : column?.options;
  return Array.isArray(options) ? options : [];
}

/** What a person sees in a cell — used for copy, the formula bar and the status bar. */
export function cellText(column, row) {
  if (!column || !row) return '';
  if (typeof column.sheetValue === 'function') {
    const value = column.sheetValue(row);
    return value === null || value === undefined ? '' : String(value);
  }
  if (column.visible && !column.visible(row)) return '';
  if (column.type === 'badge' && typeof column.text === 'function') return String(column.text(row) ?? '');
  if (typeof column.compute === 'function') {
    const computed = column.compute(row);
    return computed === null || computed === undefined || Number.isNaN(computed) ? '' : String(computed);
  }
  const value = row[column.key];
  if (value === null || value === undefined) return '';
  if (column.type === 'select') {
    if (value === '') return '';
    const option = resolveColumnOptions(column, row).find((item) => String(item.value) === String(value));
    return option ? String(option.label) : String(value);
  }
  return typeof value === 'object' ? '' : String(value);
}

/**
 * Turn pasted text into the value a column stores.
 * @returns {{ ok: true, value } | { ok: false, error: string }}
 */
export function coerceCellValue(column, raw, row = {}) {
  const type = column?.type || 'custom';
  const text = String(raw ?? '');
  if (type === 'number' || type === 'money') {
    const value = parseNumberText(text);
    if (value === null) return { ok: false, error: `«${text.trim()}» ليس رقمًا` };
    if (value === '') return { ok: true, value: '' };
    if (column.min !== undefined && value < Number(column.min)) return { ok: false, error: `«${text.trim()}» أقل من ${column.min}` };
    return { ok: true, value: String(value) };
  }
  if (type === 'date') {
    const value = parseDateText(text);
    if (value === null) return { ok: false, error: `«${text.trim()}» ليس تاريخًا مفهومًا` };
    return { ok: true, value };
  }
  if (type === 'select') {
    const wanted = looseText(text);
    if (!wanted) {
      return column.emptyOption !== undefined ? { ok: true, value: '' } : { ok: false, error: 'هذه الخانة لا تقبل الفراغ' };
    }
    const options = resolveColumnOptions(column, row);
    const match = options.find((option) => looseText(option.value) === wanted)
      || options.find((option) => looseText(option.label) === wanted);
    if (!match) return { ok: false, error: `«${text.trim()}» غير موجود في قائمة ${column.label || 'الخانة'}` };
    return { ok: true, value: match.value };
  }
  if (type === 'multiline') return { ok: true, value: text };
  if (type === 'text') return { ok: true, value: text.replace(/\n+/g, ' ') };
  return { ok: false, error: 'خانة للقراءة فقط' };
}

function columnPatch(column, row, value) {
  return typeof column.onChange === 'function' ? column.onChange(row, value) : { [column.key]: value };
}

function cellAccepts(sheetColumn, row) {
  if (!sheetColumn?.editable) return false;
  const column = sheetColumn.column;
  return !(column.visible && !column.visible(row));
}

/**
 * Plan a paste starting at `start` (sheet coordinates).
 * Rows past the end become `append` patches (the screen decides whether it can add rows).
 * `isRowEditable(row)` = false skips the row (approved, locked, busy).
 */
export function planPaste({ rows = [], columns = [], start, matrix = [], isRowEditable = () => true }) {
  const sheet = sheetColumns(columns);
  const patches = new Map();
  const append = [];
  const errors = [];
  let written = 0;
  let skipped = 0;

  matrix.forEach((values, r) => {
    const rowIndex = start.row + r;
    const existing = rowIndex < rows.length ? rows[rowIndex] : null;
    if (existing && !isRowEditable(existing)) { skipped += values.length; return; }
    let patch = existing ? { ...(patches.get(rowIndex) || {}) } : {};
    values.forEach((raw, c) => {
      const target = sheet[start.col + c];
      const current = { ...(existing || {}), ...patch };
      if (!target) { skipped += 1; return; }
      if (!cellAccepts(target, current)) { if (String(raw).trim()) skipped += 1; return; }
      const result = coerceCellValue(target.column, raw, current);
      if (!result.ok) { errors.push({ address: cellAddress(target.sheetIndex, rowIndex), message: result.error }); return; }
      patch = { ...patch, ...columnPatch(target.column, current, result.value) };
      written += 1;
    });
    if (!Object.keys(patch).length) return;
    if (existing) patches.set(rowIndex, patch);
    else append.push(patch);
  });

  return {
    patches: [...patches.entries()].map(([rowIndex, patch]) => ({ rowIndex, patch })),
    append,
    errors,
    written,
    skipped,
  };
}

/** Copy the top row of the range down through the rest of it (Ctrl+D). */
export function planFillDown({ rows = [], columns = [], range, isRowEditable = () => true }) {
  const sheet = sheetColumns(columns);
  const source = rows[range?.top];
  const patches = [];
  if (!source || range.bottom <= range.top) return { patches, written: 0 };
  let written = 0;
  for (let rowIndex = range.top + 1; rowIndex <= range.bottom; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!row || !isRowEditable(row)) continue;
    let patch = {};
    for (let col = range.left; col <= range.right; col += 1) {
      const target = sheet[col];
      const current = { ...row, ...patch };
      if (!cellAccepts(target, current) || !cellAccepts(target, source)) continue;
      patch = { ...patch, ...columnPatch(target.column, current, source[target.key]) };
      written += 1;
    }
    if (Object.keys(patch).length) patches.push({ rowIndex, patch });
  }
  return { patches, written };
}

/** Empty every clearable cell in the range (Delete). Lists without an empty choice keep their value. */
export function planClear({ rows = [], columns = [], range, isRowEditable = () => true }) {
  const sheet = sheetColumns(columns);
  const patches = [];
  let written = 0;
  for (let rowIndex = range.top; rowIndex <= range.bottom; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!row || !isRowEditable(row)) continue;
    let patch = {};
    for (let col = range.left; col <= range.right; col += 1) {
      const target = sheet[col];
      const current = { ...row, ...patch };
      if (!cellAccepts(target, current)) continue;
      if (target.column.type === 'select' && target.column.emptyOption === undefined) continue;
      patch = { ...patch, ...columnPatch(target.column, current, '') };
      written += 1;
    }
    if (Object.keys(patch).length) patches.push({ rowIndex, patch });
  }
  return { patches, written };
}

/** The range as a text matrix (for copy). */
export function rangeMatrix({ rows = [], columns = [], range }) {
  const sheet = sheetColumns(columns);
  const matrix = [];
  for (let rowIndex = range.top; rowIndex <= range.bottom; rowIndex += 1) {
    const line = [];
    for (let col = range.left; col <= range.right; col += 1) line.push(cellText(sheet[col]?.column, rows[rowIndex]));
    matrix.push(line);
  }
  return matrix;
}

/** Excel's status bar: count of filled cells; sum, average, min, max of the numeric ones. */
export function rangeStats({ rows = [], columns = [], range }) {
  const sheet = sheetColumns(columns);
  let count = 0;
  const numbers = [];
  if (!range) return { cells: 0, count: 0, numericCount: 0, sum: 0, average: null, min: null, max: null };
  for (let rowIndex = range.top; rowIndex <= range.bottom; rowIndex += 1) {
    for (let col = range.left; col <= range.right; col += 1) {
      const target = sheet[col];
      const row = rows[rowIndex];
      if (!target || !row) continue;
      const text = cellText(target.column, row);
      if (text.trim()) count += 1;
      if (!target.numeric) continue;
      const value = parseNumberText(text);
      if (typeof value === 'number') numbers.push(value);
    }
  }
  const sum = numbers.reduce((total, value) => total + value, 0);
  return {
    cells: rangeSize(range),
    count,
    numericCount: numbers.length,
    sum: Math.round(sum * 100) / 100,
    average: numbers.length ? Math.round((sum / numbers.length) * 100) / 100 : null,
    min: numbers.length ? Math.min(...numbers) : null,
    max: numbers.length ? Math.max(...numbers) : null,
  };
}

/**
 * Excel's total row for one column: 'sum' | 'count' | 'average' | (rows) => value.
 * Hidden cells and non-numeric text are ignored by sum/average, like Excel.
 */
export function columnTotal(column, rows = []) {
  const kind = column?.total;
  if (!kind) return null;
  if (typeof kind === 'function') return kind(rows);
  const texts = rows.map((row) => cellText(column, row));
  if (kind === 'count') return texts.filter((text) => text.trim()).length;
  const numbers = texts.map(parseNumberText).filter((value) => typeof value === 'number');
  const sum = numbers.reduce((total, value) => total + value, 0);
  if (kind === 'sum') return Math.round(sum * 100) / 100;
  if (kind === 'average') return numbers.length ? Math.round((sum / numbers.length) * 100) / 100 : null;
  return null;
}
