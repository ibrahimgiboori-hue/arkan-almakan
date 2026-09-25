'use client';

import { useMemo } from 'react';

function pxWidth(item) {
  if (Number.isFinite(Number(item?.widthPx))) return Math.max(1, Number(item.widthPx));
  if (Number.isFinite(Number(item?.width))) return Math.max(1, Number(item.width) * 7);
  return 18;
}

function pxHeight(item) {
  if (Number.isFinite(Number(item?.heightPx))) return Math.max(1, Number(item.heightPx));
  if (Number.isFinite(Number(item?.height))) return Math.max(1, Number(item.height) * 1.33);
  return 18;
}

function tokenValue(text, values) {
  return String(text || '')
    .replace(/\{\{([a-z][a-z0-9_]*)\}\}/g, (_match, code) => {
      const value = values?.[code];
      return value == null ? '' : String(value);
    })
    .replace(/\r\n/g, '\n')
    .trim();
}

function colNameToNumber(name) {
  return String(name || '').toUpperCase().split('').reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0);
}

function parseCellAddress(address) {
  const match = String(address || '').match(/^([A-Z]+)(\d+)$/i);
  if (!match) return null;
  return { col:colNameToNumber(match[1]), row:Number(match[2]) };
}

function parseAnchorRange(rangeText) {
  const parts = String(rangeText || '').split(':').map((part) => parseCellAddress(part.trim())).filter(Boolean);
  if (!parts.length) return null;
  const start = parts[0];
  const end = parts[1] || parts[0];
  return {
    startRow:Math.min(start.row, end.row),
    endRow:Math.max(start.row, end.row),
    startCol:Math.min(start.col, end.col),
    endCol:Math.max(start.col, end.col),
  };
}

function boundsOf(model) {
  const fallback = { startRow:3, endRow:61, startCol:2, endCol:41 };
  const raw = model?.pageConfig?.pageBounds || model?.pageBounds || fallback;
  return {
    startRow:Number(raw.startRow || fallback.startRow),
    endRow:Number(raw.endRow || fallback.endRow),
    startCol:Number(raw.startCol || fallback.startCol),
    endCol:Number(raw.endCol || fallback.endCol),
  };
}

function frameOf(model, bounds) {
  const frame = model?.pageConfig?.contentFrameBounds;
  if (!frame) return bounds;
  return {
    startRow:Number(frame.startRow || bounds.startRow),
    endRow:Number(frame.endRow || bounds.endRow),
    startCol:Number(frame.startCol || bounds.startCol),
    endCol:Number(frame.endCol || bounds.endCol),
  };
}

function borderCss(side) {
  if (!side?.intentional) return 'none';
  const width = Math.max(0.15, Number(side.widthMm || 0.2));
  return `${width}mm ${side.lineStyle || 'solid'} ${side.color || '#111'}`;
}

function hasGeometry(cell) {
  const style = cell?.style || {};
  const fill = String(style.fillColor || '').toUpperCase();
  const visibleFill = Boolean(fill && fill !== '#FFFFFF' && fill !== '#FFF');
  return visibleFill
    || Boolean(style.borders?.top?.intentional)
    || Boolean(style.borders?.right?.intentional)
    || Boolean(style.borders?.bottom?.intentional)
    || Boolean(style.borders?.left?.intentional);
}

function alignItemsFor(vertical) {
  if (vertical === 'top') return 'flex-start';
  if (vertical === 'bottom') return 'flex-end';
  return 'center';
}

function justifyFor(horizontal, rtl) {
  if (horizontal === 'left') return 'flex-start';
  if (horizontal === 'right') return 'flex-end';
  if (horizontal === 'center' || horizontal === 'centerContinuous') return 'center';
  return rtl ? 'flex-end' : 'flex-start';
}

function isInside(cell, bounds) {
  const rowSpan = Math.max(1, Number(cell.rowSpan || 1));
  const colSpan = Math.max(1, Number(cell.colSpan || 1));
  const endRow = Number(cell.row || 0) + rowSpan - 1;
  const endCol = Number(cell.col || 0) + colSpan - 1;
  return endRow >= bounds.startRow && Number(cell.row || 0) <= bounds.endRow
    && endCol >= bounds.startCol && Number(cell.col || 0) <= bounds.endCol;
}

