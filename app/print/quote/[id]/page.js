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
import ConstitutionPagedFrame from '@/components/print/ConstitutionPagedFrame';
import PrintApprovalBlock from '@/components/print/PrintApprovalBlock';
import PrintMarks from '@/components/print/PrintMarks';
import './quote-print.css';
import './quote-flow.css';

const MM = 3.7795275591;
const EN_UNIT = {'م2':'m²','م²':'m²','م3':'m³','م³':'m³','م':'m','م طولي':'LM','م.ط':'LM','عدد':'No.','قطعة':'No.','يوم':'Day','ساعة':'Hr','طن':'Ton','كجم':'kg','لتر':'L','مقطوعية':'Lump Sum'};
function dateEn(value){if(!value)return'—';const d=value instanceof Date?value:new Date(value);if(Number.isNaN(d.getTime()))return String(value);return new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'}).format(d)}
function splitTerm(raw,index){const text=String(raw||'').trim();const parts=text.split(/\s+[—–-]\s+/,2);if(parts.length===2)return{id:`legacy-term-${index}`,title:parts[0].trim(),body:parts[1].trim(),number_override:null};return{id:`legacy-term-${index}`,title:'',body:text,number_override:null}}
function markPositionStyle(x,y){const style={};if(x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x)))style.right=`${Number(x)}mm`;if(y!==null&&y!==undefined&&y!==''&&Number.isFinite(Number(y))){style.top=`${Number(y)}mm`;style.bottom='auto'}return style}

