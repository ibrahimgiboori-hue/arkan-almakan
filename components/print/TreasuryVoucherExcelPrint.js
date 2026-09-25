'use client';

import { supabase } from '@/lib/supabase';

const FRAME_WIDTH_MM=247.5;
const CONTENT_X_MM=29.7;
const CONTENT_Y_MM=30;
const PT_MM=25.4/72;
const SAR_SYMBOL_DATA='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABcAAAAaCAMAAABrajdMAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAHOUExURQAAACIeIiIcHiIcHCIfHyQhIiMeICQdHSQfHyAgICIfHyUhIiIdHyMcHCQeICQfIRwcHCIfHyIdHyQfHyQgISMfICMfHyMfICMgICYcHCQgICQkJCcnJyUhISMfISMfICQbGxoaGiQgICMfICMfICIfICMfICIeHiIeHyIeICMeICQgISMfICUgIiQgISAcIAAAAAAAACMgICUiIiMfICIfICQfICUgISMfICQfICIgICUgIiEdISIeHiQfICMfICQfISMfICMfICYeHigbKCQkJCEeHiQfIiMeICQdHyMfICAgICMfHyUgIiMfICUgIiMgICUfHyIgICcdHSQfHyQgISMfICMfICYiIyMgICIdHyIcHCMfICIgHiYhIyMdHyMaGiQgIiQfIRcXLiYcJiUiIiIfHyMgICUhISMfHyMfHyciIyMfISMfICMgICIeICIeHiMgIiMeICMfICQgICMfHyUgIyAgICMeIyYgISMfICcfHyYhISEhISMfISQgISMfISUhIychISEeHiUfISMfHyIeICMfHyMfHyYhISMjIx4eHiMfICMfICUfISEfISMfISMeICUgIiIfHyQeHiUgISQeICIfHyYfIiIiInR/kVgAAACadFJOUwBErC1i//8jYhCr//0kcPsSo/xq//rL+cIbwQcNdXXhHArH/sbQ95/8d8r+///4PwEDSKam3////N5ZWUa57Oz/xfAiEw5U+/56vwiK5NzckCmyGjHW1un/of8ltZ//7B3wrAsbUlLA7FHM/8ytrY+Gn5/NwElgGDvn4CE2NnvnfHwnVYODuutCLxYRzvj7ZLyYmFuI/oZKSg9QdiWfAAAACXBIWXMAABcRAAAXEQHKJvM/AAABRUlEQVQoU73QVVMDUQwF4INDg5OyC8VdLi6LS6G4u7u7u7u7/ltmZ2kHOjyTp8w3J/dmApjLxtbO0v8oewdHJwDOLlauI1c3wN3D08q9yNsNPqy3znupeV+W/nT5v9zvt/uzZEBAYFBQ8E8PCQ3j8Ag5koiiLB5NMbFx8UIwcwIlJgFITklJTUvPyBQKCSGysrJzcvMMAPILCiVSioQQxUYhlZSatAfKyhVmZiEqKlHFUrVqdjWArrauvqGxsYlcmyGzvsXJprWtvQPI0S7bSV3dkFn9l5l6LPv09vUPQGZmhY2DQ8MajoyOjU9MAlPTM7Nz8wZ1G2BhcWmZFFoBsLq2bp7f2GRSiGhr2yymnd29fcwmMNPUweGRhscnp2fEzDgPvri8vPqOXt/cEpFCd/fmYa1MzAo9PD49/2a8vL69f3yq3RdJejzyuEuC1QAAAABJRU5ErkJggg==';

