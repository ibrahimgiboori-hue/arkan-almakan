'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { SYSTEM } from '@/lib/system-constitution';
import {
  ConstitutionPage,
  PageHeader,
  Section,
  Notice,
  EmptyState,
} from '@/components/ui/ConstitutionUI';

const ASSETS = [
  { col:'header_image_path', label:'شريط الرأس', hint:'شريط الرأس وحده — يتكرر أعلى كل صفحة مطبوعة' },
  { col:'footer_image_path', label:'شريط التذييل', hint:'شريط التذييل وحده — يتكرر أسفل كل صفحة' },
  { col:'watermark_image_path', label:'العلامة المائية', hint:'وسط الصفحة بلا رأس ولا تذييل — اختياري' },
  { col:'letterhead_image_path', label:'ورق الترويسة كاملاً (للمعاينة)', hint:'صورة A4 كاملة — يستخدمها القبطان عند اختيار الليترهيد الرقمي الكامل' },
  { col:'stamp_image_path', label:'ختم الشركة', hint:'يُفضل PNG بخلفية شفافة' },
  { col:'signature_image_path', label:'توقيع المدير التنفيذي', hint:'اختياري — PNG بخلفية شفافة' },
];

function SettingField({ label, children, hint }) {
  return (
    <div data-ui-role="field-group">
      <label>{label}</label>
      {children}
      {hint ? <span className="hint" data-ui-part="hint">{hint}</span> : null}
    </div>
  );
}

