'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { money, dateAr } from '@/lib/format';
import ConstitutionPrintFrame from '@/components/print/ConstitutionPrintFrame';
import { PrintColumnLabel } from '@/components/print/PrintPresentationContext';
import { PRINT_FLOW_KIND } from '@/lib/print-governance';
import { monthKey, monthLabelAr, OPERATING_BUDGET } from '@/lib/operating-budget';
import { operationalDate } from '@/lib/system-constitution';
import { filterBySelection, normalizeRecordSelection } from '@/lib/record-selection';
import {
  REPORT_SORT_DIRECTION,
  groupPreparedReportRows,
  prepareReportRows,
} from '@/lib/report-preparation';

const STATUS = Object.freeze({
  not_due: 'غير مستحق',
  due: 'مستحق',
  paid: 'مسدد',
  overdue: 'دفعة سابقة متأخرة',
});

const SORT_OPTIONS = Object.freeze([
  { value:'source', label:'الترتيب الأصلي' },
  { value:'item_name', label:'البند — أبجديًا', type:'text' },
  { value:'monthly_cost', label:'تكلفة الشهر', type:'money' },
  { value:'accumulated_cost', label:'المتراكم', type:'money' },
  { value:'cycle_amount', label:'قيمة الدفعة', type:'money' },
  { value:'due_amount_this_period', label:'استحقاق هذا الشهر', type:'money' },
  { value:'amount_due_now', label:'المطلوب الآن', type:'money' },
  { value:'next_due_date', label:'الاستحقاق القادم', type:'date' },
]);

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

function totalsFor(data = [], asOf = '') {
  const futureReserveRows = data.filter((line) => line.cash_effect_type === 'reserve_only');
  const dueLaterThisMonth = data.reduce((sum, line) => {
    if (!line.has_due_in_period || !line.due_date || !asOf || line.due_date <= asOf) return sum;
    return sum + Math.max(num(line.cycle_amount) - num(line.paid_amount), 0);
  }, 0);
  const dueNow = data.reduce((sum, line) => sum + num(line.amount_due_now), 0);
  const reserveRequired = futureReserveRows.reduce((sum, line) => sum + num(line.required_reserve), 0);
  const reserveGap = futureReserveRows.reduce((sum, line) => sum + num(line.reserve_gap), 0);
  const reservedFuture = futureReserveRows.reduce((sum, line) => sum + num(line.reserved_outstanding), 0);
  const futureUncovered = futureReserveRows.reduce((sum, line) => sum + Math.max(num(line.cycle_amount) - num(line.reserved_outstanding), 0), 0);
  const dueByMonthEnd = dueNow + dueLaterThisMonth;

  return {
    monthly:data.reduce((sum,line)=>sum+num(line.monthly_cost),0),
    accumulated:data.reduce((sum,line)=>sum+num(line.accumulated_cost),0),
    due:data.reduce((sum,line)=>sum+num(line.due_amount_this_period),0),
    dueNow,
    overdue:data.reduce((sum,line)=>sum+(line.payment_status==='overdue'?num(line.amount_due_now):0),0),
    dueLaterThisMonth,
    dueByMonthEnd,
    reserveRequired,
    reserveGap,
    reservedFuture,
    futureUncovered,
    cashBurden:dueByMonthEnd + reserveGap,
    futureReserveRows,
  };
}