function latinDigits(value){
  return String(value??'').replace(/[٠-٩]/g,(d)=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g,(d)=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}
function formatDate(value){
  const raw=latinDigits(value||'');
  const m=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m?`${m[3]}/${m[2]}/${m[1]}`:raw;
}
function pageNo(value){const n=Number(value)||0;return n===100?'100':String(n).padStart(2,'0');}

function arabicUnder100(n){
  const o=['','واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة'];
  const teens={10:'عشرة',11:'أحد عشر',12:'اثنا عشر',13:'ثلاثة عشر',14:'أربعة عشر',15:'خمسة عشر',16:'ستة عشر',17:'سبعة عشر',18:'ثمانية عشر',19:'تسعة عشر'};
  const tens={20:'عشرون',30:'ثلاثون',40:'أربعون',50:'خمسون',60:'ستون',70:'سبعون',80:'ثمانون',90:'تسعون'};
  if(n<10)return o[n]; if(n<20)return teens[n];
  const t=Math.floor(n/10)*10,r=n%10; return r?`${o[r]} و${tens[t]}`:tens[t];
}
function arabicUnder1000(n){
  if(n<100)return arabicUnder100(n);
  const h={1:'مائة',2:'مائتان',3:'ثلاثمائة',4:'أربعمائة',5:'خمسمائة',6:'ستمائة',7:'سبعمائة',8:'ثمانمائة',9:'تسعمائة'};
  const x=Math.floor(n/100),r=n%100; return r?`${h[x]} و${arabicUnder100(r)}`:h[x];
}
function arabicInteger(n){
  n=Math.floor(Math.abs(Number(n)||0)); if(n===0)return 'صفر';
  const out=[]; const million=Math.floor(n/1000000); const thousand=Math.floor((n%1000000)/1000); const rest=n%1000;
  if(million){if(million===1)out.push('مليون');else if(million===2)out.push('مليونان');else if(million<=10)out.push(`${arabicUnder1000(million)} ملايين`);else out.push(`${arabicUnder1000(million)} مليونًا`);}
  if(thousand){if(thousand===1)out.push('ألف');else if(thousand===2)out.push('ألفان');else if(thousand<=10)out.push(`${arabicUnder1000(thousand)} آلاف`);else out.push(`${arabicUnder1000(thousand)} ألفًا`);}
  if(rest)out.push(arabicUnder1000(rest)); return out.join(' و');
}
function amountWordsArabic(total){
  const r=Math.floor(total/100),h=total%100;
  return `${arabicInteger(r)} ${r===2?'ريالان سعوديان':'ريال سعودي'} و${arabicInteger(h)} ${h===2?'هللتان':'هللة'} فقط لا غير`;
}
function compactPartyDisplayName(name,isEstablishment){
  const raw=String(name||'').replace(/\s+/g,' ').trim(); if(!raw)return '';
  if(!isEstablishment){const words=raw.split(' ');return words.length>3?`${words[0]} ${words[words.length-1]}`:raw;}
  return raw
    .replace(/\s+(?:شركة\s+شخص\s+واحد|شركة\s+الشخص\s+الواحد|ذات\s+مسؤولية\s+محدودة|ذ\.م\.م|مساهمة\s+مقفلة|مساهمة|تضامن|توصية\s+بسيطة)\s*$/u,'')
    .replace(/\s+لل\S+(?:\s+.*)?$/u,'').replace(/\s+/g,' ').trim();
}
function normalizeToken(raw){
  const key=String(raw||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  const aliases={
    via_methode:'payment_method',via_method:'payment_method',
    receipt_reason:'description',supporting_document:'supporting_document',
    voucher_page_no:'voucher_page_no',voucher_date_gregorian:'voucher_date_gregorian',
    voucher_date_hijri:'voucher_date_hijri'
  };
  return aliases[key]||key;
}
function cellTokens(cell){
  const schemaTokens=Array.isArray(cell?.tokens)?cell.tokens.map(normalizeToken).filter(Boolean):[];
  if(schemaTokens.length)return schemaTokens;
  return Array.from(String(cell?.text||'').matchAll(/\{\{([^{}]+)\}\}/g)).map((m)=>normalizeToken(m[1])).filter(Boolean);
}
function cellEndCol(cell){return Number(cell.col)+Math.max(1,Number(cell.colSpan||1))-1;}
function cellEndRow(cell){return Number(cell.row)+Math.max(1,Number(cell.rowSpan||1))-1;}

function borderSpec(edge){
  if(!edge) return null;
  const width=Math.max(0.06,Number(edge.widthMm||0.2));
  const rawStyle=String(edge.style||'').toLowerCase();
  const lineStyle=rawStyle==='double'
    ? 'double'
    : /dash/.test(rawStyle)
      ? 'dashed'
      : /dot|hair/.test(rawStyle)
        ? 'dotted'
        : 'solid';
  return {
    width,
    lineStyle,
    color:String(edge.color||'#111111'),
    strength:(rawStyle==='double'?5:/thick/.test(rawStyle)?4:/medium/.test(rawStyle)?3:2),
  };
}

function buildBorderSegments(cells,slot){
  const byKey=new Map();
  const put=(key,segment)=>{
    const prev=byKey.get(key);
    if(!prev || Number(segment.spec?.strength||0)>Number(prev.spec?.strength||0)) byKey.set(key,segment);
  };

  for(const cell of cells){
    const row=Number(cell?.row||0);
    if(row<18||row>29) continue;

    const c1=Number(cell.col),r1=row,c2=cellEndCol(cell),r2=cellEndRow(cell);
    const rect=slot(c1,r1,c2,r2);
    const left=parseFloat(rect.left),top=parseFloat(rect.top),width=parseFloat(rect.width),height=parseFloat(rect.height);
    const borders=cell?.style?.borders||{};

    const topSpec=borderSpec(borders.top);
    if(topSpec) put(`h:${top.toFixed(4)}:${left.toFixed(4)}:${(left+width).toFixed(4)}`,{axis:'h',left,top,length:width,spec:topSpec});

    const bottomSpec=borderSpec(borders.bottom);
    if(bottomSpec){
      const y=top+height;
      put(`h:${y.toFixed(4)}:${left.toFixed(4)}:${(left+width).toFixed(4)}`,{axis:'h',left,top:y,length:width,spec:bottomSpec});
    }

    const leftSpec=borderSpec(borders.left);
    if(leftSpec) put(`v:${left.toFixed(4)}:${top.toFixed(4)}:${(top+height).toFixed(4)}`,{axis:'v',left,top,length:height,spec:leftSpec});

    const rightSpec=borderSpec(borders.right);
    if(rightSpec){
      const x=left+width;
      put(`v:${x.toFixed(4)}:${top.toFixed(4)}:${(top+height).toFixed(4)}`,{axis:'v',left:x,top,length:height,spec:rightSpec});
    }
  }

  const raw=Array.from(byKey.values());
  const grouped=new Map();
  for(const segment of raw){
    const anchor=segment.axis==='h'?segment.top:segment.left;
    const key=`${segment.axis}:${anchor.toFixed(4)}:${segment.spec.width}:${segment.spec.lineStyle}:${segment.spec.color}`;
    const list=grouped.get(key)||[];
    list.push(segment);
    grouped.set(key,list);
  }

  const merged=[];
  for(const list of grouped.values()){
    list.sort((a,b)=>(a.axis==='h'?a.left:a.top)-(b.axis==='h'?b.left:b.top));
    let current=null;
    for(const seg of list){
      if(!current){
        current={...seg};
        continue;
      }
      const currentStart=current.axis==='h'?current.left:current.top;
      const currentEnd=currentStart+current.length;
      const segStart=seg.axis==='h'?seg.left:seg.top;
      const segEnd=segStart+seg.length;
      if(segStart<=currentEnd+0.03){
        current.length=Math.max(currentEnd,segEnd)-currentStart;
      }else{
        merged.push(current);
        current={...seg};
      }
    }
    if(current) merged.push(current);
  }

  return merged;
}

function renderStaticLabel(text){
  return String(text||'');
}

function buildGeometry(model){
  const FRAME_START_COL=7,FRAME_END_COL=56,FRAME_START_ROW=7,FRAME_END_ROW=30;
  const cols=new Map((model?.columns||[]).map((x)=>[Number(x.col),Number(x.widthPx||x.width||12)]));
  const rows=new Map((model?.rows||[]).map((x)=>[Number(x.row),Number(x.height||x.heightPx||14.25)]));
  const defaultCol=12,defaultRow=14.25;
  const cw=(c)=>cols.get(c)||defaultCol;
  const rh=(r)=>rows.get(r)||defaultRow;
  let totalUnits=0;for(let c=FRAME_START_COL;c<=FRAME_END_COL;c++)totalUnits+=cw(c);
  const colMm=(c)=>cw(c)/totalUnits*FRAME_WIDTH_MM;
  const rowMm=(r)=>rh(r)*PT_MM;
  const frameX=CONTENT_X_MM-colMm(FRAME_START_COL);
  const frameY=CONTENT_Y_MM-rowMm(FRAME_START_ROW);
  let frameH=0;for(let r=FRAME_START_ROW;r<=FRAME_END_ROW;r++)frameH+=rowMm(r);
  const slot=(c1,r1,c2=c1,r2=r1)=>{
    let left=0,top=0,width=0,height=0;
    for(let c=FRAME_START_COL;c<c1;c++)left+=colMm(c);
    for(let r=FRAME_START_ROW;r<r1;r++)top+=rowMm(r);
    for(let c=c1;c<=c2;c++)width+=colMm(c);
    for(let r=r1;r<=r2;r++)height+=rowMm(r);
    return {left:`${left}mm`,top:`${top}mm`,width:`${width}mm`,height:`${height}mm`};
  };
  return {frameX,frameY,frameW:FRAME_WIDTH_MM,frameH,slot};
}

function tokenValue(code,voucher,settings){
  const isEstablishment=(voucher?.party_type||(voucher?.party_id_kind==='cr'?'establishment':'individual'))==='establishment';
  const total=Math.round(Number(voucher?.amount||0)*100);
  const riyals=Math.floor(total/100),halalas=total%100;
  const method=({cash:'نقدًا',bank_transfer:'تحويل بنكي',cheque:'شيك',card:'بطاقة',other:'أخرى'})[voucher?.payment_method]||voucher?.payment_method||'';
  const rep=[voucher?.party_representative_name,voucher?.party_representative_title].filter(Boolean).join(' — ');
  const values={
    book_no:latinDigits(voucher?.book_no),
    voucher_page_no:pageNo(voucher?.page_no),
    voucher_no:latinDigits(voucher?.voucher_no),
    voucher_date:formatDate(voucher?.voucher_date),
    voucher_date_gregorian:formatDate(voucher?.voucher_date),
    voucher_date_hijri:latinDigits(voucher?.voucher_date_hijri||''),
    amount_number:`${riyals.toLocaleString('en-US')}.${String(halalas).padStart(2,'0')}`,
    amount_words:amountWordsArabic(total),
    amount_riyal:riyals.toLocaleString('en-US'),
    amount_halalah:String(halalas).padStart(2,'0'),
    party_name:voucher?.party_name||'',
    party_display_name:compactPartyDisplayName(voucher?.party_name,isEstablishment),
    party_id_number:latinDigits(voucher?.party_id_number||''),
    party_mobile:latinDigits(voucher?.party_mobile||''),
    party_nationality:voucher?.party_nationality||'',
    party_title:isEstablishment?(rep||voucher?.party_representative_title||''):(voucher?.party_title||''),
    description:voucher?.description||'',
    payment_method:method,
    bank_name:voucher?.bank_name||'',
    payment_reference:voucher?.payment_reference||'',
    payment_date:formatDate(voucher?.payment_date||''),
    city:voucher?.party_address||settings?.city||'',
    supporting_document:voucher?.supporting_reference||voucher?.payment_reference||'',
    accountant_name:voucher?.accountant_name_snapshot||'',
    accountant_title:voucher?.accountant_title_snapshot||'',
    approver_name:voucher?.approved_by_name_snapshot||'',
    approver_title:voucher?.approved_by_title_snapshot||'',
  };
  return values[code]??'';
}
function isNumericToken(code){
  return ['book_no','voucher_page_no','voucher_no','voucher_date','voucher_date_gregorian','voucher_date_hijri','amount_number','amount_riyal','amount_halalah','party_id_number','party_mobile','payment_date'].includes(code);
}
function isLegalCell(cell){
  const text=String(cell?.text||'').trim();
  return !cellTokens(cell).length && Number(cell?.rowSpan||1)>=2 && Number(cell?.colSpan||1)>=24 && text.length>60;
}
function isLogoCell(cell){
  return !String(cell?.text||'').trim() && !cellTokens(cell).length &&
    Number(cell?.row||0)<=10 && Number(cell?.col||0)>=20 && Number(cell?.col||0)<=32 &&
    Number(cell?.rowSpan||1)>=4 && Number(cell?.colSpan||1)>=8;
}
function isSignSpace(cell){
  return !String(cell?.text||'').trim() && !cellTokens(cell).length &&
    Number(cell?.row||0)>=28 && Number(cell?.rowSpan||1)>=1 && Number(cell?.colSpan||1)>=5;
}
function staticText(cell,settings){
  const text=String(cell?.text||'');
  if(/^Arkan Al/i.test(text))return settings?.company_name_en||text;
  if(/^CR No\s*:/i.test(text))return `CR No: ${latinDigits(settings?.cr_number||text.replace(/\D/g,''))}`;
  if(Number(cell?.row)===8 && /(?:مؤسسة|شركة|أركان)/.test(text))return settings?.company_name_ar||text;
  if(/س\s*:\s*ت/.test(text))return `س:ت ${latinDigits(settings?.cr_number||text.replace(/\D/g,''))}`;
  return text;
}
function titleParts(text){
  const parts=String(text||'').split('|').map((x)=>x.trim()).filter(Boolean);
  return {ar:parts[0]||'',en:parts[1]||''};
}

function Variable({cell,slot,value,token}){
  const style=slot(Number(cell.col),Number(cell.row),cellEndCol(cell),cellEndRow(cell));
  const cls=`tvm-variable ${Number(cell.row)>=18?'tvm-body-variable':''} ${isNumericToken(token)?'tvm-ltr':''}`.trim();
  if(token==='amount_number'){
    return <div className="tvm-amount-with-riyal" style={style} dir="ltr"><span>{value}</span><img src={SAR_SYMBOL_DATA} alt="علامة الريال السعودي"/></div>;
  }
  return <div className={cls} style={style}>
    {String(value||'').trim()?<span className="tvm-variable-value">{value}</span>:null}
    <span className="tvm-variable-remainder" aria-hidden="true"/>
  </div>;
}

export default function TreasuryVoucherExcelPrint({voucher,settings,schema}){
  const modelName=voucher?.voucher_type==='receipt'?'سند قبض':'سند صرف';
  const model=(schema?.models||[]).find((x)=>x?.name===modelName)||(schema?.models||[])[0];
  if(!model)return null;

  const g=buildGeometry(model);
  const cells=model.cells||[];
  const logoCell=cells.find(isLogoCell);
  const legalCell=cells.find(isLegalCell);
  const frameCells=cells.filter((cell)=>
    Number(cell.row)>=8&&Number(cell.row)<=29&&Number(cell.col)>=7&&cellEndCol(cell)<=56
  );
  const visibleCells=frameCells.filter((cell)=>{
    if(isLogoCell(cell)||isSignSpace(cell))return true;
    return Boolean(String(cell?.text||'').trim()||cellTokens(cell).length);
  });

  const bodyStart=18;
  const legalStart=legalCell?Number(legalCell.row):22;
  const signatureRows=visibleCells.filter((c)=>Number(c.row)>=25);
  const signatureStart=signatureRows.length?Math.min(...signatureRows.map((c)=>Number(c.row))):26;
  const signatureEnd=signatureRows.length?Math.max(...signatureRows.map(cellEndRow)):29;
  // Border geometry must use every styled cell from the Excel frame,
  // including empty cells. Using only text-bearing cells drops real Excel rules.
  const borderSegments=buildBorderSegments(frameCells,g.slot);

  const logoPath=settings?.company_logo_path||'';
  const logoSrc=logoPath
    ? (/^(?:https?:|data:|\/)/i.test(logoPath)?logoPath:supabase.storage.from('brand').getPublicUrl(logoPath).data.publicUrl)
    : '/brand/arkan-logo-official.svg';

  return <article className="treasury-voucher-mockup" dir="rtl">
    {voucher?.status==='void'?<div className="tvm-void">ملغى</div>:null}

    <section className="tvm-frame" style={{left:`${g.frameX}mm`,top:`${g.frameY}mm`,width:`${g.frameW}mm`,height:`${g.frameH}mm`}}>
      <div className="tvm-body-surface" style={g.slot(8,bodyStart,55,Math.max(bodyStart,legalStart-1))} aria-hidden="true"/>
      <div className="tvm-signature-surface" style={g.slot(8,signatureStart,55,signatureEnd)} aria-hidden="true"/>

      <div className="tvm-excel-border-map" aria-hidden="true">
        {borderSegments.map((segment,index)=>{
          const spec=segment.spec;
          const common={position:'absolute',zIndex:6,pointerEvents:'none',boxSizing:'border-box'};
          if(segment.axis==='h'){
            return <span key={index} style={{...common,left:`${segment.left}mm`,top:`${segment.top}mm`,width:`${segment.length}mm`,height:0,borderTop:`${spec.width}mm ${spec.lineStyle} ${spec.color}`}}/>;
          }
          return <span key={index} style={{...common,left:`${segment.left}mm`,top:`${segment.top}mm`,width:0,height:`${segment.length}mm`,borderLeft:`${spec.width}mm ${spec.lineStyle} ${spec.color}`}}/>;
        })}
      </div>

      {logoCell?<div className="tvm-logo" style={g.slot(Number(logoCell.col),Number(logoCell.row),cellEndCol(logoCell),cellEndRow(logoCell))}>
        <img src={logoSrc} alt="شعار أركان المكان"/>
      </div>:null}

      {visibleCells.filter((cell)=>cell!==logoCell).map((cell)=>{
        const text=String(cell.text||'').trim();
        const tokens=cellTokens(cell);
        const token=tokens[0]||'';
        const style=g.slot(Number(cell.col),Number(cell.row),cellEndCol(cell),cellEndRow(cell));

        if(isSignSpace(cell)){
          return <div key={cell.address} className="tvm-variable tvm-body-variable tvm-sign-space" style={style}>
            <span className="tvm-variable-remainder" aria-hidden="true"/>
          </div>;
        }
        if(token){
          return <Variable key={cell.address} cell={cell} slot={g.slot} value={tokenValue(token,voucher,settings)} token={token}/>;
        }
        if(cell===legalCell||isLegalCell(cell)){
          return <div key={cell.address} className="tvm-plain tvm-legal" style={style}>{voucher?.legal_text_snapshot||text}</div>;
        }
        if(text==='/'){
          return <div key={cell.address} className="tvm-divider" style={style}>/</div>;
        }
        if(/سند\s*(?:صرف|قبض)/.test(text)){
          const t=titleParts(text);
          return <div key={cell.address} className="tvm-static tvm-voucher-title" style={style}><strong>{t.ar}</strong>{t.en?<span>{t.en}</span>:null}</div>;
        }

        const row=Number(cell.row);
        const body=row>=18;
        const plainHeader=row<=11;
        const cls=plainHeader
          ? `tvm-plain ${/[A-Za-z]/.test(text)?'tvm-company-en':'tvm-company-ar'}`
          : `tvm-static ${body?'tvm-body-static':''}`;
        return <div key={cell.address} className={cls.trim()} style={style}><span className="tvm-static-text">{renderStaticLabel(staticText(cell,settings))}</span></div>;
      })}
    </section>
  </article>;
}
