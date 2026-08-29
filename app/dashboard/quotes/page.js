'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { dateAr, money } from '@/lib/format';
import { QSTATUS_AR } from '@/lib/quote-calc';
import { SYSTEM } from '@/lib/system-constitution';
import { useDashboardSession } from '@/lib/dashboard-session-context';
import { canUseCapability } from '@/lib/access-ui';
import {
  ConstitutionPage,
  PageHeader,
  Section,
  Notice,
  InlineStatus,
  Toolbar,
  ContextActions,
  TableFrame,
  EmptyState,
} from '@/components/ui/ConstitutionUI';

const EN_INTRO = 'We are pleased to submit our quotation for the execution of the works described below, in accordance with the approved drawings, specifications, and project requirements.';
const EN_CLOSING = 'We trust that our quotation meets your requirements and look forward to the opportunity to work with you.';
const EN_TERMS = [
  'Payment terms and schedule shall be agreed upon prior to commencement of the works.',
  'Prices are exclusive of VAT. VAT will be added at the applicable statutory rate.',
].join('\n');

export default function Quotes() {
  const router = useRouter();
  const session = useDashboardSession();
  const [rows, setRows] = useState(null);
  const [tot, setTot] = useState({});
  const [newLang, setNewLang] = useState('ar');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const canCreate = canUseCapability(session,'projects.quotes.create','all');
  const canEdit = canUseCapability(session,'projects.quotes.edit','all');
  const canCreateProject = canUseCapability(session,'projects.projects.create','all');

  async function load() {
    const [q, t] = await Promise.all([
      supabase.from('quotations').select('*').order('created_at', { ascending: false }),
      supabase.from('v_quote_totals').select('*'),
    ]);
    if (q.error) {
      setErr('تعذّر تحميل عروض الأسعار: ' + q.error.message);
      setRows([]);
      return;
    }
    setRows(q.data || []);
    const map = {};
    (t.data || []).forEach((row) => { map[row.id] = row; });
    setTot(map);
  }

  useEffect(() => { load(); }, []);

  async function create(kind) {
    setErr(''); setMsg(''); setBusy(true);
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
      client_kind:'entity',
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
    setMsg('حُوّل العرض إلى مشروع'); load();
  }

  async function setStatus(row, status) {
    setErr(''); setMsg('');
    const { error } = await supabase.from('quotations').update({ status }).eq('id', row.id);
    if (error) setErr(error.message);
    else { setMsg(`حُفظت حالة ${row.quote_no}`); load(); }
  }

  async function setLanguage(row, language) {
    setErr(''); setMsg('');
    const fields = { language, show_en_desc:language === 'en' };
    const { error } = await supabase.from('quotations').update(fields).eq('id', row.id);
    if (error) { setErr('تعذّر تغيير لغة العرض: ' + error.message); return; }
    setRows((previous)=>(previous||[]).map((item)=>item.id===row.id?{...item,...fields}:item));
    setMsg(language === 'en' ? `حُفظت لغة ${row.quote_no}: English` : `حُفظت لغة ${row.quote_no}: العربية`);
  }

  if (!rows) return <ConstitutionPage><EmptyState title="جارٍ تحميل عروض الأسعار" description="يتم تحميل السجل الحالي."/></ConstitutionPage>;

  return <ConstitutionPage>
    <PageHeader
      eyebrow="QUOTATIONS"
      title="عروض الأسعار وجداول الكميات"
      description="سجل واحد للمستندات؛ افتح السطر لتعمل على العرض نفسه، واترك الإجراءات الثانوية في قائمته."
      actions={canCreate?<Toolbar>
        <label htmlFor="new-quote-language">لغة الجديد</label>
        <select id="new-quote-language" value={newLang} onChange={(event)=>setNewLang(event.target.value)} aria-label="لغة العرض الجديد">
          <option value="ar">العربية</option><option value="en">English</option>
        </select>
        <ContextActions
          primary={<button className="btn" disabled={busy} onClick={()=>create('quotation')}>عرض سعر جديد</button>}
          secondary={[{key:'boq',node:<button className="btn ghost" disabled={busy} onClick={()=>create('boq')}>جدول كميات جديد</button>}]}
          label="أنواع مستندات أخرى"
        />
      </Toolbar>:null}
    />

    {err ? <Notice tone="error">{err}</Notice> : null}
    {msg ? <InlineStatus tone="success" live>{msg}</InlineStatus> : null}

    <Section title="السجل" description={`${rows.length} مستند في السجل الحالي`}>
      {rows.length === 0 ? <EmptyState title="لا توجد عروض بعد" description={canCreate?'أنشئ عرض سعر من أعلى الورقة.':'لا توجد عروض متاحة لهذا الحساب.'}/> : <TableFrame>
        <table>
          <thead><tr><th>الرقم</th><th>النوع</th><th>اللغة</th><th>العميل</th><th>التاريخ</th><th className="num">المجموع</th><th>الحالة</th><th>الإجراء</th></tr></thead>
          <tbody>{rows.map((row) => {
            const secondary = [
              {key:'print',node:<Link className="btn ghost" href={`/print/quote/${row.id}`} target="_blank">طباعة</Link>},
            ];
            if (canCreate && canEdit) secondary.push({key:'duplicate',node:<button className="btn ghost" disabled={busy} onClick={()=>duplicate(row)}>نسخ</button>});
            if (canEdit && canCreateProject && row.status === 'accepted') secondary.push({key:'project',node:<button className="btn ghost" data-action-consequence="consequential" onClick={()=>toProject(row)}>تحويل إلى مشروع</button>});
            if (canEdit) secondary.push({key:'delete',node:<button className="btn ghost" data-action-consequence="destructive" onClick={()=>remove(row)}>حذف</button>});
            return <tr key={row.id} data-record-row="true">
              <td className="mono"><Link href={`/dashboard/quotes/${row.id}`}>{row.quote_no}</Link></td>
              <td>{row.doc_kind === 'boq' ? 'جدول كميات' : 'عرض سعر'}</td>
              <td>{canEdit ? <select value={row.language || 'ar'} onChange={(event)=>setLanguage(row,event.target.value)} aria-label={`لغة ${row.quote_no}`}><option value="ar">العربية</option><option value="en">English</option></select> : <span className="pill">{row.language === 'en' ? 'EN' : 'AR'}</span>}</td>
              <td>{row.client_name}{row.client_kind==='individual'&&<small> · فرد</small>}</td>
              <td className="mono">{dateAr(row.quote_date)}</td>
              <td className="num">{money(tot[row.id]?.grand_total || 0)}</td>
              <td>{canEdit ? <select value={row.status} onChange={(event)=>setStatus(row,event.target.value)} aria-label={`حالة ${row.quote_no}`}>{Object.entries(QSTATUS_AR).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select> : <span className="pill">{QSTATUS_AR[row.status]}</span>}</td>
              <td><ContextActions
                primary={<Link className="btn ghost" href={`/dashboard/quotes/${row.id}`}>{canEdit?'فتح وتعديل':'فتح'}</Link>}
                secondary={secondary}
                label={`إجراءات ${row.quote_no}`}
              /></td>
            </tr>;
          })}</tbody>
        </table>
      </TableFrame>}
    </Section>
  </ConstitutionPage>;
}
