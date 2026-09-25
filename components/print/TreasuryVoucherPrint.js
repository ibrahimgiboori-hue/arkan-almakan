'use client';

const FRAME_X = 29.7;
const FRAME_Y = 30;
const FRAME_W = 237.6;
const ROW_MM = 14.25 * 25.4 / 72;
const FRAME_H = 22 * ROW_MM;
const SAR_SYMBOL_DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABcAAAAaCAMAAABrajdMAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAHOUExURQAAACIeIiIcHiIcHCIfHyQhIiMeICQdHSQfHyAgICIfHyUhIiIdHyMcHCQeICQfIRwcHCIfHyIdHyQfHyQgISMfICMfHyMfICMgICYcHCQgICQkJCcnJyUhISMfISMfICQbGxoaGiQgICMfICMfICIfICMfICIeHiIeHyIeICMeICQgISMfICUgIiQgISAcIAAAAAAAACMgICUiIiMfICIfICQfICUgISMfICQfICIgICUgIiEdISIeHiQfICMfICQfISMfICMfICYeHigbKCQkJCEeHiQfIiMeICQdHyMfICAgICMfHyUgIiMfICUgIiMgICUfHyIgICcdHSQfHyQgISMfICMfICYiIyMgICIdHyIcHCMfICIgHiYhIyMdHyMaGiQgIiQfIRcXLiYcJiUiIiIfHyMgICUhISMfHyMfHyciIyMfISMfICMgICIeICIeHiMgIiMeICMfICQgICMfHyUgIyAgICMeIyYgISMfICcfHyYhISEhISMfISQgISMfISUhIychISEeHiUfISMfHyIeICMfHyMfHyYhISMjIx4eHiMfICMfICUfISEfISMfISMeICUgIiIfHyQeHiUgISQeICIfHyYfIiIiInR/kVgAAACadFJOUwBErC1i//8jYhCr//0kcPsSo/xq//rL+cIbwQcNdXXhHArH/sbQ95/8d8r+///4PwEDSKam3////N5ZWUa57Oz/xfAiEw5U+/56vwiK5NzckCmyGjHW1un/of8ltZ//7B3wrAsbUlLA7FHM/8ytrY+Gn5/NwElgGDvn4CE2NnvnfHwnVYODuutCLxYRzvj7ZLyYmFuI/oZKSg9QdiWfAAAACXBIWXMAABcRAAAXEQHKJvM/AAABRUlEQVQoU73QVVMDUQwF4INDg5OyC8VdLi6LS6G4u7u7u7u7/ltmZ2kHOjyTp8w3J/dmApjLxtbO0v8oewdHJwDOLlauI1c3wN3D08q9yNsNPqy3znupeV+W/nT5v9zvt/uzZEBAYFBQ8E8PCQ3j8Ag5koiiLB5NMbFx8UIwcwIlJgFITklJTUvPyBQKCSGysrJzcvMMAPILCiVSioQQxUYhlZSatAfKyhVmZiEqKlHFUrVqdjWArrauvqGxsYlcmyGzvsXJprWtvQPI0S7bSV3dkFn9l5l6LPv09vUPQGZmhY2DQ8MajoyOjU9MAlPTM7Nz8wZ1G2BhcWmZFFoBsLq2bp7f2GRSiGhr2yymnd29fcwmMNPUweGRhscnp2fEzDgPvri8vPqOXt/cEpFCd/fmYa1MzAo9PD49/2a8vL69f3yq3RdJejzyuEuC1QAAAABJRU5ErkJggg==';

function excelColUnits(isReceipt){
  return Array.from({length:48},(_,index)=>{
    const excelCol=8+index; // H..BC
    return isReceipt && (excelCol===10 || excelCol===52) ? 2 : 13; // J / AZ spacers only in receipt sheet
  });
}

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
  if(n<10) return ones[n];
  if(n<20) return teens[n];
  const t=Math.floor(n/10)*10, o=n%10;
  return o ? `${ones[o]} و${tens[t]}` : tens[t];
}
function arabicUnder1000(n){
  if(n<100) return arabicUnder100(n);
  const hundreds={1:'مائة',2:'مائتان',3:'ثلاثمائة',4:'أربعمائة',5:'خمسمائة',6:'ستمائة',7:'سبعمائة',8:'ثمانمائة',9:'تسعمائة'};
  const h=Math.floor(n/100), rest=n%100;
  return rest ? `${hundreds[h]} و${arabicUnder100(rest)}` : hundreds[h];
}
function arabicInteger(n){
  n=Math.floor(Math.abs(Number(n)||0));
  if(n===0) return 'صفر';
  const parts=[];
  const million=Math.floor(n/1000000);
  const thousand=Math.floor((n%1000000)/1000);
  const rest=n%1000;

  if(million){
    if(million===1) parts.push('مليون');
    else if(million===2) parts.push('مليونان');
    else if(million>=3 && million<=10) parts.push(`${arabicUnder1000(million)} ملايين`);
    else parts.push(`${arabicUnder1000(million)} مليونًا`);
  }
  if(thousand){
    if(thousand===1) parts.push('ألف');
    else if(thousand===2) parts.push('ألفان');
    else if(thousand>=3 && thousand<=10) parts.push(`${arabicUnder1000(thousand)} آلاف`);
    else parts.push(`${arabicUnder1000(thousand)} ألفًا`);
  }
  if(rest) parts.push(arabicUnder1000(rest));
  return parts.join(' و');
}
function amountWordsArabic(totalHalalas){
  const riyals=Math.floor(totalHalalas/100);
  const halalas=totalHalalas%100;
  const riyalWords=arabicInteger(riyals);
  const halalaWords=arabicInteger(halalas);
  const riyalUnit=riyals===1?'ريال سعودي':riyals===2?'ريالان سعوديان':'ريال سعودي';
  const halalaUnit=halalas===1?'هللة':halalas===2?'هللتان':'هللة';
  return `${riyalWords} ${riyalUnit} و${halalaWords} ${halalaUnit} فقط لا غير`;
}


