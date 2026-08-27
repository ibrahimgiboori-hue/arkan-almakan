'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { STAGE_AR, SCOPE_AR } from '@/lib/projects';
import { ConstitutionPage, Section, Notice } from '@/components/ui/ConstitutionUI';

const SOURCE_OPTIONS = ['من المالك مباشرة','عطاء أو مناقصة','باطن من شركة أخرى','أسندناه بالباطن'];
const ROLE_OPTIONS = ['طرف أول (مالك العمل)','طرف ثاني (منفذ)'];
const CLAIM_OPTIONS = ['مستخلص شهري','عند نسبة إنجاز','دفعة واحدة عند التسليم','بحسب سير الأعمال'];

const INITIAL = {
  name_ar:'',
  city:'',
  site_address:'',
  stage:'opportunity',
  supply_scope:'labor_only',
  source_kind:'',
  our_role:'',
  entity_id:'',
  originator_id:'',
  supervisor_id:'',
  signed_date:'',
  commencement_date:'',
  duration_days:'',
  delay_penalty_text:'',
  delay_penalty_daily:'',
  advance_pct:'',
  advance_amount:'',
  retention_pct:'',
  payment_terms_days:'30',
  claim_basis:'',
  notes:'',
};

function nullableText(value){
  const text=String(value??'').trim();
  return text||null;
}
function nullableNumber(value){
  return value===''||value===null||value===undefined ? null : Number(value);
}
function pctToDecimal(value){
  return value===''||value===null||value===undefined ? 0 : Number(value)/100;
}

