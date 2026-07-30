'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { dateAr } from '@/lib/format';

const TABLES = [
  ['app_settings','إعدادات الشركة'],
  ['employees','الموظفون'],
  ['employment_contracts','عقود العمل'],
  ['employee_documents','مستندات الموظفين'],
  ['leave_requests','طلبات الإجازة'],
  ['leave_balances','أرصدة الإجازات'],
  ['advances','السلف'],
  ['advance_installments','أقساط السلف'],
  ['disciplinary_actions','الجزاءات'],
  ['payroll_runs','مسيّرات الرواتب'],
  ['payroll_lines','بنود المسيّرات'],
  ['end_of_service','نهاية الخدمة'],
  ['custodies','العهد'],
  ['custody_transactions','حركات العهد'],
  ['projects','المشاريع'],
  ['entities','الجهات'],
  ['work_items','دليل البنود'],
  ['quotations','عروض الأسعار'],
  ['quotation_lines','أسطر العروض'],
  ['quotation_payments','دفعات العروض'],
  ['documents','المستندات الصادرة'],
  ['correspondence_register','الصادر والوارد'],
  ['approvals','سجل الاعتمادات'],
];

function toCSV(rows) {
  if (!rows.length) return '';
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '\uFEFF' + cols.join(',') + '\n'
       + rows.map((r) => cols.map((c) => esc(r[c])).join(',')).join('\n');
}

