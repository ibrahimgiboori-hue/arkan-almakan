'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  const searchParams = useSearchParams();
  const session = useDashboardSession();
  const [rows, setRows] = useState(null);
  const [tot, setTot] = useState({});
  const [newLang, setNewLang] = useState('ar');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const canCreate = canUseCapability(session,'projects.quotes.create','all');
  const canEdit = canUseCapability(session,'projects.quotes.edit','all');
  const requestedKind = searchParams.get('new') === 'boq' ? 'boq' : 'quotation';

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

  const currentWork = useMemo(() => (rows || [])
    .filter((row)=>row.status === 'draft')
    .slice(0,6), [rows]);

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

  async function removeDraft(row) {
    if (!canEdit || row.status !== 'draft') return;
    if (!window.confirm(`حذف المسودة ${row.quote_no} وكل بنودها نهائياً؟`)) return;
    setBusy(true); setErr(''); setMsg('');
    const { error } = await supabase.from('quotations').delete().eq('id', row.id);
    setBusy(false);
    if (error) { setErr('تعذّر الحذف: ' + error.message); return; }
    setMsg('حُذفت المسودة.');
    await load();
  }

  if (!rows) return <ConstitutionPage><EmptyState title="جارٍ تجهيز مساحة عروض الأسعار" description="يتم تحميل العمل الجاري."/></ConstitutionPage>;

  return <ConstitutionPage>
    <PageHeader
      eyebrow="QUOTATIONS"
      title="عروض الأسعار"
      description="ابدأ العمل الجديد هنا. العروض السابقة محفوظة في قائمة الأداة وتظهر عند استدعاء القائمة، مرتبة حسب العميل."
      actions={canCreate?<Toolbar>
        <label htmlFor="new-quote-language">لغة الجديد</label>
        <select id="new-quote-language" value={newLang} onChange={(event)=>setNewLang(event.target.value)} aria-label="لغة العرض الجديد">
          <option value="ar">العربية</option><option value="en">English</option>
        </select>
        <ContextActions
          primary={<button className="btn" disabled={busy} onClick={()=>create(requestedKind)}>{requestedKind === 'boq' ? 'إنشاء جدول كميات' : 'إنشاء عرض سعر'}</button>}
          secondary={requestedKind === 'boq'
            ? [{key:'quote',node:<button className="btn ghost" disabled={busy} onClick={()=>create('quotation')}>عرض سعر جديد</button>}]
            : [{key:'boq',node:<button className="btn ghost" disabled={busy} onClick={()=>create('boq')}>جدول كميات جديد</button>}]}
          label="نوع مستند آخر"
        />
      </Toolbar>:null}
    />

    {err ? <Notice tone="error">{err}</Notice> : null}
    {msg ? <InlineStatus tone="success" live>{msg}</InlineStatus> : null}

    <Section title="العمل الجاري" description="المسودات المفتوحة فقط؛ السجل التاريخي لا يزاحم مساحة العمل">
      {currentWork.length === 0
        ? <EmptyState
            title="مساحة العمل جاهزة"
            description={canCreate?'لا توجد مسودة مفتوحة الآن. أنشئ عرض سعر جديد عندما تحتاج.':'لا توجد مسودات مفتوحة لهذا الحساب.'}
          />
        : <TableFrame data-current-work-only="true">
          <table>
            <thead><tr><th>العرض</th><th>العميل</th><th>النوع</th><th>التاريخ</th><th className="num">القيمة</th><th>الإجراء</th></tr></thead>
            <tbody>{currentWork.map((row)=><tr key={row.id} data-record-row="true">
              <td className="mono"><Link href={`/dashboard/quotes/${row.id}`}>{row.quote_no}</Link></td>
              <td>{row.client_name || 'عميل غير محدد'}</td>
              <td>{row.doc_kind === 'boq' ? 'جدول كميات' : 'عرض سعر'}</td>
              <td className="mono">{dateAr(row.quote_date)}</td>
              <td className="num">{money(tot[row.id]?.grand_total || 0)}</td>
              <td><ContextActions
                primary={<Link className="btn ghost" href={`/dashboard/quotes/${row.id}`}>استكمال العمل</Link>}
                secondary={canEdit ? [{key:'delete',node:<button className="btn ghost" disabled={busy} data-action-consequence="destructive" onClick={()=>removeDraft(row)}>حذف المسودة</button>}] : []}
                label={`إجراءات ${row.quote_no}`}
              /></td>
            </tr>)}</tbody>
          </table>
        </TableFrame>}
    </Section>

    <div style={{fontSize:12.5,color:'var(--ink-soft)',padding:'4px 2px 0'}}>
      للوصول إلى عرض سابق، استدعِ القائمة الجانبية: العميل أولاً، ثم العرض نفسه.
    </div>
  </ConstitutionPage>;
}
