'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { dateAr, money } from '@/lib/format';
import { QSTATUS_AR } from '@/lib/quote-calc';

export default function Quotes() {
  const router = useRouter();
  const [rows, setRows] = useState(null);
  const [tot, setTot] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function load() {
    const [q, t] = await Promise.all([
      supabase.from('quotations').select('*').order('created_at', { ascending: false }),
      supabase.from('v_quote_totals').select('*'),
    ]);
    setRows(q.data || []);
    const m = {}; (t.data || []).forEach((x) => { m[x.id] = x; });
    setTot(m);
  }

  useEffect(() => { load(); }, []);

  async function create(kind) {
    setErr(''); setBusy(true);
    const { data: num, error: e1 } = await supabase
      .rpc('next_document_number', { p_doc_type: kind === 'boq' ? 'BOQ' : 'QUOTE',
                                     p_prefix: kind === 'boq' ? 'BOQ' : 'QT' });
    if (e1) { setErr('تعذّر توليد الرقم: ' + e1.message); setBusy(false); return; }

    const { data: cfg } = await supabase.from('app_settings')
      .select('quote_terms_default, vat_rate').eq('id',1).maybeSingle();

    const { data, error } = await supabase.from('quotations').insert({
      quote_no: num, doc_kind: kind, client_name: 'عميل جديد',
      vat_rate: cfg?.vat_rate ?? 0.15,
      terms_text: cfg?.quote_terms_default || '',
      intro_text: 'يسرنا في أركان المكان أن نضع بين أيديكم عرض السعر التالي لتنفيذ الأعمال الموضحة أدناه وفقاً للمواصفات الفنية المعتمدة.',
      closing_text: 'آملين أن ينال عرضنا استحسانكم، وتفضلوا بقبول فائق الاحترام والتقدير.',
      show_qty: kind === 'boq',
    }).select('id').single();

    setBusy(false);
    if (error) { setErr('تعذّر الإنشاء: ' + error.message); return; }
    router.push(`/dashboard/quotes/${data.id}`);
  }

  if (!rows) return <div className="empty">جارٍ التحميل…</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>عروض الأسعار وجداول الكميات</h1>
          <p>محرّك واحد مرن — تُظهر وتُخفي الأعمدة والأقسام كما يناسب كل عرض</p>
        </div>
        <div className="rowsplit">
          <button className="btn" disabled={busy} onClick={()=>create('quotation')}>عرض سعر جديد</button>
          <button className="btn ghost" disabled={busy} onClick={()=>create('boq')}>جدول كميات جديد</button>
        </div>
      </div>

      {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}

      <div className="section" style={{marginTop:0}}>
        <header><h2>السجل</h2></header>
        {rows.length === 0 ? (
          <div className="empty">
            <h3>لا عروض بعد</h3>
            <p>أنشئ عرض سعر أو جدول كميات من الزرّين أعلى الصفحة.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>الرقم</th><th>النوع</th><th>العميل</th><th>المشروع</th>
                  <th>التاريخ</th><th className="num">المجموع</th><th>الحالة</th><th>—</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.quote_no}</td>
                  <td>{r.doc_kind === 'boq' ? 'جدول كميات' : 'عرض سعر'}</td>
                  <td><Link href={`/dashboard/quotes/${r.id}`}>{r.client_name}</Link></td>
                  <td>{r.project_ref || '—'}</td>
                  <td className="mono">{dateAr(r.quote_date)}</td>
                  <td className="num">{money(tot[r.id]?.grand_total || 0)}</td>
                  <td><span className={`pill ${r.status === 'accepted' ? 'ok' : r.status === 'rejected' ? 'bad' : ''}`}>
                    {QSTATUS_AR[r.status]}</span></td>
                  <td><Link href={`/print/quote/${r.id}`} target="_blank">طباعة</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
