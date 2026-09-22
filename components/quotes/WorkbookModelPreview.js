'use client';

import { useMemo, useRef } from 'react';

const MM_TO_PX = 96 / 25.4;

function pxWidth(item) {
  if (Number.isFinite(Number(item?.widthPx))) return Math.max(8, Number(item.widthPx));
  if (Number.isFinite(Number(item?.width))) return Math.max(8, Number(item.width) * 7);
  return 18;
}

function pxHeight(item) {
  if (Number.isFinite(Number(item?.heightPx))) return Math.max(8, Number(item.heightPx));
  if (Number.isFinite(Number(item?.height))) return Math.max(8, Number(item.height) * 1.33);
  return 18;
}

function isEnabled(rule, toggles) {
  const value = toggles?.[rule.toggle];
  if (value === undefined || value === null) return Boolean(rule.defaultValue);
  return Boolean(value);
}

function cleanTokenText(text, values, hiddenTokens) {
  const next = String(text || '').replace(/\{\{([a-z][a-z0-9_]*)\}\}/g, (_match, code) => {
    if (hiddenTokens.has(code)) return '';
    const value = values?.[code];
    if (value == null || value === '') return '';
    return String(value);
  });
  return next
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line, index, list) => line !== '' || (index > 0 && index < list.length - 1))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function overlap(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}

function countCollapsedBefore(row, intervals) {
  let total = 0;
  for (const item of intervals) {
    if (item.end < row) total += item.end - item.start + 1;
  }
  return total;
}

function findGroupTitle(model, tokenCell, target) {
  const label = model?.tokenLabels?.[target];
  if (!label) return null;
  return (model.cells || [])
    .filter((cell) => !cell.tokens?.length)
    .filter((cell) => cell.text === label && cell.row < tokenCell.row && tokenCell.row - cell.row <= 4)
    .sort((a,b) => b.row - a.row)[0] || null;
}

function buildLayout({ model, variables, visibility, toggles, repeatGroups, values }) {
  const cells = Array.isArray(model?.cells) ? model.cells : [];
  const variableByCode = new Map((variables || []).map((item) => [item.code, item]));
  const hiddenTokens = new Set();
  const collapsed = [];

  for (const rule of visibility || []) {
    if (rule.appliesTo && rule.appliesTo !== 'ALL' && rule.appliesTo !== model?.name) continue;
    if (isEnabled(rule, toggles)) continue;

    const targets = String(rule.target || '').split(',').map((item) => item.trim()).filter(Boolean);
    if (rule.elementType === 'INLINE_TOKEN' || rule.offBehavior === 'HIDE_CONTENT') {
      targets.forEach((target) => hiddenTokens.add(target));
      continue;
    }

    if (rule.elementType === 'FLOW_BLOCK') {
      for (const target of targets) {
        const tokenCell = cells.find((cell) => cell.tokens?.includes(target));
        if (tokenCell) collapsed.push({ start:tokenCell.row, end:tokenCell.row + (tokenCell.rowSpan || 1) - 1 });
      }
      continue;
    }

    if (rule.elementType === 'FLOW_GROUP') {
      for (const target of targets) {
        const tokenCell = cells.find((cell) => cell.tokens?.includes(target));
        if (!tokenCell) continue;
        const title = findGroupTitle(model, tokenCell, target);
        collapsed.push({
          start:title?.row || tokenCell.row,
          end:tokenCell.row + (tokenCell.rowSpan || 1) - 1,
        });
      }
    }
  }

  collapsed.sort((a,b) => a.start - b.start);
  const mergedCollapsed = [];
  for (const item of collapsed) {
    const prev = mergedCollapsed[mergedCollapsed.length - 1];
    if (prev && item.start <= prev.end + 1) prev.end = Math.max(prev.end, item.end);
    else mergedCollapsed.push({ ...item });
  }

  const groupNames = Array.from(new Set((variables || []).map((item) => item.repeatGroup).filter(Boolean)));
  const repeatOps = [];
  for (const group of groupNames) {
    const codes = new Set((variables || []).filter((item) => item.repeatGroup === group).map((item) => item.code));
    const groupCells = cells.filter((cell) => (cell.tokens || []).some((token) => codes.has(token)));
    if (!groupCells.length) continue;
    const start = Math.min(...groupCells.map((cell) => cell.row));
    const end = Math.max(...groupCells.map((cell) => cell.row + (cell.rowSpan || 1) - 1));
    if (mergedCollapsed.some((item) => overlap(start, end, item.start, item.end))) continue;
    const records = Array.isArray(repeatGroups?.[group]) && repeatGroups[group].length
      ? repeatGroups[group]
      : [values || {}];
    repeatOps.push({ group, codes, start, end, height:end-start+1, records });
  }
  repeatOps.sort((a,b) => a.start - b.start);

  const extraBefore = (row) => repeatOps
    .filter((op) => op.end < row)
    .reduce((sum, op) => sum + Math.max(0, op.records.length - 1) * op.height, 0);

  const mapRow = (row) => row - countCollapsedBefore(row, mergedCollapsed) + extraBefore(row);
  const rendered = [];

  for (const cell of cells) {
    const start = cell.row;
    const end = cell.row + (cell.rowSpan || 1) - 1;
    if (mergedCollapsed.some((item) => overlap(start, end, item.start, item.end))) continue;

    const repeat = repeatOps.find((op) => overlap(start, end, op.start, op.end));
    if (repeat) {
      for (let index = 0; index < repeat.records.length; index += 1) {
        rendered.push({
          ...cell,
          row:mapRow(repeat.start) + (cell.row - repeat.start) + index * repeat.height,
          values:{ ...(values || {}), ...(repeat.records[index] || {}) },
          repeatGroup:repeat.group,
          repeatIndex:index,
        });
      }
    } else {
      rendered.push({
        ...cell,
        row:mapRow(cell.row),
        values:values || {},
      });
    }
  }

  const maxOriginalRow = Math.max(...cells.map((cell) => cell.row + (cell.rowSpan || 1) - 1), 1);
  const visibleOriginalRows = [];
  for (let row = 1; row <= maxOriginalRow; row += 1) {
    if (!mergedCollapsed.some((item) => row >= item.start && row <= item.end)) visibleOriginalRows.push(row);
    const op = repeatOps.find((item) => item.end === row);
    if (op && op.records.length > 1) {
      for (let copy = 1; copy < op.records.length; copy += 1) {
        for (let source = op.start; source <= op.end; source += 1) visibleOriginalRows.push(source);
      }
    }
  }

  return { rendered, hiddenTokens, visibleOriginalRows };
}

