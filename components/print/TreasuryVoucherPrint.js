'use client';

const COL_MM = 4.95;
const ROW_MM = 5;
const FRAME_X = 29.7;
const FRAME_Y = 30;
const FRAME_W = 237.6;
const FRAME_H = 110;

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

function slot(c1,r1,c2,r2){
  return {
    left:`${(c1-8)*COL_MM}mm`,
    top:`${(r1-8)*ROW_MM}mm`,
    width:`${(c2-c1+1)*COL_MM}mm`,
    height:`${(r2-r1+1)*ROW_MM}mm`,
  };
}

function StaticBox({children,c1,r1,c2,r2,className=''}) {
  return <div className={`tvm-static ${className}`} style={slot(c1,r1,c2,r2)}>{children}</div>;
}

function PlainBox({children,c1,r1,c2,r2,className=''}) {
  return <div className={`tvm-plain ${className}`} style={slot(c1,r1,c2,r2)}>{children}</div>;
}

function VariableBox({value,c1,r1,c2,r2,className='',ltr=false}) {
  const text=String(value??'').trim();
  return <div className={`tvm-variable ${className} ${ltr?'tvm-ltr':''}`} style={slot(c1,r1,c2,r2)}>
    {text?<span className="tvm-variable-value">{text}</span>:null}
    <span className="tvm-variable-remainder" aria-hidden="true"/>
  </div>;
}

