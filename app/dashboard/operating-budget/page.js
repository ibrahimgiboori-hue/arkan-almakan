'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { money, dateAr } from '@/lib/format';
import { operationalDate } from '@/lib/system-constitution';
import { useDashboardSession } from '@/lib/dashboard-session-context';
import {
  OPERATING_BUDGET,
  budgetDefaultRateProfile,
  budgetInputFields,
  budgetRateFields,
  budgetRateSummary,
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

const CALC_TYPES = Object.keys(OPERATING_BUDGET.calculationLabels);
const COST_BEHAVIORS = Object.keys(OPERATING_BUDGET.costBehaviorLabels);
const RECURRENCES = Object.keys(OPERATING_BUDGET.recurrenceLabels);
const COMPONENT_MODES = Object.keys(OPERATING_BUDGET.componentModeLabels);
const BUCKETS = Object.keys(OPERATING_BUDGET.metricBucketLabels);

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function amountLabel(value) {
  return `${money(value)} ريال`;
}

function hasCapability(me, capability) {
  return Boolean(me?.access?.fullAdmin || me?.capabilityKeys?.has?.(capability));
}

function emptyNode(validFrom = monthStart(operationalDate()), parent = null, nodeType = 'item') {
  return {
    node_id: '',
    node_type: nodeType,
    parent_item_id: parent?.id || '',
    group_key: parent?.group_key || 'other',
    name: '',
    unit_label: nodeType === 'item' ? 'شهر' : '',
    calculation_type: nodeType === 'item' ? 'fixed_amount' : '',
    cost_behavior: nodeType === 'item' ? 'fixed_contractual' : '',
    rate_inputs: {},
    input_schema: [],
    components: [],
    bands: [],
    valid_from: validFrom,
    recurrence_unit: 'month',
    recurrence_interval_count: 1,
    anchor_date: '',
    accrual_start_rule: 'from_period_start',
    accrual_lead_months: '',
    is_active: true,
    notes: '',
    sort_order: 50,
  };
}

function normalizeComponent(component = {}) {
  return {
    key: component.key || `component_${Date.now()}`,
    label: component.label || '',
    mode: component.mode || 'fixed',
    bucket: component.bucket || 'other',
    include_in_total: component.include_in_total !== false,
    input_key: component.input_key || '',
    input_label: component.input_label || '',
    left_input_key: component.left_input_key || '',
    right_input_key: component.right_input_key || '',
    amount: component.amount ?? '',
    rate_percent: component.rate_percent ?? '',
    unit_price: component.unit_price ?? '',
    included_units: component.included_units ?? 0,
    factor: component.factor ?? '',
  };
}

function componentForType(calculationType) {
  if (calculationType === 'employee_based_contribution') {
    return normalizeComponent({
      mode: 'percentage_of_input',
      input_key: 'contributory_wages',
      input_label: 'إجمالي الأجور الخاضعة للاشتراك',
      bucket: 'employer_cost',
      label: 'حصة المنشأة',
    });
  }
  if (calculationType === 'subscription_plus_usage') {
    return normalizeComponent({ mode: 'fixed', bucket: 'subscription', label: 'الاشتراك الأساسي' });
  }
  return normalizeComponent();
}

function buildGroupMaps(catalog) {
  const byId = new Map(catalog.map((node) => [node.id, node]));
  const children = new Map();
  for (const node of catalog) {
    const key = node.parent_item_id || '__root__';
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(node);
  }
  for (const list of children.values()) list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name, 'ar'));
  return { byId, children };
}

