import test from 'node:test';
import assert from 'node:assert/strict';
import { quotationWorkbookCell,singleLineText } from '../lib/quotation-workbook-language.mjs';
import { buildQuoteWorkbookData } from '../lib/quote-workbook-data.mjs';
import { model } from './fixtures/quotation-workbook.mjs';

test('English presentation translates every existing quotation label while retaining model geometry and Arabic source',()=>{
  const values={ document_title:'QUOTATION',vat_rate:'12%',valid_days:15 };
  for(const cell of model.cells){
    if(cell.tokens.length)continue;
    const presentation=quotationWorkbookCell(cell,{language:'en',values});
    assert.doesNotMatch(presentation.text,/[\u0600-\u06ff]/);
    for(const key of ['address','row','col','rowSpan','colSpan'])assert.equal(presentation[key],cell[key]);
    assert.equal(quotationWorkbookCell(cell,{language:'ar'}),cell);
  }
  assert.equal(quotationWorkbookCell({text:'ضريبة القيمة المضافة 15%',tokens:[]},{language:'en',values}).text,'VAT (12%)');
});

test('English descriptions, payment labels and paragraphs are single logical lines without changing financial data',()=>{
  const quote={language:'en',show_en_desc:false,show_line_total:true,intro_text:'Intro\ncontinued',closing_text:'Close\ncontinued',show_validity:false};
  const line={kind:'item',number:'1',description_ar:'وصف عربي',description_en:'English work\n(full scope)',unit:'م2',qty:9,unit_price:120,calculated_total:1080};
  const data=buildQuoteWorkbookData({quote,numberedLines:[line],computed:{subtotal:1080,vat:162,grand:1242},payments:[{percent:30}]});
  const output=data.repeatGroups.line_items[0];
  assert.equal(output.description_ar,'English work (full scope)');
  assert.equal(output.description_en,'English work (full scope)');
  assert.equal(output.unit,'m²');
  assert.equal(output.unit_price,'120');
  assert.equal(output.line_total,'1080');
  assert.equal(data.values.grand_total,'1242');
  assert.equal(data.values.intro_text,'Intro continued');
  assert.equal(data.values.closing_text,'Close continued');
  assert.equal(data.repeatGroups.payment_terms[0].payment_terms,'Payment 1: 30%');
  assert.equal(singleLineText('First\\nsecond\nthird'),'First second third');
  assert.equal(line.description_en,'English work\n(full scope)');
  const cell=quotationWorkbookCell(model.cells.find((cell)=>cell.address==='H23'),{language:'en'});
  assert.equal(cell.text,'{{description_ar}}');
});