export default function NewProjectPage(){
  const router=useRouter();
  const [form,setForm]=useState(INITIAL);
  const [employees,setEmployees]=useState([]);
  const [entities,setEntities]=useState([]);
  const [canCreate,setCanCreate]=useState(null);
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState('');

  useEffect(()=>{
    let alive=true;
    (async()=>{
      const session=(await supabase.auth.getSession()).data.session;
      const [capsQ,primaryQ,userQ,empsQ,entsQ]=await Promise.all([
        supabase.from('v_my_capabilities').select('capability_key'),
        supabase.rpc('fn_is_primary_user'),
        session?.user?.id ? supabase.from('app_users').select('is_system_admin').eq('id',session.user.id).maybeSingle() : Promise.resolve({data:null,error:null}),
        supabase.from('employees').select('id,full_name_ar,employee_no').order('employee_no'),
        supabase.from('entities').select('id,name_ar').order('name_ar'),
      ]);
      if(!alive)return;
      const full=primaryQ.data===true||Boolean(userQ.data?.is_system_admin);
      const allowed=full||(capsQ.data||[]).some((cap)=>cap.capability_key==='projects.projects.create');
      setCanCreate(allowed);
      setEmployees(empsQ.data||[]);
      setEntities(entsQ.data||[]);
    })();
    return()=>{alive=false;};
  },[]);

  function field(name,value){
    setForm((current)=>({...current,[name]:value}));
  }

  async function submit(event){
    event.preventDefault();
    setErr('');
    if(!form.name_ar.trim()){
      setErr('اسم المشروع مطلوب.');
      return;
    }
    if(!canCreate){
      setErr('ليس لديك صلاحية إنشاء مشروع.');
      return;
    }

    setBusy(true);
    const {data:number,error:numberError}=await supabase.rpc('next_document_number',{p_doc_type:'PROJECT',p_prefix:'PRJ'});
    if(numberError){
      setBusy(false);
      setErr('تعذّر توليد رقم المشروع: '+numberError.message);
      return;
    }

    const payload={
      project_no:number,
      name_ar:form.name_ar.trim(),
      city:nullableText(form.city),
      site_address:nullableText(form.site_address),
      stage:form.stage,
      status:'active',
      supply_scope:form.supply_scope,
      source_kind:nullableText(form.source_kind),
      our_role:nullableText(form.our_role),
      entity_id:form.entity_id||null,
      originator_id:form.originator_id||null,
      supervisor_id:form.supervisor_id||null,
      signed_date:form.signed_date||null,
      commencement_date:form.commencement_date||null,
      duration_days:nullableNumber(form.duration_days),
      delay_penalty_text:nullableText(form.delay_penalty_text),
      delay_penalty_daily:nullableNumber(form.delay_penalty_daily),
      advance_pct:pctToDecimal(form.advance_pct),
      advance_amount:Number(form.advance_amount||0),
      retention_pct:pctToDecimal(form.retention_pct),
      payment_terms_days:Number(form.payment_terms_days||30),
      claim_basis:nullableText(form.claim_basis),
      notes:nullableText(form.notes),
    };

    const {data,error}=await supabase.from('projects').insert(payload).select('id').single();
    setBusy(false);
    if(error){
      setErr('تعذّر إنشاء المشروع: '+error.message);
      return;
    }
    router.replace(`/dashboard/projects/${data.id}?view=settings`);
  }

  if(canCreate===false){
    return <ConstitutionPage><Notice tone="error">ليس لديك صلاحية إنشاء مشروع.</Notice></ConstitutionPage>;
  }

  return (
    <ConstitutionPage>
      {err&&<Notice tone="error">{err}</Notice>}
      <form onSubmit={submit}>
        <Section title="التعريف" description="البيانات الأساسية التي تعرّف المشروع وتحدد نطاقه.">
          <div className="form-grid" style={{padding:18}}>
            <div className="field span2">
              <label>اسم المشروع *</label>
              <input autoFocus value={form.name_ar} onChange={(e)=>field('name_ar',e.target.value)} placeholder="مثال: مشروع الفرسان" />
            </div>
            <div className="field">
              <label>المدينة</label>
              <input value={form.city} onChange={(e)=>field('city',e.target.value)} placeholder="الرياض" />
            </div>
            <div className="field span2">
              <label>الموقع / العنوان</label>
              <input value={form.site_address} onChange={(e)=>field('site_address',e.target.value)} />
            </div>
            <div className="field">
              <label>المرحلة</label>
              <select value={form.stage} onChange={(e)=>field('stage',e.target.value)}>{Object.entries(STAGE_AR).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
            </div>
            <div className="field">
              <label>نطاق التوريد</label>
              <select value={form.supply_scope} onChange={(e)=>field('supply_scope',e.target.value)}>{Object.entries(SCOPE_AR).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
            </div>
            <div className="field">
              <label>مصدر المشروع</label>
              <select value={form.source_kind} onChange={(e)=>field('source_kind',e.target.value)}><option value="">—</option>{SOURCE_OPTIONS.map((x)=><option key={x} value={x}>{x}</option>)}</select>
            </div>
            <div className="field">
              <label>صفة أركان</label>
              <select value={form.our_role} onChange={(e)=>field('our_role',e.target.value)}><option value="">—</option>{ROLE_OPTIONS.map((x)=><option key={x} value={x}>{x}</option>)}</select>
            </div>
            <div className="field span2">
              <label>الجهة / العميل</label>
              <select value={form.entity_id} onChange={(e)=>field('entity_id',e.target.value)}><option value="">—</option>{entities.map((x)=><option key={x.id} value={x.id}>{x.name_ar}</option>)}</select>
            </div>
          </div>
        </Section>

        <Section title="الفريق" description="يمكن ترك الفريق فارغًا وإسناده لاحقًا.">
          <div className="form-grid" style={{padding:18}}>
            <div className="field">
              <label>جالب المشروع</label>
              <select value={form.originator_id} onChange={(e)=>field('originator_id',e.target.value)}><option value="">—</option>{employees.map((x)=><option key={x.id} value={x.id}>{x.full_name_ar}</option>)}</select>
            </div>
            <div className="field">
              <label>المشرف</label>
              <select value={form.supervisor_id} onChange={(e)=>field('supervisor_id',e.target.value)}><option value="">—</option>{employees.map((x)=><option key={x.id} value={x.id}>{x.full_name_ar}</option>)}</select>
            </div>
          </div>
        </Section>

        <Section title="العقد والمدد" description="تواريخ ومدة التنفيذ والغرامات إن وجدت.">
          <div className="form-grid" style={{padding:18}}>
            <div className="field"><label>تاريخ التوقيع</label><input type="date" dir="ltr" value={form.signed_date} onChange={(e)=>field('signed_date',e.target.value)} /></div>
            <div className="field"><label>تاريخ أمر المباشرة</label><input type="date" dir="ltr" value={form.commencement_date} onChange={(e)=>field('commencement_date',e.target.value)} /></div>
            <div className="field"><label>مدة التنفيذ (يوم)</label><input type="number" min="0" dir="ltr" value={form.duration_days} onChange={(e)=>field('duration_days',e.target.value)} /></div>
            <div className="field span2"><label>غرامة التأخير</label><input value={form.delay_penalty_text} onChange={(e)=>field('delay_penalty_text',e.target.value)} placeholder="مثال: 1% من قيمة العقد لكل أسبوع تأخير" /></div>
            <div className="field"><label>الغرامة اليومية</label><input type="number" min="0" step="0.01" dir="ltr" value={form.delay_penalty_daily} onChange={(e)=>field('delay_penalty_daily',e.target.value)} /></div>
          </div>
        </Section>

        <Section title="الشروط المالية" description="النسب تُكتب كنسبة مئوية مباشرة؛ مثال 10 يعني 10%.">
          <div className="form-grid" style={{padding:18}}>
            <div className="field"><label>الدفعة المقدمة (%)</label><input type="number" min="0" max="100" step="0.01" dir="ltr" value={form.advance_pct} onChange={(e)=>field('advance_pct',e.target.value)} /></div>
            <div className="field"><label>الدفعة المقدمة (مبلغ)</label><input type="number" min="0" step="0.01" dir="ltr" value={form.advance_amount} onChange={(e)=>field('advance_amount',e.target.value)} /></div>
            <div className="field"><label>نسبة المحتجزات (%)</label><input type="number" min="0" max="100" step="0.01" dir="ltr" value={form.retention_pct} onChange={(e)=>field('retention_pct',e.target.value)} /></div>
            <div className="field"><label>مدة السداد (يوم)</label><input type="number" min="0" dir="ltr" value={form.payment_terms_days} onChange={(e)=>field('payment_terms_days',e.target.value)} /></div>
            <div className="field span2"><label>أساس المستخلصات</label><select value={form.claim_basis} onChange={(e)=>field('claim_basis',e.target.value)}><option value="">—</option>{CLAIM_OPTIONS.map((x)=><option key={x} value={x}>{x}</option>)}</select></div>
            <div className="field span2"><label>ملاحظات</label><textarea rows="4" value={form.notes} onChange={(e)=>field('notes',e.target.value)} /></div>
          </div>
        </Section>

        <div style={{position:'sticky',bottom:12,zIndex:20,display:'flex',justifyContent:'flex-start',gap:10,padding:'12px 14px',marginTop:18,border:'1px solid var(--ui-border)',borderRadius:10,background:'rgba(251,250,247,.96)',boxShadow:'0 10px 30px rgba(17,17,15,.08)',backdropFilter:'blur(10px)'}}>
          <button className="btn" type="submit" disabled={busy||canCreate===null}>{busy?'جارٍ إنشاء المشروع…':'حفظ وفتح المشروع'}</button>
        </div>
      </form>
    </ConstitutionPage>
  );
}