function download(name, text, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export default function Backup() {
  const [counts, setCounts] = useState({});
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [role, setRole] = useState(null);
  const [last, setLast] = useState(null);

  useEffect(() => {
    (async () => {
      const sess = (await supabase.auth.getSession()).data.session;
      const { data: u } = await supabase.from('app_users').select('role')
        .eq('id', sess?.user?.id).maybeSingle();
      setRole(u?.role || null);

      const out = {};
      for (const [t] of TABLES) {
        const { count } = await supabase.from(t).select('id', { count: 'exact', head: true });
        out[t] = count ?? 0;
      }
      setCounts(out);
      setLast(localStorage?.getItem?.('arkan_last_backup') || null);
    })();
  }, []);

  async function fetchAll() {
    const bundle = { exported_at: new Date().toISOString(), tables: {} };
    for (const [t] of TABLES) {
      const { data, error } = await supabase.from(t).select('*');
      if (error) throw new Error(`${t}: ${error.message}`);
      bundle.tables[t] = data || [];
    }
    return bundle;
  }

  async function exportJson() {
    setErr(''); setMsg(''); setBusy('json');
    try {
      const b = await fetchAll();
      const stamp = new Date().toISOString().slice(0,10);
      download(`نسخة-أركان-${stamp}.json`, JSON.stringify(b, null, 1), 'application/json');
      try { localStorage.setItem('arkan_last_backup', new Date().toISOString()); } catch {}
      setLast(new Date().toISOString());
      setMsg('نُزّلت النسخة الكاملة — ارفعها على جوجل درايف الآن');
    } catch (e) { setErr('تعذّر التصدير: ' + e.message); }
    setBusy('');
  }

  async function exportCsv() {
    setErr(''); setMsg(''); setBusy('csv');
    try {
      const b = await fetchAll();
      for (const [t, label] of TABLES) {
        const rows = b.tables[t];
        if (!rows?.length) continue;
        download(`${label}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
        await new Promise((r) => setTimeout(r, 220));
      }
      setMsg('نُزّلت ملفات CSV — تُفتح مباشرة في إكسل');
    } catch (e) { setErr('تعذّر التصدير: ' + e.message); }
    setBusy('');
  }

  async function exportTable(t, label) {
    setErr(''); setBusy(t);
    const { data, error } = await supabase.from(t).select('*');
    setBusy('');
    if (error) { setErr(error.message); return; }
    if (!data?.length) { setErr('لا بيانات في هذا الجدول'); return; }
    download(`${label}.csv`, toCSV(data), 'text/csv;charset=utf-8');
  }

  const total = Object.values(counts).reduce((a,b)=>a+b, 0);
  const lastDays = last ? Math.floor((Date.now() - new Date(last).getTime())/86400000) : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>النسخ الاحتياطي والتصدير</h1>
          <p>بياناتك ملكك — تُنزَّل كاملة في أي وقت بلا اعتماد على أحد</p>
        </div>
        <button className="btn" onClick={exportJson} disabled={busy==='json'}>
          {busy==='json' ? 'جارٍ التحضير…' : 'تنزيل نسخة كاملة'}
        </button>
      </div>

      {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:14}}>{msg}</div>}

      <div className="grid k4" style={{marginBottom:20}}>
        <div className="card">
          <h3>إجمالي السجلات</h3>
          <div className="big">{total}</div>
          <div className="foot">في {TABLES.length} جدولاً</div>
        </div>
        <div className="card">
          <h3>آخر نسخة نزّلتها</h3>
          <div className="big" style={{fontSize:20,paddingTop:10}}>
            {last ? dateAr(last) : 'لا شيء'}
          </div>
          <div className="foot">
            {lastDays === null ? 'لم تُنزِّل نسخة بعد'
              : lastDays === 0 ? 'اليوم' : `قبل ${lastDays} يوماً`}
          </div>
        </div>
        <div className="card">
          <h3>الموظفون</h3>
          <div className="big">{counts.employees ?? 0}</div>
        </div>
        <div className="card">
          <h3>عروض الأسعار</h3>
          <div className="big">{counts.quotations ?? 0}</div>
        </div>
      </div>

      {lastDays !== null && lastDays > 7 && (
        <div className="msg err" style={{marginBottom:16}}>
          مضى {lastDays} يوماً على آخر نسخة احتياطية. نزّل نسخة الآن.
        </div>
      )}

      <div className="section" style={{marginTop:0}}>
        <header><h2>طرق التصدير</h2></header>
        <div style={{padding:18,display:'grid',gap:14}}>
          <div style={{border:'1px solid var(--hair)',padding:14}}>
            <div style={{fontWeight:600,color:'var(--maroon-dark)',marginBottom:4}}>
              نسخة كاملة (JSON)
            </div>
            <div style={{fontSize:13.5,color:'var(--ink-soft)',marginBottom:10}}>
              ملف واحد يحوي كل شيء بالعلاقات بينه — هذا ما يُستعاد منه النظام لو حدث شيء.
              نزّله أسبوعياً وارفعه على جوجل درايف أو الآيكلاود.
            </div>
            <button className="btn" onClick={exportJson} disabled={busy==='json'}>
              {busy==='json' ? 'جارٍ…' : 'تنزيل'}
            </button>
          </div>

          <div style={{border:'1px solid var(--hair)',padding:14}}>
            <div style={{fontWeight:600,color:'var(--maroon-dark)',marginBottom:4}}>
              ملفات إكسل (CSV)
            </div>
            <div style={{fontSize:13.5,color:'var(--ink-soft)',marginBottom:10}}>
              ملف لكل جدول يُفتح في إكسل مباشرة — للمراجعة والتحليل والطباعة، لا للاستعادة.
            </div>
            <button className="btn ghost" onClick={exportCsv} disabled={busy==='csv'}>
              {busy==='csv' ? 'جارٍ…' : 'تنزيل كل الجداول'}
            </button>
          </div>
        </div>
      </div>

      <div className="section">
        <header><h2>الجداول</h2></header>
        <table>
          <thead>
            <tr><th>الجدول</th><th className="num">عدد السجلات</th><th>تصدير</th></tr>
          </thead>
          <tbody>
            {TABLES.map(([t,label]) => (
              <tr key={t}>
                <td>{label}</td>
                <td className="num">{counts[t] ?? '—'}</td>
                <td>
                  <button className="btn ghost" style={{padding:'4px 10px',fontSize:13}}
                          disabled={busy===t || !counts[t]}
                          onClick={()=>exportTable(t,label)}>CSV</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section">
        <header><h2>الاستعادة</h2></header>
        <div style={{padding:18,fontSize:13.5,color:'var(--ink-soft)',lineHeight:1.9}}>
          الاستعادة عملية خطيرة تُكتب فوق بياناتك الحالية، فلم أجعلها بضغطة زر.
          لو احتجتها يوماً: احتفظ بملف JSON، وسأكتب لك أمر استعادة مخصصاً يُشغَّل مرة واحدة
          في محرر SQL بعد التحقق من محتوى الملف.
          {role === 'ceo' && (
            <div style={{marginTop:12,color:'var(--maroon-dark)'}}>
              نصيحة: فعّل النسخ الاحتياطي التلقائي اليومي من Supabase حين تشترك في الباقة المدفوعة
              — يجعل هذه الشاشة احتياطاً ثانياً لا وحيداً.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
