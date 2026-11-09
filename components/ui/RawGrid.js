'use client';

/**
 * RawGrid — الدفتر الجدولي المشترك.
 * الصفحة تصف الأعمدة ومعانيها فقط؛ المحرك يقرر سلوك الخلية والتنقل والحالة.
 * الاختيار المتعدد جزء من المحرك: هو نطاق إجراء، ولا يغيّر البيانات بمجرد التحديد.
 *
 * طبقة الإكسل (lib/sheet-engine.mjs) جزء من المحرك نفسه، فتسري على كل شاشة تستخدمه:
 * حروف أعمدة وعناوين خلايا، شريط صيغة، تحديد نطاق بالسحب أو Shift+الأسهم، التنقل
 * بالأسهم، نسخ ولصق من إكسل وإليه، Ctrl+D تعبئة لأسفل، Delete للمسح، وشريط حالة
 * بالعدد والمجموع والمتوسط. الشاشة تمرّر onPatchRows/onAppendRows لتستقبل اللصق دفعة واحدة.
 */

import { useEffect, useRef, useState } from 'react';
import { recordSelectionSet, selectionState } from '@/lib/record-selection';
import { formatLatinNumber } from '@/lib/latin-digits';
import {
  cellAddress,
  cellText,
  columnTotal,
  expandPasteMatrix,
  moveCell,
  normalizeRange,
  parseClipboardTable,
  planClear,
  planFillDown,
  planPaste,
  rangeAddress,
  rangeContains,
  rangeMatrix,
  rangeSize,
  rangeStats,
  sheetColumns,
  toClipboardTable,
} from '@/lib/sheet-engine.mjs';
import styles from './RawGrid.module.css';

function resolveOptions(options, row) {
  if (typeof options === 'function') return options(row) || [];
  return options || [];
}

function fieldMeta(column, rowIndex) {
  return {
    'data-grid-field':'true',
    'data-grid-row':String(rowIndex),
    'data-grid-column':String(column.key),
    'data-cell-type':column.type || 'custom',
  };
}