export default function WorkbookFamilyGridPreview({
  model,
  values = {},
  overlayImages = {},
  toggles = {},
  whiteVeilOpacity = 0.82,
  printMode = false,
}) {
  const layout = useMemo(() => {
    if (!model) return null;
    const pageConfig = model.pageConfig || {};
    const bounds = boundsOf(model);
    const frame = frameOf(model, bounds);
    const widthMm = Number(pageConfig.widthMm || 297);
    const heightMm = Number(pageConfig.heightMm || 210);
    const columnMap = new Map((model.columns || []).map((item) => [item.col, item]));
    const rowMap = new Map((model.rows || []).map((item) => [item.row, item]));
    const colsPx = [];
    const rowsPx = [];
    for (let col = bounds.startCol; col <= bounds.endCol; col += 1) colsPx.push(pxWidth(columnMap.get(col)));
    for (let row = bounds.startRow; row <= bounds.endRow; row += 1) rowsPx.push(pxHeight(rowMap.get(row)));
    const baseWidthPx = colsPx.reduce((sum, value) => sum + value, 0) || 1;
    const baseHeightPx = rowsPx.reduce((sum, value) => sum + value, 0) || 1;
    const colScale = widthMm / baseWidthPx;
    const rowScale = heightMm / baseHeightPx;
    let cells = (model.cells || []).filter((cell) => isInside(cell, bounds));
    const authoritativeBoundary = Boolean(pageConfig.boundaryAuthoritative && frame);
    if (authoritativeBoundary) cells = cells.filter((cell) => isInside(cell, frame));
    return { bounds, frame, widthMm, heightMm, colsPx, rowsPx, colScale, rowScale, cells, authoritativeBoundary };
  }, [model]);

  if (!layout) return null;

  const { bounds, frame, widthMm, heightMm, colsPx, rowsPx, colScale, rowScale, cells, authoritativeBoundary } = layout;
  const gridColumns = colsPx.map((value) => `${value * colScale}mm`).join(' ');
  const gridRows = rowsPx.map((value) => `${value * rowScale}mm`).join(' ');

  function colOffsetMm(col) {
    let total = 0;
    for (let current = bounds.startCol; current < col; current += 1) total += Number(colsPx[current - bounds.startCol] || 0) * colScale;
    return total;
  }

  function rowOffsetMm(row) {
    let total = 0;
    for (let current = bounds.startRow; current < row; current += 1) total += Number(rowsPx[current - bounds.startRow] || 0) * rowScale;
    return total;
  }

  function spanWidthMm(startCol, endCol) {
    let total = 0;
    for (let current = startCol; current <= endCol; current += 1) total += Number(colsPx[current - bounds.startCol] || 0) * colScale;
    return total;
  }

  function spanHeightMm(startRow, endRow) {
    let total = 0;
    for (let current = startRow; current <= endRow; current += 1) total += Number(rowsPx[current - bounds.startRow] || 0) * rowScale;
    return total;
  }

  const visibleAssets = (model.placedAssets || []).filter((asset) => {
    if (!asset.showToggle) return true;
    const explicit = toggles?.[asset.showToggle];
    return explicit === undefined || explicit === null ? true : Boolean(explicit);
  });

  return <div
    className="workbook-preview-page workbook-family-solid-grid"
    style={{
      position:'relative',
      width:`${widthMm}mm`,
      minHeight:`${heightMm}mm`,
      background:'#fff',
      boxSizing:'border-box',
      overflow:'hidden',
      boxShadow:printMode ? 'none' : '0 10px 22px rgba(15,23,42,.12)',
      direction:'ltr',
    }}
  >
    {!authoritativeBoundary ? <div
      aria-hidden="true"
      style={{
        position:'absolute',
        left:`${colOffsetMm(frame.startCol)}mm`,
        top:`${rowOffsetMm(frame.startRow)}mm`,
        width:`${spanWidthMm(frame.startCol, frame.endCol)}mm`,
        height:`${spanHeightMm(frame.startRow, frame.endRow)}mm`,
        background:`rgba(255,255,255,${Math.max(0, Math.min(1, Number(whiteVeilOpacity ?? 0.82)))})`,
        zIndex:1,
        pointerEvents:'none',
      }}
    /> : null}

    <div
      aria-hidden="true"
      style={{
        position:'absolute',
        inset:0,
        display:'grid',
        gridTemplateColumns:gridColumns,
        gridTemplateRows:gridRows,
        zIndex:5,
        direction:'ltr',
        pointerEvents:'none',
      }}
    >
      {cells.filter(hasGeometry).map((cell) => {
        const style = cell.style || {};
        const fill = String(style.fillColor || '').toUpperCase();
        const background = fill && fill !== '#FFFFFF' && fill !== '#FFF' ? style.fillColor : 'transparent';
        return <div
          key={`geo-${cell.address || `${cell.row}-${cell.col}`}`}
          style={{
            gridColumn:`${cell.col - bounds.startCol + 1} / span ${Math.max(1, Number(cell.colSpan || 1))}`,
            gridRow:`${cell.row - bounds.startRow + 1} / span ${Math.max(1, Number(cell.rowSpan || 1))}`,
            borderTop:borderCss(style.borders?.top),
            borderRight:borderCss(style.borders?.right),
            borderBottom:borderCss(style.borders?.bottom),
            borderLeft:borderCss(style.borders?.left),
            background,
            boxSizing:'border-box',
          }}
        />;
      })}
    </div>

    <div style={{
      position:'absolute',
      inset:0,
      display:'grid',
      gridTemplateColumns:gridColumns,
      gridTemplateRows:gridRows,
      zIndex:10,
      direction:'ltr',
      pointerEvents:'none',
    }}>
      {cells.map((cell) => {
        const text = tokenValue(cell.text, values);
        if (!text) return null;
        const style = cell.style || {};
        const rtl = /[\u0600-\u06FF]/.test(text);
        const horizontal = String(style.horizontal || '').trim();
        const vertical = String(style.vertical || '').trim();
        return <div
          key={`txt-${cell.address || `${cell.row}-${cell.col}`}`}
          style={{
            gridColumn:`${cell.col - bounds.startCol + 1} / span ${Math.max(1, Number(cell.colSpan || 1))}`,
            gridRow:`${cell.row - bounds.startRow + 1} / span ${Math.max(1, Number(cell.rowSpan || 1))}`,
            color:style.fontColor || '#111827',
            padding:'1px 3px',
            fontSize:style.fontSizePt ? `${style.fontSizePt}pt` : '10.5px',
            fontWeight:style.bold ? 700 : 400,
            fontStyle:style.italic ? 'italic' : 'normal',
            lineHeight:1.15,
            overflow:'hidden',
            whiteSpace:style.wrapText ? 'pre-wrap' : 'nowrap',
            overflowWrap:style.wrapText ? 'break-word' : 'normal',
            textAlign:horizontal === 'left' ? 'left' : horizontal === 'right' ? 'right' : horizontal.startsWith('center') ? 'center' : (rtl ? 'right' : 'left'),
            direction:rtl ? 'rtl' : 'ltr',
            display:'flex',
            alignItems:alignItemsFor(vertical),
            justifyContent:justifyFor(horizontal, rtl),
            boxSizing:'border-box',
          }}
          title={cell.address}
        >{text}</div>;
      })}
    </div>
    {visibleAssets.map((asset) => {
      const anchor = parseAnchorRange(asset.anchorRange);
      if (!anchor) return null;
      const src = overlayImages?.[asset.sourceSetting] || overlayImages?.[asset.id] || '';
      const width = Number(asset.widthMm || 0) || spanWidthMm(anchor.startCol, anchor.endCol);
      const height = Number(asset.heightMm || 0) || spanHeightMm(anchor.startRow, anchor.endRow);
      return <div
        key={asset.id}
        style={{
          position:'absolute',
          left:`${colOffsetMm(anchor.startCol)}mm`,
          top:`${rowOffsetMm(anchor.startRow)}mm`,
          width:`${width}mm`,
          height:`${height}mm`,
          zIndex:Number(asset.zIndex || 22) + 20,
          pointerEvents:'none',
          display:'grid',
          placeItems:'center',
          direction:'ltr',
        }}
      >
        {src ? <img
          src={src}
          alt={asset.label || asset.id}
          style={{ width:'100%', height:'100%', objectFit:asset.fitMode || 'contain' }}
        /> : null}
      </div>;
    })}
  </div>;
}
