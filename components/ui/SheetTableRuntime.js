'use client';

import { useEffect } from 'react';
import { formatLatinNumber } from '@/lib/latin-digits';
import { normalizeRange, parseNumberText, rangeAddress, toClipboardTable } from '@/lib/sheet-engine.mjs';

/**
 * طبقة الإكسل لكل جدول في البرنامج.
 *
 * الجداول المحررة تعمل على محرك الورقة (RawGrid). أما كل جدول عرض آخر داخل لوحة العمل —
 * أيًا كانت الشاشة — فيحصل من هذه الطبقة على سلوك إكسل دون تعديل في الشاشة نفسها:
 * تحديد خلية أو نطاق بالنقر والسحب و Shift، التنقل بالأسهم، Ctrl+A، Ctrl+C إلى إكسل
 * (نص مفصول بـ Tab)، وشريط حالة صغير بالعنوان والعدد والمجموع والمتوسط.
 *
 * لا تغيّر بنية الجدول (React يملكها): تكتفي بسمات data-sheet-* على الخلايا.
 * تُستثنى: جداول RawGrid، معاينات الطباعة، وأي جدول عليه data-sheet="off".
 */

const SCOPE = '[data-work-sheet-mount]';
const EXCLUDED = '[data-sheet-engine],[data-print-flow-root],[data-print-page-physical],[data-print-content],[data-sheet="off"]';
const INTERACTIVE = 'a,button,input,select,textarea,label,summary,details,[contenteditable],[role="button"],[role="link"],[data-sheet-ignore]';
const money = (value) => formatLatinNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function eligibleTable(node) {
  const table = node?.closest?.('table');
  if (!table || !table.closest(SCOPE) || table.closest(EXCLUDED)) return null;
  return table;
}

/** Body cells as a grid of visual slots (colspan/rowspan aware). */
function buildCellMap(table) {
  const rows = [...table.tBodies].flatMap((body) => [...body.rows]);
  const slots = [];
  const positions = new Map();
  rows.forEach((row, r) => {
    slots[r] = slots[r] || [];
    let c = 0;
    for (const cell of row.cells) {
      while (slots[r][c]) c += 1;
      const rowSpan = Math.max(1, cell.rowSpan || 1);
      const colSpan = Math.max(1, cell.colSpan || 1);
      positions.set(cell, { row: r, col: c });
      for (let dr = 0; dr < rowSpan; dr += 1) {
        slots[r + dr] = slots[r + dr] || [];
        for (let dc = 0; dc < colSpan; dc += 1) slots[r + dr][c + dc] = cell;
      }
      c += colSpan;
    }
  });
  const rowCount = slots.length;
  const colCount = slots.reduce((max, line) => Math.max(max, line?.length || 0), 0);
  return {
    rowCount,
    colCount,
    at: (r, c) => slots[r]?.[c] || null,
    positionOf: (cell) => positions.get(cell) || null,
  };
}

const cellText = (cell) => String(cell?.innerText ?? cell?.textContent ?? '').replace(/\s+/g, ' ').trim();

function isEditableFocus() {
  const active = document.activeElement;
  if (!active || active === document.body) return false;
  return Boolean(active.closest('input,select,textarea,[contenteditable="true"],[contenteditable=""],dialog,[role="dialog"]'));
}

