'use client';
import { useState } from 'react';
import PartyCards, { partyGroup } from '@/components/PartyCards';

// ============================================================
//  صفحة تجربة بطاقات الأطراف
//  المسار : /dashboard/cards
// ============================================================

export default function CardsDemo() {
  const [parties, setParties] = useState([
    {
      split: 40,
      midText: '',
      cards: [
        { title: 'الطرف الأول', rows: [
          { label: 'مؤسسة', value: 'أركان المكان للمقاولات' },
          { label: 'السجل التجاري', value: '1009112898' },
          { label: 'يمثلها', value: 'محمد انتصار تركي' },
        ]},
        { title: 'الطرف الثاني', rows: [
          { label: 'شركة', value: '' },
          { label: 'السجل التجاري', value: '' },
          { label: 'يمثلها', value: '' },
        ]},
      ],
    },
  ]);

  return (
    <div style={{ padding: '24px 28px', maxWidth: 900, margin: '0 auto' }} dir="rtl">
      <h1 style={{ fontSize: 19, fontWeight: 600, color: '#8B3332', marginBottom: 4 }}>
        بطاقات الأطراف
      </h1>
      <p style={{ fontSize: 13, color: '#666', marginBottom: 20 }}>
        اكتب داخل أي خانة مباشرة. جرّب الأشكال الثلاثة، وفي الرباعية يظهر نص بين الزوجين.
      </p>

      <PartyCards value={parties} onChange={setParties} />

      <details style={{ marginTop: 28, fontSize: 12.5, color: '#777' }}>
        <summary style={{ cursor: 'pointer' }}>ما الذي سيُحفظ في قاعدة البيانات</summary>
        <pre style={{
          background: '#faf8f8', border: '1px solid #eee', borderRadius: 6,
          padding: 12, overflow: 'auto', direction: 'ltr', textAlign: 'left',
          fontSize: 11.5, marginTop: 8,
        }}>
{JSON.stringify(parties, null, 2)}
        </pre>
      </details>
    </div>
  );
}
