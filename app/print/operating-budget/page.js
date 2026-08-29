'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { money, dateAr } from '@/lib/format';
import ConstitutionPrintFrame from '@/components/print/ConstitutionPrintFrame';
import { monthKey, monthLabelAr } from '@/lib/operating-budget';
import { operationalDate } from '@/lib/system-constitution';
import { filterBySelection, normalizeRecordSelection } from '@/lib/record-selection';

function clampMargin(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 10;
  return Math.min(100, Math.max(0, n));
}

function monthlyEstimate(line) {
  return line.cash_effect_type === 'reserve_only'
    ? Number(line.required_reserve || 0)
    : Number(line.expected_amount || 0);
}

function actualValue(line) {
  if (line.cash_effect_type !== 'due_now' || line.confirmed_amount == null) return null;
  return Number(line.confirmed_amount || 0);
}

export default function OperatingBudgetPrintPage() {
  const [month, setMonth] = useState('');
  const [margin, setMargin] = useState(10);
  const [period, setPeriod] = useState(null);
  const [rows, setRows] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [cfg, setCfg] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedMonth = params.get('month') || monthKey(operationalDate());
    const requestedMargin = clampMargin(params.get('margin') ?? 10);
    const requestedSelection = normalizeRecordSelection(params.get('selected'));
    setMonth(requestedMonth);
    setMargin(requestedMargin);
    setSelectedIds(requestedSelection);

    (async () => {
      const periodStart = `${requestedMonth}-01`;
      const [p, s] = await Promise.all([
        supabase.from('budget_periods').select('id,period_start,period_end,status').eq('period_start', periodStart).maybeSingle(),
        supabase.from('app_settings').select('*').eq('id', 1).maybeSingle(),
      ]);
      if (p.error) { setErr(`تعذّر تحميل الشهر: ${p.error.message}`); return; }
      if (!p.data) { setErr('هذا الشهر لم يُفتح بعد في ميزانية التشغيل. افتحه أولًا لتوليد تقرير البنود.'); return; }

      const st = await supabase.rpc('budget_period_statement', { p_period_id: p.data.id });
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
    const estimated = data.reduce((sum, line) => sum + monthlyEstimate(line), 0);
    const actual = data.reduce((sum, line) => sum + (actualValue(line) ?? 0), 0);
    const paid = data.reduce((sum, line) => sum + Number(line.paid_amount || 0), 0);
    const actualCount = data.filter((line) => actualValue(line) != null).length;
    const comparedEstimate = data.reduce((sum, line) => actualValue(line) == null ? sum : sum + Number(line.expected_amount || 0), 0);
    const variance = actual - comparedEstimate;
    const target = estimated * (1 + clampMargin(margin) / 100);
    return { estimated, actual, paid, actualCount, variance, target };
  }, [printRows, margin]);

  if (err) return <div style={{ padding: 40 }} className="msg err">{err}</div>;
  if (!printRows || !period || cfg == null) return <div style={{ padding: 40 }}>جارٍ تحميل تقرير ميزانية التشغيل…</div>;
  if (selectionMode && !printRows.length) return <div style={{ padding: 40 }} className="msg err">لا توجد بنود من هذا الكشف تطابق التحديد المطلوب.</div>;

  return <>
    <div className="ob-toolbar no-print">
      <button className="primary" onClick={() => window.print()}>طباعة أو حفظ PDF</button>
      <label>هامش الأمان % <input type="number" min="0" max="100" step="0.5" value={margin} onChange={(e) => setMargin(clampMargin(e.target.value))} /></label>
      <span>المستهدف توفيره: <strong>{money(totals.target)} ريال</strong></span>
    </div>

    <ConstitutionPrintFrame documentKey="operating_budget_report" cfg={cfg} showLetterhead showStamp>
      <div className="ob-report">
        <header className="ob-title">
          <h1>{selectionMode ? 'تقرير ميزانية التشغيل — البنود المحددة' : 'تقرير ميزانية التشغيل'}</h1>
          <div>{monthLabelAr(month)} · {cfg.company_name_ar || 'أركان المكان'}</div>
          <small>{selectionMode ? `نطاق التقرير: ${printRows.length} بند محدد فقط. ` : ''}التقدير للتخطيط، والقيمة الفعلية تُسجل عند ورود الفاتورة، والمدفوع يأتي من الخزينة.</small>
        </header>

        <div className="ob-kpis">
          <div><span>التكلفة التقديرية {selectionMode ? 'للمحدد' : 'للشهر'}</span><strong>{money(totals.estimated)} ريال</strong></div>
          <div><span>هامش الأمان</span><strong>{money(totals.estimated * clampMargin(margin) / 100)} ريال</strong><small>{clampMargin(margin)}%</small></div>
          <div className="ob-target"><span>الميزانية المستهدف توفيرها</span><strong>{money(totals.target)} ريال</strong></div>
        </div>

        <table className="ob-table">
          <thead><tr><th>البند</th><th>التقديري</th><th>الفعلي</th><th>المدفوع</th><th>الفرق</th></tr></thead>
          <tbody>
            {printRows.map((line) => {
              const estimated = monthlyEstimate(line);
              const actual = actualValue(line);
              const variance = actual == null ? null : actual - Number(line.expected_amount || 0);
              return <tr key={line.line_id}>
                <td>
                  <strong>{line.item_name}</strong>
                  <small>{line.parent_name || ''}{line.cash_effect_type === 'reserve_only' ? ` · مخصص لاستحقاق ${dateAr(line.due_date)}` : ''}</small>
                </td>
                <td className="num">{money(estimated)}</td>
                <td className="num">{actual == null ? '—' : money(actual)}</td>
                <td className="num">{money(line.paid_amount || 0)}</td>
                <td className="num">{variance == null ? '—' : money(variance)}</td>
              </tr>;
            })}
            <tr className="ob-total">
              <td>الإجمالي</td>
              <td className="num">{money(totals.estimated)}</td>
              <td className="num">{totals.actualCount ? money(totals.actual) : '—'}</td>
              <td className="num">{money(totals.paid)}</td>
              <td className="num">{totals.actualCount ? money(totals.variance) : '—'}</td>
            </tr>
          </tbody>
        </table>

        <div className="ob-note">
          <strong>قراءة التقرير:</strong> الميزانية المستهدف توفيرها = التكلفة التقديرية {selectionMode ? 'للبنود المحددة' : 'لهذا الشهر'} + هامش الأمان. المبالغ الفعلية والمدفوعة لا تُستبدل عند تصحيح التقديرات.
        </div>
      </div>
    </ConstitutionPrintFrame>

    <style jsx global>{`
      .ob-toolbar{max-width:210mm;margin:8px auto;display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:9px 12px;border:1px solid #ccc;background:#fff;direction:rtl}
      .ob-toolbar button,.ob-toolbar input{font:inherit;padding:6px 9px;border:1px solid #aaa;background:#fff}.ob-toolbar button.primary{background:#111;color:#fff;border-color:#111}.ob-toolbar label{display:flex;gap:6px;align-items:center}.ob-toolbar input{width:78px}
      .ob-report{direction:rtl;font-size:11.5px;color:#111}.ob-title{text-align:center;margin:0 0 7mm}.ob-title h1{font-size:21px;margin:0 0 2mm}.ob-title small{display:block;margin-top:2mm;color:#555}
      .ob-kpis{display:grid;grid-template-columns:1fr 1fr 1.25fr;gap:3mm;margin-bottom:5mm}.ob-kpis>div{border:1px solid #bbb;padding:3mm;display:flex;flex-direction:column;gap:1mm}.ob-kpis span{font-size:10px;color:#555}.ob-kpis strong{font-size:14px}.ob-kpis small{color:#666}.ob-target{border-width:1.5px!important}
      .ob-table{width:100%;border-collapse:collapse;table-layout:fixed}.ob-table th,.ob-table td{border:1px solid #aaa;padding:2.1mm;vertical-align:top}.ob-table th{font-weight:700;background:#f5f5f5}.ob-table th:first-child,.ob-table td:first-child{width:42%}.ob-table td small{display:block;color:#666;margin-top:.8mm;font-size:9px}.ob-table .num{text-align:center;direction:ltr;font-variant-numeric:tabular-nums}.ob-total td{font-weight:700;border-top:1.5px solid #222}.ob-note{margin-top:5mm;padding-top:3mm;border-top:1px solid #aaa;line-height:1.8}
      @media print{.ob-toolbar{display:none!important}.ob-table tr{break-inside:avoid;page-break-inside:avoid}.ob-kpis>div{break-inside:avoid}}
    `}</style>
  </>;
}
