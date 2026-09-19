import JSZip from 'jszip';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const XLSX_MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_BYTES=20*1024*1024;
const PROTECTION_PASSWORD='ArkanPayrollGuard';

function excelLegacyPasswordHash(password){
  const chars=Array.from(String(password||'').slice(0,15));
  let hash=0;
  for(let i=chars.length-1;i>=0;i-=1){
    hash^=(chars[i].charCodeAt(0)&0xFF);
    hash=((hash<<1)&0x7FFF)|((hash>>14)&0x01);
  }
  hash^=chars.length;
  hash^=0xCE4B;
  return (hash&0xFFFF).toString(16).toUpperCase().padStart(4,'0');
}

function protectWorkbookXml(xml,passwordHash){
  const tag=`<workbookProtection workbookPassword="${passwordHash}" lockStructure="1"/>`;
  if(/<workbookProtection\b[^>]*(?:\/>|>.*?<\/workbookProtection>)/s.test(xml)){
    return xml.replace(/<workbookProtection\b[^>]*(?:\/>|>.*?<\/workbookProtection>)/s,tag);
  }
  if(xml.includes('<bookViews>'))return xml.replace('<bookViews>',`${tag}<bookViews>`);
  if(xml.includes('<sheets>'))return xml.replace('<sheets>',`${tag}<sheets>`);
  throw new Error('workbook_structure_anchor_missing');
}

function protectWorksheetXml(xml,passwordHash){
  const tag=[
    `<sheetProtection password="${passwordHash}"`,
    ' sheet="1"',
    ' objects="1"',
    ' scenarios="1"',
    ' formatCells="1"',
    ' formatColumns="1"',
    ' formatRows="1"',
    ' insertColumns="1"',
    ' insertRows="1"',
    ' insertHyperlinks="1"',
    ' deleteColumns="1"',
    ' deleteRows="1"',
    ' selectLockedCells="1"',
    ' selectUnlockedCells="0"',
    ' sort="0"',
    ' autoFilter="0"',
    ' pivotTables="1"/>',
  ].join('');

  if(/<sheetProtection\b[^>]*(?:\/>|>.*?<\/sheetProtection>)/s.test(xml)){
    return xml.replace(/<sheetProtection\b[^>]*(?:\/>|>.*?<\/sheetProtection>)/s,tag);
  }

  const laterNode=/(<protectedRanges\b|<scenarios\b|<autoFilter\b|<sortState\b|<dataConsolidate\b|<customSheetViews\b|<mergeCells\b|<phoneticPr\b|<conditionalFormatting\b|<dataValidations\b|<hyperlinks\b|<printOptions\b|<pageMargins\b|<pageSetup\b|<headerFooter\b|<rowBreaks\b|<colBreaks\b|<customProperties\b|<cellWatches\b|<ignoredErrors\b|<smartTags\b|<drawing\b|<legacyDrawing\b|<legacyDrawingHF\b|<picture\b|<oleObjects\b|<controls\b|<webPublishItems\b|<tableParts\b|<extLst\b|<\/worksheet>)/;
  if(!laterNode.test(xml))throw new Error('worksheet_protection_anchor_missing');
  return xml.replace(laterNode,`${tag}$1`);
}

export async function POST(request){
  try{
    const input=await request.arrayBuffer();
    if(!input.byteLength||input.byteLength>MAX_BYTES){
      return new Response('invalid_xlsx_size',{status:400});
    }

    const zip=await JSZip.loadAsync(input);
    const workbookFile=zip.file('xl/workbook.xml');
    if(!workbookFile)return new Response('invalid_xlsx_workbook',{status:400});

    const passwordHash=excelLegacyPasswordHash(PROTECTION_PASSWORD);
    const workbookXml=await workbookFile.async('string');
    zip.file('xl/workbook.xml',protectWorkbookXml(workbookXml,passwordHash));

    const sheetPaths=Object.keys(zip.files).filter((name)=>/^xl\/worksheets\/sheet\d+\.xml$/.test(name));
    if(!sheetPaths.length)return new Response('invalid_xlsx_worksheets',{status:400});

    for(const sheetPath of sheetPaths){
      const sheetFile=zip.file(sheetPath);
      if(!sheetFile)continue;
      const sheetXml=await sheetFile.async('string');
      zip.file(sheetPath,protectWorksheetXml(sheetXml,passwordHash));
    }

    const output=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
    return new Response(output,{
      status:200,
      headers:{
        'Content-Type':XLSX_MIME,
        'Cache-Control':'no-store',
      },
    });
  }catch(error){
    console.error('payroll xlsx protection failed',error);
    return new Response('xlsx_protection_failed',{status:500});
  }
}
