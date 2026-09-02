'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { TEMPLATES } from '@/lib/doc-templates';
import { dateAr } from '@/lib/format';
import { categoryLabel, relationLabels } from '@/lib/document-catalog.mjs';

const PORTAL_LABELS = Object.freeze({
  projects: 'المشاريع',
  finance: 'المالية',
  hr: 'الموارد البشرية',
  system: 'الإدارة والنظام',
  shared: 'مشترك',
  other: 'أخرى',
});

const PORTAL_ORDER = ['projects', 'finance', 'hr', 'shared', 'system', 'other'];

export default function Documents() {
  const [docs, setDocs] = useState(null);
  const [tpls, setTpls] = useState([]);
  const [viewTpls, setViewTpls] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [role, setRole] = useState(null);
  const [q, setQ] = useState('');
  const [templateQ, setTemplateQ] = useState('');
  const [portal, setPortal] = useState('all');
  const [category, setCategory] = useState('all');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    setErr('');
    const sess = (await supabase.auth.getSession()).data.session;
    const [d, createT, viewT, packs, u] = await Promise.all([
      supabase.from('documents')
        .select('id, doc_number, template_code, subject, created_at, status, is_void, void_reason, issued_at')
        .order('created_at', { ascending: false }).limit(200),
      supabase.rpc('document_templates_for_me', { p_action: 'create' }),
      supabase.rpc('document_templates_for_me', { p_action: 'view' }),
      supabase.rpc('document_template_pack_memberships_for_me', { p_action: 'create' }),
      supabase.from('app_users').select('role').eq('id', sess?.user?.id).maybeSingle(),
    ]);
    const firstError = d.error || createT.error || viewT.error || packs.error || u.error;
    if (firstError) {
      setErr(firstError.message || 'تعذر تحميل مكتبة المستندات.');
    }
    setDocs(d.data || []);
    setTpls(createT.data || []);
    setViewTpls(viewT.data || []);
    setMemberships(packs.data || []);
    setRole(u.data?.role || null);
  }

  useEffect(() => { load(); }, []);

  const allKnownTemplates = useMemo(() => {
    const map = new Map();
    [...viewTpls, ...tpls].forEach((template) => map.set(template.code, template));
    return [...map.values()];
  }, [viewTpls, tpls]);

  const nameOf = (code) =>
    allKnownTemplates.find((t) => t.code === code)?.name_ar
    || TEMPLATES.find((t) => t.code === code)?.name
    || code;

  const portalsByTemplate = useMemo(() => {
    const map = new Map();
    memberships.forEach((row) => {
      if (!map.has(row.template_code)) map.set(row.template_code, new Set());
      map.get(row.template_code).add(row.portal_key || 'other');
    });
    tpls.forEach((template) => {
      if (!map.has(template.code)) map.set(template.code, new Set(['other']));
    });
    return map;
  }, [memberships, tpls]);

  const packNamesByTemplate = useMemo(() => {
    const map = new Map();
    memberships.forEach((row) => {
      if (!map.has(row.template_code)) map.set(row.template_code, new Set());
      if (row.pack_name_ar) map.get(row.template_code).add(row.pack_name_ar);
    });
    return map;
  }, [memberships]);

  async function voidDoc(doc) {
    const reason = window.prompt(`سبب إبطال المستند ${doc.doc_number}:`);
    if (reason === null) return;
    setErr('');
    setMsg('');
    const { error } = await supabase.rpc('void_document', { p_id: doc.id, p_reason: reason });
    if (error) { setErr(error.message); return; }
    setMsg('أُبطل المستند وبقي محفوظًا في السجل');
    load();
  }

  async function remove(doc) {
    if (!window.confirm(`حذف ${doc.doc_number} نهائيًا؟ استخدم الإبطال إذا كان المستند قد خرج لأحد.`)) return;
    setErr('');
    setMsg('');
    const { error } = await supabase.from('documents').delete().eq('id', doc.id);
    if (error) {
      setErr(error.message.includes('row-level security')
        ? 'الحذف متاح للمسودات فقط. استخدم الإبطال بدلًا منه.'
        : 'تعذّر الحذف: ' + error.message);
      return;
    }
    setMsg('حُذف المستند');
    load();
  }

  const documents = (docs || []).filter((doc) => {
    const needle = q.trim();
    if (!needle) return true;
    return [doc.doc_number, doc.subject, nameOf(doc.template_code)]
      .filter(Boolean)
      .some((value) => String(value).includes(needle));
  });

  const portalCounts = useMemo(() => {
    const counts = {};
    tpls.forEach((template) => {
      const keys = portalsByTemplate.get(template.code) || new Set(['other']);
      keys.forEach((key) => { counts[key] = (counts[key] || 0) + 1; });
    });
    return counts;
  }, [tpls, portalsByTemplate]);

  const templatesInPortal = useMemo(() => {
    if (portal === 'all') return tpls;
    return tpls.filter((template) => (portalsByTemplate.get(template.code) || new Set(['other'])).has(portal));
  }, [tpls, portal, portalsByTemplate]);

  const categories = useMemo(() => {
    const counts = {};
    templatesInPortal.forEach((template) => { counts[template.category] = (counts[template.category] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => categoryLabel(a[0]).localeCompare(categoryLabel(b[0]), 'ar'));
  }, [templatesInPortal]);

  useEffect(() => {
    if (category !== 'all' && !categories.some(([key]) => key === category)) setCategory('all');
  }, [portal, categories, category]);

  const visibleTemplates = useMemo(() => {
    const needle = templateQ.trim().toLocaleLowerCase('ar');
    return templatesInPortal.filter((template) => {
      if (category !== 'all' && template.category !== category) return false;
      if (!needle) return true;
      return [template.name_ar, template.name_en, template.description_ar, template.code, ...(template.keywords || [])]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('ar').includes(needle));
    });
  }, [templatesInPortal, category, templateQ]);

  const availablePortals = PORTAL_ORDER.filter((key) => portalCounts[key] > 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>النماذج والمستندات</h1>
          <p>تظهر لك النماذج التابعة لبوابات وصلاحيات عملك فقط.</p>
        </div>
      </div>

      {err && <div className="msg err" style={{ marginBottom: 14 }}>{err}</div>}
      {msg && <div className="msg ok" style={{ marginBottom: 14 }}>{msg}</div>}

      <div className="section" style={{ marginTop: 0, marginBottom: 18 }}>
        <header style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2>إنشاء مستند</h2>
            <span>{visibleTemplates.length} نموذجًا ظاهرًا من {tpls.length} متاحًا لك</span>
          </div>
          <span className="spacer" />
          <input
            className="search"
            style={{ minWidth: 280 }}
            placeholder="ابحث باسم النموذج أو الغرض أو الرمز"
            value={templateQ}
            onChange={(event) => setTemplateQ(event.target.value)}
          />
        </header>

        <div style={{ padding: '12px 14px 7px', borderBottom: '1px solid var(--hair)' }}>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            <button
              className="btn ghost"
              style={portal === 'all' ? { background: '#8B3332', color: '#fff' } : undefined}
              onClick={() => { setPortal('all'); setCategory('all'); }}
            >
              كل بواباتي ({tpls.length})
            </button>
            {availablePortals.map((key) => (
              <button
                key={key}
                className="btn ghost"
                style={portal === key ? { background: '#8B3332', color: '#fff' } : undefined}
                onClick={() => { setPortal(key); setCategory('all'); }}
              >
                {PORTAL_LABELS[key] || key} ({portalCounts[key]})
              </button>
            ))}
          </div>
          {categories.length > 1 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            <button className="btn ghost" style={category === 'all' ? { fontWeight: 700 } : undefined} onClick={() => setCategory('all')}>كل الأنواع</button>
            {categories.map(([key, count]) => (
              <button key={key} className="btn ghost" style={category === key ? { fontWeight: 700 } : undefined} onClick={() => setCategory(key)}>
                {categoryLabel(key)} ({count})
              </button>
            ))}
          </div>}
        </div>

        {visibleTemplates.length === 0 ? (
          <div className="empty"><h3>لا توجد نتيجة</h3><p>غيّر عبارة البحث أو اختر بوابة أو نوعًا آخر.</p></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 1, background: 'var(--hair)' }}>
            {visibleTemplates.map((template) => {
              const blankTimesheet = template.code === 'CAT_PROJECTS_OPERATIONS_CONTRACTOR_DAILY_TIMESHEET';
              const templatePortals = [...(portalsByTemplate.get(template.code) || new Set(['other']))];
              const packNames = [...(packNamesByTemplate.get(template.code) || new Set())];
              return (
                <Link
                  key={template.code}
                  href={blankTimesheet ? '/print/timesheet/blank' : `/dashboard/documents/new/${template.code}`}
                  target={blankTimesheet ? '_blank' : undefined}
                  style={{ background: '#fff', padding: '14px 16px', display: 'flex', flexDirection: 'column', minHeight: 132 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 15, color: '#7C2B28', fontWeight: 650, lineHeight: 1.6 }}>{template.name_ar}</div>
                    <span className="pill" style={{ fontSize: 10.5, whiteSpace: 'nowrap' }}>{categoryLabel(template.category)}</span>
                  </div>
                  <div style={{ fontSize: 12.2, color: 'var(--ink-soft)', lineHeight: 1.65, marginTop: 5 }}>
                    {template.description_ar || 'نموذج إداري قابل للتعبئة والإصدار والحفظ.'}
                  </div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 'auto', paddingTop: 8 }}>
                    {templatePortals.map((key) => <span key={key} className="pill" style={{ fontSize: 10.5 }}>{PORTAL_LABELS[key] || key}</span>)}
                    {relationLabels(template.relation_scope || []).map((label) => (
                      <span key={label} className="pill" style={{ fontSize: 10.5 }}>{label}</span>
                    ))}
                    <span className="mono" title={packNames.join('، ')} style={{ fontSize: 10.5, color: '#B98C8E', marginInlineStart: 'auto' }}>
                      {template.prefix} · {template.template_source === 'catalog' ? 'دستوري' : template.template_source === 'user' ? 'مخصص' : 'مدمج'}
                    </span>
                    {blankTimesheet && <span className="pill ok" style={{ fontSize: 10.5 }}>طباعة فارغة مباشرة</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="section">
        <header>
          <div>
            <h2>المستندات</h2>
            <span>السجل يعرض المستندات التي تسمح لك صلاحياتك بالوصول إليها.</span>
          </div>
          <input
            className="search"
            placeholder="ابحث برقم المستند أو الموضوع"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
        </header>

        {!docs ? (
          <div className="empty">جارٍ التحميل…</div>
        ) : documents.length === 0 ? (
          <div className="empty"><h3>لا مستندات</h3><p>أنشئ أول مستند من النماذج المتاحة لك أعلاه.</p></div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>الرقم</th><th>النموذج</th><th>الموضوع</th><th>التاريخ</th><th>الحالة</th><th style={{ width: 210 }}>الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id} style={doc.is_void ? { opacity: 0.6 } : undefined}>
                  <td className="mono" style={!doc.issued_at ? { color: 'var(--warn)' } : undefined}>
                    {doc.issued_at ? doc.doc_number : 'مسودة'}
                  </td>
                  <td>{nameOf(doc.template_code)}</td>
                  <td>
                    {doc.subject || '—'}
                    {doc.void_reason && <div style={{ fontSize: 11.5, color: 'var(--bad)', marginTop: 3 }}>سبب الإبطال: {doc.void_reason}</div>}
                  </td>
                  <td className="mono">{dateAr(doc.created_at)}</td>
                  <td>
                    <span className={`pill ${doc.is_void ? 'bad' : !doc.issued_at ? 'warn' : 'ok'}`}>
                      {doc.is_void ? 'لاغٍ' : !doc.issued_at ? 'مسودة' : 'صادر'}
                    </span>
                  </td>
                  <td>
                    <div className="rowsplit">
                      <Link className="btn ghost" style={{ padding: '4px 9px', fontSize: 12.5 }} href={`/dashboard/documents/edit/${doc.id}`}>
                        {doc.issued_at ? 'فتح' : 'تحرير'}
                      </Link>
                      <Link className="btn ghost" style={{ padding: '4px 9px', fontSize: 12.5 }} href={`/print/${doc.id}`} target="_blank">طباعة</Link>
                      {!doc.is_void && ['ceo', 'hr', 'accountant'].includes(role) && (
                        <button className="btn ghost" style={{ padding: '4px 9px', fontSize: 12.5 }} onClick={() => voidDoc(doc)}>إبطال</button>
                      )}
                      {['ceo', 'hr'].includes(role) && (
                        <button
                          className="btn ghost"
                          style={{ padding: '4px 9px', fontSize: 12.5, borderColor: '#EBC3C0', color: '#A32B24' }}
                          onClick={() => remove(doc)}
                        >
                          حذف
                        </button>
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
