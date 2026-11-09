'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { dateAr, money } from '@/lib/format';
import { PRINT_FLOW_KIND } from '@/lib/print-governance';
import { SETTLEMENT_STATUS_LABELS, savedSettlementLines } from '@/lib/project-settlement.mjs';
import { projectSettlementService } from '@/lib/application/project-settlement-service';
import ConstitutionPrintFrame from '@/components/print/ConstitutionPrintFrame';
import ProcedureStagePanel from '@/components/print/ProcedureStagePanel';
import Riyal from '@/components/Riyal';

const valueOrDash = (value) => (value == null || value === '' ? '—' : value);
const PAYER = { contractor: 'دفعه المقاول', arkan_custody: 'من عهدة أركان', arkan_direct: 'من أركان مباشرة', employee: 'من موظف' };
const CHARGE = { arkan: 'على أركان', owner: 'على المالك', contractor: 'على المقاول' };

function MoneyValue({ value }) {
  return value == null ? '—' : <>{money(value)} <Riyal /></>;
}

// كشف تسوية المقاول على ورقة A4: البيانات، المعادلة سطرًا سطرًا، التفاصيل، وخانات التوقيع لدورة الاعتماد.
export default function SettlementPrint({ service = projectSettlementService } = {}) {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    service.loadForPrint(id)
      .then((result) => {
        if (cancelled) return;
        if (!result) setError('لم يُعثر على التسوية، أو لا تملك صلاحية عرضها.');
        else setData(result);
      })
      .catch(() => { if (!cancelled) setError('تعذر تحميل التسوية. يرجى تحديث الصفحة والمحاولة مرة أخرى.'); });
    return () => { cancelled = true; };
  }, [id, service]);

  if (error) return <div role="alert" dir="rtl" style={{ padding: 40 }}><p>{error}</p><Link href="/dashboard/projects">المشاريع</Link></div>;
  if (!data) return <div dir="rtl" style={{ padding: 40 }}>جارٍ تجهيز كشف التسوية…</div>;

  const { settlement: s, project, contractor, settings: cfg, days, expenses, deductions, financialCase } = data;
  const lines = savedSettlementLines(s).filter((line) => line.amount || line.key === 'works');
  const backHref = `/dashboard/projects/${s.project_id}/operations/settlement`;

  return <>
    <div className="print-toolbar no-print">
      <button type="button" className="primary" onClick={() => window.print()}>طباعة أو حفظ PDF</button>
      <Link href={backHref}>تسوية المقاول</Link>
      <span className="note">{s.settlement_no} — {contractor?.name_ar}</span>
    </div>

    <ConstitutionPrintFrame documentKey="contractor_settlement" cfg={cfg} direction="rtl">
      <div className="xlsx-doc">
        <div className="xlsx-meta" data-print-keep-with-next="true">
          <span>{cfg.company_name_ar}</span><span>{dateAr(s.created_at)}</span>
        </div>
        <div className="xlsx-title" data-print-keep-with-next="true">
          <h1>كشف تسوية مقاول</h1><span className="rule" />
        </div>

        <div className="xlsx-grid">
          <div className="xlsx-cell xlsx-label s2">رقم التسوية</div>
          <div className="xlsx-cell xlsx-value s4">{valueOrDash(s.settlement_no)}</div>
          <div className="xlsx-cell xlsx-label s2">الحالة</div>
          <div className="xlsx-cell xlsx-value s4">{SETTLEMENT_STATUS_LABELS[s.status] || s.status}{financialCase?.case_no ? ` · ${financialCase.case_no}` : ''}</div>
          <div className="xlsx-cell xlsx-label s2">المشروع</div>
          <div className="xlsx-cell xlsx-value s4">{project ? `${project.project_no} — ${project.name_ar}` : '—'}</div>
          <div className="xlsx-cell xlsx-label s2">المقاول</div>
          <div className="xlsx-cell xlsx-value s4">{valueOrDash(contractor?.name_ar)}</div>
          <div className="xlsx-cell xlsx-label s2">الفترة</div>
          <div className="xlsx-cell xlsx-value s4">من {dateAr(s.period_from)} إلى {dateAr(s.period_to)}</div>
          <div className="xlsx-cell xlsx-label s2">الحساب البنكي</div>
          <div className="xlsx-cell xlsx-value s4">{[contractor?.bank_name, contractor?.iban].filter(Boolean).join(' · ') || '—'}</div>
        </div>

        <div className="section-title" data-print-keep-with-next="true">المعادلة</div>
        <table className="data-table" data-print-flow={PRINT_FLOW_KIND.REPEATABLE_TABLE}>
          <thead><tr><th>البند</th><th className="num">يُضاف</th><th className="num">يُخصم</th></tr></thead>
          <tbody>{lines.map((line) => <tr key={line.key}>
            <td>{line.label}</td>
            <td className="num">{line.sign > 0 ? <MoneyValue value={line.amount} /> : ''}</td>
            <td className="num">{line.sign < 0 ? <MoneyValue value={line.amount} /> : ''}</td>
          </tr>)}</tbody>
          <tfoot><tr><th>الصافي المستحق للمقاول</th><th className="num" colSpan={2}><MoneyValue value={s.net_payable} /></th></tr></tfoot>
        </table>

        {days.length > 0 && <>
          <div className="section-title" data-print-keep-with-next="true">أيام العمل</div>
          <table className="data-table" data-print-flow={PRINT_FLOW_KIND.REPEATABLE_TABLE}>
            <thead><tr><th data-print-column-role="row-index">م</th><th>التاريخ</th><th className="num">الحاضرون</th><th className="num">قيمة اليوميات</th><th className="num">قيمة المقطوعية</th></tr></thead>
            <tbody>{days.map((day, index) => <tr key={day.work_date}>
              <td>{index + 1}</td><td>{dateAr(day.work_date)}</td><td className="num">{Number(day.present_count || 0)}</td>
              <td className="num"><MoneyValue value={day.daywork_value} /></td><td className="num"><MoneyValue value={day.piecework_value} /></td>
            </tr>)}</tbody>
          </table>
        </>}

        {expenses.length > 0 && <>
          <div className="section-title" data-print-keep-with-next="true">المصروفات المسوّاة</div>
          <table className="data-table" data-print-flow={PRINT_FLOW_KIND.REPEATABLE_TABLE}>
            <thead><tr><th data-print-column-role="row-index">م</th><th>التاريخ</th><th>التصنيف</th><th>البيان</th><th>الدافع / على من</th><th className="num">المبلغ</th></tr></thead>
            <tbody>{expenses.map((row, index) => <tr key={row.id}>
              <td>{index + 1}</td><td>{dateAr(row.expense_date)}</td><td>{valueOrDash(row.category)}</td><td>{valueOrDash(row.notes)}</td>
              <td>{PAYER[row.payer] || row.payer} · {CHARGE[row.charge_to] || row.charge_to}</td><td className="num"><MoneyValue value={row.amount} /></td>
            </tr>)}</tbody>
          </table>
        </>}

        {deductions.length > 0 && <>
          <div className="section-title" data-print-keep-with-next="true">السلف المستردة</div>
          <table className="data-table" data-print-flow={PRINT_FLOW_KIND.REPEATABLE_TABLE}>
            <thead><tr><th data-print-column-role="row-index">م</th><th>تاريخ السلفة</th><th className="num">قيمة السلفة</th><th className="num">المسترد في هذه التسوية</th></tr></thead>
            <tbody>{deductions.map((row, index) => <tr key={row.id}>
              <td>{index + 1}</td><td>{dateAr(row.contractor_advances?.advance_date)}</td>
              <td className="num"><MoneyValue value={row.contractor_advances?.amount} /></td><td className="num"><MoneyValue value={row.amount} /></td>
            </tr>)}</tbody>
          </table>
        </>}

        <ProcedureStagePanel manual={[
          { label: 'إعداد الكشف' },
          { label: 'تدقيق الموارد البشرية' },
          { label: 'اعتماد المحاسب' },
          { label: 'تعميد المدير التنفيذي' },
          { label: 'استلام المقاول', name: contractor?.name_ar || '' },
        ]} />
      </div>
    </ConstitutionPrintFrame>
  </>;
}
