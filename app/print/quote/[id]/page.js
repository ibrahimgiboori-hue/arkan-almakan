'use client';
import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { money, dateAr, qty as fmtQty } from '@/lib/format';
import { tafqit } from '@/lib/tafqit';
import { numberLines, lineTotal, titleSubtotals, totals } from '@/lib/quote-calc';
import { paginateQuoteBlocks } from '@/lib/quote-pagination.mjs';
import { getPrintLayoutPolicy } from '@/lib/print-governance';
import Riyal from '@/components/Riyal';
import ConstitutionPagedFrame from '@/components/print/ConstitutionPagedFrame';
import './quote-print.css';

const pub = (p) => p ? supabase.storage.from('brand').getPublicUrl(p).data.publicUrl : null;
const MM = 3.7795275591;
const QUOTE_LAYOUT = getPrintLayoutPolicy('quotation');

const EN_UNIT = {
  'م2':'m²','م²':'m²','م3':'m³','م³':'m³','م':'m','م طولي':'LM','م.ط':'LM',
  'عدد':'No.','قطعة':'No.','يوم':'Day','ساعة':'Hr','طن':'Ton','كجم':'kg','لتر':'L','مقطوعية':'Lump Sum'
};

function dateEn(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-GB', { day:'2-digit', month:'2-digit', year:'numeric' }).format(d);
}

