'use client';
import { createContext, useContext, useEffect } from 'react';

const MIN_CELL_PCT = 5;

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

function defaultRowWeights(kind, count) {
  if (kind === 'info-table' && count === 4) return [13,37,13,37];
  return Array.from({length:count}, () => 100 / count);
}

function IndependentRowEnhancer() {
  const { editing, gridWeights, setGridWeights } = usePrintLayout();

  useEffect(() => {
    const roots = [...document.querySelectorAll('.print-constitution')];
    const cleanup = [];

    roots.forEach((root) => {
      const family = root.dataset.printFamily || 'general';
      const tables = [...root.querySelectorAll('table.info-table, table.row-resizable-table')];

      tables.forEach((table, tableIndex) => {
        const kind = table.classList.contains('info-table') ? 'info-table' : 'row-resizable-table';
        table.classList.add('governed-row-table');
        const rows = [...table.querySelectorAll('tr')];

        rows.forEach((row, rowIndex) => {
          const cells = [...row.cells];
          if (cells.length < 2 || cells.some(cell => Number(cell.colSpan || 1) !== 1)) return;

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
            handle.title = 'اسحب هذا الحد لموازنة الخليتين في هذا الصف فقط — نقرتان لإعادة الصف';
            cell.appendChild(handle);

            const onDown = (event) => {
              event.preventDefault();
              event.stopPropagation();
              const startX = event.clientX;
              const width = row.getBoundingClientRect().width || 1;
              const start = normalize(gridWeights?.[rowKey], cells.length, defaults);

              const onMove = (moveEvent) => {
                const delta = ((moveEvent.clientX - startX) / width) * 100;
                let a = start[index] - delta;
                let b = start[index + 1] + delta;
                if (a < MIN_CELL_PCT) { b -= MIN_CELL_PCT - a; a = MIN_CELL_PCT; }
                if (b < MIN_CELL_PCT) { a -= MIN_CELL_PCT - b; b = MIN_CELL_PCT; }
                const next = [...start];
                next[index] = a;
                next[index + 1] = b;
                row.style.gridTemplateColumns = next.map(w => `${w}fr`).join(' ');
                setGridWeights(rowKey, next);
              };

              const onUp = () => {
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

            handle.addEventListener('pointerdown', onDown);
            handle.addEventListener('dblclick', onDouble);
            cleanup.push(() => {
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
      .governed-row-resizer{position:absolute;left:-5px;top:-1px;bottom:-1px;width:10px;z-index:11;cursor:col-resize;background:transparent}
      .governed-row-resizer::after{content:'';position:absolute;left:4px;top:0;bottom:0;border-left:1px dashed rgba(139,51,50,.34)}
      .governed-row-resizer:hover::after{border-left-color:rgba(139,51,50,.8)}
      table.governed-row-table .print-col-resizer{display:none!important}
      @media print{.governed-row-resizer{display:none!important}}
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
