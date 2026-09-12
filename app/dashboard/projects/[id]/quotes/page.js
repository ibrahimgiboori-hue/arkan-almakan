'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { money, dateAr } from '@/lib/format';
import { QSTATUS_AR } from '@/lib/quote-calc';
import { projectQuoteApprovalLabel } from '@/lib/project-quotes.mjs';
import { projectQuotesService } from '@/lib/application/project-quotes-service';
import { Section, EmptyState, Notice } from '@/components/ui/ConstitutionUI';

export default function ProjectQuotesPage() {
  const { id: projectId } = useParams();
  const router = useRouter();
  const [rows, setRows] = useState(null);
  const [totals, setTotals] = useState({});
  const [states, setStates] = useState({});
  const [summary, setSummary] = useState({count:0,approved:0,pending:0});
  const [canCreate, setCanCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function load() {
    setErr('');
    try {
      const workspace=await projectQuotesService.loadWorkspace({projectId});
      setRows(workspace.quotes);
      setTotals(workspace.totals);
      setStates(workspace.states);
      setSummary(workspace.summary);
      setCanCreate(workspace.canCreate);
      if(workspace.readErrors?.length){
        setErr(`تعذر تحميل بعض بيانات عروض المشروع: ${workspace.readErrors.join(' · ')}`);
      }
    }catch(error){
      setRows([]);
      setErr('تعذر تحميل عروض المشروع: '+(error?.message || error));
    }
  }

  useEffect(() => { load(); }, [projectId]);

  async function create(kind, language='ar') {
    setBusy(true); setErr('');
    try{
      const saved=await projectQuotesService.createQuote({projectId,kind,language});
      router.push(`/dashboard/quotes/${saved.id}`);
    }catch(error){
      setErr('تعذر إنشاء عرض السعر: '+(error?.message || error));
    }finally{
      setBusy(false);
    }
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
              <td>{projectQuoteApprovalLabel(states[row.id])}</td>
              <td><Link className="btn ghost" href={`/dashboard/quotes/${row.id}`}>فتح</Link></td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
    </Section>
  </>;
}