function Cell({ column, row, rowIndex, onPatchRow, disabled, cellProps = {} }) {
  const value = row[column.key];
  const isVisible = column.visible ? column.visible(row) : true;
  const fieldClass = `${styles.field} ${column.savedStyle ? styles.fieldSaved : ''}`.trim();
  const meta = fieldMeta(column, rowIndex);

  function patch(nextValue) {
    const change = column.onChange
      ? column.onChange(row, nextValue)
      : { [column.key]: nextValue };
    onPatchRow?.(change);
  }

  function commit(event) {
    if (typeof column.onCommit === 'function') column.onCommit(row, event.target.value);
  }

  if (!isVisible && ['date', 'money', 'number', 'multiline', 'text', 'select'].includes(column.type)) {
    return (
      <td {...cellProps} data-cell-type={column.type} style={column.minWidth ? { minWidth: column.minWidth } : undefined}>
        <span className={styles.fieldMuted}>{column.placeholderWhenHidden ?? '—'}</span>
      </td>
    );
  }

  switch (column.type) {
    case 'index':
      return <td {...cellProps} className={styles.cellIndex} data-cell-type="index">{column.render(row)}</td>;

    case 'badge': {
      const tone = column.tone ? column.tone(row) : 'muted';
      const toneClass = tone === 'saved' ? styles.badgeSaved : tone === 'new' ? styles.badgeNew : styles.badgeMuted;
      return (
        <td {...cellProps} className={styles.cellBadge} data-cell-type="badge">
          <span className={`${styles.badge} ${toneClass}`}>{column.text(row)}</span>
        </td>
      );
    }

    case 'date':
      return (
        <td {...cellProps} data-cell-type="date">
          <input {...meta} type="date" className={fieldClass} value={value || ''} disabled={disabled} onChange={(e) => patch(e.target.value)} onBlur={commit} />
        </td>
      );

    case 'money':
    case 'number':
      return (
        <td {...cellProps} data-cell-type={column.type}>
          <input
            {...meta}
            type="number"
            inputMode="decimal"
            className={fieldClass}
            min={column.min ?? 0}
            step={column.step ?? '0.01'}
            value={value ?? ''}
            disabled={disabled}
            onChange={(e) => patch(e.target.value)}
            onBlur={commit}
          />
        </td>
      );

    case 'multiline':
      return (
        <td {...cellProps} data-cell-type="multiline" style={column.minWidth ? { minWidth: column.minWidth } : undefined}>
          <textarea
            {...meta}
            data-grid-enter-moves="false"
            className={fieldClass}
            rows={column.rows || 2}
            placeholder={column.placeholder}
            value={value ?? ''}
            disabled={disabled}
            onChange={(e) => patch(e.target.value)}
            onBlur={commit}
          />
        </td>
      );

    case 'text':
      return (
        <td {...cellProps} data-cell-type="text" style={column.minWidth ? { minWidth: column.minWidth } : undefined}>
          <input {...meta} type="text" className={fieldClass} placeholder={column.placeholder} value={value ?? ''} disabled={disabled} onChange={(e) => patch(e.target.value)} onBlur={commit} />
        </td>
      );

    case 'select': {
      const opts = resolveOptions(column.options, row);
      return (
        <td {...cellProps} data-cell-type="select" style={column.minWidth ? { minWidth: column.minWidth } : undefined}>
          <select {...meta} className={fieldClass} value={value ?? ''} disabled={disabled} onChange={(e) => patch(e.target.value)} onBlur={commit}>
            {column.emptyOption !== undefined && <option value="">{column.emptyOption}</option>}
            {opts.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </td>
      );
    }

    case 'computed': {
      // A formula column (Excel ƒ): read-only, its rule shows in the formula bar.
      const computed = column.compute ? column.compute(row) : value;
      const shown = column.format ? column.format(computed, row) : computed;
      const empty = shown === '' || shown === null || shown === undefined || Number.isNaN(shown);
      return (
        <td {...cellProps} className={styles.cellComputed} data-cell-type="computed" data-numeric={column.numeric ? 'true' : undefined}>
          {empty ? <span className={styles.fieldMuted}>—</span> : shown}
        </td>
      );
    }

    case 'action':
      return <td {...cellProps} className={styles.actionCell} data-cell-type="action">{column.render(row, { disabled })}</td>;

    case 'custom':
    default:
      return <td {...cellProps} data-cell-type={column.type || 'custom'}>{column.render ? column.render(row, { disabled }) : null}</td>;
  }
}

function SelectionHeader({ checked, indeterminate, disabled, label, onChange }) {
  const ref = useRef(null);
  if (ref.current) ref.current.indeterminate = Boolean(indeterminate);
  return <th data-column-type="selection" style={{width:44,minWidth:44,textAlign:'center'}}>
    <input
      ref={ref}
      type="checkbox"
      aria-label={checked ? `إلغاء ${label}` : label}
      title={checked ? 'إلغاء تحديد الظاهر' : 'تحديد كل الظاهر المتاح'}
      checked={checked}
      disabled={disabled}
      onChange={onChange}
    />
  </th>;
}

function moveVertical(table, target, delta) {
  const row = Number(target.getAttribute('data-grid-row'));
  const column = target.getAttribute('data-grid-column');
  if (!Number.isInteger(row) || !column) return false;
  const next = table.querySelector(`[data-grid-field="true"][data-grid-row="${row + delta}"][data-grid-column="${CSS.escape(column)}"]`);
  if (!next || next.disabled) return false;
  next.focus();
  if (typeof next.select === 'function' && next.tagName.toLowerCase() === 'input' && next.type === 'text') next.select();
  return true;
}

const money = (value) => formatLatinNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TEXT_LIKE_INPUTS = new Set(['text', 'search', 'number', 'email', 'tel', 'url', '']);

function sheetPosition(element) {
  const cell = element?.closest?.('td[data-sheet-row]');
  if (!cell) return null;
  return { row: Number(cell.getAttribute('data-sheet-row')), col: Number(cell.getAttribute('data-sheet-col')) };
}

function isTextLike(element) {
  if (!element || element.getAttribute?.('data-grid-field') !== 'true') return false;
  const tag = element.tagName.toLowerCase();
  return tag === 'textarea' || (tag === 'input' && TEXT_LIKE_INPUTS.has(element.type));
}

function hasTextSelection(element) {
  try {
    return typeof element.selectionStart === 'number' && element.selectionStart !== element.selectionEnd;
  } catch {
    return false;
  }
}

export default function RawGrid({
  columns,
  rows,
  rowKey,
  savedFlag,
  onPatchRow,
  onPatchRows,
  onAppendRows,
  rowDisabled,
  selection = null,
  busy = false,
  loading = false,
  sheet = true,
  emptyMessage = 'لا توجد بيانات بعد.',
  totalsLabel = 'الإجمالي',
}) {
  const tableRef = useRef(null);
  const dragRef = useRef(false);
  const mouseFocusRef = useRef(false);
  const editRef = useRef(null);
  const [cursor, setCursor] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    const stop = () => { dragRef.current = false; };
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, []);

  if (loading) return <div className={styles.loading}>جارٍ التحميل…</div>;
  if (!rows?.length) return <div className={styles.empty}>{emptyMessage}</div>;

  const hasSelection = Boolean(selection && typeof selection.onChange === 'function');
  const selected = hasSelection ? recordSelectionSet(selection.selectedKeys) : new Set();
  const selectable = (row) => !busy && (selection?.isSelectable ? Boolean(selection.isSelectable(row)) : true);
  const selectionInfo = hasSelection
    ? selectionState(rows, selected, { key: rowKey, selectable })
    : null;

  const sheetCols = sheetColumns(columns);
  const sheetByGridIndex = new Map(sheetCols.map((entry) => [entry.gridIndex, entry]));
  const sheetEnabled = sheet !== false && sheetCols.length > 0;
  const bounds = { rowCount: rows.length, colCount: sheetCols.length };
  const liveCursor = cursor && cursor.anchor.row < rows.length && cursor.focus.row < rows.length && cursor.anchor.col < sheetCols.length ? cursor : null;
  const range = sheetEnabled && liveCursor ? normalizeRange(liveCursor.anchor, liveCursor.focus) : null;
  const rowEditable = (row) => !busy && !rowDisabled?.(row);
  const errorCells = new Set(notice?.errorCells || []);

  function toggleSelection(row) {
    if (!hasSelection || !selectable(row)) return;
    const key = String(rowKey(row));
    const next = new Set(selected);
    if (next.has(key)) next.delete(key); else next.add(key);
    selection.onChange(next);
  }

  function toggleVisibleSelection() {
    if (!hasSelection || !selectionInfo?.visibleKeys.length) return;
    const next = new Set(selected);
    if (selectionInfo.allVisibleSelected) selectionInfo.visibleKeys.forEach((key) => next.delete(key));
    else selectionInfo.visibleKeys.forEach((key) => next.add(key));
    selection.onChange(next);
  }

  function focusCell(position) {
    const cell = tableRef.current?.querySelector(`td[data-sheet-row="${position.row}"][data-sheet-col="${position.col}"]`);
    if (!cell) return;
    const field = cell.querySelector('[data-grid-field="true"]');
    editRef.current = null;
    if (field && !field.disabled) {
      field.focus();
      if (isTextLike(field) && typeof field.select === 'function') { try { field.select(); } catch {} }
    } else {
      cell.focus();
    }
  }

  function applyChanges(patches, append = []) {
    const list = patches
      .filter(({ rowIndex }) => rows[rowIndex])
      .map(({ rowIndex, patch }) => ({ key: rowKey(rows[rowIndex]), patch }));
    if (list.length) {
      if (typeof onPatchRows === 'function') onPatchRows(list);
      else list.forEach(({ key, patch }) => onPatchRow?.(key, patch));
    }
    if (append.length && typeof onAppendRows === 'function') {
      onAppendRows(append);
      return { appended: append.length, dropped: 0 };
    }
    return { appended: 0, dropped: append.length };
  }

  function pasteText(text) {
    if (busy || !range) return;
    const matrix = expandPasteMatrix(parseClipboardTable(text), range);
    if (!matrix.length) return;
    const plan = planPaste({ rows, columns, start: { row: range.top, col: range.left }, matrix, isRowEditable: rowEditable });
    const { appended, dropped } = applyChanges(plan.patches, plan.append);
    const parts = [`لُصقت ${plan.written} خلية`];
    if (appended) parts.push(`أُضيف ${appended} صف`);
    if (dropped) parts.push(`${dropped} صف زائد عن الجدول لم يُلصق`);
    if (plan.skipped) parts.push(`${plan.skipped} خلية مقفلة أو للقراءة فقط تُركت`);
    if (plan.errors.length) {
      const sample = plan.errors.slice(0, 3).map((error) => `${error.address}: ${error.message}`).join('، ');
      parts.push(`${plan.errors.length} خلية لم تُقبل — ${sample}${plan.errors.length > 3 ? '…' : ''}`);
    }
    setNotice({ tone: plan.errors.length || dropped ? 'error' : 'ok', text: parts.join(' · '), errorCells: plan.errors.map((error) => error.address) });
    const height = matrix.length;
    const width = Math.max(...matrix.map((line) => line.length));
    setCursor({
      anchor: { row: range.top, col: range.left },
      focus: { row: Math.min(rows.length - 1, range.top + height - 1), col: Math.min(sheetCols.length - 1, range.left + width - 1) },
    });
  }

  function copyRange(event, cut = false) {
    if (!sheetEnabled || !range) return false;
    const target = event.target;
    if (rangeSize(range) === 1 && isTextLike(target) && hasTextSelection(target)) return false;
    const text = toClipboardTable(rangeMatrix({ rows, columns, range }));
    if (event.clipboardData) {
      event.clipboardData.setData('text/plain', text);
      event.preventDefault();
    } else {
      navigator.clipboard?.writeText(text).catch(() => {});
    }
    if (cut && !busy) applyChanges(planClear({ rows, columns, range, isRowEditable: rowEditable }).patches);
    setNotice({ tone: 'ok', text: `${cut ? 'قُصّ' : 'نُسخ'} ${rangeAddress(range)} — الصقه في إكسل أو في جدول آخر.` });
    return true;
  }

  function onFocus(event) {
    if (!sheetEnabled) return;
    const position = sheetPosition(event.target);
    if (!position) return;
    // Like Excel: one click selects the cell (typing replaces it, arrows move);
    // a second click, a double-click or F2 edits inside it.
    editRef.current = null;
    if (mouseFocusRef.current && isTextLike(event.target)) {
      const field = event.target;
      setTimeout(() => { if (document.activeElement === field && editRef.current !== field) { try { field.select(); } catch {} } }, 0);
    }
    mouseFocusRef.current = false;
    setCursor((previous) => (previous
      && previous.anchor.row === position.row && previous.anchor.col === position.col
      && previous.focus.row === position.row && previous.focus.col === position.col
      ? previous
      : { anchor: position, focus: position }));
  }

  function onMouseDown(event) {
    if (!sheetEnabled || event.button !== 0) return;
    const position = sheetPosition(event.target);
    if (!position) return;
    if (event.shiftKey && liveCursor) {
      event.preventDefault();
      setCursor({ anchor: liveCursor.anchor, focus: position });
      return;
    }
    dragRef.current = position;
    const field = event.target.closest('[data-grid-field="true"]');
    if (field && document.activeElement === field) editRef.current = field;
    else if (field) {
      mouseFocusRef.current = true;
      setTimeout(() => { mouseFocusRef.current = false; }, 0);
    }
    if (event.target.closest('td') === event.target) {
      event.preventDefault();
      setCursor({ anchor: position, focus: position });
      focusCell(position);
    }
  }

  function openPicker(field) {
    if (field?.tagName.toLowerCase() !== 'input' || !['date', 'datetime-local'].includes(field.type)) return false;
    if (field.readOnly || field.disabled || typeof field.showPicker !== 'function') return false;
    try { field.showPicker(); return true; } catch { return false; }
  }

  function onDoubleClick(event) {
    const field = event.target.closest?.('[data-grid-field="true"]');
    if (!sheetEnabled || !field) return;
    editRef.current = field;
    openPicker(field);
  }

  function onMouseOver(event) {
    const start = dragRef.current;
    if (!sheetEnabled || !start || event.buttons !== 1) return;
    const position = sheetPosition(event.target);
    if (!position || (position.row === start.row && position.col === start.col)) return;
    window.getSelection?.()?.removeAllRanges();
    setCursor({ anchor: start, focus: position });
  }

  function keyDown(event) {
    const target = event.target;
    if (target instanceof HTMLElement && target.getAttribute('data-grid-field') === 'true'
      && event.key === 'Enter' && target.getAttribute('data-grid-enter-moves') !== 'false') {
      if (target.tagName.toLowerCase() === 'select' && !event.shiftKey) return;
      if (moveVertical(event.currentTarget, target, event.shiftKey ? -1 : 1)) event.preventDefault();
      return;
    }
    if (!sheetEnabled || !liveCursor) return;
    const position = sheetPosition(target);
    if (!position) return;
    const mod = event.ctrlKey || event.metaKey;
    const isField = target.getAttribute('data-grid-field') === 'true';
    const tag = target.tagName.toLowerCase();
    const editing = editRef.current === target;

    if (event.key === 'F2' && isField) {
      editRef.current = target;
      if (isTextLike(target)) { try { const end = String(target.value || '').length; target.setSelectionRange(end, end); } catch {} }
      event.preventDefault();
      return;
    }
    if (event.key === 'Escape' && range && rangeSize(range) > 1) {
      setCursor({ anchor: liveCursor.anchor, focus: liveCursor.anchor });
      return;
    }
    if (mod && (event.key === 'd' || event.key === 'D')) {
      event.preventDefault();
      if (busy || !range) return;
      const plan = planFillDown({ rows, columns, range, isRowEditable: rowEditable });
      applyChanges(plan.patches);
      setNotice({ tone: 'ok', text: plan.written ? `عُبّئ ${plan.written} خلية من الصف الأول في ${rangeAddress(range)}.` : 'حدّد نطاقًا من صفين أو أكثر لتعبئته لأسفل.' });
      return;
    }
    if (mod && (event.key === 'a' || event.key === 'A') && !editing) {
      event.preventDefault();
      setCursor({ anchor: { row: 0, col: 0 }, focus: { row: rows.length - 1, col: sheetCols.length - 1 } });
      return;
    }
    if (mod && (event.key === 'c' || event.key === 'C' || event.key === 'x' || event.key === 'X') && !isField) {
      copyRange(event, event.key.toLowerCase() === 'x');
      return;
    }
    if ((event.key === 'Delete' || (event.key === 'Backspace' && !isField)) && range && (rangeSize(range) > 1 || !isTextLike(target))) {
      event.preventDefault();
      if (busy) return;
      const plan = planClear({ rows, columns, range, isRowEditable: rowEditable });
      applyChanges(plan.patches);
      setNotice(plan.written ? { tone: 'ok', text: `مُسحت ${plan.written} خلية.` } : null);
      return;
    }

    const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (!arrows[event.key]) return;
    if (tag === 'select' && event.altKey) return;
    if (event.altKey && event.key === 'ArrowDown' && openPicker(target)) { event.preventDefault(); return; }
    if (editing && isTextLike(target)) return;
    if (tag === 'textarea' && !editing && (event.key === 'ArrowUp' || event.key === 'ArrowDown') && String(target.value || '').includes('\n')) return;
    event.preventDefault();
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
    let [rowDelta, colDelta] = arrows[event.key];
    if (rtl) colDelta = -colDelta;
    if (mod) { rowDelta *= rows.length; colDelta *= sheetCols.length; }
    if (event.shiftKey) {
      setCursor({ anchor: liveCursor.anchor, focus: moveCell(liveCursor.focus, { rowDelta, colDelta }, bounds) });
      return;
    }
    const next = moveCell(liveCursor.anchor, { rowDelta, colDelta }, bounds);
    setCursor({ anchor: next, focus: next });
    focusCell(next);
  }

  function onPaste(event) {
    if (!sheetEnabled || !range || !sheetPosition(event.target)) return;
    const text = event.clipboardData?.getData('text/plain') ?? '';
    const matrix = parseClipboardTable(text);
    if (!matrix.length) return;
    const single = matrix.length === 1 && matrix[0].length === 1;
    if (single && rangeSize(range) === 1 && isTextLike(event.target)) return;
    event.preventDefault();
    pasteText(text);
  }

  const activeEntry = liveCursor ? sheetCols[liveCursor.anchor.col] : null;
  const activeRow = liveCursor ? rows[liveCursor.anchor.row] : null;
  const activeFormula = activeEntry?.column.formula;
  const activeText = activeEntry && activeRow ? cellText(activeEntry.column, activeRow) : '';
  const stats = range && rangeSize(range) > 1 ? rangeStats({ rows, columns, range }) : null;

  return (
    <div
      className={styles.wrap}
      data-work-ledger="true"
      data-ledger-behavior="semantic-grid"
      data-keyboard-policy="enter-tab-native"
      data-sheet-engine={sheetEnabled ? 'excel' : undefined}
      data-selection-surface={hasSelection ? 'true' : undefined}
      data-selection-count={hasSelection ? selected.size : undefined}
    >
      {sheetEnabled && (
        <div className={styles.sheetBar} data-sheet-bar="formula">
          <span className={styles.sheetAddress} dir="ltr">{range ? rangeAddress(range) : '—'}</span>
          <span className={styles.sheetFx} aria-hidden="true">ƒx</span>
          <span className={styles.sheetFormula} title={activeFormula || activeText}>
            {activeEntry
              ? <><b>{activeEntry.column.label}</b>{activeFormula ? <span className={styles.sheetFormulaText}>= {activeFormula}</span> : <bdi>{activeText || '—'}</bdi>}</>
              : <span className={styles.sheetHint}>اختر خلية — انسخ من إكسل والصق هنا، Shift+الأسهم لتحديد نطاق، Ctrl+D تعبئة لأسفل</span>}
          </span>
        </div>
      )}
      <div className={styles.scroll}>
        <table
          ref={tableRef}
          className={styles.table}
          onKeyDown={keyDown}
          onFocus={onFocus}
          onMouseDown={onMouseDown}
          onMouseOver={onMouseOver}
          onDoubleClick={onDoubleClick}
          onCopy={(event) => copyRange(event)}
          onCut={(event) => copyRange(event, true)}
          onPaste={onPaste}
        >
          <thead>
            {sheetEnabled && (
              <tr data-sheet-letters="true">
                {hasSelection && <th className={styles.letterCell} aria-hidden="true" />}
                {columns.map((column, gridIndex) => {
                  const entry = sheetByGridIndex.get(gridIndex);
                  const active = entry && range && entry.sheetIndex >= range.left && entry.sheetIndex <= range.right;
                  return <th key={`letter-${column.key}`} className={styles.letterCell} data-sheet-letter-active={active ? 'true' : undefined} aria-hidden="true">{entry ? entry.letter : ''}</th>;
                })}
              </tr>
            )}
            <tr>
              {hasSelection && <SelectionHeader
                checked={selectionInfo.allVisibleSelected}
                indeterminate={selectionInfo.someVisibleSelected}
                disabled={!selectionInfo.visibleKeys.length}
                label={selection.selectAllLabel || 'تحديد كل الظاهر المتاح'}
                onChange={toggleVisibleSelection}
              />}
              {columns.map((column) => <th key={column.key} data-column-type={column.type || 'custom'} style={column.minWidth ? { minWidth: column.minWidth } : undefined}>{column.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => {
              const key = rowKey(row);
              const selectionKey = String(key);
              const saved = savedFlag ? savedFlag(row) : false;
              const disabled = busy || Boolean(rowDisabled?.(row));
              const rowSelectable = hasSelection && selectable(row);
              const rowSelected = hasSelection && selected.has(selectionKey);
              const rowInRange = Boolean(range) && rowIndex >= range.top && rowIndex <= range.bottom;
              return (
                <tr
                  key={key}
                  className={saved ? styles.rowSaved : styles.rowNew}
                  data-record-row="true"
                  data-row-disabled={disabled ? 'true' : 'false'}
                  data-record-selected={rowSelected ? 'true' : 'false'}
                >
                  {hasSelection && <td data-cell-type="selection" style={{width:44,minWidth:44,textAlign:'center'}}>
                    {rowSelectable
                      ? <input
                          type="checkbox"
                          checked={rowSelected}
                          aria-label={selection.ariaLabel ? selection.ariaLabel(row) : 'تحديد السجل'}
                          onChange={() => toggleSelection(row)}
                        />
                      : selection.renderUnavailable
                        ? selection.renderUnavailable(row)
                        : <span aria-hidden="true">—</span>}
                  </td>}
                  {columns.map((column, gridIndex) => {
                    const entry = sheetEnabled ? sheetByGridIndex.get(gridIndex) : null;
                    let cellProps = {};
                    if (entry) {
                      const active = liveCursor && liveCursor.anchor.row === rowIndex && liveCursor.anchor.col === entry.sheetIndex;
                      cellProps = {
                        tabIndex: -1,
                        'data-sheet-row': rowIndex,
                        'data-sheet-col': entry.sheetIndex,
                        'data-sheet-selected': rangeContains(range, rowIndex, entry.sheetIndex) ? 'true' : undefined,
                        'data-sheet-active': active ? 'true' : undefined,
                        'data-sheet-error': errorCells.has(cellAddress(entry.sheetIndex, rowIndex)) ? 'true' : undefined,
                      };
                    } else if (sheetEnabled && column.type === 'index' && rowInRange) {
                      cellProps = { 'data-sheet-rowhead': 'true' };
                    }
                    return <Cell key={column.key} column={{ ...column, savedStyle: saved }} row={row} rowIndex={rowIndex} disabled={disabled} cellProps={cellProps} onPatchRow={(patch) => onPatchRow?.(key, patch)} />;
                  })}
                </tr>
              );
            })}
          </tbody>
          {columns.some((column) => column.total) && (
            <tfoot>
              <tr data-sheet-totals="true">
                {hasSelection && <td aria-hidden="true" />}
                {columns.map((column, gridIndex) => {
                  const total = columnTotal(column, rows);
                  const label = gridIndex === 0 && !column.total;
                  const shown = total === null || total === undefined
                    ? (label ? totalsLabel : '')
                    : (typeof total === 'number' && column.total !== 'count' ? money(total) : total);
                  return <td key={`total-${column.key}`} data-cell-type={column.type || 'custom'} data-total={column.total ? String(typeof column.total === 'function' ? 'custom' : column.total) : undefined}>{shown}</td>;
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {sheetEnabled && (
        <div className={styles.sheetStatus} data-sheet-bar="status" aria-live="polite">
          <span className={notice?.tone === 'error' ? styles.sheetStatusError : undefined}>
            {notice ? notice.text : (range ? `المحدد ${rangeAddress(range)}` : 'جاهز')}
          </span>
          {stats && (
            <span className={styles.sheetStats}>
              <span>العدد: {stats.count}</span>
              {stats.numericCount > 0 && <><span>المجموع: {money(stats.sum)}</span><span>المتوسط: {money(stats.average)}</span></>}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function RawGridFooter({ actions, summary }) {
  return (
    <div className={styles.footer} data-work-dock="true">
      <div className={styles.footerActions} data-work-dock-actions="true">{actions}</div>
      <div className={styles.footerSummary} data-work-dock-summary="true">{summary}</div>
    </div>
  );
}

export { styles as rawGridStyles };
