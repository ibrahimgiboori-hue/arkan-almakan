'use client';

const SAR_SYMBOL_DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABcAAAAaCAMAAABrajdMAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAHOUExURQAAACIeIiIcHiIcHCIfHyQhIiMeICQdHSQfHyAgICIfHyUhIiIdHyMcHCQeICQfIRwcHCIfHyIdHyQfHyQgISMfICMfHyMfICMgICYcHCQgICQkJCcnJyUhISMfISMfICQbGxoaGiQgICMfICMfICIfICMfICIeHiIeHyIeICMeICQgISMfICUgIiQgISAcIAAAAAAAACMgICUiIiMfICIfICQfICUgISMfICQfICIgICUgIiEdISIeHiQfICMfICQfISMfICMfICYeHigbKCQkJCEeHiQfIiMeICQdHyMfICAgICMfHyUgIiMfICUgIiMgICUfHyIgICcdHSQfHyQgISMfICMfICYiIyMgICIdHyIcHCMfICIgHiYhIyMdHyMaGiQgIiQfIRcXLiYcJiUiIiIfHyMgICUhISMfHyMfHyciIyMfISMfICMgICIeICIeHiMgIiMeICMfICQgICMfHyUgIyAgICMeIyYgISMfICcfHyYhISEhISMfISQgISMfISUhIychISEeHiUfISMfHyIeICMfHyMfHyYhISMjIx4eHiMfICMfICUfISEfISMfISMeICUgIiIfHyQeHiUgISQeICIfHyYfIiIiInR/kVgAAACadFJOUwBErC1i//8jYhCr//0kcPsSo/xq//rL+cIbwQcNdXXhHArH/sbQ95/8d8r+///4PwEDSKam3////N5ZWUa57Oz/xfAiEw5U+/56vwiK5NzckCmyGjHW1un/of8ltZ//7B3wrAsbUlLA7FHM/8ytrY+Gn5/NwElgGDvn4CE2NnvnfHwnVYODuutCLxYRzvj7ZLyYmFuI/oZKSg9QdiWfAAAACXBIWXMAABcRAAAXEQHKJvM/AAABRUlEQVQoU73QVVMDUQwF4INDg5OyC8VdLi6LS6G4u7u7u7u7/ltmZ2kHOjyTp8w3J/dmApjLxtbO0v8oewdHJwDOLlauI1c3wN3D08q9yNsNPqy3znupeV+W/nT5v9zvt/uzZEBAYFBQ8E8PCQ3j8Ag5koiiLB5NMbFx8UIwcwIlJgFITklJTUvPyBQKCSGysrJzcvMMAPILCiVSioQQxUYhlZSatAfKyhVmZiEqKlHFUrVqdjWArrauvqGxsYlcmyGzvsXJprWtvQPI0S7bSV3dkFn9l5l6LPv09vUPQGZmhY2DQ8MajoyOjU9MAlPTM7Nz8wZ1G2BhcWmZFFoBsLq2bp7f2GRSiGhr2yymnd29fcwmMNPUweGRhscnp2fEzDgPvri8vPqOXt/cEpFCd/fmYa1MzAo9PD49/2a8vL69f3yq3RdJejzyuEuC1QAAAABJRU5ErkJggg==';

