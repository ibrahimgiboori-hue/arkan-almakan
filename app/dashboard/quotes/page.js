'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { dateAr, money } from '@/lib/format';
import { QSTATUS_AR } from '@/lib/quote-calc';
import { SYSTEM } from '@/lib/system-constitution';

const EN_INTRO = 'We are pleased to submit our quotation for the execution of the works described below, in accordance with the approved drawings, specifications, and project requirements.';
const EN_CLOSING = 'We trust that our quotation meets your requirements and look forward to the opportunity to work with you.';
const EN_TERMS = [
  'Payment terms and schedule shall be agreed upon prior to commencement of the works.',
  'Prices are exclusive of VAT. VAT will be added at the applicable statutory rate.',
].join('\n');

export default function Quotes() {
  const router = useRouter();
  const [rows, setRows] = useState(null);
  const [tot, setTot] = useState({});
  const [access, setAccess] = useState({canCreate:false,canEdit:false,canCreateProject:false});
  const [newLang, setNewLang] = useState('ar');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const sess = (await supabase.auth.getSession()).data.session;
    const [q, t, capsQ, primaryQ, userQ] = await Promise.all([
      supabase.from('quotations').select('*').order('created_at', { ascending: false }),
      supabase.from('v_quote_totals').select('*'),
      supabase.from('v_my_capabilities').select('capability_key,scope_type,scope_key,source_key'),
      supabase.rpc('fn_is_primary_user'),
      sess?.user?.id ? supabase.from('app_users').select('is_system_admin').eq('id', sess.user.id).maybeSingle() : Promise.resolve({data:null,error:null}),
    ]);
    setRows(q.data || []);
    const map = {}; (t.data || []).forEach((row) => { map[row.id] = row; });
    setTot(map);
    const caps = capsQ.data || [];
    const systemFull = primaryQ.data === true || Boolean(userQ.data?.is_system_admin);
    const portalFull = systemFull || caps.some((cap)=>cap.source_key==='projects_full_access'&&cap.scope_type==='all');
    const keys = new Set(caps.filter((cap)=>cap.scope_type==='all').map((cap)=>cap.capability_key));
    const has = (key) => portalFull || keys.has(key);
    setAccess({
      canCreate:has('projects.quotes.create'),
      canEdit:has('projects.quotes.edit'),
      canCreateProject:has('projects.projects.create'),
    });
  }

  useEffect(() => { load(); }, []);

  async function create(kind) {
    setErr(''); setBusy(true);
    const { data:num, error:numberError } = await supabase.rpc('next_document_number', {
      p_doc_type: kind === 'boq' ? 'BOQ' : 'QUOTE',
      p_prefix: kind === 'boq' ? 'BOQ' : 'QT',
    });
    if (numberError) { setErr('تعذّر توليد الرقم: ' + numberError.message); setBusy(false); return; }

    const { data:cfg } = await supabase.from('app_settings').select('quote_terms_default, vat_rate').eq('id',1).maybeSingle();
    const english = newLang === 'en';
    const { data, error } = await supabase.from('quotations').insert({
      quote_no:num,
      doc_kind:kind,
      language:newLang,
      client_name:english ? 'New Client' : 'عميل جديد',
      vat_rate:cfg?.vat_rate ?? SYSTEM.vatRate,
      terms_text:english ? EN_TERMS : (cfg?.quote_terms_default || ''),
      intro_text:english ? EN_INTRO : 'يسرنا في أركان المكان أن نضع بين أيديكم عرض السعر التالي لتنفيذ الأعمال الموضحة أدناه وفقاً للمواصفات الفنية المعتمدة.',
      closing_text:english ? EN_CLOSING : 'آملين أن ينال عرضنا استحسانكم، وتفضلوا بقبول فائق الاحترام والتقدير.',
      show_qty:kind === 'boq',
      show_en_desc:english,
    }).select('id').single();
    setBusy(false);
    if (error) { setErr('تعذّر الإنشاء: ' + error.message); return; }
    router.push(`/dashboard/quotes/${data.id}`);
  }

  async function duplicate(row) {
    setErr(''); setMsg(''); setBusy(true);
    const { data, error } = await supabase.rpc('duplicate_quotation', { p_id:row.id });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    router.push(`/dashboard/quotes/${data}`);
  }

  async function remove(row) {
    if (!window.confirm(`حذف ${row.quote_no} وكل بنوده نهائياً؟`)) return;
    setErr(''); setMsg('');
    const { error } = await supabase.from('quotations').delete().eq('id', row.id);
    if (error) { setErr('تعذّر الحذف: ' + error.message); return; }
    setMsg('حُذف العرض'); load();
  }

  async function toProject(row) {
    if (!window.confirm(`تحويل ${row.quote_no} إلى مشروع بكل بنوده؟`)) return;
    setErr(''); setMsg('');
    const { error } = await supabase.rpc('quote_to_project', { p_quote:row.id });
    if (error) { setErr(error.message); return; }
    setMsg('حُوّل إلى مشروع'); load();
  }

  async function setStatus(row, status) {
    const { error } = await supabase.from('quotations').update({ status }).eq('id', row.id);
    if (error) setErr(error.message); else load();
  }

  async function setLanguage(row, language) {
    setErr(''); setMsg('');
    const fields = { language, show_en_desc:language === 'en' };
    const { error } = await supabase.from('quotations').update(fields).eq('id', row.id);
    if (error) { setErr('تعذّر تغيير لغة العرض: ' + error.message); return; }
    setRows((previous)=>(previous||[]).map((item)=>item.id===row.id?{...item,...fields}:item));
    setMsg(language === 'en' ? `تم تحويل ${row.quote_no} إلى English` : `تم تحويل ${row.quote_no} إلى العربية`);
  }

  if (!rows) return <div className="empty">جارٍ التحميل…</div>;

  return <>
    <div className="page-head">
      <div><h1>عروض الأسعار وجداول الكميات</h1><p>لغة العرض محفوظة داخل كل مستند ويمكن تغييرها في أي وقت.</p></div>
      {access.canCreate&&<div className="rowsplit">
        <label style={{fontSize:12.5,color:'var(--ink-soft)'}}>لغة العرض الجديد</label>
        <select value={newLang} onChange={(event)=>setNewLang(event.target.value)} aria-label="لغة العرض الجديد" style={{minWidth:112}}>
          <option value="ar">العربية</option><option value="en">English</option>
        </select>
        <button className="btn" disabled={busy} onClick={()=>create('quotation')}>عرض سعر جديد</button>
        <button className="btn ghost" disabled={busy} onClick={()=>create('boq')}>جدول كميات جديد</button>
      </div>}
    </div>

    {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}
    {msg && <div className="msg ok" style={{marginBottom:14}}>{msg}</div>}

    <div className="section" style={{marginTop:0}}>
      <header><h2>السجل</h2></header>
      {rows.length === 0 ? <div className="empty"><h3>لا عروض بعد</h3><p>{access.canCreate?'اختر اللغة ثم أنشئ عرض سعر أو جدول كميات.':'لا توجد عروض متاحة لهذا الحساب.'}</p></div> : <table>
        <thead><tr><th>الرقم</th><th>النوع</th><th>لغة المستند</th><th>العميل</th><th>التاريخ</th><th className="num">المجموع</th><th>الحالة</th><th style={{width:280}}>الإجراء</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}>
          <td className="mono">{row.quote_no}</td>
          <td>{row.doc_kind === 'boq' ? 'جدول كميات' : 'عرض سعر'}</td>
          <td>{access.canEdit ? <select value={row.language || 'ar'} onChange={(event)=>setLanguage(row,event.target.value)} aria-label={`لغة ${row.quote_no}`} style={{fontSize:12.5,padding:'2px 4px',minWidth:92}}><option value="ar">العربية</option><option value="en">English</option></select> : <span className="pill">{row.language === 'en' ? 'EN' : 'AR'}</span>}</td>
          <td>{row.client_name}</td>
          <td className="mono">{dateAr(row.quote_date)}</td>
          <td className="num">{money(tot[row.id]?.grand_total || 0)}</td>
          <td>{access.canEdit ? <select value={row.status} onChange={(event)=>setStatus(row,event.target.value)} style={{fontSize:12.5,padding:'2px 4px'}}>{Object.entries(QSTATUS_AR).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select> : <span className="pill">{QSTATUS_AR[row.status]}</span>}</td>
          <td><div className="rowsplit">
            <Link className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}} href={`/dashboard/quotes/${row.id}`}>{access.canEdit?'تعديل':'فتح'}</Link>
            <Link className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}} href={`/print/quote/${row.id}`} target="_blank">طباعة</Link>
            {access.canCreate && access.canEdit && <button className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}} disabled={busy} onClick={()=>duplicate(row)}>نسخ</button>}
            {access.canEdit && access.canCreateProject && row.status === 'accepted' && <button className="btn" style={{padding:'4px 9px',fontSize:12.5}} onClick={()=>toProject(row)}>تحويل إلى مشروع</button>}
            {access.canEdit && <button className="btn ghost" style={{padding:'4px 9px',fontSize:12.5,borderColor:'#EBC3C0',color:'#A32B24'}} onClick={()=>remove(row)}>حذف</button>}
          </div></td>
        </tr>)}</tbody>
      </table>}
    </div>
  </>;
}