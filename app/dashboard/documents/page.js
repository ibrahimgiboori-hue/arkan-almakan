'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { TEMPLATES } from '@/lib/doc-templates';
import { dateAr } from '@/lib/format';

export default function Documents() {
  const [docs, setDocs] = useState(null);
  const [tpls, setTpls] = useState([]);
  const [role, setRole] = useState(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const sess = (await supabase.auth.getSession()).data.session;
    const [d, t, u] = await Promise.all([
      supabase.from('documents')
        .select('id, doc_number, template_code, subject, created_at, status, is_void, void_reason, issued_at')
        .order('created_at', { ascending: false }).limit(200),
      supabase.from('document_templates').select('*').eq('is_active', true).order('category'),
      supabase.from('app_users').select('role').eq('id', sess?.user?.id).maybeSingle(),
    ]);
    setDocs(d.data || []); setTpls(t.data || []); setRole(u.data?.role || null);
  }

  useEffect(() => { load(); }, []);

  const nameOf = (code) =>
    tpls.find((t) => t.code === code)?.name_ar
    || TEMPLATES.find((t) => t.code === code)?.name
    || code;

  async function voidDoc(d) {
    const reason = window.prompt(`سبب إبطال المستند ${d.doc_number}:`);
    if (reason === null) return;
    setErr(''); setMsg('');
    const { error } = await supabase.rpc('void_document', { p_id: d.id, p_reason: reason });
    if (error) { setErr(error.message); return; }
    setMsg('أُبطل المستند — يبقى في الأرشيف بعلامة لاغٍ'); load();
  }

  async function remove(d) {
    if (!window.confirm(`حذف ${d.doc_number} نهائياً؟ الأفضل الإبطال إن كان قد خرج لأحد.`)) return;
    setErr(''); setMsg('');
    const { error } = await supabase.from('documents').delete().eq('id', d.id);
    if (error) {
      setErr(error.message.includes('row-level security')
        ? 'الحذف متاح للمسودات فقط. استخدم الإبطال بدلاً منه.'
        : 'تعذّر الحذف: ' + error.message);
      return;
    }
    setMsg('حُذف المستند'); load();
  }

  const list = (docs || []).filter((d) => {
    const t = q.trim();
    if (!t) return true;
    return [d.doc_number, d.subject, nameOf(d.template_code)]
      .filter(Boolean).some((v) => String(v).includes(t));
  });

  const byCat = {};
  tpls.forEach((t) => { (byCat[t.category] ||= []).push(t); });
  const CAT_AR = { hr:'الموارد البشرية', finance:'المالية', projects:'المشاريع',
                   correspondence:'المراسلات', custom:'نماذج مخصصة' };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>النماذج والمستندات</h1>
          <p>اختر نموذجاً لتعبئته — يُرقَّم تلقائياً ويُحفظ في الأرشيف</p>
        </div>
        <Link className="btn ghost" href="/dashboard/formbuilder">محرّر النماذج</Link>
      </div>

      {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:14}}>{msg}</div>}

      {Object.entries(byCat).map(([cat, items]) => (
        <div className="section" key={cat} style={{marginTop:0,marginBottom:18}}>
          <header><h2>{CAT_AR[cat] || cat}</h2></header>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(215px,1fr))',
                       gap:1,background:'var(--hair)'}}>
            {items.map((t) => (
              <Link key={t.code} href={`/dashboard/documents/new/${t.code}`}
                    style={{background:'#fff',padding:'15px 16px',display:'block'}}>
                <div style={{fontSize:15,color:'#7C2B28',fontWeight:500}}>{t.name_ar}</div>
                <div className="mono" style={{fontSize:11.5,color:'#B98C8E',marginTop:3}}>
                  {t.prefix}{t.is_custom ? ' · مخصص' : ''}
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}

      <div className="section">
        <header>
          <h2>الأرشيف</h2>
          <input className="search" placeholder="ابحث برقم المستند أو الموضوع"
                 value={q} onChange={(e)=>setQ(e.target.value)} />
        </header>
        {!docs ? <div className="empty">جارٍ التحميل…</div>
         : list.length === 0 ? (
          <div className="empty"><h3>لا مستندات</h3><p>أصدر أول مستند من النماذج أعلاه.</p></div>
        ) : (
          <table>
            <thead>
              <tr><th>الرقم</th><th>النموذج</th><th>الموضوع</th><th>التاريخ</th>
                  <th>الحالة</th><th style={{width:210}}>الإجراءات</th></tr>
            </thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.id} style={d.is_void ? {opacity:.6} : undefined}>
                  <td className="mono" style={!d.issued_at ? {color:'var(--warn)'} : undefined}>
                    {d.issued_at ? d.doc_number : 'مسودة'}
                  </td>
                  <td>{nameOf(d.template_code)}</td>
                  <td>
                    {d.subject || '—'}
                    {d.void_reason && (
                      <div style={{fontSize:11.5,color:'var(--bad)',marginTop:3}}>
                        سبب الإبطال: {d.void_reason}</div>
                    )}
                  </td>
                  <td className="mono">{dateAr(d.created_at)}</td>
                  <td>
                    <span className={`pill ${d.is_void ? 'bad' : !d.issued_at ? 'warn' : 'ok'}`}>
                      {d.is_void ? 'لاغٍ' : !d.issued_at ? 'مسودة' : 'صادر'}
                    </span>
                  </td>
                  <td>
                    <div className="rowsplit">
                      <Link className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}}
                            href={`/dashboard/documents/edit/${d.id}`}>
                        {d.issued_at ? 'فتح' : 'تحرير'}
                      </Link>
                      <Link className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}}
                            href={`/print/${d.id}`} target="_blank">طباعة</Link>
                      {!d.is_void && ['ceo','hr','accountant'].includes(role) && (
                        <button className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}}
                                onClick={()=>voidDoc(d)}>إبطال</button>
                      )}
                      {['ceo','hr'].includes(role) && (
                        <button className="btn ghost" style={{padding:'4px 9px',fontSize:12.5,
                                        borderColor:'#EBC3C0',color:'#A32B24'}}
                                onClick={()=>remove(d)}>حذف</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
