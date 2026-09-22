import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const XLSX_MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_BYTES=40*1024*1024;

function xmlEscape(value){
  return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function attrEscape(value){ return xmlEscape(value).replace(/"/g,'&quot;'); }

function cellAddress(col,row){
  let n=Number(col), label='';
  while(n>0){ n-=1; label=String.fromCharCode(65+(n%26))+label; n=Math.floor(n/26); }
  return label+row;
}
function parseCellAddress(address){
  const match=String(address||'').match(/^([A-Z]+)(\d+)$/);
  if(!match)return null;
  let col=0;
  for(const ch of match[1])col=col*26+(ch.charCodeAt(0)-64);
  return {col,row:Number(match[2])};
}
function parseRange(ref){
  const parts=String(ref||'').split(':');
  const start=parseCellAddress(parts[0]), end=parseCellAddress(parts[1]||parts[0]);
  return start&&end?{start,end}:null;
}
function rangeRef(range){
  return cellAddress(range.start.col,range.start.row)+':'+cellAddress(range.end.col,range.end.row);
}
function escapeRegExp(value){ return String(value).replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&'); }

function sheetRows(xml){
  const rows=new Map();
  const match=xml.match(/<sheetData>([\s\S]*?)<\/sheetData>/);
  const body=match?.[1]||'';
  const re=/<row\b[^>]*\br="(\d+)"[^>]*(?:>[\s\S]*?<\/row>|\/>)/g;
  let item;
  while((item=re.exec(body)))rows.set(Number(item[1]),item[0]);
  return rows;
}
function mergeRefs(xml){
  return Array.from(xml.matchAll(/<mergeCell\b[^>]*\bref="([^"]+)"[^>]*\/>/g)).map((m)=>m[1]);
}
function setMergeRefs(xml,refs){
  const block=refs.length
    ? '<mergeCells count="'+refs.length+'">'+refs.map((ref)=>'<mergeCell ref="'+attrEscape(ref)+'"/>').join('')+'</mergeCells>'
    : '';
  if(/<mergeCells\b[\s\S]*?<\/mergeCells>/.test(xml))return xml.replace(/<mergeCells\b[\s\S]*?<\/mergeCells>/,block);
  if(!block)return xml;
  return xml.replace(/(<\/sheetData>)/,'$1'+block);
}
function setSheetRows(xml,rows){
  const body=Array.from(rows.entries()).sort((a,b)=>a[0]-b[0]).map((x)=>x[1]).join('');
  return xml.replace(/<sheetData>[\s\S]*?<\/sheetData>/,'<sheetData>'+body+'</sheetData>');
}
function retargetRowXml(rowXml,oldRow,newRow){
  let xml=rowXml.replace(/(<row\b[^>]*\br=")\d+(")/,'$1'+newRow+'$2');
  xml=xml.replace(/\br="([A-Z]+)(\d+)"/g,(match,col,row)=>Number(row)===Number(oldRow)?'r="'+col+newRow+'"':match);
  return xml;
}
function inlineCellXml(openAttrs,text){
  const attrs=String(openAttrs||'').replace(/\s+t="[^"]*"/g,'').replace(/\s*\/$/,'');
  const preserve=/^\s|\s$|\n/.test(String(text||''))?' xml:space="preserve"':'';
  return '<c'+attrs+' t="inlineStr"><is><t'+preserve+'>'+xmlEscape(text)+'</t></is></c>';
}
function setCellText(rows,address,text){
  const parsed=parseCellAddress(address);
  if(!parsed)return;
  const rowNo=parsed.row;
  let rowXml=rows.get(rowNo)||'<row r="'+rowNo+'"></row>';
  const escaped=escapeRegExp(address);
  const fullRe=new RegExp('<c\\b([^>]*\\br="'+escaped+'"[^>]*)>([\\s\\S]*?)<\\/c>');
  const selfRe=new RegExp('<c\\b([^>]*\\br="'+escaped+'"[^>]*)\\/>');
  if(fullRe.test(rowXml))rowXml=rowXml.replace(fullRe,(_m,attrs)=>inlineCellXml(attrs,text));
  else if(selfRe.test(rowXml))rowXml=rowXml.replace(selfRe,(_m,attrs)=>inlineCellXml(attrs,text));
  else rowXml=rowXml.replace(/<\/row>/,inlineCellXml(' r="'+address+'"',text)+'</row>');
  rows.set(rowNo,rowXml);
}
function shiftRows(rows,fromRow,delta){
  if(!delta)return;
  const keys=Array.from(rows.keys()).filter((row)=>row>=fromRow).sort((a,b)=>delta>0?b-a:a-b);
  for(const oldRow of keys){
    const xml=rows.get(oldRow);
    rows.delete(oldRow);
    const next=oldRow+delta;
    rows.set(next,retargetRowXml(xml,oldRow,next));
  }
}
function shiftMergeRefs(refs,fromRow,delta){
  if(!delta)return refs;
  return refs.map((ref)=>{
    const range=parseRange(ref);
    if(!range)return ref;
    if(range.start.row>=fromRow){ range.start.row+=delta; range.end.row+=delta; }
    else if(range.end.row>=fromRow)range.end.row+=delta;
    return rangeRef(range);
  });
}
function deleteRows(rows,refs,start,end){
  const count=end-start+1;
  for(let row=start;row<=end;row++)rows.delete(row);
  shiftRows(rows,end+1,-count);
  const next=[];
  for(const ref of refs){
    const range=parseRange(ref);
    if(!range){ next.push(ref); continue; }
    if(range.start.row>=start&&range.end.row<=end)continue;
    if(range.start.row>end){ range.start.row-=count; range.end.row-=count; }
    else if(range.end.row>end)range.end.row-=count;
    next.push(rangeRef(range));
  }
  return next;
}
function cloneMergeRefs(refs,start,end,copies){
  const inside=refs.map(parseRange).filter(Boolean).filter((range)=>range.start.row>=start&&range.end.row<=end);
  const height=end-start+1, out=[];
  for(let copy=1;copy<copies;copy++){
    for(const range of inside){
      out.push(rangeRef({
        start:{...range.start,row:range.start.row+copy*height},
        end:{...range.end,row:range.end.row+copy*height},
      }));
    }
  }
  return out;
}
function isEnabled(rule,toggles){
  const value=toggles?.[rule.toggle];
  return value===undefined||value===null?Boolean(rule.defaultValue):Boolean(value);
}
function hiddenTokenSet(visibility,toggles){
  const hidden=new Set();
  for(const rule of visibility||[]){
    if(isEnabled(rule,toggles))continue;
    if(rule.elementType==='INLINE_TOKEN'||rule.offBehavior==='HIDE_CONTENT'){
      String(rule.target||'').split(',').map((x)=>x.trim()).filter(Boolean).forEach((x)=>hidden.add(x));
    }
  }
  return hidden;
}
function fillText(template,values,hiddenTokens){
  return String(template||'')
    .replace(/\{\{([a-z][a-z0-9_]*)\}\}/g,(_match,code)=>{
      if(hiddenTokens.has(code))return '';
      const value=values?.[code];
      return value==null?'':String(value);
    })
    .split('\n').filter((line)=>line.trim()!=='').join('\n').trim();
}
function findTitleCell(model,tokenCell,target){
  const label=model?.tokenLabels?.[target];
  if(!label)return null;
  return (model.cells||[]).filter((cell)=>!(cell.tokens||[]).length)
    .filter((cell)=>cell.text===label&&cell.row<tokenCell.row&&tokenCell.row-cell.row<=4)
    .sort((a,b)=>b.row-a.row)[0]||null;
}
function sheetPathForModel(files,sheetName){
  const workbookXml=strFromU8(files['xl/workbook.xml']);
  const sheetMatch=workbookXml.match(new RegExp('<sheet\\b[^>]*name="'+escapeRegExp(sheetName)+'"[^>]*r:id="([^"]+)"[^>]*/>'));
  if(!sheetMatch)throw new Error('model_sheet_not_found');
  const rels=strFromU8(files['xl/_rels/workbook.xml.rels']);
  const relMatch=rels.match(new RegExp('<Relationship\\b[^>]*Id="'+escapeRegExp(sheetMatch[1])+'"[^>]*Target="([^"]+)"[^>]*/>'));
  if(!relMatch)throw new Error('model_sheet_relationship_missing');
  const target=relMatch[1].replace(/^\//,'');
  return target.startsWith('xl/')?target:'xl/'+target.replace(/^\.\//,'');
}
function makeSelectedSheetActive(files,sheetName){
  let xml=strFromU8(files['xl/workbook.xml']);
  let index=-1, position=0;
  xml=xml.replace(/<sheet\b([^>]*)\/>/g,(whole,attrs)=>{
    const name=attrs.match(/name="([^"]+)"/)?.[1]||'';
    const selected=name===sheetName;
    if(selected)index=position;
    position+=1;
    let next=attrs.replace(/\s+state="[^"]*"/g,'');
    if(!selected)next+=' state="hidden"';
    return '<sheet'+next+'/>';
  });
  if(index>=0&&/<workbookView\b/.test(xml)){
    xml=xml.replace(/<workbookView\b([^>]*)>/,(whole,attrs)=>{
      const next=attrs.replace(/\s+activeTab="[^"]*"/g,'')+' activeTab="'+index+'"';
      return '<workbookView'+next+'>';
    });
  }
  files['xl/workbook.xml']=strToU8(xml);
}
function transformWorksheet(xml,payload){
  const model=payload.model, variables=payload.variables||[], visibility=payload.visibility||[];
  const toggles=payload.toggles||{}, repeatGroups=payload.repeatGroups||{}, values=payload.values||{};
  let rows=sheetRows(xml), refs=mergeRefs(xml);
  const hiddenTokens=hiddenTokenSet(visibility,toggles);
  const variableByCode=new Map(variables.map((item)=>[item.code,item]));
  const groupByCode=new Map(variables.filter((item)=>item.repeatGroup).map((item)=>[item.code,item.repeatGroup]));

  for(const cell of model.cells||[]){
    const tokens=cell.tokens||[];
    if(!tokens.length||tokens.some((token)=>groupByCode.has(token)))continue;
    setCellText(rows,cell.address,fillText(cell.text,values,hiddenTokens));
  }

  const ops=[], disabledGroups=new Set();
  for(const rule of visibility){
    if(isEnabled(rule,toggles))continue;
    const targets=String(rule.target||'').split(',').map((x)=>x.trim()).filter(Boolean);
    if(rule.elementType==='FLOW_BLOCK'){
      for(const target of targets){
        const cell=(model.cells||[]).find((item)=>item.tokens?.includes(target));
        if(cell)ops.push({type:'delete',start:cell.row,end:cell.row+(cell.rowSpan||1)-1});
      }
    }else if(rule.elementType==='FLOW_GROUP'){
      for(const target of targets){
        const cell=(model.cells||[]).find((item)=>item.tokens?.includes(target));
        if(!cell)continue;
        const title=findTitleCell(model,cell,target);
        ops.push({type:'delete',start:title?.row||cell.row,end:cell.row+(cell.rowSpan||1)-1});
        const variable=variableByCode.get(target);
        if(variable?.repeatGroup)disabledGroups.add(variable.repeatGroup);
      }
    }
  }

  const groups=Array.from(new Set(variables.map((item)=>item.repeatGroup).filter(Boolean)));
  for(const group of groups){
    if(disabledGroups.has(group))continue;
    const codes=new Set(variables.filter((item)=>item.repeatGroup===group).map((item)=>item.code));
    const cells=(model.cells||[]).filter((cell)=>(cell.tokens||[]).some((token)=>codes.has(token)));
    if(!cells.length)continue;
    const start=Math.min(...cells.map((cell)=>cell.row));
    const end=Math.max(...cells.map((cell)=>cell.row+(cell.rowSpan||1)-1));
    const records=Array.isArray(repeatGroups[group])&&repeatGroups[group].length?repeatGroups[group]:[{}];
    ops.push({type:'repeat',cells,start,end,records});
  }

  ops.sort((a,b)=>a.start-b.start||(a.type==='delete'?-1:1));
  let cumulative=0;
  for(const op of ops){
    const start=op.start+cumulative, end=op.end+cumulative;
    if(op.type==='delete'){
      refs=deleteRows(rows,refs,start,end);
      cumulative-=op.end-op.start+1;
      continue;
    }
    const height=op.end-op.start+1, copies=Math.max(1,op.records.length);
    const templateRows=[];
    for(let source=start;source<=end;source++)templateRows.push({source,xml:rows.get(source)||'<row r="'+source+'"></row>'});
    const templateMerges=refs.slice();
    if(copies>1){
      const extra=(copies-1)*height;
      shiftRows(rows,end+1,extra);
      refs=shiftMergeRefs(refs,end+1,extra);
      refs.push(...cloneMergeRefs(templateMerges,start,end,copies));
      for(let copy=1;copy<copies;copy++){
        for(const item of templateRows){
          const target=item.source+copy*height;
          rows.set(target,retargetRowXml(item.xml,item.source,target));
        }
      }
      cumulative+=extra;
    }
    for(let copy=0;copy<copies;copy++){
      const record={...values,...(op.records[copy]||{})};
      for(const cell of op.cells){
        const row=start+(cell.row-op.start)+copy*height;
        setCellText(rows,cellAddress(cell.col,row),fillText(cell.text,record,hiddenTokens));
      }
    }
  }

  xml=setSheetRows(xml,rows);
  xml=setMergeRefs(xml,refs);
  const maxRow=Math.max(...Array.from(rows.keys()),1);
  xml=xml.replace(/<dimension\b[^>]*ref="([^"]+)"[^>]*\/>/,(whole,ref)=>{
    const range=parseRange(ref);
    if(!range)return whole;
    range.end.row=Math.max(range.end.row,maxRow);
    return '<dimension ref="'+rangeRef(range)+'"/>';
  });
  return xml;
}

export async function POST(request){
  try{
    const form=await request.formData();
    const workbook=form.get('workbook');
    const payloadRaw=form.get('payload');
    if(!(workbook instanceof File)||typeof payloadRaw!=='string')return new Response('invalid_payload',{status:400});
    const input=new Uint8Array(await workbook.arrayBuffer());
    if(!input.byteLength||input.byteLength>MAX_BYTES)return new Response('invalid_xlsx_size',{status:400});

    const payload=JSON.parse(payloadRaw);
    if(!payload?.model?.name)return new Response('model_required',{status:400});

    const files=unzipSync(input);
    const sheetPath=sheetPathForModel(files,payload.model.name);
    files[sheetPath]=strToU8(transformWorksheet(strFromU8(files[sheetPath]),payload));
    makeSelectedSheetActive(files,payload.model.name);

    const output=zipSync(files,{level:6});
    const fileName=String(payload.fileName||'quotation-filled.xlsx').replace(/[\\/:*?"<>|]/g,'-');
    return new Response(output,{
      status:200,
      headers:{
        'Content-Type':XLSX_MIME,
        'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(fileName),
        'Cache-Control':'no-store',
      },
    });
  }catch(error){
    console.error('family workbook fill failed',error);
    return new Response('xlsx_fill_failed',{status:500});
  }
}
