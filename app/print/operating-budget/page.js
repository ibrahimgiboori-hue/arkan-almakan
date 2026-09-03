'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { money, dateAr } from '@/lib/format';
import ConstitutionPrintFrame from '@/components/print/ConstitutionPrintFrame';
import { PrintColumnLabel } from '@/components/print/PrintPresentationContext';
import { PRINT_FLOW_KIND } from '@/lib/print-governance';
import { monthKey, monthLabelAr, OPERATING_BUDGET } from '@/lib/operating-budget';
import { operationalDate } from '@/lib/system-constitution';
import { filterBySelection, normalizeRecordSelection } from '@/lib/record-selection';

const STATUS = Object.freeze({
  not_due: 'غير مستحق',
  due: 'مستحق',
  paid: 'مسدد',
  overdue: 'متأخر',
});

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function recurrenceLabel(line) {
  const base = OPERATING_BUDGET.recurrenceLabels?.[line.recurrence_unit] || line.recurrence_unit || '';
  const count = Number(line.recurrence_interval_count || 1);
  return count > 1 ? `${base} × ${count}` : base;
}

function dueCell(line) {
  if (line.payment_status === 'overdue') {
    return <><strong>{money(line.amount_due_now)} ريال</strong><small>متأخر منذ {dateAr(line.payment_due_date)}</small></>;
  }
  if (!line.has_due_in_period) return <span>لا يوجد</span>;
  return <>
    <strong>{money(line.due_amount_this_period)} ريال</strong>
    {line.payment_due_date && <small>موعد السداد {dateAr(line.payment_due_date)}</small>}
    {num(line.amount_due_now) !== num(line.due_amount_this_period) && <small>المطلوب الآن {money(line.amount_due_now)} ريال</small>}
  </>;
}

