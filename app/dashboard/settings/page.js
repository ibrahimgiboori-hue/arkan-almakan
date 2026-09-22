'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { SYSTEM } from '@/lib/system-constitution';
import {
  ConstitutionPage,
  PageHeader,
  Section,
  Notice,
  EmptyState,
} from '@/components/ui/ConstitutionUI';

const OVERLAY_ASSETS = [
  { col:'stamp_image_path', label:'ختم الشركة', hint:'طبقة حرة فوق المحتوى — يُفضل PNG بخلفية شفافة' },
  { col:'signature_image_path', label:'توقيع المدير التنفيذي', hint:'طبقة حرة فوق المحتوى — PNG بخلفية شفافة' },
];

const A4_RATIO = 210 / 297;

async function imageBitmapFromFile(file){
  if(typeof createImageBitmap === 'function') return createImageBitmap(file);
  const url = URL.createObjectURL(file);
  try{
    const image = await new Promise((resolve,reject)=>{
      const img = new Image();
      img.onload=()=>resolve(img);
      img.onerror=reject;
      img.src=url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function smoothProfile(values, radius=3){
  return values.map((_,index)=>{
    let sum=0,count=0;
    for(let i=Math.max(0,index-radius);i<=Math.min(values.length-1,index+radius);i+=1){
      sum+=values[i];count+=1;
    }
    return count ? sum/count : 0;
  });
}

function findProtectedEnd(profile, fromStart=true){
  if(!profile.length) return null;
  const length=profile.length;
  const threshold=0.012;
  const gap=Math.max(6,Math.round(length*0.012));
  if(fromStart){
    const limit=Math.floor(length*0.42);
    let first=-1,lastSignal=-1,quiet=0;
    for(let i=0;i<limit;i+=1){
      if(profile[i]>=threshold){
        if(first<0)first=i;
        lastSignal=i;quiet=0;
      }else if(first>=0){
        quiet+=1;
        if(quiet>=gap && lastSignal>=0)return lastSignal;
      }
    }
    return lastSignal>=0 ? lastSignal : null;
  }
  const limit=Math.ceil(length*0.58);
  let first=-1,lastSignal=-1,quiet=0;
  for(let i=length-1;i>=limit;i-=1){
    if(profile[i]>=threshold){
      if(first<0)first=i;
      lastSignal=i;quiet=0;
    }else if(first>=0){
      quiet+=1;
      if(quiet>=gap && lastSignal>=0)return lastSignal;
    }
  }
  return lastSignal>=0 ? lastSignal : null;
}

async function analyzeStationery(file){
  const bitmap=await imageBitmapFromFile(file);
  const sourceWidth=Number(bitmap.width || bitmap.naturalWidth || 0);
  const sourceHeight=Number(bitmap.height || bitmap.naturalHeight || 0);
  if(!sourceWidth || !sourceHeight)throw new Error('تعذّر قراءة أبعاد ورقة المطبوعات.');

  const maxWidth=900;
  const scale=Math.min(1,maxWidth/sourceWidth);
  const width=Math.max(1,Math.round(sourceWidth*scale));
  const height=Math.max(1,Math.round(sourceHeight*scale));
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw new Error('تعذّر تحليل ورقة المطبوعات.');
  ctx.drawImage(bitmap,0,0,width,height);
  bitmap.close?.();

  const data=ctx.getImageData(0,0,width,height).data;
  const rowDensity=new Array(height).fill(0);
  for(let y=0;y<height;y+=1){
    let ink=0;
    const offset=y*width*4;
    for(let x=0;x<width;x+=1){
      const p=offset+x*4;
      const alpha=data[p+3]/255;
      if(alpha<0.05)continue;
      const lum=0.2126*data[p]+0.7152*data[p+1]+0.0722*data[p+2];
      if(lum<242)ink+=1;
    }
    rowDensity[y]=ink/width;
  }
  const profile=smoothProfile(rowDensity,3);
  const headerEnd=findProtectedEnd(profile,true);
  const footerStart=findProtectedEnd(profile,false);

  const ratio=sourceWidth/sourceHeight;
  const aspectErrorPct=Math.abs((ratio-A4_RATIO)/A4_RATIO)*100;
  const headerHeightMm=headerEnd==null ? null : Math.round(((headerEnd+1)/height)*2970)/10;
  const footerHeightMm=footerStart==null ? null : Math.round(((height-footerStart)/height)*2970)/10;
  const contentHeightMm=(headerHeightMm!=null && footerHeightMm!=null)
    ? Math.max(0,Math.round((297-headerHeightMm-footerHeightMm)*10)/10)
    : null;

  let sha256='';
  try{
    const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
    sha256=Array.from(new Uint8Array(digest)).map((b)=>b.toString(16).padStart(2,'0')).join('');
  }catch{}

  return {
    version:1,
    sourceWidthPx:sourceWidth,
    sourceHeightPx:sourceHeight,
    aspectRatio:Math.round(ratio*100000)/100000,
    expectedA4Ratio:Math.round(A4_RATIO*100000)/100000,
    aspectErrorPct:Math.round(aspectErrorPct*100)/100,
    isA4Like:aspectErrorPct<=2,
    headerHeightMm,
    footerHeightMm,
    contentHeightMm,
    sourceSha256:sha256,
    fileSize:file.size,
    mimeType:file.type || '',
    analyzedAt:new Date().toISOString(),
  };
}

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
    try{
      const ext=file.name.split('.').pop().toLowerCase();
      const path=`${col}.${ext}`;
      const analysis=col==='letterhead_image_path' ? await analyzeStationery(file) : null;
      const up=await supabase.storage.from('brand').upload(path,file,{upsert:true,cacheControl:'0'});
      if(up.error)throw new Error('تعذّر رفع الصورة: '+up.error.message);
      const payload={ [col]:path };
      if(analysis)payload.stationery_analysis=analysis;
      const {error}=await supabase.from('app_settings').update(payload).eq('id',1);
      if(error)throw new Error(error.message.includes('row-level security')
        ? 'رفع الصور وتعديل الإعدادات للمدير التنفيذي فقط.'
        : 'تعذّر الحفظ: '+error.message);
      setMsg(analysis
        ? `تم اعتماد ورقة المطبوعات كمصدر الهوية الوحيد وتحليلها: ${analysis.sourceWidthPx}×${analysis.sourceHeightPx}px`
        : 'تم الرفع');
      load();
    }catch(error){
      setErr(error?.message || 'تعذّر رفع وتحليل الأصل.');
    }finally{
      setBusy('');
    }
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
      title="عائلات المطبوعات"
      description="ملفات Excel التي تملك تصميم المطبوعات: تحميل، تعديل، رفع واعتماد نسخة جديدة."
      boundary
    >
      <div style={{padding:16,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
        <div className="hint">كل عائلة مصنف واحد، وكل Sheet غير نظامية نموذج فعلي داخل البرنامج.</div>
        <Link className="btn" href="/dashboard/settings/print-families">فتح عائلات المطبوعات</Link>
      </div>
    </Section>

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
      title="مصدر الهوية البصرية للمطبوعات"
      description="مصدر واحد فقط: صورة ورقة المطبوعات A4 كاملة. البرنامج يحللها عند الرفع ويستخرج أبعادها ونسبة A4 والمناطق المحمية، ولا يعتمد على صور منفصلة للرأس أو التذييل أو العلامة المائية."
      boundary
    >
      <div style={{padding:16,display:'grid',gridTemplateColumns:'minmax(320px,1.6fr) repeat(2,minmax(210px,.7fr))',gap:14,alignItems:'stretch'}}>
        <div data-ui-role="asset-card">
          <strong style={{fontSize:14}}>ورقة المطبوعات A4 — مصدر الحقيقة الوحيد</strong>
          <div data-ui-role="asset-preview" style={{minHeight:260}}>
            {s.letterhead_image_path
              ? <img src={url(s.letterhead_image_path)} alt="ورقة المطبوعات A4" style={{objectFit:'contain'}} />
              : <span style={{fontSize:11.5,color:'var(--ui-text-muted)'}}>لم تُرفع بعد</span>}
          </div>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e)=>upload('letterhead_image_path',e.target.files?.[0])}
            disabled={busy==='letterhead_image_path'}
            style={{fontSize:12,maxWidth:'100%'}}
          />
          <div className="hint" style={{marginTop:7}}>
            عند كل رفع يعيد البرنامج تحليل الأصل نفسه ويخزن التحليل فقط كبيانات مشتقة؛ الصورة الكاملة تبقى المصدر الوحيد للهوية.
          </div>
          {busy==='letterhead_image_path'
            ? <div style={{fontSize:11.5,color:'var(--ui-accent)'}}>جارٍ القياس والتحليل والرفع…</div>
            : null}

          {s.stationery_analysis && Object.keys(s.stationery_analysis).length ? <div style={{
            marginTop:12,padding:10,border:'1px solid var(--ui-border-soft)',borderRadius:8,
            display:'grid',gridTemplateColumns:'repeat(2,minmax(120px,1fr))',gap:'7px 12px',fontSize:12,
          }}>
            <span>الأبعاد الأصلية</span><strong dir="ltr">{s.stationery_analysis.sourceWidthPx} × {s.stationery_analysis.sourceHeightPx}px</strong>
            <span>مطابقة نسبة A4</span><strong>{s.stationery_analysis.isA4Like ? 'مطابقة' : `انحراف ${s.stationery_analysis.aspectErrorPct}%`}</strong>
            <span>منطقة الرأس المكتشفة</span><strong>{s.stationery_analysis.headerHeightMm ?? '—'} مم</strong>
            <span>منطقة التذييل المكتشفة</span><strong>{s.stationery_analysis.footerHeightMm ?? '—'} مم</strong>
            <span>المساحة الوسطية</span><strong>{s.stationery_analysis.contentHeightMm ?? '—'} مم</strong>
          </div> : null}
        </div>

        {OVERLAY_ASSETS.map((a)=><div key={a.col} data-ui-role="asset-card">
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
      title="إعدادات الطبقات فوق ورقة المطبوعات"
      description="الرأس والتذييل والعلامة المائية لا تُرفع منفصلة. هذه الإعدادات تخص الطبقة البيضاء والختم والتوقيع فقط."
      boundary
    >
      <div style={{padding:16}}>
        {[['stamp_size_mm','حجم الختم الافتراضي',15,55],['signature_size_mm','حجم التوقيع الافتراضي',10,45]].map(([k,label,min,max])=><div key={k} style={{marginBottom:16}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginBottom:6}}><span style={{fontSize:12.5,fontWeight:700}}>{label}</span><span className="mono" style={{fontSize:12,color:'var(--ui-accent)',fontWeight:700}}>{s[k]??0} مم</span></div>
          <input type="range" min={min} max={max} step="0.5" value={Number(s[k]??min)} onChange={(e)=>setS({...s,[k]:Number(e.target.value)})} onMouseUp={(e)=>saveField(k,Number(e.target.value))} onTouchEnd={(e)=>saveField(k,Number(e.target.value))} style={{width:'100%',accentColor:'var(--ui-accent)'}} />
        </div>)}

        <div style={{marginBottom:16}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginBottom:6}}>
            <span style={{fontSize:12.5,fontWeight:700}}>عتامة الطبقة البيضاء فوق المطبوعات</span>
            <span className="mono" style={{fontSize:12,color:'var(--ui-accent)',fontWeight:700}}>{Math.round(Number(s.print_white_veil_opacity ?? 0.82) * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={Number(s.print_white_veil_opacity ?? 0.82)}
            onChange={(e)=>setS({...s,print_white_veil_opacity:Number(e.target.value)})}
            onMouseUp={(e)=>saveField('print_white_veil_opacity',Number(e.target.value))}
            onTouchEnd={(e)=>saveField('print_white_veil_opacity',Number(e.target.value))}
            style={{width:'100%',accentColor:'var(--ui-accent)'}}
          />
          <div className="hint" style={{marginTop:5}}>
            تغطي كامل مساحة الصفحة بين الهيدر والفوتر فقط: 0% شفافة تمامًا، 100% بيضاء بالكامل.
          </div>
        </div>
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