function createSlotter(isReceipt){
  const units=excelColUnits(isReceipt);
  const total=units.reduce((sum,value)=>sum+value,0);
  const unitMm=FRAME_W/total;
  const offset=(excelCol)=>units.slice(0,Math.max(0,excelCol-8)).reduce((s,v)=>s+v,0)*unitMm;
  const span=(c1,c2)=>units.slice(Math.max(0,c1-8),Math.max(0,c2-8)+1).reduce((s,v)=>s+v,0)*unitMm;
  return (c1,r1,c2,r2)=>({
    left:`${offset(c1)}mm`,
    top:`${(r1-8)*ROW_MM}mm`,
    width:`${span(c1,c2)}mm`,
    height:`${(r2-r1+1)*ROW_MM}mm`,
  });
}

function StaticBox({children,c1,r1,c2,r2,className='',slotter}) {
  const bodyClass=r1>=18?'tvm-body-static':'';
  return <div className={`tvm-static ${bodyClass} ${className}`.trim()} style={slotter(c1,r1,c2,r2)}>{children}</div>;
}
function PlainBox({children,c1,r1,c2,r2,className='',slotter}) {
  return <div className={`tvm-plain ${className}`.trim()} style={slotter(c1,r1,c2,r2)}>{children}</div>;
}
function VariableBox({value,c1,r1,c2,r2,className='',ltr=false,slotter}) {
  const text=String(value??'').trim();
  const bodyClass=r1>=18?'tvm-body-variable':'';
  return <div className={`tvm-variable ${bodyClass} ${className} ${ltr?'tvm-ltr':''}`.trim()} style={slotter(c1,r1,c2,r2)}>
    {text?<span className="tvm-variable-value">{text}</span>:null}
    <span className="tvm-variable-remainder" aria-hidden="true"/>
  </div>;
}

