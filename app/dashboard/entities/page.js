'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

// ============================================================
//  العملاء والجهات
//  كل من نتعامل معه : مالك، مقاول رئيسي، استشاري، مورد، جهة حكومية
//  منها تُختار «جهة المشروع» و«عميل عرض السعر»
//  المسار : /dashboard/entities
// ============================================================

const MAROON = '#8B3332';

const KIND = {
  client:          'عميل — مالك المشروع',
  main_contractor: 'مقاول رئيسي — نعمل تحته',
  consultant:      'استشاري / مكتب هندسي',
  supplier:        'مورد',
  government:      'جهة حكومية',
  other:           'أخرى',
};

const EMPTY = {
  id: null, entity_code: '', name_ar: '', name_en: '', entity_kind: 'client',
  cr_number: '', vat_number: '', contact_name: '', contact_title: '',
  mobile: '', email: '', city: '', national_address: '', notes: '',
};

const digits = (s) => (s || '').replace(/\D/g, '');

export default function Entities() {
  const [rows, setRows] = useState([]);
  const [usage, setUsage] = useState({});     // معرّف الجهة → عدد المشاريع وعروض الأسعار
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [form, setForm] = useState(null);     // null = مغلق
  const [isCompany, setIsCompany] = useState(true);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const [e, p, q] = await Promise.all([
        supabase.from('entities').select('*').order('name_ar'),
        supabase.from('projects').select('entity_id').not('entity_id', 'is', null),
        supabase.from('quotations').select('entity_id').not('entity_id', 'is', null),
      ]);
      if (e.error) throw e.error;
      setRows(e.data || []);

      const u = {};
      (p.data || []).forEach((x) => {
        u[x.entity_id] = u[x.entity_id] || { projects: 0, quotes: 0 };
        u[x.entity_id].projects += 1;
      });
      (q.data || []).forEach((x) => {
        u[x.entity_id] = u[x.entity_id] || { projects: 0, quotes: 0 };
        u[x.entity_id].quotes += 1;
      });
      setUsage(u);
    } catch (ex) {
      setErr('تعذّر التحميل: ' + (ex.message || ex));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // رقم الجهة التالي
  const nextCode = useMemo(() => {
    const nums = rows
      .map((r) => Number((r.entity_code || '').match(/(\d+)\s*$/)?.[1] || 0))
      .filter((n) => n > 0);
    const n = (nums.length ? Math.max(...nums) : 0) + 1;
    return 'ENT-' + String(n).padStart(4, '0');
  }, [rows]);

  function openNew() {
    setForm({ ...EMPTY, entity_code: nextCode });
    setIsCompany(true); setErr(''); setMsg('');
  }
  function openEdit(r) {
    setForm({ ...EMPTY, ...r });
    setIsCompany(Boolean(r.cr_number || r.vat_number));
    setErr(''); setMsg('');
  }

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // تحقق البيانات النظامية
  const cr = digits(form?.cr_number);
  const vat = digits(form?.vat_number);
  const crWarn  = isCompany && cr  && cr.length !== 10;
  const vatWarn = isCompany && vat && (vat.length !== 15 || !vat.startsWith('3') || !vat.endsWith('3'));

  async function save() {
    if (!form?.name_ar?.trim()) { setErr('اسم الجهة مطلوب'); return; }
    setBusy(true); setErr(''); setMsg('');
    const payload = {
      entity_code:      form.entity_code?.trim() || null,
      name_ar:          form.name_ar.trim(),
      name_en:          form.name_en?.trim() || null,
      entity_kind:      form.entity_kind || null,
      cr_number:        isCompany ? (form.cr_number?.trim() || null) : null,
      vat_number:       isCompany ? (form.vat_number?.trim() || null) : null,
      contact_name:     form.contact_name?.trim() || null,
      contact_title:    form.contact_title?.trim() || null,
      mobile:           form.mobile?.trim() || null,
      email:            form.email?.trim() || null,
      city:             form.city?.trim() || null,
      national_address: form.national_address?.trim() || null,
      notes:            form.notes?.trim() || null,
    };
    try {
      const res = form.id
        ? await supabase.from('entities').update(payload).eq('id', form.id)
        : await supabase.from('entities').insert(payload);
      if (res.error) throw res.error;
      setMsg(form.id ? 'حُدِّثت بيانات الجهة' : 'أُضيفت الجهة');
      setForm(null);
      await load();
    } catch (ex) {
      setErr('تعذّر الحفظ: ' + (ex.message || ex));
    }
    setBusy(false);
  }

  async function remove(r) {
    const u = usage[r.id];
    if (u && (u.projects || u.quotes)) {
      setErr(`لا يمكن حذف «${r.name_ar}» — مرتبطة بـ ${u.projects || 0} مشروع و${u.quotes || 0} عرض سعر`);
      return;
    }
    if (!window.confirm(`حذف «${r.name_ar}» نهائياً؟`)) return;
    const { error } = await supabase.from('entities').delete().eq('id', r.id);
    if (error) setErr('تعذّر الحذف: ' + error.message);
    else { setMsg('حُذفت الجهة'); load(); }
  }

  const shown = rows.filter((r) => {
    if (kindFilter && r.entity_kind !== kindFilter) return false;
    if (!search) return true;
    const s = search.trim();
    return (r.name_ar || '').includes(s) || (r.name_en || '').toLowerCase().includes(s.toLowerCase())
      || (r.cr_number || '').includes(s) || (r.vat_number || '').includes(s)
      || (r.contact_name || '').includes(s) || (r.mobile || '').includes(s);
  });

  return (
    <div dir="rtl">
      <div className="page-head">
        <div>
          <h1>العملاء والجهات</h1>
          <p>منها تُختار جهة المشروع وعميل عرض السعر — وبياناتها النظامية تُطبع في المستندات</p>
        </div>
        <button className="btn" onClick={openNew}>+ جهة جديدة</button>
      </div>

      <div className="section" style={{ marginTop: 0 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: 16, alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 1, minWidth: 240 }}>
            <label>ابحث بالاسم أو السجل التجاري أو الرقم الضريبي أو الجوال</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)}
                   placeholder="اكتب للبحث…" />
          </div>
          <div className="field" style={{ minWidth: 220 }}>
            <label>نوع الجهة</label>
            <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
              <option value="">الكل</option>
              {Object.entries(KIND).map(([k, v]) => <option key={k} value={v && k}>{v}</option>)}
            </select>
          </div>
          <span style={{ fontSize: 12.5, color: '#888' }}>
            {shown.length} من {rows.length}
          </span>
        </div>
      </div>

      {err && <div className="msg err" style={{ marginBottom: 12 }}>{err}</div>}
      {msg && <div className="msg ok" style={{ marginBottom: 12 }}>{msg}</div>}

      {/* ============ نموذج الإضافة والتعديل ============ */}
      {form && (
        <div className="section" style={{ borderColor: MAROON }}>
          <header>
            <h2>{form.id ? 'تعديل: ' + (form.name_ar || 'جهة') : 'جهة جديدة'}</h2>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn ghost" style={sm}
                      onClick={() => setIsCompany(true)}
                      disabled={isCompany}>منشأة</button>
              <button className="btn ghost" style={sm}
                      onClick={() => setIsCompany(false)}
                      disabled={!isCompany}>فرد</button>
            </div>
          </header>

          <div style={{ padding: 18 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: 2, minWidth: 260 }}>
                <label>{isCompany ? 'الاسم التجاري بالعربية *' : 'الاسم الكامل *'}</label>
                <input value={form.name_ar} onChange={(e) => set('name_ar', e.target.value)} />
              </div>
              <div className="field" style={{ flex: 2, minWidth: 240 }}>
                <label>الاسم بالإنجليزية</label>
                <input dir="ltr" value={form.name_en || ''}
                       onChange={(e) => set('name_en', e.target.value)} />
              </div>
              <div className="field" style={{ minWidth: 130 }}>
                <label>رقم الجهة</label>
                <input dir="ltr" value={form.entity_code || ''}
                       onChange={(e) => set('entity_code', e.target.value)} />
              </div>
              <div className="field" style={{ minWidth: 220 }}>
                <label>نوع الجهة</label>
                <select value={form.entity_kind || ''}
                        onChange={(e) => set('entity_kind', e.target.value)}>
                  {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>

            {isCompany && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
                <div className="field" style={{ minWidth: 200 }}>
                  <label>السجل التجاري</label>
                  <input dir="ltr" inputMode="numeric" value={form.cr_number || ''}
                         onChange={(e) => set('cr_number', e.target.value)} />
                  {crWarn && (
                    <span className="hint" style={{ color: '#8A6100' }}>
                      السجل التجاري عشرة أرقام — عندك {cr.length}
                    </span>
                  )}
                </div>
                <div className="field" style={{ minWidth: 220 }}>
                  <label>الرقم الضريبي</label>
                  <input dir="ltr" inputMode="numeric" value={form.vat_number || ''}
                         onChange={(e) => set('vat_number', e.target.value)} />
                  {vatWarn && (
                    <span className="hint" style={{ color: '#8A6100' }}>
                      الرقم الضريبي خمسة عشر رقماً يبدأ بـ٣ وينتهي بـ٣
                    </span>
                  )}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
              <div className="field" style={{ minWidth: 200 }}>
                <label>{isCompany ? 'اسم المسؤول' : 'اسم من نتواصل معه'}</label>
                <input value={form.contact_name || ''}
                       onChange={(e) => set('contact_name', e.target.value)} />
              </div>
              <div className="field" style={{ minWidth: 170 }}>
                <label>صفته</label>
                <input value={form.contact_title || ''}
                       onChange={(e) => set('contact_title', e.target.value)}
                       placeholder="مدير المشاريع…" />
              </div>
              <div className="field" style={{ minWidth: 160 }}>
                <label>الجوال</label>
                <input dir="ltr" inputMode="tel" value={form.mobile || ''}
                       onChange={(e) => set('mobile', e.target.value)} />
              </div>
              <div className="field" style={{ minWidth: 200 }}>
                <label>البريد الإلكتروني</label>
                <input dir="ltr" type="email" value={form.email || ''}
                       onChange={(e) => set('email', e.target.value)} />
              </div>
              <div className="field" style={{ minWidth: 140 }}>
                <label>المدينة</label>
                <input value={form.city || ''} onChange={(e) => set('city', e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
              <div className="field" style={{ flex: 1, minWidth: 260 }}>
                <label>العنوان الوطني</label>
                <input value={form.national_address || ''}
                       onChange={(e) => set('national_address', e.target.value)}
                       placeholder="الرمز البريدي · الحي · المدينة" />
              </div>
              <div className="field" style={{ flex: 1, minWidth: 260 }}>
                <label>ملاحظات</label>
                <input value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} />
              </div>
            </div>

            {isCompany && (
              <div style={{ fontSize: 12.5, color: '#777', marginTop: 10 }}>
                السجل التجاري والرقم الضريبي يُطبعان في عروض الأسعار والمستخلصات والفواتير —
                فأدخلهما كما هما في الشهادة حرفاً بحرف.
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn" onClick={save} disabled={busy}>
                {busy ? 'جارٍ…' : (form.id ? 'حفظ التعديلات' : 'إضافة الجهة')}
              </button>
              <button className="btn ghost" onClick={() => setForm(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ============ القائمة ============ */}
      {loading ? (
        <div className="empty">جارٍ التحميل…</div>
      ) : rows.length === 0 ? (
        <div className="empty">
          <h3>لا جهات مسجّلة</h3>
          <p>أضف أول جهة لتظهر في «جهة المشروع» وفي عروض الأسعار.</p>
        </div>
      ) : (
        <div className="section" style={{ overflowX: 'auto' }}>
          <header>
            <h2>الجهات ({shown.length})</h2>
          </header>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'right', padding: '8px 10px' }}>الاسم</th>
                <th style={{ textAlign: 'right', padding: '8px 10px', width: 170 }}>النوع</th>
                <th style={{ padding: '8px', width: 130 }}>السجل التجاري</th>
                <th style={{ padding: '8px', width: 150 }}>الرقم الضريبي</th>
                <th style={{ textAlign: 'right', padding: '8px 10px', width: 170 }}>المسؤول</th>
                <th style={{ padding: '8px', width: 110 }}>الارتباط</th>
                <th style={{ padding: '8px', width: 120 }}>—</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const u = usage[r.id] || { projects: 0, quotes: 0 };
                return (
                  <tr key={r.id}>
                    <td style={{ padding: '7px 10px' }}>
                      <div style={{ fontWeight: 500 }}>{r.name_ar}</div>
                      {r.name_en && (
                        <div style={{ fontSize: 11.5, opacity: .65, direction: 'ltr' }}>{r.name_en}</div>
                      )}
                      {r.city && <div style={{ fontSize: 11.5, opacity: .65 }}>{r.city}</div>}
                    </td>
                    <td style={{ padding: '7px 10px', fontSize: 12.5 }}>
                      {KIND[r.entity_kind] || r.entity_kind || '—'}
                    </td>
                    <td style={{ textAlign: 'center', direction: 'ltr', fontSize: 12.5 }}>
                      {r.cr_number || '—'}
                    </td>
                    <td style={{ textAlign: 'center', direction: 'ltr', fontSize: 12.5 }}>
                      {r.vat_number || '—'}
                    </td>
                    <td style={{ padding: '7px 10px', fontSize: 12.5 }}>
                      {r.contact_name || '—'}
                      {r.contact_title && (
                        <div style={{ fontSize: 11, opacity: .65 }}>{r.contact_title}</div>
                      )}
                      {r.mobile && (
                        <div style={{ fontSize: 11.5, opacity: .75, direction: 'ltr' }}>{r.mobile}</div>
                      )}
                    </td>
                    <td style={{ textAlign: 'center', fontSize: 12 }}>
                      {u.projects ? <div>{u.projects} مشروع</div> : null}
                      {u.quotes ? <div>{u.quotes} عرض</div> : null}
                      {!u.projects && !u.quotes ? <span style={{ opacity: .5 }}>—</span> : null}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button className="btn ghost" style={sm} onClick={() => openEdit(r)}>تعديل</button>
                      <button className="btn ghost" style={sm} onClick={() => remove(r)}>حذف</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const sm = { padding: '3px 10px', fontSize: 12.5, margin: '0 2px' };
