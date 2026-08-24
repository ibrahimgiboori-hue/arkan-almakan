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
    const { error: saveError } = await supabase
      .from('quotations')
      .update({ [field]: value })
      .eq('id', id);
    if (saveError) {
      setError(saveError.message);
      setBusy('');
      return;
    }
    setQ((previous) => ({ ...previous, [field]: value }));
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
  const visibleCount = [
    visibility.show_client,
    visibility.show_project,
    visibility.show_quote_info,
    visibility.show_validity,
  ].filter(Boolean).length;

  const rules = `
    ${visibility.show_client ? '' : '.q-meta > .mcell:nth-child(1){display:none!important;}'}
    ${visibility.show_project ? '' : '.q-meta > .mcell:nth-child(2){display:none!important;}'}
    ${visibility.show_quote_info ? '' : '.q-meta > .mcell:nth-child(3){display:none!important;}'}
    .q-meta{grid-template-columns:${visibleCount > 0 ? `repeat(${visibleCount},minmax(0,1fr))` : 'none'}!important;}
    ${visibleCount === 0 ? '.q-meta{display:none!important;}' : ''}
  `;

  const labels = [
    ['show_client','العميل'],
    ['show_project','المشروع / المرجع'],
    ['show_quote_info','رقم العرض والتاريخ'],
    ['show_validity','صلاحية العرض'],
  ];

  return (
    <>
      <style>{rules}</style>
      <div className="quote-meta-visibility no-print" dir="rtl">
        <strong>بيانات رأس العرض</strong>
        {labels.map(([field, label]) => (
          <label key={field}>
            <input
              type="checkbox"
              checked={!!visibility[field]}
              disabled={!!busy}
              onChange={(event) => toggle(field, event.target.checked)}
            />
            <span>{label}</span>
          </label>
        ))}
        {error && <span className="quote-meta-error">{error}</span>}
      </div>
      {children}
      <style jsx global>{`
        .quote-meta-visibility{position:sticky;top:0;z-index:60;max-width:210mm;margin:0 auto;padding:7px 10px;background:#fff;border:1px solid #d6cccc;display:flex;align-items:center;gap:12px;flex-wrap:wrap;box-shadow:0 1px 5px rgba(0,0,0,.08);font-size:12px;color:#333}
        .quote-meta-visibility strong{color:#8B3332;margin-left:4px}
        .quote-meta-visibility label{display:flex;align-items:center;gap:5px;cursor:pointer;white-space:nowrap}
        .quote-meta-visibility input{accent-color:#8B3332}
        .quote-meta-error{color:#A32B24}
        @media print{.quote-meta-visibility{display:none!important}}
      `}</style>
    </>
  );
}
