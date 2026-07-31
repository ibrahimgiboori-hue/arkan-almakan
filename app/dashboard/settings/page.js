'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const ASSETS = [
  { col: 'header_image_path', label: 'شريط الرأس',
    hint: 'شريط الرأس وحده — يتكرر أعلى كل صفحة مطبوعة' },
  { col: 'footer_image_path', label: 'شريط التذييل',
    hint: 'شريط التذييل وحده — يتكرر أسفل كل صفحة' },
  { col: 'watermark_image_path', label: 'العلامة المائية',
    hint: 'وسط الصفحة بلا رأس ولا تذييل — اختياري' },
  { col: 'letterhead_image_path', label: 'ورق الترويسة كاملاً (للمعاينة)',
    hint: 'صورة A4 كاملة — تُستخدم في النماذج ذات الصفحة الواحدة' },
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

      <div className="section" style={{marginTop:22}}>
        <header><h2>الهوامش وحجم الختم — مركزي لكل المستندات</h2></header>
        <div style={{padding:18}}>
          {[['header_height_mm','ارتفاع شريط الرأس',20,60],
            ['footer_height_mm','ارتفاع شريط التذييل',15,50],
            ['letterhead_top_mm','الهامش العلوي',20,70],
            ['letterhead_bottom_mm','الهامش السفلي',15,60],
            ['letterhead_side_mm','الهامش الجانبي',8,35],
            ['stamp_size_mm','حجم الختم',15,55],
            ['signature_size_mm','حجم التوقيع',10,45]].map(([k,label,min,max]) => (
            <div key={k} style={{marginBottom:16}}>
              <div style={{display:'flex',justifyContent:'space-between',
                           alignItems:'center',marginBottom:5}}>
                <span style={{fontSize:13.5}}>{label}</span>
                <span className="mono" style={{fontSize:13,color:'var(--maroon-dark)',
                                               fontWeight:600}}>{s[k] ?? 0} مم</span>
              </div>
              <input type="range" min={min} max={max} step="0.5"
                     value={Number(s[k] ?? min)}
                     onChange={(e)=>setS({...s,[k]:Number(e.target.value)})}
                     onMouseUp={(e)=>saveField(k, Number(e.target.value))}
                     onTouchEnd={(e)=>saveField(k, Number(e.target.value))}
                     style={{width:'100%',accentColor:'#8B3332'}} />
            </div>
          ))}
          <div className="hint">
            هذه القيم تُطبَّق على كل المستندات. أي مستند يحتاج استثناءً يُضبط من داخله.
            القياس الحقيقي لورقك: الرأس ٤٠ مم والتذييل ٣٢ مم — والفرق هامش أمان.
          </div>
        </div>
      </div>

      <div className="grid k2" style={{marginTop:22}}>
        <div className="section" style={{marginTop:0}}>
          <header><h2>البيانات الرسمية</h2></header>
          <div style={{padding:18}}>
            {[['company_name_ar','الاسم بالعربية','text'],
              ['company_name_en','الاسم بالإنجليزية','ltr'],
              ['cr_number','السجل التجاري','ltr'],
              ['city','المدينة','text'],
              ['phone_1','الجوال الأول','ltr'],
              ['phone_2','الجوال الثاني','ltr'],
              ['email','البريد الإلكتروني','ltr'],
              ['website','الموقع الإلكتروني','ltr'],
              ['national_address','العنوان الوطني','text'],
            ].map(([col,label,kind]) => (
              <div className="field" key={col}>
                <label>{label}</label>
                <input dir={kind === 'ltr' ? 'ltr' : undefined}
                       defaultValue={s[col] || ''}
                       onBlur={(e)=>saveField(col, e.target.value)} />
              </div>
            ))}
            <div className="field">
              <label>نسبة ضريبة القيمة المضافة</label>
              <input type="number" step="0.01" min="0" max="1" dir="ltr"
                     defaultValue={s.vat_rate ?? 0.15}
                     onBlur={(e)=>saveField('vat_rate', Number(e.target.value || 0))} />
              <span className="hint">0.15 تعني ١٥٪ — تُطبَّق على العروض الجديدة</span>
            </div>
            <div className="hint" style={{marginTop:6}}>
              كل خانة تُحفظ بمجرد الخروج منها
            </div>
          </div>
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
