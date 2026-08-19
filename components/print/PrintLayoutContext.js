'use client';
import { createContext, useContext, useEffect } from 'react';

const MIN_CELL_PCT = 4;
const DRAG_SENSITIVITY = 0.72;
const SNAP_PCT = 0.25;

const PrintLayoutContext = createContext({
  editing:false,
  gridWeights:{},
  setGridWeights:()=>{},
});

function normalize(weights, count, defaults) {
  const source = Array.isArray(weights) && weights.length === count
    ? weights.map(Number)
    : (Array.isArray(defaults) && defaults.length === count
      ? defaults.map(Number)
      : Array.from({length:count}, () => 100 / count));
  const sum = source.reduce((s,x) => s + (Number.isFinite(x) ? x : 0), 0) || 100;
  return source.map(x => Number(x) / sum * 100);
}

function snap(value, step = SNAP_PCT) {
  return Math.round(value / step) * step;
}

function tableKind(table) {
  return ['info-table','data-table','summary-table','payment-table','row-resizable-table']
    .find(name => table.classList.contains(name)) || 'governed-table';
}

function defaultRowWeights(kind, count) {
  if (kind === 'info-table' && count === 4) return [13,37,13,37];
  if (kind === 'summary-table' && count === 2) return [72,28];
  return Array.from({length:count}, () => 100 / count);
}

function IndependentRowEnhancer() {
  const { editing, gridWeights, setGridWeights } = usePrintLayout();

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

          // الصفوف ذات خلية واحدة مدمجة بالكامل لا يوجد فيها حد داخلي قابل للسحب.
          // أما أي صف فيه خليتان أو أكثر فيمكن موازنته بصرف النظر عن الصفوف الأخرى.
          const effectiveCells = cells.filter(cell => Number(cell.colSpan || 1) === 1);
          if (effectiveCells.length !== cells.length) return;

          const rowKey = `${family}:${kind}:${tableIndex}:row:${rowIndex}`;
          const defaults = normalize(null, cells.length, defaultRowWeights(kind, cells.length));
          const current = normalize(gridWeights?.[rowKey], cells.length, defaults);
          row.classList.add('governed-independent-row');
          row.style.gridTemplateColumns = current.map(w => `${w}fr`).join(' ');

          cells.forEach((cell, index) => {
            cell.classList.add('governed-independent-cell');
            if (!editing || index === cells.length - 1) return;

            const handle = document.createElement('span');
            handle.className = 'governed-row-resizer no-print';
            handle.title = 'اسحب الحد لموازنة الخليتين في هذا الصف فقط — نقرتان لإعادة الصف';
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
              const start = normalize(gridWeights?.[rowKey], cells.length, defaults);

              const apply = (clientX) => {
                const rawDelta = ((clientX - startX) / width) * 100 * DRAG_SENSITIVITY;
                const delta = snap(rawDelta);
                let a = start[index] - delta;
                let b = start[index + 1] + delta;

                if (a < MIN_CELL_PCT) {
                  b -= MIN_CELL_PCT - a;
                  a = MIN_CELL_PCT;
                }
                if (b < MIN_CELL_PCT) {
                  a -= MIN_CELL_PCT - b;
                  b = MIN_CELL_PCT;
                }

                a = snap(a);
                b = snap(b);
                const next = [...start];
                next[index] = a;
                next[index + 1] = b;
                row.style.gridTemplateColumns = next.map(w => `${w}fr`).join(' ');
                bubble.textContent = `${a.toFixed(2)}% | ${b.toFixed(2)}%`;
                setGridWeights(rowKey, next);
              };

              bubble.textContent = `${start[index].toFixed(2)}% | ${start[index + 1].toFixed(2)}%`;

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
              row.style.gridTemplateColumns = defaults.map(w => `${w}fr`).join(' ');
              setGridWeights(rowKey, defaults);
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
        });
      });
    });

    return () => cleanup.forEach(fn => fn());
  }, [editing, gridWeights, setGridWeights]);

  return (
    <style jsx global>{`
      table.governed-row-table{display:block!important;width:100%!important;border-collapse:separate!important;border-spacing:0!important;border-top:.22mm solid #9b9b9b!important;border-right:.22mm solid #9b9b9b!important}
      table.governed-row-table>tbody,table.governed-row-table>thead{display:block!important;width:100%!important}
      table.governed-row-table tr.governed-independent-row{display:grid!important;width:100%!important}
      table.governed-row-table tr.governed-independent-row>*{width:auto!important;border:0!important;border-left:.22mm solid #9b9b9b!important;border-bottom:.22mm solid #9b9b9b!important}
      .governed-independent-cell{position:relative!important;min-width:0!important}

      /* الخط المرئي يبقى رفيعاً، لكن منطقة الإمساك أعرض بكثير من الخط نفسه. */
      .governed-row-resizer{position:absolute;left:-9px;top:-2px;bottom:-2px;width:18px;z-index:30;cursor:col-resize;background:transparent;touch-action:none;user-select:none}
      .governed-row-resizer::after{content:'';position:absolute;left:8.5px;top:0;bottom:0;border-left:1px dashed rgba(139,51,50,.24);transition:border-color .1s,box-shadow .1s}
      .governed-row-resizer:hover::after,.governed-row-resizer.dragging::after{border-left:2px solid rgba(139,51,50,.78);box-shadow:0 0 0 2px rgba(139,51,50,.07)}
      .governed-row-hovering,.governed-row-dragging{outline:1px solid rgba(139,51,50,.08);outline-offset:-1px}

      .governed-resize-readout{display:none;position:absolute;left:50%;top:-25px;transform:translateX(-50%);white-space:nowrap;padding:3px 6px;background:#fff;border:1px solid #b9b9b9;color:#333;font-size:10px;line-height:1;box-shadow:0 1px 5px rgba(0,0,0,.12);pointer-events:none;direction:ltr}
      .governed-row-resizer.dragging .governed-resize-readout{display:block}

      table.governed-row-table .print-col-resizer{display:none!important}
      @media print{.governed-row-resizer,.governed-resize-readout{display:none!important}}
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