export default function SheetTableRuntime() {
  useEffect(() => {
    const state = { table: null, map: null, anchor: null, focus: null, dragging: false, decorated: [], observer: null };
    const bar = document.createElement('div');
    bar.setAttribute('data-sheet-runtime-bar', 'true');
    bar.setAttribute('role', 'status');
    bar.setAttribute('aria-live', 'polite');
    bar.hidden = true;
    document.body.appendChild(bar);

    function undecorate() {
      state.decorated.forEach((cell) => { cell.removeAttribute('data-sheet-cell'); cell.removeAttribute('data-sheet-active'); });
      state.decorated = [];
    }

    function clear() {
      undecorate();
      state.observer?.disconnect();
      Object.assign(state, { table: null, map: null, anchor: null, focus: null, dragging: false, observer: null });
      bar.hidden = true;
    }

    function selectionCells() {
      const range = normalizeRange(state.anchor, state.focus);
      const seen = new Set();
      const matrix = [];
      for (let r = range.top; r <= range.bottom; r += 1) {
        const line = [];
        for (let c = range.left; c <= range.right; c += 1) {
          const cell = state.map.at(r, c);
          const first = cell && !seen.has(cell);
          if (cell) seen.add(cell);
          line.push(first ? cellText(cell) : '');
        }
        matrix.push(line);
      }
      return { range, cells: [...seen], matrix };
    }

    function render() {
      undecorate();
      if (!state.table?.isConnected || !state.anchor) { clear(); return; }
      const { range, cells } = selectionCells();
      cells.forEach((cell) => { cell.setAttribute('data-sheet-cell', 'selected'); state.decorated.push(cell); });
      const active = state.map.at(state.anchor.row, state.anchor.col);
      if (active) { active.setAttribute('data-sheet-active', 'true'); if (!state.decorated.includes(active)) state.decorated.push(active); }
      const texts = cells.map(cellText).filter(Boolean);
      const numbers = texts.map(parseNumberText).filter((value) => typeof value === 'number');
      const sum = numbers.reduce((total, value) => total + value, 0);
      const parts = [rangeAddress(range), `العدد: ${texts.length}`];
      if (numbers.length) parts.push(`المجموع: ${money(sum)}`, `المتوسط: ${money(sum / numbers.length)}`);
      if (cells.length > 1) parts.push('Ctrl+C للنسخ إلى إكسل');
      bar.textContent = parts.join(' · ');
      bar.hidden = false;
    }

    function begin(table, position, extend) {
      if (state.table !== table) {
        clear();
        state.table = table;
        state.observer = new MutationObserver(() => {
          // React replaced rows: rebuild positions, drop the selection if it no longer fits.
          state.map = buildCellMap(table);
          if (!state.anchor || state.anchor.row >= state.map.rowCount || state.focus.row >= state.map.rowCount) clear();
          else render();
        });
        state.observer.observe(table, { childList: true, subtree: true });
      }
      state.map = buildCellMap(table);
      if (extend && state.anchor) state.focus = position;
      else { state.anchor = position; state.focus = position; }
      render();
    }

    function onMouseDown(event) {
      if (event.button !== 0) return;
      if (event.target.closest?.('[data-sheet-runtime-bar]')) return;
      const table = eligibleTable(event.target);
      const cell = event.target.closest?.('td,th');
      if (!table || !cell || !cell.closest('tbody') || event.target.closest(INTERACTIVE)) {
        if (!table) clear();
        return;
      }
      const map = buildCellMap(table);
      const position = map.positionOf(cell);
      if (!position) return;
      event.preventDefault();
      if (isEditableFocus()) document.activeElement.blur?.();
      state.dragging = true;
      begin(table, position, event.shiftKey && state.table === table);
    }

    function onMouseOver(event) {
      if (!state.dragging || event.buttons !== 1 || !state.table) return;
      const cell = event.target.closest?.('td,th');
      if (!cell || cell.closest('table') !== state.table) return;
      const position = state.map.positionOf(cell);
      if (!position || (position.row === state.focus.row && position.col === state.focus.col)) return;
      state.focus = position;
      render();
    }

    function onMouseUp() { state.dragging = false; }

    function onKeyDown(event) {
      if (!state.table || !state.anchor || event.defaultPrevented || isEditableFocus()) return;
      if (!state.table.isConnected) { clear(); return; }
      const mod = event.ctrlKey || event.metaKey;
      if (event.key === 'Escape') { clear(); return; }
      if (mod && (event.key === 'a' || event.key === 'A')) {
        event.preventDefault();
        state.anchor = { row: 0, col: 0 };
        state.focus = { row: state.map.rowCount - 1, col: state.map.colCount - 1 };
        render();
        return;
      }
      const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      if (!arrows[event.key]) return;
      event.preventDefault();
      let [dr, dc] = arrows[event.key];
      if (getComputedStyle(state.table).direction === 'rtl') dc = -dc;
      if (mod) { dr *= state.map.rowCount; dc *= state.map.colCount; }
      const clamp = (value, max) => Math.max(0, Math.min(max - 1, value));
      const from = event.shiftKey ? state.focus : state.anchor;
      const next = { row: clamp(from.row + dr, state.map.rowCount), col: clamp(from.col + dc, state.map.colCount) };
      if (event.shiftKey) state.focus = next;
      else { state.anchor = next; state.focus = next; }
      render();
      state.map.at(next.row, next.col)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }

    function onCopy(event) {
      if (!state.table || !state.anchor || isEditableFocus()) return;
      const selection = window.getSelection?.();
      if (selection && !selection.isCollapsed && String(selection).trim()) return;
      const { matrix, range } = selectionCells();
      event.clipboardData?.setData('text/plain', toClipboardTable(matrix));
      event.preventDefault();
      bar.textContent = `نُسخ ${rangeAddress(range)} — الصقه في إكسل.`;
    }

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseover', onMouseOver);
    window.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('copy', onCopy);
    return () => {
      clear();
      bar.remove();
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseover', onMouseOver);
      window.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('copy', onCopy);
    };
  }, []);

  return null;
}