export default function Settings() {
  const [s,setS]=useState(null);
  const [busy,setBusy]=useState('');
  const [msg,setMsg]=useState('');
  const [err,setErr]=useState('');

  const load=()=>supabase.from('app_settings').select('*').eq('id',1).maybeSingle().then(({data})=>setS(data));
  useEffect(()=>{load();},[]);

  const url=(path)=>path?supabase.storage.from('brand').getPublicUrl(path).data.publicUrl:null;

  async function upload(col,file){
    if(!file)return;
    setErr('');setMsg('');setBusy(col);
    const ext=file.name.split('.').pop().toLowerCase();
    const path=`${col}.${ext}`;
    const up=await supabase.storage.from('brand').upload(path,file,{upsert:true,cacheControl:'0'});
    if(up.error){setErr('تعذّر رفع الصورة: '+up.error.message);setBusy('');return;}
    const {error}=await supabase.from('app_settings').update({[col]:path}).eq('id',1);
    setBusy('');
    if(error){setErr(error.message.includes('row-level security')?'رفع الصور وتعديل الإعدادات للمدير التنفيذي فقط.':'تعذّر الحفظ: '+error.message);return;}
    setMsg('تم الرفع');load();
  }

  async function saveField(col,value){
    const {error}=await supabase.from('app_settings').update({[col]:value}).eq('id',1);
    if(error)setErr('تعذّر الحفظ: '+error.message);else{setMsg('تم الحفظ');load();}
  }

  if(!s)return <ConstitutionPage><EmptyState title="جارٍ تحميل بيانات الشركة…" /></ConstitutionPage>;

  const officialFields = [
    ['company_name_ar','الاسم بالعربية','text'],
    ['company_name_en','الاسم بالإنجليزية','ltr'],
    ['cr_number','السجل التجاري','ltr'],
    ['city','المدينة','text'],
    ['phone_1','الجوال الأول','ltr'],
    ['phone_2','الجوال الثاني','ltr'],
    ['email','البريد الإلكتروني','ltr'],
    ['website','الموقع الإلكتروني','ltr'],
    ['national_address','العنوان الوطني','text'],
  ];

  const documentColors = [
    ['العنابي الأساسي',s.color_primary],
    ['العنابي الغامق',s.color_primary_dark],
    ['العنابي الفاتح',s.color_primary_light],
    ['رمادي النص',s.color_text],
  ];

  return <ConstitutionPage>
    <PageHeader
      eyebrow="بوابة الإدارة"
      title="بيانات الشركة"
      description="الهوية والبيانات الرسمية وأصول المستندات التي يعتمد عليها النظام."
    />

    {err ? <Notice tone="error">{err}</Notice> : null}
    {msg ? <Notice tone="success">{msg}</Notice> : null}

    <Section
      title="هوية واجهة البرنامج"
      description="واجهة الشاشة لها توكسيدو واحد معتمد؛ لا تتنافس معها تنسيقات لونية محلية من داخل الصفحات."
      boundary
    >
      <div style={{padding:16}}>
        <div data-ui-role="signature-skin-status">
          <div data-ui-role="signature-skin-copy">
            <strong>ARKAN SIGNATURE</strong>
            <span>الهوية المعتمدة للبرنامج: خمري عميق، عاجي دافئ، ذهبي هادئ وصور سياقية حسب البوابة. تغيير التوكسيدو — عند الحاجة مستقبلًا — يتم من طبقة الجلد المركزية، وليس من إعداد لون متفرق داخل البرنامج.</span>
          </div>
          <div data-ui-role="signature-skin-meta">
            <span data-ui-role="signature-skin-badge">التوكسيدو المعتمد</span>
            <span data-ui-role="signature-swatches" aria-label="ألوان ARKAN SIGNATURE" role="img"><i/><i/><i/><i/><i/></span>
          </div>
        </div>
      </div>
    </Section>

    <Section
      title="أصول الهوية البصرية"
      description="هذه الأصول تخص الشركة والمستندات. رفعها لا يغيّر هندسة واجهة البرنامج ولا دستور الطباعة."
      boundary
    >
      <div style={{padding:16}} data-ui-role="asset-grid">
        {ASSETS.map((a)=><div key={a.col} data-ui-role="asset-card">
          <strong style={{fontSize:13}}>{a.label}</strong>
          <div data-ui-role="asset-preview">
            {s[a.col]
              ? <img src={url(s[a.col])} alt={a.label} />
              : <span style={{fontSize:11.5,color:'var(--ui-text-muted)'}}>لم تُرفع بعد</span>}
          </div>
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e)=>upload(a.col,e.target.files?.[0])} disabled={busy===a.col} style={{fontSize:12,maxWidth:'100%'}} />
          <div className="hint" style={{marginTop:5}}>{a.hint}</div>
          {busy===a.col ? <div style={{fontSize:11.5,color:'var(--ui-accent)'}}>جارٍ الرفع…</div> : null}
        </div>)}
      </div>
    </Section>

    <Section
      title="أبعاد أصول الطباعة"
      description="القياسات هنا للأصول نفسها؛ القبطان للطباعة يظل صاحب هوامش الصفحة ومناطق الأمان وكسر الصفحات."
      boundary
    >
      <div style={{padding:16}}>
        {[['header_height_mm','ارتفاع صورة شريط الرأس',20,60],['footer_height_mm','ارتفاع صورة شريط التذييل',15,50],['stamp_size_mm','حجم الختم الافتراضي',15,55],['signature_size_mm','حجم التوقيع الافتراضي',10,45]].map(([k,label,min,max])=><div key={k} style={{marginBottom:16}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginBottom:6}}><span style={{fontSize:12.5,fontWeight:700}}>{label}</span><span className="mono" style={{fontSize:12,color:'var(--ui-accent)',fontWeight:700}}>{s[k]??0} مم</span></div>
          <input type="range" min={min} max={max} step="0.5" value={Number(s[k]??min)} onChange={(e)=>setS({...s,[k]:Number(e.target.value)})} onMouseUp={(e)=>saveField(k,Number(e.target.value))} onTouchEnd={(e)=>saveField(k,Number(e.target.value))} style={{width:'100%',accentColor:'var(--ui-accent)'}} />
        </div>)}
      </div>
    </Section>

    <div data-ui-role="settings-columns">
      <Section title="البيانات الرسمية" boundary>
        <div style={{padding:16,display:'grid',gap:12}}>
          {officialFields.map(([col,label,kind])=><SettingField key={col} label={label}>
            <input dir={kind==='ltr'?'ltr':undefined} defaultValue={s[col]||''} onBlur={(e)=>saveField(col,e.target.value)} />
          </SettingField>)}
          <SettingField label="نسبة ضريبة القيمة المضافة" hint="القيمة الافتراضية تأتي من دستور النظام وتُطبَّق على العروض الجديدة.">
            <input type="number" step="0.01" min="0" max="1" dir="ltr" defaultValue={s.vat_rate??SYSTEM.vatRate} onBlur={(e)=>saveField('vat_rate',Number(e.target.value||0))} />
          </SettingField>
          <div className="hint">كل خانة تُحفظ بمجرد الخروج منها.</div>
        </div>
      </Section>

      <Section title="الرقم الضريبي والحساب البنكي" boundary>
        <div style={{padding:16,display:'grid',gap:12}}>
          <SettingField label="الرقم الضريبي (١٥ رقماً)" hint="يُحفظ عند الخروج من الخانة.">
            <input dir="ltr" defaultValue={s.vat_number||''} onBlur={(e)=>saveField('vat_number',e.target.value)} />
          </SettingField>
          <SettingField label="اسم البنك والحساب"><input defaultValue={s.bank_name_full||''} onBlur={(e)=>saveField('bank_name_full',e.target.value)} /></SettingField>
          <SettingField label="رقم الحساب"><input dir="ltr" defaultValue={s.bank_account_no||''} onBlur={(e)=>saveField('bank_account_no',e.target.value)} /></SettingField>
          <SettingField label="الآيبان"><input dir="ltr" defaultValue={s.bank_iban||''} onBlur={(e)=>saveField('bank_iban',e.target.value)} /></SettingField>
        </div>
      </Section>
    </div>

    <Section
      title="ألوان الهوية في المستندات"
      description="هذه ألوان المخرجات والمستندات، وليست مفتاحًا لتغيير توكسيدو واجهة الشاشة."
      boundary
    >
      <div style={{padding:16}} data-ui-role="document-color-strip">
        {documentColors.map(([name,color])=><div key={name} data-ui-role="document-color-item">
          <i style={{background:color}} />
          <span>{name}</span>
          <span className="mono">{color}</span>
        </div>)}
      </div>
    </Section>
  </ConstitutionPage>;
}
