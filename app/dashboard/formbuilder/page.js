'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { uid } from '@/lib/form-engine';
import { categoryLabel } from '@/lib/document-catalog.mjs';

export default function FormBuilderList() {
  const router = useRouter();
  const [rows, setRows] = useState(null);
  const [role, setRole] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const sess = (await supabase.auth.getSession()).data.session;
    const [t, u] = await Promise.all([
      supabase.from('document_templates').select('*')
        .order('is_custom', { ascending: false }).order('code'),
      supabase.from('app_users').select('role').eq('id', sess?.user?.id).maybeSingle(),
    ]);
    setRows(t.data || []); setRole(u.data?.role || null);
  }

  useEffect(() => { load(); }, []);

  async function create() {
    setErr(''); setBusy(true);
    const code = 'CUSTOM_' + uid().toUpperCase();
    const { error } = await supabase.from('document_templates').insert({
      code, name_ar: 'نموذج جديد', category: 'custom', prefix: 'CST', is_custom: true,
      template_source: 'user', relation_scope: ['general'], keywords: [],
      constitution_version: '1.16', template_profile: 'user_defined',
      layout: { schemaVersion: 3, gridColumns: 48, constitutionVersion: '1.16', sections: [
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

  async function duplicate(t) {
    setErr(''); setMsg(''); setBusy(true);
    const code = 'CUSTOM_' + uid().toUpperCase();
    const { error } = await supabase.from('document_templates').insert({
      code, name_ar: t.name_ar + ' (نسخة)', name_en: t.name_en, title_en: t.title_en,
      category: t.category, prefix: t.prefix, is_custom: true,
      template_source: 'user', relation_scope: t.relation_scope || ['general'],
      keywords: t.keywords || [], description_ar: t.description_ar,
      constitution_version: '1.16', template_profile: t.template_profile || 'user_defined',
      layout: t.layout, logic: t.logic,
      intro_text: t.intro_text, closing_text: t.closing_text,
      show_stamp: t.show_stamp, show_bank: t.show_bank,
    });
    setBusy(false);
    if (error) { setErr('تعذّر النسخ: ' + error.message); return; }
    router.push(`/dashboard/formbuilder/${code}`);
  }

  async function remove(t) {
    if (!window.confirm(`حذف نموذج "${t.name_ar}"؟`)) return;
    setErr(''); setMsg('');
    const { data, error } = await supabase.rpc('delete_template_safe', { p_code: t.code });
    if (error) { setErr(error.message); return; }
    setMsg(data); load();
  }

  async function toggleActive(t) {
    const { error } = await supabase.from('document_templates')
      .update({ is_active: !t.is_active }).eq('code', t.code);
    if (error) setErr(error.message); else load();
  }

  if (!rows) return <div className="empty">جارٍ التحميل…</div>;

  const sourceOf = (row) => row.template_source
    || (row.code?.startsWith('CUSTOM_') ? 'user' : row.is_custom ? 'system' : 'system');
  const custom = rows.filter((r) => sourceOf(r) === 'user');
  const catalog = rows.filter((r) => sourceOf(r) === 'catalog');
  const builtin = rows.filter((r) => sourceOf(r) === 'system');
  const canWrite = ['ceo','hr'].includes(role);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>محرّر النماذج</h1>
          <p>النموذج بياناتٌ لا كود — تبنيه على شبكة الدستور ذات 48 وحدة وتحفظ نسختك مستقلة عن الكتالوج</p>
        </div>
        <button className="btn" onClick={create} disabled={busy}>
          {busy ? 'جارٍ…' : 'نموذج جديد'}
        </button>
      </div>

      {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:14}}>{msg}</div>}

      <div className="section" style={{marginTop:0}}>
        <header><h2>نماذجك المخصصة ({custom.length})</h2></header>
        {custom.length === 0 ? (
          <div className="empty"><h3>لا نماذج مخصصة</h3>
            <p>أنشئ نموذجاً وابنِ أقسامه وحقوله ومعادلاته بنفسك.</p></div>
        ) : (
          <table>
            <thead>
              <tr><th>الاسم</th><th>الرمز</th><th className="num">الأقسام</th>
                  <th className="num">المعادلات</th><th>الحالة</th>
                  <th style={{width:250}}>الإجراءات</th></tr>
            </thead>
            <tbody>
              {custom.map((t) => (
                <tr key={t.code} style={t.is_active === false ? {opacity:.55} : undefined}>
                  <td><Link href={`/dashboard/formbuilder/${t.code}`}>{t.name_ar}</Link></td>
                  <td className="mono">{t.code}</td>
                  <td className="num">{t.layout?.sections?.length || 0}</td>
                  <td className="num">{t.logic?.length || 0}</td>
                  <td>
                    <span className={`pill ${t.is_active === false ? '' : 'ok'}`}>
                      {t.is_active === false ? 'معطّل' : 'نشط'}
                    </span>
                  </td>
                  <td>
                    <div className="rowsplit">
                      <Link className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}}
                            href={`/dashboard/formbuilder/${t.code}`}>تحرير</Link>
                      <Link className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}}
                            href={`/dashboard/documents/new/${t.code}`}>تعبئة</Link>
                      {canWrite && (
                        <>
                          <button className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}}
                                  onClick={()=>duplicate(t)}>نسخ</button>
                          <button className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}}
                                  onClick={()=>toggleActive(t)}>
                            {t.is_active === false ? 'تفعيل' : 'تعطيل'}
                          </button>
                          <button className="btn ghost" style={{padding:'4px 9px',fontSize:12.5,
                                          borderColor:'#EBC3C0',color:'#A32B24'}}
                                  onClick={()=>remove(t)}>حذف</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="section">
        <header><h2>الكتالوج الدستوري ({catalog.length})</h2></header>
        <div style={{padding:'14px 18px',fontSize:13.5,color:'var(--ink-soft)',lineHeight:1.8}}>
          هذه قوالب مركزية محمية من التعديل المباشر. استخدمها كما هي، أو أنشئ نسخة مخصصة منها لتغيّر الحقول دون التأثير في بقية المعاملات.
        </div>
        <table>
          <thead><tr><th>النموذج</th><th>العائلة</th><th>الارتباط</th><th>الإصدار</th>
                     <th style={{width:175}}>الإجراءات</th></tr></thead>
          <tbody>
            {catalog.map((t) => (
              <tr key={t.code} style={t.is_active === false ? {opacity:.55} : undefined}>
                <td><strong>{t.name_ar}</strong><div className="mono" style={{fontSize:10.5,color:'var(--ink-soft)'}}>{t.code}</div></td>
                <td>{categoryLabel(t.category)}</td>
                <td>{(t.relation_scope || []).map((x)=>({employee:'موظف',project:'مشروع',party:'طرف',general:'عام'}[x] || x)).join(' + ')}</td>
                <td className="mono">{t.constitution_version || '—'}</td>
                <td>
                  <div className="rowsplit">
                    <Link className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}}
                          href={`/dashboard/documents/new/${t.code}`}>تعبئة</Link>
                    {canWrite && <button className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}}
                                         onClick={()=>duplicate(t)}>نسخ للتعديل</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section">
        <header><h2>النماذج المدمجة ({builtin.length})</h2></header>
        <div style={{padding:'14px 18px',fontSize:13.5,color:'var(--ink-soft)'}}>
          حقولها ثابتة في النظام. تستطيع تعطيلها لتختفي من قائمة النماذج، أو نسخها
          لتصنع منها نسخة مخصصة تعدّلها كما تشاء.
        </div>
        <table>
          <thead><tr><th>الاسم</th><th>الرمز</th><th>الحالة</th>
                     <th style={{width:180}}>الإجراءات</th></tr></thead>
          <tbody>
            {builtin.map((t) => (
              <tr key={t.code} style={t.is_active === false ? {opacity:.55} : undefined}>
                <td>{t.name_ar}</td>
                <td className="mono">{t.code}</td>
                <td>
                  <span className={`pill ${t.is_active === false ? '' : 'ok'}`}>
                    {t.is_active === false ? 'معطّل' : 'نشط'}
                  </span>
                </td>
                <td>
                  {canWrite && (
                    <div className="rowsplit">
                      <button className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}}
                              onClick={()=>duplicate(t)}>نسخ للتعديل</button>
                      <button className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}}
                              onClick={()=>toggleActive(t)}>
                        {t.is_active === false ? 'تفعيل' : 'تعطيل'}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
