'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { money, dateAr } from '@/lib/format';
import ConstitutionPrintFrame from '@/components/print/ConstitutionPrintFrame';
import { monthKey, monthLabelAr, OPERATING_BUDGET } from '@/lib/operating-budget';
import { operationalDate } from '@/lib/system-constitution';
import { filterBySelection, normalizeRecordSelection } from '@/lib/record-selection';

const STATUS = Object.freeze({
  not_due: 'غير مستحق',
  due: 'مستحق',
  paid: 'مسدد',
  overdue: 'دفعة سابقة متأخرة',
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

function periodEnd(month) {
  const [year, monthNo] = String(month || '').split('-').map(Number);
  if (!year || !monthNo) return '';
  return new Date(Date.UTC(year, monthNo, 0)).toISOString().slice(0, 10);
}

function previousDate(date) {
  if (!date) return '';
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

function reportAsOf(month) {
  const today = operationalDate();
  const start = `${month}-01`;
  const end = periodEnd(month);
  if (!start || !end) return today;
  if (today < start) return previousDate(start);
  if (today > end) return end;
  return today;
}

function monthsInclusive(month, dueDate) {
  if (!month || !dueDate) return 0;
  const [fromYear, fromMonth] = month.split('-').map(Number);
  const [dueYear, dueMonth] = dueDate.split('-').map(Number);
  if (![fromYear, fromMonth, dueYear, dueMonth].every(Number.isFinite)) return 0;
  return Math.max(((dueYear - fromYear) * 12) + (dueMonth - fromMonth) + 1, 0);
}

function dueCell(line) {
  if (line.payment_status === 'overdue') {
    return <><strong>{money(line.amount_due_now)} ريال</strong><small>دفعة سابقة متأخرة منذ {dateAr(line.payment_due_date)}</small></>;
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
  const asOf = useMemo(() => month ? reportAsOf(month) : operationalDate(), [month]);

  const totals = useMemo(() => {
    const data = printRows || [];
    const futureReserveRows = data.filter((line) => line.cash_effect_type === 'reserve_only');
    const dueLaterThisMonth = data.reduce((sum, line) => {
      if (!line.has_due_in_period || !line.due_date || line.due_date <= asOf) return sum;
      return sum + Math.max(num(line.cycle_amount) - num(line.paid_amount), 0);
    }, 0);
    const dueNow = data.reduce((sum, line) => sum + num(line.amount_due_now), 0);
    const reserveGap = futureReserveRows.reduce((sum, line) => sum + num(line.reserve_gap), 0);
    const reserveRequired = futureReserveRows.reduce((sum, line) => sum + num(line.required_reserve), 0);
    const reservedFuture = futureReserveRows.reduce((sum, line) => sum + num(line.reserved_outstanding), 0);
    const futureUncovered = futureReserveRows.reduce((sum, line) => sum + Math.max(num(line.cycle_amount) - num(line.reserved_outstanding), 0), 0);
    const dueByMonthEnd = dueNow + dueLaterThisMonth;

    return {
      monthly: data.reduce((sum, line) => sum + num(line.monthly_cost), 0),
      accumulated: data.reduce((sum, line) => sum + num(line.accumulated_cost), 0),
      due: data.reduce((sum, line) => sum + num(line.due_amount_this_period), 0),
      dueNow,
      overdue: data.reduce((sum, line) => sum + (line.payment_status === 'overdue' ? num(line.amount_due_now) : 0), 0),
      dueLaterThisMonth,
      dueByMonthEnd,
      reserveRequired,
      reserveGap,
      reservedFuture,
      futureUncovered,
      cashBurden: dueByMonthEnd + reserveGap,
      futureReserveRows,
    };
  }, [printRows, asOf]);

  if (err) return <div style={{ padding: 40 }} className="msg err">{err}</div>;
  if (!printRows || !period || cfg == null) return <div style={{ padding: 40 }}>جارٍ تحميل تقرير ميزانية التشغيل…</div>;
  if (selectionMode && !printRows.length) return <div style={{ padding: 40 }} className="msg err">لا توجد بنود من هذا الكشف تطابق التحديد المطلوب.</div>;

  return <>
    <div className="ob-toolbar no-print">
      <button className="primary" onClick={() => window.print()}>طباعة أو حفظ PDF</button>
      <span>المطلوب حتى نهاية الشهر: <strong>{money(totals.dueByMonthEnd)} ريال</strong></span>
      <span>حجز هذا الشهر: <strong>{money(totals.reserveGap)} ريال</strong></span>
      <span>إجمالي العبء: <strong>{money(totals.cashBurden)} ريال</strong></span>
    </div>

    <ConstitutionPrintFrame documentKey="operating_budget_report" cfg={cfg} showLetterhead showStamp>
      <div className="ob-report">
        <header className="ob-title">
          <h1>{selectionMode ? 'ميزانية التشغيل — البنود المحددة' : 'ميزانية التشغيل'}</h1>
          <div>{monthLabelAr(month)} · {cfg.company_name_ar || 'أركان المكان'}</div>
          <small>{selectionMode ? `نطاق التقرير: ${printRows.length} بند محدد. ` : ''}تاريخ القراءة المالية: {dateAr(asOf)}. تكلفة الشهر منفصلة عن موعد السداد والحجز النقدي.</small>
        </header>

        <div className="ob-kpis">
          <div><span>تكلفة الشهر</span><strong>{money(totals.monthly)} ريال</strong><small>النصيب المحاسبي للبنود الدورية</small></div>
          <div><span>استحقاقات الشهر</span><strong>{money(totals.due)} ريال</strong><small>قيمة الدفعات التي موعدها خلال الشهر</small></div>
          <div><span>المطلوب الآن</span><strong>{money(totals.dueNow)} ريال</strong><small>مستحق حتى تاريخ قراءة التقرير</small></div>
          <div><span>متبقي استحقاقات الشهر</span><strong>{money(totals.dueLaterThisMonth)} ريال</strong><small>سيحل لاحقًا قبل نهاية الشهر</small></div>
          <div><span>الحجز المطلوب هذا الشهر</span><strong>{money(totals.reserveGap)} ريال</strong><small>للاستحقاقات التي موعدها بعد نهاية الشهر</small></div>
          <div className="ob-kpi-primary"><span>إجمالي العبء النقدي للشهر</span><strong>{money(totals.cashBurden)} ريال</strong><small>السداد حتى نهاية الشهر + الحجز المطلوب</small></div>
        </div>

        <div className="ob-decision">
          <strong>ماذا نحتاج هذا الشهر؟</strong>
          <span>يلزم توفير <b>{money(totals.dueByMonthEnd)} ريال</b> لسداد ما هو مستحق الآن وما سيحل خلال {monthLabelAr(month)}، إضافة إلى <b>{money(totals.reserveGap)} ريال</b> كمخصص للاستحقاقات القادمة. إجمالي العبء النقدي للشهر <b>{money(totals.cashBurden)} ريال</b>.</span>
          <small>من مبلغ السداد: {money(totals.dueNow)} ريال مطلوب الآن، و{money(totals.dueLaterThisMonth)} ريال سيحل لاحقًا خلال الشهر. الاستحقاقات السابقة المتأخرة الداخلة في «المطلوب الآن»: {money(totals.overdue)} ريال.</small>
        </div>

        <table className="ob-table">
          <thead><tr>
            <th>البند</th>
            <th>تكلفة الشهر</th>
            <th>المتراكم</th>
            <th>قيمة الدفعة</th>
            <th>استحقاق هذا الشهر</th>
            <th>الاستحقاق القادم</th>
            <th>السداد</th>
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
            <tr className="ob-total">
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

        {totals.futureReserveRows.length > 0 && <section className="ob-reserve-section">
          <div className="ob-section-title">
            <strong>خطة الحجز للاستحقاقات القادمة</strong>
            <small>كل بند يوضح ما يجب حجزه في هذا الشهر حتى تكون قيمة الاستحقاق متوفرة عند موعدها.</small>
          </div>
          <table className="ob-reserve-table">
            <thead><tr>
              <th>البند</th>
              <th>قيمة الاستحقاق</th>
              <th>موعد الاستحقاق</th>
              <th>المحجوز حتى الآن</th>
              <th>المتبقي للتغطية</th>
              <th>الأشهر المتبقية</th>
              <th>المطلوب حجزه هذا الشهر</th>
            </tr></thead>
            <tbody>
              {totals.futureReserveRows.map((line) => <tr key={`reserve-${line.line_id}`}>
                <td><strong>{line.item_name}</strong></td>
                <td className="num">{money(line.cycle_amount)} ريال</td>
                <td className="num">{line.due_date ? dateAr(line.due_date) : '—'}</td>
                <td className="num">{money(line.reserved_outstanding)} ريال</td>
                <td className="num">{money(Math.max(num(line.cycle_amount) - num(line.reserved_outstanding), 0))} ريال</td>
                <td className="num">{monthsInclusive(month, line.due_date) || '—'}</td>
                <td className="num"><strong>{money(line.reserve_gap)} ريال</strong>{num(line.reserve_gap) < num(line.required_reserve) && <small>هدف الشهر {money(line.required_reserve)} ريال</small>}</td>
              </tr>)}
              <tr className="ob-total">
                <td>الإجمالي</td>
                <td className="num">{money(totals.futureReserveRows.reduce((sum, line) => sum + num(line.cycle_amount), 0))} ريال</td>
                <td>—</td>
                <td className="num">{money(totals.reservedFuture)} ريال</td>
                <td className="num">{money(totals.futureUncovered)} ريال</td>
                <td>—</td>
                <td className="num">{money(totals.reserveGap)} ريال</td>
              </tr>
            </tbody>
          </table>
        </section>}

        <div className="ob-note">
          <strong>قراءة التقرير:</strong> «تكلفة الشهر» هي نصيب الشهر من تكلفة الدورة الدورية، أما «قيمة الدفعة» فهي المبلغ الكامل الذي يسدد عند حلول الاستحقاق. «المتراكم» يجمع تكلفة الدورة حتى شهر التقرير ولا يعني بذاته أن المبلغ أصبح مستحقًا للدفع. «المطلوب الآن» يشمل ما حل موعده حتى تاريخ القراءة، بينما «متبقي استحقاقات الشهر» يوضح ما سيحل لاحقًا خلال نفس الشهر. «الحجز المطلوب هذا الشهر» يخص فقط الاستحقاقات الواقعة بعد نهاية شهر التقرير، لذلك لا يتكرر مع استحقاقات الشهر. «المحجوز حتى الآن» رصيد محمي وليس مصروفًا.
        </div>
      </div>
    </ConstitutionPrintFrame>

    <style jsx global>{`
      .ob-toolbar{max-width:210mm;margin:8px auto;display:flex;gap:16px;align-items:center;flex-wrap:wrap;padding:9px 12px;border:1px solid #ccc;background:#fff;direction:rtl}
      .ob-toolbar button{font:inherit;padding:6px 9px;border:1px solid #aaa;background:#fff}.ob-toolbar button.primary{background:#111;color:#fff;border-color:#111}
      .ob-report{direction:rtl;font-size:10.2px;color:#111}.ob-title{text-align:center;margin:0 0 5mm}.ob-title h1{font-size:20px;margin:0 0 2mm}.ob-title small{display:block;margin-top:2mm;color:#555}
      .ob-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:2.2mm;margin-bottom:3mm}.ob-kpis>div{border:1px solid #bbb;padding:2.3mm;display:flex;flex-direction:column;gap:1mm}.ob-kpis span{font-size:8.5px;color:#555}.ob-kpis strong{font-size:11.5px}.ob-kpis small{font-size:7.7px;color:#666}.ob-kpis .ob-kpi-primary{border:1.5px solid #222;background:#fafafa}
      .ob-decision{border:1.4px solid #444;padding:2.8mm 3.2mm;margin:0 0 4mm;line-height:1.65;display:flex;flex-direction:column;gap:1mm}.ob-decision>strong{font-size:11px}.ob-decision small{color:#555}
      .ob-table,.ob-reserve-table{width:100%;border-collapse:collapse;table-layout:fixed}.ob-table th,.ob-table td,.ob-reserve-table th,.ob-reserve-table td{border:1px solid #aaa;padding:1.7mm;vertical-align:top}.ob-table th,.ob-reserve-table th{font-weight:700;background:#f5f5f5;font-size:9px}.ob-table th:first-child,.ob-table td:first-child{width:23%}.ob-table td small,.ob-reserve-table td small{display:block;color:#666;margin-top:.7mm;font-size:8px;line-height:1.45}.ob-table .num,.ob-reserve-table .num{text-align:center;direction:rtl;font-variant-numeric:tabular-nums}.ob-total td{font-weight:700;border-top:1.5px solid #222}
      .ob-reserve-section{margin-top:5mm;break-before:auto}.ob-section-title{margin-bottom:2mm;display:flex;flex-direction:column;gap:.6mm}.ob-section-title>strong{font-size:12px}.ob-section-title small{color:#555}.ob-reserve-table{font-size:9.2px}.ob-reserve-table th:first-child,.ob-reserve-table td:first-child{width:22%}
      .ob-note{margin-top:4mm;padding-top:2.5mm;border-top:1px solid #aaa;line-height:1.7}
      @media print{.ob-toolbar{display:none!important}.ob-table tr,.ob-reserve-table tr{break-inside:avoid;page-break-inside:avoid}.ob-kpis>div,.ob-decision,.ob-section-title{break-inside:avoid}.ob-reserve-section{break-inside:auto}}
    `}</style>
  </>;
}