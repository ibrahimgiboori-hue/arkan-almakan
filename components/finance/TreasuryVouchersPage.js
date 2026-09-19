'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useDashboardSession } from '@/lib/dashboard-session-context';
import {
  ConstitutionPage,
  PageHeader,
  Section,
  SummaryStrip,
  EntrySurface,
  FilterSurface,
  TableFrame,
  EmptyState,
  Notice,
} from '@/components/ui/ConstitutionUI';

const ONES=['','واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة'];
const TEENS={10:'عشرة',11:'أحد عشر',12:'اثنا عشر',13:'ثلاثة عشر',14:'أربعة عشر',15:'خمسة عشر',16:'ستة عشر',17:'سبعة عشر',18:'ثمانية عشر',19:'تسعة عشر'};
const TENS={20:'عشرون',30:'ثلاثون',40:'أربعون',50:'خمسون',60:'ستون',70:'سبعون',80:'ثمانون',90:'تسعون'};
const HUNDREDS={100:'مائة',200:'مائتان',300:'ثلاثمائة',400:'أربعمائة',500:'خمسمائة',600:'ستمائة',700:'سبعمائة',800:'ثمانمائة',900:'تسعمائة'};
const SCALES=[null,{one:'ألف',two:'ألفان',few:'آلاف',many:'ألفًا'},{one:'مليون',two:'مليونان',few:'ملايين',many:'مليونًا'},{one:'مليار',two:'ملياران',few:'مليارات',many:'مليارًا'},{one:'تريليون',two:'تريليونان',few:'تريليونات',many:'تريليونًا'}];
const TYPE_LABEL={receipt:'سند قبض',payment:'سند صرف'};
const METHOD_LABEL={cash:'نقدًا',bank_transfer:'تحويل بنكي',cheque:'شيك',card:'بطاقة',other:'أخرى'};
const ID_LABEL={national_id:'هوية وطنية',iqama:'إقامة',cr:'سجل تجاري',passport:'جواز سفر',other:'أخرى'};
const ID_NUMBER_LABEL={national_id:'هوية وطنية رقم',iqama:'إقامة رقم',cr:'سجل تجاري رقم',passport:'جواز سفر رقم',other:'رقم إثبات'};
const AR_MONTHS=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