export default function QuotePrint() {
  const { id } = useParams();
  const [q, setQ] = useState(null);
  const [lines, setLines] = useState([]);
  const [pays, setPays] = useState([]);
  const [cfg, setCfg] = useState(null);
  const [pages, setPages] = useState(null);
  const [drag, setDrag] = useState(null);
  const [pos, setPos] = useState({});
  const [saved, setSaved] = useState('');
  const [err, setErr] = useState('');
  const [layoutPreview, setLayoutPreview] = useState(null);
  const measureRef = useRef(null);

  useEffect(() => {
    (async () => {
      const [a,b,c,d] = await Promise.all([
        supabase.from('quotations').select('*').eq('id', id).maybeSingle(),
        supabase.from('quotation_lines').select('*').eq('quotation_id', id).order('sort_order'),
        supabase.from('quotation_payments').select('*').eq('quotation_id', id).order('sort_order'),
        supabase.from('app_settings').select('*').eq('id',1).maybeSingle(),
      ]);
      if (!a.data) { setErr('لم يُعثر على هذا العرض.'); return; }
      setQ(a.data); setLines(b.data || []); setPays(c.data || []); setCfg(d.data);
      setPos({ stamp_x_mm:a.data.stamp_x_mm, stamp_y_mm:a.data.stamp_y_mm,
               sign_x_mm:a.data.sign_x_mm, sign_y_mm:a.data.sign_y_mm });
    })();
  }, [id]);

  const numbered = q ? numberLines(lines) : [];
  const subs = q ? titleSubtotals(lines, q.show_qty) : {};
  const rateOnly = q ? !q.show_qty : false;
  const showTotalCol = q ? (q.show_line_total && !rateOnly) : false;
  const t = q ? totals(q, lines) : {};
  const terms = (q?.terms_text || '').split('\n').map((s)=>s.trim()).filter(Boolean);

  const blocks = [];
  if (q) {
    blocks.push({ id:'title', kind:'title' });
    blocks.push({ id:'meta', kind:'meta' });
    if (q.show_intro && q.intro_text) blocks.push({ id:'intro', kind:'intro' });
    numbered.forEach((l) => blocks.push({ id:'row-'+l.id, kind:'row', line:l }));
    blocks.push({ id:'sum', kind:'sum' });
    if (q.show_payments && pays.length) blocks.push({ id:'pay', kind:'pay' });
    if (q.show_terms && terms.length) blocks.push({ id:'terms', kind:'terms' });
    if (q.show_closing && q.closing_text) blocks.push({ id:'closing', kind:'closing' });
    blocks.push({ id:'foot', kind:'foot' });
  }

  useLayoutEffect(() => {
    if (!q || !cfg || !measureRef.current) return;
    const mTop = Number(layoutPreview?.topMm ?? q.margin_top_mm ?? QUOTE_LAYOUT.topMm ?? cfg.letterhead_top_mm);
    const mBot = Number(layoutPreview?.bottomMm ?? q.margin_bottom_mm ?? QUOTE_LAYOUT.bottomMm ?? cfg.letterhead_bottom_mm);
    const reserveMm = Number(QUOTE_LAYOUT.paginationReserveMm ?? 7);
    const avail = (297 - mTop - mBot - reserveMm) * MM;
    const els = measureRef.current.querySelectorAll('[data-block]');
    const h = {};
    els.forEach((el) => { h[el.dataset.block] = el.getBoundingClientRect().height + 1; });
    const result = paginateQuoteBlocks({
      blocks, heights:h, availableHeight:avail, tableHeaderHeight:h['__thead'] || 0,
    });
    if (result.oversizeBlockIds.length) console.warn('Quotation blocks exceed one printable page:', result.oversizeBlockIds);
    setPages(result.pages);
  }, [q, cfg, lines, pays, layoutPreview]);

  if (err) return <div style={{padding:40}} className="msg err">{err}</div>;
  if (!q || !cfg) return <div style={{padding:40}}>جارٍ التحميل…</div>;

  const isEn = q.language === 'en';
  const tr = (ar,en) => isEn ? en : ar;
  const formatDate = (v) => isEn ? dateEn(v) : dateAr(v);
  const lineDesc = (l) => isEn ? (l.description_en || l.description_ar || '') : (l.description_ar || '');
  const unitText = (u) => isEn ? (EN_UNIT[u] || u || '—') : (u || '—');

  const mTop = Number(layoutPreview?.topMm ?? q.margin_top_mm ?? QUOTE_LAYOUT.topMm ?? cfg.letterhead_top_mm);
  const mBot = Number(layoutPreview?.bottomMm ?? q.margin_bottom_mm ?? QUOTE_LAYOUT.bottomMm ?? cfg.letterhead_bottom_mm);
  const mSide = Number(layoutPreview?.sideMm ?? q.margin_side_mm ?? QUOTE_LAYOUT.sideMm ?? cfg.letterhead_side_mm);
  const blockGapMm = Number(layoutPreview?.blockGapMm ?? QUOTE_LAYOUT.grid?.blockGapMm ?? 3);
  const sectionGapMm = Number(layoutPreview?.sectionGapMm ?? QUOTE_LAYOUT.grid?.sectionGapMm ?? 6);
  const stampMm = Number(q.stamp_size_mm ?? cfg.stamp_size_mm ?? 30);
  const signMm = Number(q.sign_size_mm ?? cfg.signature_size_mm ?? 20);
  const stampUrl = q.show_stamp ? pub(cfg.stamp_image_path) : null;
  const signUrl = q.show_signature ? pub(cfg.signature_image_path) : null;

  const title = q.title_override || (q.doc_kind === 'boq'
    ? tr('جدول كميات','BILL OF QUANTITIES (BOQ)')
    : tr('عرض سعر','QUOTATION'));
  const validUntil = q.show_validity && q.quote_date
    ? new Date(new Date(q.quote_date).getTime() + q.valid_days*86400000) : null;
  const cols = 2 + (q.show_unit?1:0) + (q.show_qty?1:0)
             + (q.show_unit_price?1:0) + (showTotalCol?1:0);

  function startDrag(kind) {
    return (e) => {
      e.preventDefault();
      const page = e.currentTarget.closest('.constitution-paged-sheet');
      setDrag({ kind, rect: page.getBoundingClientRect() });
    };
  }
  function onMove(e) {
    if (!drag) return;
    const x = Math.max(0, Math.round((drag.rect.right - e.clientX) / MM));
    const y = Math.max(0, Math.round((e.clientY - drag.rect.top) / MM));
    setPos((p) => drag.kind === 'stamp'
      ? { ...p, stamp_x_mm:x, stamp_y_mm:y } : { ...p, sign_x_mm:x, sign_y_mm:y });
  }
  async function endDrag() {
    if (!drag) return;
    const kind = drag.kind; setDrag(null);
    const fields = kind === 'stamp'
      ? { stamp_x_mm: pos.stamp_x_mm, stamp_y_mm: pos.stamp_y_mm }
      : { sign_x_mm: pos.sign_x_mm, sign_y_mm: pos.sign_y_mm };
    const { error } = await supabase.from('quotations').update(fields).eq('id', id);
    if (error) setErr(error.message);
    else { setSaved(tr('حُفظ الموضع','Position saved')); setTimeout(()=>setSaved(''), 1400); }
  }
  async function resetPos() {
    setPos({});
    await supabase.from('quotations').update({
      stamp_x_mm:null, stamp_y_mm:null, sign_x_mm:null, sign_y_mm:null }).eq('id', id);
    setSaved(tr('أُعيد الموضع الافتراضي','Default position restored')); setTimeout(()=>setSaved(''), 1400);
  }

  const TableCols = () => (
    <colgroup>
      <col className="c-no" />
      <col />
      {q.show_unit && <col className="c-unit" />}
      {q.show_qty && <col className="c-qty" />}
      {q.show_unit_price && <col className="c-price" />}
      {showTotalCol && <col className="c-total" />}
    </colgroup>
  );

  const TableHead = () => (
    <thead>
      <tr>
        <th>{tr('م','No.')}</th>
        <th>{tr(`بيان الأعمال${q.show_en_desc ? ' / Description' : ''}`,'Description of Works')}</th>
        {q.show_unit && <th>{tr('الوحدة','Unit')}</th>}
        {q.show_qty && <th className="num">{tr('الكمية','Qty')}</th>}
        {q.show_unit_price && <th className="num">{tr('الفئة','Unit Rate')}</th>}
        {showTotalCol && <th className="num">{tr('الإجمالي','Amount')}</th>}
      </tr>
    </thead>
  );

  const Row = ({ l }) => l.kind === 'title' ? (
    <tr className="trow">
      <td className="mono">{l.number}</td>
      <td colSpan={cols - 1 - (showTotalCol?1:0)}>{lineDesc(l)}</td>
      {showTotalCol && <td className="num">{money(subs[l.id] || 0)}</td>}
    </tr>
  ) : l.kind === 'note' ? (
    <tr className="nrow"><td /><td colSpan={cols-1}>{lineDesc(l)}</td></tr>
  ) : (
    <tr>
      <td className="mono">{l.number}</td>
      <td className="desc">
        {lineDesc(l)}
        {!isEn && q.show_en_desc && l.description_en && <span className="desc-en">{l.description_en}</span>}
      </td>
      {q.show_unit && <td className="ctr">{unitText(l.unit)}</td>}
      {q.show_qty && <td className="num">{fmtQty(l.qty)}</td>}
      {q.show_unit_price && <td className="num">{money(l.unit_price)}</td>}
      {showTotalCol && <td className="num">{money(lineTotal(l, q.show_qty))}</td>}
    </tr>
  );

  function renderBlock(b) {
    switch (b.kind) {
      case 'title': return (
        <div className="q-title" key={b.id}>
          <h1>{title}</h1><span className="rule" />
        </div>
      );
      case 'meta': return (
        <div className="q-meta" key={b.id}
             style={{gridTemplateColumns:`repeat(${q.show_validity ? 4 : 3},1fr)`}}>
          <div className="mcell">
            <span className="mk">{tr('العميل','Client')}</span>
            <span className="mv">{q.client_name}</span>
            {q.client_contact && <span className="ms">{q.client_contact}</span>}
          </div>
          <div className="mcell">
            <span className="mk">{tr('المرجع وتفاصيل المشروع','Project / Reference')}</span>
            <span className="mv">{q.project_ref || '—'}</span>
            {q.site_location && <span className="ms">{q.site_location}</span>}
          </div>
          <div className="mcell">
            <span className="mk">{tr('الرقم المرجعي','Quotation No.')}</span>
            <span className="mv mono">{q.quote_no}</span>
            <span className="ms mono">{tr('التاريخ','Date')}: {formatDate(q.quote_date)}</span>
          </div>
          {q.show_validity && (
            <div className="mcell">
              <span className="mk">{tr('صلاحية العرض','Quotation Validity')}</span>
              <span className="mv">{q.valid_days} {tr('يوماً','Days')}</span>
              {validUntil && <span className="ms mono">{tr('حتى','Valid Until')}: {formatDate(validUntil)}</span>}
            </div>
          )}
        </div>
      );
      case 'intro': return <p className="q-intro" key={b.id}>{q.intro_text}</p>;
      case 'sum': return rateOnly ? (
        <div className="q-sum rate-only" key={b.id}>
          <div className="srow"><span>{tr(
            'الأسعار المذكورة أعلاه فئات للوحدة، وتُحتسب المستحقات على الكميات المنفَّذة فعلاً',
            'The above rates are unit rates. Payments shall be based on actual executed quantities.'
          )}</span></div>
          {q.vat_mode !== 'none' && (
            <div className="srow"><span>{isEn
              ? `The above rates exclude VAT at ${(Number(q.vat_rate)*100).toFixed(0)}%, which will be added as applicable.`
              : `الفئات لا تشمل ضريبة القيمة المضافة ${(Number(q.vat_rate)*100).toFixed(0)}٪ — تُضاف عند إصدار الفاتورة`}</span></div>
          )}
        </div>
      ) : (
        <div className="q-sum" key={b.id}>
          {t.discount > 0 && (
            <div className="srow"><span>{tr('الخصم','Discount')}</span>
              <span className="mono">{money(t.discount)} <Riyal /></span></div>
          )}
          <div className="srow"><span>{tr('الإجمالي الفرعي','Subtotal')}</span>
            <span className="mono">{money(t.subtotal)} <Riyal /></span></div>
          {q.vat_mode !== 'none' && (
            <div className="srow">
              <span>{isEn
                ? `VAT ${(Number(q.vat_rate)*100).toFixed(0)}%${q.vat_mode === 'inclusive' ? ' (Included)' : ''}`
                : `ضريبة القيمة المضافة ${(Number(q.vat_rate)*100).toFixed(0)}٪${q.vat_mode === 'inclusive' ? ' (مضمّنة)' : ''}`}</span>
              <span className="mono">{money(t.vat)} <Riyal /></span>
            </div>
          )}
          <div className="srow grand">
            <span>{q.vat_mode === 'none'
              ? tr('المجموع','Total')
              : tr('المجموع شامل الضريبة','Total Including VAT')}</span>
            <span className="mono">{money(t.grand)} <Riyal size={1.1} /></span>
          </div>
          {!isEn && <div className="tafqit-row">{tafqit(t.grand)}</div>}
        </div>
      );
      case 'pay': return (
        <div className="q-block pay" key={b.id}>
          <div className="qb-head">{tr('الدفعات المقترحة','Payment Terms')}</div>
          <table className="q-pay">
            <thead><tr><th style={{width:'9mm'}}>{tr('م','No.')}</th><th>{tr('الدفعة','Payment')}</th>
              <th style={{width:'16mm'}} className="num">{tr('النسبة','%')}</th>
              {!rateOnly && <th style={{width:'28mm'}} className="num">{tr('المبلغ','Amount')}</th>}
              <th>{tr('الاستحقاق','Due / Milestone')}</th></tr></thead>
            <tbody>
              {pays.map((p,i)=>(
                <tr key={p.id}>
                  <td className="mono">{i+1}</td>
                  <td>{isEn && p.label === 'دفعة' ? 'Payment' : p.label}</td>
                  <td className="num">{Number(p.percent||0)}%</td>
                  {!rateOnly && <td className="num">{money((t.grand*Number(p.percent||0))/100)}</td>}
                  <td>{p.trigger_note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      case 'terms': return (
        <div className="q-block terms" key={b.id}>
          <div className="qb-head">{tr('الشروط والأحكام','Terms & Conditions')}</div>
          <ol className="q-terms">{terms.map((s,i)=><li key={i}>{s}</li>)}</ol>
        </div>
      );
      case 'closing': return <p className="q-closing" key={b.id}>{q.closing_text}</p>;
      case 'foot': return (
        <div className="q-foot" key={b.id}>
          <div className="q-sign">
            <div className="qs-label">{tr('ختم وتوقيع مؤسسة أركان المكان','Authorized Stamp & Signature')}</div>
            <div className="qs-marks">
              {signUrl && pos.sign_x_mm == null && <img className="sign" src={signUrl} alt="" style={{height:`${signMm}mm`}} />}
              {stampUrl && pos.stamp_x_mm == null && <img className="stamp" src={stampUrl} alt="" style={{height:`${stampMm}mm`}} />}
            </div>
          </div>
          {q.show_bank && (cfg.bank_name_full || cfg.bank_account_no || cfg.bank_iban) && (
            <div className="q-bank">
              <div className="qb-t">{tr('تفاصيل الحساب البنكي','Bank Details')}</div>
              {cfg.bank_name_full && <div>{cfg.bank_name_full}</div>}
              {cfg.bank_account_no && (
                <div className="bank-line">{tr('رقم الحساب','Account No.')}:{' '}
                  <span className="mono acct">{cfg.bank_account_no}</span></div>
              )}
              {cfg.bank_iban && <div className="mono iban">IBAN: {cfg.bank_iban}</div>}
            </div>
          )}
        </div>
      );
      default: return null;
    }
  }

  return (
    <div dir={isEn ? 'ltr' : 'rtl'}>
      <div className="qtoolbar no-print">
        <div className="tb-group">
          <button className="primary" onClick={()=>window.print()}>{tr('طباعة أو حفظ PDF','Print / Save PDF')}</button>
          <button onClick={resetPos}>{tr('إعادة الختم لموضعه','Reset Stamp Position')}</button>
          {pos.stamp_x_mm == null && stampUrl && (
            <button onClick={()=>setPos({...pos, stamp_x_mm:25, stamp_y_mm:240})}>{tr('تحرير الختم للسحب','Move Stamp')}</button>
          )}
          {pos.sign_x_mm == null && signUrl && (
            <button onClick={()=>setPos({...pos, sign_x_mm:60, sign_y_mm:235})}>{tr('تحرير التوقيع للسحب','Move Signature')}</button>
          )}
          {saved && <span style={{fontSize:12.5,color:'#1E7A55'}}>{saved}</span>}
        </div>
        <span className="qt-note">
          {pages ? (isEn ? `${pages.length} page${pages.length===1?'':'s'}` : `${pages.length} صفحة`) : tr('جارٍ التقسيم…','Paginating…')}
          {' · '}{tr('الهوامش','Margins')} {mTop}/{mBot}/{mSide} mm
          {!cfg.letterhead_image_path && !cfg.header_image_path ? tr(' · لم تُرفع صورة الرأس',' · Header image not uploaded') : ''}
        </span>
      </div>

      <div
        className="measure"
        ref={measureRef}
        aria-hidden="true"
        dir={isEn ? 'ltr' : 'rtl'}
        style={{
          width:`${210 - mSide*2}mm`,
          '--print-block-gap':`${blockGapMm}mm`,
          '--print-section-gap':`${sectionGapMm}mm`,
        }}
      >
        <div data-block="__thead"><table className="q-table"><TableCols /><TableHead /></table></div>
        {blocks.map((b) => b.kind === 'row' ? (
          <table className="q-table" key={b.id}><TableCols /><tbody data-block={b.id}><Row l={b.line} /></tbody></table>
        ) : <div data-block={b.id} key={b.id}>{renderBlock(b)}</div>)}
      </div>

      <ConstitutionPagedFrame
        documentKey="quotation"
        cfg={cfg}
        direction={isEn ? 'ltr' : 'rtl'}
        showLetterhead={q.show_letterhead}
        contentTopMm={mTop}
        contentBottomMm={mBot}
        contentSideMm={mSide}
        onLayoutChange={setLayoutPreview}
        pageClassName={drag ? 'dragging' : ''}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        renderOverlay={({ pageIndex, pageCount }) => (
          <>
            {stampUrl && pos.stamp_x_mm != null && pageIndex === pageCount - 1 && (
              <img src={stampUrl} alt={tr('ختم','Stamp')} className="float-mark"
                   onPointerDown={startDrag('stamp')}
                   style={{height:`${stampMm}mm`, right:`${pos.stamp_x_mm}mm`, top:`${pos.stamp_y_mm}mm`}} />
            )}
            {signUrl && pos.sign_x_mm != null && pageIndex === pageCount - 1 && (
              <img src={signUrl} alt={tr('توقيع','Signature')} className="float-mark"
                   onPointerDown={startDrag('sign')}
                   style={{height:`${signMm}mm`, right:`${pos.sign_x_mm}mm`, top:`${pos.sign_y_mm}mm`}} />
            )}
          </>
        )}
      >
        {(pages || []).map((page, pi) => (
          <div className="quote-document-page" key={pi} dir={isEn ? 'ltr' : 'rtl'}>
            {(() => {
              const out = []; let i = 0;
              while (i < page.length) {
                if (page[i].kind === 'row') {
                  const rows = [];
                  while (i < page.length && page[i].kind === 'row') { rows.push(page[i].line); i++; }
                  out.push(
                    <table className="q-table" key={'t'+i}>
                      <TableCols /><TableHead /><tbody>{rows.map((l)=><Row l={l} key={l.id} />)}</tbody>
                    </table>
                  );
                } else { out.push(renderBlock(page[i])); i++; }
              }
              return out;
            })()}
          </div>
        ))}
      </ConstitutionPagedFrame>
    </div>
  );
}
