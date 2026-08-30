'use client';

import { useEffect } from 'react';
import {
  PRINT_GRID_COLUMNS,
  majorGuideTracks,
  moveTrackBoundary,
  resolveStoredTracks,
  serializeTracks,
  tracksToSpans,
} from '@/lib/print-grid';

function measuredWeights(elements, width) {
  if (!width) return Array.from({ length:elements.length }, () => 100 / elements.length);
  const values = elements.map((element) => Math.max(1, element.getBoundingClientRect().width));
  const total = values.reduce((sum, value) => sum + value, 0) || width;
  return values.map((value) => value / total * 100);
}

function safeIdentity(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}_|:. -]/gu, '')
    .slice(0, 220);
}

function tableIdentity(table, headerCells, index) {
  if (table.dataset.printGridName) return table.dataset.printGridName;
  const classes = [...table.classList].filter(Boolean).sort().join('.');
  const headers = headerCells.map((cell) => safeIdentity(cell.textContent)).filter(Boolean).join('|');
  return safeIdentity(`${classes || 'table'}:${headers || `table-${index}`}`);
}

function ensureColgroup(table, count) {
  let colgroup = table.querySelector(':scope > colgroup');
  if (colgroup) {
    const cols = [...colgroup.children].filter((node) => node.tagName === 'COL');
    return cols.length === count ? { colgroup, cols, created:false } : null;
  }

  colgroup = document.createElement('colgroup');
  for (let index = 0; index < count; index += 1) colgroup.appendChild(document.createElement('col'));
  table.insertBefore(colgroup, table.firstChild);
  return { colgroup, cols:[...colgroup.children], created:true };
}

function applyTable(table, cols, tracks) {
  const spans = tracksToSpans(tracks, cols.length);
  table.style.tableLayout = 'fixed';
  cols.forEach((col, index) => {
    col.style.width = `${(spans[index] / PRINT_GRID_COLUMNS) * 100}%`;
  });
  table.dataset.printGridTracks = tracks.join(',');
}

function addBoundary({
  host,
  isLtr,
  boundaryIndex,
  tracks,
  count,
  width,
  apply,
  keyName,
  defaults,
  setGridLayout,
}) {
  host.style.position = 'relative';
  const handle = document.createElement('span');
  handle.className = `table-cell-boundary no-print ${isLtr ? 'ltr' : 'rtl'}`;
  handle.title = 'اسحب الحد لتغيير عرض الخليتين المجاورتين · نقرتان لإعادة عرض الجدول الافتراضي';
  host.appendChild(handle);

  const onPointerDown = (event) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startTracks = [...tracks];
    let latestTracks = [...startTracks];
    let moved = false;
    const trackWidth = Math.max(1, width) / PRINT_GRID_COLUMNS;
    const guides = majorGuideTracks();

    document.documentElement.classList.add('print-column-resizing');

    const onMove = (moveEvent) => {
      const delta = Math.round((moveEvent.clientX - startX) / trackWidth);
      const desiredTrack = startTracks[boundaryIndex] + (isLtr ? delta : -delta);
      const next = moveTrackBoundary({
        tracks:startTracks,
        boundaryIndex,
        desiredTrack,
        count,
        guides,
      });
      latestTracks = next;
      moved = moved || next.some((value, index) => value !== startTracks[index]);

      // أثناء السحب نغيّر DOM فقط. لا نحدّث React/قاعدة الحفظ مع كل بكسل،
      // لأن ذلك يعيد تركيب المقابض ويؤدي إلى اهتزاز الجدول تحت المؤشر.
      apply(next);
    };

    const finish = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      document.documentElement.classList.remove('print-column-resizing');
      if (moved) setGridLayout(keyName, serializeTracks(latestTracks, count));
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };

  const onDoubleClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const reset = resolveStoredTracks(null, defaults, count);
    apply(reset);
    setGridLayout(keyName, null);
  };

  handle.addEventListener('pointerdown', onPointerDown);
  handle.addEventListener('dblclick', onDoubleClick);

  return () => {
    handle.removeEventListener('pointerdown', onPointerDown);
    handle.removeEventListener('dblclick', onDoubleClick);
    handle.remove();
  };
}

export default function TableBoundaryEditor({
  editing,
  gridLayouts,
  setGridLayout,
  documentKey,
  rootSelector,
  refreshKey,
}) {
  useEffect(() => {
    const cleanup = [];
    const roots = [...document.querySelectorAll(rootSelector)];

    roots.forEach((root) => {
      [...root.querySelectorAll('table')].forEach((table, tableIndex) => {
        const row = table.tHead?.rows?.[0];
        const cells = row ? [...row.cells] : [];
        if (cells.length < 2) return;
        if (!cells.every((cell) => Number(cell.colSpan || 1) === 1 && Number(cell.rowSpan || 1) === 1)) return;

        const ensured = ensureColgroup(table, cells.length);
        if (!ensured) return;
        const { colgroup, cols, created } = ensured;
        const identity = tableIdentity(table, cells, tableIndex);
        const keyName = `${documentKey}:table:${identity}:cells:${cells.length}`;
        const width = table.getBoundingClientRect().width;
        const defaults = measuredWeights(cells, width);
        const tracks = resolveStoredTracks(gridLayouts?.[keyName], defaults, cells.length);
        applyTable(table, cols, tracks);

        if (editing) {
          const isLtr = window.getComputedStyle(table).direction === 'ltr';
          cells.forEach((cell, boundaryIndex) => {
            if (boundaryIndex >= cells.length - 1) return;
            cleanup.push(addBoundary({
              host:cell,
              isLtr,
              boundaryIndex,
              tracks,
              count:cells.length,
              width,
              apply:(next) => applyTable(table, cols, next),
              keyName,
              defaults,
              setGridLayout,
            }));
          });
        }

        if (created) cleanup.push(() => colgroup.remove());
      });
    });

    return () => cleanup.forEach((fn) => fn());
  }, [documentKey, editing, gridLayouts, refreshKey, rootSelector, setGridLayout]);

  return <style jsx global>{`
    .table-cell-boundary{
      position:absolute;
      top:-3px;
      bottom:-3px;
      width:18px;
      z-index:36;
      cursor:col-resize;
      background:transparent;
      touch-action:none;
    }
    .table-cell-boundary.ltr{right:-9px}
    .table-cell-boundary.rtl{left:-9px}
    .table-cell-boundary::after{
      content:'';
      position:absolute;
      top:0;
      bottom:0;
      left:8.5px;
      border-left:1px dashed rgba(139,51,50,.62);
    }
    .table-cell-boundary:hover::after,
    .table-cell-boundary:active::after{
      border-left:2px solid rgba(139,51,50,.98);
    }
    .print-layout-editing table thead th{position:relative}
    html.print-column-resizing,
    html.print-column-resizing *{cursor:col-resize!important;user-select:none!important}
    @media print{.table-cell-boundary{display:none!important}}
  `}</style>;
}