export default function TreasuryVoucherPrint({voucher,settings}){
  const isReceipt=voucher?.voucher_type==='receipt';
  const slot=createSlotter(isReceipt);

  const partyType=voucher?.party_type||(voucher?.party_id_kind==='cr'?'establishment':'individual');
  const isEstablishment=partyType==='establishment';
  const nationality=String(voucher?.party_nationality||'').trim();
  const isSaudi=/^(سعودي|سعودية|saudi)$/i.test(nationality);
  const idLabel=isEstablishment?'سجل تجاري رقم':(isSaudi?'هوية رقم':'إقامة رقم');

  const totalHalalas=Math.round(Number(voucher?.amount||0)*100);
  const amountRiyals=Math.floor(totalHalalas/100).toLocaleString('en-US');
  const amountHalalas=String(totalHalalas%100).padStart(2,'0');
  const amountNumber=`${amountRiyals}.${amountHalalas}`;
  const amountWords=amountWordsArabic(totalHalalas);

  const titleAr=isReceipt?'سند قبض':'سند صرف';
  const titleEn=isReceipt?'Receipt Voucher':'Payment Voucher';
  const companyAr=settings?.company_name_ar||'مؤسسة اركان المكان للمقاولات العامة';
  const companyEn=settings?.company_name_en||'Arkan Al- Makan Contracting';
  const city=voucher?.party_address||settings?.city||'الرياض';
  const method=({cash:'نقدًا',bank_transfer:'تحويل بنكي',cheque:'شيك',card:'بطاقة',other:'أخرى'})[voucher?.payment_method]||voucher?.payment_method||'';

  const representative=[
    voucher?.party_representative_name,
    voucher?.party_representative_title
  ].filter(Boolean).join(' — ');
  const partyHeading=isEstablishment?'المستفيد / المحصل منه':(isReceipt?'المحصل منه':'المستفيد');
  const partyRoleValue=isEstablishment?representative:(voucher?.party_title||(isReceipt?'عميل':'موظف'));

  return <article className="treasury-voucher-mockup" dir="rtl">
    {voucher?.status==='void'?<div className="tvm-void">ملغى</div>:null}

    <section className="tvm-frame" style={{left:`${FRAME_X}mm`,top:`${FRAME_Y}mm`,width:`${FRAME_W}mm`,height:`${FRAME_H}mm`}}>
      <div className="tvm-body-surface" style={slot(8,18,55,21)} aria-hidden="true"/>
      <div className="tvm-signature-surface" style={slot(8,26,55,29)} aria-hidden="true"/>

      {/* Header — exact latest workbook ranges */}
      <PlainBox slotter={slot} c1={8} r1={8} c2={23} r2={9} className="tvm-company-en">{companyEn}</PlainBox>
      <PlainBox slotter={slot} c1={8} r1={10} c2={23} r2={10}>CR No: {latinDigits(settings?.cr_number||'7042008503')}</PlainBox>
      <PlainBox slotter={slot} c1={8} r1={11} c2={23} r2={11}>Riyadh – King Fahd District</PlainBox>

      <div className="tvm-logo" style={slot(24,8,38,14)}>
        <img src="/brand/arkan-logo-official.svg" alt="شعار أركان المكان"/>
      </div>

      <PlainBox slotter={slot} c1={39} r1={8} c2={55} r2={9} className="tvm-company-ar">{companyAr}</PlainBox>
      <PlainBox slotter={slot} c1={39} r1={10} c2={55} r2={10}>س:ت {latinDigits(settings?.cr_number||'1009112888')}</PlainBox>
      <PlainBox slotter={slot} c1={39} r1={11} c2={55} r2={11}>المملكة العربية السعودية- الرياض- حي الملك فهد</PlainBox>

      {/* Meta + amount */}
      <StaticBox slotter={slot} c1={8} r1={12} c2={11} r2={12}>رقم الدفتر</StaticBox>
      <StaticBox slotter={slot} c1={12} r1={12} c2={17} r2={12}>رقم السند</StaticBox>
      <StaticBox slotter={slot} c1={18} r1={12} c2={23} r2={12}>رقم المرجع</StaticBox>
      <VariableBox slotter={slot} c1={8} r1={13} c2={11} r2={13} value={latinDigits(voucher?.book_no)} ltr/>
      <VariableBox slotter={slot} c1={12} r1={13} c2={17} r2={13} value={pageNo(voucher?.page_no)} ltr/>
      <VariableBox slotter={slot} c1={18} r1={13} c2={23} r2={13} value={latinDigits(voucher?.voucher_no)} ltr/>

      <StaticBox slotter={slot} c1={39} r1={12} c2={48} r2={12} className="tvm-riyal-label"><span>ريال</span><img src={SAR_SYMBOL_DATA} alt="علامة الريال السعودي"/></StaticBox>
      <StaticBox slotter={slot} c1={49} r1={12} c2={55} r2={12}>هللة- Hal.</StaticBox>
      <VariableBox slotter={slot} c1={39} r1={13} c2={48} r2={13} value={amountRiyals} ltr/>
      <VariableBox slotter={slot} c1={49} r1={13} c2={55} r2={13} value={amountHalalas} ltr/>

      {/* Date row — latest workbook puts fixed "التاريخ/" before Gregorian value */}
      <VariableBox slotter={slot} c1={8} r1={15} c2={17} r2={15} value={latinDigits(voucher?.voucher_date_hijri||'')} ltr/>
      <StaticBox slotter={slot} c1={18} r1={15} c2={23} r2={15}>الموافق/</StaticBox>
      <StaticBox slotter={slot} c1={24} r1={15} c2={38} r2={16} className="tvm-voucher-title">
        <strong>{titleAr}</strong><span>{titleEn}</span>
      </StaticBox>
      <StaticBox slotter={slot} c1={39} r1={15} c2={44} r2={15}>التاريخ/</StaticBox>
      <VariableBox slotter={slot} c1={45} r1={15} c2={55} r2={15} value={formatDate(voucher?.voucher_date)} ltr/>

      {/* Unified body */}
      <VariableBox slotter={slot} c1={8} r1={18} c2={14} r2={18} value={latinDigits(voucher?.party_mobile||'')} ltr/>
      <StaticBox slotter={slot} c1={15} r1={18} c2={18} r2={18}>جوال رقم/</StaticBox>
      <VariableBox slotter={slot} c1={19} r1={18} c2={28} r2={18} value={latinDigits(voucher?.party_id_number||'')} ltr/>
      <StaticBox slotter={slot} c1={29} r1={18} c2={32} r2={18}>{idLabel}/</StaticBox>
      <VariableBox slotter={slot} c1={33} r1={18} c2={50} r2={18} value={voucher?.party_name||''}/>
      <StaticBox slotter={slot} c1={51} r1={18} c2={55} r2={18}>{isReceipt?'استلمنا من السيد/':'استلمنا نحن/'}</StaticBox>

      <VariableBox slotter={slot} c1={8} r1={19} c2={14} r2={19} value={method}/>
      <StaticBox slotter={slot} c1={15} r1={19} c2={18} r2={19}>وذلك عبر/</StaticBox>
      <VariableBox slotter={slot} c1={19} r1={19} c2={35} r2={19} value={amountWords} className="tvm-words-field"/>
      <div className="tvm-amount-with-riyal" style={slot(37,19,42,19)} dir="ltr"><span>{amountNumber}</span><img src={SAR_SYMBOL_DATA} alt="علامة الريال السعودي"/></div>
      <StaticBox slotter={slot} c1={43} r1={19} c2={44} r2={19}>مبلغ/</StaticBox>
      <VariableBox slotter={slot} c1={45} r1={19} c2={50} r2={19} value={city}/>
      <StaticBox slotter={slot} c1={51} r1={19} c2={55} r2={19}>بمدينة/</StaticBox>

      <VariableBox slotter={slot} c1={8} r1={20} c2={32} r2={20} value={voucher?.description||''} className="tvm-purpose-field"/>
      <StaticBox slotter={slot} c1={33} r1={20} c2={38} r2={20}>وذلك مقابل/</StaticBox>
      <VariableBox slotter={slot} c1={39} r1={20} c2={50} r2={20} value={voucher?.supporting_reference||voucher?.payment_reference||''}/>
      <StaticBox slotter={slot} c1={51} r1={20} c2={55} r2={20}>مرجع الدفع/</StaticBox>

      <VariableBox slotter={slot} c1={8} r1={21} c2={55} r2={21} value={voucher?.description||''} className="tvm-continuation"/>

      <PlainBox slotter={slot} c1={8} r1={22} c2={55} r2={24} className="tvm-legal">
        {voucher?.legal_text_snapshot||''}
      </PlainBox>

      {/* Signature area — exact latest workbook rows 26:29 */}
      <VariableBox slotter={slot} c1={8} r1={26} c2={14} r2={26} value={voucher?.approved_by_name_snapshot||''}/>
      <StaticBox slotter={slot} c1={15} r1={26} c2={19} r2={26}>اعتماد الإدارة</StaticBox>

      <VariableBox slotter={slot} c1={24} r1={26} c2={33} r2={26} value={voucher?.accountant_name_snapshot||''}/>
      <StaticBox slotter={slot} c1={34} r1={26} c2={38} r2={26}>قسم المالية</StaticBox>

      <VariableBox slotter={slot} c1={43} r1={26} c2={50} r2={26} value={voucher?.party_name||''}/>
      <StaticBox slotter={slot} c1={51} r1={26} c2={55} r2={26}>{partyHeading}</StaticBox>

      <VariableBox slotter={slot} c1={8} r1={27} c2={14} r2={27} value={voucher?.approved_by_title_snapshot||''} className="tvm-role-field"/>
      <StaticBox slotter={slot} c1={15} r1={27} c2={19} r2={27}>الصفة/</StaticBox>

      <VariableBox slotter={slot} c1={24} r1={27} c2={33} r2={27} value={voucher?.accountant_title_snapshot||''} className="tvm-role-field"/>
      <StaticBox slotter={slot} c1={34} r1={27} c2={38} r2={27}>الصفة/</StaticBox>

      <VariableBox slotter={slot} c1={43} r1={27} c2={50} r2={27} value={partyRoleValue} className="tvm-role-field"/>
      <StaticBox slotter={slot} c1={51} r1={27} c2={55} r2={27}>{isEstablishment?'يمثلها/':'الصفة/'}</StaticBox>

      <VariableBox slotter={slot} c1={8} r1={28} c2={14} r2={29} value="" className="tvm-sign-space"/>
      <StaticBox slotter={slot} c1={15} r1={28} c2={19} r2={29}>التوقيع/</StaticBox>

      <VariableBox slotter={slot} c1={24} r1={28} c2={33} r2={29} value="" className="tvm-sign-space"/>
      <StaticBox slotter={slot} c1={34} r1={28} c2={38} r2={29}>التوقيع/</StaticBox>

      <VariableBox slotter={slot} c1={43} r1={28} c2={50} r2={29} value="" className="tvm-sign-space"/>
      <StaticBox slotter={slot} c1={51} r1={28} c2={55} r2={29}>التوقيع/</StaticBox>
    </section>
  </article>;
}