function joinArabic(parts){return parts.filter(Boolean).join(' و');}
function underHundred(value){
  const n=Number(value)||0;
  if(n<10)return ONES[n];
  if(n<20)return TEENS[n];
  const ones=n%10;const tens=n-ones;
  return ones?`${ONES[ones]} و${TENS[tens]}`:TENS[tens];
}
function underThousand(value){
  const n=Number(value)||0;
  const hundred=Math.floor(n/100)*100;const rest=n%100;
  return joinArabic([hundred?HUNDREDS[hundred]:'',rest?underHundred(rest):'']);
}
function integerWords(value){
  const n=Math.floor(Math.abs(Number(value)||0));
  if(n===0)return 'صفر';
  const parts=[];let left=n;let scale=0;
  while(left>0){
    const group=left%1000;
    if(group){
      if(scale===0)parts.unshift(underThousand(group));
      else{
        const names=SCALES[scale];
        if(group===1)parts.unshift(names.one);
        else if(group===2)parts.unshift(names.two);
        else parts.unshift(`${underThousand(group)} ${group>=3&&group<=10?names.few:names.many}`);
      }
    }
    left=Math.floor(left/1000);scale+=1;
  }
  return joinArabic(parts);
}
function currencyPart(value,labels){
  const n=Number(value)||0;
  if(n===1)return labels.one;
  if(n===2)return labels.two;
  const lastTwo=n%100;
  return `${integerWords(n)} ${lastTwo>=3&&lastTwo<=10?labels.few:labels.many}`;
}
function amountToArabicWords(value){
  const amount=Number(value);
  if(!Number.isFinite(amount)||amount<=0)return '';
  const total=Math.round(amount*100);
  const riyals=Math.floor(total/100);const halalas=total%100;
  const parts=[];
  if(riyals)parts.push(currencyPart(riyals,{one:'ريال سعودي واحد',two:'ريالان سعوديان',few:'ريالات سعودية',many:'ريالًا سعوديًا'}));
  if(halalas)parts.push(currencyPart(halalas,{one:'هللة واحدة',two:'هللتان',few:'هللات',many:'هللة'}));
  return joinArabic(parts.length?parts:['صفر ريال سعودي']);
}
function today(){
  const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const values=Object.fromEntries(parts.map((part)=>[part.type,part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function money(value){return `${Number(value||0).toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})} ر.س`;}
function esc(value){return String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function pageNo(value){const n=Number(value)||0;return n===100?'100':String(n).padStart(2,'0');}
function errorMessage(error){return error?.message||'تعذر تنفيذ العملية.';}
function salaryPeriodLabel(dateValue){
  const match=String(dateValue||'').match(/^(\d{4})-(\d{2})-/);
  if(!match)return '';
  const month=AR_MONTHS[Number(match[2])-1];
  return month?`${month} ${match[1]}`:'';
}

const EMPTY_VOUCHER={
  voucher_type:'receipt',voucher_date:'',account_id:'',page_no:'',party_name:'',party_id_kind:'',party_id_number:'',party_mobile:'',party_address:'',amount:'',payment_method:'cash',bank_name:'',payment_reference:'',payment_date:'',description:'',issuer_employee_id:'',approved_by_employee_id:''
};

export default function TreasuryVouchersPage(){
  const me=useDashboardSession();
  const [state,setState]=useState({loading:true,accounts:[],books:[],vouchers:[],actors:[],settings:null,error:''});
  const [form,setForm]=useState({...EMPTY_VOUCHER,voucher_date:today()});
  const [accountForm,setAccountForm]=useState({name_ar:'الصندوق الرئيسي',account_type:'cash',opening_balance:'0',bank_name:'',iban:'',allow_negative:false});
  const [showEntry,setShowEntry]=useState(false);
  const [showAccountEntry,setShowAccountEntry]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [filter,setFilter]=useState('all');
  const [query,setQuery]=useState('');

  const full=Boolean(me?.access?.fullAdmin);
  const keys=me?.capabilityKeys||new Set();
  const canReceipt=full||keys.has('finance.treasury.collect');
  const canPayment=full||keys.has('finance.treasury.pay');
  const canCreateAccount=full||keys.has('finance.treasury.create');
  const canVoid=full||keys.has('finance.treasury.reverse');
  const amountWords=useMemo(()=>amountToArabicWords(form.amount),[form.amount]);

  async function load(){
    setState((current)=>({...current,loading:true,error:''}));
    const [accountsQ,booksQ,vouchersQ,actorsQ,settingsQ]=await Promise.all([
      supabase.from('v_treasury_balances').select('id,account_code,name_ar,account_type,bank_name,currency,current_balance,total_inflow,total_outflow,is_active').eq('is_active',true).order('account_code'),
      supabase.from('cash_voucher_books').select('id,voucher_type,book_no,next_page,status,opened_at,closed_at').order('book_no',{ascending:false}),
      supabase.from('cash_vouchers').select('*').order('created_at',{ascending:false}).limit(300),
      supabase.from('employees').select('id,full_name_ar,job_title,department,status').eq('status','active').order('full_name_ar'),
      supabase.from('app_settings').select('company_name_ar,company_name_en,cr_number,vat_number,national_address,city,phone_1,email,stamp_image_path,signature_image_path,show_stamp_by_default,stamp_size_mm,signature_size_mm').eq('id',1).maybeSingle(),
    ]);
    const failed=[accountsQ,booksQ,vouchersQ,actorsQ].find((item)=>item.error);
    if(failed?.error){setState((current)=>({...current,loading:false,error:errorMessage(failed.error)}));return;}
    const accounts=accountsQ.data||[];
    const actors=actorsQ.data||[];
    const defaultManager=actors.find((item)=>item.full_name_ar==='محمد انتصار تركي')||actors.find((item)=>item.job_title==='المدير التنفيذي')||actors[0]||null;
    setState({loading:false,accounts,books:booksQ.data||[],vouchers:vouchersQ.data||[],actors,settings:settingsQ.error?null:(settingsQ.data||null),error:''});
    setForm((current)=>({...current,account_id:current.account_id||accounts[0]?.id||'',issuer_employee_id:current.issuer_employee_id||defaultManager?.id||'',approved_by_employee_id:current.approved_by_employee_id||defaultManager?.id||''}));
  }

  useEffect(()=>{load();},[]);

  const accountMap=useMemo(()=>new Map(state.accounts.map((item)=>[item.id,item])),[state.accounts]);
  const actorMap=useMemo(()=>new Map(state.actors.map((item)=>[item.id,item])),[state.actors]);
  const visible=useMemo(()=>state.vouchers.filter((voucher)=>{
    if(filter!=='all'&&voucher.voucher_type!==filter)return false;
    const needle=query.trim().toLowerCase();
    if(!needle)return true;
    return [voucher.voucher_no,voucher.party_name,voucher.party_id_number,voucher.description,voucher.payment_reference].some((value)=>String(value||'').toLowerCase().includes(needle));
  }),[state.vouchers,filter,query]);
  const posted=state.vouchers.filter((voucher)=>voucher.status==='posted');
  const totalBalance=state.accounts.reduce((sum,item)=>sum+Number(item.current_balance||0),0);

  useEffect(()=>{
    const account=accountMap.get(form.account_id);
    if(form.voucher_type!=='payment'||!/رواتب/.test(account?.name_ar||''))return;
    const period=salaryPeriodLabel(form.voucher_date);
    if(!period)return;
    setForm((current)=>{
      const next={...current};
      if(!current.payment_reference||/^مسير رواتب شهر /.test(current.payment_reference)||/^راتب شهر /.test(current.payment_reference)){
        next.payment_reference=`مسير رواتب شهر ${period}`;
      }
      if(!current.description||/^صرف راتب شهر /.test(current.description)||/^مسير الرواتب/.test(current.description)||/^راتب شهر /.test(current.description)){
        next.description=`صرف راتب شهر ${period}`;
      }
      return next.payment_reference===current.payment_reference&&next.description===current.description?current:next;
    });
  },[form.account_id,form.voucher_date,form.voucher_type,accountMap]);

  function nextBook(type){
    const latest=state.books.filter((book)=>book.voucher_type===type).sort((a,b)=>Number(b.book_no)-Number(a.book_no))[0];
    if(!latest)return {book:2,page:1};
    if(latest.status==='open'&&Number(latest.next_page)<=100)return {book:Number(latest.book_no),page:Number(latest.next_page)};
    return {book:Number(latest.book_no)+1,page:1};
  }
  const nextReceipt=nextBook('receipt');const nextPayment=nextBook('payment');
  function currentBookFor(type){return type==='receipt'?nextReceipt.book:nextPayment.book;}
  function usedPagesFor(type){
    const book=currentBookFor(type);
    return new Set(state.vouchers.filter((v)=>v.voucher_type===type&&Number(v.book_no)===Number(book)).map((v)=>Number(v.page_no)));
  }

  function openEntry(type){
    const defaultManager=state.actors.find((item)=>item.full_name_ar==='محمد انتصار تركي')||state.actors.find((item)=>item.job_title==='المدير التنفيذي')||state.actors[0]||null;
    const suggested=type==='receipt'?nextReceipt.page:nextPayment.page;
    setForm({...EMPTY_VOUCHER,voucher_type:type,voucher_date:today(),account_id:state.accounts[0]?.id||'',page_no:String(suggested||1),issuer_employee_id:defaultManager?.id||'',approved_by_employee_id:defaultManager?.id||''});
    setMessage('');setShowAccountEntry(false);setShowEntry(true);
  }
  function field(name,value){setForm((current)=>({...current,[name]:value}));}

  async function issueVoucher(event){
    event.preventDefault();setMessage('');
    const selectedPage=Number(form.page_no);
    if(!Number.isInteger(selectedPage)||selectedPage<1||selectedPage>100){setMessage('اختر رقم السند من 01 إلى 100.');return;}
    if(usedPagesFor(form.voucher_type).has(selectedPage)){setMessage(`رقم السند ${pageNo(selectedPage)} مستخدم بالفعل في الدفتر الحالي.`);return;}
    if(!form.account_id||!form.party_name.trim()||!form.description.trim()||!amountWords||!form.issuer_employee_id||!form.approved_by_employee_id){setMessage('أكمل الحساب والطرف والمبلغ وسبب السند ومصدر السند واعتماد الإدارة.');return;}
    setBusy(true);
    const {data,error}=await supabase.rpc('fn_cash_voucher_issue_manual',{
      p_voucher_type:form.voucher_type,p_page_no:selectedPage,p_account_id:form.account_id,p_amount:Number(form.amount),p_amount_words:amountWords,p_voucher_date:form.voucher_date||today(),p_party_name:form.party_name.trim(),p_party_id_kind:form.party_id_kind||null,p_party_id_number:form.party_id_number||null,p_party_mobile:form.party_mobile||null,p_party_address:form.party_address||null,p_payment_method:form.payment_method,p_bank_name:form.bank_name||null,p_payment_reference:form.payment_reference||null,p_payment_date:form.payment_date||null,p_description:form.description.trim(),p_issuer_employee_id:form.issuer_employee_id,p_approved_by_employee_id:form.approved_by_employee_id
    });
    setBusy(false);
    if(error){setMessage(errorMessage(error));return;}
    setMessage(`تم إصدار ${TYPE_LABEL[form.voucher_type]} رقم ${data?.voucher_no||''} — الدفتر ${data?.book_no} / الصفحة ${pageNo(data?.page_no)}.`);
    setShowEntry(false);await load();
  }

  async function createAccount(event){
    event.preventDefault();setMessage('');setBusy(true);
    const {error}=await supabase.rpc('fn_treasury_create_account',{p_name_ar:accountForm.name_ar.trim(),p_account_type:accountForm.account_type,p_opening_balance:Number(accountForm.opening_balance||0),p_bank_name:accountForm.bank_name||null,p_iban:accountForm.iban||null,p_entity_id:null,p_allow_negative:Boolean(accountForm.allow_negative)});
    setBusy(false);
    if(error){setMessage(errorMessage(error));return;}
    setMessage('تم إنشاء حساب الخزينة.');setShowAccountEntry(false);await load();
  }

  async function voidVoucher(voucher){
    const reason=window.prompt(`اكتب سبب إلغاء السند ${voucher.voucher_no}`,'');
    if(!reason?.trim())return;
    setBusy(true);setMessage('');
    const {error}=await supabase.rpc('fn_cash_voucher_void',{p_voucher_id:voucher.id,p_reason:reason.trim()});
    setBusy(false);
    if(error){setMessage(errorMessage(error));return;}
    setMessage(`تم إلغاء السند ${voucher.voucher_no} مع الاحتفاظ برقمه في التسلسل.`);await load();
  }

  function printVoucher(voucher){
    const settings=state.settings||{};
    const company=settings.company_name_ar||'أركان المكان للمقاولات';
    const companyEn=settings.company_name_en||'Arkan Al Makan Contracting';
    const issuerName=voucher.issuer_name_snapshot||actorMap.get(voucher.issuer_employee_id)?.full_name_ar||'—';
    const issuerTitle=voucher.issuer_title_snapshot||actorMap.get(voucher.issuer_employee_id)?.job_title||'';
    const approverName=voucher.approved_by_name_snapshot||actorMap.get(voucher.approved_by_employee_id)?.full_name_ar||'—';
    const approverTitle=voucher.approved_by_title_snapshot||actorMap.get(voucher.approved_by_employee_id)?.job_title||'';
    const stampUrl=settings.stamp_image_path?supabase.storage.from('brand').getPublicUrl(settings.stamp_image_path).data.publicUrl:'';
    const stampSizeMm=Math.min(55,Math.max(15,Number(settings.stamp_size_mm||30)));
    const isReceipt=voucher.voucher_type==='receipt';
    const isEntity=voucher.party_id_kind==='cr';
    const idNumberLabel=ID_NUMBER_LABEL[voucher.party_id_kind]||'رقم إثبات';
    const partyCity=voucher.party_address||'';
    const partyNationality=voucher.party_nationality||'';
    const companyCity=settings.city||'الرياض';
    const partySignature=isReceipt?'المستلم':'المستفيد';
    const englishTitle=isReceipt?'RECEIPT VOUCHER':'PAYMENT VOUCHER';
    const method=METHOD_LABEL[voucher.payment_method]||voucher.payment_method||'';
    const totalHalalas=Math.round(Number(voucher.amount||0)*100);
    const amountRiyals=Math.floor(totalHalalas/100);
    const amountHalalas=String(totalHalalas%100).padStart(2,'0');
    const latinDigits=(value)=>String(value??'').replace(/[٠-٩]/g,(d)=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g,(d)=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
    const paymentMeta=[
      voucher.bank_name?['البنك',voucher.bank_name]:null,
      voucher.payment_reference?['مرجع الدفع',voucher.payment_reference]:null,
      voucher.payment_date?['تاريخ الدفع',voucher.payment_date]:null,
    ].filter(Boolean);
    const fill=(value,extraClass='')=>`<span class="fill ${extraClass}"><span class="value">${esc(latinDigits(value||''))}</span></span>`;
    const flowFill=(value,extraClass='')=>`<span class="fill flow-fill ${extraClass}"><span class="value">${esc(latinDigits(value||''))}</span><span class="soft-fill" aria-hidden="true"></span></span>`;
    const sealedFill=(value,extraClass='')=>`<span class="fill sealed-fill ${extraClass}"><span class="value">${esc(latinDigits(value||''))}</span><span class="soft-fill" aria-hidden="true"></span></span>`;
    const popup=window.open('','_blank','width=1100,height=760');
    if(!popup){setMessage('اسمح بالنوافذ المنبثقة لطباعة السند.');return;}
    popup.opener=null;

    const paymentOpening=isEntity?'استلمنا نحن':'استلمت أنا';
    const bodyHtml=isReceipt
      ? `
        <div class="sentence">
          <span class="fixed">استلمنا نحن /</span>${fill(company,'name-fill')}
          <span class="fixed">سجل تجاري رقم /</span>${fill(settings.cr_number||'','short-fill')}
          <span class="fixed">بمدينة /</span>${fill(companyCity,'city-fill')}
        </div>
        <div class="sentence party-name-line">
          <span class="fixed">من المكرم /</span>${fill(voucher.party_name,'full-name-fill')}
        </div>
        <div class="sentence">
          <span class="fixed">مبلغًا وقدره /</span>${sealedFill(`${voucher.amount_words} فقط لا غير`,'grow-fill')}
        </div>
        <div class="reason-heading">وذلك عن قيمة الاستحقاق الموضح في البيان أدناه:</div>
        <div class="sentence reason-line">
          <span class="fixed">بيان الاستحقاق /</span>${sealedFill(voucher.description,'grow-fill')}
        </div>
      `
      : `
        <div class="sentence party-core-line">
          <span class="fixed">استلمنا نحن /</span>${flowFill(voucher.party_name,'party-inline-name')}
          <span class="fixed">${esc(idNumberLabel)} /</span>${flowFill(voucher.party_id_number,'party-inline-id')}
          ${partyNationality?`<span class="fixed">الجنسية /</span>${flowFill(partyNationality,'party-inline-nationality')}`:''}
          ${voucher.party_mobile?`<span class="fixed">الجوال /</span>${flowFill(voucher.party_mobile,'party-inline-mobile')}`:''}
          <span class="fixed">بمدينة /</span>${flowFill(partyCity,'party-inline-city')}
        </div>
        <div class="sentence amount-statement-line">
          <span class="fixed">مبلغًا وقدره /</span>
          ${sealedFill(`${amountRiyals.toLocaleString('en-US')}.${amountHalalas} ريال سعودي (${voucher.amount_words} فقط لا غير)`,'amount-statement-fill')}
        </div>
        <div class="reason-heading">وذلك مقابل قيمة الاستحقاق الموضح في البيان أدناه:</div>
        <div class="sentence reason-line">
          <span class="fixed">بيان الاستحقاق /</span>${sealedFill(voucher.description,'grow-fill')}
        </div>
        <div class="legal-ack">وأقر أنا المستفيد باستلام كامل المبلغ المبين في هذا السند رقمًا وكتابةً عن الاستحقاق الموضح أعلاه، بعد الاطلاع على بياناته والعلم بسبب الصرف وطريقة الوفاء، ويعد توقيعي إقرارًا بصحة الاستلام في حدود هذا السند، دون أن يعد إبراءً عامًا عن أي حقوق أو التزامات أخرى.</div>
      `;

    const paymentDetails=`
      <div class="payment-line">
        <span class="fixed">عبر /</span>${fill(method,'method-fill')}
        ${paymentMeta.map(([label,value])=>`<span class="fixed">${esc(label)} /</span>${fill(value,'meta-fill')}`).join('')}
      </div>
    `;

    popup.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(TYPE_LABEL[voucher.voucher_type])} ${esc(voucher.voucher_no)}</title><style>
      @page{size:A4 portrait;margin:0}
      *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      :root{--brand:#8B3332;--brand-dark:#7C2B28;--brand-soft:#F6EEEE;--line:#9C8E8E;--ink:#242426}
      html,body{margin:0;padding:0;background:#fff;color:var(--ink);font-family:Tahoma,Arial,sans-serif}
      body{font-size:11.5px;width:210mm;height:297mm;display:flex;align-items:center;justify-content:center}
      .sheet{width:198mm;height:136mm;min-height:136mm;max-height:136mm;border:1.6px solid var(--brand);padding:4mm 6mm 3mm;position:relative;overflow:hidden;background:#fff;break-inside:avoid;page-break-inside:avoid}
      .legal-bar{height:8mm;border:1px solid var(--brand);background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;padding:0 2mm;font-size:7.5px;font-weight:700;white-space:nowrap;overflow:hidden}
      .top{display:grid;grid-template-columns:1.15fr 1.6fr 1.15fr;gap:0;align-items:stretch;direction:ltr}
      .meta,.amount-box,.voucher-box{border:1px solid var(--brand);height:27mm}
      .meta{display:grid;grid-template-rows:repeat(4,1fr);direction:ltr}
      .meta-row{display:grid;grid-template-columns:40% 60%;min-height:0}
      .meta-label{background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:8.7px;border-bottom:1px solid var(--brand);direction:rtl}
      .meta-value{background:#fff;color:#111;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:8.7px;border-bottom:1px solid var(--brand);direction:ltr;font-variant-numeric:tabular-nums}
      .meta-row:last-child .meta-label,.meta-row:last-child .meta-value{border-bottom:0}
      .voucher-box{display:grid;grid-template-rows:1fr 2fr 1fr;background:#fff}
      .voucher-blank{background:#fff}
      .voucher-title{background:var(--brand);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
      .voucher-title .ar{font-size:14px;font-weight:800;line-height:1.05}
      .voucher-title .en{font-size:7.1px;letter-spacing:.035em;margin-top:.5mm}
      .amount-box{display:grid;grid-template-columns:66% 34%;grid-template-rows:repeat(4,1fr);direction:ltr}
      .amount-white,.amount-red{display:flex;align-items:center;justify-content:center;border-bottom:1px solid var(--brand);min-height:0}
      .amount-white{background:#fff;color:#111;font-weight:800;direction:rtl}
      .amount-red{background:var(--brand);color:#fff;font-weight:700;direction:rtl}
      .amount-title{grid-column:1;grid-row:1;font-size:8.7px}
      .amount-number{grid-column:1;grid-row:2;font-size:9.4px;direction:ltr;font-variant-numeric:tabular-nums}
      .amount-riyal{grid-column:2;grid-row:1/3;font-size:9px}
      .amount-halala-value{grid-column:1;grid-row:3;font-size:9.4px;direction:ltr;font-variant-numeric:tabular-nums}
      .amount-halala-label{grid-column:2;grid-row:3;font-size:8.7px}
      .amount-words{grid-column:1;grid-row:4;font-size:7.6px;padding:0 1mm;text-align:center}
      .amount-words-label{grid-column:2;grid-row:4;font-size:8.7px}
      .amount-box>*:nth-last-child(-n+2){border-bottom:0}
      .body{border-top:1px solid var(--brand);padding-top:1.7mm;margin-top:2mm}
      .sentence,.payment-line{display:flex;align-items:flex-end;gap:1.2mm;min-height:6.1mm;white-space:nowrap}
      .fixed{font-weight:700;flex:0 0 auto}
      .fill{min-width:19mm;flex:1 1 0;display:flex;align-items:flex-end;gap:1.1mm;border-bottom:1px dotted #555;height:5.3mm;overflow:hidden;white-space:nowrap}
      .fill .value{font-style:italic;font-weight:700;color:#111;position:relative;top:-.6mm;flex:0 0 auto;max-width:100%;overflow:hidden;text-overflow:ellipsis;word-spacing:.55em}
      .soft-fill{flex:1 1 auto;align-self:flex-end;height:2.8mm;min-width:0;background:rgba(139,51,50,.045);border-radius:.5mm}
      .name-fill{min-width:34mm}.full-name-fill{min-width:145mm}.short-fill{min-width:25mm}.id-fill{flex:0 1 36mm;min-width:29mm}.city-fill{flex:0 1 28mm;min-width:18mm}.mobile-fill{flex:0 1 34mm;min-width:29mm}.grow-fill{min-width:80mm}.method-fill{min-width:24mm}.meta-fill{min-width:24mm}.party-name-line{margin-bottom:.4mm}.identity-line{gap:1.1mm}
      .party-core-line{gap:.7mm;font-size:9.15px;min-height:6.3mm}
      .party-core-line .fixed{font-size:9px}
      .party-core-line .fill{height:5.2mm;gap:.55mm}
      .party-inline-name{flex:1.8 1 38mm;min-width:34mm}.party-inline-id{flex:1 1 22mm;min-width:20mm}.party-inline-nationality{flex:.72 1 14mm;min-width:12mm}.party-inline-mobile{flex:1 1 23mm;min-width:20mm}.party-inline-city{flex:.8 1 17mm;min-width:14mm}
      .amount-statement-line{margin-top:.4mm}.amount-statement-fill{min-width:125mm}
      .reason-heading{font-weight:800;color:var(--brand-dark);margin-top:.8mm;margin-bottom:.2mm}
      .reason-line{margin-bottom:0}
      .legal-ack{margin-top:.8mm;padding:1.2mm 1.6mm;border:1px solid #D8CACA;background:#FFFDFD;font-size:8.65px;line-height:1.48;text-align:justify;font-weight:600}
      .payment-line{margin-top:1.1mm;padding-top:1mm;border-top:1px solid #D5CACA}
      .signatures{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;margin-top:2.2mm}
      .sign{min-height:16mm;text-align:center;border-top:1.4px solid var(--brand);padding-top:1mm;position:relative;overflow:visible}
      .sign strong{display:block;color:var(--brand-dark);font-size:10.2px;position:relative;z-index:2}.sign .person-name{display:block;margin-top:1mm;font-size:9.7px;font-weight:700;word-spacing:.5em;position:relative;z-index:2}.sign .person-title{display:block;margin-top:.45mm;font-size:8.2px;color:#666;position:relative;z-index:2}.approval-stamp{position:absolute;left:50%;top:1.5mm;transform:translateX(-50%);width:${stampSizeMm}mm;height:auto;max-width:none;max-height:none;object-fit:contain;opacity:.78;z-index:1;pointer-events:none}
      .foot{position:absolute;right:6mm;left:6mm;bottom:2.2mm;border-top:1px solid #D5CACA;padding-top:1mm;display:flex;justify-content:space-between;font-size:8.5px;color:#666}
      .void{position:absolute;inset:42% 10% auto;transform:rotate(-12deg);font-size:44px;font-weight:bold;color:rgba(139,51,50,.17);text-align:center;z-index:3;pointer-events:none}
      @media screen{body{min-width:210mm;min-height:297mm;background:#eee}.sheet{box-shadow:0 2px 18px rgba(0,0,0,.12)}}
      @media print{body{background:#fff}.sheet{box-shadow:none}}
    </style></head><body><div class="sheet">
      ${voucher.status==='void'?'<div class="void">ملغى</div>':''}
      <div class="legal-bar">العنوان: ${esc(latinDigits(settings.national_address||`${companyCity} – المملكة العربية السعودية`))} &nbsp; | &nbsp; س:ت: ${esc(latinDigits(settings.cr_number||'—'))} &nbsp; | &nbsp; الرقم الضريبي: ${esc(latinDigits(settings.vat_number||'—'))}</div>
      <div class="top">
        <div class="meta">
          <div class="meta-row"><div class="meta-label">رقم الدفتر</div><div class="meta-value">${esc(latinDigits(voucher.book_no))}</div></div>
          <div class="meta-row"><div class="meta-label">رقم السند</div><div class="meta-value">${esc(latinDigits(pageNo(voucher.page_no)))}</div></div>
          <div class="meta-row"><div class="meta-label">التاريخ</div><div class="meta-value">${esc(latinDigits(voucher.voucher_date))}</div></div>
          <div class="meta-row"><div class="meta-label">المرجع</div><div class="meta-value">${esc(latinDigits(voucher.voucher_no))}</div></div>
        </div>
        <div class="voucher-box">
          <div class="voucher-blank"></div>
          <div class="voucher-title"><div class="ar">${esc(TYPE_LABEL[voucher.voucher_type])}</div><div class="en">${esc(englishTitle)}</div></div>
          <div class="voucher-blank"></div>
        </div>
        <div class="amount-box">
          <div class="amount-white amount-title">المبلغ</div>
          <div class="amount-white amount-number">${esc(amountRiyals.toLocaleString('en-US'))}</div>
          <div class="amount-red amount-riyal">ريال</div>
          <div class="amount-white amount-halala-value">${esc(amountHalalas)}</div>
          <div class="amount-red amount-halala-label">هلله</div>
          <div class="amount-white amount-words">${esc(voucher.amount_words.replace(/\s+فقط\s+لا\s+غير\s*$/,'').trim())}</div>
          <div class="amount-red amount-words-label">لفظا</div>
        </div>
      </div>
      <div class="body">
        ${bodyHtml}
        ${paymentDetails}
      </div>
      <div class="signatures">
        <div class="sign"><strong>مصدر السند</strong><span class="person-name">${esc(issuerName)}</span><span class="person-title">${esc(issuerTitle)}</span></div>
        <div class="sign"><strong>${esc(partySignature)}</strong><span class="person-name">${esc(voucher.party_name)}</span></div>
        <div class="sign"><strong>المحاسب</strong><span class="person-name">................................</span></div>
        <div class="sign"><strong>اعتماد الإدارة</strong><span class="person-name">${esc(approverName)}</span><span class="person-title">${esc(approverTitle)}</span>${stampUrl&&settings.show_stamp_by_default!==false?`<img class="approval-stamp" src="${esc(stampUrl)}" alt="ختم الشركة"/>`:''}</div>
      </div>
      <div class="foot"><span>هذا السند ملزم في حدود مبلغه وبيانه وتوقيعاته.</span></div>
    </div><script>
      function ensureSinglePage(){
        const sheet=document.querySelector('.sheet');
        if(!sheet)return;
        let tries=0;
        while(sheet.scrollHeight>sheet.clientHeight&&tries<6){
          const current=parseFloat(getComputedStyle(document.body).fontSize)||11.5;
          document.body.style.fontSize=Math.max(9.4,current-.3)+'px';
          tries+=1;
        }
      }
      async function finalizeVoucherPrint(){
        if(document.fonts&&document.fonts.ready){try{await document.fonts.ready;}catch(e){}}
        requestAnimationFrame(()=>{ensureSinglePage();requestAnimationFrame(()=>window.print());});
      }
      window.onload=finalizeVoucherPrint;
    </script></body></html>`);
    popup.document.close();
  }

  if(state.loading&&!state.accounts.length&&!state.vouchers.length)return <ConstitutionPage><EmptyState title="جارٍ تجهيز الخزينة والسندات" description="نقرأ الحسابات والدفاتر والسندات المسجلة."/></ConstitutionPage>;

  return <ConstitutionPage>
    <PageHeader title="الخزينة وسندات القبض والصرف" description="الدفاتر الإلكترونية تبدأ من الدفتر 2، وكل دفتر من 01 إلى 100. يمكن اختيار رقم السند يدويًا لمطابقة السند الورقي، ولا يشترط التسلسل." actions={<div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{canReceipt?<button className="btn" onClick={()=>openEntry('receipt')}>سند قبض جديد</button>:null}{canPayment?<button className="btn" onClick={()=>openEntry('payment')}>سند صرف جديد</button>:null}{canCreateAccount?<button className="btn ghost" onClick={()=>{setShowEntry(false);setShowAccountEntry(true);setMessage('');}}>إضافة حساب خزينة</button>:null}</div>}/>
    {state.error?<Notice tone="error">{state.error}</Notice>:null}
    {message?<Notice tone={/تعذر|لا |أكمل|رصيد/.test(message)?'warning':'success'}>{message}</Notice>:null}

    <Section title="الموقف الحالي" description="الدفتر والصفحة التاليان يحسبان تلقائيًا دون تدخل يدوي.">
      <SummaryStrip items={[
        {key:'receipt',label:'القبض التالي',value:`دفتر ${nextReceipt.book} / ${pageNo(nextReceipt.page)}`,note:'01 إلى 100 — الرقم التالي المتاح'},
        {key:'payment',label:'الصرف التالي',value:`دفتر ${nextPayment.book} / ${pageNo(nextPayment.page)}`,note:'01 إلى 100 — الرقم التالي المتاح'},
        {key:'posted',label:'السندات السارية',value:posted.length,note:`من أصل ${state.vouchers.length}`},
        {key:'balance',label:'إجمالي الأرصدة',value:money(totalBalance),note:`${state.accounts.length} حساب`},
      ]}/>
    </Section>

    {showAccountEntry?<EntrySurface title="إضافة حساب صندوق أو بنك" description="يلزم وجود حساب خزينة واحد على الأقل لإصدار السندات." actions={<button className="btn ghost" type="button" onClick={()=>setShowAccountEntry(false)}>إغلاق</button>}><form onSubmit={createAccount}><div className="form-grid"><div className="field"><label>اسم الحساب *</label><input value={accountForm.name_ar} onChange={(e)=>setAccountForm((v)=>({...v,name_ar:e.target.value}))} required/></div><div className="field"><label>نوع الحساب *</label><select value={accountForm.account_type} onChange={(e)=>setAccountForm((v)=>({...v,account_type:e.target.value}))}><option value="cash">صندوق نقدي</option><option value="bank">حساب بنكي</option><option value="wallet">محفظة</option><option value="other">أخرى</option></select></div><div className="field"><label>الرصيد الافتتاحي</label><input type="number" step="0.01" value={accountForm.opening_balance} onChange={(e)=>setAccountForm((v)=>({...v,opening_balance:e.target.value}))}/></div><div className="field"><label>اسم البنك</label><input value={accountForm.bank_name} onChange={(e)=>setAccountForm((v)=>({...v,bank_name:e.target.value}))}/></div><div className="field"><label>IBAN</label><input value={accountForm.iban} onChange={(e)=>setAccountForm((v)=>({...v,iban:e.target.value}))}/></div><label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={accountForm.allow_negative} onChange={(e)=>setAccountForm((v)=>({...v,allow_negative:e.target.checked}))}/> السماح برصيد سالب</label></div><div style={{display:'flex',justifyContent:'flex-end',marginTop:14}}><button className="btn" disabled={busy}>{busy?'جارٍ الحفظ…':'حفظ الحساب'}</button></div></form></EntrySurface>:null}

    {showEntry?<EntrySurface title={form.voucher_type==='receipt'?'إصدار سند قبض':'إصدار سند صرف'} description={`الدفتر ${form.voucher_type==='receipt'?nextReceipt.book:nextPayment.book} — اختر رقم السند المطابق للنسخة الورقية من 01 إلى 100. الأرقام المستخدمة لا يمكن تكرارها.`} actions={<button className="btn ghost" type="button" onClick={()=>setShowEntry(false)}>إغلاق</button>}><form onSubmit={issueVoucher}><div className="form-grid"><div className="field"><label>التاريخ *</label><input type="date" value={form.voucher_date} onChange={(e)=>field('voucher_date',e.target.value)} required/></div><div className="field"><label>رقم السند الورقي *</label><select value={form.page_no} onChange={(e)=>field('page_no',e.target.value)} required><option value="">اختر</option>{Array.from({length:100},(_,i)=>i+1).map((n)=>{const used=usedPagesFor(form.voucher_type).has(n);return <option key={n} value={n} disabled={used}>{pageNo(n)}{used?' — مستخدم':''}</option>;})}</select></div><div className="field"><label>حساب الصندوق / البنك *</label><select value={form.account_id} onChange={(e)=>field('account_id',e.target.value)} required><option value="">اختر</option>{state.accounts.map((item)=><option key={item.id} value={item.id}>{item.name_ar} — {money(item.current_balance)}</option>)}</select></div><div className="field"><label>{form.voucher_type==='receipt'?'من المكرم *':'اسم المستفيد *'}</label><input value={form.party_name} onChange={(e)=>field('party_name',e.target.value)} required/></div><div className="field"><label>المبلغ رقمًا *</label><input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e)=>field('amount',e.target.value)} required/></div><div className="field" style={{gridColumn:'1/-1'}}><label>المبلغ تفقيطًا</label><textarea rows={2} value={amountWords?`${amountWords} فقط لا غير`:''} readOnly/></div><div className="field"><label>نوع هوية الطرف</label><select value={form.party_id_kind} onChange={(e)=>field('party_id_kind',e.target.value)}><option value="">اختر</option>{Object.entries(ID_LABEL).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div><div className="field"><label>رقم الهوية / السجل</label><input value={form.party_id_number} onChange={(e)=>field('party_id_number',e.target.value)}/></div><div className="field"><label>رقم الجوال</label><input value={form.party_mobile} onChange={(e)=>field('party_mobile',e.target.value)}/></div><div className="field"><label>المدينة / العنوان المختصر</label><input value={form.party_address} onChange={(e)=>field('party_address',e.target.value)} placeholder="مثال: الرياض"/></div><div className="field"><label>طريقة الدفع *</label><select value={form.payment_method} onChange={(e)=>field('payment_method',e.target.value)}>{Object.entries(METHOD_LABEL).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div><div className="field"><label>البنك</label><input value={form.bank_name} onChange={(e)=>field('bank_name',e.target.value)}/></div><div className="field"><label>مرجع الدفع</label><input value={form.payment_reference} onChange={(e)=>field('payment_reference',e.target.value)} placeholder="مثال للرواتب: مسير رواتب شهر أغسطس 2026"/></div><div className="field"><label>تاريخ الدفع / الشيك</label><input type="date" value={form.payment_date} onChange={(e)=>field('payment_date',e.target.value)}/></div><div className="field"><label>مصدر السند *</label><select value={form.issuer_employee_id} onChange={(e)=>field('issuer_employee_id',e.target.value)} required><option value="">اختر</option>{state.actors.map((item)=><option key={item.id} value={item.id}>{item.full_name_ar}{item.job_title?` — ${item.job_title}`:''}</option>)}</select></div><div className="field"><label>اعتماد الإدارة *</label><select value={form.approved_by_employee_id} onChange={(e)=>field('approved_by_employee_id',e.target.value)} required><option value="">اختر</option>{state.actors.map((item)=><option key={item.id} value={item.id}>{item.full_name_ar}{item.job_title?` — ${item.job_title}`:''}</option>)}</select></div><div className="field" style={{gridColumn:'1/-1'}}><label>{form.voucher_type==='receipt'?'سبب القبض *':'سبب الصرف *'}</label><textarea rows={3} value={form.description} onChange={(e)=>field('description',e.target.value)} required/></div></div><Notice tone="neutral"><strong>معاينة النص:</strong> {form.voucher_type==='receipt'?`استلمنا نحن / ${state.settings?.company_name_ar||'أركان المكان للمقاولات'} سجل تجاري رقم / ${state.settings?.cr_number||'…'} من المكرم / ${form.party_name||'…'} مبلغًا وقدره / ${amountWords||'…'}، وذلك مقابل / ${form.description||'…'}.`:`${form.party_id_kind==='cr'?'استلمنا نحن':'استلمت أنا'} / ${form.party_name||'…'} ${ID_NUMBER_LABEL[form.party_id_kind]||'رقم إثبات'} / ${form.party_id_number||'…'} بمدينة / ${form.party_address||'…'} مبلغًا وقدره / ${amountWords||'…'}، وذلك مقابل / ${form.description||'…'}، وأقر باستلام المبلغ كاملًا.`}</Notice><div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:14}}><button type="button" className="btn ghost" onClick={()=>setShowEntry(false)}>إلغاء</button><button className="btn" disabled={busy||!state.accounts.length}>{busy?'جارٍ الإصدار…':'إصدار السند وتثبيت رقمه'}</button></div></form></EntrySurface>:null}

    {!state.accounts.length&&!showAccountEntry?<Notice tone="warning" actions={canCreateAccount?<button className="btn" onClick={()=>setShowAccountEntry(true)}>إنشاء حساب خزينة</button>:null}>لا يوجد حساب صندوق أو بنك نشط؛ لا يمكن إصدار سند قبل إنشاء الحساب.</Notice>:null}

    <Section title="سجل السندات" description="السند الملغى يبقى ظاهرًا برقمه ولا يُعاد استخدام صفحته."><FilterSurface><div className="form-grid"><div className="field"><label>النوع</label><select value={filter} onChange={(e)=>setFilter(e.target.value)}><option value="all">الكل</option><option value="receipt">سندات القبض</option><option value="payment">سندات الصرف</option></select></div><div className="field"><label>بحث</label><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="رقم السند، الطرف، الهوية، البيان…"/></div></div></FilterSurface>{visible.length?<TableFrame><table><thead><tr><th>النوع</th><th>الدفتر</th><th>السند</th><th>التاريخ</th><th>الطرف</th><th>المبلغ</th><th>الحساب</th><th>الطريقة</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>{visible.map((voucher)=><tr key={voucher.id}><td><strong>{TYPE_LABEL[voucher.voucher_type]}</strong></td><td>{voucher.book_no}</td><td>{pageNo(voucher.page_no)}<br/><small>{voucher.voucher_no}</small></td><td>{voucher.voucher_date}</td><td>{voucher.party_name}<br/><small>{voucher.party_id_number||''}</small></td><td>{money(voucher.amount)}</td><td>{accountMap.get(voucher.account_id)?.name_ar||'—'}</td><td>{METHOD_LABEL[voucher.payment_method]||voucher.payment_method}</td><td>{voucher.status==='void'?<span className="tag danger">ملغى</span>:<span className="tag">ساري</span>}</td><td><div style={{display:'flex',gap:6,flexWrap:'wrap'}}><button className="btn ghost" type="button" onClick={()=>printVoucher(voucher)}>طباعة</button>{voucher.status==='posted'&&canVoid?<button className="btn ghost" type="button" disabled={busy} onClick={()=>voidVoucher(voucher)}>إلغاء</button>:null}</div></td></tr>)}</tbody></table></TableFrame>:<EmptyState title="لا توجد سندات" description="أصدر أول سند قبض أو صرف واختر رقمه الورقي من 01 إلى 100 داخل الدفتر الإلكتروني رقم 2."/>}</Section>
  </ConstitutionPage>;
}
