'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * علامة استفهام تفتح دليل العملية.
 * الاستعمال:  <HelpButton k="item.assign" />
 * والدليل نفسه يُحرَّر من جدول help_guides في قاعدة البيانات.
 */
export default function HelpButton({ k, label }) {
  const [open, setOpen] = useState(false);
  const [g, setG] = useState(null);
  const [loading, setLoading] = useState(false);

  async function show() {
    setOpen(true);
    if (g || loading) return;
    setLoading(true);
    const { data } = await supabase
      .from('help_guides').select('*').eq('key', k).eq('is_active', true).maybeSingle();
    setG(data || { missing: true });
    setLoading(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        title={label || 'كيف تتم هذه العملية؟'}
        style={{
          width: 20, height: 20, lineHeight: '18px', padding: 0,
          borderRadius: '50%', border: '1px solid var(--hair)',
          background: 'transparent', color: 'var(--ink-soft)',
          fontSize: 12, cursor: 'pointer', marginInlineStart: 6,
        }}
      >؟</button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)',
            zIndex: 90, display: 'flex', justifyContent: 'flex-start',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(440px, 92vw)', height: '100%', overflowY: 'auto',
              background: 'var(--paper, #fff)', boxShadow: '0 0 24px rgba(0,0,0,.2)',
              padding: '20px 22px', textAlign: 'right',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h2 style={{ margin: 0, fontSize: 17 }}>{g?.title_ar || 'الدليل'}</h2>
              <button className="btn ghost" style={{ padding: '2px 9px' }}
                      onClick={() => setOpen(false)}>إغلاق</button>
            </div>

            {loading && <p style={{ color: 'var(--ink-soft)' }}>جارٍ التحميل…</p>}

            {g?.missing && (
              <p style={{ color: 'var(--ink-soft)', fontSize: 13.5 }}>
                لا يوجد دليل مكتوب لهذه العملية بعد.
              </p>
            )}

            {g && !g.missing && (
              <>
                {g.intro_ar && (
                  <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', marginTop: 10 }}>
                    {g.intro_ar}
                  </p>
                )}

                <Section title="ميدانياً — قبل أن تلمس البرنامج" steps={g.field_steps} />
                <Section title="في البرنامج" steps={g.system_steps} ordered />

                {g.warning_ar && (
                  <div style={{
                    marginTop: 18, padding: '10px 12px', fontSize: 13,
                    border: '1px solid var(--bad)', borderRadius: 6, color: 'var(--bad)',
                  }}>
                    {g.warning_ar}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Section({ title, steps, ordered }) {
  const list = Array.isArray(steps) ? steps : [];
  if (!list.length) return null;
  const List = ordered ? 'ol' : 'ul';
  return (
    <div style={{ marginTop: 18 }}>
      <h3 style={{ fontSize: 13.5, margin: '0 0 6px', color: 'var(--maroon)' }}>{title}</h3>
      <List style={{ margin: 0, paddingInlineStart: 20, fontSize: 13.5, lineHeight: 1.85 }}>
        {list.map((s, i) => <li key={i}>{s}</li>)}
      </List>
    </div>
  );
}
