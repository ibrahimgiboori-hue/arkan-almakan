import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWorkbookVisibility,fillWorkbookText,workbookLineCells } from '../lib/workbook-visibility.mjs';
import { buildQuoteWorkbookData } from '../lib/quote-workbook-data.mjs';
import { model,visibility } from './fixtures/quotation-workbook.mjs';

test('off flow switches remove whole sections, but footer content preserves its grid', () => {
  const state = resolveWorkbookVisibility(model,visibility,{
    show_intro:false,show_payments:false,show_terms:false,show_closing:false,
    show_bank:false,show_arkan_representative:false,
  });
  assert.deepEqual([...state.collapsedRows],[17,18,19,30,31,32,34,35,36,38]);
  for (const address of ['AC40','AC41','AC42','AC43','Q40','Q41','Q42']) assert.ok(state.blankCells.has(address),address);
  assert.ok(!state.collapsedRows.has(40));
  assert.ok(!state.blankCells.has('E40'));
  const enabled = resolveWorkbookVisibility(model,visibility,{});
  assert.equal(enabled.collapsedRows.size,0);
  assert.equal(enabled.blankCells.size,0);
});

test('all four data switches mask their values independently without changing geometry or source', () => {
  const values = { unit:'m2',qty:9,unit_price:120,line_total:1080,description_ar:'عمل',description_en:'Works' };
  for (const [toggle,token] of [['show_unit','unit'],['show_qty','qty'],['show_unit_price','unit_price'],['show_line_total','line_total']]) {
    const state = resolveWorkbookVisibility(model,visibility,{ [toggle]:false });
    assert.equal(fillWorkbookText(`{{${token}}}`,values,state.hiddenTokens),'');
    assert.equal(state.collapsedRows.size,0);
  }
  assert.equal(values.qty,9);
  assert.equal(values.line_total,1080);
  const state = resolveWorkbookVisibility(model,visibility,{ show_en_desc:false });
  assert.equal(fillWorkbookText('{{description_ar}}\\r\\n{{description_en}}',values,state.hiddenTokens),'عمل');
});

test('hidden validity leaves the date without a separator or day suffix', () => {
  const state = resolveWorkbookVisibility(model,visibility,{ show_validity:false });
  assert.equal(fillWorkbookText('{{quote_date}} | {{valid_days}} يوم',{ quote_date:'14/10/2026',valid_days:30 },state.hiddenTokens),'14/10/2026');
});

test('sheet-specific rules do not affect another model and false overrides workbook defaults', () => {
  const rules = [{ toggle:'show_intro',target:'intro_text',elementType:'FLOW_BLOCK',defaultValue:false,appliesTo:'Another model' }];
  assert.equal(resolveWorkbookVisibility(model,rules,{}).collapsedRows.size,0);
  assert.equal(resolveWorkbookVisibility(model,visibility,{ show_intro:false }).collapsedRows.size,3);
});

test('rate-only summary is hidden without changing computed totals', () => {
  const state = resolveWorkbookVisibility(model,visibility,{ show_qty:false,show_line_total:false });
  assert.deepEqual([...state.collapsedRows],[26,27,28]);
  const computed = { subtotal:200,vat:30,grand:230 };
  const data = buildQuoteWorkbookData({ quote:{ show_qty:false,show_line_total:false },computed });
  assert.equal(data.values.grand_total,'230');
  assert.equal(computed.grand,230);
});

test('titles, technical workers and helpers retain their order and bilingual same-row descriptions', () => {
  const lines = [
    { id:'t',kind:'title',number:'1',description_ar:'أعمال الأدوات الصحية / Sanitary Ware Installation',description_en:'Sanitary Ware Installation' },
    { id:'a',kind:'item',number:'1-1',description_ar:'عامل فني / Skilled Worker',description_en:'Skilled Worker',unit_price:120,qty:1,calculated_total:120 },
    { id:'b',kind:'item',number:'1-2',description_ar:'عامل مساعد / Helper',description_en:'Helper',unit_price:80,qty:1,calculated_total:80 },
  ];
  const data = buildQuoteWorkbookData({ quote:{ show_en_desc:false,show_qty:false,show_line_total:false },numberedLines:lines,formatMoney:(value) => Number(value).toFixed(2) });
  assert.deepEqual(data.repeatGroups.line_items.map((line) => line.kind),['title','item','item']);
  assert.equal(data.repeatGroups.line_items[0].unit_price,'');
  assert.equal(data.repeatGroups.line_items[1].unit_price,'120.00');
  assert.equal(data.repeatGroups.line_items[2].unit_price,'80.00');
  const cells = workbookLineCells(model.cells.filter((cell) => cell.row===23),data.repeatGroups.line_items[0]);
  assert.equal(cells.length,2);
  assert.equal(cells[1].colSpan,31);
  assert.equal(data.values.closing_text,'');
  assert.equal(data.values.terms,'');
});
