'use client';

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

function tokenValue(text, values) {
  return String(text || '').replace(/\{\{([a-z][a-z0-9_]*)\}\}/g, (_match, code) => {
    const value = values?.[code];
    if (value == null || value === '') return `{${code}}`;
    return String(value);
  });
}

export default function WorkbookModelPreview({ model, values = {} }) {
  if (!model?.cells?.length) {
    return <div className="empty"><h3>لا يوجد مخطط Excel مقروء لهذا النموذج</h3><p>أعد رفع ملف العائلة بعد حفظه من Excel.</p></div>;
  }

  const maxCol = Math.max(...model.cells.map((cell) => cell.col + (cell.colSpan || 1) - 1), 1);
  const maxRow = Math.max(...model.cells.map((cell) => cell.row + (cell.rowSpan || 1) - 1), 1);
  const columnMap = new Map((model.columns || []).map((item) => [item.col, item]));
  const rowMap = new Map((model.rows || []).map((item) => [item.row, item]));

  const columns = Array.from({ length:maxCol }, (_, index) => `${pxWidth(columnMap.get(index + 1))}px`).join(' ');
  const rows = Array.from({ length:maxRow }, (_, index) => `${pxHeight(rowMap.get(index + 1))}px`).join(' ');

  return <div style={{overflow:'auto',padding:12,background:'var(--paper,#fff)'}}>
    <div style={{
      display:'grid',
      gridTemplateColumns:columns,
      gridTemplateRows:rows,
      position:'relative',
      minWidth:'max-content',
      direction:'ltr',
      background:'#fff',
      border:'1px solid var(--hair)',
      boxShadow:'0 8px 24px rgba(0,0,0,.08)',
    }}>
      {model.cells.map((cell) => {
        const dynamic = Array.isArray(cell.tokens) && cell.tokens.length > 0;
        const text = tokenValue(cell.text, values);
        return <div key={cell.address} title={cell.address} style={{
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
    </div>
  </div>;
}