export default function QuotePrint(){
  const {id}=useParams();
  const [q,setQ]=useState(null);
  const [lines,setLines]=useState([]);
  const [pays,setPays]=useState([]);
  const [cfg,setCfg]=useState(null);
  const [drag,setDrag]=useState(null);
  const [pos,setPos]=useState({});
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
    setPos({stamp_x_mm:a.data.stamp_x_mm,stamp_y_mm:a.data.stamp_y_mm,sign_x_mm:a.data.sign_x_mm,sign_y_mm:a.data.sign_y_mm});
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
  const legacyTerms=(q.terms_text||'').split('\n').map(s=>s.trim()).filter(Boolean).map(splitTerm);
  const sourceTerms=Array.isArray(q.terms_structured)&&q.terms_structured.length?q.terms_structured:legacyTerms;
  const termItems=resolveTermNumbers(sourceTerms,q.terms_start||'3').map((term,index)=>({...term,id:term.id||`term-${index}`}));
  const paperApproval=q.paper_approval_enabled!==false;
  const isEn=q.language==='en';
  const dir=isEn?'ltr':'rtl';
  const tr=(ar,en)=>isEn?en:ar;
  const formatDate=value=>isEn?dateEn(value):dateAr(value);
  const lineDesc=line=>isEn?(line.description_en||line.description_ar||''):(line.description_ar||'');
  const unitText=unit=>isEn?(EN_UNIT[unit]||unit||'—'):(unit||'—');
  const approvalParties=buildQuotationApprovalParties(q,tr);
  const stampMm=Number(q.stamp_size_mm??cfg.stamp_size_mm??30);
  const signMm=Number(q.sign_size_mm??cfg.signature_size_mm??20);
  const title=q.title_override||(q.doc_kind==='boq'?tr('جدول كميات','BILL OF QUANTITIES (BOQ)'):tr('عرض سعر','QUOTATION'));
  const validUntil=q.show_validity&&q.quote_date?new Date(new Date(q.quote_date).getTime()+q.valid_days*86400000):null;
  const cols=2+(q.show_unit?1:0)+(q.show_qty?1:0)+(q.show_unit_price?1:0)+(showTotalCol?1:0);

  const metaCells=[];
  if(q.show_client!==false)metaCells.push(<div className="mcell" key="client"><span className="mk">{tr('العميل','Client')}</span><span className="mv">{q.client_name}</span>{q.client_contact&&<span className="ms">{q.client_contact}</span>}</div>);
  if(q.show_project!==false)metaCells.push(<div className="mcell" key="project"><span className="mk">{tr('المرجع وتفاصيل المشروع','Project / Reference')}</span><span className="mv">{q.project_ref||'—'}</span>{q.site_location&&<span className="ms">{q.site_location}</span>}</div>);
  if(q.show_quote_info!==false)metaCells.push(<div className="mcell" key="quote"><span className="mk">{tr('الرقم المرجعي','Quotation No.')}</span><span className="mv mono">{q.quote_no}</span><span className="ms mono">{tr('التاريخ','Date')}: {formatDate(q.quote_date)}</span></div>);
  if(q.show_validity)metaCells.push(<div className="mcell" key="valid"><span className="mk">{tr('صلاحية العرض','Quotation Validity')}</span><span className="mv">{q.valid_days} {tr('يوماً','Days')}</span>{validUntil&&<span className="ms mono">{tr('حتى','Valid Until')}: {formatDate(validUntil)}</span>}</div>);

  function startDrag(kind){return event=>{event.preventDefault();const page=event.currentTarget.closest('.constitution-paged-sheet');if(!page)return;setDrag({kind,rect:page.getBoundingClientRect()})}}
  function onMove(event){if(!drag)return;const x=Math.max(0,Math.round((drag.rect.right-event.clientX)/MM)),y=Math.max(0,Math.round((event.clientY-drag.rect.top)/MM));setPos(previous=>drag.kind==='stamp'?{...previous,stamp_x_mm:x,stamp_y_mm:y}:{...previous,sign_x_mm:x,sign_y_mm:y})}
  async function endDrag(){if(!drag)return;const kind=drag.kind;setDrag(null);const fields=kind==='stamp'?{stamp_x_mm:pos.stamp_x_mm,stamp_y_mm:pos.stamp_y_mm}:{sign_x_mm:pos.sign_x_mm,sign_y_mm:pos.sign_y_mm};const{error}=await supabase.from('quotations').update(fields).eq('id',id);if(error)setErr(error.message);else{setSaved(tr('حُفظ موضع الختم والتوقيع','Stamp / signature position saved'));setTimeout(()=>setSaved(''),1400)}}
  async function resetPos(){setPos({});const{error}=await supabase.from('quotations').update({stamp_x_mm:null,stamp_y_mm:null,sign_x_mm:null,sign_y_mm:null}).eq('id',id);if(error)setErr(error.message);else{setSaved(tr('عادت مواضع الختم والتوقيع للوضع الافتراضي','Stamp / signature positions reset'));setTimeout(()=>setSaved(''),1400)}}
  async function printFresh(){setSaved(tr('جارٍ تحديث المعاينة…','Refreshing preview…'));const ok=await loadQuote();if(!ok)return;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));setSaved('');window.print()}

  const TableCols=()=> <colgroup><col className="c-no"/><col/>{q.show_unit&&<col className="c-unit"/>}{q.show_qty&&<col className="c-qty"/>}{q.show_unit_price&&<col className="c-price"/>}{showTotalCol&&<col className="c-total"/>}</colgroup>;
  const TableHead=()=> <thead><tr><th>{tr('م','No.')}</th><th>{tr(`بيان الأعمال${q.show_en_desc?' / Description':''}`,'Description of Works')}</th>{q.show_unit&&<th>{tr('الوحدة','Unit')}</th>}{q.show_qty&&<th className="num">{tr('الكمية','Qty')}</th>}{q.show_unit_price&&<th className="num">{tr('الفئة','Unit Rate')}</th>}{showTotalCol&&<th className="num">{tr('الإجمالي','Amount')}</th>}</tr></thead>;
  const Row=({l})=>l.kind==='title'?<tr className="trow"><td className="mono">{l.number}</td><td colSpan={cols-1-(showTotalCol?1:0)}>{lineDesc(l)}</td>{showTotalCol&&<td className="num">{money(subs[l.id]||0)}</td>}</tr>:l.kind==='note'?<tr className="nrow"><td/><td colSpan={cols-1}>{lineDesc(l)}</td></tr>:<tr><td className="mono">{l.number}</td><td className="desc">{lineDesc(l)}{!isEn&&q.show_en_desc&&l.description_en&&<span className="desc-en">{l.description_en}</span>}</td>{q.show_unit&&<td className="ctr">{unitText(l.unit)}</td>}{q.show_qty&&<td className="num">{fmtQty(l.qty)}</td>}{q.show_unit_price&&<td className="num">{money(l.unit_price)}</td>}{showTotalCol&&<td className="num">{money(lineTotal(l,q.show_qty))}</td>}</tr>;

  const bankName=isEn?'Alrajhi Bank':'مصرف الراجحي';

  return <div dir={dir}>
    <div className="qtoolbar no-print">
      <div className="tb-group">
        <button className="primary" onClick={printFresh}>{tr('طباعة أو حفظ PDF','Print / Save PDF')}</button>
        <button onClick={resetPos}>{tr('إعادة الختم والتوقيع لموضعهما','Reset stamp & signature positions')}</button>
      </div>
      <span className="qt-note">{saved||tr('تقسيم الصفحات من القبطان للطباعة','Pagination by Print Captain')}</span>
    </div>

    <ConstitutionPagedFrame
      documentKey="quotation"
      cfg={cfg}
      direction={dir}
      contentTopMm={q.margin_top_mm}
      contentBottomMm={q.margin_bottom_mm}
      contentSideMm={q.margin_side_mm}
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      renderOverlay={({pageIndex,pageCount})=>pageIndex===pageCount-1?<PrintMarks cfg={cfg} showStamp={Boolean(q.show_stamp)} showSignature={Boolean(q.show_signature)} stampSizeMm={stampMm} signatureSizeMm={signMm} stampStyle={markPositionStyle(pos.stamp_x_mm,pos.stamp_y_mm)} signatureStyle={markPositionStyle(pos.sign_x_mm,pos.sign_y_mm)} stampProps={{onPointerDown:startDrag('stamp')}} signatureProps={{onPointerDown:startDrag('sign')}}/>:null}
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

        {rateOnly?<div className="q-sum rate-only"><div className="srow"><span>{q.supply_scope==='labor_only'?tr('الأسعار المذكورة أعلاه بالساعة، وتتم الفوترة حسب ساعات العمل الفعلية المعتمدة.','The above rates are hourly rates. Invoicing will be based on actual approved working hours.'):tr('الأسعار المذكورة أعلاه فئات للوحدة، وتتم الفوترة حسب الكميات الفعلية المعتمدة.','The above rates are unit rates. Invoicing will be based on actual approved quantities.')}</span></div>{q.vat_mode!=='none'&&<div className="srow"><span>{isEn?`The above rates exclude VAT at ${(Number(q.vat_rate)*100).toFixed(0)}%, which will be added as applicable.`:`الفئات لا تشمل ضريبة القيمة المضافة ${(Number(q.vat_rate)*100).toFixed(0)}٪ — تُضاف عند إصدار الفاتورة`}</span></div>}</div>:<div className="q-sum"><div className="srow grand"><span>{tr('المجموع','Total')}</span><span className="mono">{money(t.grand)} <Riyal/></span></div></div>}

        {q.show_payments&&pays.length?<div className="q-block pay"><div className="qb-head">{tr('2. شروط الدفع','2. Payment Terms')}</div><table className="q-pay"><thead><tr><th style={{width:'9mm'}}>{tr('م','No.')}</th><th>{tr('الدفعة','Payment')}</th><th style={{width:'16mm'}} className="num">{tr('النسبة','%')}</th><th>{tr('الاستحقاق','Due / Milestone')}</th></tr></thead><tbody>{pays.map((payment,index)=><tr key={payment.id}><td>{index+1}</td><td>{isEn&&payment.label==='دفعة'?'Payment':payment.label}</td><td className="num">{Number(payment.percent||0)}%</td><td className="payment-note">{payment.trigger_note||'—'}</td></tr>)}</tbody></table></div>:null}

        {q.show_terms?termItems.map(term=><section className="q-term-flow" key={term.id}><h3><span className="term-no">{term.number}.</span>{term.title}</h3>{term.body&&<p>{term.body}</p>}</section>):null}
        {q.show_closing&&q.closing_text?<p className="q-closing">{q.closing_text}</p>:null}
        {paperApproval?<PrintApprovalBlock declaration={tr('بالتوقيع أدناه، يؤكد العميل قبوله لهذا العرض وشروطه التجارية.','By signing below, the Client confirms acceptance of this quotation and its commercial terms.')} parties={approvalParties}/>:null}
        <div className="q-foot">{q.show_bank&&(cfg.bank_name_full||cfg.bank_account_no||cfg.bank_iban)&&<div className="q-bank" dir={dir}><div className="qb-t">{tr('تفاصيل الحساب البنكي','Bank Details')}</div><div className="bank-line">{bankName}</div>{cfg.bank_account_no&&<div className="bank-line"><span className="bank-label">{tr('رقم الحساب','Account No.')}:</span> <span className="mono acct">{cfg.bank_account_no}</span></div>}{cfg.bank_iban&&<div className="bank-line"><span className="bank-label">IBAN:</span> <span className="mono acct">{cfg.bank_iban}</span></div>}</div>}</div>
      </div>
    </ConstitutionPagedFrame>
  </div>;
}
