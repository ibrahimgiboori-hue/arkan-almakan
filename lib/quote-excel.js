import { numberLines, lineTotal, titleSubtotals, totals, VAT_AR, QSTATUS_AR } from './quote-calc';
import { resolveTermNumbers } from './term-numbering';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MONEY_FORMAT = '#,##0.00';
const QTY_FORMAT = '#,##0.###';
const BRAND = '7A1832';
const BRAND_LIGHT = 'F4E8EC';
const HAIR = 'D7D7D7';
const TEXT = '202020';

function safeText(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function dateText(value, language = 'ar') {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return safeText(value, '—');
  return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'ar-SA-u-ca-gregory', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(date);
}

function safeFilePart(value) {
  return safeText(value || 'quotation')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'quotation';
}

function hasTermContent(term) {
  return Boolean(safeText(term?.title).trim() || safeText(term?.body).trim());
}

function thinBorder() {
  return {
    top: { style:'thin', color:{ argb:HAIR } },
    left: { style:'thin', color:{ argb:HAIR } },
    bottom: { style:'thin', color:{ argb:HAIR } },
    right: { style:'thin', color:{ argb:HAIR } },
  };
}

function applyRowFont(row, { bold = false, color = TEXT, size = 11 } = {}) {
  row.eachCell({ includeEmpty:true }, (cell) => {
    cell.font = { name:'Arial', size, bold, color:{ argb:color } };
  });
}

function mergeWrite(ws, rowNo, fromCol, toCol, value, options = {}) {
  if (toCol > fromCol) ws.mergeCells(rowNo, fromCol, rowNo, toCol);
  const cell = ws.getCell(rowNo, fromCol);
  cell.value = value;
  cell.alignment = {
    vertical:'middle',
    horizontal:options.horizontal || 'right',
    wrapText:options.wrapText !== false,
    readingOrder:options.readingOrder,
  };
  if (options.font) cell.font = options.font;
  if (options.fill) cell.fill = options.fill;
  if (options.border) cell.border = options.border;
  return cell;
}

function addSectionTitle(ws, rowNo, colCount, title, isEn) {
  const fill = { type:'pattern', pattern:'solid', fgColor:{ argb:BRAND_LIGHT } };
  const cell = mergeWrite(ws, rowNo, 1, colCount, title, {
    horizontal:isEn ? 'left' : 'right',
    font:{ name:'Arial', size:11, bold:true, color:{ argb:BRAND } },
    fill,
    border:thinBorder(),
  });
  ws.getRow(rowNo).height = 22;
  return cell;
}

function addKeyValue(ws, rowNo, colCount, label, value, isEn) {
  const labelCols = Math.min(2, Math.max(1, colCount - 1));
  if (labelCols > 1) ws.mergeCells(rowNo, 1, rowNo, labelCols);
  if (colCount > labelCols + 1) ws.mergeCells(rowNo, labelCols + 1, rowNo, colCount);
  const labelCell = ws.getCell(rowNo, 1);
  const valueCell = ws.getCell(rowNo, labelCols + 1);
  labelCell.value = label;
  valueCell.value = value || '—';
  labelCell.font = { name:'Arial', size:10.5, bold:true, color:{ argb:BRAND } };
  valueCell.font = { name:'Arial', size:10.5, color:{ argb:TEXT } };
  labelCell.alignment = { vertical:'middle', horizontal:isEn ? 'left' : 'right', wrapText:true };
  valueCell.alignment = { vertical:'middle', horizontal:isEn ? 'left' : 'right', wrapText:true };
  for (let c = 1; c <= colCount; c += 1) ws.getCell(rowNo, c).border = thinBorder();
  ws.getRow(rowNo).height = 21;
}

function saveBuffer(buffer, filename) {
  const blob = new Blob([buffer], { type:XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadQuoteExcel({ quote, lines = [], payments = [] }) {
  if (!quote) throw new Error('بيانات عرض السعر غير متاحة للتصدير.');

  const ExcelModule = await import('exceljs');
  const ExcelJS = ExcelModule.default || ExcelModule;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Arkan Al-Makan';
  workbook.company = 'Arkan Al-Makan';
  workbook.subject = quote.doc_kind === 'boq' ? 'Bill of Quantities' : 'Quotation';
  workbook.title = safeText(quote.quote_no || quote.title_override || 'Quotation');
  workbook.created = new Date();
  workbook.modified = new Date();

  const isEn = quote.language === 'en';
  const tr = (ar, en) => isEn ? en : ar;
  const title = quote.title_override || (quote.doc_kind === 'boq' ? tr('جدول كميات', 'BILL OF QUANTITIES (BOQ)') : tr('عرض سعر', 'QUOTATION'));
  const numbered = numberLines(lines);
  const subs = titleSubtotals(lines, quote.show_qty);
  const computed = totals(quote, lines);
  const rateOnly = !quote.show_qty;
  const showTotalCol = Boolean(quote.show_line_total && !rateOnly);

  const columns = [
    { key:'no', header:tr('م', 'No.'), width:9 },
    { key:'description', header:tr('بيان الأعمال', 'Description of Works'), width:55 },
  ];
  if (quote.show_unit) columns.push({ key:'unit', header:tr('الوحدة', 'Unit'), width:14 });
  if (quote.show_qty) columns.push({ key:'qty', header:tr('الكمية', 'Qty'), width:14 });
  if (quote.show_unit_price) columns.push({ key:'unitPrice', header:tr('الفئة', 'Unit Rate'), width:17 });
  if (showTotalCol) columns.push({ key:'amount', header:tr('الإجمالي', 'Amount'), width:18 });

  const ws = workbook.addWorksheet(tr('عرض السعر', 'Quotation'), {
    views:[{ rightToLeft:!isEn, showGridLines:false }],
    pageSetup:{ paperSize:9, orientation:'landscape', fitToPage:true, fitToWidth:1, fitToHeight:0 },
    properties:{ defaultRowHeight:20 },
  });
  ws.pageMargins = { left:0.3, right:0.3, top:0.5, bottom:0.5, header:0.2, footer:0.2 };
  ws.columns = columns.map((column) => ({ key:column.key, width:column.width }));
  const colCount = columns.length;

  let rowNo = 1;
  mergeWrite(ws, rowNo, 1, colCount, title, {
    horizontal:'center',
    font:{ name:'Arial', size:17, bold:true, color:{ argb:BRAND } },
  });
  ws.getRow(rowNo).height = 30;
  rowNo += 1;
  mergeWrite(ws, rowNo, 1, colCount, tr('أركان المكان للمقاولات', 'Arkan Al-Makan Contracting'), {
    horizontal:'center',
    font:{ name:'Arial', size:10.5, bold:true, color:{ argb:'555555' } },
  });
  rowNo += 2;

  addSectionTitle(ws, rowNo, colCount, tr('بيانات العرض', 'Quotation Details'), isEn);
  rowNo += 1;
  if (quote.show_quote_info !== false) {
    addKeyValue(ws, rowNo++, colCount, tr('رقم العرض', 'Quotation No.'), safeText(quote.quote_no, '—'), isEn);
    addKeyValue(ws, rowNo++, colCount, tr('التاريخ', 'Date'), dateText(quote.quote_date, quote.language), isEn);
    addKeyValue(ws, rowNo++, colCount, tr('الحالة', 'Status'), QSTATUS_AR[quote.status] || safeText(quote.status, '—'), isEn);
  }
  if (quote.show_client !== false) {
    addKeyValue(ws, rowNo++, colCount, tr('العميل', 'Client'), safeText(quote.client_name, '—'), isEn);
    if (quote.client_contact) addKeyValue(ws, rowNo++, colCount, tr('جهة الاتصال', 'Contact'), quote.client_contact, isEn);
  }
  if (quote.show_project !== false) {
    addKeyValue(ws, rowNo++, colCount, tr('المشروع / المرجع', 'Project / Reference'), safeText(quote.project_ref, '—'), isEn);
    if (quote.site_location) addKeyValue(ws, rowNo++, colCount, tr('الموقع', 'Site'), quote.site_location, isEn);
  }
  if (quote.show_validity) {
    const validDays = Number(quote.valid_days || 0);
    const validUntil = quote.quote_date && validDays ? new Date(new Date(quote.quote_date).getTime() + validDays * 86400000) : null;
    addKeyValue(ws, rowNo++, colCount, tr('صلاحية العرض', 'Validity'), `${validDays} ${tr('يوم', 'days')}${validUntil ? ` — ${tr('حتى', 'until')} ${dateText(validUntil, quote.language)}` : ''}`, isEn);
  }
  addKeyValue(ws, rowNo++, colCount, tr('معالجة الضريبة', 'VAT Treatment'), isEn ? ({ exclusive:'VAT added to prices', inclusive:'Prices include VAT', none:'No VAT' }[quote.vat_mode] || safeText(quote.vat_mode)) : (VAT_AR[quote.vat_mode] || '—'), isEn);

  if (quote.show_intro && safeText(quote.intro_text).trim()) {
    rowNo += 1;
    addSectionTitle(ws, rowNo++, colCount, tr('مقدمة العرض', 'Introduction'), isEn);
    mergeWrite(ws, rowNo, 1, colCount, quote.intro_text, {
      horizontal:isEn ? 'left' : 'right',
      font:{ name:'Arial', size:10.5, color:{ argb:TEXT } },
      border:thinBorder(),
    });
    ws.getRow(rowNo).height = Math.max(32, Math.min(90, 18 + Math.ceil(safeText(quote.intro_text).length / 95) * 14));
    rowNo += 2;
  } else {
    rowNo += 1;
  }

  const tableHeaderRow = rowNo;
  columns.forEach((column, index) => {
    const cell = ws.getCell(rowNo, index + 1);
    cell.value = column.header;
    cell.font = { name:'Arial', size:10.5, bold:true, color:{ argb:'FFFFFF' } };
    cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:BRAND } };
    cell.alignment = { vertical:'middle', horizontal:'center', wrapText:true };
    cell.border = thinBorder();
  });
  ws.getRow(rowNo).height = 24;
  rowNo += 1;

  numbered.forEach((line) => {
    const currentRow = rowNo;
    const row = ws.getRow(currentRow);
    const description = isEn ? (line.description_en || line.description_ar || '') : (line.description_ar || '');

    if (line.kind === 'title') {
      row.getCell(1).value = line.number;
      row.getCell(1).font = { name:'Arial', size:10.5, bold:true, color:{ argb:BRAND } };
      row.getCell(1).alignment = { vertical:'middle', horizontal:'center' };
      row.getCell(1).fill = { type:'pattern', pattern:'solid', fgColor:{ argb:BRAND_LIGHT } };
      const descLastCol = showTotalCol ? colCount - 1 : colCount;
      mergeWrite(ws, currentRow, 2, descLastCol, description, {
        horizontal:isEn ? 'left' : 'right',
        font:{ name:'Arial', size:10.5, bold:true, color:{ argb:BRAND } },
        fill:{ type:'pattern', pattern:'solid', fgColor:{ argb:BRAND_LIGHT } },
      });
      if (showTotalCol) {
        row.getCell(colCount).value = Number(subs[line.id] || 0);
        row.getCell(colCount).numFmt = MONEY_FORMAT;
        row.getCell(colCount).font = { name:'Arial', size:10.5, bold:true, color:{ argb:BRAND } };
        row.getCell(colCount).fill = { type:'pattern', pattern:'solid', fgColor:{ argb:BRAND_LIGHT } };
        row.getCell(colCount).alignment = { vertical:'middle', horizontal:'center' };
      }
    } else if (line.kind === 'note') {
      mergeWrite(ws, currentRow, 2, colCount, description, {
        horizontal:isEn ? 'left' : 'right',
        font:{ name:'Arial', size:10, italic:true, color:{ argb:'555555' } },
      });
    } else {
      let col = 1;
      row.getCell(col++).value = line.number;
      row.getCell(col - 1).alignment = { vertical:'middle', horizontal:'center' };
      row.getCell(col).value = description;
      if (!isEn && quote.show_en_desc && line.description_en) row.getCell(col).value = `${description}\n${line.description_en}`;
      row.getCell(col++).alignment = { vertical:'middle', horizontal:isEn ? 'left' : 'right', wrapText:true };
      if (quote.show_unit) {
        row.getCell(col).value = safeText(line.unit, '—');
        row.getCell(col++).alignment = { vertical:'middle', horizontal:'center' };
      }
      if (quote.show_qty) {
        row.getCell(col).value = Number(line.qty || 0);
        row.getCell(col).numFmt = QTY_FORMAT;
        row.getCell(col++).alignment = { vertical:'middle', horizontal:'center' };
      }
      if (quote.show_unit_price) {
        row.getCell(col).value = Number(line.unit_price || 0);
        row.getCell(col).numFmt = MONEY_FORMAT;
        row.getCell(col++).alignment = { vertical:'middle', horizontal:'center' };
      }
      if (showTotalCol) {
        row.getCell(col).value = Number(lineTotal(line, quote.show_qty));
        row.getCell(col).numFmt = MONEY_FORMAT;
        row.getCell(col).alignment = { vertical:'middle', horizontal:'center' };
      }
      applyRowFont(row);
    }

    for (let c = 1; c <= colCount; c += 1) ws.getCell(currentRow, c).border = thinBorder();
    row.height = Math.max(21, Math.min(72, 20 + Math.ceil(description.length / 75) * 11));
    rowNo += 1;
  });

  if (!numbered.length) {
    mergeWrite(ws, rowNo, 1, colCount, tr('لا توجد بنود في هذا العرض', 'No quotation lines'), {
      horizontal:'center',
      font:{ name:'Arial', size:10.5, italic:true, color:{ argb:'777777' } },
      border:thinBorder(),
    });
    rowNo += 1;
  }

  rowNo += 1;
  if (rateOnly) {
    addSectionTitle(ws, rowNo++, colCount, tr('ملاحظة التسعير', 'Pricing Note'), isEn);
    mergeWrite(ws, rowNo, 1, colCount, tr(
      'هذا العرض فئات بلا كميات؛ لا يُعرض مجموع مالي لأن جمع فئات وحدات مختلفة لا يعكس قيمة تعاقدية. تُحتسب المستحقات على الكميات المنفذة فعليًا.',
      'This quotation contains unit rates without quantities; no aggregate value is shown. Entitlements are calculated against actual executed quantities.'
    ), {
      horizontal:isEn ? 'left' : 'right',
      font:{ name:'Arial', size:10.5, color:{ argb:TEXT } },
      border:thinBorder(),
    });
    ws.getRow(rowNo).height = 42;
    rowNo += 1;
  } else {
    addSectionTitle(ws, rowNo++, colCount, tr('الملخص المالي', 'Financial Summary'), isEn);
    const valueCol = colCount;
    const labelEnd = Math.max(1, valueCol - 1);
    const addSummary = (label, value, bold = false) => {
      if (labelEnd > 1) ws.mergeCells(rowNo, 1, rowNo, labelEnd);
      ws.getCell(rowNo, 1).value = label;
      ws.getCell(rowNo, 1).alignment = { horizontal:isEn ? 'left' : 'right', vertical:'middle' };
      ws.getCell(rowNo, valueCol).value = Number(value || 0);
      ws.getCell(rowNo, valueCol).numFmt = MONEY_FORMAT;
      ws.getCell(rowNo, valueCol).alignment = { horizontal:'center', vertical:'middle' };
      for (let c = 1; c <= colCount; c += 1) ws.getCell(rowNo, c).border = thinBorder();
      applyRowFont(ws.getRow(rowNo), { bold, color:bold ? BRAND : TEXT });
      rowNo += 1;
    };
    addSummary(tr('مجموع البنود', 'Items Total'), computed.linesSum);
    if (computed.discount || Number(quote.discount_pct || 0) || Number(quote.discount_amount || 0)) addSummary(tr('الخصم', 'Discount'), computed.discount);
    if (quote.vat_mode !== 'none') addSummary(tr('ضريبة القيمة المضافة', 'VAT'), computed.vat);
    addSummary(tr('المجموع شامل الضريبة', 'Grand Total'), computed.grand, true);
  }

  const quoteTerms = safeText(quote.terms_text).split('\n').map((item) => item.trim()).filter(Boolean);
  if (quoteTerms.length) {
    rowNo += 1;
    addSectionTitle(ws, rowNo++, colCount, tr('شروط عرض السعر', 'Quotation Conditions'), isEn);
    quoteTerms.forEach((term, index) => {
      mergeWrite(ws, rowNo, 1, colCount, `${index + 1}. ${term}`, {
        horizontal:isEn ? 'left' : 'right',
        font:{ name:'Arial', size:10.5, color:{ argb:TEXT } },
        border:thinBorder(),
      });
      ws.getRow(rowNo).height = Math.max(22, Math.min(60, 18 + Math.ceil(term.length / 100) * 13));
      rowNo += 1;
    });
  }

  if (quote.show_payments && payments.length) {
    rowNo += 1;
    addSectionTitle(ws, rowNo++, colCount, tr('شروط الدفع', 'Payment Terms'), isEn);
    const paymentHeaders = [tr('م', 'No.'), tr('الدفعة', 'Payment'), tr('النسبة', '%'), tr('الاستحقاق', 'Due / Milestone')];
    const paymentWidths = [8, 24, 12, Math.max(28, 14 * Math.max(1, colCount - 3))];
    const paymentStart = rowNo;
    paymentHeaders.forEach((header, index) => {
      const cell = ws.getCell(rowNo, index + 1);
      cell.value = header;
      cell.font = { name:'Arial', size:10.5, bold:true, color:{ argb:'FFFFFF' } };
      cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:BRAND } };
      cell.alignment = { vertical:'middle', horizontal:'center', wrapText:true };
      cell.border = thinBorder();
      ws.getColumn(index + 1).width = Math.max(ws.getColumn(index + 1).width || 10, paymentWidths[index]);
    });
    if (colCount > 4) ws.mergeCells(rowNo, 4, rowNo, colCount);
    rowNo += 1;
    payments.forEach((payment, index) => {
      ws.getCell(rowNo, 1).value = index + 1;
      ws.getCell(rowNo, 2).value = isEn && payment.label === 'دفعة' ? 'Payment' : safeText(payment.label, tr('دفعة', 'Payment'));
      ws.getCell(rowNo, 3).value = Number(payment.percent || 0) / 100;
      ws.getCell(rowNo, 3).numFmt = '0.##%';
      ws.getCell(rowNo, 4).value = safeText(payment.trigger_note, '—');
      if (colCount > 4) ws.mergeCells(rowNo, 4, rowNo, colCount);
      for (let c = 1; c <= colCount; c += 1) {
        ws.getCell(rowNo, c).border = thinBorder();
        ws.getCell(rowNo, c).alignment = { vertical:'middle', horizontal:c === 4 ? (isEn ? 'left' : 'right') : 'center', wrapText:true };
      }
      applyRowFont(ws.getRow(rowNo));
      rowNo += 1;
    });
    ws.getRow(paymentStart).height = 23;
  }

  const structuredTerms = (Array.isArray(quote.terms_structured) ? quote.terms_structured : []).filter(hasTermContent);
  const numberedTerms = resolveTermNumbers(structuredTerms, quote.terms_start || '3');
  if (quote.show_terms && numberedTerms.length) {
    rowNo += 1;
    addSectionTitle(ws, rowNo++, colCount, tr('الشروط والأحكام العامة', 'General Terms & Conditions'), isEn);
    numberedTerms.forEach((term) => {
      const titlePart = safeText(term.title).trim();
      const bodyPart = safeText(term.body).trim();
      const text = `${term.number}. ${titlePart}${titlePart && bodyPart ? '\n' : ''}${bodyPart}`.trim();
      mergeWrite(ws, rowNo, 1, colCount, text, {
        horizontal:isEn ? 'left' : 'right',
        font:{ name:'Arial', size:10.5, bold:Boolean(titlePart), color:{ argb:TEXT } },
        border:thinBorder(),
      });
      ws.getRow(rowNo).height = Math.max(24, Math.min(80, 18 + Math.ceil(text.length / 100) * 14));
      rowNo += 1;
    });
  }

  if (quote.show_closing && safeText(quote.closing_text).trim()) {
    rowNo += 1;
    addSectionTitle(ws, rowNo++, colCount, tr('ختام العرض', 'Closing'), isEn);
    mergeWrite(ws, rowNo, 1, colCount, quote.closing_text, {
      horizontal:isEn ? 'left' : 'right',
      font:{ name:'Arial', size:10.5, color:{ argb:TEXT } },
      border:thinBorder(),
    });
    ws.getRow(rowNo).height = Math.max(30, Math.min(80, 18 + Math.ceil(safeText(quote.closing_text).length / 95) * 14));
    rowNo += 1;
  }

  ws.autoFilter = { from:{ row:tableHeaderRow, column:1 }, to:{ row:Math.max(tableHeaderRow, tableHeaderRow + numbered.length), column:colCount } };
  ws.views = [{ state:'frozen', ySplit:tableHeaderRow, rightToLeft:!isEn, showGridLines:false }];
  ws.headerFooter.oddFooter = tr('أركان المكان للمقاولات — عرض سعر', 'Arkan Al-Makan Contracting — Quotation');

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `${safeFilePart(isEn ? 'Quotation' : 'عرض-سعر')}-${safeFilePart(quote.quote_no || quote.client_name || quote.id)}.xlsx`;
  saveBuffer(buffer, filename);
  return { filename, totals:computed };
}
