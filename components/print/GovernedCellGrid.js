'use client';
import { useRef } from 'react';
import { collectPageGridGuides, usePrintLayout } from '@/components/print/PrintLayoutContext';
import {
  PRINT_GRID_COLUMNS,
  PRINT_GRID_MAJOR_COLUMNS,
  PRINT_GRID_ROW_MM,
  moveTrackBoundary,
  resolveStoredTracks,
  serializeTracks,
  tracksToSpans,
} from '@/lib/print-grid';

const MM_TO_CSS_PX = 96 / 25.4;

function formatTrack(track) {
  return `خط ${track}/${PRINT_GRID_COLUMNS} · عمود ${(track / 2).toFixed(1)}/${PRINT_GRID_MAJOR_COLUMNS}`;
}

export default function GovernedCellGrid({ gridKey, rows = [], className = '' }) {
  const { editing, gridLayouts, rowHeights, setGridLayout, setRowHeight } = usePrintLayout();
  const rootRef = useRef(null);

  return (
    <div ref={rootRef} className={`governed-cell-grid ${className}`.trim()}>
      {rows.map((row, rowIndex) => {
        const cells = row.cells || [];
        const rowKey = `${gridKey}:row:${row.key ?? rowIndex}`;
        const tracks = resolveStoredTracks(gridLayouts?.[rowKey], row.weights, cells.length);
        const spans = tracksToSpans(tracks, cells.length);
        const heightUnits = Number(rowHeights?.[rowKey]) || null;

        return (
          <div
            key={row.key ?? rowIndex}
            className={`governed-cell-row ${row.className || ''}`.trim()}
            data-print-grid-key={rowKey}
            data-print-grid-tracks={tracks.join(',')}
            style={{
              ...row.style,
              gridTemplateColumns:`repeat(${PRINT_GRID_COLUMNS},minmax(0,1fr))`,
              minHeight:heightUnits ? `${heightUnits * PRINT_GRID_ROW_MM}mm` : undefined,
            }}
          >
            {cells.map((cell, cellIndex) => (
              <div
                key={cell.key ?? cellIndex}
                className={`governed-cell ${cell.label ? 'governed-cell-label' : 'governed-cell-value'} ${cell.className || ''}`.trim()}
                dir={cell.dir}
                data-print-grid-span={spans[cellIndex]}
                style={{...cell.style,gridColumn:`span ${spans[cellIndex]}`}}
              >
                {cell.content ?? '—'}
                {editing && cellIndex < cells.length - 1 && (
                  <span
                    className="governed-cell-resizer no-print"
                    title="اسحب الحد على شبكة الصفحة الأم — نقرتان لإعادة الصف"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      event.currentTarget.setPointerCapture?.(event.pointerId);
                      const handle = event.currentTarget;
                      const readout = handle.querySelector('.governed-cell-readout');
                      const rowElement = handle.closest('.governed-cell-row');
                      const startX = event.clientX;
                      const width = rowElement?.getBoundingClientRect().width || 1;
                      const trackWidth = width / PRINT_GRID_COLUMNS;
                      const start = [...tracks];
                      const guides = collectPageGridGuides(rowKey);
                      handle.classList.add('dragging');
                      rowElement?.classList.add('dragging-row');
                      if (readout) readout.textContent = formatTrack(start[cellIndex]);

                      const onMove = (moveEvent) => {
                        const deltaTracks = Math.round((moveEvent.clientX - startX) / trackWidth);
                        const next = moveTrackBoundary({
                          tracks:start,
                          boundaryIndex:cellIndex,
                          desiredTrack:start[cellIndex] - deltaTracks,
                          count:cells.length,
                          guides,
                        });
                        if (readout) readout.textContent = formatTrack(next[cellIndex]);
                        setGridLayout(rowKey, serializeTracks(next, cells.length));
                      };
                      const onUp = () => {
                        handle.classList.remove('dragging');
                        rowElement?.classList.remove('dragging-row');
                        window.removeEventListener('pointermove', onMove);
                        window.removeEventListener('pointerup', onUp);
                      };
                      window.addEventListener('pointermove', onMove);
                      window.addEventListener('pointerup', onUp);
                    }}
                    onDoubleClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setGridLayout(rowKey, null);
                    }}
                  >
                    <span className="governed-cell-readout no-print" />
                  </span>
                )}
              </div>
            ))}

            {editing && (
              <span
                className="governed-cell-height-resizer no-print"
                title="اسحب لضبط ارتفاع الصف بوحدات 2 مم — نقرتان لإلغاء الارتفاع المخصص"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const handle = event.currentTarget;
                  const readout = handle.querySelector('.governed-cell-height-readout');
                  const rowElement = handle.closest('.governed-cell-row');
                  const startY = event.clientY;
                  const naturalUnits = Math.max(2, Math.ceil(
                    (rowElement?.getBoundingClientRect().height || 1) / (PRINT_GRID_ROW_MM * MM_TO_CSS_PX)
                  ));
                  const startUnits = heightUnits || naturalUnits;
                  handle.classList.add('dragging');
                  if (readout) readout.textContent = `${startUnits * PRINT_GRID_ROW_MM} مم`;

                  const onMove = (moveEvent) => {
                    const delta = Math.round((moveEvent.clientY - startY) / (PRINT_GRID_ROW_MM * MM_TO_CSS_PX));
                    const units = Math.max(2, startUnits + delta);
                    if (readout) readout.textContent = `${units * PRINT_GRID_ROW_MM} مم`;
                    setRowHeight(rowKey, units);
                  };
                  const onUp = () => {
                    handle.classList.remove('dragging');
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                  };
                  window.addEventListener('pointermove', onMove);
                  window.addEventListener('pointerup', onUp);
                }}
                onDoubleClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setRowHeight(rowKey, null);
                }}
              >
                <span className="governed-cell-height-readout no-print" />
              </span>
            )}
          </div>
        );
      })}

      <style jsx global>{`
        .governed-cell-grid{width:100%;margin:0 0 2.5mm;border-top:.22mm solid #9b9b9b;border-right:.22mm solid #9b9b9b;break-inside:avoid;page-break-inside:avoid;direction:rtl;text-align:right}
        .governed-cell-row{position:relative;display:grid;width:100%;min-width:0;grid-auto-flow:column}
        .governed-cell-row.dragging-row{outline:1px solid rgba(139,51,50,.2);outline-offset:-1px}
        .governed-cell{position:relative;min-width:0;min-height:6.1mm;display:flex;align-items:center;justify-content:flex-start;padding:1.1mm 1.5mm;border-left:.22mm solid #9b9b9b;border-bottom:.22mm solid #9b9b9b;font-size:8.45pt;line-height:1.35;overflow-wrap:anywhere;background:#fff;color:#222;text-align:right;direction:rtl}
        .governed-cell-label{font-weight:700;background:#f1f1f1;white-space:nowrap}
        .governed-cell.num{direction:ltr;text-align:left;justify-content:flex-end;font-variant-numeric:tabular-nums;white-space:nowrap}
        .governed-cell.bank-value{direction:rtl;text-align:right;justify-content:flex-start;font-variant-numeric:tabular-nums;white-space:nowrap;font-size:8.15pt;letter-spacing:.12px}
        .governed-cell .bank-code{display:inline-block;direction:ltr;unicode-bidi:isolate;white-space:nowrap;text-align:left;font-variant-numeric:tabular-nums}
        .governed-cell-resizer{position:absolute;left:-9px;top:-2px;bottom:-2px;width:18px;z-index:30;cursor:col-resize;background:transparent;touch-action:none;user-select:none}
        .governed-cell-resizer::after{content:'';position:absolute;left:8.5px;top:0;bottom:0;border-left:1px dashed rgba(139,51,50,.24);transition:border-color .1s,box-shadow .1s}
        .governed-cell-resizer:hover::after,.governed-cell-resizer.dragging::after{border-left:2px solid rgba(139,51,50,.78);box-shadow:0 0 0 2px rgba(139,51,50,.07)}
        .governed-cell-readout,.governed-cell-height-readout{display:none;position:absolute;white-space:nowrap;padding:3px 6px;background:#fff;border:1px solid #b9b9b9;color:#333;font-size:10px;line-height:1;box-shadow:0 1px 5px rgba(0,0,0,.12);pointer-events:none}
        .governed-cell-readout{left:50%;top:-25px;transform:translateX(-50%);direction:ltr}
        .governed-cell-resizer.dragging .governed-cell-readout,.governed-cell-height-resizer.dragging .governed-cell-height-readout{display:block}
        .governed-cell-height-resizer{position:absolute;right:0;left:0;bottom:-6px;height:12px;z-index:31;cursor:row-resize;touch-action:none;user-select:none}
        .governed-cell-height-resizer::after{content:'';position:absolute;right:0;left:0;bottom:5.5px;border-bottom:1px dashed rgba(139,51,50,.22)}
        .governed-cell-height-resizer:hover::after,.governed-cell-height-resizer.dragging::after{border-bottom:2px solid rgba(139,51,50,.72)}
        .governed-cell-height-readout{left:8px;bottom:8px;direction:rtl}
        @media print{.governed-cell-resizer,.governed-cell-readout,.governed-cell-height-resizer,.governed-cell-height-readout{display:none!important}}
      `}</style>
    </div>
  );
}
