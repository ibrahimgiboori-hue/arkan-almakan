'use client';
import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { money, dateAr, qty as fmtQty } from '@/lib/format';
import { tafqit } from '@/lib/tafqit';
import { numberLines, lineTotal, titleSubtotals, totals } from '@/lib/quote-calc';
import Riyal from '@/components/Riyal';
import './quote-print.css';

const pub = (p) => p ? supabase.storage.from('brand').getPublicUrl(p).data.publicUrl : null;
const MM = 3.7795275591;

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

  // ---------- بناء قائمة الكتل ----------
  const numbered = q ? numberLines(lines) : [];
  const subs = q ? titleSubtotals(lines, q.show_qty) : {};
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

  // ---------- القياس والتقسيم ----------
  useLayoutEffect(() => {
    if (!q || !cfg || !measureRef.current) return;
    const mTop  = Number(q.margin_top_mm    ?? cfg.letterhead_top_mm);
    const mBot  = Number(q.margin_bottom_mm ?? cfg.letterhead_bottom_mm);
    const avail = (297 - mTop - mBot) * MM - 4;      // بكسل متاح للمحتوى

    const els = measureRef.current.querySelectorAll('[data-block]');
    const h = {};
    els.forEach((el) => { h[el.dataset.block] = el.getBoundingClientRect().height; });

    const headerH = h['__thead'] || 0;               // رأس الجدول يتكرر
    const out = [];
    let cur = [], used = 0, inTable = false;

    const push = () => { if (cur.length) { out.push(cur); cur = []; used = 0; inTable = false; } };

    blocks.forEach((b) => {
      const bh = h[b.id] || 0;
      const needsHeader = b.kind === 'row' && !inTable;
      const extra = needsHeader ? headerH : 0;

      if (used + bh + extra > avail && cur.length) {
        push();
        used = b.kind === 'row' ? headerH : 0;
        inTable = false;
      }
      if (b.kind === 'row' && !inTable) { used += headerH; inTable = true; }
      if (b.kind !== 'row') inTable = false;

      cur.push(b);
      used += bh;
    });
    push();
    setPages(out.length ? out : [[]]);
  }, [q, cfg, lines, pays]);

  if (err) return <div style={{padding:40}} className="msg err">{err}</div>;
  if (!q || !cfg) return <div style={{padding:40}}>جارٍ التحميل…</div>;

  const mTop  = Number(q.margin_top_mm    ?? cfg.letterhead_top_mm);
  const mBot  = Number(q.margin_bottom_mm ?? cfg.letterhead_bottom_mm);
  const mSide = Number(q.margin_side_mm   ?? cfg.letterhead_side_mm);
  const hMm   = Number(cfg.header_height_mm || 40);
  const fMm   = Number(cfg.footer_height_mm || 32);
  const stampMm = Number(q.stamp_size_mm ?? cfg.stamp_size_mm ?? 30);
  const signMm  = Number(q.sign_size_mm ?? cfg.signature_size_mm ?? 20);

  const headUrl  = q.show_letterhead ? pub(cfg.header_image_path) : null;
  const footUrl  = q.show_letterhead ? pub(cfg.footer_image_path) : null;
  const markUrl  = q.show_letterhead ? pub(cfg.watermark_image_path) : null;
  const stampUrl = q.show_stamp ? pub(cfg.stamp_image_path) : null;
  const signUrl  = q.show_signature ? pub(cfg.signature_image_path) : null;

  const title = q.title_override || (q.doc_kind === 'boq' ? 'جدول كميات' : 'عرض سعر');
  const validUntil = q.quote_date
    ? new Date(new Date(q.quote_date).getTime() + q.valid_days*86400000) : null;
  const cols = 2 + (q.show_unit?1:0) + (q.show_qty?1:0)
             + (q.show_unit_price?1:0) + (q.show_line_total?1:0);

  // ---------- السحب ----------
  function startDrag(kind) {
    return (e) => {
      e.preventDefault();
      const page = e.currentTarget.closest('.sheet');
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
    else { setSaved('حُفظ الموضع'); setTimeout(()=>setSaved(''), 1400); }
  }
  async function resetPos() {
    setPos({});
    await supabase.from('quotations').update({
      stamp_x_mm:null, stamp_y_mm:null, sign_x_mm:null, sign_y_mm:null }).eq('id', id);
    setSaved('أُعيد الموضع الافتراضي'); setTimeout(()=>setSaved(''), 1400);
  }

  // ---------- رسم الكتل ----------
  const TableHead = () => (
    <thead>
      <tr>
        <th style={{width:'9mm'}}>م</th>
        <th>بيان الأعمال{q.show_en_desc ? ' / Description' : ''}</th>
        {q.show_unit && <th style={{width:'14mm'}}>الوحدة</th>}
        {q.show_qty && <th style={{width:'18mm'}} className="num">الكمية</th>}
        {q.show_unit_price && <th style={{width:'22mm'}} className="num">الفئة</th>}
        {q.show_line_total && <th style={{width:'26mm'}} className="num">الإجمالي</th>}
      </tr>
    </thead>
  );

  const Row = ({ l }) => l.kind === 'title' ? (
    <tr className="trow">
      <td className="mono">{l.number}</td>
      <td colSpan={cols - 1 - (q.show_line_total?1:0)}>{l.description_ar}</td>
      {q.show_line_total && <td className="num">{money(subs[l.id] || 0)}</td>}
    </tr>
  ) : l.kind === 'note' ? (
    <tr className="nrow"><td /><td colSpan={cols-1}>{l.description_ar}</td></tr>
  ) : (
    <tr>
      <td className="mono">{l.number}</td>
      <td className="desc">
        {l.description_ar}
        {q.show_en_desc && l.description_en && <span className="desc-en">{l.description_en}</span>}
      </td>
      {q.show_unit && <td className="ctr">{l.unit || '—'}</td>}
      {q.show_qty && <td className="num">{fmtQty(l.qty)}</td>}
      {q.show_unit_price && <td className="num">{money(l.unit_price)}</td>}
      {q.show_line_total && <td className="num">{money(lineTotal(l, q.show_qty))}</td>}
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
        <div className="q-meta" key={b.id}>
          <div className="mcell">
            <span className="mk">العميل</span>
            <span className="mv">{q.client_name}</span>
            {q.client_contact && <span className="ms">{q.client_contact}</span>}
          </div>
          <div className="mcell">
            <span className="mk">المرجع وتفاصيل المشروع</span>
            <span className="mv">{q.project_ref || '—'}</span>
            {q.site_location && <span className="ms">{q.site_location}</span>}
          </div>
          <div className="mcell">
            <span className="mk">الرقم المرجعي</span>
            <span className="mv mono">{q.quote_no}</span>
            <span className="ms mono">التاريخ {dateAr(q.quote_date)}</span>
          </div>
          <div className="mcell">
            <span className="mk">صلاحية العرض</span>
            <span className="mv">{q.valid_days} يوماً</span>
            {validUntil && <span className="ms mono">حتى {dateAr(validUntil)}</span>}
          </div>
        </div>
      );
      case 'intro': return <p className="q-intro" key={b.id}>{q.intro_text}</p>;
      case 'sum': return (
        <div className="q-sum" key={b.id}>
          {t.discount > 0 && (
            <div className="srow"><span>الخصم</span>
              <span className="mono">{money(t.discount)} <Riyal /></span></div>
          )}
          <div className="srow"><span>الإجمالي الفرعي</span>
            <span className="mono">{money(t.subtotal)} <Riyal /></span></div>
          {q.vat_mode !== 'none' && (
            <div className="srow">
              <span>ضريبة القيمة المضافة {(Number(q.vat_rate)*100).toFixed(0)}٪
                {q.vat_mode === 'inclusive' ? ' (مضمّنة)' : ''}</span>
              <span className="mono">{money(t.vat)} <Riyal /></span>
            </div>
          )}
          <div className="srow grand">
            <span>{q.vat_mode === 'none' ? 'المجموع' : 'المجموع شامل الضريبة'}</span>
            <span className="mono">{money(t.grand)} <Riyal size={1.1} /></span>
          </div>
          <div className="tafqit-row">{tafqit(t.grand)}</div>
        </div>
      );
      case 'pay': return (
        <div className="q-block pay" key={b.id}>
          <div className="qb-head">الدفعات المقترحة</div>
          <table className="q-pay">
            <thead><tr><th style={{width:'9mm'}}>م</th><th>الدفعة</th>
              <th style={{width:'16mm'}} className="num">النسبة</th>
              <th style={{width:'28mm'}} className="num">المبلغ</th>
              <th>الاستحقاق</th></tr></thead>
            <tbody>
              {pays.map((p,i)=>(
                <tr key={p.id}>
                  <td className="mono">{i+1}</td>
                  <td>{p.label}</td>
                  <td className="num">{Number(p.percent||0)}٪</td>
                  <td className="num">{money((t.grand*Number(p.percent||0))/100)}</td>
                  <td>{p.trigger_note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      case 'terms': return (
        <div className="q-block terms" key={b.id}>
          <div className="qb-head">الشروط والأحكام</div>
          <ol className="q-terms">{terms.map((s,i)=><li key={i}>{s}</li>)}</ol>
        </div>
      );
      case 'closing': return <p className="q-closing" key={b.id}>{q.closing_text}</p>;
      case 'foot': return (
        <div className="q-foot" key={b.id}>
          <div className="q-sign">
            <div className="qs-label">ختم وتوقيع مؤسسة أركان المكان</div>
            <div className="qs-marks">
              {signUrl && pos.sign_x_mm == null &&
                <img className="sign" src={signUrl} alt="" style={{height:`${signMm}mm`}} />}
              {stampUrl && pos.stamp_x_mm == null &&
                <img className="stamp" src={stampUrl} alt="" style={{height:`${stampMm}mm`}} />}
            </div>
          </div>
          {q.show_bank && (
            <div className="q-bank">
              <div className="qb-t">تفاصيل الحساب البنكي</div>
              <div>{cfg.bank_name_full}</div>
              <div className="bank-line">رقم الحساب:{' '}
                <span className="mono acct">{cfg.bank_account_no}</span></div>
              <div className="mono iban">IBAN: {cfg.bank_iban}</div>
            </div>
          )}
        </div>
      );
      default: return null;
    }
  }

  const contentStyle = {
    paddingTop: `${mTop}mm`, paddingBottom: `${mBot}mm`,
    paddingRight: `${mSide}mm`, paddingLeft: `${mSide}mm`,
  };

  return (
    <>
      <div className="qtoolbar no-print">
        <div className="tb-group">
          <button className="primary" onClick={()=>window.print()}>طباعة أو حفظ PDF</button>
          <button onClick={resetPos}>إعادة الختم لموضعه</button>
          {pos.stamp_x_mm == null && stampUrl && (
            <button onClick={()=>setPos({...pos, stamp_x_mm:25, stamp_y_mm:240})}>
              تحرير الختم للسحب
            </button>
          )}
          {pos.sign_x_mm == null && signUrl && (
            <button onClick={()=>setPos({...pos, sign_x_mm:60, sign_y_mm:235})}>
              تحرير التوقيع للسحب
            </button>
          )}
          {saved && <span style={{fontSize:12.5,color:'#1E7A55'}}>{saved}</span>}
        </div>
        <span className="qt-note">
          {pages ? `${pages.length} صفحة` : 'جارٍ التقسيم…'} · الهوامش {mTop}/{mBot}/{mSide} مم
          {!cfg.header_image_path ? ' · لم تُرفع صورة الرأس' : ''}
        </span>
      </div>

      {/* منطقة القياس المخفية */}
      <div className="measure" ref={measureRef} aria-hidden="true"
           style={{ width:`${210 - mSide*2}mm` }}>
        <table className="q-table"><TableHead /><tbody>
          <tr data-block="__thead" style={{visibility:'hidden'}}><td colSpan={cols} /></tr>
        </tbody></table>
        {blocks.map((b) => b.kind === 'row' ? (
          <table className="q-table" key={b.id}><tbody data-block={b.id}>
            <Row l={b.line} />
          </tbody></table>
        ) : (
          <div data-block={b.id} key={b.id}>{renderBlock(b)}</div>
        ))}
      </div>

      <div className="pages" onMouseMove={onMove} onMouseUp={endDrag} onMouseLeave={endDrag}>
        {(pages || []).map((page, pi) => (
          <div className={`sheet ${drag ? 'dragging' : ''}`} key={pi}>
            {headUrl && <img className="lh-head" src={headUrl} alt=""
                             style={{height:`${hMm}mm`}} />}
            {markUrl && <img className="lh-mark" src={markUrl} alt=""
                             style={{top:`${hMm}mm`, height:`${297-hMm-fMm}mm`}} />}
            {footUrl && <img className="lh-foot" src={footUrl} alt=""
                             style={{height:`${fMm}mm`}} />}

            <div className="content" style={contentStyle}>
              {(() => {
                const out = [];
                let i = 0;
                while (i < page.length) {
                  if (page[i].kind === 'row') {
                    const rows = [];
                    while (i < page.length && page[i].kind === 'row') { rows.push(page[i].line); i++; }
                    out.push(
                      <table className="q-table" key={'t'+i}>
                        <TableHead />
                        <tbody>{rows.map((l)=><Row l={l} key={l.id} />)}</tbody>
                      </table>
                    );
                  } else { out.push(renderBlock(page[i])); i++; }
                }
                return out;
              })()}
            </div>

            <div className="pagenum" style={{bottom:`${fMm + 3}mm`}}>
              صفحة {pi+1} من {pages.length}
            </div>

            {stampUrl && pos.stamp_x_mm != null && pi === pages.length - 1 && (
              <img src={stampUrl} alt="ختم" className="float-mark"
                   onMouseDown={startDrag('stamp')}
                   style={{height:`${stampMm}mm`, right:`${pos.stamp_x_mm}mm`,
                           top:`${pos.stamp_y_mm}mm`}} />
            )}
            {signUrl && pos.sign_x_mm != null && pi === pages.length - 1 && (
              <img src={signUrl} alt="توقيع" className="float-mark"
                   onMouseDown={startDrag('sign')}
                   style={{height:`${signMm}mm`, right:`${pos.sign_x_mm}mm`,
                           top:`${pos.sign_y_mm}mm`}} />
            )}
          </div>
        ))}
      </div>
    </>
  );
}
