'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { TEMPLATES } from '@/lib/doc-templates';
import { dateAr } from '@/lib/format';

export default function Documents() {
  const [docs, setDocs] = useState(null);

  useEffect(() => {
    supabase.from('documents')
      .select('id, doc_number, template_code, subject, created_at')
      .order('created_at', { ascending: false })
      .limit(60)
      .then(({ data }) => setDocs(data || []));
  }, []);

  const nameOf = (code) => TEMPLATES.find((t) => t.code === code)?.name || code;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>النماذج والمستندات</h1>
          <p>اختر نموذجاً لتعبئته — يُرقَّم تلقائياً ويُحفظ في الأرشيف</p>
        </div>
      </div>

      <div className="section" style={{marginTop:0}}>
        <header><h2>نماذج الموارد البشرية</h2></header>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(215px,1fr))',gap:1,background:'var(--hair)'}}>
          {TEMPLATES.map((t) => (
            <Link key={t.code} href={`/dashboard/documents/new/${t.code}`}
                  style={{background:'#fff',padding:'15px 16px',display:'block'}}>
              <div style={{fontSize:15,color:'#7C2B28',fontWeight:500}}>{t.name}</div>
              <div className="mono" style={{fontSize:11.5,color:'#B98C8E',marginTop:3}}>{t.prefix}</div>
            </Link>
          ))}
        </div>
      </div>

      <div className="section">
        <header><h2>الأرشيف</h2></header>
        {!docs ? <div className="empty">جارٍ التحميل…</div>
         : docs.length === 0 ? (
          <div className="empty">
            <h3>الأرشيف فارغ</h3>
            <p>أصدر أول مستند من النماذج أعلاه وسيظهر هنا برقمه وتاريخه.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>الرقم</th><th>النموذج</th><th>الموضوع</th><th>التاريخ</th><th>طباعة</th></tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td className="mono">{d.doc_number}</td>
                  <td>{nameOf(d.template_code)}</td>
                  <td>{d.subject || '—'}</td>
                  <td className="mono">{dateAr(d.created_at)}</td>
                  <td><Link href={`/print/${d.id}`} target="_blank">فتح للطباعة</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