export default function OperatingBudgetPrintPage() {
  const [month, setMonth] = useState('');
  const [period, setPeriod] = useState(null);
  const [rows, setRows] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [cfg, setCfg] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedMonth = params.get('month') || monthKey(operationalDate());
    const requestedSelection = normalizeRecordSelection(params.get('selected'));
    setMonth(requestedMonth);
    setSelectedIds(requestedSelection);

    (async () => {
      const periodStart = `${requestedMonth}-01`;
      const [p, s] = await Promise.all([
        supabase.from('budget_periods').select('id,period_start,period_end,status').eq('period_start', periodStart).maybeSingle(),
        supabase.from('app_settings').select('*').eq('id', 1).maybeSingle(),
      ]);
      if (p.error) { setErr(`تعذّر تحميل الشهر: ${p.error.message}`); return; }
      if (!p.data) { setErr('هذا الشهر لم يُفتح بعد في ميزانية التشغيل. افتحه أولًا لتوليد التقرير.'); return; }

      const st = await supabase.rpc('budget_period_statement_v2', { p_period_id: p.data.id });
      if (st.error) { setErr(`تعذّر تحميل كشف الشهر: ${st.error.message}`); return; }
      setPeriod(p.data);
      setRows(st.data || []);
      setCfg(s.data || {});
    })();
  }, []);

  const printRows = useMemo(() => rows == null ? null : filterBySelection(rows, selectedIds, 'line_id'), [rows, selectedIds]);
  const selectionMode = selectedIds.length > 0;

  const totals = useMemo(() => {
    const data = printRows || [];
    return {
      monthly: data.reduce((sum, line) => sum + num(line.monthly_cost), 0),
      accumulated: data.reduce((sum, line) => sum + num(line.accumulated_cost), 0),
      due: data.reduce((sum, line) => sum + num(line.due_amount_this_period), 0),
      dueNow: data.reduce((sum, line) => sum + num(line.amount_due_now), 0),
      overdue: data.reduce((sum, line) => sum + (line.payment_status === 'overdue' ? num(line.amount_due_now) : 0), 0),
    };
  }, [printRows]);

  if (err) return <div style={{ padding: 40 }} className="msg err">{err}</div>;
  if (!printRows || !period || cfg == null) return <div style={{ padding: 40 }}>جارٍ تحميل تقرير ميزانية التشغيل…</div>;
  if (selectionMode && !printRows.length) return <div style={{ padding: 40 }} className="msg err">لا توجد بنود من هذا الكشف تطابق التحديد المطلوب.</div>;

  return <>
    <div className="ob-toolbar no-print">
      <button className="primary" onClick={() => window.print()}>طباعة أو حفظ PDF</button>
      <span>تكلفة الشهر: <strong>{money(totals.monthly)} ريال</strong></span>
      <span>المطلوب للسداد: <strong>{money(totals.dueNow)} ريال</strong></span>
    </div>

    <ConstitutionPrintFrame documentKey="operating_budget_report" cfg={cfg} showStamp>
      <div className="ob-report">
        <header className="ob-title" data-print-keep-with-next="true">
          <h1>{selectionMode ? 'ميزانية التشغيل — البنود المحددة' : 'ميزانية التشغيل'}</h1>
          <div>{monthLabelAr(month)} · {cfg.company_name_ar || 'أركان المكان'}</div>
          <small>{selectionMode ? `نطاق التقرير: ${printRows.length} بند محدد. ` : ''}تكلفة الشهر منفصلة عن قيمة الدفعة وموعد السداد.</small>
        </header>

        <div className="ob-kpis">
          <div><span>تكلفة الشهر</span><strong>{money(totals.monthly)} ريال</strong><small>المعادل الشهري للبنود الدورية</small></div>
          <div><span>استحقاقات الشهر</span><strong>{money(totals.due)} ريال</strong><small>قيمة الدفعات التي يحل موعدها خلال الشهر</small></div>
          <div><span>المطلوب الآن</span><strong>{money(totals.dueNow)} ريال</strong><small>بعد احتساب ما تم سداده وحلول التاريخ</small></div>
          <div><span>متأخر</span><strong>{money(totals.overdue)} ريال</strong><small>استحقاقات سابقة غير مسددة</small></div>
        </div>

        <table className="ob-table" data-print-flow={PRINT_FLOW_KIND.REPEATABLE_TABLE}>
          <thead><tr>
            <th><PrintColumnLabel field="item_name" fallback="البند" /></th>
            <th><PrintColumnLabel field="monthly_cost" fallback="تكلفة الشهر" /></th>
            <th><PrintColumnLabel field="accumulated_cost" fallback="المتراكم" /></th>
            <th><PrintColumnLabel field="cycle_amount" fallback="قيمة الدفعة" /></th>
            <th><PrintColumnLabel field="due_amount_this_period" fallback="استحقاق هذا الشهر" /></th>
            <th><PrintColumnLabel field="next_due_date" fallback="الاستحقاق القادم" /></th>
            <th><PrintColumnLabel field="payment_status" fallback="السداد" /></th>
          </tr></thead>
          <tbody>
            {printRows.map((line) => <tr key={line.line_id}>
              <td>
                <strong>{line.item_name}</strong>
                <small>{line.parent_name || ''}{recurrenceLabel(line) ? ` · ${recurrenceLabel(line)}` : ''}</small>
              </td>
              <td className="num"><strong>{money(line.monthly_cost)} ريال</strong></td>
              <td className="num">{money(line.accumulated_cost)} ريال</td>
              <td className="num"><strong>{money(line.cycle_amount)} ريال</strong></td>
              <td className="num">{dueCell(line)}</td>
              <td className="num">{line.next_due_date ? dateAr(line.next_due_date) : '—'}</td>
              <td>
                <strong>{STATUS[line.payment_status] || line.payment_status || '—'}</strong>
                {num(line.paid_amount) > 0 && <small>مدفوع للدورة: {money(line.paid_amount)} ريال</small>}
              </td>
            </tr>)}
            <tr className="ob-total" data-print-row-role="total">
              <td>الإجمالي</td>
              <td className="num">{money(totals.monthly)} ريال</td>
              <td className="num">{money(totals.accumulated)} ريال</td>
              <td className="num">—</td>
              <td className="num">{money(totals.due)} ريال</td>
              <td className="num">—</td>
              <td>المطلوب الآن: {money(totals.dueNow)} ريال</td>
            </tr>
          </tbody>
        </table>

        <div className="ob-note">
          <strong>قراءة التقرير:</strong> «تكلفة الشهر» هي نصيب الشهر من تكلفة الدورة الدورية، أما «قيمة الدفعة» فهي المبلغ الكامل الذي يسدد عند حلول الاستحقاق. «المتراكم» يجمع تكلفة الدورة حتى شهر التقرير، ولا يعني بذاته أن المبلغ أصبح مستحقًا للدفع. المخصصات النقدية وحركات الخزينة تبقى مستقلة عن هذا العرض.
        </div>
      </div>
    </ConstitutionPrintFrame>

    <style jsx global>{`
      .ob-toolbar{max-width:297mm;margin:8px auto;display:flex;gap:16px;align-items:center;flex-wrap:wrap;padding:9px 12px;border:1px solid #ccc;background:#fff;direction:rtl}
      .ob-toolbar button{font:inherit;padding:6px 9px;border:1px solid #aaa;background:#fff}.ob-toolbar button.primary{background:#111;color:#fff;border-color:#111}
      .ob-report{direction:rtl;font-size:10.2px;color:#111}.ob-title{text-align:center;margin:0 0 6mm}.ob-title h1{font-size:20px;margin:0 0 2mm}.ob-title small{display:block;margin-top:2mm;color:#555}
      .ob-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:2.5mm;margin-bottom:4mm}.ob-kpis>div{border:1px solid #bbb;padding:2.5mm;display:flex;flex-direction:column;gap:1mm}.ob-kpis span{font-size:9px;color:#555}.ob-kpis strong{font-size:12px}.ob-kpis small{font-size:8px;color:#666}
      .ob-table{width:100%;border-collapse:collapse;table-layout:fixed}.ob-table th,.ob-table td{border:1px solid #aaa;padding:1.7mm;vertical-align:top}.ob-table th{font-weight:700;background:#f5f5f5;font-size:9px}.ob-table th:first-child,.ob-table td:first-child{width:23%}.ob-table td small{display:block;color:#666;margin-top:.7mm;font-size:8px;line-height:1.45}.ob-table .num{text-align:center;direction:rtl;font-variant-numeric:tabular-nums}.ob-total td{font-weight:700;border-top:1.5px solid #222}.ob-note{margin-top:4mm;padding-top:2.5mm;border-top:1px solid #aaa;line-height:1.7}
    `}</style>
  </>;
}
