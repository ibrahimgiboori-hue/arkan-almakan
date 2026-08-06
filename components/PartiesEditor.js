'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const LAYOUTS = {
  none:   'بلا بطاقات',
  single: 'بطاقة مفردة',
  double: 'بطاقتان متجاورتان',
  quad:   'أربع بطاقات (طرفان وشاهدان)',
};

const emptyCard = (heading = 'الطرف') => ({
  heading, w1: 34,
  rows: [{ k:'الاسم', v:'' }, { k:'الصفة', v:'' }],
});

export default function PartiesEditor({ value, onChange, disabled }) {
  const [p, setP] = useState(value || { layout:'none', middle_text:'', cards:[] });

  useEffect(() => { setP(value || { layout:'none', middle_text:'', cards:[] }); }, [value]);

  function push(next) { setP(next); onChange?.(next); }

  async function setLayout(layout) {
    if (layout === 'none') { push({ layout, middle_text:'', cards:[] }); return; }
    const need = layout === 'single' ? 1 : layout === 'double' ? 2 : 4;
    const names = ['الطرف الأول','الطرف الثاني','الشاهد الأول','الشاهد الثاني'];
    const cards = [...(p.cards || [])];
    while (cards.length < need) cards.push(emptyCard(names[cards.length]));
    push({ ...p, layout, cards: cards.slice(0, need) });
  }

  async function fillArkan(i) {
    const { data, error } = await supabase.rpc('arkan_party_card');
    if (error || !data) return;
    const cards = [...p.cards];
    cards[i] = { ...data, heading: cards[i]?.heading || data.heading };
    push({ ...p, cards });
  }

  const upCard = (i, fields) => {
    const cards = [...p.cards];
    cards[i] = { ...cards[i], ...fields };
    push({ ...p, cards });
  };

  const upRow = (ci, ri, fields) => {
    const cards = [...p.cards];
    const rows = [...cards[ci].rows];
    rows[ri] = { ...rows[ri], ...fields };
    cards[ci] = { ...cards[ci], rows };
    push({ ...p, cards });
  };

  const addRow = (ci) => {
    const cards = [...p.cards];
    cards[ci] = { ...cards[ci], rows: [...cards[ci].rows, { k:'', v:'' }] };
    push({ ...p, cards });
  };

  const delRow = (ci, ri) => {
    const cards = [...p.cards];
    cards[ci] = { ...cards[ci], rows: cards[ci].rows.filter((_,i)=>i!==ri) };
    push({ ...p, cards });
  };

  const moveRow = (ci, ri, dir) => {
    const cards = [...p.cards];
    const rows = [...cards[ci].rows];
    const j = ri + dir;
    if (j < 0 || j >= rows.length) return;
    [rows[ri], rows[j]] = [rows[j], rows[ri]];
    cards[ci] = { ...cards[ci], rows };
    push({ ...p, cards });
  };

  const isQuad = p.layout === 'quad';

  return (
    <div className="pe">
      <div className="pe-top">
        <label>شكل البطاقات</label>
        <select value={p.layout} disabled={disabled}
                onChange={(e)=>setLayout(e.target.value)}>
          {Object.entries(LAYOUTS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </select>
        <span className="hint">
          {p.layout === 'quad' ? 'الزوج العلوي طرفان والسفلي شاهدان، وبينهما نص'
            : p.layout === 'double' ? 'بطاقتان متجاورتان — لكل عقد طرفان'
            : p.layout === 'single' ? 'بطاقة واحدة أسفل يسار الصفحة' : ''}
        </span>
      </div>

      {p.layout !== 'none' && (
        <div className={`pe-grid ${p.layout}`}>
          {(p.cards || []).map((c, ci) => (
            <div className="pe-card" key={ci}>
              <div className="pe-head">
                <input value={c.heading || ''} disabled={disabled}
                       placeholder="عنوان البطاقة"
                       onChange={(e)=>upCard(ci, { heading:e.target.value })} />
                {!disabled && (
                  <button type="button" className="mini" onClick={()=>fillArkan(ci)}
                          title="تعبئة ببيانات أركان">أركان</button>
                )}
              </div>

              <div className="pe-w">
                <label>عرض عمود التسمية</label>
                <input type="number" min="15" max="60" dir="ltr" disabled={disabled}
                       value={c.w1 ?? 34}
                       onChange={(e)=>upCard(ci, { w1: Number(e.target.value || 34) })} />
                <span>%</span>
              </div>

              {(c.rows || []).map((r, ri) => (
                <div className="pe-row" key={ri}>
                  <input className="k" value={r.k || ''} disabled={disabled}
                         placeholder="التسمية"
                         style={{ flexBasis: `${c.w1 ?? 34}%` }}
                         onChange={(e)=>upRow(ci, ri, { k:e.target.value })} />
                  <input className="v" value={r.v || ''} disabled={disabled}
                         placeholder="القيمة"
                         onChange={(e)=>upRow(ci, ri, { v:e.target.value })} />
                  {!disabled && (
                    <span className="pe-btns">
                      <button type="button" onClick={()=>moveRow(ci,ri,-1)}>▲</button>
                      <button type="button" onClick={()=>moveRow(ci,ri,1)}>▼</button>
                      <button type="button" className="x" onClick={()=>delRow(ci,ri)}>×</button>
                    </span>
                  )}
                </div>
              ))}

              {!disabled && (
                <button type="button" className="pe-add" onClick={()=>addRow(ci)}>
                  + سطر
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {isQuad && (
        <div className="pe-middle">
          <label>النص بين الزوج العلوي والسفلي</label>
          <textarea rows="3" value={p.middle_text || ''} disabled={disabled}
                    placeholder="حُرِّرت هذه الاتفاقية من نسختين بيد كل طرف نسخة للعمل بموجبها…"
                    onChange={(e)=>push({ ...p, middle_text:e.target.value })} />
        </div>
      )}
    </div>
  );
}
