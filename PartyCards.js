'use client';
import { useState } from 'react';

// ============================================================
//  بطاقة الأطراف — عنصر مشترك للخطابات والعقود
//  البنية : شريط علوي بعمود واحد + أسطر من عمودين نصّها حر
//  الأشكال : مفردة (١) — مزدوجة (٢ متجاورتان) — رباعية (٤ في صفّين)
//  في الرباعية : نص حر بين الزوج العلوي والزوج السفلي
// ============================================================

const MAROON = '#8B3332';
const LINE = 'rgba(139,51,50,.28)';

const chunk = (arr, n) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

const DEFAULT_TITLES = ['الطرف الأول', 'الطرف الثاني', 'الشاهد الأول', 'الشاهد الثاني'];

export const emptyCard = (title = '') => ({ title, rows: [{ label: '', value: '' }] });

// شكل جاهز : count = 1 أو 2 أو 4
export const partyGroup = (count = 2, titles = DEFAULT_TITLES) => ({
  split: 40,
  midText: '',   // النص بين الزوج العلوي والسفلي — في الشكل الرباعي فقط
  cards: Array.from({ length: count }, (_, i) => emptyCard(titles[i] || '')),
});

export default function PartyCards({ value, onChange, editable = true }) {
  const groups = value?.length ? value : [partyGroup(2)];
  const [hover, setHover] = useState(null);

  const emit = (next) => onChange && onChange(next);
  const patch = (gi, fn) =>
    emit(groups.map((g, i) => (i === gi ? fn(structuredClone(g)) : g)));

  const setCell = (gi, ci, ri, key, v) =>
    patch(gi, (g) => { g.cards[ci].rows[ri][key] = v; return g; });

  const setTitle = (gi, ci, v) =>
    patch(gi, (g) => { g.cards[ci].title = v; return g; });

  const addRow = (gi) =>
    patch(gi, (g) => { g.cards.forEach((c) => c.rows.push({ label:'', value:'' })); return g; });

  const delRow = (gi, ri) =>
    patch(gi, (g) => {
      g.cards.forEach((c) => { if (c.rows.length > 1) c.rows.splice(ri, 1); });
      return g;
    });

  const setSplit = (gi, v) => patch(gi, (g) => { g.split = Number(v); return g; });

  const setMid = (gi, v) => patch(gi, (g) => { g.midText = v; return g; });

  // تغيير الشكل مع الحفاظ على ما كُتب داخل البطاقات القائمة
  const setCount = (gi, n) =>
    patch(gi, (g) => {
      const rowCount = g.cards[0]?.rows.length || 1;
      while (g.cards.length > n) g.cards.pop();
      while (g.cards.length < n) {
        const c = emptyCard(DEFAULT_TITLES[g.cards.length] || '');
        c.rows = Array.from({ length: rowCount }, () => ({ label:'', value:'' }));
        g.cards.push(c);
      }
      return g;
    });

  const addGroup = () => emit([...groups, partyGroup(2, ['', ''])]);
  const delGroup = (gi) => emit(groups.filter((_, i) => i !== gi));

  return (
    <div className="party-cards" dir="rtl">
      {groups.map((g, gi) => (
        <div key={gi} style={{ marginBottom: 16 }}>

          {editable && (
            <div className="pc-tools no-print">
              <span className="pc-lbl">الشكل</span>
              {[1, 2, 4].map((n) => (
                <button key={n} type="button"
                        className={g.cards.length === n ? 'on' : ''}
                        onClick={() => setCount(gi, n)}>
                  {n === 1 ? 'مفردة' : n === 2 ? 'مزدوجة' : 'رباعية'}
                </button>
              ))}
              <span className="pc-sep" />
              <span className="pc-lbl">عرض العمود الأول</span>
              <input type="range" min="20" max="70" step="5"
                     value={g.split ?? 40}
                     onChange={(e) => setSplit(gi, e.target.value)} />
              <span className="pc-lbl">{g.split ?? 40}%</span>
              <span className="pc-sep" />
              <button type="button" onClick={() => addRow(gi)}>إضافة سطر</button>
              {gi > 0 && <button type="button" onClick={() => delGroup(gi)}>حذف المجموعة</button>}
            </div>
          )}

          {chunk(g.cards, g.cards.length === 1 ? 1 : 2).map((pairCards, pi) => (
          <div key={pi}>
          {pi === 1 && (
            <Editable
              value={g.midText || ''} editable={editable}
              onInput={(v) => setMid(gi, v)}
              style={{
                textAlign: 'center', fontSize: 13, lineHeight: 1.9,
                color: '#333', padding: '10px 6px', margin: '2px 0',
              }}
            />
          )}
          <div style={{
            display: 'grid',
            gridTemplateColumns: g.cards.length === 1 ? '1fr' : '1fr 1fr',
            gap: 14,
            marginBottom: 0,
          }}>
            {pairCards.map((c) => {
              const ci = g.cards.indexOf(c);
              return (
              <div key={ci} style={{
                border: `1px solid ${LINE}`,
                borderRadius: 6,
                overflow: 'hidden',
                background: '#fff',
                breakInside: 'avoid',
              }}>
                <Editable
                  value={c.title} editable={editable}
                  onInput={(v) => setTitle(gi, ci, v)}
                  style={{
                    background: MAROON, color: '#fff', textAlign: 'center',
                    padding: '8px 10px', fontSize: 13.5, fontWeight: 500,
                  }}
                />
                {c.rows.map((r, ri) => (
                  <div key={ri}
                       onMouseEnter={() => setHover(`${gi}-${ri}`)}
                       onMouseLeave={() => setHover(null)}
                       style={{
                         display: 'grid',
                         gridTemplateColumns: `${g.split ?? 40}% 1fr`,
                         borderTop: `1px solid ${LINE}`,
                         position: 'relative',
                       }}>
                    <Editable
                      value={r.label} editable={editable}
                      onInput={(v) => setCell(gi, ci, ri, 'label', v)}
                      style={{ borderInlineEnd: `1px solid ${LINE}`, fontWeight: 500 }}
                    />
                    <Editable
                      value={r.value} editable={editable}
                      onInput={(v) => setCell(gi, ci, ri, 'value', v)}
                    />
                    {editable && ci === 0 && hover === `${gi}-${ri}` && c.rows.length > 1 && (
                      <button type="button" className="pc-del no-print" title="حذف السطر"
                              onClick={() => delRow(gi, ri)}>×</button>
                    )}
                  </div>
                ))}
              </div>
              );
            })}
          </div>
          </div>
          ))}
        </div>
      ))}

      {editable && (
        <button type="button" className="no-print pc-add" onClick={addGroup}>
          + مجموعة بطاقات أخرى
        </button>
      )}

      <style jsx>{`
        .pc-tools {
          display: flex; align-items: center; gap: 7px;
          flex-wrap: wrap; margin-bottom: 8px;
        }
        .pc-lbl { font-size: 12.5px; color: #666; }
        .pc-sep { width: 1px; height: 16px; background: #e2e2e2; }
        .pc-tools button {
          font-size: 12.5px; padding: 3px 11px; cursor: pointer;
          border: 1px solid #ccc; border-radius: 5px; background: #fff; color: #444;
        }
        .pc-tools button:hover { background: #faf7f7; border-color: ${MAROON}; }
        .pc-tools button.on {
          background: ${MAROON}; border-color: ${MAROON}; color: #fff;
        }
        .pc-del {
          position: absolute; inset-inline-start: -26px; top: 50%;
          transform: translateY(-50%);
          width: 20px; height: 20px; line-height: 1;
          border: 1px solid #ddd; border-radius: 50%;
          background: #fff; color: #b00; cursor: pointer; font-size: 13px;
        }
        .pc-add {
          font-size: 12.5px; padding: 5px 12px; cursor: pointer;
          border: 1px dashed ${LINE}; border-radius: 5px;
          background: transparent; color: ${MAROON};
        }
        @media print { .no-print { display: none !important; } }
      `}</style>
    </div>
  );
}

function Editable({ value, onInput, editable, style }) {
  return (
    <div
      contentEditable={editable}
      suppressContentEditableWarning
      onBlur={(e) => onInput && onInput(e.currentTarget.textContent)}
      style={{
        padding: '7px 10px', fontSize: 13.5, lineHeight: 1.6,
        outline: 'none', minHeight: 20, whiteSpace: 'pre-wrap',
        wordBreak: 'break-word', ...style,
      }}
    >
      {value}
    </div>
  );
}
