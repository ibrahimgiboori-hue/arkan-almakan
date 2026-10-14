// Shared presentation rules for workbook previews and the filled XLSX.
const DATA_RULES = [
  ['show_unit','unit'], ['show_qty','qty'],
  ['show_unit_price','unit_price'], ['show_line_total','line_total'],
  ['show_en_desc','description_en',false],
];
const META_RULES = [
  ['show_client','client_name,client_contact','العميل'],
  ['show_project','project_ref,site_location','المرجع وتفاصيل المشروع'],
  ['show_quote_info','quote_no,quote_date','الرقم المرجعي'],
];

export function workbookRuleEnabled(rule, toggles = {}) {
  return Boolean(toggles[rule.toggle] ?? rule.defaultValue);
}

function tokensOf(rule) {
  return String(rule.target || '').split(',').map((token) => token.trim()).filter(Boolean);
}

function appliesToModel(rule, model) {
  const sheets = String(rule.appliesTo || 'ALL').split(',').map((name) => name.trim());
  return sheets.includes('ALL') || sheets.includes(model?.name);
}

export function workbookSectionTitle(model, tokenCell, label) {
  const text = String(label || '').trim();
  return (model.cells || [])
    .filter((cell) => !(cell.tokens || []).length && String(cell.text || '').trim())
    .filter((cell) => cell.col === tokenCell.col && cell.colSpan === tokenCell.colSpan)
    .filter((cell) => cell.row < tokenCell.row && tokenCell.row - cell.row <= 4)
    .filter((cell) => text && (String(cell.text).includes(text) || text.includes(String(cell.text))))
    .sort((a,b) => b.row - a.row)[0] || null;
}

export function resolveWorkbookVisibility(model, visibility = [], toggles = {}) {
  const rules = visibility.filter((rule) => appliesToModel(rule, model));
  for (const [toggle,target,defaultValue = true] of DATA_RULES) {
    if (!rules.some((rule) => rule.toggle === toggle)) {
      rules.push({ toggle,target,defaultValue,elementType:'INLINE_TOKEN',offBehavior:'HIDE_TOKEN' });
    }
  }
  for (const [toggle,target,label] of META_RULES) {
    if (!rules.some((rule) => rule.toggle === toggle)) {
      rules.push({ toggle,target,label,defaultValue:true,elementType:'FLOW_SUBBLOCK',offBehavior:'HIDE_CONTENT' });
    }
  }

  const hiddenTokens = new Set();
  const blankCells = new Set();
  const collapsedRows = new Set();
  const cells = model?.cells || [];
  const collapse = (start,end) => {
    for (let row = start; row <= end; row += 1) collapsedRows.add(row);
  };

  for (const rule of rules) {
    if (rule.toggle === 'show_en_desc' && toggles.language === 'en') continue;
    if (workbookRuleEnabled(rule, toggles)) continue;
    const targets = tokensOf(rule);
    targets.forEach((token) => hiddenTokens.add(token));
    const matching = cells.filter((cell) => cell.tokens?.some((token) => targets.includes(token)));
    if (rule.elementType === 'FLOW_BLOCK' || rule.elementType === 'FLOW_GROUP') {
      for (const cell of matching) {
        const target = cell.tokens.find((token) => targets.includes(token));
        const title = rule.elementType === 'FLOW_GROUP'
          ? workbookSectionTitle(model,cell,rule.label || model.tokenLabels?.[target])
          : null;
        collapse(title?.row ?? cell.row,cell.row + (cell.rowSpan || 1) - 1);
      }
    } else if (rule.offBehavior === 'HIDE_CONTENT') {
      for (const cell of matching) {
        // An inline neighbour (e.g. validity next to the date) keeps its value.
        if (cell.tokens.every((token) => hiddenTokens.has(token))) blankCells.add(cell.address);
      }
      const first = matching.slice().sort((a,b) => a.row-b.row)[0];
      const title = first && workbookSectionTitle(model,first,rule.label);
      if (title) blankCells.add(title.address);
    }
  }

  // A rates-only quote has no contractual sum. Its calculation data stays intact.
  if (toggles.show_qty === false && toggles.show_line_total === false) {
    for (const cell of cells) {
      if (cell.tokens?.some((token) => ['subtotal','vat_amount','grand_total','plain_total'].includes(token))) {
        collapse(cell.row,cell.row + (cell.rowSpan || 1) - 1);
      }
    }
  }
  const collapsedRanges = [];
  for (const row of [...collapsedRows].sort((a,b) => a-b)) {
    const last = collapsedRanges.at(-1);
    if (last && row === last.end + 1) last.end = row;
    else collapsedRanges.push({ start:row,end:row });
  }
  return { hiddenTokens,blankCells,collapsedRows,collapsedRanges };
}

export function fillWorkbookText(template, values = {}, hiddenTokens = new Set()) {
  let source = String(template || '').replace(/\\r\\n|\\n/g,'\n').replace(/\r\n/g,'\n');
  if (hiddenTokens.has('valid_days')) {
    source = source.replace(/(?:\s*[|،,–—-]\s*)?\{\{valid_days\}\}(?:\s*(?:يوماً|يومًا|يوما|يوم|days?))?/gi,'');
  }
  return source.replace(/\{\{([a-z][a-z0-9_]*)\}\}/g,(_match,code) => {
    if (hiddenTokens.has(code)) return '';
    return values[code] == null ? '' : String(values[code]);
  }).split('\n').filter((line) => line.trim()).join('\n').trim();
}

export function workbookLineCells(cells, record) {
  if (!['title','note'].includes(record?.kind)) return cells;
  const number = cells.find((cell) => cell.tokens?.includes('item_no'));
  const description = cells.find((cell) => cell.tokens?.includes('description_ar'));
  if (!description) return cells;
  const total = record.line_total !== '' && record.line_total != null
    ? cells.find((cell) => cell.tokens?.includes('line_total')) : null;
  const endCol = total ? total.col - 1 : Math.max(...cells.map((cell) => cell.col+(cell.colSpan||1)-1));
  return [number,{ ...description,colSpan:endCol-description.col+1 },total].filter(Boolean);
}
