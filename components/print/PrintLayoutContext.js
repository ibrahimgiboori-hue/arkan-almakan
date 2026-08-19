'use client';
import { createContext, useContext, useEffect } from 'react';
import {
  PRINT_GRID_COLUMNS,
  PRINT_GRID_MAJOR_COLUMNS,
  PRINT_GRID_ROW_MM,
  majorGuideTracks,
  moveTrackBoundary,
  resolveStoredTracks,
  serializeTracks,
  tracksToSpans,
} from '@/lib/print-grid';

const MM_TO_CSS_PX = 96 / 25.4;

const PrintLayoutContext = createContext({
  editing:false,
  gridLayouts:{},
  rowHeights:{},
  setGridLayout:()=>{},
  setRowHeight:()=>{},
});

const TABLE_DEFAULTS = {
  'projects-finance:info-table:4':[12.5,37.5,12.5,37.5],
  'projects-finance:data-table:8':[4.1667,25,8.3333,20.8333,8.3333,8.3333,12.5,12.5],
  'projects-finance:data-table:6':[4.1667,37.5,12.5,12.5,16.6666,16.6667],
  'projects-finance:summary-table:2':[75,25],
  'projects-finance:payment-table:4':[12.5,37.5,12.5,37.5],
};

// الأدوار الدلالية تمنع التوزيع المتساوي الأعمى: النص يأخذ المجال الأكبر،
// الأرقام حقها الوظيفي فقط، والترقيم هو الأضيق. القيم وحدات نسبية
// وتحوّل أدناه إلى نسب مئوية ثم إلى مسارات شبكة الصفحة الأم.
const SEMANTIC_COLUMN_WEIGHTS = Object.freeze({
  'row-index':2,
  text:20,
  'measurement-number':3,
  'date-range':14,
  unit:3,
  quantity:4,
  'unit-price':5,
  amount:7,
});

function tableKind(table) {
  return ['claim-lines-table','info-table','data-table','summary-table','payment-table','row-resizable-table']
    .find(name => table.classList.contains(name)) || 'governed-table';
}

function semanticRowWeights(cells) {
  const roles = cells.map(cell => cell.dataset.printColumnRole || '');
  if (!roles.length || roles.some(role => !SEMANTIC_COLUMN_WEIGHTS[role])) return null;
  const weights = roles.map(role => SEMANTIC_COLUMN_WEIGHTS[role]);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map(weight => (weight / total) * 100);
}

function defaultRowWeights(family, kind, count, cells = []) {
  const semantic = semanticRowWeights(cells);
  if (semantic) return semantic;
  const exact = TABLE_DEFAULTS[`${family}:${kind}:${count}`];
  if (exact) return exact;
  if (kind === 'info-table' && count === 4) return [12.5,37.5,12.5,37.5];
  if (kind === 'summary-table' && count === 2) return [75,25];
  return Array.from({ length:count }, () => 100 / count);
}

function formatTrack(track) {
  return `خط ${track}/${PRINT_GRID_COLUMNS} · عمود ${(track / 2).toFixed(1)}/${PRINT_GRID_MAJOR_COLUMNS}`;
}

export function collectPageGridGuides(currentKey = '') {
  const guides = new Set(majorGuideTracks());
  const rows = document.querySelectorAll('.print-constitution [data-print-grid-tracks]');
  rows.forEach((row) => {
    if (row.dataset.printGridKey === currentKey) return;
    String(row.dataset.printGridTracks || '')
      .split(',')
      .map(Number)
      .filter(Number.isFinite)
      .forEach(track => guides.add(track));
  });
  return [...guides];
}

function applyTrackLayout(row, cells, tracks) {
  const spans = tracksToSpans(tracks, cells.length);
  row.style.gridTemplateColumns = `repeat(${PRINT_GRID_COLUMNS},minmax(0,1fr))`;
  row.dataset.printGridTracks = tracks.join(',');
  cells.forEach((cell, index) => {
    cell.style.gridColumn = `span ${spans[index]}`;
    cell.dataset.printGridSpan = String(spans[index]);
  });
}

