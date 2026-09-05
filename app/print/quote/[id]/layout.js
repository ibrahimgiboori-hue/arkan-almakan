'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function QuotePrintLayout({ children }) {
  const { id } = useParams();
  const [q, setQ] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error: loadError } = await supabase
        .from('quotations')
        .select('id,language,show_client,show_project,show_quote_info,show_validity')
        .eq('id', id)
        .maybeSingle();
      if (!active) return;
      if (loadError) setError(loadError.message);
      else setQ(data);
    })();
    return () => { active = false; };
  }, [id]);

  async function toggle(field, value) {
    if (!q || busy) return;
    setBusy(field);
    setError('');
    const fields = field === 'language'
      ? { language:value, show_en_desc:value === 'en' }
      : { [field]:value };
    const { error: saveError } = await supabase.from('quotations').update(fields).eq('id', id);
    if (saveError) {
      setError(saveError.message);
      setBusy('');
      return;
    }
    setQ((previous) => ({ ...previous, ...fields }));
    window.location.reload();
  }

  if (!q && !error) return <div style={{ padding:40 }}>جارٍ تجهيز المعاينة…</div>;

  const visibility = q || {
    show_client:true,
    show_project:true,
    show_quote_info:true,
    show_validity:false,
    language:'ar',
  };
  const visibleCount = [visibility.show_client,visibility.show_project,visibility.show_quote_info,visibility.show_validity].filter(Boolean).length;
  const rules = `
    ${visibility.show_client ? '' : '.print-doc-quotation .q-meta > .mcell:nth-child(1){display:none!important;}'}
    ${visibility.show_project ? '' : '.print-doc-quotation .q-meta > .mcell:nth-child(2){display:none!important;}'}
    ${visibility.show_quote_info ? '' : '.print-doc-quotation .q-meta > .mcell:nth-child(3){display:none!important;}'}
    .print-doc-quotation .q-meta{grid-template-columns:${visibleCount > 0 ? `repeat(${visibleCount},minmax(0,1fr))` : 'none'}!important;}
    ${visibleCount === 0 ? '.print-doc-quotation .q-meta{display:none!important;}' : ''}
  `;

  const labels = [
    ['show_client','العميل'],
    ['show_project','المشروع / المرجع'],
    ['show_quote_info','رقم العرض والتاريخ'],
    ['show_validity','صلاحية العرض'],
  ];
  const isEn = visibility.language === 'en';

  return (
    <>
      <style>{rules}</style>
      <div className="quote-meta-visibility no-print" dir="rtl">
        <strong>إعداد الطباعة</strong>
        <div className="quote-print-language" role="group" aria-label="لغة المستند">
          <button type="button" className={!isEn ? 'active' : ''} disabled={!!busy} onClick={()=>toggle('language','ar')}>العربية</button>
          <button type="button" className={isEn ? 'active' : ''} disabled={!!busy} onClick={()=>toggle('language','en')}>English</button>
        </div>
        <span className="quote-print-direction">{isEn ? 'LTR ←' : 'RTL →'}</span>
        <span className="quote-print-divider" />
        {labels.map(([field, label]) => (
          <label key={field}>
            <input type="checkbox" checked={!!visibility[field]} disabled={!!busy} onChange={(event) => toggle(field, event.target.checked)} />
            <span>{label}</span>
          </label>
        ))}
        {error && <span className="quote-meta-error">{error}</span>}
      </div>
      {children}
      <style jsx global>{`
        .quote-meta-visibility{position:sticky;top:0;z-index:60;max-width:210mm;margin:0 auto;padding:7px 10px;background:#fff;border:1px solid #d6cccc;display:flex;align-items:center;gap:10px;flex-wrap:wrap;box-shadow:0 1px 5px rgba(0,0,0,.08);font-size:12px;color:#333}
        .quote-meta-visibility strong{color:#8B3332;margin-left:4px}.quote-meta-visibility label{display:flex;align-items:center;gap:5px;cursor:pointer;white-space:nowrap}.quote-meta-visibility input{accent-color:#8B3332}.quote-meta-error{color:#A32B24}
        .quote-print-language{display:inline-flex;border:1px solid #bdaaaa;border-radius:7px;overflow:hidden}.quote-print-language button{font:inherit;font-size:11.5px;border:0;border-left:1px solid #d5c7c7;background:#fff;color:#443b3b;padding:4px 8px;cursor:pointer}.quote-print-language button:last-child{border-left:0}.quote-print-language button.active{background:#8B3332;color:#fff;font-weight:800}.quote-print-language button:disabled{opacity:.55;cursor:wait}.quote-print-direction{font:700 10.5px ui-monospace,monospace;background:#f2eeee;padding:3px 6px;border-radius:5px}.quote-print-divider{width:1px;height:20px;background:#ddd}
        .print-doc-quotation .q-table .desc{white-space:pre-line}
        @media print{.quote-meta-visibility{display:none!important}}
      `}</style>
    </>
  );
}
