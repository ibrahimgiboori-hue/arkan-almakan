'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const ASSETS = [
  { col: 'letterhead_image_path', label: 'صورة ورق الترويسة (الصفحة الأولى)',
    hint: 'صورة A4 كاملة بالرأس والتذييل — PNG أو JPG بدقة عالية' },
  { col: 'stamp_image_path', label: 'ختم الشركة',
    hint: 'يُفضل PNG بخلفية شفافة' },
  { col: 'signature_image_path', label: 'توقيع المدير التنفيذي',
    hint: 'اختياري — PNG بخلفية شفافة' },
];

export default function Settings() {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = () => supabase.from('app_settings').select('*').eq('id',1).maybeSingle()
    .then(({ data }) => setS(data));

  useEffect(() => { load(); }, []);

  const url = (path) =>
    path ? supabase.storage.from('brand').getPublicUrl(path).data.publicUrl : null;

  async function upload(col, file) {
    if (!file) return;
    setErr(''); setMsg(''); setBusy(col);
    const ext = file.name.split('.').pop().toLowerCase();
    const path = `${col}.${ext}`;

    const up = await supabase.storage.from('brand')
      .upload(path, file, { upsert: true, cacheControl: '0' });

    if (up.error) {
      setErr('تعذّر رفع الصورة: ' + up.error.message);
      setBusy(''); return;
    }

    const { error } = await supabase.from('app_settings')
      .update({ [col]: path }).eq('id', 1);

    setBusy('');
    if (error) {
      setErr(error.message.includes('row-level security')
        ? 'رفع الصور وتعديل الإعدادات للمدير التنفيذي فقط.'
        : 'تعذّر الحفظ: ' + error.message);
      return;
    }
    setMsg('تم الرفع');
    load();
  }

  async function saveField(col, value) {
    const { error } = await supabase.from('app_settings').update({ [col]: value }).eq('id',1);
    if (error) setErr('تعذّر الحفظ: ' + error.message);
    else { setMsg('تم الحفظ'); load(); }
  }

  if (!s) return <div className="empty">جارٍ التحميل…</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>بيانات الشركة</h1>
          <p>تُستخدم في كل مستند يصدر من النظام</p>
        </div>
      </div>

      {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:14}}>{msg}</div>}

      <div className="section" style={{marginTop:0}}>
        <header><h2>أصول الهوية البصرية</h2></header>
        <div style={{padding:18,display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:18}}>
          {ASSETS.map((a) => (
            <div key={a.col}>
              <div style={{fontSize:13.5,marginBottom:6}}>{a.label}</div>
              <div style={{border:'1px solid var(--hair)',background:'#FBF7F7',height:150,
                           display:'flex',alignItems:'center',justifyContent:'center',marginBottom:8}}>
                {s[a.col]
                  ? <img src={url(s[a.col])} alt={a.label}
                         style={{maxWidth:'100%',maxHeight:'100%',objectFit:'contain'}} />
                  : <span style={{fontSize:12.5,color:'var(--maroon-light)'}}>لم تُرفع بعد</span>}
              </div>
              <input type="file" accept="image/png,image/jpeg,image/webp"
                     onChange={(e)=>upload(a.col, e.target.files?.[0])}
                     disabled={busy === a.col} style={{fontSize:13}} />
              <div className="hint" style={{marginTop:4}}>{a.hint}</div>
              {busy === a.col && <div style={{fontSize:12.5,color:'var(--maroon)'}}>جارٍ الرفع…</div>}
            </div>
          ))}
        </div>
      </div>

      <div className="grid k2" style={{marginTop:22}}>
        <div className="section" style={{marginTop:0}}>
          <header><h2>البيانات الرسمية</h2></header>
          <table>
            <tbody>
              {[['الاسم بالعربية', s.company_name_ar],
                ['الاسم بالإنجليزية', s.company_name_en],
                ['السجل التجاري', s.cr_number],
                ['المدينة', s.city],
                ['الجوال الأول', s.phone_1],
                ['الجوال الثاني', s.phone_2],
                ['البريد الإلكتروني', s.email],
                ['الموقع', s.website],
                ['نسبة الضريبة', `${(Number(s.vat_rate)*100).toFixed(0)}%`],
                ['هوامش الترويسة', `${s.letterhead_top_mm} / ${s.letterhead_bottom_mm} / ${s.letterhead_side_mm} مم`],
              ].map(([k,v]) => (
                <tr key={k}><td style={{color:'var(--ink-soft)',width:'45%'}}>{k}</td><td>{v || '—'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="section" style={{marginTop:0}}>
          <header><h2>الرقم الضريبي والحساب البنكي</h2></header>
          <div style={{padding:18}}>
            <div className="field">
              <label>الرقم الضريبي (١٥ رقماً)</label>
              <input dir="ltr" defaultValue={s.vat_number || ''}
                     onBlur={(e)=>saveField('vat_number', e.target.value)} />
              <span className="hint">يُحفظ عند الخروج من الخانة</span>
            </div>
            <div className="field">
              <label>اسم البنك والحساب</label>
              <input defaultValue={s.bank_name_full || ''}
                     onBlur={(e)=>saveField('bank_name_full', e.target.value)} />
            </div>
            <div className="field">
              <label>رقم الحساب</label>
              <input dir="ltr" defaultValue={s.bank_account_no || ''}
                     onBlur={(e)=>saveField('bank_account_no', e.target.value)} />
            </div>
            <div className="field">
              <label>الآيبان</label>
              <input dir="ltr" defaultValue={s.bank_iban || ''}
                     onBlur={(e)=>saveField('bank_iban', e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      <div className="section">
        <header><h2>ألوان الهوية</h2></header>
        <div style={{padding:18,display:'flex',gap:26,flexWrap:'wrap'}}>
          {[['العنابي الأساسي', s.color_primary],['العنابي الغامق', s.color_primary_dark],
            ['العنابي الفاتح', s.color_primary_light],['رمادي النص', s.color_text]].map(([n,c]) => (
            <div key={n} style={{display:'flex',alignItems:'center',gap:10}}>
              <span style={{width:34,height:34,background:c,border:'1px solid var(--hair)'}} />
              <span style={{fontSize:13.5}}>{n}</span>
              <span className="mono" style={{fontSize:12.5,color:'var(--ink-soft)'}}>{c}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
