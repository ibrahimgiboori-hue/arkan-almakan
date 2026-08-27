'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { money, dateAr } from '@/lib/format';
import { QSTATUS_AR } from '@/lib/quote-calc';
import { SYSTEM } from '@/lib/system-constitution';
import { Section, EmptyState, Notice } from '@/components/ui/ConstitutionUI';

const EN_INTRO = 'We are pleased to submit our quotation for the execution of the works described below, in accordance with the approved drawings, specifications, and project requirements.';
const EN_CLOSING = 'We trust that our quotation meets your requirements and look forward to the opportunity to work with you.';
const EN_TERMS = [
  'Payment terms and schedule shall be agreed upon prior to commencement of the works.',
  'Prices are exclusive of VAT. VAT will be added at the applicable statutory rate.',
].join('\n');

function approvalLabel(state) {
  if (!state?.workflow_id) return 'لم يُرسل للمراجعة';
  if (state.workflow_status === 'pending') return `لدى ${state.target_group_label || 'جهة المراجعة'}`;
  if (state.workflow_status === 'approved') return 'مراجع ماليًا';
  if (state.workflow_status === 'returned') return 'معاد للتعديل';
  if (state.workflow_status === 'rejected') return 'مرفوض داخليًا';
  return state.workflow_status || '—';
}

export default function ProjectQuotesPage() {
  const { id: projectId } = useParams();
  const router = useRouter();
  const [rows, setRows] = useState(null);
  const [totals, setTotals] = useState({});
  const [states, setStates] = useState({});
  const [canCreate, setCanCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function load() {
    setErr('');
    const [quotesQ, totalsQ, capsQ, primaryQ] = await Promise.all([
      supabase.from('quotations').select('*').eq('project_id', projectId).order('created_at', { ascending:false }),
      supabase.from('v_quote_totals').select('*'),
      supabase.from('v_my_capabilities').select('capability_key,scope_type,scope_key,source_key'),
      supabase.rpc('fn_is_primary_user'),
    ]);
    if (quotesQ.error) setErr(quotesQ.error.message);
    const quotes = quotesQ.data || [];
    setRows(quotes);
    const totalsMap = {};
    (totalsQ.data || []).forEach((row) => { totalsMap[row.id] = row; });
    setTotals(totalsMap);

    const caps = capsQ.data || [];
    const applicable = caps.filter((cap) => cap.scope_type === 'all' || (cap.scope_type === 'project' && cap.scope_key === projectId));
    const keys = new Set(applicable.map((cap) => cap.capability_key));
    const projectFull = applicable.some((cap) => cap.source_key === 'projects_full_access');
    setCanCreate(primaryQ.data === true || projectFull || keys.has('projects.quotes.create'));

    const pairs = await Promise.all(quotes.map(async (quote) => {
      const { data } = await supabase.rpc('fn_quotation_approval_state', { p_quote_id: quote.id });
      return [quote.id, data || null];
    }));
    setStates(Object.fromEntries(pairs));
  }

  useEffect(() => { load(); }, [projectId]);

  const summary = useMemo(() => {
    const list = rows || [];
    return {
      count: list.length,
      approved: list.filter((row) => states[row.id]?.workflow_status === 'approved').length,
      pending: list.filter((row) => states[row.id]?.workflow_status === 'pending').length,
    };
  }, [rows, states]);

  async function create(kind, language='ar') {
    setBusy(true); setErr('');
    const { data:num, error:numErr } = await supabase.rpc('next_document_number', {
      p_doc_type: kind === 'boq' ? 'BOQ' : 'QUOTE',
      p_prefix: kind === 'boq' ? 'BOQ' : 'QT',
    });
    if (numErr) { setBusy(false); setErr(numErr.message); return; }
    const { data:cfg } = await supabase.from('app_settings').select('quote_terms_default,vat_rate').eq('id',1).maybeSingle();
    const english = language === 'en';
    const { data, error } = await supabase.from('quotations').insert({
      quote_no:num,
      doc_kind:kind,
      language,
      project_id:projectId,
      client_name:english ? 'New Client' : 'عميل جديد',
      vat_rate:cfg?.vat_rate ?? SYSTEM.vatRate,
      terms_text:english ? EN_TERMS : (cfg?.quote_terms_default || ''),
      intro_text:english ? EN_INTRO : 'يسرنا في أركان المكان أن نضع بين أيديكم عرض السعر التالي لتنفيذ الأعمال الموضحة أدناه وفقاً للمواصفات الفنية المعتمدة.',
      closing_text:english ? EN_CLOSING : 'آملين أن ينال عرضنا استحسانكم، وتفضلوا بقبول فائق الاحترام والتقدير.',
      show_qty:kind === 'boq',
      show_en_desc:english,
    }).select('id').single();
    setBusy(false);
    if (error) { setErr(error.message); return; }
    router.push(`/dashboard/quotes/${data.id}`);
  }

  if (!rows) return <div className="empty">جارٍ تحميل عروض المشروع…</div>;

  return <>
    {err ? <Notice tone="error">{err}</Notice> : null}
    <Section
      title="عروض الأسعار"
      description="عروض هذا المشروع فقط. الإنشاء والتعديل عمل تشغيلي داخل المشروع، أما الإرسال للعميل فيسبقه مسار المراجعة المالية."
      actions={canCreate ? <div className="rowsplit">
        <button className="btn" disabled={busy} onClick={() => create('quotation')}>عرض سعر جديد</button>
        <button className="btn ghost" disabled={busy} onClick={() => create('boq')}>جدول كميات جديد</button>
      </div> : null}
    >
      <div className="rowsplit" style={{marginBottom:16,gap:16}}>
        <span className="pill">{summary.count} عرض</span>
        <span className="pill">{summary.pending} قيد المراجعة</span>
        <span className="pill">{summary.approved} مراجع ماليًا</span>
      </div>
      {rows.length === 0 ? <EmptyState title="لا توجد عروض لهذا المشروع" description={canCreate ? 'أنشئ أول عرض سعر من هنا؛ سيُربط بالمشروع تلقائيًا.' : 'لا توجد عروض مرتبطة بهذا المشروع حتى الآن.'} /> : (
        <div style={{overflowX:'auto'}}>
          <table>
            <thead><tr><th>الرقم</th><th>العميل</th><th>التاريخ</th><th className="num">الإجمالي</th><th>حالة العرض</th><th>المراجعة المالية</th><th>—</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.id}>
              <td className="mono">{row.quote_no}</td>
              <td>{row.client_name}</td>
              <td className="mono">{dateAr(row.quote_date)}</td>
              <td className="num">{money(totals[row.id]?.grand_total || 0)}</td>
              <td>{QSTATUS_AR[row.status] || row.status}</td>
              <td>{approvalLabel(states[row.id])}</td>
              <td><Link className="btn ghost" href={`/dashboard/quotes/${row.id}`}>فتح</Link></td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
    </Section>
  </>;
}
