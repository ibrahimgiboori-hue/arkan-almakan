'use client';

const TYPE_LABEL={receipt:'سند قبض',payment:'سند صرف'};
const METHOD_LABEL={cash:'نقدًا',bank_transfer:'تحويل بنكي',cheque:'شيك',card:'بطاقة',other:'أخرى'};
const ID_NUMBER_LABEL={national_id:'هوية رقم',iqama:'إقامة رقم',cr:'سجل تجاري رقم',passport:'جواز رقم',other:'رقم إثبات'};

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

function Fill({children,className='',sealed=false}){
  return <span className={`tv-fill ${sealed?'tv-fill-sealed':''} ${className}`.trim()}>
    <span className="tv-value">{children||'—'}</span>
    {sealed?<span className="tv-soft-fill" aria-hidden="true"/>:null}
  </span>;
}

export default function TreasuryVoucherPrint({voucher,settings}){
  const company=settings?.company_name_ar||'أركان المكان للمقاولات';
  const companyEn=settings?.company_name_en||'Arkan Al Makan Contracting';
  const isReceipt=voucher.voucher_type==='receipt';
  const method=METHOD_LABEL[voucher.payment_method]||voucher.payment_method||'';
  const idLabel=ID_NUMBER_LABEL[voucher.party_id_kind]||'رقم إثبات';
  const showBank=Boolean(voucher.bank_name&&voucher.payment_method!=='cash');
  const totalHalalas=Math.round(Number(voucher.amount||0)*100);
  const amountRiyals=Math.floor(totalHalalas/100);
  const amountHalalas=String(totalHalalas%100).padStart(2,'0');
  const effectivePaymentDate=voucher.payment_date||voucher.voucher_date||'';
  const beneficiaryRole=isReceipt?'عميل':'موظف';
  const englishTitle=isReceipt?'RECEIPT VOUCHER':'PAYMENT VOUCHER';
  const legalAcknowledgement='وأقر أنا المستفيد الموقع أدناه باستلام كامل المبلغ المبين في هذا السند رقمًا وكتابةً عن الاستحقاق الموضح أعلاه، بعد الاطلاع على بياناته والعلم بسبب الصرف وطريقة الوفاء، ويعد توقيعي إقرارًا بصحة الاستلام في حدود هذا السند، دون أن يعد إبراءً عامًا عن أي حقوق أو التزامات أخرى.';

  const paymentBody=isReceipt?(
    <>
      <div className="tv-flow-row" data-print-grid-row data-print-grid-name="treasury-receipt-party" data-print-resizable-block>
        <span className="tv-fixed">استلمنا نحن /</span><Fill sealed className="tv-grow">{company}</Fill>
        <span className="tv-fixed">سجل تجاري رقم /</span><Fill>{latinDigits(settings?.cr_number||'')}</Fill>
        <span className="tv-fixed">بمدينة /</span><Fill>{settings?.city||'الرياض'}</Fill>
      </div>
      <div className="tv-flow-row" data-print-resizable-block><span className="tv-fixed">من المكرم /</span><Fill sealed className="tv-grow">{voucher.party_name}</Fill></div>
      <div className="tv-flow-row" data-print-resizable-block><span className="tv-fixed">مبلغًا وقدره /</span><Fill sealed className="tv-grow">{voucher.amount_words} فقط لا غير</Fill></div>
      <div className="tv-flow-row" data-print-resizable-block><span className="tv-fixed">وذلك عن قيمة الاستحقاق /</span><Fill sealed className="tv-grow">{voucher.description}</Fill></div>
      <div className="tv-flow-row" data-print-grid-row data-print-grid-name="treasury-receipt-payment" data-print-resizable-block>
        <span className="tv-fixed">عبر /</span><Fill>{method}</Fill>
        {showBank?<><span className="tv-fixed">البنك /</span><Fill>{voucher.bank_name}</Fill></>:null}
        {voucher.payment_reference?<><span className="tv-fixed">مرجع الدفع /</span><Fill className="tv-grow">{voucher.payment_reference}</Fill></>:null}
        <span className="tv-fixed">تاريخ الدفع /</span><Fill>{formatDate(effectivePaymentDate)}</Fill>
      </div>
    </>
  ):(
    <>
      <div className="tv-flow-row tv-party-row" data-print-grid-row data-print-grid-name="treasury-beneficiary" data-print-resizable-block>
        <span className="tv-fixed">استلمنا نحن /</span><Fill sealed className="tv-name">{voucher.party_name}</Fill>
        <span className="tv-fixed">{idLabel} /</span><Fill sealed>{latinDigits(voucher.party_id_number||'')}</Fill>
        {voucher.party_nationality?<><span className="tv-fixed">الجنسية /</span><Fill sealed>{voucher.party_nationality}</Fill></>:null}
        {voucher.party_mobile?<><span className="tv-fixed">الجوال /</span><Fill sealed>{latinDigits(voucher.party_mobile)}</Fill></>:null}
      </div>
      <div className="tv-flow-row" data-print-grid-row data-print-grid-name="treasury-settlement" data-print-resizable-block>
        <span className="tv-fixed">بمدينة /</span><Fill sealed>{voucher.party_address||''}</Fill>
        <span className="tv-fixed">مبلغًا وقدره /</span><Fill sealed className="tv-grow">{amountRiyals.toLocaleString('en-US')}.{amountHalalas} ريال سعودي ({voucher.amount_words} فقط لا غير)</Fill>
        <span className="tv-fixed">عبر /</span><Fill>{method}</Fill>
      </div>
      <div className="tv-flow-row" data-print-grid-row data-print-grid-name="treasury-reference" data-print-resizable-block>
        {voucher.payment_reference?<><span className="tv-fixed">مرجع الدفع /</span><Fill className="tv-grow">{voucher.payment_reference}</Fill></>:null}
        {showBank?<><span className="tv-fixed">البنك /</span><Fill>{voucher.bank_name}</Fill></>:null}
        <span className="tv-fixed">تاريخ الدفع /</span><Fill>{formatDate(effectivePaymentDate)}</Fill>
      </div>
      <div className="tv-flow-row" data-print-resizable-block>
        <span className="tv-fixed">وذلك مقابل قيمة الاستحقاق /</span><Fill sealed className="tv-grow">{voucher.description}</Fill>
      </div>
    </>
  );

  return <article className="treasury-voucher-document" data-print-resizable-block>
    {voucher.status==='void'?<div className="tv-void">ملغى</div>:null}

    <header className="tv-brand" data-print-grid-row data-print-grid-name="treasury-brand" data-print-resizable-block>
      <img src="/brand/arkan-logo-official.svg" alt="شعار أركان المكان"/>
      <div className="tv-brand-name"><strong>{company}</strong><span>{companyEn}</span></div>
      <img src="/brand/arkan-logo-official.svg" alt="شعار أركان المكان"/>
    </header>

    <div className="tv-legal-bar" data-print-resizable-block>
      حي الملك فهد، الرياض &nbsp; | &nbsp; الرمز البريدي 12274 &nbsp; | &nbsp; س:ت: {latinDigits(settings?.cr_number||'—')} &nbsp; | &nbsp; الرقم الضريبي: {latinDigits(settings?.vat_number||'—')}
    </div>

    <section className="tv-top" data-print-grid-row data-print-grid-name="treasury-top" data-print-resizable-block>
      <div className="tv-meta">
        {[
          ['رقم الدفتر',latinDigits(voucher.book_no)],
          ['رقم السند',pageNo(voucher.page_no)],
          ['التاريخ',latinDigits(voucher.voucher_date)],
          ['المرجع',latinDigits(voucher.voucher_no)],
        ].map(([label,value],index)=><div className="tv-meta-row" key={label}>
          <div className="tv-red-cell">{label}</div><div className="tv-white-cell">{value}</div>
        </div>)}
      </div>
      <div className="tv-title-box">
        <div/>
        <div className="tv-title-fill"><strong>{TYPE_LABEL[voucher.voucher_type]}</strong><span>{englishTitle}</span></div>
        <div/>
      </div>
      <div className="tv-amount">
        <div className="tv-white-cell tv-amount-title">المبلغ</div>
        <div className="tv-white-cell tv-amount-number">{amountRiyals.toLocaleString('en-US')}</div>
        <div className="tv-red-cell tv-riyal">ريال</div>
        <div className="tv-white-cell tv-halala-number">{amountHalalas}</div>
        <div className="tv-red-cell tv-halala-label">هلله</div>
        <div className="tv-white-cell tv-amount-words">{String(voucher.amount_words||'').replace(/\s+فقط\s+لا\s+غير\s*$/,'').trim()}</div>
        <div className="tv-red-cell tv-words-label">لفظا</div>
      </div>
    </section>

    <section className="tv-body">
      {paymentBody}
      <div className="tv-ack" data-print-resizable-block>{legalAcknowledgement}</div>
    </section>

    <section className="tv-signatures" data-print-grid-row data-print-grid-name="treasury-signatures" data-print-resizable-block>
      <div className="tv-sign">
        <div className="tv-sign-row"><span>المستفيد /</span><strong>{voucher.party_name}</strong></div>
        <div className="tv-sign-row"><span>الصفة /</span><strong>{beneficiaryRole}</strong></div>
        <div className="tv-sign-row"><span>التوقيع /</span><i/></div>
      </div>
      <div className="tv-sign">
        <div className="tv-sign-row"><span>المحاسب /</span><strong>{voucher.accountant_name_snapshot||'—'}</strong></div>
        <div className="tv-sign-row"><span>الصفة /</span><strong>{voucher.accountant_title_snapshot||'—'}</strong></div>
        <div className="tv-sign-row"><span>التوقيع /</span><i/></div>
      </div>
      <div className="tv-sign tv-admin-sign">
        <div className="tv-sign-row"><span>اعتماد الإدارة /</span><strong>{voucher.approved_by_name_snapshot||'—'}</strong></div>
        <div className="tv-sign-row"><span>المسمى /</span><strong>{voucher.approved_by_title_snapshot||'—'}</strong></div>
        <div className="tv-sign-row"><span>التوقيع /</span><i/></div>
      </div>
    </section>

    <footer className="tv-footer">هذا السند ملزم في حدود مبلغه وبيانه وتوقيعاته.</footer>
  </article>;
}