export default function OperatingBudgetPrintPage() {
  const [month, setMonth] = useState('');
  const [period, setPeriod] = useState(null);
  const [rows, setRows] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [cfg, setCfg] = useState(null);
  const [err, setErr] = useState('');

  // إعداد التقرير لا يغير مصدر البيانات. هو منظر مشتق فقط قبل أن يستلم القبطان المحتوى.
  const [search, setSearch] = useState('');
  const [parentFilter, setParentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortField, setSortField] = useState('source');
  const [sortDirection, setSortDirection] = useState(REPORT_SORT_DIRECTION.ASC);
  const [groupBy, setGroupBy] = useState('none');

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

  const sourceRows = useMemo(
    () => rows == null ? null : filterBySelection(rows, selectedIds, 'line_id'),
    [rows, selectedIds],
  );
  const selectionMode = selectedIds.length > 0;
  const asOf = useMemo(() => month ? reportAsOf(month) : operationalDate(), [month]);

  const parentOptions = useMemo(() => {
    const values = new Set((sourceRows || []).map((line)=>String(line.parent_name || '').trim()).filter(Boolean));
    return [...values].sort((a,b)=>a.localeCompare(b,'ar',{numeric:true,sensitivity:'base'}));
  }, [sourceRows]);

  const preparedRows = useMemo(() => {
    if (sourceRows == null) return null;
    const sortOption = SORT_OPTIONS.find((option)=>option.value===sortField);
    return prepareReportRows(sourceRows, {
      search,
      searchFields:['item_name','parent_name'],
      filters:{
        parent_name:parentFilter,
        payment_status:statusFilter,
      },
      sort:sortField==='source' ? null : {
        field:sortField,
        type:sortOption?.type || 'text',
        direction:sortDirection,
      },
    });
  }, [sourceRows, search, parentFilter, statusFilter, sortField, sortDirection]);

  const sections = useMemo(() => {
    if (preparedRows == null) return [];
    if (groupBy === 'parent') {
      return groupPreparedReportRows(preparedRows, {
        field:'parent_name',
        emptyLabel:'غير مصنف',
      });
    }
    if (groupBy === 'status') {
      return groupPreparedReportRows(preparedRows, {
        field:'payment_status',
        labelFor:(value)=>STATUS[value] || value || 'غير محدد',
        emptyLabel:'غير محدد',
      });
    }
    return groupPreparedReportRows(preparedRows);
  }, [preparedRows, groupBy]);

  const totals = useMemo(() => totalsFor(preparedRows || [], asOf), [preparedRows, asOf]);
  const hasPreparation = Boolean(search.trim()) || parentFilter !== 'all' || statusFilter !== 'all' || sortField !== 'source' || groupBy !== 'none';
  const preparedCount = preparedRows?.length || 0;
  const sourceCount = sourceRows?.length || 0;
  const grouped = groupBy !== 'none';

  function resetPreparation() {
    setSearch('');
    setParentFilter('all');
    setStatusFilter('all');
    setSortField('source');
    setSortDirection(REPORT_SORT_DIRECTION.ASC);
    setGroupBy('none');
  }

  function renderTable(section, index) {
    const sectionTotals = totalsFor(section.rows, asOf);
    return <Fragment key={section.key || index}>
      {grouped && <div className="ob-section-title" data-print-keep-with-next="true" data-report-section-heading="true">
        <strong>{section.label}</strong>
        <span>{section.rows.length} بند · تكلفة الشهر {money(sectionTotals.monthly)} ريال · المطلوب حتى نهاية الشهر {money(sectionTotals.dueByMonthEnd)} ريال</span>
      </div>}
      <table className="ob-table" data-print-flow={PRINT_FLOW_KIND.REPEATABLE_TABLE} data-report-section={section.key || 'all'}>
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
          {section.rows.map((line) => <tr key={line.line_id}>
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
          <tr className="ob-total" data-print-row-role="total" data-print-row-atomic="true">
            <td>{grouped ? `إجمالي ${section.label}` : 'الإجمالي'}</td>
            <td className="num">{money(sectionTotals.monthly)} ريال</td>
            <td className="num">{money(sectionTotals.accumulated)} ريال</td>
            <td className="num">—</td>
            <td className="num">{money(sectionTotals.due)} ريال</td>
            <td className="num">—</td>
            <td>المطلوب الآن: {money(sectionTotals.dueNow)} ريال</td>
          </tr>
        </tbody>
      </table>
    </Fragment>;
  }

  if (err) return <div style={{ padding: 40 }} className="msg err">{err}</div>;
  if (!sourceRows || !period || cfg == null) return <div style={{ padding: 40 }}>جارٍ تحميل تقرير ميزانية التشغيل…</div>;
  if (selectionMode && !sourceRows.length) return <div style={{ padding: 40 }} className="msg err">لا توجد بنود من هذا الكشف تطابق التحديد المطلوب.</div>;

  return <>
    <div className="ob-toolbar no-print" data-report-preparation="filter-sort-group-before-print-v1">
      <div className="ob-toolbar-main">
        <button className="primary" onClick={() => window.print()} disabled={!preparedCount}>طباعة أو حفظ PDF</button>
        <strong>إعداد التقرير</strong>
        <span>{preparedCount} من {sourceCount} بند</span>
        <span>المطلوب حتى نهاية الشهر: <strong>{money(totals.dueByMonthEnd)} ريال</strong></span>
        <span>حجز هذا الشهر: <strong>{money(totals.reserveGap)} ريال</strong></span>
        <span>إجمالي العبء: <strong>{money(totals.cashBurden)} ريال</strong></span>
      </div>
      <div className="ob-prep-controls">
        <label>بحث
          <input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="اسم البند أو التصنيف" />
        </label>
        <label>التصنيف
          <select value={parentFilter} onChange={(event)=>setParentFilter(event.target.value)}>
            <option value="all">كل التصنيفات</option>
            {parentOptions.map((value)=><option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>السداد
          <select value={statusFilter} onChange={(event)=>setStatusFilter(event.target.value)}>
            <option value="all">كل الحالات</option>
            {Object.entries(STATUS).map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>الترتيب
          <select value={sortField} onChange={(event)=>setSortField(event.target.value)}>
            {SORT_OPTIONS.map((option)=><option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>الاتجاه
          <select value={sortDirection} onChange={(event)=>setSortDirection(event.target.value)} disabled={sortField==='source'}>
            <option value={REPORT_SORT_DIRECTION.ASC}>تصاعدي</option>
            <option value={REPORT_SORT_DIRECTION.DESC}>تنازلي</option>
          </select>
        </label>
        <label>تقسيم التقرير
          <select value={groupBy} onChange={(event)=>setGroupBy(event.target.value)}>
            <option value="none">بدون تقسيم</option>
            <option value="parent">أجزاء حسب التصنيف</option>
            <option value="status">أجزاء حسب حالة السداد</option>
          </select>
        </label>
        <button type="button" onClick={resetPreparation} disabled={!hasPreparation}>إعادة الضبط</button>
      </div>
      <small>الفلترة والترتيب والتقسيم تغيّر العرض فقط ولا تغيّر بيانات الميزانية. الأقسام دلالية؛ القبطان وحده يقرر مواضع كسر الصفحات.</small>
    </div>

    {preparedCount === 0 ? <div className="ob-empty-prepared no-print">لا توجد بنود تطابق الفلترة الحالية. غيّر الفلتر قبل الطباعة.</div> : <ConstitutionPrintFrame documentKey="operating_budget_report" cfg={cfg} showStamp>
      <div className="ob-report">
        <header className="ob-title" data-print-keep-with-next="true">
          <h1>{selectionMode ? 'ميزانية التشغيل — البنود المحددة' : 'ميزانية التشغيل'}</h1>
          <div>{monthLabelAr(month)} · {cfg.company_name_ar || 'أركان المكان'}</div>
          <small>
            {selectionMode ? `نطاق المصدر: ${sourceCount} بند محدد. ` : ''}
            {hasPreparation ? `نطاق التقرير بعد الإعداد: ${preparedCount} بند${grouped ? ` في ${sections.length} أجزاء` : ''}. ` : ''}
            تاريخ القراءة المالية: {dateAr(asOf)}. تكلفة الشهر منفصلة عن موعد السداد والحجز النقدي.
          </small>
        </header>

        <div className="ob-kpis" data-print-row-atomic="true">
          <div><span>تكلفة الشهر</span><strong>{money(totals.monthly)} ريال</strong><small>النصيب المحاسبي للبنود الدورية</small></div>
          <div><span>استحقاقات الشهر</span><strong>{money(totals.due)} ريال</strong><small>قيمة الدفعات التي موعدها خلال الشهر</small></div>
          <div><span>المطلوب الآن</span><strong>{money(totals.dueNow)} ريال</strong><small>مستحق حتى تاريخ قراءة التقرير</small></div>
          <div><span>متبقي استحقاقات الشهر</span><strong>{money(totals.dueLaterThisMonth)} ريال</strong><small>سيحل لاحقًا قبل نهاية الشهر</small></div>
          <div><span>الحجز المطلوب هذا الشهر</span><strong>{money(totals.reserveGap)} ريال</strong><small>المتبقي لإكمال مخصص هذا الشهر للاستحقاقات القادمة</small></div>
          <div className="ob-kpi-primary"><span>إجمالي العبء النقدي للشهر</span><strong>{money(totals.cashBurden)} ريال</strong><small>السداد حتى نهاية الشهر + الحجز المطلوب</small></div>
        </div>

        <div className="ob-decision" data-print-row-atomic="true">
          <strong>ماذا نحتاج هذا الشهر؟</strong>
          <span>يلزم توفير <b>{money(totals.dueByMonthEnd)} ريال</b> لسداد ما هو مستحق الآن وما سيحل خلال {monthLabelAr(month)}، إضافة إلى <b>{money(totals.reserveGap)} ريال</b> لإكمال حجز هذا الشهر للاستحقاقات القادمة. إجمالي العبء النقدي للشهر <b>{money(totals.cashBurden)} ريال</b>.</span>
          <small>من مبلغ السداد: {money(totals.dueNow)} ريال مطلوب الآن، و{money(totals.dueLaterThisMonth)} ريال سيحل لاحقًا خلال الشهر. الدفعات السابقة المتأخرة الداخلة في «المطلوب الآن»: {money(totals.overdue)} ريال.</small>
        </div>

        {sections.map(renderTable)}

        {grouped && sections.length > 1 && <div className="ob-grand-total" data-print-row-atomic="true">
          <strong>إجمالي التقرير</strong>
          <span>تكلفة الشهر: {money(totals.monthly)} ريال</span>
          <span>استحقاقات الشهر: {money(totals.due)} ريال</span>
          <span>المطلوب حتى نهاية الشهر: {money(totals.dueByMonthEnd)} ريال</span>
          <span>الحجز المطلوب: {money(totals.reserveGap)} ريال</span>
        </div>}

        {totals.futureReserveRows.length > 0 && <section className="ob-reserve-section">
          <div className="ob-reserve-title" data-print-keep-with-next="true">
            <strong>خطة الحجز للاستحقاقات القادمة</strong>
            <small>الحجز الشهري هنا مشتق من نافذة الاستحقاق الفعلية بالأيام، ويُظهر المتبقي المطلوب في شهر التقرير دون تغيير أصل الالتزام.</small>
          </div>
          <table className="ob-reserve-table" data-print-flow={PRINT_FLOW_KIND.REPEATABLE_TABLE} data-report-section="future-reserve-plan">
            <thead><tr>
              <th><PrintColumnLabel field="item_name" fallback="البند" /></th>
              <th><PrintColumnLabel field="cycle_amount" fallback="قيمة الاستحقاق" /></th>
              <th><PrintColumnLabel field="due_date" fallback="موعد الاستحقاق" /></th>
              <th><PrintColumnLabel field="reserved_outstanding" fallback="المحجوز حتى الآن" /></th>
              <th>المتبقي للتغطية</th>
              <th><PrintColumnLabel field="required_reserve" fallback="مخصص هذا الشهر" /></th>
              <th><PrintColumnLabel field="reserve_gap" fallback="المطلوب حجزه الآن" /></th>
            </tr></thead>
            <tbody>
              {totals.futureReserveRows.map((line) => <tr key={`reserve-${line.line_id}`}>
                <td><strong>{line.item_name}</strong></td>
                <td className="num">{money(line.cycle_amount)} ريال</td>
                <td className="num">{line.due_date ? dateAr(line.due_date) : '—'}</td>
                <td className="num">{money(line.reserved_outstanding)} ريال</td>
                <td className="num">{money(Math.max(num(line.cycle_amount) - num(line.reserved_outstanding), 0))} ريال</td>
                <td className="num">{money(line.required_reserve)} ريال</td>
                <td className="num"><strong>{money(line.reserve_gap)} ريال</strong>{num(line.reserve_gap) < num(line.required_reserve) && <small>تم حجز جزء من مخصص الشهر</small>}</td>
              </tr>)}
              <tr className="ob-total" data-print-row-role="total" data-print-row-atomic="true">
                <td>الإجمالي</td>
                <td className="num">{money(totals.futureReserveRows.reduce((sum, line) => sum + num(line.cycle_amount), 0))} ريال</td>
                <td>—</td>
                <td className="num">{money(totals.reservedFuture)} ريال</td>
                <td className="num">{money(totals.futureUncovered)} ريال</td>
                <td className="num">{money(totals.reserveRequired)} ريال</td>
                <td className="num">{money(totals.reserveGap)} ريال</td>
              </tr>
            </tbody>
          </table>
        </section>}

        <div className="ob-note">
          <strong>قراءة التقرير:</strong> «تكلفة الشهر» هي نصيب الشهر من تكلفة الدورة، أما «قيمة الدفعة» فهي المبلغ الكامل عند حلول الاستحقاق. «المتراكم» لا يعني بذاته أن المبلغ أصبح مستحقًا للدفع. «المطلوب الآن» يشمل ما حل موعده حتى تاريخ القراءة، و«متبقي استحقاقات الشهر» يوضح ما سيحل لاحقًا في الشهر نفسه. «مخصص هذا الشهر» هو الحصة المخططة للحجز بحسب الأيام الفعلية من نافذة الاستحقاق، و«المطلوب حجزه الآن» هو الجزء الذي لم يُحجز بعد من هذه الحصة. «المحجوز حتى الآن» رصيد محمي وليس مصروفًا.
        </div>
      </div>
    </ConstitutionPrintFrame>}

    <style jsx global>{`
      .ob-toolbar{max-width:297mm;margin:8px auto;display:grid;gap:9px;padding:10px 12px;border:1px solid #ccc;background:#fff;direction:rtl;color:#111}.ob-toolbar-main{display:flex;gap:14px;align-items:center;flex-wrap:wrap}.ob-toolbar button{font:inherit;padding:6px 9px;border:1px solid #aaa;background:#fff;color:#111}.ob-toolbar button.primary{background:#111;color:#fff;border-color:#111}.ob-toolbar button:disabled{opacity:.45;cursor:not-allowed}.ob-toolbar>small{color:#555;line-height:1.5}
      .ob-prep-controls{display:flex;gap:8px 10px;align-items:end;flex-wrap:wrap;padding-top:8px;border-top:1px solid #e1e1e1}.ob-prep-controls label{display:grid;gap:3px;font-size:11px;color:#444}.ob-prep-controls input,.ob-prep-controls select{min-width:126px;max-width:210px;height:31px;padding:4px 7px;border:1px solid #bbb;background:#fff;color:#111;font:inherit;font-size:12px}.ob-prep-controls input{min-width:190px}.ob-empty-prepared{max-width:297mm;margin:10px auto;padding:18px;border:1px solid #d4b2b2;background:#fff8f8;color:#7a2925;direction:rtl}
      .ob-report{direction:rtl;font-size:10.2px;color:#111}.ob-title{text-align:center;margin:0 0 6mm}.ob-title h1{font-size:20px;margin:0 0 2mm}.ob-title small{display:block;margin-top:2mm;color:#555}
      .ob-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:2.2mm;margin-bottom:3mm}.ob-kpis>div{border:1px solid #bbb;padding:2.3mm;display:flex;flex-direction:column;gap:1mm}.ob-kpis span{font-size:8.5px;color:#555}.ob-kpis strong{font-size:11.5px}.ob-kpis small{font-size:7.7px;color:#666}.ob-kpis .ob-kpi-primary{border:1.5px solid #222;background:#fafafa}
      .ob-decision{border:1.4px solid #444;padding:2.8mm 3.2mm;margin:0 0 4mm;line-height:1.65;display:flex;flex-direction:column;gap:1mm}.ob-decision>strong{font-size:11px}.ob-decision small{color:#555}
      .ob-section-title{display:flex;align-items:baseline;justify-content:space-between;gap:4mm;margin:3.5mm 0 1.4mm;padding-bottom:1mm;border-bottom:.35mm solid #8B3332;color:#111}.ob-section-title strong{font-size:11px}.ob-section-title span{font-size:8px;color:#555}
      .ob-table,.ob-reserve-table{width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:2.8mm}.ob-table th,.ob-table td,.ob-reserve-table th,.ob-reserve-table td{border:1px solid #aaa;padding:1.7mm;vertical-align:top}.ob-table th,.ob-reserve-table th{font-weight:700;background:#f5f5f5;font-size:9px}.ob-table th:first-child,.ob-table td:first-child{width:23%}.ob-table td small,.ob-reserve-table td small{display:block;color:#666;margin-top:.7mm;font-size:8px;line-height:1.45}.ob-table .num,.ob-reserve-table .num{text-align:center;direction:rtl;font-variant-numeric:tabular-nums}.ob-total td{font-weight:700;border-top:1.5px solid #222}.ob-grand-total{display:flex;gap:5mm;align-items:center;flex-wrap:wrap;margin-top:2mm;padding:2.5mm;border:.3mm solid #8B3332;background:#faf5f5;font-weight:700}
      .ob-reserve-section{margin-top:5mm}.ob-reserve-title{margin-bottom:2mm;display:flex;flex-direction:column;gap:.6mm}.ob-reserve-title>strong{font-size:12px}.ob-reserve-title small{color:#555}.ob-reserve-table{font-size:9.2px}.ob-reserve-table th:first-child,.ob-reserve-table td:first-child{width:22%}
      .ob-note{margin-top:4mm;padding-top:2.5mm;border-top:1px solid #aaa;line-height:1.7}
    `}</style>
  </>;
}
