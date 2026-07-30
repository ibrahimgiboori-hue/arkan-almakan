'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { byCode } from '@/lib/doc-templates';
import { dateAr, money } from '@/lib/format';
import './print.css';

export default function PrintDoc() {
  const { id } = useParams();
  const [doc, setDoc] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [mode, setMode] = useState('digital'); // digital | letterhead
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const [d, s] = await Promise.all([
        supabase.from('documents').select('*').eq('id', id).maybeSingle(),
        supabase.from('app_settings').select('*').eq('id', 1).maybeSingle(),
      ]);
      if (d.error || !d.data) { setErr('لم يُعثر على هذا المستند، أو لا تملك صلاحية عرضه.'); return; }
      setDoc(d.data); setCfg(s.data);
    })();
  }, [id]);

  if (err) return <div style={{padding:40}} className="msg err">{err}</div>;
  if (!doc || !cfg) return <div style={{padding:40}}>جارٍ التحميل…</div>;

  const tpl = byCode(doc.template_code);
  const p = doc.payload || {};
  const isMoney = (label) => label.includes('ريال');

  const rows = (tpl?.fields || [])
    .filter((f) => p[f.k] !== undefined && p[f.k] !== '' && p[f.k] !== null)
    .map((f) => {
      let val = p[f.k];
      if (f.type === 'date') val = dateAr(val);
      else if (f.type === 'number' && isMoney(f.label)) val = money(val);
      return [f.label.replace(' (ريال)', ''), String(val), isMoney(f.label)];
    });

  const style = mode === 'letterhead'
    ? { paddingTop: `${cfg.letterhead_top_mm}mm`, paddingBottom: `${cfg.letterhead_bottom_mm}mm`,
        paddingRight: `${cfg.letterhead_side_mm}mm`, paddingLeft: `${cfg.letterhead_side_mm}mm` }
    : { paddingTop: '18mm', paddingBottom: '18mm', paddingRight: '20mm', paddingLeft: '20mm' };

  return (
    <>
      <div className="toolbar">
        <div className="tb-group">
          <button className={mode==='digital' ? 'on' : ''} onClick={()=>setMode('digital')}>
            نسخة رقمية للإرسال
          </button>
          <button className={mode==='letterhead' ? 'on' : ''} onClick={()=>setMode('letterhead')}>
            للطباعة على ورق الترويسة
          </button>
        </div>
        <div className="tb-group">
          <span className="tb-note">
            {mode === 'digital'
              ? 'الترويسة مرسومة رقمياً — تُطبع على ورق أبيض أو تُرسل كما هي'
              : `هوامش محسوبة: أعلى ${cfg.letterhead_top_mm} مم وأسفل ${cfg.letterhead_bottom_mm} مم`}
          </span>
          <button className="primary" onClick={()=>window.print()}>طباعة أو حفظ PDF</button>
        </div>
      </div>

      <div className="sheet-wrap">
        <div className="sheet" style={style}>

          {mode === 'digital' && (
            <header className="lh">
              <div className="lh-right">
                <div className="lh-ar">{cfg.company_name_ar}</div>
                <div className="lh-en">{cfg.company_name_en}</div>
                <div className="lh-cr">سجل تجاري {cfg.cr_number}{cfg.vat_number ? ` · رقم ضريبي ${cfg.vat_number}` : ''}</div>
              </div>
              <div className="lh-left">
                <div className="skyline-p"><i/><i/><i/><i/><i/><i/></div>
              </div>
            </header>
          )}

          <div className="docmeta">
            <table>
              <tbody>
                <tr>
                  <td className="lbl">رقم المستند</td>
                  <td className="val mono">{doc.doc_number}</td>
                  <td className="lbl">التاريخ</td>
                  <td className="val mono">{dateAr(doc.created_at)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h1 className="doctitle">{tpl?.name || doc.template_code}</h1>

          <table className="datatable">
            <thead>
              <tr><th style={{width:'42%'}}>البيان</th><th>التفصيل</th></tr>
            </thead>
            <tbody>
              {rows.map(([k, val, m]) => (
                <tr key={k}>
                  <td className="k">{k}</td>
                  <td className={m ? 'v num' : 'v'}>{val}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {tpl?.text && p[tpl.text.k] && (
            <div className="textblock">
              <div className="tb-title">{tpl.text.label}</div>
              <div className="tb-body">{p[tpl.text.k]}</div>
            </div>
          )}

          {tpl?.signatures?.length > 0 && (
            <table className="sigtable">
              <thead>
                <tr>{tpl.signatures.map((s) => <th key={s}>{s}</th>)}</tr>
              </thead>
              <tbody>
                <tr>{tpl.signatures.map((s) => <td key={s}>الاسم والتوقيع</td>)}</tr>
                <tr>{tpl.signatures.map((s) => <td key={s} className="datecell">التاريخ</td>)}</tr>
              </tbody>
            </table>
          )}

          {mode === 'digital' && (
            <footer className="lf">
              <span>{cfg.phone_1} · {cfg.phone_2}</span>
              <span>{cfg.email} · {cfg.website}</span>
              <span>{cfg.city} — المملكة العربية السعودية</span>
            </footer>
          )}

        </div>
      </div>
    </>
  );
}
