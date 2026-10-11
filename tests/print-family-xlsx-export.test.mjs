import test from 'node:test';
import assert from 'node:assert/strict';
import { SaxesParser } from 'saxes';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { POST } from '../app/api/print-families/fill-xlsx/route.js';

const MODEL = 'عرض سعر كميات - بضريبة';
const XMLNS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const RELNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function parseXml(xml) {
  const tags = [];
  const parser = new SaxesParser({ xmlns: true });
  parser.on('error', (error) => { throw error; });
  parser.on('opentag', (tag) => { tags.push(tag); });
  parser.write(xml).close();
  return tags;
}

function fixture(view) {
  const worksheet = `<worksheet xmlns="${XMLNS}"><dimension ref="A1:A1"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>{{quote_no}}</t></is></c></row></sheetData></worksheet>`;
  return {
    'xl/workbook.xml': strToU8(`<workbook xmlns="${XMLNS}" xmlns:r="${RELNS}"><bookViews>${view}</bookViews><sheets><sheet name="_VARIABLES" sheetId="1" r:id="rId1" state="hidden"/><sheet name="${MODEL}" sheetId="2" r:id="rId2"/><sheet name="بدون ضريبة" sheetId="3" r:id="rId3"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Target="worksheets/sheet3.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(worksheet),
    'xl/worksheets/sheet2.xml': strToU8(worksheet),
    'xl/worksheets/sheet3.xml': strToU8(worksheet),
    'xl/styles.xml': strToU8(`<styleSheet xmlns="${XMLNS}"/>`),
  };
}

async function exportFixture(view) {
  const input = fixture(view);
  const form = new FormData();
  form.set('workbook', new File([zipSync(input)], 'quotation.xlsx'));
  form.set('payload', JSON.stringify({
    model: { name: MODEL, cells: [{ address: 'A1', row: 1, col: 1, text: '{{quote_no}}', tokens: ['quote_no'] }] },
    variables: [{ code: 'quote_no' }],
    values: { quote_no: 'ARK-QT-2026-0060' },
    fileName: 'quotation-filled.xlsx',
  }));
  const response = await POST(new Request('http://localhost/api/print-families/fill-xlsx', { method: 'POST', body: form }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const output = unzipSync(new Uint8Array(await response.arrayBuffer()));
  for (const [path, bytes] of Object.entries(output)) {
    if (path.endsWith('.xml') || path.endsWith('.rels')) parseXml(strFromU8(bytes));
  }
  for (const path of ['xl/worksheets/sheet1.xml', 'xl/worksheets/sheet3.xml', 'xl/styles.xml', 'xl/_rels/workbook.xml.rels']) {
    assert.deepEqual(output[path], input[path], `${path} must be preserved`);
  }
  assert.match(strFromU8(output['xl/worksheets/sheet2.xml']), /ARK-QT-2026-0060/);
  const tags = parseXml(strFromU8(output['xl/workbook.xml']));
  const viewTag = tags.find((tag) => tag.local === 'workbookView');
  assert.equal(viewTag.attributes.activeTab.value, '1');
  assert.equal(viewTag.attributes.xWindow.value, '120');
  const sheets = tags.filter((tag) => tag.local === 'sheet');
  assert.equal(sheets[1].attributes.state, undefined);
  assert.equal(sheets[0].attributes.state.value, 'hidden');
  assert.equal(sheets[2].attributes.state.value, 'hidden');
  return strFromU8(output['xl/workbook.xml']);
}

test('family XLSX export preserves a self-closing workbook view without an activeTab', async () => {
  const xml = await exportFixture('<workbookView xWindow="120"/>');
  assert.match(xml, /<workbookView[^>]*activeTab="1"\s*\/>/);
});

test('family XLSX export replaces activeTab while preserving a spaced self-closing view', async () => {
  const xml = await exportFixture('<workbookView xWindow="120" activeTab="0" />');
  assert.equal(Array.from(xml.matchAll(/activeTab=/g)).length, 1);
});

test('family XLSX export preserves the closing tag of an expanded workbook view', async () => {
  const xml = await exportFixture('<workbookView xWindow="120" activeTab="0"></workbookView>');
  assert.match(xml, /<workbookView[^>]*activeTab="1"><\/workbookView>/);
});
