'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { byCode } from '@/lib/doc-templates';
import { EN_TITLES } from '@/lib/doc-titles';
import { tafqit } from '@/lib/tafqit';
import Riyal from '@/components/Riyal';
import { dateAr, money, qty as fmtQty } from '@/lib/format';
import './print.css';

const pub = (p) => p ? supabase.storage.from('brand').getPublicUrl(p).data.publicUrl : null;

export default function PrintDoc() {
  const { id } = useParams();
  const [doc, setDoc] = useState(null);
  const [tpl, setTpl] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [bg, setBg] = useState(true);
  const [stamp, setStamp] = useState(true);
  const [bank, setBank] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const [d, s] = await Promise.all([
        supabase.from('documents').select('*').eq('id', id).maybeSingle(),
        supabase.from('app_settings').select('*').eq('id', 1).maybeSingle(),
      ]);
      if (d.error || !d.data) { setErr('لم يُعثر على هذا المستند، أو لا تملك صلاحية عرضه.'); return; }
      setDoc(d.data); setCfg(s.data);
      setStamp(d.data.show_stamp ?? s.data?.show_stamp_by_default ?? true);

      const { data: t } = await supabase.from('document_templates')
        .select('*').eq('code', d.data.template_code).maybeSingle();
      setTpl(t || null);
      setBank(d.data.show_bank ?? t?.show_bank ?? false);
    })();
  }, [id]);

  if (err) return <div style={{padding:40}} className="msg err">{err}</div>;
  if (!doc || !cfg) return <div style={{padding:40}}>جارٍ التحميل…</div>;

  const custom = tpl?.is_custom && tpl?.layout?.sections?.length;
  const legacy = byCode(doc.template_code);
  const p = doc.payload || {};
  const rows = p._rows || [];

  const lhUrl = bg ? pub(cfg.letterhead_image_path) : null;
  const stampUrl = stamp ? pub(cfg.stamp_image_path) : null;

  const mTop  = doc.margin_top_mm    ?? tpl?.margin_top_mm    ?? cfg.letterhead_top_mm;
  const mBot  = doc.margin_bottom_mm ?? tpl?.margin_bottom_mm ?? cfg.letterhead_bottom_mm;
  const mSide = doc.margin_side_mm   ?? tpl?.margin_side_mm   ?? cfg.letterhead_side_mm;
  const stampMm = doc.stamp_size_mm  ?? cfg.stamp_size_mm ?? 30;

  const title = p.letter_title || tpl?.name_ar || legacy?.name || doc.template_code;
  const signUrl = pub(cfg.signature_image_path);
  const signMm = Number(doc.sign_size_mm ?? cfg.signature_size_mm ?? 20);
  const hasStampSection = !!custom &&
    (tpl.layout.sections || []).some((x) => x.kind === 'stampbox');
  const titleEn = tpl?.title_en || EN_TITLES[doc.template_code] || '';

  const sheetStyle = {
    paddingTop: `${mTop}mm`, paddingBottom: `${mBot}mm`,
    paddingRight: `${mSide}mm`, paddingLeft: `${mSide}mm`,
    backgroundImage: lhUrl ? `url(${lhUrl})` : 'none',
  };

  const fmt = (f, val) => {
    if (val === undefined || val === null || val === '') return '—';
    if (f.type === 'date') return dateAr(val);
    if (f.type === 'money') return <>{money(val)} <Riyal /></>;
    if (f.type === 'number') return fmtQty(val);
    return String(val);
  };

  // ---------- النماذج المدمجة ----------
  const legacyRows = !custom && legacy
    ? legacy.fields
        .filter((f) => p[f.k] !== undefined && p[f.k] !== '' && p[f.k] !== null)
        .map((f) => {
          const m = f.label.includes('ريال');
          let val = p[f.k];
          if (f.type === 'date') val = dateAr(val);
          else if (f.type === 'number' && m) val = money(val);
          return [f.label.replace(' (ريال)',''), String(val), m];
        })
    : [];
  const moneyRows = legacyRows.filter((r) => r[2]);
  const infoRows = legacyRows.filter((r) => !r[2]);
  const half = Math.ceil(infoRows.length / 2);
  const mainKey = ['net_amount','amount','requested_salary','gross','basic_salary','net_due']
    .find((k) => p[k] !== undefined && p[k] !== '' && Number(p[k]) > 0);

  return (
    <>
      <div className="toolbar">
        <div className="tb-group">
          <button className={bg ? 'on' : ''} onClick={()=>setBg(!bg)}>
            {bg ? 'الترويسة ظاهرة' : 'للطباعة على ورق الترويسة'}
          </button>
          <button className={stamp ? 'on' : ''} onClick={()=>setStamp(!stamp)}>
            {stamp ? 'الختم ظاهر' : 'الختم مخفي'}
          </button>
          <button className={bank ? 'on' : ''} onClick={()=>setBank(!bank)}>
            {bank ? 'الحساب البنكي ظاهر' : 'الحساب البنكي مخفي'}
          </button>
        </div>
        <div className="tb-group">
          <span className="tb-warn">
            {!cfg.letterhead_image_path ? 'لم تُرفع صورة الترويسة بعد' : `الهوامش ${mTop}/${mBot}/${mSide} مم`}
          </span>
          <button className="primary" onClick={()=>window.print()}>طباعة أو حفظ PDF</button>
        </div>
      </div>

      <div className="sheet-wrap">
        <div className="sheet" style={sheetStyle}>

          <div className="title-block">
            <h1>{title}</h1>
            {titleEn && <div className="title-en">{titleEn}</div>}
            <span className="title-rule" />
          </div>

          <div className="cards">
            <section className="card-doc">
              <div className="card-head">بيانات المستند</div>
              <table><tbody>
                <tr><td className="k">الرقم المرجعي</td><td className="v mono">{doc.doc_number}</td></tr>
                <tr><td className="k">تاريخ الإصدار</td><td className="v mono">{dateAr(doc.created_at)}</td></tr>
                {!custom && infoRows.slice(half).map(([k,val]) => (
                  <tr key={k}><td className="k">{k}</td><td className="v">{val}</td></tr>
                ))}
              </tbody></table>
            </section>
            {!custom && (
              <section className="card-doc">
                <div className="card-head">البيانات الأساسية</div>
                <table><tbody>
                  {infoRows.slice(0, half).map(([k,val]) => (
                    <tr key={k}><td className="k">{k}</td><td className="v">{val}</td></tr>
                  ))}
                </tbody></table>
              </section>
            )}
          </div>

          {/* ---------- نموذج مخصص ---------- */}
          {custom && tpl.intro_text && <div className="dc-body" style={{marginBottom:'6mm'}}>{tpl.intro_text}</div>}

          {custom && tpl.layout.sections.map((s) => {
            if (s.kind === 'cards' || s.kind === 'totals') {
              const fields = (s.fields || []).filter((f) =>
                p[f.key] !== undefined && p[f.key] !== '' && p[f.key] !== null);
              if (!fields.length) return null;
              if (s.style === 'strict' || s.kind === 'totals') {
                return (
                  <table className="amounts" key={s.id}>
                    <thead><tr><th>{s.title || 'الحساب'}</th><th className="num">القيمة <Riyal /></th></tr></thead>
                    <tbody>
                      {fields.map((f) => (
                        <tr key={f.key}><td>{f.label}</td>
                          <td className="num">{fmt(f, p[f.key])}</td></tr>
                      ))}
                    </tbody>
                  </table>
                );
              }
              return (
                <div className="cards" key={s.id} style={{marginBottom:'6mm'}}>
                  <section className={`card-doc ${s.align === 'left' ? 'to-left' : ''}`}
                           style={{gridColumn: s.align === 'left' ? 'span 6' : 'span 12'}}>
                    <div className="card-head">{s.title}</div>
                    <table><tbody>
                      {fields.map((f) => (
                        <tr key={f.key}><td className="k">{f.label}</td>
                          <td className="v">{fmt(f, p[f.key])}</td></tr>
                      ))}
                    </tbody></table>
                  </section>
                </div>
              );
            }

            if (s.kind === 'table') {
              if (!rows.length) return null;
              return (
                <table className="amounts" key={s.id}>
                  <thead>
                    <tr>
                      <th style={{width:'9mm'}}>م</th>
                      {(s.columns || []).map((c) => (
                        <th key={c.key} className={['money','number'].includes(c.type) ? 'num' : ''}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r._id || i}>
                        <td className="mono">{i+1}</td>
                        {(s.columns || []).map((c) => (
                          <td key={c.key} className={['money','number'].includes(c.type) ? 'num' : ''}>
                            {c.type === 'money' ? money(r[c.key] || 0)
                              : c.type === 'number' ? fmtQty(r[c.key] || 0)
                              : (r[c.key] ?? '—')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            }

            if (s.kind === 'text') {
              if (!p[s.key]) return null;
              if (s.style === 'plain') {
                return <div className="letter-body" key={s.id}>{p[s.key]}</div>;
              }
              return (
                <div className={s.style === 'strict' ? 'declare' : 'card-doc'} key={s.id}
                     style={{marginBottom:'6mm'}}>
                  <div className={s.style === 'strict' ? 'dc-head' : 'card-head'}>{s.title}</div>
                  <div className="dc-body">{p[s.key]}</div>
                </div>
              );
            }

            if (s.kind === 'stampbox') {
              if (!stampUrl && !signUrl) return null;
              return (
                <div className="stampbox-row" key={s.id}>
                  <div className="stampbox">
                    {signUrl && <img className="sb-sign" src={signUrl} alt=""
                                     style={{height:`${signMm}mm`}} />}
                    {stampUrl && <img className="sb-stamp" src={stampUrl} alt=""
                                      style={{height:`${stampMm}mm`}} />}
                  </div>
                </div>
              );
            }

            if (s.kind === 'signatures') {
              return (
                <table className="sigtable" key={s.id}>
                  <thead><tr>{(s.roles||[]).map((x)=><th key={x}>{x}</th>)}</tr></thead>
                  <tbody><tr>{(s.roles||[]).map((x)=><td key={x} />)}</tr></tbody>
                </table>
              );
            }
            return null;
          })}

          {/* ---------- نموذج مدمج ---------- */}
          {!custom && moneyRows.length > 0 && (
            <table className="amounts">
              <thead><tr><th>البيان</th><th className="num">المبلغ <Riyal /></th></tr></thead>
              <tbody>
                {moneyRows.map(([k,val]) => (
                  <tr key={k}><td>{k}</td><td className="num">{val}</td></tr>
                ))}
              </tbody>
            </table>
          )}

          {mainKey && (
            <div className="tafqit">
              <span className="tf-lbl">المبلغ تفقيطاً</span>
              <span className="tf-val">{tafqit(Number(p[mainKey]))}</span>
              <span className="tf-num mono">{money(p[mainKey])} <Riyal /></span>
            </div>
          )}

          {!custom && legacy?.text && p[legacy.text.k] && (
            <div className="declare">
              <div className="dc-head">{legacy.text.label}</div>
              <div className="dc-body">{p[legacy.text.k]}</div>
            </div>
          )}

          {custom && tpl.closing_text && (
            <div className="dc-body" style={{marginBottom:'6mm'}}>{tpl.closing_text}</div>
          )}

          <div className="fill" />

          {!custom && legacy?.signatures?.length > 0 && (
            <table className="sigtable">
              <thead><tr>{legacy.signatures.map((s)=><th key={s}>{s}</th>)}</tr></thead>
              <tbody><tr>{legacy.signatures.map((s)=><td key={s} />)}</tr></tbody>
            </table>
          )}

          <div className="footer-row">
            {stampUrl && !hasStampSection && (
              <div className="stamp-box">
                <img src={stampUrl} alt="ختم الشركة" style={{height:`${stampMm}mm`}} />
              </div>
            )}
            {bank ? (
              <div className="bank">
                <div className="bank-head">تفاصيل الحساب البنكي</div>
                <div className="bank-line">{cfg.bank_name_full}</div>
                <div className="bank-line mono">رقم الحساب: {cfg.bank_account_no}</div>
                <div className="bank-line mono iban">IBAN: {cfg.bank_iban}</div>
              </div>
            ) : (
              <div className="bank">
                <div className="bank-head">{cfg.company_name_ar}</div>
                <div className="bank-line">سجل تجاري {cfg.cr_number}
                  {cfg.vat_number ? ` · رقم ضريبي ${cfg.vat_number}` : ''}</div>
                <div className="bank-line mono">{cfg.phone_1} · {cfg.email}</div>
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
