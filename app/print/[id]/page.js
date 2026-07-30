'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { byCode } from '@/lib/doc-templates';
import { EN_TITLES } from '@/lib/doc-titles';
import { tafqit } from '@/lib/tafqit';
import { dateAr, money } from '@/lib/format';
import './print.css';

const pub = (path) =>
  path ? supabase.storage.from('brand').getPublicUrl(path).data.publicUrl : null;

export default function PrintDoc() {
  const { id } = useParams();
  const [doc, setDoc] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [bg, setBg] = useState(true);      // خلفية الترويسة
  const [stamp, setStamp] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const [d, s] = await Promise.all([
        supabase.from('documents').select('*').eq('id', id).maybeSingle(),
        supabase.from('app_settings').select('*').eq('id', 1).maybeSingle(),
      ]);
      if (d.error || !d.data) { setErr('لم يُعثر على هذا المستند، أو لا تملك صلاحية عرضه.'); return; }
      setDoc(d.data); setCfg(s.data);
      setStamp(s.data?.show_stamp_by_default !== false);
    })();
  }, [id]);

  if (err) return <div style={{padding:40}} className="msg err">{err}</div>;
  if (!doc || !cfg) return <div style={{padding:40}}>جارٍ التحميل…</div>;

  const tpl = byCode(doc.template_code);
  const p = doc.payload || {};
  const lhUrl = pub(cfg.letterhead_image_path);
  const stampUrl = pub(cfg.stamp_image_path);

  const isMoney = (f) => f.label.includes('ريال');
  const present = (tpl?.fields || []).filter(
    (f) => p[f.k] !== undefined && p[f.k] !== '' && p[f.k] !== null);

  const moneyFields = present.filter(isMoney);
  const infoFields  = present.filter((f) => !isMoney(f));
  const half = Math.ceil(infoFields.length / 2);
  const colA = infoFields.slice(0, half);
  const colB = infoFields.slice(half);

  const show = (f) => {
    const v = p[f.k];
    if (f.type === 'date') return dateAr(v);
    if (f.type === 'number' && isMoney(f)) return money(v) + ' ر.س';
    return String(v);
  };

  // المبلغ الرئيسي للتفقيط
  const mainKey = ['net_amount','amount','requested_salary','gross','basic_salary']
    .find((k) => p[k] !== undefined && p[k] !== '' && Number(p[k]) > 0);
  const mainAmount = mainKey ? Number(p[mainKey]) : null;

  const sheetStyle = {
    paddingTop: `${cfg.letterhead_top_mm}mm`,
    paddingBottom: `${cfg.letterhead_bottom_mm}mm`,
    paddingRight: `${cfg.letterhead_side_mm}mm`,
    paddingLeft: `${cfg.letterhead_side_mm}mm`,
    backgroundImage: bg && lhUrl ? `url(${lhUrl})` : 'none',
  };

  return (
    <>
      <div className="toolbar">
        <div className="tb-group">
          <button className={bg ? 'on' : ''} onClick={()=>setBg(true)}>نسخة رقمية بالترويسة</button>
          <button className={!bg ? 'on' : ''} onClick={()=>setBg(false)}>للطباعة على ورق الترويسة</button>
          <button className={stamp ? 'on' : ''} onClick={()=>setStamp(!stamp)}>
            {stamp ? 'الختم ظاهر' : 'الختم مخفي'}
          </button>
        </div>
        <div className="tb-group">
          {!lhUrl && <span className="tb-warn">لم تُرفع صورة الترويسة بعد — ارفعها من بيانات الشركة</span>}
          <button className="primary" onClick={()=>window.print()}>طباعة أو حفظ PDF</button>
        </div>
      </div>

      <div className="sheet-wrap">
        <div className="sheet" style={sheetStyle}>

          <div className="title-block">
            <h1>{tpl?.name || doc.template_code}</h1>
            <div className="title-en">{EN_TITLES[doc.template_code] || ''}</div>
            <span className="title-rule" />
          </div>

          <div className="cards">
            <section className="card-doc">
              <div className="card-head">بيانات المستند</div>
              <table>
                <tbody>
                  <tr><td className="k">الرقم المرجعي</td><td className="v mono">{doc.doc_number}</td></tr>
                  <tr><td className="k">تاريخ الإصدار</td><td className="v mono">{dateAr(doc.created_at)}</td></tr>
                  {colB.map((f) => (
                    <tr key={f.k}><td className="k">{f.label}</td><td className="v">{show(f)}</td></tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="card-doc">
              <div className="card-head">البيانات الأساسية</div>
              <table>
                <tbody>
                  {colA.map((f) => (
                    <tr key={f.k}><td className="k">{f.label}</td><td className="v">{show(f)}</td></tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          {moneyFields.length > 0 && (
            <table className="amounts">
              <thead>
                <tr><th>البيان</th><th className="num">المبلغ (ريال)</th></tr>
              </thead>
              <tbody>
                {moneyFields.map((f) => (
                  <tr key={f.k}>
                    <td>{f.label.replace(' (ريال)','')}</td>
                    <td className="num">{money(p[f.k])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {mainAmount !== null && (
            <div className="tafqit">
              <span className="tf-lbl">المبلغ تفقيطاً</span>
              <span className="tf-val">{tafqit(mainAmount)}</span>
              <span className="tf-num mono">{money(mainAmount)} ر.س</span>
            </div>
          )}

          {tpl?.text && p[tpl.text.k] && (
            <div className="declare">
              <div className="dc-head">{tpl.text.label}</div>
              <div className="dc-body">{p[tpl.text.k]}</div>
            </div>
          )}

          <div className="fill" />

          {tpl?.signatures?.length > 0 && (
            <table className="sigtable">
              <thead>
                <tr>{tpl.signatures.map((s) => <th key={s}>{s}</th>)}</tr>
              </thead>
              <tbody>
                <tr>{tpl.signatures.map((s) => <td key={s}>الاسم والتوقيع</td>)}</tr>
              </tbody>
            </table>
          )}

          <div className="footer-row">
            <div className="stamp-box">
              {stamp && stampUrl
                ? <img src={stampUrl} alt="ختم الشركة" />
                : <span className="stamp-ph">ختم وتوقيع الشركة</span>}
            </div>
            <div className="bank">
              <div className="bank-head">تفاصيل الحساب البنكي</div>
              <div className="bank-line">{cfg.bank_name_full}</div>
              <div className="bank-line mono">رقم الحساب: {cfg.bank_account_no}</div>
              <div className="bank-line mono iban">IBAN: {cfg.bank_iban}</div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
