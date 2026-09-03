'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { byCode } from '@/lib/doc-templates';
import { EN_TITLES } from '@/lib/doc-titles';
import { tafqit } from '@/lib/tafqit';
import Riyal from '@/components/Riyal';
import { dateAr, money, qty as fmtQty } from '@/lib/format';
import { PRINT_FLOW_KIND } from '@/lib/print-governance';
import PartiesPrint from '@/components/PartiesPrint';
import ConstitutionPrintFrame from '@/components/print/ConstitutionPrintFrame';
import { PrintMark } from '@/components/print/PrintMarks';
import ProjectReportJourneyPrint from '@/components/print/ProjectReportJourneyPrint';
import './print.css';

const PROJECT_REPORT_PROFILE = 'project_work_claims_report';
const PROJECT_REPORT_GENERATED_SECTIONS = new Set(['executive_summary','intro','handover','conclusion']);
const clampBlankRows = (value) => Math.max(1, Math.min(20, Number(value) || 5));
const clampBlankStatusRows = (value) => Math.max(1, Math.min(8, Number(value) || 4));

function BlankLine({ kind = 'text', wide = false }) {
  return <span className={`blank-write-line blank-${kind} ${wide ? 'wide' : ''}`.trim()} aria-hidden="true" />;
}

function BlankWritingLines({ lines = 3 }) {
  return (
    <span className="blank-writing-lines" aria-hidden="true">
      {Array.from({ length:lines }, (_, index) => <span key={index} />)}
    </span>
  );
}

