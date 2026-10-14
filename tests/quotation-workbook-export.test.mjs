import test from 'node:test';
import assert from 'node:assert/strict';
import { strFromU8,strToU8,zipSync,unzipSync } from 'fflate';
import { SaxesParser } from 'saxes';
import { POST } from '../app/api/print-families/fill-xlsx/route.js';
import { model,visibility,variables } from './fixtures/quotation-workbook.mjs';
import { buildQuoteWorkbookData } from '../lib/quote-workbook-data.mjs';

const escape = (value) => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const rows = new Map();
for(const cell of model.cells){
  rows.set(cell.row,[...(rows.get(cell.row)||[]),`<c r="${cell.address}" t="inlineStr"><is><t>${escape(cell.text)}</t></is></c>`]);
}
const worksheet = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="B3:AO61"/><sheetViews><sheetView workbookViewId="0" rightToLeft="1"/></sheetViews><sheetData>${[...rows].map(([row,cells])=>`<row r="${row}">${cells.join('')}</row>`).join('')}</sheetData><mergeCells count="1"><mergeCell ref="H23:W24"/></mergeCells></worksheet>`;
const source = {
  'xl/workbook.xml':strToU8(`<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="${model.name}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
  'xl/_rels/workbook.xml.rels':strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
  'xl/worksheets/sheet1.xml':strToU8(worksheet),
  'xl/styles.xml':strToU8('<styleSheet/>'),
};

test('filled workbook keeps section titles, masks hidden data, collapses disabled blocks and preserves template styles',async()=>{
  const data = buildQuoteWorkbookData({
    quote:{ intro_text:'HIDDEN_INTRO',closing_text:'HIDDEN_CLOSING',terms_text:'HIDDEN_TERM',show_intro:false,show_closing:false,show_terms:false,show_payments:false,show_bank:false,show_en_desc:false,show_unit:false,show_qty:false,show_line_total:false,show_unit_price:true,valid_days:30,show_validity:false,quote_date:'14/10/2026' },
    numberedLines:[
      {kind:'title',number:'1',description_ar:'أعمال الأدوات الصحية / Sanitary Ware Installation',description_en:'HIDDEN_EN'},
      {kind:'item',number:'1-1',description_ar:'عامل فني / Skilled Worker',description_en:'HIDDEN_EN',unit:'HIDDEN_UNIT',qty:1,unit_price:120,calculated_total:120},
      {kind:'item',number:'1-2',description_ar:'عامل مساعد / Helper',description_en:'HIDDEN_EN',unit:'HIDDEN_UNIT',qty:1,unit_price:80,calculated_total:80},
    ],payments:[{ label:'HIDDEN_PAYMENT',percent:50 }],computed:{subtotal:200,vat:30,grand:230},settings:{bank_name_full:'HIDDEN_BANK',bank_iban:'HIDDEN_IBAN'},formatMoney:(value)=>Number(value).toFixed(2),
  });
  const form = new FormData();
  form.set('workbook',new File([zipSync(source)],'fixture.xlsx'));
  form.set('payload',JSON.stringify({ model,visibility,variables,...data }));
  const response = await POST(new Request('http://localhost/api/print-families/fill-xlsx',{method:'POST',body:form}));
  assert.equal(response.status,200);
  const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
  assert.deepEqual(files['xl/styles.xml'],source['xl/styles.xml']);
  const xml = strFromU8(files['xl/worksheets/sheet1.xml']);
  const parser = new SaxesParser();
  parser.on('error',(error)=>{throw error;});
  parser.write(xml).close();
  assert.ok(!xml.includes('HIDDEN_'));
  assert.ok(!xml.includes('شروط الدفع'));
  assert.ok(!xml.includes('الشروط والأحكام العامة'));
  assert.ok(!xml.includes('الإجمالي الكلي'));
  assert.ok(!xml.includes('|'));
  for(const text of ['Sanitary Ware Installation','Skilled Worker','Helper','120.00','80.00','14/10/2026'])assert.ok(xml.includes(text),text);
  assert.ok(xml.indexOf('Sanitary Ware Installation')<xml.indexOf('Skilled Worker'));
  assert.match(xml,/<mergeCell ref="H20:AL21"/);
  assert.match(xml,/<mergeCell ref="H22:W23"/);
});

test('English filled workbook has English labels, LTR sheet view and a single description with template styles retained',async()=>{
  const data=buildQuoteWorkbookData({
    quote:{language:'en',show_qty:true,show_line_total:true,show_en_desc:false,show_validity:true,valid_days:15,quote_date:'02/01/2026',client_name:'عميل جديد',intro_text:'English intro\ncontinued',terms_text:'English terms',closing_text:'English closing'},
    numberedLines:[{kind:'item',number:'1',description_ar:'وصف محفوظ',description_en:'English item\nFull scope',unit:'م2',qty:1,unit_price:120,calculated_total:120}],
    computed:{subtotal:120,vat:18,grand:138},settings:{bank_name_full:'مصرف الراجحي'},
  });
  const form=new FormData();
  form.set('workbook',new File([zipSync(source)],'english-fixture.xlsx'));
  form.set('payload',JSON.stringify({model,visibility,variables,...data}));
  const response=await POST(new Request('http://localhost/api/print-families/fill-xlsx',{method:'POST',body:form}));
  assert.equal(response.status,200);
  const files=unzipSync(new Uint8Array(await response.arrayBuffer()));
  assert.deepEqual(files['xl/styles.xml'],source['xl/styles.xml']);
  const xml=strFromU8(files['xl/worksheets/sheet1.xml']);
  const parser=new SaxesParser();parser.on('error',(error)=>{throw error;});parser.write(xml).close();
  assert.doesNotMatch(xml,/[\u0600-\u06ff]/);
  assert.match(xml,/<sheetView\b[^>]*rightToLeft="0"/);
  assert.equal((xml.match(/English item Full scope/g)||[]).length,1);
  for(const label of ['Description of Works','Subtotal','Grand Total','Payment Terms','Terms &amp; Conditions','Bank Details','Al Rajhi Bank','New Client','15 days','English intro continued'])assert.ok(xml.includes(label),label);
});