function latinDigits(value){
  return String(value??'')
    .replace(/[٠-٩]/g,(d)=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g,(d)=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}
function formatDate(value){
  const raw=latinDigits(value||'');
  const match=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match?`${match[3]}/${match[2]}/${match[1]}`:raw;
}
function pageNo(value){return String(Number(value||0)).padStart(2,'0');}

function arabicUnder100(n){
  const ones=['','واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة'];
  const teens={10:'عشرة',11:'أحد عشر',12:'اثنا عشر',13:'ثلاثة عشر',14:'أربعة عشر',15:'خمسة عشر',16:'ستة عشر',17:'سبعة عشر',18:'ثمانية عشر',19:'تسعة عشر'};
  const tens={20:'عشرون',30:'ثلاثون',40:'أربعون',50:'خمسون',60:'ستون',70:'سبعون',80:'ثمانون',90:'تسعون'};
  if(n<10)return ones[n]; if(n<20)return teens[n];
  const t=Math.floor(n/10)*10,o=n%10; return o?`${ones[o]} و${tens[t]}`:tens[t];
}
function arabicUnder1000(n){
  if(n<100)return arabicUnder100(n);
  const h={1:'مائة',2:'مائتان',3:'ثلاثمائة',4:'أربعمائة',5:'خمسمائة',6:'ستمائة',7:'سبعمائة',8:'ثمانمائة',9:'تسعمائة'};
  const x=Math.floor(n/100),r=n%100; return r?`${h[x]} و${arabicUnder100(r)}`:h[x];
}
function arabicInteger(n){
  n=Math.floor(Math.abs(Number(n)||0)); if(n===0)return 'صفر';
  const parts=[]; const million=Math.floor(n/1000000); const thousand=Math.floor((n%1000000)/1000); const rest=n%1000;
  if(million){ if(million===1)parts.push('مليون'); else if(million===2)parts.push('مليونان'); else if(million<=10)parts.push(`${arabicUnder1000(million)} ملايين`); else parts.push(`${arabicUnder1000(million)} مليونًا`); }
  if(thousand){ if(thousand===1)parts.push('ألف'); else if(thousand===2)parts.push('ألفان'); else if(thousand<=10)parts.push(`${arabicUnder1000(thousand)} آلاف`); else parts.push(`${arabicUnder1000(thousand)} ألفًا`); }
  if(rest)parts.push(arabicUnder1000(rest)); return parts.join(' و');
}
function amountWordsArabic(totalHalalas){
  const r=Math.floor(totalHalalas/100),h=totalHalalas%100;
  const ru=r===2?'ريالان سعوديان':'ريال سعودي';
  const hu=h===2?'هللتان':'هللة';
  return `${arabicInteger(r)} ${ru} و${arabicInteger(h)} ${hu} فقط لا غير`;
}
function compactPartyDisplayName(name,isEstablishment){
  const raw=String(name||'').replace(/\s+/g,' ').trim(); if(!raw)return '';
  if(!isEstablishment){const words=raw.split(' ');return words.length>3?`${words[0]} ${words[words.length-1]}`:raw;}
  return raw
    .replace(/\s+(?:شركة\s+شخص\s+واحد|شركة\s+الشخص\s+الواحد|ذات\s+مسؤولية\s+محدودة|ذ\.م\.م|مساهمة\s+مقفلة|مساهمة|تضامن|توصية\s+بسيطة)\s*$/u,'')
    .replace(/\s+لل\S+(?:\s+.*)?$/u,'')
    .replace(/\s+/g,' ').trim();
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
  const fromSchema=Array.isArray(cell?.tokens)?cell.tokens.map(normalizeToken).filter(Boolean):[];
  if(fromSchema.length)return fromSchema;
  return Array.from(String(cell?.text||'').matchAll(/\{\{([^{}]+)\}\}/g)).map((m)=>normalizeToken(m[1])).filter(Boolean);
}
function colNumber(letters){
  let n=0; for(const ch of String(letters||'').toUpperCase()){if(ch<'A'||ch>'Z')continue;n=n*26+(ch.charCodeAt(0)-64);} return n;
}
function parseRange(value){
  const m=String(value||'').match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
  return m?{startCol:colNumber(m[1]),startRow:Number(m[2]),endCol:colNumber(m[3]),endRow:Number(m[4])}:null;
}
function buildGeometry(model,pageConfig){
  const pb=pageConfig?.pageBounds||{startCol:2,endCol:61,startRow:2,endRow:43};
  const widthMm=Number(pageConfig?.widthMm||297),heightMm=Number(pageConfig?.heightMm||210);
  const cols=new Map((model?.columns||[]).map((x)=>[Number(x.col),Number(x.widthPx||x.width||12)]));
  const rows=new Map((model?.rows||[]).map((x)=>[Number(x.row),Number(x.heightPx||x.height||15)]));
  const defaultCol=(model?.columns||[]).map((x)=>Number(x.widthPx||x.width||0)).filter(Boolean)[0]||12;
  const defaultRow=15;
  const cw=(c)=>cols.get(c)||defaultCol, rh=(r)=>rows.get(r)||defaultRow;
  let totalW=0,totalH=0;
  for(let c=pb.startCol;c<=pb.endCol;c++)totalW+=cw(c);
  for(let r=pb.startRow;r<=pb.endRow;r++)totalH+=rh(r);
  const slot=(c1,r1,c2=c1,r2=r1)=>{
    let x=0,y=0,w=0,h=0;
    for(let c=pb.startCol;c<c1;c++)x+=cw(c);
    for(let r=pb.startRow;r<r1;r++)y+=rh(r);
    for(let c=c1;c<=c2;c++)w+=cw(c);
    for(let r=r1;r<=r2;r++)h+=rh(r);
    return {left:`${x/totalW*widthMm}mm`,top:`${y/totalH*heightMm}mm`,width:`${w/totalW*widthMm}mm`,height:`${h/totalH*heightMm}mm`};
  };
  return {slot,widthMm,heightMm};
}
function tokenValue(code,voucher,settings){
  const isReceipt=voucher?.voucher_type==='receipt';
  const isEstablishment=(voucher?.party_type||(voucher?.party_id_kind==='cr'?'establishment':'individual'))==='establishment';
  const nationality=String(voucher?.party_nationality||'').trim();
  const isSaudi=/^(سعودي|سعودية|saudi)$/i.test(nationality);
  const total=Math.round(Number(voucher?.amount||0)*100);
  const riyals=Math.floor(total/100),halalas=total%100;
  const method=({cash:'نقدًا',bank_transfer:'تحويل بنكي',cheque:'شيك',card:'بطاقة',other:'أخرى'})[voucher?.payment_method]||voucher?.payment_method||'';
  const rep=[voucher?.party_representative_name,voucher?.party_representative_title].filter(Boolean).join(' — ');
  const values={
    voucher_title:isReceipt?'سند قبض':'سند صرف',
    voucher_title_en:isReceipt?'Receipt Voucher':'Payment Voucher',
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
    party_id_label:isEstablishment?'سجل تجاري رقم':(isSaudi?'هوية رقم':'إقامة رقم'),
    party_id_number:latinDigits(voucher?.party_id_number||''),
    party_mobile:latinDigits(voucher?.party_mobile||''),
    party_nationality:nationality,
    party_title:isEstablishment?(rep||voucher?.party_representative_name||''):(voucher?.party_title||''),
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
    legal_ack:voucher?.legal_text_snapshot||'',
  };
  return values[code]??'';
}
function isNumericToken(code){return ['book_no','voucher_page_no','voucher_no','voucher_date','voucher_date_gregorian','voucher_date_hijri','amount_number','amount_riyal','amount_halalah','party_id_number','party_mobile','payment_date'].includes(code);}
function isLegalCell(cell){
  const text=String(cell?.text||'').trim();
  return !cellTokens(cell).length && Number(cell?.rowSpan||1)>=2 && Number(cell?.colSpan||1)>=24 && text.length>80;
}

export default function TreasuryVoucherExcelPrint({voucher,settings,schema}){
  const modelName=voucher?.voucher_type==='receipt'?'سند قبض':'سند صرف';
  const model=(schema?.models||[]).find((x)=>x?.name===modelName)||(schema?.models||[])[0];
  if(!model)return null;
  const pageConfig=schema?.pageConfig||model?.pageConfig||{};
  const g=buildGeometry(model,pageConfig);
  const meaningful=(model.cells||[]).filter((cell)=>String(cell?.text||'').trim()||cellTokens(cell).length);
  const contentBounds=pageConfig?.contentFrameBounds||null;
  const staticClass=(cell)=>{
    const text=String(cell?.text||'').trim();
    if(text==='/')return 'tvx-divider';
    if(Number(cell?.row||0)<=15)return 'tvx-static tvx-header-static';
    if(isLegalCell(cell))return 'tvx-legal';
    return 'tvx-static tvx-body-static';
  };

  return <article className="treasury-voucher-excel" dir="rtl" style={{width:`${g.widthMm}mm`,height:`${g.heightMm}mm`}}>
    {contentBounds?<div className="tvx-frame" style={g.slot(contentBounds.startCol,contentBounds.startRow,contentBounds.endCol,contentBounds.endRow)} aria-hidden="true"/>:null}

    {meaningful.map((cell)=>{
      const tokens=cellTokens(cell);
      const token=tokens[0]||'';
      const value=isLegalCell(cell)?(voucher?.legal_text_snapshot||cell.text):tokenValue(token,voucher,settings);
      const style=g.slot(Number(cell.col),Number(cell.row),Number(cell.col)+Math.max(1,Number(cell.colSpan||1))-1,Number(cell.row)+Math.max(1,Number(cell.rowSpan||1))-1);
      if(token){
        const amount=token==='amount_number';
        return <div key={cell.address} className={`tvx-variable ${isNumericToken(token)?'tvx-center':'tvx-right'} ${Number(cell.rowSpan||1)>1?'tvx-wrap':''}`} style={style} data-token={token}>
          {amount?<><span>{value}</span><img className="tvx-riyal-mark" src={SAR_SYMBOL_DATA} alt="علامة الريال السعودي"/></>:<span>{value}</span>}
          <i aria-hidden="true"/>
        </div>;
      }
      if(isLegalCell(cell)){
        return <div key={cell.address} className="tvx-legal" style={style}>{value}</div>;
      }
      return <div key={cell.address} className={staticClass(cell)} style={style}>{cell.text}</div>;
    })}

    {(model.placedAssets||schema?.placedAssets||[]).filter((a)=>a.modelSheet===modelName||a.modelSheet==='ALL').map((asset)=>{
      const range=parseRange(asset.anchorRange); if(!range)return null;
      const src=settings?.[asset.sourceSetting]||settings?.company_logo_path||'/brand/arkan-logo-official.svg';
      return <div key={asset.id+asset.anchorRange} className="tvx-asset" style={{...g.slot(range.startCol,range.startRow,range.endCol,range.endRow),zIndex:Number(asset.zIndex||20)}}>
        <img src={src||'/brand/arkan-logo-official.svg'} alt={asset.label||''} style={{objectFit:asset.fitMode||'contain'}}/>
      </div>;
    })}
  </article>;
}
