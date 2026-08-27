'use client';
import { useCallback, useMemo, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  ConstitutionPage,
  PageHeader,
  Section,
  EntrySurface,
  SummaryStrip,
  FilterSurface,
  Notice,
  Toolbar,
  TableFrame,
  EmptyState,
} from '@/components/ui/ConstitutionUI';

const KIND = {
  client:'عميل — مالك المشروع',
  main_contractor:'مقاول رئيسي — نعمل تحته',
  consultant:'استشاري / مكتب هندسي',
  supplier:'مورد',
  government:'جهة حكومية',
  other:'أخرى',
};

const EMPTY = {
  id:null, entity_code:'', name_ar:'', name_en:'', entity_kind:'client',
  cr_number:'', vat_number:'', contact_name:'', contact_title:'',
  mobile:'', email:'', city:'', national_address:'', notes:'',
};

const digits=(s)=>(s||'').replace(/\D/g,'');

export default function Entities(){
  const [rows,setRows]=useState([]);
  const [usage,setUsage]=useState({});
  const [search,setSearch]=useState('');
  const [kindFilter,setKindFilter]=useState('');
  const [form,setForm]=useState(null);
  const [isCompany,setIsCompany]=useState(true);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState('');
  const [msg,setMsg]=useState('');

  const load=useCallback(async()=>{
    setLoading(true);setErr('');
    try{
      const [e,p,q]=await Promise.all([
        supabase.from('entities').select('*').order('name_ar'),
        supabase.from('projects').select('entity_id').not('entity_id','is',null),
        supabase.from('quotations').select('entity_id').not('entity_id','is',null),
      ]);
      if(e.error)throw e.error;
      setRows(e.data||[]);
      const u={};
      (p.data||[]).forEach((x)=>{u[x.entity_id]=u[x.entity_id]||{projects:0,quotes:0};u[x.entity_id].projects+=1;});
      (q.data||[]).forEach((x)=>{u[x.entity_id]=u[x.entity_id]||{projects:0,quotes:0};u[x.entity_id].quotes+=1;});
      setUsage(u);
    }catch(ex){setErr('تعذّر التحميل: '+(ex.message||ex));}
    setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);

  const nextCode=useMemo(()=>{
    const nums=rows.map((r)=>Number((r.entity_code||'').match(/(\d+)\s*$/)?.[1]||0)).filter((n)=>n>0);
    return 'ENT-'+String((nums.length?Math.max(...nums):0)+1).padStart(4,'0');
  },[rows]);

  const shown=useMemo(()=>rows.filter((r)=>{
    if(kindFilter&&r.entity_kind!==kindFilter)return false;
    if(!search.trim())return true;
    const s=search.trim();
    return (r.name_ar||'').includes(s)||(r.name_en||'').toLowerCase().includes(s.toLowerCase())
      ||(r.cr_number||'').includes(s)||(r.vat_number||'').includes(s)
      ||(r.contact_name||'').includes(s)||(r.mobile||'').includes(s);
  }),[rows,search,kindFilter]);

  const projectLinks=Object.values(usage).reduce((t,x)=>t+Number(x.projects||0),0);
  const quoteLinks=Object.values(usage).reduce((t,x)=>t+Number(x.quotes||0),0);
  const companies=rows.filter((r)=>r.cr_number||r.vat_number).length;

  function openNew(){setForm({...EMPTY,entity_code:nextCode});setIsCompany(true);setErr('');setMsg('');}
  function openEdit(r){setForm({...EMPTY,...r});setIsCompany(Boolean(r.cr_number||r.vat_number));setErr('');setMsg('');}
  function closeForm(){setForm(null);}
  const set=(k,v)=>setForm((f)=>({...f,[k]:v}));

  const cr=digits(form?.cr_number);
  const vat=digits(form?.vat_number);
  const crWarn=isCompany&&cr&&cr.length!==10;
  const vatWarn=isCompany&&vat&&(vat.length!==15||!vat.startsWith('3')||!vat.endsWith('3'));

  async function save(){
    if(!form?.name_ar?.trim()){setErr('اسم الجهة مطلوب');return;}
    setBusy(true);setErr('');setMsg('');
    const payload={
      entity_code:form.entity_code?.trim()||null,
      name_ar:form.name_ar.trim(),
      name_en:form.name_en?.trim()||null,
      entity_kind:form.entity_kind||null,
      cr_number:isCompany?(form.cr_number?.trim()||null):null,
      vat_number:isCompany?(form.vat_number?.trim()||null):null,
      contact_name:form.contact_name?.trim()||null,
      contact_title:form.contact_title?.trim()||null,
      mobile:form.mobile?.trim()||null,
      email:form.email?.trim()||null,
      city:form.city?.trim()||null,
      national_address:form.national_address?.trim()||null,
      notes:form.notes?.trim()||null,
    };
    try{
      const res=form.id?await supabase.from('entities').update(payload).eq('id',form.id):await supabase.from('entities').insert(payload);
      if(res.error)throw res.error;
      setMsg(form.id?'حُدِّثت بيانات الجهة':'أُضيفت الجهة');
      setForm(null);await load();
    }catch(ex){setErr('تعذّر الحفظ: '+(ex.message||ex));}
    setBusy(false);
  }

  async function remove(r){
    const u=usage[r.id];
    if(u&&(u.projects||u.quotes)){setErr(`لا يمكن حذف «${r.name_ar}» — مرتبطة بـ ${u.projects||0} مشروع و${u.quotes||0} عرض سعر`);return;}
    if(!window.confirm(`حذف «${r.name_ar}» نهائياً؟`))return;
    const {error}=await supabase.from('entities').delete().eq('id',r.id);
    if(error)setErr('تعذّر الحذف: '+error.message);else{setMsg('حُذفت الجهة');load();}
  }

  return <ConstitutionPage>
    <PageHeader
      eyebrow="ENTITIES"
      title="العملاء والجهات"
      description="السجل الموحد للعملاء والمقاولين الرئيسيين والاستشاريين والموردين والجهات المرتبطة بالمشاريع والعروض."
      actions={<button className="btn" onClick={openNew}>+ جهة جديدة</button>}
    />

    <Section title="ملخص الجهات">
      <SummaryStrip items={[
        {key:'all',value:rows.length,label:'إجمالي الجهات'},
        {key:'companies',value:companies,label:'منشآت ببيانات نظامية'},
        {key:'projects',value:projectLinks,label:'ارتباطات بالمشاريع'},
        {key:'quotes',value:quoteLinks,label:'ارتباطات بعروض الأسعار'},
      ]}/>
    </Section>

    <Section title="البحث والتصفية">
      <FilterSurface>
        <div className="field">
          <label>البحث</label>
          <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="الاسم، السجل التجاري، الرقم الضريبي أو الجوال" />
        </div>
        <div className="field">
          <label>نوع الجهة</label>
          <select value={kindFilter} onChange={(e)=>setKindFilter(e.target.value)}>
            <option value="">الكل</option>
            {Object.entries(KIND).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <span>{shown.length} من {rows.length}</span>
      </FilterSurface>
    </Section>

    {err&&<Notice tone="error">{err}</Notice>}
    {msg&&<Notice tone="success">{msg}</Notice>}

    {form&&<EntrySurface
      title={form.id?`تعديل ${form.name_ar||'الجهة'}`:'إضافة جهة'}
      description="أدخل البيانات التي تستخدم في المشاريع والعروض والمستندات."
      actions={<Toolbar>
        <button className="btn ghost" type="button" onClick={()=>setIsCompany(true)} disabled={isCompany}>منشأة</button>
        <button className="btn ghost" type="button" onClick={()=>setIsCompany(false)} disabled={!isCompany}>فرد</button>
      </Toolbar>}
    >
      <div style={{padding:22}}>
        <div className="form-grid">
          <div className="field span2"><label>{isCompany?'الاسم التجاري بالعربية *':'الاسم الكامل *'}</label><input autoFocus value={form.name_ar} onChange={(e)=>set('name_ar',e.target.value)} /></div>
          <div className="field"><label>رقم الجهة</label><input dir="ltr" value={form.entity_code||''} onChange={(e)=>set('entity_code',e.target.value)} /></div>
          <div className="field"><label>الاسم بالإنجليزية</label><input dir="ltr" value={form.name_en||''} onChange={(e)=>set('name_en',e.target.value)} /></div>
          <div className="field"><label>نوع الجهة</label><select value={form.entity_kind||''} onChange={(e)=>set('entity_kind',e.target.value)}>{Object.entries(KIND).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
          <div className="field"><label>المدينة</label><input value={form.city||''} onChange={(e)=>set('city',e.target.value)} /></div>
          {isCompany&&<>
            <div className="field"><label>السجل التجاري</label><input dir="ltr" inputMode="numeric" value={form.cr_number||''} onChange={(e)=>set('cr_number',e.target.value)} />{crWarn&&<span className="hint">السجل التجاري عشرة أرقام — المدخل حاليًا {cr.length}</span>}</div>
            <div className="field"><label>الرقم الضريبي</label><input dir="ltr" inputMode="numeric" value={form.vat_number||''} onChange={(e)=>set('vat_number',e.target.value)} />{vatWarn&&<span className="hint">الرقم الضريبي 15 رقمًا يبدأ بـ3 وينتهي بـ3</span>}</div>
          </>}
          <div className="field"><label>{isCompany?'اسم المسؤول':'اسم من نتواصل معه'}</label><input value={form.contact_name||''} onChange={(e)=>set('contact_name',e.target.value)} /></div>
          <div className="field"><label>صفته</label><input value={form.contact_title||''} onChange={(e)=>set('contact_title',e.target.value)} placeholder="مدير المشاريع…" /></div>
          <div className="field"><label>الجوال</label><input dir="ltr" inputMode="tel" value={form.mobile||''} onChange={(e)=>set('mobile',e.target.value)} /></div>
          <div className="field"><label>البريد الإلكتروني</label><input dir="ltr" type="email" value={form.email||''} onChange={(e)=>set('email',e.target.value)} /></div>
          <div className="field span2"><label>العنوان الوطني</label><input value={form.national_address||''} onChange={(e)=>set('national_address',e.target.value)} placeholder="الرمز البريدي · الحي · المدينة" /></div>
          <div className="field span2"><label>ملاحظات</label><textarea rows="3" value={form.notes||''} onChange={(e)=>set('notes',e.target.value)} /></div>
        </div>
        <Toolbar>
          <button className="btn" type="button" onClick={save} disabled={busy}>{busy?'جارٍ الحفظ…':form.id?'حفظ التعديلات':'إضافة الجهة'}</button>
          <button className="btn ghost" type="button" onClick={closeForm} disabled={busy}>إلغاء</button>
        </Toolbar>
      </div>
    </EntrySurface>}

    <Section title="سجل الجهات" description={`${shown.length} جهة مطابقة للعرض الحالي`}>
      {loading?<EmptyState title="جارٍ تحميل الجهات"/>:shown.length===0?<EmptyState title="لا توجد جهات مطابقة" description="أضف جهة جديدة أو عدّل البحث والتصفية."/>:<TableFrame>
        <table>
          <thead><tr><th>الاسم</th><th>النوع</th><th>السجل التجاري</th><th>الرقم الضريبي</th><th>المسؤول</th><th>الارتباط</th><th>الإجراءات</th></tr></thead>
          <tbody>{shown.map((r)=>{
            const u=usage[r.id]||{projects:0,quotes:0};
            return <tr key={r.id}>
              <td><strong>{r.name_ar}</strong>{r.name_en&&<div className="hint" dir="ltr">{r.name_en}</div>}{r.city&&<div className="hint">{r.city}</div>}</td>
              <td>{KIND[r.entity_kind]||r.entity_kind||'—'}</td>
              <td className="mono">{r.cr_number||'—'}</td>
              <td className="mono">{r.vat_number||'—'}</td>
              <td>{r.contact_name||'—'}{r.contact_title&&<div className="hint">{r.contact_title}</div>}{r.mobile&&<div className="hint" dir="ltr">{r.mobile}</div>}</td>
              <td>{u.projects?`${u.projects} مشروع`:''}{u.projects&&u.quotes?' · ':''}{u.quotes?`${u.quotes} عرض`:''}{!u.projects&&!u.quotes?'—':''}</td>
              <td><Toolbar><button className="btn ghost" onClick={()=>openEdit(r)}>تعديل</button><button className="btn ghost" onClick={()=>remove(r)}>حذف</button></Toolbar></td>
            </tr>;
          })}</tbody>
        </table>
      </TableFrame>}
    </Section>
  </ConstitutionPage>;
}