export default function WorkbookModelPreview({
  model,
  values = {},
  variables = [],
  visibility = [],
  toggles = {},
  repeatGroups = {},
  overlays = [],
  overlayImages = {},
  overlayPositions = {},
  editableOverlays = false,
  onOverlayMove,
  printMode = false,
}) {
  const shellRef = useRef(null);

  const layout = useMemo(() => buildLayout({
    model, variables, visibility, toggles, repeatGroups, values,
  }), [model, variables, visibility, toggles, repeatGroups, values]);

  if (!model?.cells?.length) {
    return <div className="empty"><h3>لا يوجد مخطط Excel مقروء لهذا النموذج</h3><p>أعد رفع ملف العائلة بعد حفظه من Excel.</p></div>;
  }

  const maxCol = Math.max(...model.cells.map((cell) => cell.col + (cell.colSpan || 1) - 1), 1);
  const columnMap = new Map((model.columns || []).map((item) => [item.col, item]));
  const rowMap = new Map((model.rows || []).map((item) => [item.row, item]));

  const widths = Array.from({ length:maxCol }, (_, index) => pxWidth(columnMap.get(index + 1)));
  const heights = layout.visibleOriginalRows.map((sourceRow) => pxHeight(rowMap.get(sourceRow)));
  const columns = widths.map((value) => `${value}px`).join(' ');
  const rows = heights.map((value) => `${value}px`).join(' ');

  const activeOverlays = (overlays || [])
    .filter((item) => item.modelSheet === model.name)
    .filter((item) => !item.showToggle || toggles?.[item.showToggle] !== false);

  function tokenAnchor(token) {
    return layout.rendered.find((cell) => cell.tokens?.includes(token)) || null;
  }

  function colOffset(col) {
    return widths.slice(0, Math.max(0, col - 1)).reduce((sum, value) => sum + value, 0);
  }

  function rowOffset(row) {
    return heights.slice(0, Math.max(0, row - 1)).reduce((sum, value) => sum + value, 0);
  }

  function beginDrag(event, overlay, defaultX, defaultY) {
    if (!editableOverlays || overlay.movable === false) return;
    event.preventDefault();
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const current = overlayPositions?.[overlay.id] || {};
    const baseX = Number(current.xMm ?? overlay.offsetXmm ?? 0);
    const baseY = Number(current.yMm ?? overlay.offsetYmm ?? 0);
    const target = event.currentTarget;
    target.setPointerCapture?.(pointerId);

    const move = (moveEvent) => {
      const dxMm = (moveEvent.clientX - startX) / MM_TO_PX;
      const dyMm = (moveEvent.clientY - startY) / MM_TO_PX;
      onOverlayMove?.(overlay.id, {
        xMm:Math.round((baseX + dxMm) * 10) / 10,
        yMm:Math.round((baseY + dyMm) * 10) / 10,
      }, false);
    };
    const up = (upEvent) => {
      target.releasePointerCapture?.(pointerId);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      const dxMm = (upEvent.clientX - startX) / MM_TO_PX;
      const dyMm = (upEvent.clientY - startY) / MM_TO_PX;
      onOverlayMove?.(overlay.id, {
        xMm:Math.round((baseX + dxMm) * 10) / 10,
        yMm:Math.round((baseY + dyMm) * 10) / 10,
      }, true);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  }

  return <div style={{
    overflow:printMode ? 'visible' : 'auto',
    padding:printMode ? 0 : 12,
    background:printMode ? '#fff' : 'var(--paper,#fff)',
  }}>
    <div ref={shellRef} style={{
      display:'grid',
      gridTemplateColumns:columns,
      gridTemplateRows:rows,
      position:'relative',
      minWidth:'max-content',
      width:'max-content',
      direction:'ltr',
      background:'#fff',
      border:printMode ? 'none' : '1px solid var(--hair)',
      boxShadow:printMode ? 'none' : '0 8px 24px rgba(0,0,0,.08)',
    }}>
      {layout.rendered.map((cell, index) => {
        const dynamic = Array.isArray(cell.tokens) && cell.tokens.length > 0;
        const text = cleanTokenText(cell.text, cell.values, layout.hiddenTokens);
        if (!text && dynamic) return null;
        return <div key={`${cell.address}-${cell.repeatGroup || 'base'}-${cell.repeatIndex ?? 0}-${index}`} title={cell.address} style={{
          gridColumn:`${cell.col} / span ${cell.colSpan || 1}`,
          gridRow:`${cell.row} / span ${cell.rowSpan || 1}`,
          border:dynamic ? '1px solid #8fbad9' : '1px solid rgba(205,186,186,.55)',
          background:dynamic ? 'rgba(221,235,247,.82)' : '#fff',
          color:dynamic ? '#17365D' : '#2E2E30',
          fontSize:11,
          fontWeight:dynamic ? 650 : 500,
          display:'flex',
          alignItems:'center',
          justifyContent:'center',
          padding:'2px 5px',
          overflow:'hidden',
          whiteSpace:'pre-wrap',
          textAlign:'center',
          direction:/[\u0600-\u06FF]/.test(text) ? 'rtl' : 'ltr',
          lineHeight:1.25,
        }}>
          {text}
        </div>;
      })}

      {activeOverlays.map((overlay) => {
        const anchor = tokenAnchor(overlay.anchorToken);
        if (!anchor) return null;
        const position = overlayPositions?.[overlay.id] || {};
        const xMm = Number(position.xMm ?? overlay.offsetXmm ?? 0);
        const yMm = Number(position.yMm ?? overlay.offsetYmm ?? 0);
        const left = colOffset(anchor.col) + xMm * MM_TO_PX;
        const top = rowOffset(anchor.row) + yMm * MM_TO_PX;
        const src = overlayImages?.[overlay.variableCode] || overlayImages?.[overlay.id] || '';
        return <div
          key={overlay.id}
          onPointerDown={(event)=>beginDrag(event, overlay, left, top)}
          title={editableOverlays ? 'اسحب لتحريك الطبقة' : overlay.id}
          style={{
            position:'absolute',
            left,
            top,
            width:Math.max(8, Number(overlay.widthMm || 20) * MM_TO_PX),
            height:Math.max(8, Number(overlay.heightMm || 20) * MM_TO_PX),
            zIndex:Number(overlay.zIndex || 20),
            cursor:editableOverlays ? 'move' : 'default',
            touchAction:'none',
            display:'flex',
            alignItems:'center',
            justifyContent:'center',
            pointerEvents:editableOverlays ? 'auto' : 'none',
          }}
        >
          {src
            ? <img src={src} alt="" style={{width:'100%',height:'100%',objectFit:'contain',display:'block'}} />
            : <div style={{
                width:'100%',height:'100%',border:'1px dashed #7A1832',
                color:'#7A1832',background:'rgba(255,255,255,.55)',fontSize:10,
                display:'flex',alignItems:'center',justifyContent:'center',
              }}>{overlay.id}</div>}
        </div>;
      })}
    </div>
  </div>;
}
