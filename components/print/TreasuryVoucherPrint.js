'use client';

// Geometry is taken from the latest approved workbook skeleton H8:BC29.
// In the uploaded workbook, columns A:BN are all width=2 and the default row height is 14.25pt.
// We therefore keep 48 equal columns across H:BC and use the exact Excel row height.
const FRAME_X = 29.7;
const FRAME_Y = 30;
const FRAME_W = 237.6;
const ROW_MM = 14.25 * 25.4 / 72;
const FRAME_H = 22 * ROW_MM;

function excelColUnits(isReceipt){
  return Array.from({length:48},(_,index)=>{
    const excelCol=8+index; // H..BC
    return isReceipt && (excelCol===10 || excelCol===52) ? 2 : 13;
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

function createSlotter(isReceipt){
  const units=excelColUnits(isReceipt);
  const total=units.reduce((sum,value)=>sum+value,0);
  const unitMm=FRAME_W/total;
  const colOffsetMm=(excelCol)=>{
    const count=Math.max(0,excelCol-8);
    return units.slice(0,count).reduce((sum,value)=>sum+value,0)*unitMm;
  };
  const colSpanMm=(c1,c2)=>{
    const start=Math.max(0,c1-8);
    const end=Math.max(start,c2-8);
    return units.slice(start,end+1).reduce((sum,value)=>sum+value,0)*unitMm;
  };
  return (c1,r1,c2,r2)=>({
    left:`${colOffsetMm(c1)}mm`,
    top:`${(r1-8)*ROW_MM}mm`,
    width:`${colSpanMm(c1,c2)}mm`,
    height:`${(r2-r1+1)*ROW_MM}mm`,
  });
}

function StaticBox({children,c1,r1,c2,r2,className='',slotter}) {
  const bodyClass=r1>=18?'tvm-body-static':'';
  return <div className={`tvm-static ${bodyClass} ${className}`.trim()} style={slotter(c1,r1,c2,r2)}>{children}</div>;
}

function PlainBox({children,c1,r1,c2,r2,className='',slotter}) {
  return <div className={`tvm-plain ${className}`} style={slotter(c1,r1,c2,r2)}>{children}</div>;
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
  const titleAr=isReceipt?'سند قبض':'سند صرف';
  const titleEn=isReceipt?'RECEIPT VOUCHER':'PAYMENT VOUCHER';
  const companyAr=settings?.company_name_ar||'مؤسسة أركان المكان للمقاولات العامة';
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
      <PlainBox slotter={slot} c1={8} r1={8} c2={23} r2={9} className="tvm-company-en">{companyEn}</PlainBox>
      <PlainBox slotter={slot} c1={8} r1={10} c2={23} r2={10}>CR No: {latinDigits(settings?.cr_number||'7042008503')}</PlainBox>
      <PlainBox slotter={slot} c1={8} r1={11} c2={23} r2={11}>Riyadh – King Fahd District</PlainBox>

      <PlainBox slotter={slot} c1={39} r1={8} c2={55} r2={9} className="tvm-company-ar">{companyAr}</PlainBox>
      <PlainBox slotter={slot} c1={39} r1={10} c2={55} r2={10}>س:ت {latinDigits(settings?.cr_number||'1009112888')}</PlainBox>
      <PlainBox slotter={slot} c1={39} r1={11} c2={55} r2={11}>المملكة العربية السعودية - الرياض - حي الملك فهد</PlainBox>

      <div className="tvm-logo" style={slot(24,8,38,14)}>
        <img src="/brand/arkan-logo-official.svg" alt="شعار أركان المكان"/>
      </div>

      <StaticBox slotter={slot} c1={8} r1={12} c2={11} r2={12}>رقم الدفتر</StaticBox>
      <StaticBox slotter={slot} c1={12} r1={12} c2={17} r2={12}>رقم السند</StaticBox>
      <StaticBox slotter={slot} c1={18} r1={12} c2={23} r2={12}>رقم المرجع</StaticBox>
      <VariableBox slotter={slot} c1={8} r1={13} c2={11} r2={13} value={latinDigits(voucher?.book_no)} ltr/>
      <VariableBox slotter={slot} c1={12} r1={13} c2={17} r2={13} value={pageNo(voucher?.page_no)} ltr/>
      <VariableBox slotter={slot} c1={18} r1={13} c2={23} r2={13} value={latinDigits(voucher?.voucher_no)} ltr/>

      <StaticBox slotter={slot} c1={39} r1={12} c2={48} r2={12}>ريال - SR</StaticBox>
      <StaticBox slotter={slot} c1={49} r1={12} c2={55} r2={12}>هللة - Hal.</StaticBox>
      <VariableBox slotter={slot} c1={39} r1={13} c2={48} r2={13} value={amountRiyals} ltr/>
      <VariableBox slotter={slot} c1={49} r1={13} c2={55} r2={13} value={amountHalalas} ltr/>

      <VariableBox slotter={slot} c1={8} r1={15} c2={17} r2={15} value={latinDigits(voucher?.voucher_date_hijri||'')} ltr/>
      <StaticBox slotter={slot} c1={18} r1={15} c2={23} r2={15}>الموافق /</StaticBox>
      <StaticBox slotter={slot} c1={24} r1={15} c2={38} r2={16} className="tvm-voucher-title"><strong>{titleAr}</strong><span>{titleEn}</span></StaticBox>
      <VariableBox slotter={slot} c1={39} r1={15} c2={38+12} r2={15} value={formatDate(voucher?.voucher_date)} ltr/>
      <StaticBox slotter={slot} c1={39} r1={15} c2={44} r2={15}>التاريخ/</StaticBox>

      <VariableBox slotter={slot} c1={8} r1={18} c2={14} r2={18} value={latinDigits(voucher?.party_mobile||'')} ltr/>
      <StaticBox slotter={slot} c1={15} r1={18} c2={18} r2={18}>جوال رقم /</StaticBox>
      <VariableBox slotter={slot} c1={19} r1={18} c2={28} r2={18} value={latinDigits(voucher?.party_id_number||'')} ltr/>
      <StaticBox slotter={slot} c1={29} r1={18} c2={32} r2={18}>{idLabel} /</StaticBox>
      <VariableBox slotter={slot} c1={33} r1={18} c2={50} r2={18} value={voucher?.party_name||''}/>
      <StaticBox slotter={slot} c1={51} r1={18} c2={55} r2={18}>{isReceipt?'استلمنا من السيد /':'استلمنا نحن /'}</StaticBox>

      <VariableBox slotter={slot} c1={8} r1={19} c2={14} r2={19} value={method}/>
      <StaticBox slotter={slot} c1={15} r1={19} c2={18} r2={19}>وذلك عبر/</StaticBox>
      <VariableBox slotter={slot} c1={19} r1={19} c2={35} r2={19} value={String(voucher?.amount_words||'').replace(/\s+فقط\s+لا\s+غير\s*$/,'').trim()} className="tvm-words-field"/>
      <VariableBox slotter={slot} c1={37} r1={19} c2={42} r2={19} value={`${amountRiyals}.${amountHalalas}`} ltr/>
      <StaticBox slotter={slot} c1={43} r1={19} c2={44} r2={19}>مبلغ/</StaticBox>
      <VariableBox slotter={slot} c1={45} r1={19} c2={50} r2={19} value={city}/>
      <StaticBox slotter={slot} c1={51} r1={19} c2={55} r2={19}>بمدينة/</StaticBox>

      <VariableBox slotter={slot} c1={8} r1={20} c2={32} r2={20} value={voucher?.description||''} className="tvm-purpose-field"/>
      <StaticBox slotter={slot} c1={33} r1={20} c2={38} r2={20}>وذلك مقابل/</StaticBox>
      <VariableBox slotter={slot} c1={39} r1={20} c2={50} r2={20} value={voucher?.supporting_reference||voucher?.payment_reference||''}/>
      <StaticBox slotter={slot} c1={51} r1={20} c2={55} r2={20}>مرجع الدفع/</StaticBox>

      <VariableBox slotter={slot} c1={8} r1={21} c2={55} r2={21} value={voucher?.description||''} className="tvm-continuation"/>

      <PlainBox slotter={slot} c1={8} r1={22} c2={55} r2={24} className="tvm-legal">
        {voucher?.legal_text_snapshot||'وأقر أنا المستفيد الموقع أدناه باستلام كامل المبلغ المبين في هذا السند رقمًا وكتابةً عن الاستحقاق الموضح أعلاه، بعد الاطلاع على بياناته والعلم بسبب الصرف وطريقة الوفاء، ويعد توقيعي إقرارًا بصحة الاستلام في حدود هذا السند، دون أن يعد إبراءً عامًا عن أي حقوق أو التزامات أخرى.'}
      </PlainBox>

      <StaticBox slotter={slot} c1={8} r1={28} c2={19} r2={24}>اعتماد الإدارة</StaticBox>
      <StaticBox slotter={slot} c1={24} r1={28} c2={38} r2={24}>قسم المالية</StaticBox>
      <StaticBox slotter={slot} c1={43} r1={28} c2={55} r2={24}>{partyHeading}</StaticBox>

      <VariableBox slotter={slot} c1={8} r1={28} c2={19} r2={27} value={voucher?.approved_by_name_snapshot||''}/>
      <VariableBox slotter={slot} c1={24} r1={28} c2={38} r2={27} value={voucher?.accountant_name_snapshot||''}/>
      <VariableBox slotter={slot} c1={43} r1={28} c2={55} r2={27} value={voucher?.party_name||''}/>

      <VariableBox slotter={slot} c1={8} r1={28} c2={16} r2={27} value={voucher?.approved_by_title_snapshot||''} className="tvm-role-field"/>
      <StaticBox slotter={slot} c1={17} r1={28} c2={19} r2={27}>الصفة /</StaticBox>
      <VariableBox slotter={slot} c1={24} r1={28} c2={35} r2={27} value={voucher?.accountant_title_snapshot||''} className="tvm-role-field"/>
      <StaticBox slotter={slot} c1={36} r1={28} c2={38} r2={27}>الصفة /</StaticBox>
      <VariableBox slotter={slot} c1={43} r1={28} c2={52} r2={27} value={partyRoleValue} className="tvm-role-field"/>
      <StaticBox slotter={slot} c1={53} r1={28} c2={55} r2={27}>{isEstablishment?'يمثلها /':'الصفة /'}</StaticBox>

      <VariableBox slotter={slot} c1={8} r1={28} c2={16} r2={29} value="" className="tvm-sign-space"/>
      <StaticBox slotter={slot} c1={17} r1={28} c2={19} r2={29}>التوقيع /</StaticBox>
      <VariableBox slotter={slot} c1={24} r1={28} c2={35} r2={29} value="" className="tvm-sign-space"/>
      <StaticBox slotter={slot} c1={36} r1={28} c2={38} r2={29}>التوقيع /</StaticBox>
      <VariableBox slotter={slot} c1={43} r1={28} c2={52} r2={29} value="" className="tvm-sign-space"/>
      <StaticBox slotter={slot} c1={53} r1={28} c2={55} r2={29}>التوقيع /</StaticBox>
    </section>
  </article>;
}