export default function PrintDoc() {
  const { id } = useParams();
  const [doc, setDoc] = useState(null);
  const [tpl, setTpl] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [stamp, setStamp] = useState(true);
  const [bank, setBank] = useState(false);
  const [blankForm, setBlankForm] = useState(false);
  const [blankRows, setBlankRows] = useState(5);
  const [blankStatusRows, setBlankStatusRows] = useState(4);
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
  const sourceRows = p._rows || [];
  const hasRepeatableSection = !!custom && (tpl.layout.sections || []).some((section) => section.kind === 'table');
  const rows = blankForm && hasRepeatableSection
    ? Array.from({ length:clampBlankRows(blankRows) }, (_, index) => ({ _id:`blank-${index + 1}`, _blank:true }))
    : sourceRows;
  const isProjectWorkClaimsReport = tpl?.layout?.profile === PROJECT_REPORT_PROFILE;
  const title = blankForm
    ? (tpl?.name_ar || legacy?.name || doc.template_code)
    : (p.letter_title || tpl?.name_ar || legacy?.name || doc.template_code);
  const hasStampSection = !!custom && (tpl.layout.sections || []).some((x) => x.kind === 'stampbox');
  const hasLetterHead = !!custom && (tpl.layout.sections || []).some((x) => x.kind === 'letterhead');
  const titleEn = tpl?.title_en || EN_TITLES[doc.template_code] || '';

  const fmt = (f, val) => {
    if (blankForm) return <BlankLine kind={f?.type || 'text'} />;
    if (val === undefined || val === null || val === '') return '—';
    if (f.type === 'date') return dateAr(val);
    if (f.type === 'money') return <>{money(val)} <Riyal /></>;
    if (f.type === 'number') return fmtQty(val);
    return String(val);
  };

  const legacyRows = !custom && legacy
    ? legacy.fields
        .filter((f) => blankForm || (p[f.k] !== undefined && p[f.k] !== '' && p[f.k] !== null))
        .map((f) => {
          const m = f.label.includes('ريال');
          let val = p[f.k];
          if (blankForm) val = <BlankLine kind={f.type || (m ? 'money' : 'text')} />;
          else if (f.type === 'date') val = dateAr(val);
          else if (f.type === 'number' && m) val = money(val);
          else val = String(val);
          return [f.label.replace(' (ريال)',''), val, m];
        })
    : [];
  const moneyRows = legacyRows.filter((r) => r[2]);
  const infoRows = legacyRows.filter((r) => !r[2]);
  const half = Math.ceil(infoRows.length / 2);
  const mainCandidates = ['net_amount','amount','requested_salary','gross','basic_salary','net_due'];
  const mainKey = blankForm
    ? mainCandidates.find((k) => legacy?.fields?.some((f) => f.k === k))
    : mainCandidates.find((k) => p[k] !== undefined && p[k] !== '' && Number(p[k]) > 0);

  return (
    <>
      <div className="toolbar no-print">
        <div className="tb-group">
          <button className={stamp ? 'on' : ''} onClick={()=>setStamp(!stamp)} disabled={blankForm}>
            {blankForm ? 'الختم لا يظهر في النموذج الفارغ' : stamp ? 'الختم ظاهر' : 'الختم مخفي'}
          </button>
          <button className={bank ? 'on' : ''} onClick={()=>setBank(!bank)}>
            {bank ? 'الحساب البنكي ظاهر' : 'الحساب البنكي مخفي'}
          </button>
          <button className={blankForm ? 'on' : ''} onClick={()=>setBlankForm((value)=>!value)}>
            {blankForm ? 'العودة للمستند المعبأ' : 'طباعة نموذج فارغ'}
          </button>
          {blankForm && hasRepeatableSection && (
            <label className="blank-row-control">
              <span>عدد البنود / الصفوف</span>
              <input type="number" min="1" max="20" value={blankRows}
                onChange={(event)=>setBlankRows(clampBlankRows(event.target.value))} />
            </label>
          )}
          {blankForm && isProjectWorkClaimsReport && (
            <label className="blank-row-control">
              <span>أسطر المتابعة لكل بند</span>
              <input type="number" min="1" max="8" value={blankStatusRows}
                onChange={(event)=>setBlankStatusRows(clampBlankStatusRows(event.target.value))} />
            </label>
          )}
        </div>
        <div className="tb-group">
          <span className="tb-warn">
            {blankForm
              ? 'نموذج ورقي فارغ — نفس القالب ونفس قواعد الطباعة'
              : 'اتجاه الورقة ومصدر الليترهيد ومناطق الأمان تُضبط من القبطان للطباعة'}
          </span>
          <button className="primary" onClick={()=>window.print()}>
            {blankForm ? 'طباعة النموذج الفارغ' : 'طباعة أو حفظ PDF'}
          </button>
        </div>
      </div>

      <ConstitutionPrintFrame
        documentKey="generic_document"
        cfg={cfg}
        className={blankForm ? 'blank-form-mode' : ''}
      >
        <div className="governed-document-sheet">
          {!hasLetterHead && (
            <div className="title-block" data-print-keep-with-next="true">
              <h1>{title}</h1>
              {titleEn && <div className="title-en">{titleEn}</div>}
              <span className="title-rule" />
            </div>
          )}

          <div className="cards" style={hasLetterHead ? {display:'none'} : undefined}>
            <section className="card-doc">
              <div className="card-head">بيانات المستند</div>
              <table><tbody>
                <tr><td className="k">الرقم المرجعي</td><td className="v mono">{blankForm ? <BlankLine /> : doc.doc_number}</td></tr>
                <tr><td className="k">تاريخ الإصدار</td><td className="v mono">{blankForm ? <BlankLine kind="date" /> : dateAr(doc.created_at)}</td></tr>
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

          {hasLetterHead && (
            <div className="ltr-meta">
              <span className="mono">{blankForm ? <BlankLine /> : doc.doc_number}</span>
              <span className="mono">{blankForm ? <BlankLine kind="date" /> : dateAr(doc.created_at)}</span>
            </div>
          )}

          {custom && tpl.intro_text && <div className="dc-body" style={{marginBottom:'6mm'}}>{tpl.intro_text}</div>}

          {custom && tpl.layout.sections.map((s) => {
            if (isProjectWorkClaimsReport && PROJECT_REPORT_GENERATED_SECTIONS.has(s.id)) return null;

            if (s.kind === 'cards' || s.kind === 'totals') {
              const fields = blankForm
                ? (s.fields || [])
                : (s.fields || []).filter((f) => p[f.key] !== undefined && p[f.key] !== '' && p[f.key] !== null);
              if (!fields.length) return null;
              const isMoneyBlock = s.kind === 'totals' || s.money === true;

              if (isMoneyBlock) {
                return (
                  <table className="amounts" key={s.id} data-print-flow={PRINT_FLOW_KIND.REPEATABLE_TABLE}>
                    <thead><tr><th>{s.title || 'الحساب'}</th><th className="num">القيمة <Riyal /></th></tr></thead>
                    <tbody>{fields.map((f) => (
                      <tr key={f.key}><td>{f.label}</td><td className="num">{fmt(f, p[f.key])}</td></tr>
                    ))}</tbody>
                  </table>
                );
              }

              if (s.style === 'strict') {
                const heading = blankForm ? s.title : (p[s.title_key] || s.title);
                return (
                  <div className={`plain-card ${s.align === 'left' ? 'to-left' : ''}`} key={s.id}>
                    {heading && <div className="pc-head">{heading}</div>}
                    <table className="pc-table"><tbody>{fields.map((f) => (
                      <tr key={f.key}><td className="pc-k">{f.label}</td><td className="pc-v">{fmt(f, p[f.key])}</td></tr>
                    ))}</tbody></table>
                  </div>
                );
              }

              return (
                <div className="cards" key={s.id} style={{marginBottom:'6mm'}}>
                  <section className={`card-doc ${s.align === 'left' ? 'to-left' : ''}`}
                           style={{gridColumn: s.align === 'left' ? 'span 6' : 'span 12'}}>
                    <div className="card-head">{s.title}</div>
                    <table><tbody>{fields.map((f) => (
                      <tr key={f.key}><td className="k">{f.label}</td><td className="v">{fmt(f, p[f.key])}</td></tr>
                    ))}</tbody></table>
                  </section>
                </div>
              );
            }

            if (s.kind === 'table') {
              if (!rows.length) return null;
              if (isProjectWorkClaimsReport && s.id === 'work_lines') {
                return <ProjectReportJourneyPrint key={s.id} rows={rows} payload={p} blankForm={blankForm} blankStatusRows={blankStatusRows} />;
              }
              const columns = s.columns || [];
              const spanTotal = columns.reduce((sum, column) => sum + Number(column.span || 1), 0) || 1;
              return (
                <table className="amounts" key={s.id} data-print-flow={PRINT_FLOW_KIND.REPEATABLE_TABLE}>
                  <colgroup>
                    <col style={{width:'7mm'}} />
                    {columns.map((column) => (
                      <col key={column.key} style={{width:`${(Number(column.span || 1) / spanTotal) * 92}%`}} />
                    ))}
                  </colgroup>
                  <thead><tr><th className="serial-col">م</th>{columns.map((c) => (
                    <th key={c.key} className={['money','number'].includes(c.type) ? 'num nowrap' : c.type === 'date' ? 'nowrap' : ''}>{c.label}</th>
                  ))}</tr></thead>
                  <tbody>{rows.map((r, i) => (
                    <tr key={r._id || i}>
                      <td className="mono">{i+1}</td>
                      {columns.map((c) => (
                        <td key={c.key} className={['money','number'].includes(c.type) ? 'num nowrap' : c.type === 'date' ? 'nowrap' : ''}>{fmt(c, r[c.key])}</td>
                      ))}
                    </tr>
                  ))}</tbody>
                </table>
              );
            }

            if (s.kind === 'text') {
              if (!blankForm && !p[s.key]) return null;
              if (s.style === 'plain') return <div className="letter-body" key={s.id}>{blankForm ? <BlankWritingLines lines={5} /> : p[s.key]}</div>;
              return (
                <div className={s.style === 'strict' ? 'declare' : 'card-doc'} key={s.id} style={{marginBottom:'6mm'}}>
                  <div className={s.style === 'strict' ? 'dc-head' : 'card-head'}>{s.title}</div>
                  <div className="dc-body">{blankForm ? <BlankWritingLines lines={4} /> : p[s.key]}</div>
                </div>
              );
            }

            if (s.kind === 'letterhead') {
              if (blankForm) {
                return (
                  <div className="ltr-head blank-letterhead-fields" key={s.id}>
                    <div className="ltr-refs"><span>إشارتنا: <BlankLine /></span><span>إشارتكم: <BlankLine /></span></div>
                    <div className="blank-letter-field"><strong>الموضوع:</strong><BlankLine wide /></div>
                    <div className="blank-letter-field"><strong>إلى:</strong><BlankLine wide /></div>
                    <div className="blank-letter-field"><strong>الصفة:</strong><BlankLine wide /></div>
                    <div className="blank-letter-field"><strong>التحية:</strong><BlankLine wide /></div>
                  </div>
                );
              }
              const hasRef = p.our_ref || p.your_ref;
              return (
                <div className="ltr-head" key={s.id}>
                  {hasRef && <div className="ltr-refs">
                    {p.our_ref && <span>إشارتنا: <span className="mono">{p.our_ref}</span></span>}
                    {p.your_ref && <span>إشارتكم: <span className="mono">{p.your_ref}</span></span>}
                  </div>}
                  {p.letter_title && <h2 className="ltr-subject">{p.letter_title}</h2>}
                  {(p.addressee || p.addressee_title) && (
                    <div className="ltr-to"><span className="to-name">{p.addressee}</span><span className="to-title">{p.addressee_title}</span></div>
                  )}
                  {p.salutation && <div className="ltr-salut">{p.salutation}</div>}
                </div>
              );
            }

            if (s.kind === 'parties') return <PartiesPrint parties={doc.parties} blank={blankForm} key={s.id} />;

            if (s.kind === 'stampbox') {
              if (blankForm) return null;
              return (
                <div className="stampbox-row" key={s.id}>
                  <div className="stampbox">
                    <PrintMark cfg={cfg} kind="signature" mode="inline" />
                    <PrintMark cfg={cfg} kind="stamp" show={stamp} mode="inline" />
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

          {!custom && moneyRows.length > 0 && (
            <table className="amounts" data-print-flow={PRINT_FLOW_KIND.REPEATABLE_TABLE}>
              <thead><tr><th>البيان</th><th className="num">المبلغ <Riyal /></th></tr></thead>
              <tbody>{moneyRows.map(([k,val]) => <tr key={k}><td>{k}</td><td className="num">{val}</td></tr>)}</tbody>
            </table>
          )}

          {mainKey && (
            <div className="tafqit">
              <span className="tf-lbl">المبلغ تفقيطاً</span>
              <span className="tf-val">{blankForm ? <BlankLine wide /> : tafqit(Number(p[mainKey]))}</span>
              <span className="tf-num mono">{blankForm ? <BlankLine kind="money" /> : <>{money(p[mainKey])} <Riyal /></>}</span>
            </div>
          )}

          {!custom && legacy?.text && (blankForm || p[legacy.text.k]) && (
            <div className="declare">
              <div className="dc-head">{legacy.text.label}</div>
              <div className="dc-body">{blankForm ? <BlankWritingLines lines={5} /> : p[legacy.text.k]}</div>
            </div>
          )}

          {custom && doc.parties && doc.parties.layout && doc.parties.layout !== 'none'
            && !(tpl.layout.sections || []).some((x)=>x.kind === 'parties') && (
            <PartiesPrint parties={doc.parties} blank={blankForm} />
          )}

          {custom && tpl.closing_text && <div className="dc-body" style={{marginBottom:'6mm'}}>{tpl.closing_text}</div>}

          <div className="fill" />

          {!custom && legacy?.signatures?.length > 0 && (
            <table className="sigtable">
              <thead><tr>{legacy.signatures.map((s)=><th key={s}>{s}</th>)}</tr></thead>
              <tbody><tr>{legacy.signatures.map((s)=><td key={s} />)}</tr></tbody>
            </table>
          )}

          <div className="footer-row">
            {!blankForm && stamp && !hasStampSection && (
              <div className="stamp-box"><PrintMark cfg={cfg} kind="stamp" mode="inline" /></div>
            )}
            {!blankForm && bank && (cfg.bank_name_full || cfg.bank_account_no || cfg.bank_iban) ? (
              <div className="bank">
                <div className="bank-head">تفاصيل الحساب البنكي</div>
                {cfg.bank_name_full && <div className="bank-line">{cfg.bank_name_full}</div>}
                {cfg.bank_account_no && <div className="bank-line">رقم الحساب: <span className="mono acct">{cfg.bank_account_no}</span></div>}
                {cfg.bank_iban && <div className="bank-line mono iban">IBAN: {cfg.bank_iban}</div>}
              </div>
            ) : (() => {
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
            })()}
          </div>
        </div>
      </ConstitutionPrintFrame>
    </>
  );
}
