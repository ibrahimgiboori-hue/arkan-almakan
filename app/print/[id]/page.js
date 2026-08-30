'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { byCode } from '@/lib/doc-templates';
import { EN_TITLES } from '@/lib/doc-titles';
import { tafqit } from '@/lib/tafqit';
import Riyal from '@/components/Riyal';
import { dateAr, money, qty as fmtQty } from '@/lib/format';
import PartiesPrint from '@/components/PartiesPrint';
import ConstitutionPrintFrame from '@/components/print/ConstitutionPrintFrame';
import OfficeTemplateSections from '@/components/print/OfficeTemplateSections';
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

  const custom = !!tpl?.layout?.sections?.length;
  const legacy = byCode(doc.template_code);
  const p = doc.payload || {};
  const rows = p._rows || [];
  const stampUrl = stamp ? pub(cfg.stamp_image_path) : null;

  // هذه قيم مفضلة للقالب/المستند فقط. القبطان يطبق الحد الآمن النهائي
  // للهوامش عند وجود الليترهيد ولا يسمح للقالب باختراقه.
  const mTop  = doc.margin_top_mm    ?? tpl?.margin_top_mm    ?? cfg.letterhead_top_mm;
  const mBot  = doc.margin_bottom_mm ?? tpl?.margin_bottom_mm ?? cfg.letterhead_bottom_mm;
  const mSide = doc.margin_side_mm   ?? tpl?.margin_side_mm   ?? cfg.letterhead_side_mm;
  const stampMm = doc.stamp_size_mm  ?? cfg.stamp_size_mm ?? 30;

  const title = p.letter_title || tpl?.name_ar || legacy?.name || doc.template_code;
  const signUrl = pub(cfg.signature_image_path);
  const signMm = Number(doc.sign_size_mm ?? cfg.signature_size_mm ?? 20);
  const hasStampSection = !!custom &&
    (tpl.layout.sections || []).some((x) => x.kind === 'stampbox');
  const hasLetterHead = !!custom &&
    (tpl.layout.sections || []).some((x) => x.kind === 'letterhead');
  const titleEn = tpl?.title_en || EN_TITLES[doc.template_code] || '';
  const hasBrandPaper = Boolean(
    cfg.letterhead_image_path || cfg.header_image_path || cfg.footer_image_path,
  );

  const fmt = (f, val) => {
    if (val === undefined || val === null || val === '') return '—';
    if (f.type === 'date') return dateAr(val);
    if (f.type === 'money') return <>{money(val)} <Riyal /></>;
    if (f.type === 'number') return fmtQty(val);
    return String(val);
  };

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

  const documentMetadata = !hasLetterHead ? {
    title:'بيانات المستند',
    span:4,
    fields:[
      { key:'reference', label:'الرقم المرجعي', value:doc.doc_number, span:48, type:'text' },
      { key:'issued_at', label:'تاريخ الإصدار', value:dateAr(doc.created_at), span:48, type:'date' },
    ],
  } : null;

  return (
    <>
      <div className="toolbar no-print">
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
            {!hasBrandPaper
              ? 'لم تُرفع صورة الترويسة بعد'
              : 'القبطان يفرض حدود الليترهيد الآمنة على كل صفحة'}
          </span>
          <button className="primary" onClick={()=>window.print()}>طباعة أو حفظ PDF</button>
        </div>
      </div>

      <ConstitutionPrintFrame
        documentKey="generic_document"
        cfg={cfg}
        showLetterhead={bg}
        contentTopMm={mTop}
        contentBottomMm={mBot}
        contentSideMm={mSide}
      >
        <div className="sheet governed-document-sheet">

          {!hasLetterHead && (
            <div className="title-block">
              <h1>{title}</h1>
              {titleEn && <div className="title-en">{titleEn}</div>}
              <span className="title-rule" />
            </div>
          )}

          {!custom && (
            <div className="cards">
              <section className="card-doc">
                <div className="card-head">بيانات المستند</div>
                <table><tbody>
                  <tr><td className="k">الرقم المرجعي</td><td className="v mono">{doc.doc_number}</td></tr>
                  <tr><td className="k">تاريخ الإصدار</td><td className="v mono">{dateAr(doc.created_at)}</td></tr>
                  {infoRows.slice(half).map(([k,val]) => (
                    <tr key={k}><td className="k">{k}</td><td className="v">{val}</td></tr>
                  ))}
                </tbody></table>
              </section>
              <section className="card-doc">
                <div className="card-head">البيانات الأساسية</div>
                <table><tbody>
                  {infoRows.slice(0, half).map(([k,val]) => (
                    <tr key={k}><td className="k">{k}</td><td className="v">{val}</td></tr>
                  ))}
                </tbody></table>
              </section>
            </div>
          )}

          {hasLetterHead && (
            <div className="ltr-meta">
              <span className="mono">{doc.doc_number}</span>
              <span className="mono">{dateAr(doc.created_at)}</span>
            </div>
          )}

          {custom && tpl.intro_text && <div className="print-prose" style={{marginBottom:'3mm'}}>{tpl.intro_text}</div>}

          {custom && (
            <OfficeTemplateSections
              sections={tpl.layout.sections || []}
              payload={p}
              rows={rows}
              renderValue={fmt}
              parties={doc.parties}
              stampUrl={stampUrl}
              signUrl={signUrl}
              stampMm={stampMm}
              signMm={signMm}
              documentMetadata={documentMetadata}
            />
          )}

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

          {custom && doc.parties && doc.parties.layout && doc.parties.layout !== 'none'
            && !(tpl.layout.sections || []).some((x)=>x.kind === 'parties') && (
            <PartiesPrint parties={doc.parties} />
          )}

          {custom && tpl.closing_text && (
            <div className="print-prose" style={{marginTop:'3mm'}}>{tpl.closing_text}</div>
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
            {bank && (cfg.bank_name_full || cfg.bank_account_no || cfg.bank_iban) ? (
              <div className="bank">
                <div className="bank-head">تفاصيل الحساب البنكي</div>
                {cfg.bank_name_full && <div className="bank-line">{cfg.bank_name_full}</div>}
                {cfg.bank_account_no && (
                  <div className="bank-line">رقم الحساب:{' '}
                    <span className="mono acct">{cfg.bank_account_no}</span></div>
                )}
                {cfg.bank_iban && (
                  <div className="bank-line mono iban">IBAN: {cfg.bank_iban}</div>
                )}
              </div>
            ) : !hasBrandPaper ? (() => {
              const lines = [];
              if (cfg.cr_number) lines.push(`سجل تجاري ${cfg.cr_number}`);
              if (cfg.vat_number) lines.push(`رقم ضريبي ${cfg.vat_number}`);
              const contact = [cfg.phone_1, cfg.email].filter(Boolean).join(' · ');
              if (!lines.length && !contact) return null;
              return (
                <div className="bank">
                  <div className="bank-head">{cfg.company_name_ar}</div>
                  {lines.length > 0 && <div className="bank-line">{lines.join(' · ')}</div>}
                  {contact && <div className="bank-line mono">{contact}</div>}
                </div>
              );
            })() : null}
          </div>

        </div>
      </ConstitutionPrintFrame>
    </>
  );
}