export default function OperatingBudgetPage() {
  const me = useDashboardSession();
  const canView = hasCapability(me, OPERATING_BUDGET.capability.view);
  const canEdit = hasCapability(me, OPERATING_BUDGET.capability.edit);
  const canReopen = hasCapability(me, OPERATING_BUDGET.capability.reopen);

  const [month, setMonth] = useState(monthKey(operationalDate()));
  const [period, setPeriod] = useState(null);
  const [statement, setStatement] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [forecastMonths, setForecastMonths] = useState(12);
  const [forecast, setForecast] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [rates, setRates] = useState([]);
  const [bands, setBands] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [collapsed, setCollapsed] = useState({});
  const [selectedLine, setSelectedLine] = useState(null);
  const [lineInputs, setLineInputs] = useState({});
  const [confirmedAmount, setConfirmedAmount] = useState('');
  const [paymentAccount, setPaymentAccount] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [showNodeEditor, setShowNodeEditor] = useState(false);
  const [nodeForm, setNodeForm] = useState(() => emptyNode());
  const [openingBalance, setOpeningBalance] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const groups = useMemo(() => catalog.filter((x) => x.node_type === 'group'), [catalog]);
  const { byId: catalogById, children: catalogChildren } = useMemo(() => buildGroupMaps(catalog), [catalog]);
  const selectedMonthStart = monthStart(month);
  const periodEditable = period?.status !== 'closed';
  const canMutatePeriod = canEdit && periodEditable;
  const simpleRateFields = budgetRateFields(nodeForm.calculation_type);
  const effectiveNodeRate = nodeForm.node_id ? effectiveRate(nodeForm.node_id) : null;
  const selectedLineRate = selectedLine ? effectiveRate(selectedLine.item_id) : null;
  const selectedLineFields = selectedLine ? budgetInputFields(selectedLine.calculation_type, selectedLineRate?.params || {}) : [];

  async function loadBase() {
    const [p, c, s, r, b, a] = await Promise.all([
      supabase.from('budget_periods').select('id,period_start,period_end,status,opening_bank_balance').order('period_start', { ascending: false }),
      supabase.from('budget_item_definitions').select('id,parent_item_id,node_type,branch_scope_id,group_key,name,unit_label,calculation_type,external_source,cost_behavior,is_active,notes,sort_order').order('sort_order').order('name'),
      supabase.from('budget_item_schedules').select('*').order('valid_from', { ascending: false }),
      supabase.from('budget_rate_versions').select('id,item_id,valid_from,valid_to,params,source,source_note,verified_at').order('valid_from', { ascending: false }),
      supabase.from('budget_tariff_bands').select('id,rate_version_id,band_order,min_count,max_count,band_mode,band_amount').order('band_order'),
      supabase.from('v_treasury_balances').select('id,name_ar,account_type,current_balance').eq('is_active', true),
    ]);
    const firstError = p.error || c.error || s.error || r.error || b.error;
    if (firstError) throw firstError;
    setCatalog(c.data || []);
    setSchedules(s.data || []);
    setRates(r.data || []);
    setBands(b.data || []);
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
      const periods = await loadBase();
      const row = periods.find((x) => monthKey(x.period_start) === month) || null;
      await Promise.all([loadPeriod(row), loadForecast()]);
    } catch (e) {
      setErr(e?.message || 'تعذر تحميل ميزانية التشغيل.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canView) { setLoading(false); return; }
    loadAll();
  }, [month, forecastMonths, canView]);

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

  function effectiveSchedule(nodeId) {
    return schedules.find((x) => x.item_id === nodeId && x.valid_from <= selectedMonthStart && (!x.valid_to || x.valid_to >= selectedMonthStart)) || null;
  }

  function effectiveRate(nodeId) {
    return rates.find((x) => x.item_id === nodeId && x.valid_from <= selectedMonthStart && (!x.valid_to || x.valid_to >= selectedMonthStart)) || null;
  }

  function bandsForRate(rateId) {
    return bands.filter((b) => b.rate_version_id === rateId).sort((a, b) => a.band_order - b.band_order);
  }

  async function openMonth() {
    if (!canEdit) return;
    await run(() => supabase.rpc('budget_open_period', { p_period_start: selectedMonthStart }), `تم فتح ${monthLabelAr(month)} وتوليد كشفه التشغيلي.`);
  }

  async function saveOpeningBalance(e) {
    e.preventDefault();
    if (!period || !canMutatePeriod) return;
    await run(() => supabase.rpc('budget_set_opening_balance', { p_period_id: period.id, p_amount: num(openingBalance) }), 'تم تحديث رصيد بداية الشهر.');
  }

  function editLine(line) {
    const rate = effectiveRate(line.item_id);
    const fields = budgetInputFields(line.calculation_type, rate?.params || {});
    const baseline = Object.fromEntries(fields.map((f) => [f.key, rate?.params?.[f.key] ?? '']));
    setSelectedLine(line);
    setLineInputs({ ...baseline, ...(line.variable_inputs || {}), ...(line.line_override_params || {}) });
    setConfirmedAmount(line.confirmed_amount ?? '');
    setPaymentAmount(line.unpaid_amount || '');
    setPaymentAccount(accounts[0]?.id || '');
    setPaymentReference('');
    setErr(''); setMsg('');
  }

  async function saveLineEstimate(scope) {
    if (!selectedLine || !canMutatePeriod) return;
    const payload = Object.fromEntries(selectedLineFields.map((f) => [f.key, num(lineInputs[f.key])]));
    await run(() => supabase.rpc('budget_save_line_inputs', {
      p_line_id: selectedLine.line_id,
      p_inputs: payload,
      p_scope: scope,
      p_reason: scope === 'this_month' ? 'تعديل هذا الشهر فقط' : 'تحديث خط الأساس من هذا الشهر وما بعده',
    }), scope === 'this_month' ? 'تم تعديل هذا الشهر فقط.' : 'تم تحديث خط الأساس الجاري.');
    setSelectedLine(null);
  }

  async function confirmActual() {
    if (!selectedLine || !canMutatePeriod) return;
    await run(() => supabase.rpc('budget_confirm_line', {
      p_line_id: selectedLine.line_id,
      p_confirmed: num(confirmedAmount),
      p_source: 'invoice',
      p_note: 'قيمة فعلية مؤكدة من ميزانية التشغيل',
    }), 'تم تأكيد القيمة الفعلية.');
    setSelectedLine(null);
  }

  async function reserveGap(line) {
    if (!period || !canMutatePeriod || num(line.reserve_gap) <= 0) return;
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
    if (!selectedLine || !paymentAccount || !canMutatePeriod) return;
    await run(() => supabase.rpc('budget_pay_from_treasury', {
      p_line_id: selectedLine.line_id,
      p_account_id: paymentAccount,
      p_amount: num(paymentAmount),
      p_reference: paymentReference.trim() || null,
    }), 'تم تسجيل السداد في الخزينة وربطه بالالتزام دون إنشاء مصروف مكرر.');
    setSelectedLine(null);
  }

  async function closePeriod() {
    if (!period || !canEdit || !window.confirm(`إقفال ${monthLabelAr(month)}؟`)) return;
    await run(() => supabase.rpc('budget_close_period', { p_period_id: period.id }), 'تم إقفال الشهر.');
  }

  async function reopenPeriod() {
    if (!period || !canReopen) return;
    const reason = window.prompt('سبب إعادة فتح الشهر:');
    if (!reason) return;
    await run(() => supabase.rpc('budget_reopen_period', { p_period_id: period.id, p_reason: reason }), 'تمت إعادة فتح الشهر مع تسجيل السبب.');
  }

  function startNode(nodeType = 'item', parent = null) {
    if (!canEdit) return;
    setNodeForm(emptyNode(selectedMonthStart, parent, nodeType));
    setShowNodeEditor(true); setErr(''); setMsg('');
  }

  function configureNode(node) {
    if (!canEdit) return;
    const schedule = node.node_type === 'item' ? effectiveSchedule(node.id) : null;
    const rate = node.node_type === 'item' ? effectiveRate(node.id) : null;
    const profile = rate?.params || budgetDefaultRateProfile(node.calculation_type);
    setNodeForm({
      node_id: node.id,
      node_type: node.node_type,
      parent_item_id: node.parent_item_id || '',
      group_key: node.group_key,
      name: node.name,
      unit_label: node.unit_label || '',
      calculation_type: node.calculation_type || '',
      cost_behavior: node.cost_behavior || '',
      rate_inputs: { ...(profile || {}) },
      input_schema: Array.isArray(profile?.input_schema) ? profile.input_schema.map((x) => ({ ...x })) : [],
      components: Array.isArray(profile?.components) ? profile.components.map(normalizeComponent) : [],
      bands: rate ? bandsForRate(rate.id).map((b) => ({
        band_order: b.band_order,
        min_count: b.min_count,
        max_count: b.max_count ?? '',
        band_mode: b.band_mode,
        band_amount: b.band_amount,
      })) : [],
      valid_from: selectedMonthStart,
      recurrence_unit: schedule?.recurrence_unit || 'month',
      recurrence_interval_count: schedule?.recurrence_interval_count || 1,
      anchor_date: schedule?.anchor_date || '',
      accrual_start_rule: schedule?.accrual_start_rule || 'from_period_start',
      accrual_lead_months: schedule?.accrual_lead_months || '',
      is_active: node.is_active,
      notes: node.notes || '',
      sort_order: node.sort_order || 50,
    });
    setShowNodeEditor(true); setErr(''); setMsg('');
  }

  function changeCalculationType(next) {
    const profile = budgetDefaultRateProfile(next);
    setNodeForm((old) => ({
      ...old,
      calculation_type: next,
      rate_inputs: { ...profile },
      input_schema: Array.isArray(profile.input_schema) ? profile.input_schema.map((x) => ({ ...x })) : [],
      components: Array.isArray(profile.components) ? profile.components.map(normalizeComponent) : [],
      bands: [],
    }));
  }

  function updateComponent(index, patch) {
    setNodeForm((old) => ({ ...old, components: old.components.map((c, i) => i === index ? { ...c, ...patch } : c) }));
  }

  function updateInputSchema(index, patch) {
    setNodeForm((old) => ({ ...old, input_schema: old.input_schema.map((f, i) => i === index ? { ...f, ...patch } : f) }));
  }

  function buildRateParams() {
    if (nodeForm.node_type !== 'item' || nodeForm.calculation_type === 'external_forecast_actual') return null;
    if (nodeForm.calculation_type === 'tiered') return nodeForm.bands.length ? {} : null;
    if (['employee_based_contribution', 'subscription_plus_usage', 'composite_formula'].includes(nodeForm.calculation_type)) {
      if (!nodeForm.components.length) return null;
      const components = nodeForm.components.map((c, index) => {
        const out = {
          key: c.key || `component_${index + 1}`,
          label: c.label || `مكون ${index + 1}`,
          mode: c.mode,
          bucket: c.bucket || 'other',
          include_in_total: c.include_in_total !== false,
        };
        if (c.input_key) out.input_key = c.input_key;
        if (c.input_label) out.input_label = c.input_label;
        if (c.left_input_key) out.left_input_key = c.left_input_key;
        if (c.right_input_key) out.right_input_key = c.right_input_key;
        if (c.mode === 'fixed') out.amount = num(c.amount);
        if (c.mode === 'percentage_of_input') out.rate_percent = num(c.rate_percent);
        if (c.mode === 'per_unit') { out.unit_price = num(c.unit_price); out.included_units = num(c.included_units); }
        if (c.mode === 'input_times_constant') out.factor = num(c.factor);
        return out;
      });
      return { input_schema: nodeForm.input_schema, components };
    }
    const fields = budgetRateFields(nodeForm.calculation_type);
    if (!fields.length) return null;
    const filled = fields.filter((f) => String(nodeForm.rate_inputs?.[f.key] ?? '').trim() !== '');
    if (!filled.length) return null;
    if (filled.length !== fields.length) throw new Error('أكمل جميع حقول خط الأساس أو اتركها كلها فارغة.');
    return Object.fromEntries(fields.map((f) => [f.key, num(nodeForm.rate_inputs[f.key])]));
  }

  async function saveCatalogNode(e) {
    e.preventDefault();
    if (!canEdit) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      const parent = groups.find((g) => g.id === nodeForm.parent_item_id);
      const rateParams = buildRateParams();
      const schedulePayload = nodeForm.node_type === 'item' && nodeForm.anchor_date ? {
        recurrence_unit: nodeForm.recurrence_unit,
        recurrence_interval_count: Number(nodeForm.recurrence_interval_count || 1),
        anchor_date: nodeForm.anchor_date,
        accrual_start_rule: nodeForm.accrual_start_rule,
        accrual_lead_months: nodeForm.accrual_start_rule === 'fixed_months_before_due' ? Number(nodeForm.accrual_lead_months || 1) : null,
      } : null;
      if (schedulePayload && nodeForm.calculation_type !== 'external_forecast_actual' && !rateParams && !effectiveNodeRate) {
        throw new Error('عرّف قاعدة الحساب أولًا قبل جدولة الاستحقاق.');
      }

      const normalizedBands = nodeForm.bands.map((b, i) => ({
        band_order: i + 1,
        min_count: num(b.min_count),
        max_count: String(b.max_count ?? '').trim() === '' ? null : num(b.max_count),
        band_mode: b.band_mode || 'flat_fee_on_entry',
        band_amount: num(b.band_amount),
      }));

      const { error } = await supabase.rpc('budget_save_catalog_node', {
        p_node_id: nodeForm.node_id || null,
        p_node_type: nodeForm.node_type,
        p_parent_item_id: nodeForm.parent_item_id || null,
        p_branch_scope_id: null,
        p_group_key: parent?.group_key || nodeForm.group_key,
        p_name: nodeForm.name,
        p_unit_label: nodeForm.node_type === 'item' ? nodeForm.unit_label || null : null,
        p_calculation_type: nodeForm.node_type === 'item' ? nodeForm.calculation_type : null,
        p_external_source: nodeForm.calculation_type === 'external_forecast_actual' ? 'payroll_run' : null,
        p_cost_behavior: nodeForm.node_type === 'item' ? nodeForm.cost_behavior : null,
        p_is_active: nodeForm.is_active,
        p_notes: nodeForm.notes || null,
        p_sort_order: Number(nodeForm.sort_order || 0),
        p_rate_valid_from: nodeForm.node_type === 'item' ? nodeForm.valid_from : null,
        p_rate_params: rateParams,
        p_rate_source: rateParams ? 'manual_entry' : null,
        p_rate_bands: normalizedBands,
        p_schedule_valid_from: nodeForm.node_type === 'item' ? nodeForm.valid_from : null,
        p_schedule: schedulePayload,
      });
      if (error) throw error;
      setMsg(nodeForm.node_type === 'group' ? 'تم حفظ التصنيف. قيمته ستأتي من أبنائه فقط.' : 'تم حفظ العنصر وقاعدة حسابه ضمن المحرك الموحد.');
      setShowNodeEditor(false);
      await loadAll();
    } catch (e2) {
      setErr(e2?.message || 'تعذر حفظ البند.');
    } finally {
      setBusy(false);
    }
  }

  function lineValue(line) {
    return num(line.confirmed_amount ?? line.expected_amount);
  }

  function descendantLineTotal(groupId) {
    const directItemIds = new Set((catalogChildren.get(groupId) || []).filter((n) => n.node_type === 'item').map((n) => n.id));
    let total = statement.filter((line) => directItemIds.has(line.item_id)).reduce((sum, line) => sum + lineValue(line), 0);
    for (const child of (catalogChildren.get(groupId) || []).filter((n) => n.node_type === 'group')) total += descendantLineTotal(child.id);
    return total;
  }

  function renderReportGroup(group, depth = 0) {
    const children = catalogChildren.get(group.id) || [];
    const childGroups = children.filter((n) => n.node_type === 'group');
    const childItems = new Set(children.filter((n) => n.node_type === 'item').map((n) => n.id));
    const lines = statement.filter((line) => childItems.has(line.item_id));
    const isCollapsed = collapsed[group.id] !== false;
    const total = descendantLineTotal(group.id);
    if (!lines.length && !childGroups.some((g) => descendantLineTotal(g.id) > 0)) return null;

    return <div key={group.id} style={{ marginInlineStart: depth * 14, marginBottom: 10 }}>
      <button type="button" className="btn ghost" style={{ width: '100%', justifyContent: 'space-between' }} onClick={() => setCollapsed((old) => ({ ...old, [group.id]: !isCollapsed }))}>
        <strong>{isCollapsed ? '▸' : '▾'} {group.name}</strong><span>{amountLabel(total)}</span>
      </button>
      {!isCollapsed && <div style={{ marginTop: 8 }}>
        {lines.length > 0 && <TableFrame><table><thead><tr><th>التفصيل</th><th>المتوقع</th><th>المؤكد</th><th>المدفوع</th><th>المخصص المطلوب</th><th>الحالة</th><th></th></tr></thead><tbody>
          {lines.map((line) => <tr key={line.line_id}>
            <td><strong>{line.item_name}</strong><div className="muted">{line.unit_label || ''}</div></td>
            <td>{amountLabel(line.expected_amount)}</td>
            <td>{line.confirmed_amount == null ? '—' : amountLabel(line.confirmed_amount)}</td>
            <td>{amountLabel(line.paid_amount)}</td>
            <td>{line.cash_effect_type === 'reserve_only' ? amountLabel(line.required_reserve) : '—'}</td>
            <td>{line.cash_effect_type === 'due_now' ? 'مستحق' : `استحقاق ${dateAr(line.due_date)}`}</td>
            <td><Toolbar>
              {canMutatePeriod && <button className="btn ghost" onClick={() => editLine(line)}>تعديل</button>}
              {canMutatePeriod && num(line.reserve_gap) > 0 && <button className="btn ghost" onClick={() => reserveGap(line)}>تم حجز المطلوب</button>}
            </Toolbar></td>
          </tr>)}
        </tbody></table></TableFrame>}
        {childGroups.map((child) => renderReportGroup(child, depth + 1))}
      </div>}
    </div>;
  }

  function renderCatalogNode(node, depth = 0) {
    const children = catalogChildren.get(node.id) || [];
    const rate = node.node_type === 'item' ? effectiveRate(node.id) : null;
    const schedule = node.node_type === 'item' ? effectiveSchedule(node.id) : null;
    const nodeBands = rate ? bandsForRate(rate.id) : [];
    return <div key={node.id} style={{ marginInlineStart: depth * 18, borderInlineStart: depth ? '1px solid var(--line, #333)' : 'none', paddingInlineStart: depth ? 10 : 0, marginBottom: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,1fr) minmax(160px,.8fr) minmax(130px,.6fr) auto', gap: 10, alignItems: 'center', padding: '10px 12px', border: '1px solid var(--line, #333)', borderRadius: 8 }}>
        <div><strong>{node.node_type === 'group' ? '▦' : '•'} {node.name}</strong><div className="muted">{node.node_type === 'group' ? 'تصنيف؛ لا يحمل قيمة مستقلة' : OPERATING_BUDGET.calculationLabels[node.calculation_type]}</div></div>
        <div>{node.node_type === 'group' ? `${children.length} عنصر/تصنيف` : budgetRateSummary(node.calculation_type, rate?.params || {}, nodeBands)}</div>
        <div>{node.node_type === 'group' ? '—' : schedule ? OPERATING_BUDGET.recurrenceLabels[schedule.recurrence_unit] : 'غير مجدول'}</div>
        <Toolbar>
          {canEdit && node.node_type === 'group' && <button className="btn ghost" onClick={() => startNode('item', node)}>+ تفصيل</button>}
          {canEdit && node.node_type === 'group' && <button className="btn ghost" onClick={() => startNode('group', node)}>+ تصنيف</button>}
          {canEdit && <button className="btn ghost" onClick={() => configureNode(node)}>إعداد</button>}
        </Toolbar>
      </div>
      {children.map((child) => renderCatalogNode(child, depth + 1))}
    </div>;
  }

  if (loading) return <ConstitutionPage><EmptyState title="جارٍ تحميل ميزانية التشغيل" description="يتم تحميل الالتزامات والمخصصات والتوقعات." /></ConstitutionPage>;
  if (!canView) return <ConstitutionPage><Notice tone="error">لا تملك صلاحية عرض ميزانية وتشغيل الشركة.</Notice></ConstitutionPage>;

  const rootGroups = (catalogChildren.get('__root__') || []).filter((n) => n.node_type === 'group');

  return <ConstitutionPage>
    <PageHeader
      eyebrow="المالية"
      title="ميزانية وتشغيل الشركة"
      description="التفاصيل هي التي تصنع القيمة؛ التصنيفات تجمعها فقط. نفس المحرك يخدم المستهلكات والتأمينات والشرائح والاشتراكات والمعادلات المركبة."
      actions={<><input type="month" dir="ltr" value={month} onChange={(e) => setMonth(e.target.value)} /><button className="btn ghost" onClick={loadAll} disabled={busy}>تحديث</button></>}
    />

    {err && <Notice tone="error">{err}</Notice>}
    {msg && <Notice tone="success">{msg}</Notice>}

    {!period ? <EntrySurface title={`فتح ${monthLabelAr(month)}`} description="فتح الشهر يولد الأوراق الحسابية المجدولة فقط؛ التصنيفات لا تولد مبالغ.">
      <div style={{ padding: 22 }}>{canEdit ? <button className="btn" onClick={openMonth} disabled={busy}>فتح الشهر وتوليد الكشف</button> : <Notice>فتح شهر جديد يحتاج صلاحية إدارة ميزانية التشغيل.</Notice>}</div>
    </EntrySurface> : <>
      <Section title={`ملخص ${monthLabelAr(month)}`} actions={<>{period.status === 'closed' ? canReopen && <button className="btn ghost" onClick={reopenPeriod}>إعادة فتح</button> : canEdit && <button className="btn ghost" onClick={closePeriod}>إقفال الشهر</button>}</>}>
        <SummaryStrip items={[
          { key: 'due', value: money(summary.confirmed_due || summary.expected_due), label: 'المطلوب هذا الشهر', note: 'ريال' },
          { key: 'reserve', value: money(summary.required_reserve), label: 'المطلوب حجزه', note: 'ريال' },
          { key: 'protected', value: money(summary.protected_balance), label: 'الرصيد المحمي', note: 'ريال' },
          { key: 'free', value: summary.free_opening_balance == null ? '—' : money(summary.free_opening_balance), label: 'المتاح الحر', note: summary.free_opening_balance == null ? 'أدخل رصيد البداية' : 'ريال' },
          { key: 'paid', value: money(summary.paid), label: 'المدفوع فعليًا', note: 'ريال' },
          { key: 'plan', value: summary.plan_surplus_deficit == null ? '—' : money(summary.plan_surplus_deficit), label: 'فائض/عجز الخطة', note: 'ريال' },
        ]} />
      </Section>

      <EntrySurface title="رصيد بداية الشهر" description="المخصص لا يخرج من البنك؛ لذلك نعرض الرصيد النقدي والرصيد الحر منفصلين.">
        <form onSubmit={saveOpeningBalance} style={{ padding: 22 }}><div className="form-grid"><div className="field"><label>الرصيد (ريال)</label><input type="number" step="0.01" dir="ltr" value={openingBalance} disabled={!canMutatePeriod} onChange={(e) => setOpeningBalance(e.target.value)} /></div><div className="field"><label>أدنى رصيد حر متوقع</label><strong>{summary.min_expected_free_balance == null ? '—' : amountLabel(summary.min_expected_free_balance)}</strong></div></div>{canMutatePeriod && <Toolbar><button className="btn" type="submit">حفظ الرصيد</button></Toolbar>}</form>
      </EntrySurface>

      <Section title="كشف الشهر" description="اضغط التصنيف لعرض الإجمالي فقط أو فتح التفاصيل. الإجمالي لا يُخزن على التصنيف؛ هو مجموع أوراقه الحسابية.">
        {rootGroups.map((group) => renderReportGroup(group))}
        {!statement.length && <EmptyState title="لا توجد أوراق حسابية لهذا الشهر" description="أضف أو جدْول التفاصيل من كتالوج التشغيل." />}
      </Section>
    </>}

    {selectedLine && <EntrySurface title={selectedLine.item_name} description={`${selectedLine.cash_effect_type === 'due_now' ? 'مستحق هذا الشهر' : 'التزام مستقبلي'} · ${dateAr(selectedLine.due_date)}`}>
      <div style={{ padding: 22 }}>
        <div className="form-grid">
          {selectedLineFields.map((field) => <div className="field" key={field.key}><label>{field.label}</label><input type="number" step={field.step || '0.01'} dir="ltr" disabled={!canMutatePeriod} value={lineInputs[field.key] ?? ''} onChange={(e) => setLineInputs((old) => ({ ...old, [field.key]: e.target.value }))} />{field.help && <small>{field.help}</small>}</div>)}
          <div className="field"><label>القيمة المؤكدة/الفاتورة</label><input type="number" step="0.01" dir="ltr" disabled={!canMutatePeriod} value={confirmedAmount} onChange={(e) => setConfirmedAmount(e.target.value)} /></div>
        </div>
        {canMutatePeriod && <Toolbar>
          {selectedLineFields.length > 0 && <button className="btn" onClick={() => saveLineEstimate('this_month')}>هذا الشهر فقط</button>}
          {selectedLineFields.length > 0 && <button className="btn ghost" onClick={() => saveLineEstimate('from_now')}>من هذا الشهر وما بعده</button>}
          <button className="btn ghost" onClick={confirmActual}>تأكيد الفاتورة</button>
          <button className="btn ghost" onClick={() => setSelectedLine(null)}>إغلاق</button>
        </Toolbar>}
        {canMutatePeriod && selectedLine.cash_effect_type === 'due_now' && <form onSubmit={paySelected} style={{ marginTop: 18 }}><div className="form-grid"><div className="field"><label>حساب الخزينة</label><select value={paymentAccount} onChange={(e) => setPaymentAccount(e.target.value)}><option value="">اختر</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name_ar} — {money(a.current_balance)}</option>)}</select></div><div className="field"><label>مبلغ السداد</label><input type="number" step="0.01" dir="ltr" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} /></div><div className="field"><label>المرجع</label><input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} /></div></div><Toolbar><button className="btn" type="submit">سداد وربط بالخزينة</button></Toolbar></form>}
      </div>
    </EntrySurface>}

    <Section title="التوقع" description="قراءة صافية لا تنشئ التزامات وهمية." actions={<select value={forecastMonths} onChange={(e) => setForecastMonths(Number(e.target.value))}><option value={3}>3 أشهر</option><option value={6}>6 أشهر</option><option value={12}>12 شهرًا</option></select>}>
      <TableFrame><table><thead><tr><th>الشهر</th><th>استحقاقات</th><th>مخصص مطلوب</th><th>إجمالي الخطة</th></tr></thead><tbody>{forecast.map((row) => <tr key={row.period_start}><td>{monthLabelAr(row.period_start)}</td><td>{amountLabel(row.expected_due)}</td><td>{amountLabel(row.required_reserve)}</td><td><strong>{amountLabel(row.planned_total)}</strong></td></tr>)}</tbody></table></TableFrame>
    </Section>

    {showNodeEditor && <EntrySurface title={nodeForm.node_id ? `إعداد: ${nodeForm.name}` : nodeForm.node_type === 'group' ? 'إضافة تصنيف' : 'إضافة تفصيل حسابي'} description="التصنيف لا يحمل مبلغًا. العنصر النهائي فقط يملك طريقة حساب وتعرفة وجدولة.">
      <form onSubmit={saveCatalogNode} style={{ padding: 22 }}>
        <div className="form-grid">
          {!nodeForm.node_id && <div className="field"><label>نوع العقدة</label><select value={nodeForm.node_type} onChange={(e) => setNodeForm(emptyNode(selectedMonthStart, groups.find((g) => g.id === nodeForm.parent_item_id), e.target.value))}><option value="group">تصنيف تجميعي</option><option value="item">عنصر حسابي</option></select></div>}
          <div className="field"><label>التصنيف الأب</label><select value={nodeForm.parent_item_id} onChange={(e) => { const parent = groups.find((g) => g.id === e.target.value); setNodeForm((old) => ({ ...old, parent_item_id: e.target.value, group_key: parent?.group_key || old.group_key })); }}><option value="">بدون أب</option>{groups.filter((g) => g.id !== nodeForm.node_id).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
          <div className="field"><label>الاسم</label><input required value={nodeForm.name} onChange={(e) => setNodeForm((old) => ({ ...old, name: e.target.value }))} /></div>
          <div className="field"><label>نشط</label><select value={nodeForm.is_active ? '1' : '0'} onChange={(e) => setNodeForm((old) => ({ ...old, is_active: e.target.value === '1' }))}><option value="1">نعم</option><option value="0">متوقف</option></select></div>
        </div>

        {nodeForm.node_type === 'item' && <>
          <div className="form-grid">
            <div className="field"><label>طريقة الحساب</label><select value={nodeForm.calculation_type} onChange={(e) => changeCalculationType(e.target.value)}>{CALC_TYPES.map((type) => <option key={type} value={type}>{OPERATING_BUDGET.calculationLabels[type]}</option>)}</select></div>
            <div className="field"><label>سلوك التكلفة</label><select value={nodeForm.cost_behavior} onChange={(e) => setNodeForm((old) => ({ ...old, cost_behavior: e.target.value }))}>{COST_BEHAVIORS.map((type) => <option key={type} value={type}>{OPERATING_BUDGET.costBehaviorLabels[type]}</option>)}</select></div>
            <div className="field"><label>الوحدة</label><input value={nodeForm.unit_label} onChange={(e) => setNodeForm((old) => ({ ...old, unit_label: e.target.value }))} /></div>
            <div className="field"><label>سريان القاعدة</label><input type="date" dir="ltr" value={nodeForm.valid_from} onChange={(e) => setNodeForm((old) => ({ ...old, valid_from: e.target.value }))} /></div>
          </div>

          {simpleRateFields.length > 0 && <Section title="خط الأساس"><div className="form-grid" style={{ padding: 14 }}>{simpleRateFields.map((field) => <div className="field" key={field.key}><label>{field.label}</label><input type="number" step={field.step || '0.01'} dir="ltr" value={nodeForm.rate_inputs?.[field.key] ?? ''} onChange={(e) => setNodeForm((old) => ({ ...old, rate_inputs: { ...old.rate_inputs, [field.key]: e.target.value } }))} /></div>)}</div></Section>}

          {nodeForm.calculation_type === 'tiered' && <Section title="الشرائح" description="قيمة الشريحة كاملة أو سعر لكل وحدة حسب نوعها."><div style={{ padding: 14 }}>{nodeForm.bands.map((band, i) => <div className="form-grid" key={i}><div className="field"><label>من</label><input type="number" value={band.min_count} onChange={(e) => setNodeForm((old) => ({ ...old, bands: old.bands.map((b, j) => j === i ? { ...b, min_count: e.target.value } : b) }))} /></div><div className="field"><label>إلى (فارغ = بلا حد)</label><input type="number" value={band.max_count ?? ''} onChange={(e) => setNodeForm((old) => ({ ...old, bands: old.bands.map((b, j) => j === i ? { ...b, max_count: e.target.value } : b) }))} /></div><div className="field"><label>طريقة الشريحة</label><select value={band.band_mode || 'flat_fee_on_entry'} onChange={(e) => setNodeForm((old) => ({ ...old, bands: old.bands.map((b, j) => j === i ? { ...b, band_mode: e.target.value } : b) }))}><option value="flat_fee_on_entry">قيمة الشريحة كاملة</option><option value="per_unit_in_band">سعر × العدد</option><option value="per_unit_cumulative">تراكمي</option></select></div><div className="field"><label>القيمة</label><input type="number" step="0.01" value={band.band_amount} onChange={(e) => setNodeForm((old) => ({ ...old, bands: old.bands.map((b, j) => j === i ? { ...b, band_amount: e.target.value } : b) }))} /></div><button type="button" className="btn ghost" onClick={() => setNodeForm((old) => ({ ...old, bands: old.bands.filter((_, j) => j !== i) }))}>حذف</button></div>)}<button type="button" className="btn ghost" onClick={() => setNodeForm((old) => ({ ...old, bands: [...old.bands, { band_order: old.bands.length + 1, min_count: 0, max_count: '', band_mode: 'flat_fee_on_entry', band_amount: '' }] }))}>+ شريحة</button></div></Section>}

          {['employee_based_contribution', 'subscription_plus_usage', 'composite_formula'].includes(nodeForm.calculation_type) && <Section title="مكونات الحساب" description={nodeForm.calculation_type === 'employee_based_contribution' ? 'في التأمينات أدخل نسب المكونات هنا، ويكون الإدخال الشهري إجمالي الأجور الخاضعة فقط.' : 'كل مكون قاعدة صغيرة آمنة؛ المحرك يجمع نواتجها.'}><div style={{ padding: 14 }}>
            {nodeForm.calculation_type === 'composite_formula' && <><h4>مدخلات المعادلة</h4>{nodeForm.input_schema.map((field, i) => <div className="form-grid" key={i}><div className="field"><label>المفتاح</label><input value={field.key || ''} onChange={(e) => updateInputSchema(i, { key: e.target.value })} /></div><div className="field"><label>الاسم الظاهر</label><input value={field.label || ''} onChange={(e) => updateInputSchema(i, { label: e.target.value })} /></div><div className="field"><label>النوع</label><select value={field.kind || 'money'} onChange={(e) => updateInputSchema(i, { kind: e.target.value })}><option value="money">مبلغ</option><option value="number">رقم</option><option value="count">عدد</option></select></div><button type="button" className="btn ghost" onClick={() => setNodeForm((old) => ({ ...old, input_schema: old.input_schema.filter((_, j) => j !== i) }))}>حذف</button></div>)}<button type="button" className="btn ghost" onClick={() => setNodeForm((old) => ({ ...old, input_schema: [...old.input_schema, { key: `input_${old.input_schema.length + 1}`, label: '', kind: 'money', required: true }] }))}>+ مدخل</button></>}

            {nodeForm.components.map((c, i) => <div key={i} style={{ border: '1px solid var(--line, #333)', borderRadius: 8, padding: 12, marginTop: 10 }}><div className="form-grid"><div className="field"><label>اسم المكون</label><input value={c.label} onChange={(e) => updateComponent(i, { label: e.target.value })} /></div><div className="field"><label>نوع الحساب</label><select value={c.mode} onChange={(e) => updateComponent(i, { mode: e.target.value })}>{COMPONENT_MODES.map((mode) => <option key={mode} value={mode}>{OPERATING_BUDGET.componentModeLabels[mode]}</option>)}</select></div><div className="field"><label>التجميع</label><select value={c.bucket} onChange={(e) => updateComponent(i, { bucket: e.target.value })}>{BUCKETS.map((bucket) => <option key={bucket} value={bucket}>{OPERATING_BUDGET.metricBucketLabels[bucket]}</option>)}</select></div></div>
              {c.mode === 'fixed' && <div className="field"><label>القيمة</label><input type="number" step="0.01" value={c.amount} onChange={(e) => updateComponent(i, { amount: e.target.value })} /></div>}
              {['input_amount','percentage_of_input','per_unit','input_times_constant'].includes(c.mode) && <div className="field"><label>مفتاح المدخل</label><input value={c.input_key} disabled={nodeForm.calculation_type === 'employee_based_contribution'} onChange={(e) => updateComponent(i, { input_key: e.target.value })} /></div>}
              {c.mode === 'percentage_of_input' && <div className="field"><label>النسبة %</label><input type="number" step="0.0001" value={c.rate_percent} onChange={(e) => updateComponent(i, { rate_percent: e.target.value })} /></div>}
              {c.mode === 'per_unit' && <div className="form-grid"><div className="field"><label>سعر الوحدة</label><input type="number" step="0.01" value={c.unit_price} onChange={(e) => updateComponent(i, { unit_price: e.target.value })} /></div><div className="field"><label>وحدات مشمولة</label><input type="number" value={c.included_units} onChange={(e) => updateComponent(i, { included_units: e.target.value })} /></div></div>}
              {c.mode === 'input_times_constant' && <div className="field"><label>المعامل</label><input type="number" step="0.0001" value={c.factor} onChange={(e) => updateComponent(i, { factor: e.target.value })} /></div>}
              {c.mode === 'multiply_inputs' && <div className="form-grid"><div className="field"><label>المدخل الأول</label><input value={c.left_input_key} onChange={(e) => updateComponent(i, { left_input_key: e.target.value })} /></div><div className="field"><label>المدخل الثاني</label><input value={c.right_input_key} onChange={(e) => updateComponent(i, { right_input_key: e.target.value })} /></div></div>}
              <button type="button" className="btn ghost" onClick={() => setNodeForm((old) => ({ ...old, components: old.components.filter((_, j) => j !== i) }))}>حذف المكون</button>
            </div>)}
            <button type="button" className="btn ghost" style={{ marginTop: 10 }} onClick={() => setNodeForm((old) => ({ ...old, components: [...old.components, componentForType(old.calculation_type)] }))}>+ مكون حساب</button>
          </div></Section>}

          <Section title="الجدولة" description="اترك تاريخ الاستحقاق المرجعي فارغًا إذا لم تعرف توقيت البند بعد."><div className="form-grid" style={{ padding: 14 }}><div className="field"><label>الدورية</label><select value={nodeForm.recurrence_unit} onChange={(e) => setNodeForm((old) => ({ ...old, recurrence_unit: e.target.value }))}>{RECURRENCES.map((r) => <option key={r} value={r}>{OPERATING_BUDGET.recurrenceLabels[r]}</option>)}</select></div><div className="field"><label>كل كم دورة</label><input type="number" min="1" value={nodeForm.recurrence_interval_count} onChange={(e) => setNodeForm((old) => ({ ...old, recurrence_interval_count: e.target.value }))} /></div><div className="field"><label>تاريخ الاستحقاق المرجعي</label><input type="date" dir="ltr" value={nodeForm.anchor_date} onChange={(e) => setNodeForm((old) => ({ ...old, anchor_date: e.target.value }))} /></div><div className="field"><label>بداية الحجز</label><select value={nodeForm.accrual_start_rule} onChange={(e) => setNodeForm((old) => ({ ...old, accrual_start_rule: e.target.value }))}><option value="from_period_start">من بداية دورة الاستحقاق</option><option value="immediately_after_previous_due">بعد الاستحقاق السابق مباشرة</option><option value="fixed_months_before_due">قبل الاستحقاق بعدد أشهر</option></select></div>{nodeForm.accrual_start_rule === 'fixed_months_before_due' && <div className="field"><label>عدد الأشهر</label><input type="number" min="1" value={nodeForm.accrual_lead_months} onChange={(e) => setNodeForm((old) => ({ ...old, accrual_lead_months: e.target.value }))} /></div>}</div></Section>
        </>}

        <div className="field"><label>ملاحظات</label><textarea value={nodeForm.notes} onChange={(e) => setNodeForm((old) => ({ ...old, notes: e.target.value }))} /></div>
        <Toolbar><button className="btn" type="submit" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ'}</button><button className="btn ghost" type="button" onClick={() => setShowNodeEditor(false)}>إلغاء</button></Toolbar>
      </form>
    </EntrySurface>}

    <Section title="كتالوج التشغيل" description="اختر تصنيفًا موجودًا ثم أضف تحته التفاصيل الفعلية التي يشتريها المحاسب أو التي تنتج الالتزام." actions={canEdit ? <Toolbar><button className="btn" onClick={() => startNode('group')}>+ تصنيف رئيسي</button><button className="btn" onClick={() => startNode('item')}>+ عنصر مستقل</button></Toolbar> : null}>
      {rootGroups.map((node) => renderCatalogNode(node))}
    </Section>
  </ConstitutionPage>;
}