function IndependentRowEnhancer() {
  const {
    editing,
    gridLayouts,
    rowHeights,
    setGridLayout,
    setRowHeight,
  } = usePrintLayout();

  useEffect(() => {
    const roots = [...document.querySelectorAll('.print-constitution')];
    const cleanup = [];

    roots.forEach((root) => {
      const family = root.dataset.printFamily || 'general';
      const tables = [...root.querySelectorAll(
        'table.info-table, table.data-table, table.summary-table, table.payment-table, table.row-resizable-table'
      )];

      tables.forEach((table, tableIndex) => {
        const kind = tableKind(table);
        table.classList.add('governed-row-table');
        const rows = [...table.querySelectorAll('tr')];

        rows.forEach((row, rowIndex) => {
          const cells = [...row.cells];
          if (cells.length < 2) return;

          // الصف المدمج بالكامل يبقى خلية واحدة. الصفوف المركبة ذات colspan/rowspan
          // تحفظ بنية HTML الأصلية إلى أن تنتقل صراحة إلى مصفوفة موحدة.
          const plainCells = cells.every(cell => (
            Number(cell.colSpan || 1) === 1 && Number(cell.rowSpan || 1) === 1
          ));
          if (!plainCells) return;

          const rowKey = `${family}:${kind}:${tableIndex}:row:${rowIndex}`;
          const legacyKey = `${family}:${kind}:${cells.length}`;
          const defaults = defaultRowWeights(family, kind, cells.length, cells);
          const storedLayout = gridLayouts?.[rowKey] ?? gridLayouts?.[legacyKey];
          const tracks = resolveStoredTracks(storedLayout, defaults, cells.length);

          row.classList.add('governed-independent-row');
          row.dataset.printGridKey = rowKey;
          if (rowHeights?.[rowKey]) {
            row.style.minHeight = `${Number(rowHeights[rowKey]) * PRINT_GRID_ROW_MM}mm`;
          } else {
            row.style.removeProperty('min-height');
          }
          applyTrackLayout(row, cells, tracks);

          cells.forEach((cell, index) => {
            cell.classList.add('governed-independent-cell');
            if (!editing || index === cells.length - 1) return;

            const handle = document.createElement('span');
            handle.className = 'governed-row-resizer no-print';
            handle.title = 'اسحب الحد على شبكة الصفحة الأم — نقرتان لإعادة الصف';
            cell.appendChild(handle);

            const bubble = document.createElement('span');
            bubble.className = 'governed-resize-readout no-print';
            handle.appendChild(bubble);

            const onEnter = () => row.classList.add('governed-row-hovering');
            const onLeave = () => {
              if (!handle.classList.contains('dragging')) row.classList.remove('governed-row-hovering');
            };

            const onDown = (event) => {
              event.preventDefault();
              event.stopPropagation();
              handle.setPointerCapture?.(event.pointerId);
              handle.classList.add('dragging');
              row.classList.add('governed-row-dragging');

              const startX = event.clientX;
              const width = row.getBoundingClientRect().width || 1;
              const trackWidth = width / PRINT_GRID_COLUMNS;
              const start = resolveStoredTracks(
                gridLayouts?.[rowKey] ?? gridLayouts?.[legacyKey],
                defaults,
                cells.length,
              );
              const guides = collectPageGridGuides(rowKey);

              const apply = (clientX) => {
                // RTL: تحريك الحد إلى اليمين يصغّر الخلية الواقعة على يمينه.
                const deltaTracks = Math.round((clientX - startX) / trackWidth);
                const next = moveTrackBoundary({
                  tracks:start,
                  boundaryIndex:index,
                  desiredTrack:start[index] - deltaTracks,
                  count:cells.length,
                  guides,
                });
                applyTrackLayout(row, cells, next);
                bubble.textContent = formatTrack(next[index]);
                setGridLayout(rowKey, serializeTracks(next, cells.length));
              };

              bubble.textContent = formatTrack(start[index]);
              const onMove = (moveEvent) => apply(moveEvent.clientX);
              const onUp = () => {
                handle.classList.remove('dragging');
                row.classList.remove('governed-row-dragging','governed-row-hovering');
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
              };
              window.addEventListener('pointermove', onMove);
              window.addEventListener('pointerup', onUp);
            };

            const onDouble = (event) => {
              event.preventDefault();
              event.stopPropagation();
              const reset = resolveStoredTracks(null, defaults, cells.length);
              applyTrackLayout(row, cells, reset);
              setGridLayout(rowKey, null);
            };

            handle.addEventListener('pointerenter', onEnter);
            handle.addEventListener('pointerleave', onLeave);
            handle.addEventListener('pointerdown', onDown);
            handle.addEventListener('dblclick', onDouble);
            cleanup.push(() => {
              handle.removeEventListener('pointerenter', onEnter);
              handle.removeEventListener('pointerleave', onLeave);
              handle.removeEventListener('pointerdown', onDown);
              handle.removeEventListener('dblclick', onDouble);
              handle.remove();
            });
          });

          if (editing) {
            const vertical = document.createElement('span');
            vertical.className = 'governed-height-resizer no-print';
            vertical.title = 'اسحب لضبط ارتفاع الصف بوحدات 2 مم — نقرتان لإلغاء الارتفاع المخصص';
            const verticalBubble = document.createElement('span');
            verticalBubble.className = 'governed-height-readout no-print';
            vertical.appendChild(verticalBubble);
            row.appendChild(vertical);

            const onHeightDown = (event) => {
              event.preventDefault();
              event.stopPropagation();
              const startY = event.clientY;
              const naturalUnits = Math.max(2, Math.ceil(row.getBoundingClientRect().height / (PRINT_GRID_ROW_MM * MM_TO_CSS_PX)));
              const startUnits = Number(rowHeights?.[rowKey]) || naturalUnits;
              vertical.classList.add('dragging');
              verticalBubble.textContent = `${startUnits * PRINT_GRID_ROW_MM} مم`;

              const onMove = (moveEvent) => {
                const delta = Math.round((moveEvent.clientY - startY) / (PRINT_GRID_ROW_MM * MM_TO_CSS_PX));
                const units = Math.max(2, startUnits + delta);
                row.style.minHeight = `${units * PRINT_GRID_ROW_MM}mm`;
                verticalBubble.textContent = `${units * PRINT_GRID_ROW_MM} مم`;
                setRowHeight(rowKey, units);
              };
              const onUp = () => {
                vertical.classList.remove('dragging');
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
              };
              window.addEventListener('pointermove', onMove);
              window.addEventListener('pointerup', onUp);
            };
            const onHeightDouble = (event) => {
              event.preventDefault();
              event.stopPropagation();
              row.style.removeProperty('min-height');
              setRowHeight(rowKey, null);
            };
            vertical.addEventListener('pointerdown', onHeightDown);
            vertical.addEventListener('dblclick', onHeightDouble);
            cleanup.push(() => {
              vertical.removeEventListener('pointerdown', onHeightDown);
              vertical.removeEventListener('dblclick', onHeightDouble);
              vertical.remove();
            });
          }
        });
      });
    });

    return () => cleanup.forEach(fn => fn());
  }, [editing, gridLayouts, rowHeights, setGridLayout, setRowHeight]);

  return (
    <style jsx global>{`
      .print-layout-editing.print-constitution{position:relative;isolation:isolate}
      .print-layout-editing.print-constitution::before{
        content:'';position:absolute;inset:0;z-index:20;pointer-events:none;
        background-image:
          linear-gradient(to left,rgba(139,51,50,.16) 1px,transparent 1px),
          linear-gradient(to left,rgba(139,51,50,.055) 1px,transparent 1px),
          linear-gradient(to bottom,rgba(55,55,55,.055) 1px,transparent 1px);
        background-size:
          calc(100% / ${PRINT_GRID_MAJOR_COLUMNS}) 100%,
          calc(100% / ${PRINT_GRID_COLUMNS}) 100%,
          100% ${PRINT_GRID_ROW_MM}mm;
      }
      .print-layout-editing.print-constitution .xlsx-title{
        z-index:21;background:#fff;
      }
      table.governed-row-table{display:block!important;width:100%!important;border-collapse:separate!important;border-spacing:0!important;border-top:.22mm solid #9b9b9b!important;border-right:.22mm solid #9b9b9b!important}
      table.governed-row-table>tbody,table.governed-row-table>thead,table.governed-row-table>tfoot{display:block!important;width:100%!important}
      table.governed-row-table tr.governed-independent-row{position:relative;display:grid!important;width:100%!important;min-height:${PRINT_GRID_ROW_MM * 3}mm}
      table.governed-row-table tr.governed-independent-row>*{width:auto!important;border:0!important;border-left:.22mm solid #9b9b9b!important;border-bottom:.22mm solid #9b9b9b!important}
      .governed-independent-cell{position:relative!important;min-width:0!important}

      .governed-row-resizer{position:absolute;left:-9px;top:-2px;bottom:-2px;width:18px;z-index:30;cursor:col-resize;background:transparent;touch-action:none;user-select:none}
      .governed-row-resizer::after{content:'';position:absolute;left:8.5px;top:0;bottom:0;border-left:1px dashed rgba(139,51,50,.32);transition:border-color .1s,box-shadow .1s}
      .governed-row-resizer:hover::after,.governed-row-resizer.dragging::after{border-left:2px solid rgba(139,51,50,.82);box-shadow:0 0 0 2px rgba(139,51,50,.08)}
      .governed-row-hovering,.governed-row-dragging{outline:1px solid rgba(139,51,50,.12);outline-offset:-1px}
      .governed-resize-readout{display:none;position:absolute;left:50%;top:-27px;transform:translateX(-50%);white-space:nowrap;padding:4px 7px;background:#fff;border:1px solid #a9a9a9;color:#222;font-size:10px;line-height:1;box-shadow:0 1px 5px rgba(0,0,0,.14);pointer-events:none;direction:rtl}
      .governed-row-resizer.dragging .governed-resize-readout{display:block}

      .governed-height-resizer{position:absolute;right:0;left:0;bottom:-7px;height:14px;z-index:31;cursor:row-resize;touch-action:none;background:transparent}
      .governed-height-resizer::after{content:'';position:absolute;right:0;left:0;top:6px;border-top:1px dashed rgba(139,51,50,.22)}
      .governed-height-resizer:hover::after,.governed-height-resizer.dragging::after{border-top:2px solid rgba(139,51,50,.72)}
      .governed-height-readout{display:none;position:absolute;right:8px;top:10px;padding:4px 7px;background:#fff;border:1px solid #aaa;color:#222;font-size:10px;white-space:nowrap;box-shadow:0 1px 5px rgba(0,0,0,.12)}
      .governed-height-resizer.dragging .governed-height-readout{display:block}

      table.governed-row-table .print-col-resizer{display:none!important}
      @media print{
        .print-layout-editing.print-constitution::before{
          content:none!important;display:none!important;background:none!important;
        }
        .governed-row-resizer,.governed-resize-readout,
        .governed-height-resizer,.governed-height-readout{display:none!important}
      }
    `}</style>
  );
}

export function PrintLayoutProvider({ value, children }) {
  return (
    <PrintLayoutContext.Provider value={value}>
      {children}
      <IndependentRowEnhancer />
    </PrintLayoutContext.Provider>
  );
}

export function usePrintLayout() {
  return useContext(PrintLayoutContext);
}
