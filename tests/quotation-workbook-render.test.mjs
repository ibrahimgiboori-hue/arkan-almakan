import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadBindings,transform } from 'next/dist/build/swc/index.js';
import { buildQuoteWorkbookData } from '../lib/quote-workbook-data.mjs';
import { model,visibility } from './fixtures/quotation-workbook.mjs';

const require = createRequire(import.meta.url);
await loadBindings();
const compiled = await transform(fs.readFileSync('components/quotes/WorkbookModelPreview.js','utf8'),{
  filename:'WorkbookModelPreview.js',
  jsc:{ target:'es2022',parser:{ syntax:'ecmascript',jsx:true },transform:{ react:{ runtime:'automatic' } } },
  module:{ type:'es6' },
});
let code = compiled.code
  .replaceAll('"react/jsx-runtime"',JSON.stringify(pathToFileURL(require.resolve('react/jsx-runtime')).href))
  .replaceAll("'react'",JSON.stringify(pathToFileURL(require.resolve('react')).href))
  .replaceAll("'@/lib/workbook-visibility.mjs'",JSON.stringify(new URL('../lib/workbook-visibility.mjs',import.meta.url).href));
const { default:Preview } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const numberedLines = [
  { id:'title',kind:'title',number:'1',description_ar:'أعمال الأدوات الصحية / Sanitary Ware Installation',description_en:'Sanitary Ware Installation' },
  { id:'tech',kind:'item',number:'1-1',description_ar:'عامل فني / Skilled Worker',description_en:'Skilled Worker',unit_price:120,qty:9,unit:'TEST_UNIT',calculated_total:1080 },
  { id:'helper',kind:'item',number:'1-2',description_ar:'عامل مساعد / Helper',description_en:'Helper',unit_price:80,qty:7,unit:'TEST_UNIT',calculated_total:560 },
];

function render(toggles,overrides={}) {
  const data = buildQuoteWorkbookData({
    quote:{ intro_text:'TEST_INTRO',closing_text:'TEST_CLOSING',valid_days:30,terms_text:'TEST_TERM',quote_date:'14/10/2026',...toggles },
    numberedLines,computed:{ subtotal:1640,vat:246,grand:1886 },
    payments:[{ label:'TEST_PAYMENT',percent:50 }],
    settings:{ bank_name_full:'TEST_BANK',bank_iban:'TEST_IBAN' },
    formatMoney:(value) => Number(value).toFixed(2),
  });
  return renderToStaticMarkup(React.createElement(Preview,{ model,visibility,...data,printMode:true,...overrides }));
}

test('real preview markup respects section and data switches and retains bilingual headings', () => {
  const html = render({ show_intro:false,show_closing:false,show_terms:false,show_payments:false,show_bank:false,
    show_en_desc:false,show_qty:false,show_unit:false,show_unit_price:true,show_line_total:false });
  for (const text of ['TEST_INTRO','TEST_CLOSING','TEST_TERM','TEST_PAYMENT','TEST_BANK','TEST_IBAN','TEST_UNIT','1640','1886','شروط الدفع','الشروط والأحكام العامة','الإجمالي الكلي']) assert.ok(!html.includes(text),text);
  for (const text of ['أعمال الأدوات الصحية / Sanitary Ware Installation','عامل فني / Skilled Worker','عامل مساعد / Helper','120.00','80.00','14/10/2026']) assert.ok(html.includes(text),text);
  assert.equal((html.match(/Sanitary Ware Installation/g) || []).length,1);
  assert.ok(html.indexOf('Sanitary Ware Installation') < html.indexOf('Skilled Worker'));
  const enabled = render({ show_intro:true,show_terms:true,show_closing:true,show_payments:true,show_bank:true,show_en_desc:true,show_qty:true,show_line_total:true });
  for (const text of ['TEST_INTRO','TEST_CLOSING','TEST_TERM','TEST_PAYMENT','TEST_BANK','1886.00']) assert.ok(enabled.includes(text),text);
});

test('multi-page quotation retains every heading and draws enabled stamp only on its anchor page', () => {
  const data = buildQuoteWorkbookData({
    quote:{ show_en_desc:false,show_qty:false,show_line_total:false,show_stamp:true,show_signature:false },
    numberedLines:Array.from({ length:28 },(_,index) => numberedLines.map((line) => ({ ...line,id:`${index}-${line.id}`,description_ar:line.kind==='title'?`SECTION_${index+1} / Works`:line.description_ar }))).flat(),
    formatMoney:(value) => Number(value).toFixed(2),
  });
  const overlays = [{ id:'stamp',modelSheet:model.name,showToggle:'show_stamp',anchorToken:'representative_name',widthMm:20,heightMm:15 },
    { id:'signature',modelSheet:model.name,showToggle:'show_signature',anchorToken:'representative_name',widthMm:20,heightMm:15 }];
  const html = renderToStaticMarkup(React.createElement(Preview,{ model,visibility,...data,overlays,overlayImages:{ stamp:'https://example.invalid/test-stamp.png',signature:'https://example.invalid/test-signature.png' },printMode:true }));
  assert.ok((html.match(/workbook-preview-page/g) || []).length>1);
  for (let index=1; index<=28; index+=1) assert.equal((html.match(new RegExp(`SECTION_${index} / Works`,'g')) || []).length,1);
  assert.equal((html.match(/alt="stamp"/g) || []).length,1);
  assert.equal((html.match(/alt="signature"/g) || []).length,0);
});
