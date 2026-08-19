'use client';
import { useMemo, useRef } from 'react';
import { usePrintLayout } from '@/components/print/PrintLayoutContext';

const MIN_CELL_PCT = 5;

function normalize(weights, count) {
  const source = Array.isArray(weights) && weights.length === count
    ? weights.map(Number)
    : Array.from({length:count}, () => 100 / count);
  const sum = source.reduce((s,x) => s + (Number.isFinite(x) ? x : 0), 0) || 100;
  return source.map(x => Number(x) / sum * 100);
}

export default function GovernedCellGrid({
  gridKey,
  rows = [],
  className = '',
}) {
  const { editing, gridWeights, setGridWeights } = usePrintLayout();
  const rootRef = useRef(null);

  return (
    <div ref={rootRef} className={`governed-cell-grid ${className}`.trim()}>
      {rows.map((row, rowIndex) => {
        const cells = row.cells || [];
        const rowKey = `${gridKey}:row:${row.key ?? rowIndex}`;
        const defaults = normalize(row.weights, cells.length);
        const weights = normalize(gridWeights?.[rowKey] || defaults, cells.length);
        const template = weights.map(w => `${w}fr`).join(' ');

        return (
          <div
            key={row.key ?? rowIndex}
            className={`governed-cell-row ${row.className || ''}`.trim()}
            style={{gridTemplateColumns:template}}
          >
            {cells.map((cell, cellIndex) => (
              <div
                key={cell.key ?? cellIndex}
                className={`governed-cell ${cell.label ? 'governed-cell-label' : 'governed-cell-value'} ${cell.className || ''}`.trim()}
                dir={cell.dir}
              >
                {cell.content ?? '—'}
                {editing && cellIndex < cells.length - 1 && (
                  <span
                    className="governed-cell-resizer no-print"
                    title="اسحب الحد لموازنة الخليتين في هذا الصف فقط — نقرتان لإعادة هذا الصف"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const rowEl = event.currentTarget.closest('.governed-cell-row');
                      const startX = event.clientX;
                      const width = rowEl?.getBoundingClientRect().width || 1;
                      const start = [...weights];

                      const onMove = (moveEvent) => {
                        const delta = ((moveEvent.clientX - startX) / width) * 100;
                        let rightCell = start[cellIndex] - delta;
                        let leftCell = start[cellIndex + 1] + delta;

                        if (rightCell < MIN_CELL_PCT) {
                          leftCell -= MIN_CELL_PCT - rightCell;
                          rightCell = MIN_CELL_PCT;
                        }
                        if (leftCell < MIN_CELL_PCT) {
                          rightCell -= MIN_CELL_PCT - leftCell;
                          leftCell = MIN_CELL_PCT;
                        }

                        const next = [...start];
                        next[cellIndex] = rightCell;
                        next[cellIndex + 1] = leftCell;
                        setGridWeights(rowKey, next);
                      };

                      const onUp = () => {
                        window.removeEventListener('pointermove', onMove);
                        window.removeEventListener('pointerup', onUp);
                      };
                      window.addEventListener('pointermove', onMove);
                      window.addEventListener('pointerup', onUp);
                    }}
                    onDoubleClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setGridWeights(rowKey, defaults);
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        );
      })}

      <style jsx global>{`
        .governed-cell-grid{width:100%;margin:0 0 2.5mm;border-top:.22mm solid #9b9b9b;border-right:.22mm solid #9b9b9b;break-inside:avoid;page-break-inside:avoid}
        .governed-cell-row{display:grid;width:100%;min-width:0}
        .governed-cell{position:relative;min-width:0;min-height:6.1mm;display:flex;align-items:center;padding:1.1mm 1.5mm;border-left:.22mm solid #9b9b9b;border-bottom:.22mm solid #9b9b9b;font-size:8.45pt;line-height:1.35;overflow-wrap:anywhere;background:#fff;color:#222}
        .governed-cell-label{font-weight:700;background:#f1f1f1;white-space:nowrap}
        .governed-cell.num{direction:ltr;text-align:left;justify-content:flex-end;font-variant-numeric:tabular-nums;white-space:nowrap}
        .governed-cell.bank-value{direction:ltr;unicode-bidi:isolate;text-align:left;justify-content:flex-start;font-variant-numeric:tabular-nums;white-space:nowrap;font-size:8.15pt}
        .governed-cell-resizer{position:absolute;left:-5px;top:-1px;bottom:-1px;width:10px;z-index:9;cursor:col-resize;background:transparent}
        .governed-cell-resizer::after{content:'';position:absolute;left:4px;top:0;bottom:0;border-left:1px dashed rgba(139,51,50,.34)}
        .governed-cell-resizer:hover::after{border-left-color:rgba(139,51,50,.8)}
        @media print{.governed-cell-resizer{display:none!important}}
      `}</style>
    </div>
  );
}
