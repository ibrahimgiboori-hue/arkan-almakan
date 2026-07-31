'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { money, dateAr, qty as fmtQty } from '@/lib/format';
import { tafqit } from '@/lib/tafqit';
import Riyal from '@/components/Riyal';
import { numberLines, lineTotal, titleSubtotals, totals } from '@/lib/quote-calc';
import './quote-print.css';

const pub = (p) => p ? supabase.storage.from('brand').getPublicUrl(p).data.publicUrl : null;

export default function QuotePrint() {
  const { id } = useParams();
  const [q, setQ] = useState(null);
  const [lines, setLines] = useState([]);
  const [pays, setPays] = useState([]);
  const [cfg, setCfg] = useState(null);
  const [drag, setDrag] = useState(null);        // 'stamp' | 'sign'
  const [pos, setPos] = useState({});
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState('');

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
      setPos({
        stamp_x_mm: a.data.stamp_x_mm, stamp_y_mm: a.data.stamp_y_mm,
        sign_x_mm: a.data.sign_x_mm, sign_y_mm: a.data.sign_y_mm,
      });
    })();
  }, [id]);

  const MM = 3.7795275591;   // مليمتر → بكسل عند 96 نقطة/بوصة

  function startDrag(kind) {
    return (e) => {
      e.preventDefault();
      const sheet = document.querySelector('.qsheet');
      const rect = sheet.getBoundingClientRect();
      setDrag({ kind, rect });
    };
  }

  function onMove(e) {
    if (!drag) return;
    const xPx = drag.rect.right - e.clientX;    // من الحافة اليمنى
    const yPx = e.clientY - drag.rect.top;
    const x = Math.max(0, Math.round(xPx / MM));
    const y = Math.max(0, Math.round(yPx / MM));
    setPos((p) => drag.kind === 'stamp'
      ? { ...p, stamp_x_mm: x, stamp_y_mm: y }
      : { ...p, sign_x_mm: x, sign_y_mm: y });
  }

  async function endDrag() {
    if (!drag) return;
    const kind = drag.kind;
    setDrag(null);
    const fields = kind === 'stamp'
      ? { stamp_x_mm: pos.stamp_x_mm, stamp_y_mm: pos.stamp_y_mm }
      : { sign_x_mm: pos.sign_x_mm, sign_y_mm: pos.sign_y_mm };
    const { error } = await supabase.from('quotations').update(fields).eq('id', id);
    if (error) setErr('تعذّر حفظ الموضع: ' + error.message);
    else { setSaved('حُفظ موضع ' + (kind === 'stamp' ? 'الختم' : 'التوقيع'));
           setTimeout(()=>setSaved(''), 1500); }
  }

  async function resetPos() {
    setPos({});
    await supabase.from('quotations').update({
      stamp_x_mm: null, stamp_y_mm: null, sign_x_mm: null, sign_y_mm: null,
    }).eq('id', id);
    setSaved('أُعيد الموضع الافتراضي'); setTimeout(()=>setSaved(''), 1500);
  }

  if (err) return <div style={{padding:40}} className="msg err">{err}</div>;
  if (!q || !cfg) return <div style={{padding:40}}>جارٍ التحميل…</div>;

  const numbered = numberLines(lines);
  const subs = titleSubtotals(lines, q.show_qty);
  const t = totals(q, lines);
  const headUrl = q.show_letterhead ? pub(cfg.header_image_path) : null;
  const footUrl = q.show_letterhead ? pub(cfg.footer_image_path) : null;
  const markUrl = q.show_letterhead ? pub(cfg.watermark_image_path) : null;
  const hMm = Number(cfg.header_height_mm || 40);
  const fMm = Number(cfg.footer_height_mm || 32);
  const stampUrl = q.show_stamp ? pub(cfg.stamp_image_path) : null;
  const signUrl = q.show_signature ? pub(cfg.signature_image_path) : null;
  const terms = (q.terms_text || '').split('\n').map((s)=>s.trim()).filter(Boolean);
  const title = q.title_override || (q.doc_kind === 'boq' ? 'جدول كميات' : 'عرض سعر');
  const validUntil = q.quote_date
    ? new Date(new Date(q.quote_date).getTime() + q.valid_days*86400000) : null;

  const mTop  = q.margin_top_mm    ?? cfg.letterhead_top_mm;
  const mBot  = q.margin_bottom_mm ?? cfg.letterhead_bottom_mm;
  const mSide = q.margin_side_mm   ?? cfg.letterhead_side_mm;
  const stampMm = q.stamp_size_mm  ?? cfg.stamp_size_mm ?? 30;
  const signMm  = cfg.signature_size_mm ?? 20;

  const cols = 1 + 1 + (q.show_unit?1:0) + (q.show_qty?1:0)
             + (q.show_unit_price?1:0) + (q.show_line_total?1:0);

  return (
    <>
      <div className="qtoolbar">
        <div className="tb-group">
          <button onClick={resetPos}>إعادة الختم لموضعه الافتراضي</button>
          {saved && <span style={{fontSize:12.5,color:'var(--ok)'}}>{saved}</span>}
        </div>
        <span className="qt-note">
          اسحب الختم أو التوقيع بالفأرة لتضعه حيث شئت — الهوامش {mTop}/{mBot}/{mSide} مم
          {!cfg.header_image_path ? ' · لم تُرفع صورة الرأس بعد' : ''}
          {(q.margin_top_mm ?? q.margin_bottom_mm ?? q.margin_side_mm) !== null
            && q.margin_top_mm !== undefined ? ' (تجاوز خاص بهذا المستند)' : ''}
        </span>
        <button onClick={()=>window.print()}>طباعة أو حفظ PDF</button>
      </div>

      <div className={`qsheet ${drag ? 'dragging' : ''}`}
           onMouseMove={onMove} onMouseUp={endDrag} onMouseLeave={endDrag}
           style={markUrl ? {
             backgroundImage: `url(${markUrl})`,
             backgroundRepeat: 'repeat-y',
             backgroundSize: `210mm ${297 - hMm - fMm}mm`,
             backgroundPosition: `center ${hMm}mm`,
           } : undefined}>
        <table className="page-frame">
          <thead>
            <tr><td className="frame-top" style={{height:`${mTop}mm`}}>
              {headUrl && <img className="lh-head" src={headUrl} alt=""
                               style={{height:`${hMm}mm`}} />}
            </td></tr>
          </thead>
          <tfoot>
            <tr><td className="frame-bottom" style={{height:`${mBot}mm`}}>
              {footUrl && <img className="lh-foot" src={footUrl} alt=""
                               style={{height:`${fMm}mm`}} />}
            </td></tr>
          </tfoot>
          <tbody>
            <tr><td className="frame-body" style={{padding:`0 ${mSide}mm`}}>

              <div className="q-title">
                <h1>{title}</h1>
                <span className="rule" />
              </div>

              <div className="q-meta">
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

              {q.show_intro && q.intro_text && (
                <p className="q-intro">{q.intro_text}</p>
              )}

              <table className="q-table">
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
                <tbody>
                  {numbered.map((l) => l.kind === 'title' ? (
                    <tr key={l.id} className="trow">
                      <td className="mono">{l.number}</td>
                      <td colSpan={cols - 2 - (q.show_line_total?1:0)}>{l.description_ar}</td>
                      {q.show_line_total && <td className="num">{money(subs[l.id] || 0)}</td>}
                    </tr>
                  ) : l.kind === 'note' ? (
                    <tr key={l.id} className="nrow">
                      <td />
                      <td colSpan={cols - 2}>{l.description_ar}</td>
                    </tr>
                  ) : (
                    <tr key={l.id}>
                      <td className="mono">{l.number}</td>
                      <td className="desc">
                        {l.description_ar}
                        {q.show_en_desc && l.description_en && (
                          <span className="desc-en">{l.description_en}</span>
                        )}
                      </td>
                      {q.show_unit && <td className="ctr">{l.unit || '—'}</td>}
                      {q.show_qty && <td className="num">{fmtQty(l.qty)}</td>}
                      {q.show_unit_price && <td className="num">{money(l.unit_price)}</td>}
                      {q.show_line_total && <td className="num">{money(lineTotal(l, q.show_qty))}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="q-sum">
                {t.discount > 0 && (
                  <div className="srow"><span>الخصم</span><span className="mono">{money(t.discount)} <Riyal /></span></div>
                )}
                <div className="srow"><span>الإجمالي الفرعي</span><span className="mono">{money(t.subtotal)} <Riyal /></span></div>
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

              {q.show_payments && pays.length > 0 && (
                <div className="q-block pay">
                  <div className="qb-head">الدفعات المقترحة</div>
                  <table className="q-pay">
                    <thead>
                      <tr><th style={{width:'9mm'}}>م</th><th>الدفعة</th>
                          <th style={{width:'16mm'}} className="num">النسبة</th>
                          <th style={{width:'26mm'}} className="num">المبلغ</th>
                          <th>الاستحقاق</th></tr>
                    </thead>
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
              )}

              {q.show_terms && terms.length > 0 && (
                <div className="q-block terms">
                  <div className="qb-head">الشروط والأحكام</div>
                  <ol className="q-terms">
                    {terms.map((s,i)=><li key={i}>{s}</li>)}
                  </ol>
                </div>
              )}

              {q.show_closing && q.closing_text && (
                <p className="q-closing">{q.closing_text}</p>
              )}

              <div className="q-foot">
                <div className="q-sign">
                  <div className="qs-label">ختم وتوقيع مؤسسة أركان المكان</div>
                  <div className="qs-marks">
                    {signUrl && pos.sign_x_mm == null && (
                      <img className="sign" src={signUrl} alt="" style={{height:`${signMm}mm`}} />
                    )}
                    {stampUrl && pos.stamp_x_mm == null && (
                      <img className="stamp" src={stampUrl} alt="" style={{height:`${stampMm}mm`}} />
                    )}
                  </div>
                </div>
                {q.show_bank && (
                  <div className="q-bank">
                    <div className="qb-t">تفاصيل الحساب البنكي</div>
                    <div>{cfg.bank_name_full}</div>
                    <div className="mono">رقم الحساب: {cfg.bank_account_no}</div>
                    <div className="mono iban">IBAN: {cfg.bank_iban}</div>
                  </div>
                )}
              </div>

            </td></tr>
          </tbody>
        </table>

        {stampUrl && pos.stamp_x_mm != null && (
          <img src={stampUrl} alt="ختم" className="float-mark"
               onMouseDown={startDrag('stamp')}
               style={{ height:`${stampMm}mm`,
                        right:`${pos.stamp_x_mm}mm`, top:`${pos.stamp_y_mm}mm` }} />
        )}
        {signUrl && pos.sign_x_mm != null && (
          <img src={signUrl} alt="توقيع" className="float-mark"
               onMouseDown={startDrag('sign')}
               style={{ height:`${signMm}mm`,
                        right:`${pos.sign_x_mm}mm`, top:`${pos.sign_y_mm}mm` }} />
        )}

        {(stampUrl || signUrl) && (
          <div className="mark-hint no-print">
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
          </div>
        )}
      </div>
    </>
  );
}
