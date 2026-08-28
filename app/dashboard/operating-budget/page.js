'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { money, dateAr } from '@/lib/format';
import { operationalDate } from '@/lib/system-constitution';
import {
  OPERATING_BUDGET,
  budgetInputFields,
  monthKey,
  monthLabelAr,
  monthStart,
} from '@/lib/operating-budget';
import {
  ConstitutionPage,
  PageHeader,
  Section,
  EntrySurface,
  SummaryStrip,
  Notice,
  Toolbar,
  TableFrame,
  EmptyState,
} from '@/components/ui/ConstitutionUI';

const EMPTY_SUMMARY = {
  opening_bank_balance: null,
  protected_balance: 0,
  free_opening_balance: null,
  expected_due: 0,
  confirmed_due: 0,
  paid: 0,
  required_reserve: 0,
  reserve_gap: 0,
  plan_surplus_deficit: null,
  min_expected_cash: null,
  min_expected_free_balance: null,
};

const EMPTY_ITEM = {
  parent_item_id: '',
  group_key: 'other',
  name: '',
  unit_label: 'شهر',
  calculation_type: 'fixed_amount',
  cost_behavior: 'fixed_contractual',
  amount: '',
  valid_from: monthStart(operationalDate()),
  recurrence_unit: 'month',
  recurrence_interval_count: 1,
  anchor_date: '',
  accrual_start_rule: 'from_period_start',
  accrual_lead_months: '',
  notes: '',
};

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function amountLabel(value) {
  return `${money(value)} ريال`;
}

