'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { uid } from '@/lib/form-engine';

export default function FormBuilderList() {
  const router = useRouter();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => supabase.from('document_templates')
    .select('*').order('is_custom', { ascending: false }).order('code')
    .then(({ data }) => setRows(data || []));

  useEffect(() => { load(); }, []);

  async function create() {
    setErr(''); setBusy(true);
    const code = 'CUSTOM_' + uid().toUpperCase();
    const { error } = await supabase.from('document_templates').insert({
      code, name_ar: 'نموذج جديد', category: 'custom',
      prefix: 'CST', is_custom: true,
      layout: { sections: [
        { id: uid(), kind: 'cards', style: 'info', title: 'البيانات الأساسية', fields: [] },
      ]},
      logic: [],
    });
    setBusy(false);
    if (error) {
      setErr(error.message.includes('row-level security')
        ? 'إنشاء النماذج للمدير التنفيذي والموارد البشرية فقط.'
        : 'تعذّر الإنشاء: ' + error.message);
      return;
    }
    router.push(`/dashboard/formbuilder/${code}`);
  }

  if (!rows) return <div className="empty">جارٍ التحميل…</div>;

  const custom = rows.filter((r) => r.is_custom);
  const builtin = rows.filter((r) => !r.is_custom);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>محرّر النماذج</h1>
          <p>النموذج بياناتٌ لا كود — تبنيه بنفسك على شبكة ١٢ عموداً بمعادلاته</p>
        </div>
        <button className="btn" onClick={create} disabled={busy}>
          {busy ? 'جارٍ…' : 'نموذج جديد'}
        </button>
      </div>

      {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}

      <div className="section" style={{marginTop:0}}>
        <header><h2>نماذجك المخصصة ({custom.length})</h2></header>
        {custom.length === 0 ? (
          <div className="empty">
            <h3>لا نماذج مخصصة</h3>
            <p>أنشئ نموذجاً وابنِ أقسامه وحقوله ومعادلاته بنفسك.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>الاسم</th><th>الرمز</th><th>البادئة</th>
                  <th className="num">الأقسام</th><th className="num">المعادلات</th><th>—</th></tr>
            </thead>
            <tbody>
              {custom.map((r) => (
                <tr key={r.code}>
                  <td><Link href={`/dashboard/formbuilder/${r.code}`}>{r.name_ar}</Link></td>
                  <td className="mono">{r.code}</td>
                  <td className="mono">{r.prefix}</td>
                  <td className="num">{r.layout?.sections?.length || 0}</td>
                  <td className="num">{r.logic?.length || 0}</td>
                  <td>
                    <Link href={`/dashboard/documents/new/${r.code}`}>تعبئة</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="section">
        <header><h2>النماذج المدمجة ({builtin.length})</h2></header>
        <div style={{padding:'14px 18px',fontSize:13.5,color:'var(--ink-soft)'}}>
          هذه النماذج مبنية في النظام وحقولها ثابتة. لتعديل أحدها: أنشئ نموذجاً مخصصاً
          بنفس الغرض وابنِ حقوله كما تريد، ثم توقّف عن استخدام المدمج.
        </div>
        <table>
          <thead><tr><th>الاسم</th><th>الرمز</th><th>البادئة</th></tr></thead>
          <tbody>
            {builtin.map((r) => (
              <tr key={r.code}>
                <td>{r.name_ar}</td>
                <td className="mono">{r.code}</td>
                <td className="mono">{r.prefix}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
