'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { TEMPLATES } from '@/lib/doc-templates';
import { dateAr } from '@/lib/format';
import { categoryLabel, relationLabels } from '@/lib/document-catalog.mjs';

export default function Documents() {
  const [docs, setDocs] = useState(null);
  const [tpls, setTpls] = useState([]);
  const [role, setRole] = useState(null);
  const [q, setQ] = useState('');
  const [templateQ, setTemplateQ] = useState('');
  const [category, setCategory] = useState('all');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const sess = (await supabase.auth.getSession()).data.session;
    const [d, t, u] = await Promise.all([
      supabase.from('documents')
        .select('id, doc_number, template_code, subject, created_at, status, is_void, void_reason, issued_at')
        .order('created_at', { ascending: false }).limit(200),
      supabase.from('document_templates').select('*').eq('is_active', true)
        .order('category').order('catalog_order', { nullsFirst: false }),
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

  const categories = useMemo(() => {
    const counts = {};
    tpls.forEach((t) => { counts[t.category] = (counts[t.category] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => categoryLabel(a[0]).localeCompare(categoryLabel(b[0]), 'ar'));
  }, [tpls]);

  const visibleTemplates = useMemo(() => {
    const needle = templateQ.trim().toLocaleLowerCase('ar');
    return tpls.filter((t) => {
      if (category !== 'all' && t.category !== category) return false;
      if (!needle) return true;
      return [t.name_ar, t.name_en, t.description_ar, t.code, ...(t.keywords || [])]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('ar').includes(needle));
    });
  }, [tpls, category, templateQ]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>النماذج والمستندات</h1>
          <p>{tpls.length} نموذجًا جاهزًا — اختر النموذج واربطه بموظف أو مشروع ثم احفظه في الأرشيف</p>
        </div>
        <Link className="btn ghost" href="/dashboard/formbuilder">محرّر النماذج</Link>
      </div>

      {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:14}}>{msg}</div>}

      <div className="section" style={{marginTop:0,marginBottom:18}}>
        <header style={{alignItems:'center',gap:12,flexWrap:'wrap'}}>
          <div>
            <h2>كتالوج النماذج</h2>
            <span>{visibleTemplates.length} نتيجة من {tpls.length}</span>
          </div>
          <span className="spacer" />
          <input className="search" style={{minWidth:280}}
                 placeholder="ابحث باسم النموذج أو الغرض أو الرمز"
                 value={templateQ} onChange={(e)=>setTemplateQ(e.target.value)} />
        </header>

        <div style={{display:'flex',gap:7,flexWrap:'wrap',padding:'12px 14px',borderBottom:'1px solid var(--hair)'}}>
          <button className={`btn ghost ${category === 'all' ? 'on' : ''}`}
                  style={category === 'all' ? {background:'#8B3332',color:'#fff'} : undefined}
                  onClick={()=>setCategory('all')}>الكل ({tpls.length})</button>
          {categories.map(([key, count]) => (
            <button key={key} className="btn ghost"
                    style={category === key ? {background:'#8B3332',color:'#fff'} : undefined}
                    onClick={()=>setCategory(key)}>{categoryLabel(key)} ({count})</button>
          ))}
        </div>

        {visibleTemplates.length === 0 ? (
          <div className="empty"><h3>لا توجد نتيجة</h3><p>غيّر عبارة البحث أو اختر تصنيفًا آخر.</p></div>
        ) : (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(250px,1fr))',
                       gap:1,background:'var(--hair)'}}>
            {visibleTemplates.map((t) => (
              <Link key={t.code} href={`/dashboard/documents/new/${t.code}`}
                    style={{background:'#fff',padding:'14px 16px',display:'flex',flexDirection:'column',minHeight:132}}>
                <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'flex-start'}}>
                  <div style={{fontSize:15,color:'#7C2B28',fontWeight:650,lineHeight:1.6}}>{t.name_ar}</div>
                  <span className="pill" style={{fontSize:10.5,whiteSpace:'nowrap'}}>{categoryLabel(t.category)}</span>
                </div>
                <div style={{fontSize:12.2,color:'var(--ink-soft)',lineHeight:1.65,marginTop:5}}>
                  {t.description_ar || 'نموذج إداري قابل للتعبئة والإصدار والأرشفة.'}
                </div>
                <div style={{display:'flex',gap:5,flexWrap:'wrap',marginTop:'auto',paddingTop:8}}>
                  {relationLabels(t.relation_scope || []).map((label)=>(
                    <span key={label} className="pill" style={{fontSize:10.5}}>{label}</span>
                  ))}
                  <span className="mono" style={{fontSize:10.5,color:'#B98C8E',marginInlineStart:'auto'}}>
                    {t.prefix} · {t.template_source === 'catalog' ? 'دستوري' : t.template_source === 'user' ? 'مخصص' : 'مدمج'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

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