export default function OperatingBudgetPage() {
  const [month, setMonth] = useState(monthKey(operationalDate()));
  const [periods, setPeriods] = useState([]);
  const [period, setPeriod] = useState(null);
  const [statement, setStatement] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [forecastMonths, setForecastMonths] = useState(12);
  const [forecast, setForecast] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [rates, setRates] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [selectedLine, setSelectedLine] = useState(null);
  const [lineInputs, setLineInputs] = useState({});
  const [confirmedAmount, setConfirmedAmount] = useState('');
  const [paymentAccount, setPaymentAccount] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [showNewItem, setShowNewItem] = useState(false);
  const [itemForm, setItemForm] = useState({ ...EMPTY_ITEM });
  const [openingBalance, setOpeningBalance] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const groups = useMemo(() => catalog.filter((x) => x.node_type === 'group'), [catalog]);
  const items = useMemo(() => catalog.filter((x) => x.node_type === 'item'), [catalog]);
  const selectedMonthStart = monthStart(month);

  async function loadBase() {
    const [p, c, s, r, a] = await Promise.all([
      supabase.from('budget_periods').select('id,period_start,period_end,status,opening_bank_balance').order('period_start', { ascending: false }),
      supabase.from('budget_item_definitions').select('id,parent_item_id,node_type,branch_scope_id,group_key,name,unit_label,calculation_type,external_source,cost_behavior,is_active,notes,sort_order').order('sort_order').order('name'),
      supabase.from('budget_item_schedules').select('*').order('valid_from', { ascending: false }),
      supabase.from('budget_rate_versions').select('id,item_id,valid_from,valid_to,params,source,source_note,verified_at').order('valid_from', { ascending: false }),
      supabase.from('v_treasury_balances').select('id,name_ar,account_type,current_balance').eq('is_active', true),
    ]);
    const firstError = p.error || c.error || s.error || r.error;
    if (firstError) throw firstError;
    setPeriods(p.data || []);
    setCatalog(c.data || []);
    setSchedules(s.data || []);
    setRates(r.data || []);
    setAccounts(a.error ? [] : (a.data || []));
    return p.data || [];
  }

  async function loadForecast() {
    const { data, error } = await supabase.rpc('budget_forecast', { p_from: selectedMonthStart, p_months: forecastMonths });
    if (error) throw error;
    setForecast(data || []);
  }

  async function loadPeriod(periodRow) {
    if (!periodRow) {
      setPeriod(null);
      setStatement([]);
      setSummary(EMPTY_SUMMARY);
      setOpeningBalance('');
      return;
    }
    const [st, sm] = await Promise.all([
      supabase.rpc('budget_period_statement', { p_period_id: periodRow.id }),
      supabase.rpc('budget_period_summary', { p_period_id: periodRow.id }),
    ]);
    const firstError = st.error || sm.error;
    if (firstError) throw firstError;
    setPeriod(periodRow);
    setStatement(st.data || []);
    setSummary(sm.data || EMPTY_SUMMARY);
    setOpeningBalance(periodRow.opening_bank_balance ?? '');
  }

  async function loadAll() {
    setLoading(true); setErr('');
    try {
      const p = await loadBase();
      const row = p.find((x) => monthKey(x.period_start) === month) || null;
      await Promise.all([loadPeriod(row), loadForecast()]);
    } catch (e) {
      setErr(e?.message || 'تعذر تحميل ميزانية التشغيل.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, [month, forecastMonths]);

  async function run(action, successMessage) {
    setBusy(true); setErr(''); setMsg('');
    try {
      const result = await action();
      if (result?.error) throw result.error;
      if (successMessage) setMsg(successMessage);
      await loadAll();
      return result;
    } catch (e) {
      setErr(e?.message || 'تعذر تنفيذ الإجراء.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function openMonth() {
    await run(() => supabase.rpc('budget_open_period', { p_period_start: selectedMonthStart }), `تم فتح ${monthLabelAr(month)} وتوليد كشفه التشغيلي.`);
  }

  async function saveOpeningBalance(e) {
    e.preventDefault();
    if (!period) return;
    await run(() => supabase.rpc('budget_set_opening_balance', { p_period_id: period.id, p_amount: num(openingBalance) }), 'تم تحديث رصيد بداية الشهر.');
  }

  function editLine(line) {
    setSelectedLine(line);
    const base = line.variable_inputs || {};
    const override = line.line_override_params || {};
    setLineInputs({ ...base, ...override });
    setConfirmedAmount(line.confirmed_amount ?? '');
    setPaymentAmount(line.unpaid_amount || '');
    setPaymentAccount(accounts[0]?.id || '');
    setPaymentReference('');
    setErr(''); setMsg('');
  }

  async function saveLineEstimate(scope) {
    if (!selectedLine) return;
    const fields = budgetInputFields(selectedLine.calculation_type);
    const payload = Object.fromEntries(fields.map((f) => [f.key, num(lineInputs[f.key])]));
    await run(() => supabase.rpc('budget_save_line_inputs', {
      p_line_id: selectedLine.line_id,
      p_inputs: payload,
      p_scope: scope,
      p_reason: scope === 'this_month' ? 'تعديل تقدير هذا الشهر فقط' : 'تحديث التقدير التشغيلي الجاري',
    }), scope === 'this_month' ? 'تم تعديل هذا الشهر فقط.' : 'تم تحديث التقدير الجاري.');
    setSelectedLine(null);
  }

  async function confirmActual() {
    if (!selectedLine) return;
    await run(() => supabase.rpc('budget_confirm_line', {
      p_line_id: selectedLine.line_id,
      p_confirmed: num(confirmedAmount),
      p_source: 'invoice',
      p_note: 'قيمة فعلية مؤكدة من شاشة ميزانية التشغيل',
    }), 'تم تأكيد القيمة الفعلية.');
    setSelectedLine(null);
  }

  async function reserveGap(line) {
    if (!period || num(line.reserve_gap) <= 0) return;
    await run(() => supabase.rpc('budget_reserve_adjust', {
      p_obligation_id: line.obligation_id,
      p_period_id: period.id,
      p_direction: 'reserve',
      p_amount: num(line.reserve_gap),
      p_reason: `حجز المخصص المطلوب لشهر ${month}`,
    }), `تم حجز ${amountLabel(line.reserve_gap)} كمخصص محمي.`);
  }

  async function paySelected(e) {
    e.preventDefault();
    if (!selectedLine || !paymentAccount) return;
    await run(() => supabase.rpc('budget_pay_from_treasury', {
      p_line_id: selectedLine.line_id,
      p_account_id: paymentAccount,
      p_amount: num(paymentAmount),
      p_reference: paymentReference.trim() || null,
    }), 'تم تسجيل السداد في الخزينة وربطه بالالتزام دون إنشاء مصروف مكرر.');
    setSelectedLine(null);
  }

  async function closePeriod() {
    if (!period || !window.confirm(`إقفال ${monthLabelAr(month)}؟ بعد الإقفال يلزم تصريح إعادة فتح.`)) return;
    await run(() => supabase.rpc('budget_close_period', { p_period_id: period.id }), 'تم إقفال الشهر.');
  }

  async function reopenPeriod() {
    if (!period) return;
    const reason = window.prompt('سبب إعادة فتح الشهر:');
    if (!reason) return;
    await run(() => supabase.rpc('budget_reopen_period', { p_period_id: period.id, p_reason: reason }), 'تمت إعادة فتح الشهر مع تسجيل السبب.');
  }

  function currentSchedule(itemId) {
    return schedules.find((x) => x.item_id === itemId && (!x.valid_to || x.valid_to >= selectedMonthStart)) || schedules.find((x) => x.item_id === itemId) || null;
  }

  function currentRate(itemId) {
    return rates.find((x) => x.item_id === itemId && x.valid_from <= selectedMonthStart && (!x.valid_to || x.valid_to >= selectedMonthStart)) || rates.find((x) => x.item_id === itemId) || null;
  }

  function startNewItem() {
    setItemForm({ ...EMPTY_ITEM, valid_from: selectedMonthStart });
    setShowNewItem(true); setErr(''); setMsg('');
  }

  function configureItem(item) {
    const schedule = currentSchedule(item.id);
    const rate = currentRate(item.id);
    setItemForm({
      item_id: item.id,
      parent_item_id: item.parent_item_id || '',
      group_key: item.group_key,
      name: item.name,
      unit_label: item.unit_label || 'شهر',
      calculation_type: item.calculation_type,
      cost_behavior: item.cost_behavior || 'fixed_contractual',
      amount: rate?.params?.amount ?? '',
      valid_from: selectedMonthStart,
      recurrence_unit: schedule?.recurrence_unit || 'month',
      recurrence_interval_count: schedule?.recurrence_interval_count || 1,
      anchor_date: schedule?.anchor_date || '',
      accrual_start_rule: schedule?.accrual_start_rule || 'from_period_start',
      accrual_lead_months: schedule?.accrual_lead_months || '',
      notes: item.notes || '',
    });
    setShowNewItem(true); setErr(''); setMsg('');
  }

  async function saveCatalogItem(e) {
    e.preventDefault();
    setBusy(true); setErr(''); setMsg('');
    try {
      const parent = groups.find((g) => g.id === itemForm.parent_item_id);
      const { data: itemId, error: itemError } = await supabase.rpc('budget_upsert_item', {
        p_item_id: itemForm.item_id || null,
        p_parent_item_id: itemForm.parent_item_id || null,
        p_branch_scope_id: null,
        p_group_key: parent?.group_key || itemForm.group_key,
        p_name: itemForm.name,
        p_unit_label: itemForm.unit_label || null,
        p_calculation_type: itemForm.calculation_type,
        p_external_source: itemForm.calculation_type === 'external_forecast_actual' ? 'payroll_run' : null,
        p_cost_behavior: itemForm.cost_behavior,
        p_is_active: true,
        p_notes: itemForm.notes || null,
        p_sort_order: 50,
      });
      if (itemError) throw itemError;

      if (itemForm.calculation_type !== 'external_forecast_actual' && itemForm.amount !== '') {
        const { error } = await supabase.rpc('budget_set_item_rate', {
          p_item_id: itemId,
          p_valid_from: itemForm.valid_from,
          p_params: { amount: num(itemForm.amount) },
          p_source: 'manual_entry',
          p_source_note: 'إعداد من كتالوج ميزانية وتشغيل الشركة',
          p_verified_at: null,
          p_bands: [],
        });
        if (error) throw error;
      }

      if (itemForm.anchor_date) {
        const { error } = await supabase.rpc('budget_set_schedule', {
          p_item_id: itemId,
          p_valid_from: itemForm.valid_from,
          p_recurrence_unit: itemForm.recurrence_unit,
          p_recurrence_interval_count: Number(itemForm.recurrence_interval_count || 1),
          p_anchor_date: itemForm.anchor_date,
          p_accrual_start_rule: itemForm.accrual_start_rule,
          p_accrual_lead_months: itemForm.accrual_start_rule === 'fixed_months_before_due' ? Number(itemForm.accrual_lead_months || 1) : null,
        });
        if (error) throw error;
      }

      setMsg('تم حفظ البند وجدولته ضمن المحرك المركزي.');
      setShowNewItem(false);
      await loadAll();
    } catch (e2) {
      setErr(e2?.message || 'تعذر حفظ البند.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <ConstitutionPage><EmptyState title="جارٍ تحميل ميزانية التشغيل" description="يتم تحميل الالتزامات والمخصصات والتوقعات." /></ConstitutionPage>;

  const editable = period?.status !== 'closed';
  const grouped = statement.reduce((acc, row) => {
    const key = row.parent_name || OPERATING_BUDGET.groupLabels[row.group_key] || row.group_key;
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

  return <ConstitutionPage>
    <PageHeader
      eyebrow="المالية"
      title="ميزانية وتشغيل الشركة"
      description="كم أحتاج للتشغيل؟ كم يجب أن أحجز؟ ومتى سيخرج كل ريال؟ الالتزام والمخصص منفصلان عن حركة الخزينة الفعلية."
      actions={<>
        <input type="month" dir="ltr" value={month} onChange={(e) => setMonth(e.target.value)} />
        <button className="btn ghost" onClick={loadAll} disabled={busy}>تحديث</button>
      </>}
    />

    {err && <Notice tone="error">{err}</Notice>}
    {msg && <Notice tone="success">{msg}</Notice>}

    {!period ? <EntrySurface title={`فتح ${monthLabelAr(month)}`} description="لم يُفتح هذا الشهر بعد. فتحه يولد البنود الجارية من الكتالوج دون نسخ مصروفات فعلية.">
      <div style={{ padding: 22 }}><Toolbar><button className="btn" onClick={openMonth} disabled={busy}>فتح الشهر وتوليد الكشف</button></Toolbar></div>
    </EntrySurface> : <>
      <Section title={`ملخص ${monthLabelAr(month)}`} actions={<>
        {period.status === 'closed' ? <button className="btn ghost" onClick={reopenPeriod} disabled={busy}>إعادة فتح</button> : <button className="btn ghost" onClick={closePeriod} disabled={busy}>إقفال الشهر</button>}
      </>}>
        <SummaryStrip items={[
          { key: 'due', value: money(summary.confirmed_due || summary.expected_due), label: 'المطلوب هذا الشهر', note: 'ريال' },
          { key: 'reserve', value: money(summary.required_reserve), label: 'المطلوب حجزه', note: 'ريال' },
          { key: 'protected', value: money(summary.protected_balance), label: 'الرصيد المحمي', note: 'ريال' },
          { key: 'free', value: summary.free_opening_balance == null ? '—' : money(summary.free_opening_balance), label: 'المتاح الحر عند بداية الشهر', note: summary.free_opening_balance == null ? 'أدخل رصيد البداية' : 'ريال' },
          { key: 'paid', value: money(summary.paid), label: 'المدفوع فعليًا', note: 'ريال' },
          { key: 'plan', value: summary.plan_surplus_deficit == null ? '—' : money(summary.plan_surplus_deficit), label: 'فائض/عجز الخطة', note: summary.plan_surplus_deficit == null ? 'بعد إدخال الرصيد' : 'ريال' },
        ]} />
      </Section>

      <Notice>«الرصيد المحمي» مخصص افتراضي داخل النظام، وليس تحويلًا بنكيًا. السداد الحقيقي لا يُسجل هنا كمصروف جديد؛ بل يُربط بحركة الخزينة الواحدة حتى لا يتكرر الأثر المالي.</Notice>

      <EntrySurface title="رصيد بداية الشهر" description="استخدم رصيد الحسابات البنكية المتاح عند بداية التخطيط لهذا الشهر.">
        <form onSubmit={saveOpeningBalance} style={{ padding: 22 }}>
          <div className="form-grid">
            <div className="field"><label>الرصيد (ريال)</label><input type="number" step="0.01" dir="ltr" value={openingBalance} disabled={!editable} onChange={(e) => setOpeningBalance(e.target.value)} /></div>
            <div className="field"><label>أدنى رصيد حر متوقع</label><strong>{summary.min_expected_free_balance == null ? '—' : amountLabel(summary.min_expected_free_balance)}</strong></div>
          </div>
          {editable && <Toolbar><button className="btn" type="submit" disabled={busy}>حفظ الرصيد</button></Toolbar>}
        </form>
      </EntrySurface>

      {selectedLine && <EntrySurface title={selectedLine.item_name} description={`${selectedLine.cash_effect_type === 'due_now' ? 'مستحق هذا الشهر' : 'التزام مستقبلي'} · الاستحقاق ${dateAr(selectedLine.due_date)}`}>
        <div style={{ padding: 22 }}>
          <div className="form-grid">
            {budgetInputFields(selectedLine.calculation_type).map((field) => <div className="field" key={field.key}><label>{field.label}</label><input type="number" step="0.01" dir="ltr" disabled={!editable} value={lineInputs[field.key] ?? ''} onChange={(e) => setLineInputs({ ...lineInputs, [field.key]: e.target.value })} /></div>)}
            <div className="field"><label>التقدير الحالي</label><strong>{amountLabel(selectedLine.expected_amount)}</strong></div>
            <div className="field"><label>المدفوع</label><strong>{amountLabel(selectedLine.paid_amount)}</strong></div>
            <div className="field"><label>المخصص المحمي</label><strong>{amountLabel(selectedLine.reserved_outstanding)}</strong></div>
          </div>
          {editable && budgetInputFields(selectedLine.calculation_type).length > 0 && <Toolbar>
            <button className="btn" type="button" onClick={() => saveLineEstimate('ongoing')} disabled={busy}>اعتماد التقدير الجاري</button>
            <button className="btn ghost" type="button" onClick={() => saveLineEstimate('this_month')} disabled={busy}>هذا الشهر فقط</button>
          </Toolbar>}

          {editable && selectedLine.cash_effect_type === 'due_now' && <>
            <hr />
            <div className="form-grid">
              <div className="field"><label>القيمة الفعلية المؤكدة</label><input type="number" step="0.01" dir="ltr" value={confirmedAmount} onChange={(e) => setConfirmedAmount(e.target.value)} /></div>
            </div>
            <Toolbar><button className="btn ghost" type="button" onClick={confirmActual} disabled={busy || confirmedAmount === ''}>تأكيد الفاتورة/القيمة الفعلية</button></Toolbar>

            {accounts.length > 0 && <form onSubmit={paySelected}>
              <div className="form-grid">
                <div className="field"><label>حساب الخزينة</label><select value={paymentAccount} onChange={(e) => setPaymentAccount(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name_ar} — {money(a.current_balance)} ريال</option>)}</select></div>
                <div className="field"><label>مبلغ السداد</label><input type="number" min="0.01" step="0.01" dir="ltr" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} /></div>
                <div className="field"><label>المرجع</label><input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="رقم التحويل أو الفاتورة" /></div>
              </div>
              <Toolbar><button className="btn" type="submit" disabled={busy || !paymentAccount || num(paymentAmount) <= 0}>سداد من الخزينة</button></Toolbar>
            </form>}
          </>}
          <Toolbar><button className="btn ghost" type="button" onClick={() => setSelectedLine(null)}>إغلاق</button></Toolbar>
        </div>
      </EntrySurface>}

      <Section title="كشف الشهر" description="الجدول يجمع الاستحقاقات الحالية ومساهمات الحجز للمستقبل. لا يوجد مجموع سنوي ÷ 12 داخل الصفحة.">
        {statement.length === 0 ? <EmptyState title="لا توجد بنود مولدة" description="أضف أو فعّل بندًا وجدول استحقاقه من الكتالوج." /> : Object.entries(grouped).map(([group, rows]) => <div key={group} style={{ marginBottom: 24 }}>
          <h3>{group}</h3>
          <TableFrame><table><thead><tr><th>البند</th><th>الاستحقاق</th><th>التقدير</th><th>الفعلي</th><th>المدفوع</th><th>مطلوب حجزه</th><th>المحمي</th><th>الإجراء</th></tr></thead><tbody>
            {rows.map((row) => <tr key={row.line_id}>
              <td><strong>{row.item_name}</strong><br /><small>{OPERATING_BUDGET.calculationLabels[row.calculation_type] || row.calculation_type}</small></td>
              <td>{dateAr(row.due_date)}<br /><small>{row.cash_effect_type === 'due_now' ? 'مستحق الآن' : 'تجهيز للمستقبل'}</small></td>
              <td>{money(row.expected_amount)}</td>
              <td>{row.confirmed_amount == null ? '—' : money(row.confirmed_amount)}</td>
              <td>{money(row.paid_amount)}</td>
              <td>{money(row.required_reserve)}</td>
              <td>{money(row.reserved_outstanding)}</td>
              <td><Toolbar>
                <button className="btn ghost" type="button" onClick={() => editLine(row)}>فتح</button>
                {editable && row.cash_effect_type === 'reserve_only' && num(row.reserve_gap) > 0 && <button className="btn" type="button" disabled={busy} onClick={() => reserveGap(row)}>حجز المطلوب</button>}
              </Toolbar></td>
            </tr>)}
          </tbody></table></TableFrame>
        </div>)}
      </Section>
    </>}

    <Section title="التوقع النقدي" description="استحقاقات فعلية متوقعة + المبلغ الواجب حجزه للوصول لكل التزام في موعده." actions={<Toolbar>{[3, 6, 12].map((n) => <button key={n} className={`btn ${forecastMonths === n ? '' : 'ghost'}`} onClick={() => setForecastMonths(n)}>{n} أشهر</button>)}</Toolbar>}>
      <TableFrame><table><thead><tr><th>الشهر</th><th>استحقاقات الشهر</th><th>مخصصات مطلوبة</th><th>إجمالي المطلوب</th></tr></thead><tbody>
        {forecast.map((row) => <tr key={row.period_start}><td>{monthLabelAr(row.period_start)}</td><td>{amountLabel(row.expected_due)}</td><td>{amountLabel(row.required_reserve)}</td><td><strong>{amountLabel(row.planned_total)}</strong></td></tr>)}
      </tbody></table></TableFrame>
    </Section>

    {showNewItem && <EntrySurface title={itemForm.item_id ? `إعداد ${itemForm.name}` : 'إضافة التزام أو مصروف'} description="التصنيف يجيب: ما هو؟ وسلوك التكلفة يجيب: كيف يتصرف ماليًا؟">
      <form onSubmit={saveCatalogItem} style={{ padding: 22 }}>
        <div className="form-grid">
          <div className="field"><label>المجموعة *</label><select required value={itemForm.parent_item_id} onChange={(e) => setItemForm({ ...itemForm, parent_item_id: e.target.value })}><option value="">اختر المجموعة</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
          <div className="field"><label>اسم البند *</label><input required value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} /></div>
          <div className="field"><label>سلوك التكلفة *</label><select value={itemForm.cost_behavior} onChange={(e) => setItemForm({ ...itemForm, cost_behavior: e.target.value })}>{Object.entries(OPERATING_BUDGET.costBehaviorLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div className="field"><label>طريقة الحساب *</label><select value={itemForm.calculation_type} onChange={(e) => setItemForm({ ...itemForm, calculation_type: e.target.value })}>{['fixed_amount','variable_monthly','manual_actual','quantity_x_unit_price','percentage_of_base'].map((k) => <option key={k} value={k}>{OPERATING_BUDGET.calculationLabels[k]}</option>)}</select></div>
          <div className="field"><label>القيمة/التقدير</label><input type="number" step="0.01" dir="ltr" value={itemForm.amount} onChange={(e) => setItemForm({ ...itemForm, amount: e.target.value })} /></div>
          <div className="field"><label>تاريخ سريان الإعداد</label><input type="date" dir="ltr" value={itemForm.valid_from} onChange={(e) => setItemForm({ ...itemForm, valid_from: e.target.value })} /></div>
          <div className="field"><label>الدورية</label><select value={itemForm.recurrence_unit} onChange={(e) => setItemForm({ ...itemForm, recurrence_unit: e.target.value })}>{Object.entries(OPERATING_BUDGET.recurrenceLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div className="field"><label>تاريخ الاستحقاق المرجعي</label><input type="date" dir="ltr" value={itemForm.anchor_date} onChange={(e) => setItemForm({ ...itemForm, anchor_date: e.target.value })} /><span className="hint">اتركه فارغًا إذا لم تعرف موعد التجديد بعد.</span></div>
          <div className="field"><label>بدء تكوين المخصص</label><select value={itemForm.accrual_start_rule} onChange={(e) => setItemForm({ ...itemForm, accrual_start_rule: e.target.value })}><option value="from_period_start">من بداية فترة الاستحقاق</option><option value="immediately_after_previous_due">بعد الاستحقاق السابق مباشرة</option><option value="fixed_months_before_due">قبل الاستحقاق بعدد أشهر</option></select></div>
          {itemForm.accrual_start_rule === 'fixed_months_before_due' && <div className="field"><label>عدد أشهر التجهيز</label><input type="number" min="1" dir="ltr" value={itemForm.accrual_lead_months} onChange={(e) => setItemForm({ ...itemForm, accrual_lead_months: e.target.value })} /></div>}
          <div className="field span2"><label>ملاحظات</label><textarea rows="3" value={itemForm.notes} onChange={(e) => setItemForm({ ...itemForm, notes: e.target.value })} /></div>
        </div>
        <Toolbar><button className="btn" type="submit" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ الإعداد'}</button><button className="btn ghost" type="button" onClick={() => setShowNewItem(false)}>إلغاء</button></Toolbar>
      </form>
    </EntrySurface>}

    <Section title="كتالوج التشغيل" description="هذه تعريفات التخطيط، وليست مصروفات مدفوعة. الفعلي يأتي من الخزينة أو الفاتورة المؤكدة." actions={<button className="btn" onClick={startNewItem}>+ التزام أو مصروف</button>}>
      <TableFrame><table><thead><tr><th>المجموعة</th><th>البند</th><th>السلوك</th><th>الدورية</th><th>التقدير الحالي</th><th>الحالة</th><th></th></tr></thead><tbody>
        {items.map((item) => {
          const schedule = currentSchedule(item.id);
          const rate = currentRate(item.id);
          return <tr key={item.id}><td>{OPERATING_BUDGET.groupLabels[item.group_key] || item.group_key}</td><td><strong>{item.name}</strong></td><td>{OPERATING_BUDGET.costBehaviorLabels[item.cost_behavior] || '—'}</td><td>{schedule ? OPERATING_BUDGET.recurrenceLabels[schedule.recurrence_unit] : 'غير مجدول'}</td><td>{item.calculation_type === 'external_forecast_actual' ? 'من النظام' : rate?.params?.amount == null ? '—' : amountLabel(rate.params.amount)}</td><td>{item.is_active ? 'نشط' : 'متوقف'}</td><td><button className="btn ghost" onClick={() => configureItem(item)}>إعداد</button></td></tr>;
        })}
      </tbody></table></TableFrame>
    </Section>
  </ConstitutionPage>;
}
