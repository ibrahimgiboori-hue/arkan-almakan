import ExcelJS from 'exceljs';
import { lineTotal, numberLines, titleSubtotals, totals } from './quote-calc.js';
import { resolveTermNumbers } from './term-numbering.js';
import { SYSTEM } from './system-constitution.js';

const COLORS = {
  maroon: 'FF733234', dark: 'FF41262B', pale: 'FFF6F1F1',
  white: 'FFFFFFFF', ink: 'FF26313A', line: 'FFD7C9CA',
};
const EN_UNIT = { 'م2':'m²', 'م²':'m²', 'م3':'m³', 'م³':'m³', 'م':'m', 'م طولي':'LM', 'م.ط':'LM', 'عدد':'No.', 'قطعة':'No.', 'يوم':'Day', 'ساعة':'Hr', 'طن':'Ton', 'كجم':'kg', 'لتر':'L', 'مقطوعية':'Lump Sum' };

const dateOnly = (value) => value ? String(value).slice(0, 10) : '';
const safeFileName = (value) => String(value || 'quotation').replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').slice(0, 72);

export function quoteExcelFileName(quote) {
  return `${safeFileName(quote?.quote_no || 'quotation')}.xlsx`;
}

export function buildQuoteExcel({ quote, lines = [], payments = [], settings = {} }) {
  if (!quote?.id) throw new Error('عرض السعر غير محدد.');
  const english = quote.language === 'en';
  const tr = (ar, en) => english ? en : ar;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = settings.company_name_en || settings.company_name_ar || 'Arkan Al Makan';
  workbook.calcProperties.fullCalcOnLoad = true;
  const sheet = workbook.addWorksheet(tr('عرض السعر', 'Quotation'), {
    views: [{ rightToLeft: !english }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    properties: { defaultRowHeight: 20 },
  });
  sheet.pageMargins = { left: 0.3, right: 0.3, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 };
  sheet.headerFooter.oddFooter = tr('صفحة &P من &N', 'Page &P of &N');

  const rateOnly = !quote.show_qty;
  const showTotal = Boolean(quote.show_line_total) && !rateOnly;
  const columns = [
    { key: 'no', header: tr('م', 'No.'), width: 9 },
    { key: 'description', header: tr('بيان الأعمال', 'Description of Works'), width: 62 },
    ...(quote.show_unit ? [{ key: 'unit', header: tr('الوحدة', 'Unit'), width: 15 }] : []),
    ...(quote.show_qty ? [{ key: 'qty', header: tr('الكمية', 'Qty'), width: 15 }] : []),
    ...(quote.show_unit_price ? [{ key: 'price', header: tr('الفئة', 'Unit Rate'), width: 20 }] : []),
    ...(showTotal ? [{ key: 'amount', header: tr('الإجمالي', 'Amount'), width: 22 }] : []),
  ];
  sheet.columns = columns.map(({ key, width }) => ({ key, width }));
  const last = columns.length;
  const moneyFormat = '#,##0.00;[Red](#,##0.00)';
  const colorFill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const mergeText = (label, { bold = false, pale = false } = {}) => {
    const row = sheet.addRow([label]);
    sheet.mergeCells(row.number, 1, row.number, last);
    row.getCell(1).font = { name: 'Arial', size: bold ? 12 : 10, bold, color: { argb: bold ? COLORS.maroon : COLORS.ink } };
    row.getCell(1).alignment = { vertical: 'middle', horizontal: english ? 'left' : 'right', wrapText: true };
    if (pale) row.getCell(1).fill = colorFill(COLORS.pale);
    row.height = bold ? 27 : 32;
    return row;
  };
  const meta = (label, value) => {
    if (value == null || value === '') return;
    const row = sheet.addRow([`${label}: ${value}`]);
    sheet.mergeCells(row.number, 1, row.number, last);
    row.getCell(1).font = { name: 'Arial', size: 10, color: { argb: COLORS.ink } };
    row.getCell(1).alignment = { horizontal: english ? 'left' : 'right', vertical: 'middle' };
    row.height = 21;
  };

  mergeText(english ? (settings.company_name_en || settings.company_name_ar || 'Arkan Al Makan') : (settings.company_name_ar || 'أركان المكان'), { bold: true });
  mergeText(quote.title_override || (quote.doc_kind === 'boq' ? tr('جدول كميات', 'BILL OF QUANTITIES (BOQ)') : tr('عرض سعر', 'QUOTATION')), { bold: true, pale: true });
  if (quote.show_quote_info !== false) {
    meta(tr('رقم العرض', 'Quotation No.'), quote.quote_no);
    meta(tr('التاريخ', 'Date'), dateOnly(quote.quote_date));
  }
  if (quote.show_client !== false) {
    meta(tr('العميل', 'Client'), quote.client_name);
    meta(tr('جهة الاتصال', 'Contact'), quote.client_contact);
  }
  if (quote.show_project !== false) {
    meta(tr('المشروع / المرجع', 'Project / Reference'), quote.project_ref);
    meta(tr('الموقع', 'Site'), quote.site_location);
  }
  if (quote.show_validity) meta(tr('صلاحية العرض (يوم)', 'Validity (days)'), quote.valid_days);
  if (quote.show_intro && quote.intro_text) mergeText(quote.intro_text, { pale: true });
  sheet.addRow([]);
  const header = sheet.addRow(columns.map((column) => column.header));
  header.height = 28;
  header.eachCell((cell) => {
    cell.fill = colorFill(COLORS.maroon);
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: COLORS.white } };
    cell.alignment = { vertical: 'middle', horizontal: english ? 'left' : 'right', wrapText: true };
  });
  sheet.views = [{ rightToLeft: !english, state: 'frozen', ySplit: header.number }];
  sheet.pageSetup.printTitlesRow = `${header.number}:${header.number}`;

  const numbered = numberLines(lines);
  const subs = titleSubtotals(lines, quote.show_qty);
  const itemAmountCells = [];
  const sectionAmounts = new Map();
  let currentSection = null;
  for (const line of numbered) {
    const row = sheet.addRow([]);
    row.getCell(1).value = line.kind === 'note' ? '' : line.number;
    row.getCell(2).value = english
      ? (line.description_en || line.description_ar || '')
      : [line.description_ar || '', quote.show_en_desc ? line.description_en : ''].filter(Boolean).join('\n');
    if (line.kind === 'item') {
      if (quote.show_unit) row.getCell(columns.findIndex((column) => column.key === 'unit') + 1).value = english ? (EN_UNIT[line.unit] || line.unit || '') : (line.unit || '');
      if (quote.show_qty) row.getCell(columns.findIndex((column) => column.key === 'qty') + 1).value = Number(line.qty || 0);
      if (quote.show_unit_price) row.getCell(columns.findIndex((column) => column.key === 'price') + 1).value = Number(line.unit_price || 0);
      if (showTotal) {
        const amount = row.getCell(last);
        const qtyCol = columns.findIndex((column) => column.key === 'qty') + 1;
        const priceCol = columns.findIndex((column) => column.key === 'price') + 1;
        const result = lineTotal(line, quote.show_qty);
        amount.value = priceCol ? { formula: `ROUND(${row.getCell(qtyCol).address}*${row.getCell(priceCol).address},2)`, result } : result;
        itemAmountCells.push(amount.address);
        if (currentSection) sectionAmounts.get(currentSection).cells.push(amount.address);
      }
    } else if (line.kind === 'title') {
      currentSection = line.id;
      sectionAmounts.set(line.id, { row, cells: [] });
      if (showTotal) row.getCell(last).value = Number(subs[line.id] || 0);
      row.eachCell((cell) => { cell.fill = colorFill(COLORS.pale); cell.font = { name: 'Arial', bold: true, color: { argb: COLORS.maroon } }; });
    } else {
      row.getCell(2).font = { name: 'Arial', italic: true, color: { argb: COLORS.dark } };
    }
    row.height = line.kind === 'item' ? 39 : 26;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = { bottom: { style: 'hair', color: { argb: COLORS.line } } };
      cell.alignment = { vertical: 'middle', wrapText: true, horizontal: cell.type === ExcelJS.ValueType.Number || cell.type === ExcelJS.ValueType.Formula ? 'right' : (english ? 'left' : 'right') };
      if (typeof cell.value === 'number' || cell.type === ExcelJS.ValueType.Formula) cell.numFmt = cell === row.getCell(last) && showTotal ? moneyFormat : '#,##0.##';
    });
  }
  if (showTotal) for (const [id, section] of sectionAmounts) {
    if (section.cells.length) section.row.getCell(last).value = {
      formula: `SUM(${section.cells.join(',')})`,
      result: Number(subs[id] || 0),
    };
  }

  const amounts = totals(quote, lines);
  if (!rateOnly) {
    const valueRow = (label, value, formula = null, strong = false) => {
      const row = sheet.addRow([]);
      row.getCell(2).value = label;
      row.getCell(last).value = formula ? { formula, result: value } : value;
      row.getCell(last).numFmt = moneyFormat;
      row.getCell(2).font = row.getCell(last).font = { name: 'Arial', bold: strong, color: { argb: strong ? COLORS.white : COLORS.ink } };
      if (strong) row.eachCell({ includeEmpty: true }, (cell) => { cell.fill = colorFill(COLORS.maroon); });
      row.height = strong ? 27 : 22;
      return row;
    };
    const itemFormula = showTotal && itemAmountCells.length ? `SUM(${itemAmountCells.join(',')})` : null;
    const sumRow = valueRow(tr('مجموع البنود', 'Line total'), amounts.linesSum, itemFormula);
    const sumAddress = sumRow.getCell(last).address;
    const discount = Number(quote.discount_pct || 0);
    const fixedDiscount = Number(quote.discount_amount || 0);
    const discountRow = amounts.discount ? valueRow(tr('الخصم', 'Discount'), amounts.discount,
      itemFormula ? `ROUND(${sumAddress}*${discount},2)+${fixedDiscount}` : null) : null;
    const netFormula = itemFormula ? `${sumAddress}${discountRow ? `-${discountRow.getCell(last).address}` : ''}` : null;
    const netRow = valueRow(tr('بعد الخصم', 'After discount'), amounts.linesSum - amounts.discount, netFormula);
    let vatRow = null;
    if (quote.vat_mode === 'exclusive') vatRow = valueRow(tr('ضريبة القيمة المضافة', 'VAT'), amounts.vat,
      netFormula ? `ROUND(${netRow.getCell(last).address}*${Number(quote.vat_rate ?? SYSTEM.vatRate)},2)` : null);
    else if (quote.vat_mode === 'inclusive') vatRow = valueRow(tr('الضريبة المضمنة في السعر', 'VAT included'), amounts.vat,
      netFormula ? `ROUND(${netRow.getCell(last).address}-ROUND(${netRow.getCell(last).address}/(1+${Number(quote.vat_rate ?? SYSTEM.vatRate)}),2),2)` : null);
    valueRow(tr('الإجمالي', 'Grand total'), amounts.grand,
      netFormula ? `${netRow.getCell(last).address}${quote.vat_mode === 'exclusive' ? `+${vatRow.getCell(last).address}` : ''}` : null, true);
  }

  const quoteTerms = String(quote.terms_text || '').split('\n').map((value) => value.trim()).filter(Boolean);
  if (quoteTerms.length) {
    mergeText(tr('شروط العرض', 'Quotation conditions'), { bold: true });
    quoteTerms.forEach((term) => mergeText(term));
  }
  if (quote.show_payments && payments.length) {
    mergeText(tr('شروط الدفع', 'Payment terms'), { bold: true });
    payments.forEach((payment, index) => mergeText(`${index + 1}. ${payment.label || ''} — ${Number(payment.percent || 0)}% — ${payment.trigger_note || ''}`));
  }
  const terms = Array.isArray(quote.terms_structured) ? quote.terms_structured.filter((term) => String(term?.title || term?.body || '').trim()) : [];
  if (quote.show_terms && terms.length) {
    mergeText(tr('الشروط والأحكام', 'Terms and conditions'), { bold: true });
    resolveTermNumbers(terms, quote.terms_start || '3').forEach((term) => mergeText(`${term.number}. ${[term.title, term.body].filter(Boolean).join(' — ')}`));
  }
  if (quote.show_closing && quote.closing_text) mergeText(quote.closing_text);
  if (quote.show_bank && (settings.bank_account_no || settings.bank_iban)) {
    mergeText(tr('البيانات البنكية', 'Bank details'), { bold: true });
    meta(tr('الحساب', 'Account'), settings.bank_account_no);
    meta('IBAN', settings.bank_iban);
  }
  if (quote.paper_approval_enabled !== false) mergeText(tr('توقيع العميل: ____________________    توقيع أركان المكان: ____________________', 'Client signature: ____________________    Arkan Al Makan signature: ____________________'));
  sheet.pageSetup.printArea = `A1:${sheet.getColumn(last).letter}${sheet.rowCount}`;
  return workbook;
}
