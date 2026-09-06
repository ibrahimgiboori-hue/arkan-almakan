'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { money, dateAr, qty as fmtQty } from '@/lib/format';
import { numberLines, lineTotal, titleSubtotals, totals } from '@/lib/quote-calc';
import { PRINT_FLOW_KIND } from '@/lib/print-governance';
import { resolveTermNumbers } from '@/lib/term-numbering';
import { buildQuotationApprovalParties } from '@/lib/approval-governance';
import Riyal from '@/components/Riyal';
import ConstitutionPrintFrame from '@/components/print/ConstitutionPrintFrame';
import PrintApprovalBlock from '@/components/print/PrintApprovalBlock';
import './quote-print.css';
import './quote-flow.css';

const EN_UNIT = {'م2':'m²','م²':'m²','م3':'m³','م³':'m³','م':'m','م طولي':'LM','م.ط':'LM','عدد':'No.','قطعة':'No.','يوم':'Day','ساعة':'Hr','طن':'Ton','كجم':'kg','لتر':'L','مقطوعية':'Lump Sum'};
function dateEn(value){if(!value)return'—';const d=value instanceof Date?value:new Date(value);if(Number.isNaN(d.getTime()))return String(value);return new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'}).format(d)}
function hasTermContent(term){return Boolean(String(term?.title||'').trim()||String(term?.body||'').trim())}

export default function QuotePrint(){
  const {id}=useParams();
  const [q,setQ]=useState(null);
  const [lines,setLines]=useState([]);
  const [pays,setPays]=useState([]);
  const [cfg,setCfg]=useState(null);
  const [saved,setSaved]=useState('');
  const [err,setErr]=useState('');

  const loadQuote=useCallback(async()=>{
    const[a,b,c,d]=await Promise.all([
      supabase.from('quotations').select('*').eq('id',id).maybeSingle(),
      supabase.from('quotation_lines').select('*').eq('quotation_id',id).order('sort_order'),
      supabase.from('quotation_payments').select('*').eq('quotation_id',id).order('sort_order'),
      supabase.from('app_settings').select('*').eq('id',1).maybeSingle(),
    ]);
    if(!a.data){setErr('لم يُعثر على هذا العرض.');return false}
    setErr('');setQ(a.data);setLines(b.data||[]);setPays(c.data||[]);setCfg(d.data);
    return true;
  },[id]);

  useEffect(()=>{loadQuote();const timer=window.setTimeout(()=>loadQuote(),500);return()=>window.clearTimeout(timer)},[loadQuote]);
  useEffect(()=>{const refresh=()=>loadQuote();const onVisibility=()=>{if(document.visibilityState==='visible')refresh()};window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',onVisibility);return()=>{window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',onVisibility)}},[loadQuote]);

  if(err)return<div style={{padding:40}} className="msg err">{err}</div>;
  if(!q||!cfg)return<div style={{padding:40}}>جارٍ التحميل…</div>;

  const numbered=numberLines(lines);
  const subs=titleSubtotals(lines,q.show_qty);
  const rateOnly=!q.show_qty;
  const showTotalCol=q.show_line_total&&!rateOnly;
  const t=totals(q,lines);
  const quoteSpecificTerms=(q.terms_text||'').split('\n').map(s=>s.trim()).filter(Boolean);
  const sourceTerms=(Array.isArray(q.terms_structured)?q.terms_structured:[]).filter(hasTermContent);
  const termItems=resolveTermNumbers(sourceTerms,q.terms_start||'3').map((term,index)=>({...term,id:term.id||`term-${index}`}));
  const paperApproval=q.paper_approval_enabled!==false;
  const isEn=q.language==='en';
  const dir=isEn?'ltr':'rtl';
  const tr=(ar,en)=>isEn?en:ar;
  const formatDate=value=>isEn?dateEn(value):dateAr(value);
  const lineDesc=line=>isEn?(line.description_en||line.description_ar||''):(line.description_ar||'');
  const unitText=unit=>isEn?(EN_UNIT[unit]||unit||'—'):(unit||'—');
  const approvalParties=buildQuotationApprovalParties(q,tr);
  const title=q.title_override||(q.doc_kind==='boq'?tr('جدول كميات','BILL OF QUANTITIES (BOQ)'):tr('عرض سعر','QUOTATION'));
  const validUntil=q.show_validity&&q.quote_date?new Date(new Date(q.quote_date).getTime()+q.valid_days*86400000):null;
  const cols=2+(q.show_unit?1:0)+(q.show_qty?1:0)+(q.show_unit_price?1:0)+(showTotalCol?1:0);

  const metaCells=[];
  if(q.show_client!==false)metaCells.push(<div className="mcell" key="client"><span className="mk">{tr('العميل','Client')}</span><span className="mv">{q.client_name}</span>{q.client_contact&&<span className="ms">{q.client_contact}</span>}</div>);
  if(q.show_project!==false)metaCells.push(<div className="mcell" key="project"><span className="mk">{tr('المرجع وتفاصيل المشروع','Project / Reference')}</span><span className="mv">{q.project_ref||'—'}</span>{q.site_location&&<span className="ms">{q.site_location}</span>}</div>);
  if(q.show_quote_info!==false)metaCells.push(<div className="mcell" key="quote"><span className="mk">{tr('الرقم المرجعي','Quotation No.')}</span><span className="mv mono">{q.quote_no}</span><span className="ms mono">{tr('التاريخ','Date')}: {formatDate(q.quote_date)}</span></div>);
  if(q.show_validity)metaCells.push(<div className="mcell" key="valid"><span className="mk">{tr('صلاحية العرض','Quotation Validity')}</span><span className="mv">{q.valid_days} {tr('يوماً','Days')}</span>{validUntil&&<span className="ms mono">{tr('حتى','Valid Until')}: {formatDate(validUntil)}</span>}</div>);

  async function printFresh(){setSaved(tr('جارٍ تحديث المعاينة…','Refreshing preview…'));const ok=await loadQuote();if(!ok)return;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));setSaved('');window.print()}

  const TableCols=()=> <colgroup><col className="c-no"/><col/>{q.show_unit&&<col className="c-unit"/>}{q.show_qty&&<col className="c-qty"/>}{q.show_unit_price&&<col className="c-price"/>}{showTotalCol&&<col className="c-total"/>}</colgroup>;
  const TableHead=()=> <thead><tr><th>{tr('م','No.')}</th><th>{tr(`بيان الأعمال${q.show_en_desc?' / Description':''}`,'Description of Works')}</th>{q.show_unit&&<th>{tr('الوحدة','Unit')}</th>}{q.show_qty&&<th className="num">{tr('الكمية','Qty')}</th>}{q.show_unit_price&&<th className="num">{tr('الفئة','Unit Rate')}</th>}{showTotalCol&&<th className="num">{tr('الإجمالي','Amount')}</th>}</tr></thead>;
  const Row=({l})=>l.kind==='title'?<tr className="trow" data-print-flow-item="row"><td className="mono">{l.number}</td><td colSpan={cols-1-(showTotalCol?1:0)}>{lineDesc(l)}</td>{showTotalCol&&<td className="num">{money(subs[l.id]||0)}</td>}</tr>:l.kind==='note'?<tr className="nrow" data-print-flow-item="row"><td/><td colSpan={cols-1}>{lineDesc(l)}</td></tr>:<tr data-print-flow-item="row"><td className="mono">{l.number}</td><td className="desc">{lineDesc(l)}{!isEn&&q.show_en_desc&&l.description_en&&<span className="desc-en">{l.description_en}</span>}</td>{q.show_unit&&<td className="ctr">{unitText(l.unit)}</td>}{q.show_qty&&<td className="num">{fmtQty(l.qty)}</td>}{q.show_unit_price&&<td className="num">{money(l.unit_price)}</td>}{showTotalCol&&<td className="num">{money(lineTotal(l,q.show_qty))}</td>}</tr>;

  const bankName=isEn?'Alrajhi Bank':'مصرف الراجحي';

  return <div dir={dir} className="print-doc-quotation-route">
    <div className="qtoolbar no-print">
      <div className="tb-group">
        <button className="primary" onClick={printFresh}>{tr('طباعة أو حفظ PDF','Print / Save PDF')}</button>
      </div>
      <span className="qt-note">{saved||tr('الهندسة والتقسيم والختم والتوقيع من القبطان للطباعة','Geometry, pagination and marks by Print Captain')}</span>
    </div>

    <ConstitutionPrintFrame
      documentKey="quotation"
      cfg={cfg}
      direction={dir}
      showStamp={Boolean(q.show_stamp)}
      showSignature={Boolean(q.show_signature)}
    >
      <div className="quote-document-flow" dir={dir}>
        <div className="q-title" data-print-keep-with-next="true"><h1>{title}</h1><span className="rule"/></div>
        <div className="q-meta" data-print-keep-with-next="true" style={{gridTemplateColumns:`repeat(${Math.max(1,metaCells.length)},minmax(0,1fr))`}}>{metaCells}</div>
        {q.show_intro&&q.intro_text?<p className="q-intro">{q.intro_text}</p>:null}

        <table className="q-table" data-print-flow={PRINT_FLOW_KIND.REPEATABLE_TABLE}>
          <TableCols/>
          <TableHead/>
          <tbody>{numbered.map(line=><Row l={line} key={line.id}/>)}</tbody>
        </table>

        {!rateOnly?<div className="q-sum"><div className="srow grand"><span>{tr('المجموع','Total')}</span><span className="mono">{money(t.grand)} <Riyal/></span></div></div>:null}

        {quoteSpecificTerms.length?<div className="q-sum rate-only" aria-label={tr('شروط عرض السعر','Quotation conditions')}>
          {quoteSpecificTerms.map((term,index)=><div className="srow" key={`quote-term-${index}`}><span>{term}</span></div>)}
        </div>:null}

        {q.show_payments&&pays.length?<div className="q-block pay"><div className="qb-head">{tr('2. شروط الدفع','2. Payment Terms')}</div><table className="q-pay"><thead><tr><th style={{width:'9mm'}}>{tr('م','No.')}</th><th>{tr('الدفعة','Payment')}</th><th style={{width:'16mm'}} className="num">{tr('النسبة','%')}</th><th>{tr('الاستحقاق','Due / Milestone')}</th></tr></thead><tbody>{pays.map((payment,index)=><tr key={payment.id}><td>{index+1}</td><td>{isEn&&payment.label==='دفعة'?'Payment':payment.label}</td><td className="num">{Number(payment.percent||0)}%</td><td className="payment-note">{payment.trigger_note||'—'}</td></tr>)}</tbody></table></div>:null}

        {q.show_terms&&termItems.length?<>
          <div className="q-block" data-print-keep-with-next="true"><div className="qb-head">{tr('الشروط والأحكام العامة','General Terms & Conditions')}</div></div>
          {termItems.map(term=><section className="q-term-flow" key={term.id}>
            {String(term.title||'').trim()?<h3><span className="term-no">{term.number}.</span>{term.title}</h3>:null}
            {String(term.body||'').trim()?<p>{!String(term.title||'').trim()?<><span className="term-no">{term.number}.</span>{' '}</>:null}{term.body}</p>:null}
          </section>)}
        </>:null}
        {q.show_closing&&q.closing_text?<p className="q-closing">{q.closing_text}</p>:null}
        {paperApproval?<PrintApprovalBlock declaration={tr('بالتوقيع أدناه، يؤكد العميل قبوله لهذا العرض وشروطه التجارية.','By signing below, the Client confirms acceptance of this quotation and its commercial terms.')} parties={approvalParties}/>:null}
        <div className="q-foot">{q.show_bank&&(cfg.bank_name_full||cfg.bank_account_no||cfg.bank_iban)&&<div className="q-bank" dir={dir}><div className="qb-t">{tr('تفاصيل الحساب البنكي','Bank Details')}</div><div className="bank-line">{bankName}</div>{cfg.bank_account_no&&<div className="bank-line"><span className="bank-label">{tr('رقم الحساب','Account No.')}:</span> <span className="mono acct">{cfg.bank_account_no}</span></div>}{cfg.bank_iban&&<div className="bank-line"><span className="bank-label">IBAN:</span> <span className="mono acct">{cfg.bank_iban}</span></div>}</div>}</div>
      </div>
    </ConstitutionPrintFrame>
  </div>;
}
