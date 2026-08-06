'use client';

/* بطاقات الأطراف كما تُطبع: شريط عنوان عنابي + أسطر من عمودين */
export default function PartiesPrint({ parties }) {
  if (!parties || parties.layout === 'none') return null;
  const cards = parties.cards || [];
  if (!cards.length) return null;

  const Card = ({ c }) => {
    const rows = (c.rows || []).filter((r) => (r.k || '').trim() || (r.v || '').trim());
    if (!rows.length && !(c.heading || '').trim()) return null;
    return (
      <div className="pt-card">
        {c.heading && <div className="pt-head">{c.heading}</div>}
        <table className="pt-table">
          <colgroup>
            <col style={{ width: `${c.w1 ?? 34}%` }} />
            <col />
          </colgroup>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="pt-k">{r.k}</td>
                <td className="pt-v">{r.v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  if (parties.layout === 'single') {
    return <div className="pt-wrap single"><Card c={cards[0]} /></div>;
  }

  if (parties.layout === 'double') {
    return (
      <div className="pt-wrap double">
        <Card c={cards[0]} />
        <Card c={cards[1]} />
      </div>
    );
  }

  // رباعية: زوج علوي، نص، زوج سفلي
  return (
    <>
      <div className="pt-wrap double">
        <Card c={cards[0]} />
        <Card c={cards[1]} />
      </div>
      {parties.middle_text && (
        <div className="pt-middle">{parties.middle_text}</div>
      )}
      <div className="pt-wrap double">
        <Card c={cards[2]} />
        <Card c={cards[3]} />
      </div>
    </>
  );
}
