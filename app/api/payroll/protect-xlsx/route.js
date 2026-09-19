import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

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

function protectWorksheetXml(xml,passwordHash){
  const tag=[
    `<sheetProtection password="${passwordHash}"`,
    ' sheet="1"',
    ' objects="0"',
    ' scenarios="0"',
    ' formatCells="0"',
    ' formatColumns="0"',
    ' formatRows="0"',
    ' insertColumns="1"',
    ' insertRows="0"',
    ' insertHyperlinks="0"',
    ' deleteColumns="1"',
    ' deleteRows="0"',
    ' selectLockedCells="0"',
    ' selectUnlockedCells="0"',
    ' sort="0"',
    ' autoFilter="0"',
    ' pivotTables="0"/>',
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

    const files=unzipSync(new Uint8Array(input));
    const passwordHash=excelLegacyPasswordHash(PROTECTION_PASSWORD);

    const sheetPaths=Object.keys(files).filter((name)=>/^xl\/worksheets\/sheet\d+\.xml$/.test(name));
    if(!sheetPaths.length)return new Response('invalid_xlsx_worksheets',{status:400});

    for(const sheetPath of sheetPaths){
      const sheetXml=strFromU8(files[sheetPath]);
      files[sheetPath]=strToU8(protectWorksheetXml(sheetXml,passwordHash));
    }

    const output=zipSync(files,{level:6});
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
