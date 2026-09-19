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
function pageNo(value){return String(value||0).padStart(3,'0');}
function errorMessage(error){return error?.message||'تعذر تنفيذ العملية.';}

const EMPTY_VOUCHER={
  voucher_type:'receipt',voucher_date:'',account_id:'',party_name:'',party_id_kind:'',party_id_number:'',party_mobile:'',party_address:'',amount:'',payment_method:'cash',bank_name:'',payment_reference:'',payment_date:'',description:'',supporting_reference:''
};

export default function TreasuryVouchersPage(){
  const me=useDashboardSession();
  const [state,setState]=useState({loading:true,accounts:[],books:[],vouchers:[],settings:null,error:''});
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
    const [accountsQ,booksQ,vouchersQ,settingsQ]=await Promise.all([
      supabase.from('v_treasury_balances').select('id,account_code,name_ar,account_type,bank_name,currency,current_balance,total_inflow,total_outflow,is_active').eq('is_active',true).order('account_code'),
      supabase.from('cash_voucher_books').select('id,voucher_type,book_no,next_page,status,opened_at,closed_at').order('book_no',{ascending:false}),
      supabase.from('cash_vouchers').select('*').order('created_at',{ascending:false}).limit(300),
      supabase.from('app_settings').select('company_name_ar,company_name_en,cr_number,vat_number,national_address,city,phone_1,email').eq('id',1).maybeSingle(),
    ]);
    const failed=[accountsQ,booksQ,vouchersQ].find((item)=>item.error);
    if(failed?.error){setState((current)=>({...current,loading:false,error:errorMessage(failed.error)}));return;}
    const accounts=accountsQ.data||[];
    setState({loading:false,accounts,books:booksQ.data||[],vouchers:vouchersQ.data||[],settings:settingsQ.error?null:(settingsQ.data||null),error:''});
    setForm((current)=>({...current,account_id:current.account_id||accounts[0]?.id||''}));
  }

  useEffect(()=>{load();},[]);

  const accountMap=useMemo(()=>new Map(state.accounts.map((item)=>[item.id,item])),[state.accounts]);
  const visible=useMemo(()=>state.vouchers.filter((voucher)=>{
    if(filter!=='all'&&voucher.voucher_type!==filter)return false;
    const needle=query.trim().toLowerCase();
    if(!needle)return true;
    return [voucher.voucher_no,voucher.party_name,voucher.party_id_number,voucher.description,voucher.payment_reference].some((value)=>String(value||'').toLowerCase().includes(needle));
  }),[state.vouchers,filter,query]);
  const posted=state.vouchers.filter((voucher)=>voucher.status==='posted');
  const totalBalance=state.accounts.reduce((sum,item)=>sum+Number(item.current_balance||0),0);

  function nextBook(type){
    const latest=state.books.filter((book)=>book.voucher_type===type).sort((a,b)=>Number(b.book_no)-Number(a.book_no))[0];
    if(!latest)return {book:2,page:1};
    if(latest.status==='open'&&Number(latest.next_page)<=100)return {book:Number(latest.book_no),page:Number(latest.next_page)};
    return {book:Number(latest.book_no)+1,page:1};
  }
  const nextReceipt=nextBook('receipt');const nextPayment=nextBook('payment');

  function openEntry(type){
    setForm({...EMPTY_VOUCHER,voucher_type:type,voucher_date:today(),account_id:state.accounts[0]?.id||''});
    setMessage('');setShowAccountEntry(false);setShowEntry(true);
  }
  function field(name,value){setForm((current)=>({...current,[name]:value}));}

  async function issueVoucher(event){
    event.preventDefault();setMessage('');
    if(!form.account_id||!form.party_name.trim()||!form.description.trim()||!amountWords){setMessage('أكمل الحساب والطرف والمبلغ وسبب السند.');return;}
    setBusy(true);
    const {data,error}=await supabase.rpc('fn_cash_voucher_issue',{
      p_voucher_type:form.voucher_type,p_account_id:form.account_id,p_amount:Number(form.amount),p_amount_words:amountWords,p_voucher_date:form.voucher_date||today(),p_party_name:form.party_name.trim(),p_party_id_kind:form.party_id_kind||null,p_party_id_number:form.party_id_number||null,p_party_mobile:form.party_mobile||null,p_party_address:form.party_address||null,p_payment_method:form.payment_method,p_bank_name:form.bank_name||null,p_payment_reference:form.payment_reference||null,p_payment_date:form.payment_date||null,p_description:form.description.trim(),p_supporting_reference:form.supporting_reference||null
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
    const settings=state.settings||{};const account=accountMap.get(voucher.account_id)||{};
    const company=settings.company_name_ar||'شركة أركان المكان للمقاولات';
    const partyTitle=voucher.voucher_type==='receipt'?'بيانات دافع المبلغ':'بيانات المستلم / المصروف له';
    const partySignature=voucher.voucher_type==='receipt'?'دافع المبلغ':'المستلم / المصروف له';
    const popup=window.open('','_blank','width=980,height=900');
    if(!popup){setMessage('اسمح بالنوافذ المنبثقة لطباعة السند.');return;}
    popup.opener=null;
    popup.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(TYPE_LABEL[voucher.voucher_type])} ${esc(voucher.voucher_no)}</title><style>
      @page{size:A4 portrait;margin:12mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}:root{--brand:#8B3332;--brand-dark:#7C2B28;--line:#CDBABA;--ink:#2E2E30}body{font-family:Tahoma,Arial,sans-serif;color:var(--ink);margin:0;background:#fff;font-size:13px}.sheet{border:2px solid var(--brand);padding:18px;min-height:260mm;position:relative}.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:4px solid var(--brand);padding-bottom:12px}.company h1{font-size:20px;color:var(--brand-dark);margin:0 0 6px}.company p{margin:2px 0;color:#555}.title{text-align:center;margin:20px 0 14px}.title h2{display:inline-block;margin:0;padding:9px 36px;border:2px solid var(--brand);background:var(--brand);color:#fff;font-size:24px}.grid{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--line);margin:12px 0}.cell{padding:8px;border:1px solid var(--line);min-height:54px;background:#fff}.cell b{display:block;background:var(--brand);color:#fff;padding:5px 8px;margin:-8px -8px 7px;font-size:12px}.wide{grid-column:span 2}.full{grid-column:1/-1}.amount{font-size:21px;font-weight:bold;color:var(--brand-dark)}.legal{font-size:17px;line-height:2;border:2px solid var(--brand);padding:16px;margin:16px 0;background:#fff}.signatures{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:34px}.sign{height:90px;border-top:2px solid var(--brand);text-align:center;padding-top:8px}.foot{position:absolute;bottom:12px;right:18px;left:18px;display:flex;justify-content:space-between;border-top:1px solid var(--line);padding-top:7px;font-size:11px;color:#666}.void{position:absolute;inset:42% 10% auto;transform:rotate(-18deg);font-size:90px;font-weight:bold;color:rgba(139,51,50,.18);text-align:center;z-index:2}@media print{button{display:none}body{background:#fff}.sheet{border-color:var(--brand)}}</style></head><body><div class="sheet">${voucher.status==='void'?'<div class="void">ملغى</div>':''}<div class="head"><div class="company"><h1>${esc(company)}</h1><p>${esc(settings.company_name_en||'Arkan Al Makan Contracting Company')}</p><p>س.ت: ${esc(settings.cr_number||'—')} | الرقم الضريبي: ${esc(settings.vat_number||'—')}</p><p>${esc(settings.national_address||settings.city||'الرياض')}</p></div><div><b>رقم الدفتر: ${esc(voucher.book_no)}</b><br><b>رقم السند: ${esc(pageNo(voucher.page_no))}</b><br><b>الرقم المرجعي: ${esc(voucher.voucher_no)}</b></div></div><div class="title"><h2>${esc(TYPE_LABEL[voucher.voucher_type])}</h2></div><div class="grid"><div class="cell"><b>رقم السند</b>${esc(pageNo(voucher.page_no))}</div><div class="cell"><b>رقم الدفتر</b>${esc(voucher.book_no)}</div><div class="cell"><b>التاريخ</b>${esc(voucher.voucher_date)}</div><div class="cell"><b>الحساب</b>${esc(account.name_ar||'—')}</div><div class="cell wide"><b>المبلغ رقمًا</b><span class="amount">${esc(money(voucher.amount))}</span></div><div class="cell wide"><b>المبلغ تفقيطًا</b>${esc(voucher.amount_words)} فقط لا غير</div></div><div class="legal">${esc(voucher.legal_text_snapshot)}</div><div class="grid"><div class="cell wide"><b>${esc(partyTitle)}</b>${esc(voucher.party_name)}</div><div class="cell"><b>نوع الهوية</b>${esc(ID_LABEL[voucher.party_id_kind]||'—')}</div><div class="cell"><b>رقم الهوية / السجل</b>${esc(voucher.party_id_number||'—')}</div><div class="cell"><b>الجوال</b>${esc(voucher.party_mobile||'—')}</div><div class="cell"><b>طريقة الدفع</b>${esc(METHOD_LABEL[voucher.payment_method]||voucher.payment_method)}</div><div class="cell"><b>مرجع الدفع</b>${esc(voucher.payment_reference||'—')}</div><div class="cell"><b>البنك</b>${esc(voucher.bank_name||'—')}</div><div class="cell wide"><b>البيان / السبب</b>${esc(voucher.description)}</div><div class="cell wide"><b>المرجع المؤيد</b>${esc(voucher.supporting_reference||'—')}</div><div class="cell full"><b>العنوان</b>${esc(voucher.party_address||'—')}</div></div><div class="signatures"><div class="sign">${esc(partySignature)}<br><br>الاسم والتوقيع</div><div class="sign">أمين الصندوق<br><br>الاسم والتوقيع</div><div class="sign">المحاسب<br><br>الاسم والتوقيع</div><div class="sign">المعتمد<br><br>الاسم والتوقيع</div></div><div class="foot"><span>الأصل للطرف — نسخة للحسابات — نسخة بالدفتر</span><span>حالة السند: ${voucher.status==='void'?'ملغى':'ساري'}</span></div></div><script>window.onload=()=>{window.print();}</script></body></html>`);
    popup.document.close();
  }

  if(state.loading&&!state.accounts.length&&!state.vouchers.length)return <ConstitutionPage><EmptyState title="جارٍ تجهيز الخزينة والسندات" description="نقرأ الحسابات والدفاتر والسندات المسجلة."/></ConstitutionPage>;

  return <ConstitutionPage>
    <PageHeader title="الخزينة وسندات القبض والصرف" description="الدفاتر الإلكترونية تبدأ من الدفتر 2، وكل دفتر من 001 إلى 100، مع ترقيم مستقل للقبض والصرف." actions={<div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{canReceipt?<button className="btn" onClick={()=>openEntry('receipt')}>سند قبض جديد</button>:null}{canPayment?<button className="btn" onClick={()=>openEntry('payment')}>سند صرف جديد</button>:null}{canCreateAccount?<button className="btn ghost" onClick={()=>{setShowEntry(false);setShowAccountEntry(true);setMessage('');}}>إضافة حساب خزينة</button>:null}</div>}/>
    {state.error?<Notice tone="error">{state.error}</Notice>:null}
    {message?<Notice tone={/تعذر|لا |أكمل|رصيد/.test(message)?'warning':'success'}>{message}</Notice>:null}

    <Section title="الموقف الحالي" description="الدفتر والصفحة التاليان يحسبان تلقائيًا دون تدخل يدوي.">
      <SummaryStrip items={[
        {key:'receipt',label:'القبض التالي',value:`دفتر ${nextReceipt.book} / ${pageNo(nextReceipt.page)}`,note:'001 إلى 100'},
        {key:'payment',label:'الصرف التالي',value:`دفتر ${nextPayment.book} / ${pageNo(nextPayment.page)}`,note:'001 إلى 100'},
        {key:'posted',label:'السندات السارية',value:posted.length,note:`من أصل ${state.vouchers.length}`},
        {key:'balance',label:'إجمالي الأرصدة',value:money(totalBalance),note:`${state.accounts.length} حساب`},
      ]}/>
    </Section>

    {showAccountEntry?<EntrySurface title="إضافة حساب صندوق أو بنك" description="يلزم وجود حساب خزينة واحد على الأقل لإصدار السندات." actions={<button className="btn ghost" type="button" onClick={()=>setShowAccountEntry(false)}>إغلاق</button>}><form onSubmit={createAccount}><div className="form-grid"><div className="field"><label>اسم الحساب *</label><input value={accountForm.name_ar} onChange={(e)=>setAccountForm((v)=>({...v,name_ar:e.target.value}))} required/></div><div className="field"><label>نوع الحساب *</label><select value={accountForm.account_type} onChange={(e)=>setAccountForm((v)=>({...v,account_type:e.target.value}))}><option value="cash">صندوق نقدي</option><option value="bank">حساب بنكي</option><option value="wallet">محفظة</option><option value="other">أخرى</option></select></div><div className="field"><label>الرصيد الافتتاحي</label><input type="number" step="0.01" value={accountForm.opening_balance} onChange={(e)=>setAccountForm((v)=>({...v,opening_balance:e.target.value}))}/></div><div className="field"><label>اسم البنك</label><input value={accountForm.bank_name} onChange={(e)=>setAccountForm((v)=>({...v,bank_name:e.target.value}))}/></div><div className="field"><label>IBAN</label><input value={accountForm.iban} onChange={(e)=>setAccountForm((v)=>({...v,iban:e.target.value}))}/></div><label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={accountForm.allow_negative} onChange={(e)=>setAccountForm((v)=>({...v,allow_negative:e.target.checked}))}/> السماح برصيد سالب</label></div><div style={{display:'flex',justifyContent:'flex-end',marginTop:14}}><button className="btn" disabled={busy}>{busy?'جارٍ الحفظ…':'حفظ الحساب'}</button></div></form></EntrySurface>:null}

    {showEntry?<EntrySurface title={form.voucher_type==='receipt'?'إصدار سند قبض':'إصدار سند صرف'} description={`سيصدر تلقائيًا برقم دفتر ${form.voucher_type==='receipt'?nextReceipt.book:nextPayment.book} وصفحة ${pageNo(form.voucher_type==='receipt'?nextReceipt.page:nextPayment.page)}.`} actions={<button className="btn ghost" type="button" onClick={()=>setShowEntry(false)}>إغلاق</button>}><form onSubmit={issueVoucher}><div className="form-grid"><div className="field"><label>التاريخ *</label><input type="date" value={form.voucher_date} onChange={(e)=>field('voucher_date',e.target.value)} required/></div><div className="field"><label>حساب الصندوق / البنك *</label><select value={form.account_id} onChange={(e)=>field('account_id',e.target.value)} required><option value="">اختر</option>{state.accounts.map((item)=><option key={item.id} value={item.id}>{item.name_ar} — {money(item.current_balance)}</option>)}</select></div><div className="field"><label>{form.voucher_type==='receipt'?'استلمنا من *':'المصروف له / المستلم *'}</label><input value={form.party_name} onChange={(e)=>field('party_name',e.target.value)} required/></div><div className="field"><label>المبلغ رقمًا *</label><input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e)=>field('amount',e.target.value)} required/></div><div className="field" style={{gridColumn:'1/-1'}}><label>المبلغ تفقيطًا</label><textarea rows={2} value={amountWords?`${amountWords} فقط لا غير`:''} readOnly/></div><div className="field"><label>نوع هوية الطرف</label><select value={form.party_id_kind} onChange={(e)=>field('party_id_kind',e.target.value)}><option value="">اختر</option>{Object.entries(ID_LABEL).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div><div className="field"><label>رقم الهوية / السجل</label><input value={form.party_id_number} onChange={(e)=>field('party_id_number',e.target.value)}/></div><div className="field"><label>رقم الجوال</label><input value={form.party_mobile} onChange={(e)=>field('party_mobile',e.target.value)}/></div><div className="field"><label>عنوان الطرف</label><input value={form.party_address} onChange={(e)=>field('party_address',e.target.value)}/></div><div className="field"><label>طريقة الدفع *</label><select value={form.payment_method} onChange={(e)=>field('payment_method',e.target.value)}>{Object.entries(METHOD_LABEL).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div><div className="field"><label>البنك</label><input value={form.bank_name} onChange={(e)=>field('bank_name',e.target.value)}/></div><div className="field"><label>مرجع الدفع</label><input value={form.payment_reference} onChange={(e)=>field('payment_reference',e.target.value)} placeholder="رقم تحويل، شيك، أو مرجع داخلي/مشروع عند الحاجة"/></div><div className="field"><label>تاريخ الدفع / الشيك</label><input type="date" value={form.payment_date} onChange={(e)=>field('payment_date',e.target.value)}/></div><div className="field"><label>مرجع مؤيد</label><input value={form.supporting_reference} onChange={(e)=>field('supporting_reference',e.target.value)} placeholder="فاتورة، عقد، مطالبة…"/></div><div className="field" style={{gridColumn:'1/-1'}}><label>{form.voucher_type==='receipt'?'سبب القبض *':'سبب الصرف *'}</label><textarea rows={3} value={form.description} onChange={(e)=>field('description',e.target.value)} required/></div></div><Notice tone="neutral"><strong>النص القانوني:</strong> {form.voucher_type==='receipt'?`استلمنا نحن ${state.settings?.company_name_ar||'شركة أركان المكان للمقاولات'} من السيد/الجهة ${form.party_name||'…'} مبلغًا وقدره ${amountWords||'…'} فقط لا غير، وذلك عن ${form.description||'…'}.`:`استلمت أنا الموقّع أدناه ${form.party_name||'…'} من ${state.settings?.company_name_ar||'شركة أركان المكان للمقاولات'} مبلغًا وقدره ${amountWords||'…'} فقط لا غير، وذلك مقابل ${form.description||'…'}، وأقر باستلام المبلغ كاملًا.`}</Notice><div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:14}}><button type="button" className="btn ghost" onClick={()=>setShowEntry(false)}>إلغاء</button><button className="btn" disabled={busy||!state.accounts.length}>{busy?'جارٍ الإصدار…':'إصدار السند وتثبيت رقمه'}</button></div></form></EntrySurface>:null}

    {!state.accounts.length&&!showAccountEntry?<Notice tone="warning" actions={canCreateAccount?<button className="btn" onClick={()=>setShowAccountEntry(true)}>إنشاء حساب خزينة</button>:null}>لا يوجد حساب صندوق أو بنك نشط؛ لا يمكن إصدار سند قبل إنشاء الحساب.</Notice>:null}

    <Section title="سجل السندات" description="السند الملغى يبقى ظاهرًا برقمه ولا يُعاد استخدام صفحته."><FilterSurface><div className="form-grid"><div className="field"><label>النوع</label><select value={filter} onChange={(e)=>setFilter(e.target.value)}><option value="all">الكل</option><option value="receipt">سندات القبض</option><option value="payment">سندات الصرف</option></select></div><div className="field"><label>بحث</label><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="رقم السند، الطرف، الهوية، البيان…"/></div></div></FilterSurface>{visible.length?<TableFrame><table><thead><tr><th>النوع</th><th>الدفتر</th><th>السند</th><th>التاريخ</th><th>الطرف</th><th>المبلغ</th><th>الحساب</th><th>الطريقة</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>{visible.map((voucher)=><tr key={voucher.id}><td><strong>{TYPE_LABEL[voucher.voucher_type]}</strong></td><td>{voucher.book_no}</td><td>{pageNo(voucher.page_no)}<br/><small>{voucher.voucher_no}</small></td><td>{voucher.voucher_date}</td><td>{voucher.party_name}<br/><small>{voucher.party_id_number||''}</small></td><td>{money(voucher.amount)}</td><td>{accountMap.get(voucher.account_id)?.name_ar||'—'}</td><td>{METHOD_LABEL[voucher.payment_method]||voucher.payment_method}</td><td>{voucher.status==='void'?<span className="tag danger">ملغى</span>:<span className="tag">ساري</span>}</td><td><div style={{display:'flex',gap:6,flexWrap:'wrap'}}><button className="btn ghost" type="button" onClick={()=>printVoucher(voucher)}>طباعة</button>{voucher.status==='posted'&&canVoid?<button className="btn ghost" type="button" disabled={busy} onClick={()=>voidVoucher(voucher)}>إلغاء</button>:null}</div></td></tr>)}</tbody></table></TableFrame>:<EmptyState title="لا توجد سندات" description="أصدر أول سند قبض أو صرف ليبدأ الدفتر الإلكتروني رقم 2 من الصفحة 001."/>}</Section>
  </ConstitutionPage>;
}