export default function TreasuryVoucherPrint({voucher,settings}){
  const isReceipt=voucher?.voucher_type==='receipt';
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
      <PlainBox c1={8} r1={8} c2={23} r2={8} className="tvm-company-en">{companyEn}</PlainBox>
      <PlainBox c1={8} r1={9} c2={23} r2={9}>CR No: {latinDigits(settings?.cr_number||'7042008503')}</PlainBox>
      <PlainBox c1={8} r1={10} c2={23} r2={10}>Riyadh – King Fahd District</PlainBox>

      <PlainBox c1={39} r1={8} c2={55} r2={8} className="tvm-company-ar">{companyAr}</PlainBox>
      <PlainBox c1={39} r1={9} c2={55} r2={9}>س:ت {latinDigits(settings?.cr_number||'1009112888')}</PlainBox>
      <PlainBox c1={39} r1={10} c2={55} r2={10}>المملكة العربية السعودية - الرياض - حي الملك فهد</PlainBox>

      <div className="tvm-logo" style={slot(24,8,38,14)}>
        <img src="/brand/arkan-logo-official.svg" alt="شعار أركان المكان"/>
      </div>

      <StaticBox c1={8} r1={12} c2={11} r2={12}>رقم الدفتر</StaticBox>
      <StaticBox c1={12} r1={12} c2={17} r2={12}>رقم السند</StaticBox>
      <StaticBox c1={18} r1={12} c2={23} r2={12}>رقم المرجع</StaticBox>
      <VariableBox c1={8} r1={13} c2={11} r2={13} value={latinDigits(voucher?.book_no)} ltr/>
      <VariableBox c1={12} r1={13} c2={17} r2={13} value={pageNo(voucher?.page_no)} ltr/>
      <VariableBox c1={18} r1={13} c2={23} r2={13} value={latinDigits(voucher?.voucher_no)} ltr/>

      <StaticBox c1={39} r1={12} c2={48} r2={12}>ريال - SR</StaticBox>
      <StaticBox c1={49} r1={12} c2={55} r2={12}>هللة - Halalah</StaticBox>
      <VariableBox c1={39} r1={13} c2={48} r2={13} value={amountRiyals} ltr/>
      <VariableBox c1={49} r1={13} c2={55} r2={13} value={amountHalalas} ltr/>

      <VariableBox c1={8} r1={15} c2={17} r2={15} value={latinDigits(voucher?.voucher_date_hijri||'')} ltr/>
      <StaticBox c1={18} r1={15} c2={23} r2={15}>الموافق /</StaticBox>
      <StaticBox c1={24} r1={15} c2={38} r2={15} className="tvm-voucher-title"><strong>{titleAr}</strong><span>{titleEn}</span></StaticBox>
      <VariableBox c1={39} r1={15} c2={49} r2={15} value={formatDate(voucher?.voucher_date)} ltr/>
      <StaticBox c1={50} r1={15} c2={55} r2={15}>التاريخ /</StaticBox>

      <VariableBox c1={8} r1={17} c2={14} r2={17} value={latinDigits(voucher?.party_mobile||'')} ltr/>
      <StaticBox c1={15} r1={17} c2={18} r2={17}>جوال رقم /</StaticBox>
      <VariableBox c1={19} r1={17} c2={28} r2={17} value={latinDigits(voucher?.party_id_number||'')} ltr/>
      <StaticBox c1={29} r1={17} c2={32} r2={17}>{idLabel} /</StaticBox>
      <VariableBox c1={33} r1={17} c2={50} r2={17} value={voucher?.party_name||''}/>
      <StaticBox c1={51} r1={17} c2={55} r2={17}>{isReceipt?'استلمنا من السيد /':'استلمنا نحن /'}</StaticBox>

      <VariableBox c1={8} r1={18} c2={14} r2={18} value={method}/>
      <StaticBox c1={15} r1={18} c2={18} r2={18}>وذلك عبر /</StaticBox>
      <VariableBox c1={19} r1={18} c2={35} r2={18} value={String(voucher?.amount_words||'').replace(/\s+فقط\s+لا\s+غير\s*$/,'').trim()} className="tvm-words-field"/>
      <VariableBox c1={37} r1={18} c2={42} r2={18} value={`${amountRiyals}.${amountHalalas}`} ltr/>
      <StaticBox c1={43} r1={18} c2={44} r2={18}>مبلغ /</StaticBox>
      <VariableBox c1={45} r1={18} c2={50} r2={18} value={city}/>
      <StaticBox c1={51} r1={18} c2={55} r2={18}>بمدينة /</StaticBox>

      <VariableBox c1={8} r1={19} c2={32} r2={19} value={voucher?.description||''} className="tvm-purpose-field"/>
      <StaticBox c1={33} r1={19} c2={38} r2={19}>وذلك مقابل الاستحقاق /</StaticBox>
      <VariableBox c1={39} r1={19} c2={50} r2={19} value={voucher?.supporting_reference||voucher?.payment_reference||''}/>
      <StaticBox c1={51} r1={19} c2={55} r2={19}>مرجع الدفع /</StaticBox>

      <VariableBox c1={8} r1={20} c2={55} r2={20} value="" className="tvm-continuation"/>

      <PlainBox c1={8} r1={21} c2={55} r2={23} className="tvm-legal">
        {voucher?.legal_text_snapshot||'وأقر أنا المستفيد الموقع أدناه باستلام كامل المبلغ المبين في هذا السند رقمًا وكتابةً عن الاستحقاق الموضح أعلاه، بعد الاطلاع على بياناته والعلم بسبب الصرف وطريقة الوفاء، ويعد توقيعي إقرارًا بصحة الاستلام في حدود هذا السند، دون أن يعد إبراءً عامًا عن أي حقوق أو التزامات أخرى.'}
      </PlainBox>

      <StaticBox c1={8} r1={24} c2={19} r2={24}>اعتماد الإدارة</StaticBox>
      <StaticBox c1={24} r1={24} c2={38} r2={24}>قسم المالية</StaticBox>
      <StaticBox c1={43} r1={24} c2={55} r2={24}>{partyHeading}</StaticBox>

      <VariableBox c1={8} r1={25} c2={19} r2={25} value={voucher?.approved_by_name_snapshot||''}/>
      <VariableBox c1={24} r1={25} c2={38} r2={25} value={voucher?.accountant_name_snapshot||''}/>
      <VariableBox c1={43} r1={25} c2={55} r2={25} value={voucher?.party_name||''}/>

      <VariableBox c1={8} r1={26} c2={16} r2={26} value={voucher?.approved_by_title_snapshot||''} className="tvm-role-field"/>
      <StaticBox c1={17} r1={26} c2={19} r2={26}>الصفة /</StaticBox>
      <VariableBox c1={24} r1={26} c2={35} r2={26} value={voucher?.accountant_title_snapshot||''} className="tvm-role-field"/>
      <StaticBox c1={36} r1={26} c2={38} r2={26}>الصفة /</StaticBox>
      <VariableBox c1={43} r1={26} c2={52} r2={26} value={partyRoleValue} className="tvm-role-field"/>
      <StaticBox c1={53} r1={26} c2={55} r2={26}>{isEstablishment?'يمثلها /':'الصفة /'}</StaticBox>

      <VariableBox c1={8} r1={27} c2={16} r2={29} value="" className="tvm-sign-space"/>
      <StaticBox c1={17} r1={27} c2={19} r2={29}>التوقيع /</StaticBox>
      <VariableBox c1={24} r1={27} c2={35} r2={29} value="" className="tvm-sign-space"/>
      <StaticBox c1={36} r1={27} c2={38} r2={29}>التوقيع /</StaticBox>
      <VariableBox c1={43} r1={27} c2={52} r2={29} value="" className="tvm-sign-space"/>
      <StaticBox c1={53} r1={27} c2={55} r2={29}>التوقيع /</StaticBox>
    </section>
  </article>;
}
