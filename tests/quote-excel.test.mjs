import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildQuoteExcel, quoteExcelFileName } from '../lib/quote-excel.js';
import { totals } from '../lib/quote-calc.js';

const lines = [
  { id: 'title', kind: 'title', description_ar: 'التجهيز', description_en: 'Setup' },
  { id: 'first', kind: 'item', description_ar: 'أعمال أولى', description_en: 'First item', unit: 'قطعة', qty: 3, unit_price: 17.37 },
  { id: 'second', kind: 'item', description_ar: 'أعمال ثانية', description_en: 'Second item', unit: 'قطعة', qty: 2, unit_price: 25 },
];

for (const vat_mode of ['exclusive', 'inclusive', 'none']) {
  test(`Excel quote keeps ${vat_mode} totals and editable line formulas`, async () => {
    const quote = {
      id: 'quote-id', quote_no: 'ARK/Q-24', language: 'en', vat_mode, vat_rate: 0.15,
      show_qty: true, show_unit: true, show_unit_price: true, show_line_total: true,
      discount_pct: 0.1, discount_amount: 2, paper_approval_enabled: false,
    };
    const buffer = await buildQuoteExcel({ quote, lines, settings: { company_name_en: 'Arkan Al Makan' } }).xlsx.writeBuffer();
    const restored = new ExcelJS.Workbook();
    await restored.xlsx.load(buffer);
    const sheet = restored.worksheets[0];
    const rowByLabel = (label) => sheet._rows.find((row) => row?.getCell(2).value === label);
    const expected = totals(quote, lines);
    const firstItem = rowByLabel('First item');
    assert.equal(firstItem.getCell(6).value.result, 52.11);
    assert.match(firstItem.getCell(6).value.formula, /^ROUND\(/);
    assert.equal(rowByLabel('Setup').getCell(6).value.result, 102.11);
    assert.match(rowByLabel('Setup').getCell(6).value.formula, /^SUM\(/);
    assert.equal(rowByLabel('Grand total').getCell(6).value.result, expected.grand);
    if (vat_mode !== 'none') assert.equal(rowByLabel(vat_mode === 'exclusive' ? 'VAT' : 'VAT included').getCell(6).value.result, expected.vat);
    assert.equal(quoteExcelFileName(quote), 'ARK-Q-24.xlsx');
    assert.equal(sheet.views[0].rightToLeft, false);
  });
}
