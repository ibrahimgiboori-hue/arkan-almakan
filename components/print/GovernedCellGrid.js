'use client';
import { useRef } from 'react';
import { usePrintLayout } from '@/components/print/PrintLayoutContext';

const MIN_CELL_PCT = 4;
const DRAG_SENSITIVITY = 0.72;
const SNAP_PCT = 0.25;

function normalize(weights, count) {
  const source = Array.isArray(weights) && weights.length === count
    ? weights.map(Number)
    : Array.from({length:count}, () => 100 / count);
  const sum = source.reduce((s,x) => s + (Number.isFinite(x) ? x : 0), 0) || 100;
  return source.map(x => Number(x) / sum * 100);
}

function snap(value) {
  return Math.round(value / SNAP_PCT) * SNAP_PCT;
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
                    title="اسحب الحد لموازنة الخليتين في هذا الصف فقط — نقرتان لإعادة الصف"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      event.currentTarget.setPointerCapture?.(event.pointerId);
                      const handle = event.currentTarget;
                      const readout = handle.querySelector('.governed-cell-readout');
                      const rowEl = handle.closest('.governed-cell-row');
                      const startX = event.clientX;
                      const width = rowEl?.getBoundingClientRect().width || 1;
                      const start = [...weights];
                      handle.classList.add('dragging');
                      rowEl?.classList.add('dragging-row');
                      if (readout) readout.textContent = `${start[cellIndex].toFixed(2)}% | ${start[cellIndex + 1].toFixed(2)}%`;

                      const onMove = (moveEvent) => {
                        const rawDelta = ((moveEvent.clientX - startX) / width) * 100 * DRAG_SENSITIVITY;
                        const delta = snap(rawDelta);
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

                        rightCell = snap(rightCell);
                        leftCell = snap(leftCell);
                        const next = [...start];
                        next[cellIndex] = rightCell;
                        next[cellIndex + 1] = leftCell;
                        if (readout) readout.textContent = `${rightCell.toFixed(2)}% | ${leftCell.toFixed(2)}%`;
                        setGridWeights(rowKey, next);
                      };

                      const onUp = () => {
                        handle.classList.remove('dragging');
                        rowEl?.classList.remove('dragging-row');
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
                  >
                    <span className="governed-cell-readout no-print" />
                  </span>
                )}
              </div>
            ))}
          </div>
        );
      })}

      <style jsx global>{`
        .governed-cell-grid{width:100%;margin:0 0 2.5mm;border-top:.22mm solid #9b9b9b;border-right:.22mm solid #9b9b9b;break-inside:avoid;page-break-inside:avoid}
        .governed-cell-row{display:grid;width:100%;min-width:0}
        .governed-cell-row.dragging-row{outline:1px solid rgba(139,51,50,.08);outline-offset:-1px}
        .governed-cell{position:relative;min-width:0;min-height:6.1mm;display:flex;align-items:center;padding:1.1mm 1.5mm;border-left:.22mm solid #9b9b9b;border-bottom:.22mm solid #9b9b9b;font-size:8.45pt;line-height:1.35;overflow-wrap:anywhere;background:#fff;color:#222}
        .governed-cell-label{font-weight:700;background:#f1f1f1;white-space:nowrap}
        .governed-cell.num{direction:ltr;text-align:left;justify-content:flex-end;font-variant-numeric:tabular-nums;white-space:nowrap}
        .governed-cell.bank-value{direction:ltr;unicode-bidi:isolate;text-align:left;justify-content:flex-start;font-variant-numeric:tabular-nums;white-space:nowrap;font-size:8.15pt}

        .governed-cell-resizer{position:absolute;left:-9px;top:-2px;bottom:-2px;width:18px;z-index:30;cursor:col-resize;background:transparent;touch-action:none;user-select:none}
        .governed-cell-resizer::after{content:'';position:absolute;left:8.5px;top:0;bottom:0;border-left:1px dashed rgba(139,51,50,.24);transition:border-color .1s,box-shadow .1s}
        .governed-cell-resizer:hover::after,.governed-cell-resizer.dragging::after{border-left:2px solid rgba(139,51,50,.78);box-shadow:0 0 0 2px rgba(139,51,50,.07)}
        .governed-cell-readout{display:none;position:absolute;left:50%;top:-25px;transform:translateX(-50%);white-space:nowrap;padding:3px 6px;background:#fff;border:1px solid #b9b9b9;color:#333;font-size:10px;line-height:1;box-shadow:0 1px 5px rgba(0,0,0,.12);pointer-events:none;direction:ltr}
        .governed-cell-resizer.dragging .governed-cell-readout{display:block}
        @media print{.governed-cell-resizer,.governed-cell-readout{display:none!important}}
      `}</style>
    </div>
  );
}
