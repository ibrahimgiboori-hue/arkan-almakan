'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { money, dateAr } from '@/lib/format';
import { appendSelectionToUrl } from '@/lib/record-selection';
import { operationalDate } from '@/lib/system-constitution';
import { useDashboardSession } from '@/lib/dashboard-session-context';
import { WORK_ACTION_CONSEQUENCE, WORK_ACTION_KIND, WORK_ACTION_SCOPE } from '@/lib/work-surface-constitution';
import {
  focusContextualWorkSurface,
  focusFirstInvalidField,
  restoreInteractionOrigin,
  contextualEscape,
} from '@/lib/interaction-journey';
import {
  OPERATING_BUDGET,
  budgetComponentInputOptions,
  budgetComponentNeedsSingleInput,
  budgetDefaultComponent,
  budgetDefaultRateProfile,
  budgetInputFields,
  budgetRateFields,
  budgetRateSummary,
  budgetValidateComponentInputs,
  budgetWorkGuidance,
  monthKey,
  monthLabelAr,
  monthStart,
} from '@/lib/operating-budget';
import ProgramAction from '@/components/ui/ProgramAction';
import { WorkSelectionDock } from '@/components/ui/WorkSheetKernel';
import InlineHelp from '@/components/ui/InlineHelp';
import AttentionArea from '@/components/ui/AttentionArea';
import DisclosureSection from '@/components/ui/DisclosureSection';
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
const COMPONENT_CALC_TYPES = ['employee_based_contribution', 'subscription_plus_usage', 'composite_formula'];
const ONGOING_INPUT_CALC_TYPES = new Set(['fixed_amount', 'variable_monthly', 'quantity_x_unit_price']);
const ACTIVE_WORK_STYLE = {
  scrollMarginTop: 96,
  outline: '2px solid var(--line, #777)',
  outlineOffset: 3,
  borderRadius: 10,
};

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function amountLabel(value) {
  return `${money(value)} ريال`;
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJson(value[key])]));
  }
  return value ?? null;
}

function sameJson(left, right) {
  return JSON.stringify(stableJson(left)) === JSON.stringify(stableJson(right));
}

function hasCapability(me, capability) {
  return Boolean(me?.access?.fullAdmin || me?.capabilityKeys?.has?.(capability));
}

function emptyNode(validFrom = monthStart(operationalDate()), parent = null, nodeType = 'item') {
  return {
    node_id: '',
    node_type: nodeType,
    branch_scope_id: parent?.branch_scope_id || '',
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
    schedule_valid_to: '',
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

function buildGroupMaps(catalog) {
  const children = new Map();
  for (const node of catalog) {
    const key = node.parent_item_id || '__root__';
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(node);
  }
  for (const list of children.values()) {
    list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name, 'ar'));
  }
  return { children };
}

function workErrorMessage(message) {
  const raw = String(message || 'تعذر تنفيذ الإجراء.');
  if (raw.includes('إصدار التعرفة غير قابل للتعديل') || raw.includes('يوجد إصدار تعرفة يبدأ في نفس التاريخ')) {
    return 'هذا الإصدار استُخدم بالفعل. إذا كانت المعلومة الجديدة تبدأ من تاريخ لاحق، غيّر «سريان القاعدة» إلى تاريخ بداية التغيير. وإذا كان التعديل لهذا الشهر فقط، نفّذه من كشف الشهر حتى يبقى التاريخ السابق محفوظًا.';
  }
  if (raw.includes('الجدول استُخدم فعليًا') || raw.includes('هذا الجدول استُخدم فعليًا')) {
    return 'هذه الجدولة دخلت في كشف سابق، لذلك لا نعيد كتابة الماضي. أنشئ التغيير من تاريخ سريان جديد، وسيبقى ما قبله محفوظًا.';
  }
  return raw;
}

function WorkGuide({ guidance, title }) {
  if (!guidance) return null;
  return <div style={{ padding: '10px 18px 0' }} data-work-guidance="true">
    <small className="muted">{guidance.context}</small>
    <div style={{ marginTop: 4 }}><strong>أنت الآن تعمل على: {title}</strong></div>
    <div className="muted" style={{ marginTop: 4 }}>{guidance.summary}</div>
    {guidance.steps?.length > 0 && <small className="muted" style={{ display: 'block', marginTop: 6 }}>الترتيب المقترح: {guidance.steps.join(' ← ')}</small>}
  </div>;
}

export default function OperatingBudgetPage() {
  const me = useDashboardSession();
  const searchParams = useSearchParams();
  const canView = hasCapability(me, OPERATING_BUDGET.capability.view);
  const canEdit = hasCapability(me, OPERATING_BUDGET.capability.edit);
  const canReopen = hasCapability(me, OPERATING_BUDGET.capability.reopen);

  const [month, setMonth] = useState(() => searchParams.get('month') || monthKey(operationalDate()));
  const [period, setPeriod] = useState(null);
  const [statement, setStatement] = useState([]);
  const [selectedStatementIds, setSelectedStatementIds] = useState(() => new Set());
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
  const [attentionRefresh, setAttentionRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [workErr, setWorkErr] = useState('');

  const lineOriginId = useRef('');
  const nodeOriginId = useRef('');
  const lineWorkRef = useRef(null);
  const nodeWorkRef = useRef(null);

  const groups = useMemo(() => catalog.filter((x) => x.node_type === 'group'), [catalog]);
  const { children: catalogChildren } = useMemo(() => buildGroupMaps(catalog), [catalog]);
  const selectedMonthStart = monthStart(month);
  const periodEditable = period?.status !== 'closed';
  const canMutatePeriod = canEdit && periodEditable;
  const simpleRateFields = budgetRateFields(nodeForm.calculation_type);
  const effectiveNodeRate = nodeForm.node_id ? effectiveRate(nodeForm.node_id) : null;
  const selectedLineRate = selectedLine ? effectiveRate(selectedLine.item_id) : null;
  const selectedLineFields = selectedLine ? budgetInputFields(selectedLine.calculation_type, selectedLineRate?.params || {}) : [];
  const selectedStatement = useMemo(() => statement.filter((line) => selectedStatementIds.has(String(line.line_id))), [statement, selectedStatementIds]);
  const selectedStatementTotal = useMemo(() => selectedStatement.reduce((sum, line) => sum + lineValue(line), 0), [selectedStatement]);

  useEffect(() => {
    if (selectedLine) focusContextualWorkSurface(lineWorkRef.current);
  }, [selectedLine?.line_id]);

  useEffect(() => {
    if (showNodeEditor) focusContextualWorkSurface(nodeWorkRef.current);
  }, [showNodeEditor, nodeForm.node_id, nodeForm.parent_item_id]);

  useEffect(() => {
    setSelectedStatementIds(new Set());
  }, [month, period?.id]);

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
    setLoading(true);
    setErr('');
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
    if (!canView) {
      setLoading(false);
      return;
    }
    loadAll();
  }, [month, forecastMonths, canView]);

  async function run(action, successMessage, onError = null) {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const result = await action();
      if (result?.error) throw result.error;
      if (successMessage) setMsg(successMessage);
      await loadAll();
      return result;
    } catch (e) {
      const message = workErrorMessage(e?.message || 'تعذر تنفيذ الإجراء.');
      if (onError) onError(message);
      else setErr(message);
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
    lineOriginId.current = `budget-line-edit-${line.line_id}`;
    setShowNodeEditor(false);
    setWorkErr('');
    setSelectedLine(line);
    setLineInputs({ ...baseline, ...(line.variable_inputs || {}), ...(line.line_override_params || {}) });
    setConfirmedAmount(line.confirmed_amount ?? '');
    setPaymentAmount(line.unpaid_amount || '');
    setPaymentAccount(accounts[0]?.id || '');
    setPaymentReference('');
    setErr('');
    setMsg('');
  }

  function closeLineEditor() {
    const origin = lineOriginId.current;
    setSelectedLine(null);
    setWorkErr('');
    restoreInteractionOrigin(origin);
  }

  function toggleStatementLine(line) {
    const id = String(line.line_id);
    setSelectedStatementIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleStatementGroup(lines) {
    const ids = lines.map((line) => String(line.line_id));
    setSelectedStatementIds((current) => {
      const next = new Set(current);
      const allSelected = ids.length > 0 && ids.every((id) => next.has(id));
      ids.forEach((id) => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  }

  function printSelectedStatement() {
    if (!selectedStatementIds.size) return;
    window.open(appendSelectionToUrl(`/print/operating-budget?month=${month}`, selectedStatementIds), '_blank', 'noopener,noreferrer');
  }

  async function addSelectedToAttention() {
    if (!selectedStatement.length || busy) return;
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      for (const line of selectedStatement) {
        const dueAt = line.due_date ? `${line.due_date}T12:00:00+03:00` : null;
        const { error } = await supabase.rpc('fn_set_attention', {
          p_source_table: 'budget_period_lines',
          p_source_id: line.line_id,
          p_title: line.item_name,
          p_description: `${line.cash_effect_type === 'due_now' ? 'مستحق في' : 'ظاهر ضمن'} ${monthLabelAr(month)} · القيمة الحالية ${amountLabel(lineValue(line))}`,
          p_source_route: `/dashboard/operating-budget?month=${month}`,
          p_source_label: `ميزانية التشغيل · ${monthLabelAr(month)}`,
          p_priority: line.cash_effect_type === 'due_now' ? 'high' : 'normal',
          p_due_at: dueAt,
          p_project_id: null,
          p_active: true,
        });
        if (error) throw error;
      }
      setAttentionRefresh((value) => value + 1);
      setSelectedStatementIds(new Set());
      setMsg(`تمت إضافة ${selectedStatement.length} بند للمتابعة. سيظل ظاهرًا حتى تتم معالجته.`);
    } catch (e) {
      setErr(e?.message || 'تعذر إضافة البنود للمتابعة.');
    } finally {
      setBusy(false);
    }
  }

  async function saveLineEstimate(scope) {
    if (!selectedLine || !canMutatePeriod) return;
    setWorkErr('');
    const payload = Object.fromEntries(selectedLineFields.map((f) => [f.key, num(lineInputs[f.key])]));
    const result = await run(() => supabase.rpc('budget_save_line_inputs', {
      p_line_id: selectedLine.line_id,
      p_inputs: payload,
      p_scope: scope,
      p_reason: scope === 'this_month' ? 'تحديث تقدير هذا الشهر' : 'تغيير القيمة الافتراضية للتقدير من الدورة الحالية وما بعدها',
    }), scope === 'this_month' ? 'تم حفظ تقدير هذا الشهر.' : 'تم تغيير القيمة الافتراضية من الدورة الحالية وما بعدها.', setWorkErr);
    if (result) closeLineEditor();
    else focusFirstInvalidField(lineWorkRef.current);
  }

  async function confirmActual() {
    if (!selectedLine || !canMutatePeriod) return;
    setWorkErr('');
    const result = await run(() => supabase.rpc('budget_confirm_line', {
      p_line_id: selectedLine.line_id,
      p_confirmed: num(confirmedAmount),
      p_source: 'invoice',
      p_note: 'قيمة فعلية مؤكدة من ميزانية التشغيل',
    }), 'تم تأكيد القيمة الفعلية.', setWorkErr);
    if (result) closeLineEditor();
    else focusFirstInvalidField(lineWorkRef.current);
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
    setWorkErr('');
    const result = await run(() => supabase.rpc('budget_pay_from_treasury', {
      p_line_id: selectedLine.line_id,
      p_account_id: paymentAccount,
      p_amount: num(paymentAmount),
      p_reference: paymentReference.trim() || null,
    }), 'تم تسجيل السداد في الخزينة وربطه بالالتزام دون إنشاء مصروف مكرر.', setWorkErr);
    if (result) closeLineEditor();
    else focusFirstInvalidField(lineWorkRef.current);
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

  function startNode(nodeType = 'group', parent = null, originId = '') {
    if (!canEdit) return;
    if (nodeType === 'item' && !parent) return;
    nodeOriginId.current = originId;
    setSelectedLine(null);
    setWorkErr('');
    setNodeForm(emptyNode(selectedMonthStart, parent, nodeType));
    setShowNodeEditor(true);
    setErr('');
    setMsg('');
  }

  function configureNode(node, originId = '') {
    if (!canEdit) return;
    const schedule = node.node_type === 'item' ? effectiveSchedule(node.id) : null;
    const rate = node.node_type === 'item' ? effectiveRate(node.id) : null;
    const profile = rate?.params || budgetDefaultRateProfile(node.calculation_type);
    nodeOriginId.current = originId;
    setSelectedLine(null);
    setWorkErr('');
    setNodeForm({
      node_id: node.id,
      node_type: node.node_type,
      branch_scope_id: node.branch_scope_id || '',
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
      valid_from: rate?.valid_from || schedule?.valid_from || selectedMonthStart,
      schedule_valid_to: schedule?.valid_to || '',
      recurrence_unit: schedule?.recurrence_unit || 'month',
      recurrence_interval_count: schedule?.recurrence_interval_count || 1,
      anchor_date: schedule?.anchor_date || '',
      accrual_start_rule: schedule?.accrual_start_rule || 'from_period_start',
      accrual_lead_months: schedule?.accrual_lead_months || '',
      is_active: node.is_active,
      notes: node.notes || '',
      sort_order: node.sort_order || 50,
    });
    setShowNodeEditor(true);
    setErr('');
    setMsg('');
  }

  function closeNodeEditor() {
    const origin = nodeOriginId.current;
    setShowNodeEditor(false);
    setWorkErr('');
    restoreInteractionOrigin(origin);
  }

  function changeCalculationType(next) {
    const profile = budgetDefaultRateProfile(next);
    setWorkErr('');
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

  function changeComponentMode(index, mode) {
    const options = budgetComponentInputOptions(nodeForm.calculation_type, nodeForm.input_schema, { input_schema: nodeForm.input_schema, components: nodeForm.components });
    const patch = { mode };
    if (budgetComponentNeedsSingleInput(mode) && options.length === 1) {
      patch.input_key = options[0].key;
      patch.input_label = options[0].label;
    }
    updateComponent(index, patch);
  }

  function selectComponentInput(index, inputKey) {
    const option = nodeForm.input_schema.find((field) => field.key === inputKey);
    updateComponent(index, { input_key: inputKey, input_label: option?.label || '' });
  }

  function addCalculationInput() {
    setNodeForm((old) => {
      const next = old.input_schema.length + 1;
      return { ...old, input_schema: [...old.input_schema, { key: `input_${next}`, label: '', kind: 'money', required: true }] };
    });
  }

  function buildRateParams() {
    if (nodeForm.node_type !== 'item' || nodeForm.calculation_type === 'external_forecast_actual') return null;
    if (nodeForm.calculation_type === 'tiered') return nodeForm.bands.length ? {} : null;
    if (COMPONENT_CALC_TYPES.includes(nodeForm.calculation_type)) {
      if (!nodeForm.components.length) return null;
      const validationErrors = budgetValidateComponentInputs(nodeForm.calculation_type, nodeForm.input_schema, nodeForm.components, { input_schema: nodeForm.input_schema, components: nodeForm.components });
      if (validationErrors.length) throw new Error(validationErrors[0]);
      const components = nodeForm.components.map((c, index) => {
        const inputDefinition = nodeForm.input_schema.find((field) => field.key === c.input_key);
        const out = {
          key: c.key || `component_${index + 1}`,
          label: c.label || `مكون ${index + 1}`,
          mode: c.mode,
          bucket: c.bucket || 'other',
          include_in_total: c.include_in_total !== false,
        };
        if (c.input_key) {
          out.input_key = c.input_key;
          out.input_label = inputDefinition?.label || c.input_label || c.input_key;
        }
        if (c.left_input_key) out.left_input_key = c.left_input_key;
        if (c.right_input_key) out.right_input_key = c.right_input_key;
        if (c.mode === 'fixed') out.amount = num(c.amount);
        if (c.mode === 'percentage_of_input') out.rate_percent = num(c.rate_percent);
        if (c.mode === 'per_unit') {
          out.unit_price = num(c.unit_price);
          out.included_units = num(c.included_units);
        }
        if (c.mode === 'input_times_constant') out.factor = num(c.factor);
        return out;
      });
      return { input_schema: nodeForm.input_schema, components };
    }
    const fields = budgetRateFields(nodeForm.calculation_type);
    if (!fields.length) return null;
    const filled = fields.filter((f) => String(nodeForm.rate_inputs?.[f.key] ?? '').trim() !== '');
    if (!filled.length) return null;
    if (filled.length !== fields.length) throw new Error('أكمل جميع حقول أساس الاحتساب أو اتركها كلها فارغة.');
    return Object.fromEntries(fields.map((f) => [f.key, num(nodeForm.rate_inputs[f.key])]));
  }

  async function saveCatalogNode(e) {
    e.preventDefault();
    if (!canEdit) return;
    setBusy(true);
    setErr('');
    setMsg('');
    setWorkErr('');
    try {
      if (nodeForm.node_type === 'item' && !nodeForm.parent_item_id) throw new Error('العنصر الحسابي يجب أن يكون داخل تصنيف.');
      const parent = groups.find((g) => g.id === nodeForm.parent_item_id);
      const rateParams = buildRateParams();
      const schedulePayload = nodeForm.node_type === 'item' && nodeForm.anchor_date ? {
        valid_to: nodeForm.schedule_valid_to || null,
        recurrence_unit: nodeForm.recurrence_unit,
        recurrence_interval_count: Number(nodeForm.recurrence_interval_count || 1),
        anchor_date: nodeForm.anchor_date,
        accrual_start_rule: nodeForm.accrual_start_rule,
        accrual_lead_months: nodeForm.accrual_start_rule === 'fixed_months_before_due' ? Number(nodeForm.accrual_lead_months || 1) : null,
      } : null;

      const normalizedBands = nodeForm.bands.map((b, i) => ({
        band_order: i + 1,
        min_count: num(b.min_count),
        max_count: String(b.max_count ?? '').trim() === '' ? null : num(b.max_count),
        band_mode: b.band_mode || 'flat_fee_on_entry',
        band_amount: num(b.band_amount),
      }));

      const currentRate = nodeForm.node_id && nodeForm.node_type === 'item' ? effectiveRate(nodeForm.node_id) : null;
      const currentSchedule = nodeForm.node_id && nodeForm.node_type === 'item' ? effectiveSchedule(nodeForm.node_id) : null;
      const currentBands = currentRate ? bandsForRate(currentRate.id).map((b, i) => ({
        band_order: i + 1,
        min_count: num(b.min_count),
        max_count: b.max_count == null ? null : num(b.max_count),
        band_mode: b.band_mode || 'flat_fee_on_entry',
        band_amount: num(b.band_amount),
      })) : [];
      const currentEffectiveFrom = currentRate?.valid_from || currentSchedule?.valid_from || nodeForm.valid_from;
      const effectiveFromChanged = Boolean(nodeForm.node_id) && nodeForm.valid_from !== currentEffectiveFrom;
      const rateChanged = Boolean(rateParams) && (
        !currentRate || effectiveFromChanged || !sameJson(rateParams, currentRate.params || {}) || !sameJson(normalizedBands, currentBands)
      );
      const scheduleChanged = Boolean(schedulePayload) && (
        !currentSchedule || effectiveFromChanged ||
        (currentSchedule.valid_to || null) !== (schedulePayload.valid_to || null) ||
        currentSchedule.recurrence_unit !== schedulePayload.recurrence_unit ||
        Number(currentSchedule.recurrence_interval_count || 1) !== Number(schedulePayload.recurrence_interval_count || 1) ||
        currentSchedule.anchor_date !== schedulePayload.anchor_date ||
        currentSchedule.accrual_start_rule !== schedulePayload.accrual_start_rule ||
        Number(currentSchedule.accrual_lead_months || 0) !== Number(schedulePayload.accrual_lead_months || 0)
      );
      const financialConfigChanged = rateChanged || scheduleChanged;

      let revisionMode = 'descriptive';
      let revisionValidFrom = nodeForm.valid_from;
      if (!nodeForm.node_id) revisionMode = 'new';
      if (nodeForm.node_id && nodeForm.node_type === 'item' && financialConfigChanged) {
        const isCorrection = window.confirm(
          'هل هذا تصحيح لبيانات سابقة؟\n\nاختيار «موافق» يعيد حساب التقديرات فقط وفق المعلومة المصححة، ولا يغيّر القيمة الفعلية أو المدفوع.'
        );
        if (isCorrection) {
          revisionMode = 'correction';
          revisionValidFrom = currentEffectiveFrom;
        } else {
          const applyFromCurrentCycle = window.confirm(
            'هل تريد تطبيق التغيير من دورة ' + monthLabelAr(month) + ' وما بعدها؟\n\nاختيار «إلغاء» هنا يعني عدم الحفظ.'
          );
          if (!applyFromCurrentCycle) {
            setWorkErr('لم يتم الحفظ. عند تعديل قاعدة مالية قائمة اختر إما «تصحيح سابق» أو «تغيير من الدورة الحالية».');
            return;
          }
          revisionMode = 'current_cycle';
          revisionValidFrom = selectedMonthStart;
        }
      }

      if (schedulePayload && nodeForm.calculation_type !== 'external_forecast_actual' && !rateParams && !effectiveNodeRate) {
        throw new Error('عرّف قاعدة الحساب أولًا قبل جدولة الاستحقاق.');
      }

      const { error } = await supabase.rpc('budget_save_catalog_node', {
        p_node_id: nodeForm.node_id || null,
        p_node_type: nodeForm.node_type,
        p_parent_item_id: nodeForm.parent_item_id || null,
        p_branch_scope_id: nodeForm.branch_scope_id || null,
        p_group_key: parent?.group_key || nodeForm.group_key,
        p_name: nodeForm.name,
        p_unit_label: nodeForm.node_type === 'item' ? nodeForm.unit_label || null : null,
        p_calculation_type: nodeForm.node_type === 'item' ? nodeForm.calculation_type : null,
        p_external_source: nodeForm.calculation_type === 'external_forecast_actual' ? 'payroll_run' : null,
        p_cost_behavior: nodeForm.node_type === 'item' ? nodeForm.cost_behavior : null,
        p_is_active: nodeForm.is_active,
        p_notes: nodeForm.notes || null,
        p_sort_order: Number(nodeForm.sort_order || 0),
        p_rate_valid_from: nodeForm.node_type === 'item' ? revisionValidFrom : null,
        p_rate_params: rateParams,
        p_rate_source: rateParams ? 'manual_entry' : null,
        p_rate_bands: normalizedBands,
        p_schedule_valid_from: nodeForm.node_type === 'item' ? revisionValidFrom : null,
        p_schedule: schedulePayload,
      });
      if (error) throw error;
      const successMessage = nodeForm.node_type === 'group'
        ? 'تم حفظ التصنيف. قيمته ستأتي من أبنائه فقط.'
        : revisionMode === 'correction'
          ? 'تم حفظ التصحيح وإعادة تقدير القيم المتوقعة فقط؛ القيمة الفعلية والمدفوع لم يتغيرا.'
          : revisionMode === 'current_cycle'
            ? 'تم حفظ التغيير من الدورة الحالية وما بعدها مع إبقاء التاريخ السابق كما هو.'
            : revisionMode === 'descriptive'
              ? 'تم حفظ التعديل الوصفي دون تغيير الحساب أو التاريخ المالي.'
              : 'تم حفظ العنصر وقاعدة حسابه ضمن المحرك الموحد.';
      setMsg(successMessage);
      setShowNodeEditor(false);
      await loadAll();
      restoreInteractionOrigin(nodeOriginId.current);
    } catch (e2) {
      setWorkErr(workErrorMessage(e2?.message || 'تعذر حفظ البند.'));
      requestAnimationFrame(() => focusFirstInvalidField(nodeWorkRef.current));
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
    for (const child of (catalogChildren.get(groupId) || []).filter((n) => n.node_type === 'group')) {
      total += descendantLineTotal(child.id);
    }
    return total;
  }

  function renderLineEditor() {
    if (!selectedLine) return null;
    const guidance = budgetWorkGuidance(selectedLine.calculation_type, { mode: 'statement', rateParams: selectedLineRate?.params || {} });
    return <div
      ref={lineWorkRef}
      tabIndex={-1}
      role="region"
      aria-label={`مساحة العمل: ${selectedLine.item_name}`}
      data-contextual-work-surface="active"
      style={ACTIVE_WORK_STYLE}
      onKeyDown={(event) => contextualEscape(event, closeLineEditor)}
    >
      <EntrySurface title={selectedLine.item_name} description={`${selectedLine.cash_effect_type === 'due_now' ? 'مستحق هذا الشهر' : 'التزام مستقبلي'} · ${dateAr(selectedLine.due_date)}`}>
        <WorkGuide guidance={guidance} title={selectedLine.item_name} />
        <div style={{ padding: 22 }}>
          {workErr && <Notice tone="error">{workErr}</Notice>}
          <div className="form-grid">
            {selectedLineFields.map((field) => <div className="field" key={field.key}>
              <label>{field.label}<InlineHelp text={field.help || 'هذا الرقم يدخل مباشرة في تقدير قيمة البند لهذا الشهر.'} /></label>
              <input type="number" step={field.step || '0.01'} dir="ltr" disabled={!canMutatePeriod} value={lineInputs[field.key] ?? ''} onChange={(e) => setLineInputs((old) => ({ ...old, [field.key]: e.target.value }))} />
              {field.help && <small>{field.help}</small>}
            </div>)}
            <div className="field">
              <label>القيمة الفعلية<InlineHelp text="المبلغ المؤكد فعليًا لهذا البند في الشهر. بعد تثبيته يصبح هو المرجع بدل التقدير المتوقع." /></label>
              <input type="number" step="0.01" dir="ltr" disabled={!canMutatePeriod} value={confirmedAmount} onChange={(e) => setConfirmedAmount(e.target.value)} />
            </div>
          </div>
          {canMutatePeriod && <Toolbar>
            {selectedLineFields.length > 0 && <button className="btn" onClick={() => saveLineEstimate('this_month')}>حفظ تقدير هذا الشهر</button>}
            {selectedLineFields.length > 0 && ONGOING_INPUT_CALC_TYPES.has(selectedLine.calculation_type) && <button className="btn ghost" onClick={() => saveLineEstimate('ongoing')}>اجعلها القيمة الافتراضية من هذا الشهر</button>}
            <button className="btn ghost" onClick={confirmActual}>تثبيت القيمة الفعلية</button>
            <button className="btn ghost" onClick={closeLineEditor}>إغلاق</button>
          </Toolbar>}
          {canMutatePeriod && selectedLine.cash_effect_type === 'due_now' && <form onSubmit={paySelected} style={{ marginTop: 18 }}>
            <div className="form-grid">
              <div className="field"><label>حساب الخزينة</label><select value={paymentAccount} onChange={(e) => setPaymentAccount(e.target.value)}><option value="">اختر</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name_ar} — {money(a.current_balance)}</option>)}</select></div>
              <div className="field"><label>مبلغ السداد<InlineHelp text="المبلغ الذي سيخرج فعليًا من حساب الخزينة المختار ويرتبط بهذا الالتزام. لا يمكن أن يتجاوز المتبقي المستحق." /></label><input type="number" step="0.01" dir="ltr" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} /></div>
              <div className="field"><label>المرجع</label><input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} /></div>
            </div>
            <Toolbar><button className="btn" type="submit">سداد وربط بالخزينة</button></Toolbar>
          </form>}
        </div>
      </EntrySurface>
    </div>;
  }

  function renderReportGroup(group, depth = 0) {
    const children = catalogChildren.get(group.id) || [];
    const childGroups = children.filter((n) => n.node_type === 'group');
    const childItems = new Set(children.filter((n) => n.node_type === 'item').map((n) => n.id));
    const lines = statement.filter((line) => childItems.has(line.item_id));
    const lineIds = lines.map((line) => String(line.line_id));
    const selectedInGroup = lineIds.filter((id) => selectedStatementIds.has(id)).length;
    const allGroupSelected = lineIds.length > 0 && selectedInGroup === lineIds.length;
    const someGroupSelected = selectedInGroup > 0 && !allGroupSelected;
    const isCollapsed = collapsed[group.id] !== false;
    const total = descendantLineTotal(group.id);
    if (!lines.length && !childGroups.some((g) => descendantLineTotal(g.id) > 0)) return null;

    return <div key={group.id} style={{ marginInlineStart: depth * 14, marginBottom: 10 }}>
      <button type="button" className="btn ghost" style={{ width: '100%', justifyContent: 'space-between' }} onClick={() => setCollapsed((old) => ({ ...old, [group.id]: !isCollapsed }))}>
        <strong>{isCollapsed ? '▸' : '▾'} {group.name}</strong><span>{amountLabel(total)}</span>
      </button>
      {!isCollapsed && <div style={{ marginTop: 8 }}>
        {lines.length > 0 && <TableFrame><table data-selection-surface="true"><thead><tr>
          <th style={{width:44,textAlign:'center'}}><input type="checkbox" aria-label={`تحديد بنود ${group.name}`} checked={allGroupSelected} ref={(node)=>{if(node)node.indeterminate=someGroupSelected;}} onChange={()=>toggleStatementGroup(lines)} /></th>
          <th>التفصيل</th><th>المتوقع</th><th>الفعلي</th><th>المدفوع</th><th>المخصص المطلوب</th><th>الحالة</th><th></th>
        </tr></thead><tbody>
          {lines.map((line) => <Fragment key={line.line_id}>
            <tr data-record-row="true" data-record-id={line.line_id} data-record-source="budget_period_lines" data-record-selected={selectedStatementIds.has(String(line.line_id))?'true':'false'}>
              <td style={{width:44,textAlign:'center'}}><input type="checkbox" aria-label={`تحديد ${line.item_name}`} checked={selectedStatementIds.has(String(line.line_id))} onChange={()=>toggleStatementLine(line)} /></td>
              <td><strong>{line.item_name}</strong><div className="muted">{line.unit_label || ''}</div></td>
              <td>{amountLabel(line.expected_amount)}</td>
              <td>{line.confirmed_amount == null ? '—' : amountLabel(line.confirmed_amount)}</td>
              <td>{amountLabel(line.paid_amount)}</td>
              <td>{line.cash_effect_type === 'reserve_only' ? amountLabel(line.required_reserve) : '—'}</td>
              <td>{line.cash_effect_type === 'due_now' ? 'مستحق' : `استحقاق ${dateAr(line.due_date)}`}</td>
              <td><Toolbar>
                {canMutatePeriod && <button id={`budget-line-edit-${line.line_id}`} className="btn ghost" onClick={() => editLine(line)}>تعديل</button>}
                {canMutatePeriod && num(line.reserve_gap) > 0 && <button className="btn ghost" onClick={() => reserveGap(line)}>تم حجز المطلوب</button>}
              </Toolbar></td>
            </tr>
            {selectedLine?.line_id === line.line_id && <tr><td colSpan={8} style={{ padding: 0, border: 0 }}>{renderLineEditor()}</td></tr>}
          </Fragment>)}
        </tbody></table></TableFrame>}
        {childGroups.map((child) => renderReportGroup(child, depth + 1))}
      </div>}
    </div>;
  }

  function renderNodeEditor() {
    if (!showNodeEditor) return null;
    const inputOptions = budgetComponentInputOptions(nodeForm.calculation_type, nodeForm.input_schema, { input_schema: nodeForm.input_schema, components: nodeForm.components });
    const guidance = budgetWorkGuidance(nodeForm.calculation_type, { nodeType: nodeForm.node_type, mode: 'catalog' });
    const title = nodeForm.node_id ? `إعداد: ${nodeForm.name}` : nodeForm.node_type === 'group' ? 'إضافة تصنيف' : 'إضافة تفصيل حسابي';

    return <div
      ref={nodeWorkRef}
      tabIndex={-1}
      role="region"
      aria-label={`مساحة العمل: ${title}`}
      data-contextual-work-surface="active"
      style={ACTIVE_WORK_STYLE}
      onKeyDown={(event) => contextualEscape(event, closeNodeEditor)}
    >
      <EntrySurface title={title} description="التصنيف لا يحمل مبلغًا. العنصر النهائي فقط يملك طريقة حساب وتعرفة وجدولة.">
        <WorkGuide guidance={guidance} title={nodeForm.name || title} />
        <form onSubmit={saveCatalogNode} style={{ padding: 22 }}>
          {workErr && <Notice tone="error">{workErr}</Notice>}
          <div className="form-grid">
            {!nodeForm.node_id && <div className="field"><label>نوع العقدة</label><select value={nodeForm.node_type} onChange={(e) => setNodeForm(emptyNode(selectedMonthStart, groups.find((g) => g.id === nodeForm.parent_item_id), e.target.value))}><option value="group">تصنيف تجميعي</option>{nodeForm.parent_item_id && <option value="item">عنصر حسابي</option>}</select></div>}
            <div className="field"><label>التصنيف الأب</label><select value={nodeForm.parent_item_id} onChange={(e) => { const parent = groups.find((g) => g.id === e.target.value); setNodeForm((old) => ({ ...old, parent_item_id: e.target.value, group_key: parent?.group_key || old.group_key })); }}><option value="" disabled={nodeForm.node_type === 'item'}>بدون أب</option>{groups.filter((g) => g.id !== nodeForm.node_id).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
            <div className="field"><label>الاسم</label><input required value={nodeForm.name} onChange={(e) => setNodeForm((old) => ({ ...old, name: e.target.value }))} /></div>
            <div className="field"><label>نشط</label><select value={nodeForm.is_active ? '1' : '0'} onChange={(e) => setNodeForm((old) => ({ ...old, is_active: e.target.value === '1' }))}><option value="1">نعم</option><option value="0">متوقف</option></select></div>
          </div>

          {nodeForm.node_type === 'item' && <>
            <div className="form-grid">
              <div className="field"><label>طريقة الحساب</label><select value={nodeForm.calculation_type} onChange={(e) => changeCalculationType(e.target.value)}>{CALC_TYPES.map((type) => <option key={type} value={type}>{OPERATING_BUDGET.calculationLabels[type]}</option>)}</select></div>
              <div className="field"><label>سلوك التكلفة</label><select value={nodeForm.cost_behavior} onChange={(e) => setNodeForm((old) => ({ ...old, cost_behavior: e.target.value }))}>{COST_BEHAVIORS.map((type) => <option key={type} value={type}>{OPERATING_BUDGET.costBehaviorLabels[type]}</option>)}</select></div>
              <div className="field"><label>الوحدة</label><input value={nodeForm.unit_label} onChange={(e) => setNodeForm((old) => ({ ...old, unit_label: e.target.value }))} /></div>
              <div className="field"><label>سريان القاعدة<InlineHelp text="من هذا التاريخ يبدأ استخدام قاعدة الحساب أو القيمة الحالية. التاريخ القديم قد يجعل التعديل تصحيحًا تاريخيًا؛ لا تستخدمه إذا كان التغيير يبدأ من الآن." /></label><input type="date" dir="ltr" value={nodeForm.valid_from} onChange={(e) => setNodeForm((old) => ({ ...old, valid_from: e.target.value }))} /><small className="muted">إذا تغيرت القاعدة بعد أن استُخدمت سابقًا، اجعل هذا تاريخ بداية القاعدة الجديدة بدل تعديل الماضي.</small></div>
            </div>

            {simpleRateFields.length > 0 && <Section title="أساس الاحتساب"><div className="form-grid" style={{ padding: 14 }}>{simpleRateFields.map((field) => <div className="field" key={field.key}><label>{field.label}<InlineHelp text={field.help || 'هذا الرقم يدخل في حساب قيمة البند لكل دورة وفق طريقة الحساب المختارة.'} /></label><input type="number" step={field.step || '0.01'} dir="ltr" value={nodeForm.rate_inputs?.[field.key] ?? ''} onChange={(e) => setNodeForm((old) => ({ ...old, rate_inputs: { ...old.rate_inputs, [field.key]: e.target.value } }))} /></div>)}</div></Section>}

            {nodeForm.calculation_type === 'tiered' && <Section title="الشرائح" description="قيمة الشريحة كاملة أو سعر لكل وحدة حسب نوعها."><div style={{ padding: 14 }}>{nodeForm.bands.map((band, i) => <div className="form-grid" key={i}><div className="field"><label>من<InlineHelp text="أول كمية أو عدد تدخل ضمن هذه الشريحة." /></label><input type="number" value={band.min_count} onChange={(e) => setNodeForm((old) => ({ ...old, bands: old.bands.map((b, j) => j === i ? { ...b, min_count: e.target.value } : b) }))} /></div><div className="field"><label>إلى (فارغ = بلا حد)<InlineHelp text="آخر كمية أو عدد في هذه الشريحة. تركه فارغًا يجعل الشريحة مفتوحة بلا حد أعلى." /></label><input type="number" value={band.max_count ?? ''} onChange={(e) => setNodeForm((old) => ({ ...old, bands: old.bands.map((b, j) => j === i ? { ...b, max_count: e.target.value } : b) }))} /></div><div className="field"><label>طريقة الشريحة</label><select value={band.band_mode || 'flat_fee_on_entry'} onChange={(e) => setNodeForm((old) => ({ ...old, bands: old.bands.map((b, j) => j === i ? { ...b, band_mode: e.target.value } : b) }))}><option value="flat_fee_on_entry">قيمة الشريحة كاملة</option><option value="per_unit_in_band">سعر × العدد</option><option value="per_unit_cumulative">تراكمي</option></select></div><div className="field"><label>القيمة<InlineHelp text="المبلغ أو سعر الوحدة الذي يطبقه النظام على هذه الشريحة حسب طريقة الشريحة المختارة." /></label><input type="number" step="0.01" value={band.band_amount} onChange={(e) => setNodeForm((old) => ({ ...old, bands: old.bands.map((b, j) => j === i ? { ...b, band_amount: e.target.value } : b) }))} /></div><button type="button" className="btn ghost" onClick={() => setNodeForm((old) => ({ ...old, bands: old.bands.filter((_, j) => j !== i) }))}>حذف</button></div>)}<button type="button" className="btn ghost" onClick={() => setNodeForm((old) => ({ ...old, bands: [...old.bands, { band_order: old.bands.length + 1, min_count: 0, max_count: '', band_mode: 'flat_fee_on_entry', band_amount: '' }] }))}>+ شريحة</button></div></Section>}

            {COMPONENT_CALC_TYPES.includes(nodeForm.calculation_type) && <>
              <Section title="مدخلات الحساب" description="عرّف الأرقام التي ستعتمد عليها المكونات مرة واحدة، ثم اخترها صراحةً كأساس للاحتساب داخل كل مكوّن."><div style={{ padding: 14 }}>
                {nodeForm.input_schema.map((field, i) => <div className="form-grid" key={field.key || i}>
                  <div className="field"><label>اسم المدخل</label><input value={field.label || ''} onChange={(e) => updateInputSchema(i, { label: e.target.value })} /><small className="muted">المعرف الداخلي: {field.key}</small></div>
                  <div className="field"><label>النوع</label><select value={field.kind || 'money'} onChange={(e) => updateInputSchema(i, { kind: e.target.value })}><option value="money">مبلغ</option><option value="number">رقم</option><option value="count">عدد</option></select></div>
                  <button type="button" className="btn ghost" onClick={() => setNodeForm((old) => ({ ...old, input_schema: old.input_schema.filter((_, j) => j !== i) }))}>حذف</button>
                </div>)}
                <button type="button" className="btn ghost" onClick={addCalculationInput}>+ مدخل حساب</button>
              </div></Section>

              <Section title="مكونات الحساب" description={nodeForm.calculation_type === 'employee_based_contribution' ? 'مثال: حصة المنشأة = إجمالي الأجور الخاضعة للاشتراك × النسبة. لا توجد نسبة بلا أساس احتساب صريح.' : 'كل مكوّن قاعدة صغيرة آمنة، ويرتبط بمدخلاته صراحةً.'}><div style={{ padding: 14 }}>
                {nodeForm.components.map((c, i) => {
                  const selectedInput = inputOptions.find((field) => field.key === c.input_key);
                  return <div key={c.key || i} style={{ border: '1px solid var(--line, #333)', borderRadius: 8, padding: 12, marginTop: 10 }}>
                    <div className="form-grid">
                      <div className="field"><label>اسم المكون</label><input value={c.label} onChange={(e) => updateComponent(i, { label: e.target.value })} /></div>
                      <div className="field"><label>نوع الحساب</label><select value={c.mode} onChange={(e) => changeComponentMode(i, e.target.value)}>{COMPONENT_MODES.map((mode) => <option key={mode} value={mode}>{OPERATING_BUDGET.componentModeLabels[mode]}</option>)}</select></div>
                      <div className="field"><label>التجميع</label><select value={c.bucket} onChange={(e) => updateComponent(i, { bucket: e.target.value })}>{BUCKETS.map((bucket) => <option key={bucket} value={bucket}>{OPERATING_BUDGET.metricBucketLabels[bucket]}</option>)}</select></div>
                    </div>
                    {c.mode === 'fixed' && <div className="field"><label>القيمة<InlineHelp text="قيمة ثابتة تضاف لهذا المكون في كل احتساب تنطبق عليه القاعدة." /></label><input type="number" step="0.01" value={c.amount} onChange={(e) => updateComponent(i, { amount: e.target.value })} /></div>}
                    {budgetComponentNeedsSingleInput(c.mode) && <div className="field"><label>{c.mode === 'percentage_of_input' ? 'أساس الاحتساب' : 'المدخل'}</label><select value={c.input_key || ''} onChange={(e) => selectComponentInput(i, e.target.value)}><option value="">اختر</option>{inputOptions.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}</select></div>}
                    {c.mode === 'percentage_of_input' && <><div className="field"><label>النسبة %<InlineHelp text="يضرب النظام أساس الاحتساب المختار في هذه النسبة لإنتاج قيمة المكون." /></label><input type="number" step="0.0001" value={c.rate_percent} onChange={(e) => updateComponent(i, { rate_percent: e.target.value })} /></div>{selectedInput && <small className="muted">{c.label || 'المكوّن'} = {selectedInput.label} × {c.rate_percent || 0}%</small>}</>}
                    {c.mode === 'per_unit' && <div className="form-grid"><div className="field"><label>سعر الوحدة<InlineHelp text="السعر الذي يضربه النظام في عدد الوحدات الخاضعة للاحتساب." /></label><input type="number" step="0.01" value={c.unit_price} onChange={(e) => updateComponent(i, { unit_price: e.target.value })} /></div><div className="field"><label>وحدات مشمولة<InlineHelp text="عدد الوحدات التي تعتبر مشمولة قبل تطبيق أي تكلفة إضافية حسب قاعدة هذا المكون." /></label><input type="number" value={c.included_units} onChange={(e) => updateComponent(i, { included_units: e.target.value })} /></div></div>}
                    {c.mode === 'input_times_constant' && <div className="field"><label>المعامل<InlineHelp text="يضرب النظام المدخل المختار في هذا الرقم لإنتاج قيمة المكون." /></label><input type="number" step="0.0001" value={c.factor} onChange={(e) => updateComponent(i, { factor: e.target.value })} /></div>}
                    {c.mode === 'multiply_inputs' && <div className="form-grid"><div className="field"><label>المدخل الأول</label><select value={c.left_input_key || ''} onChange={(e) => updateComponent(i, { left_input_key: e.target.value })}><option value="">اختر</option>{inputOptions.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}</select></div><div className="field"><label>المدخل الثاني</label><select value={c.right_input_key || ''} onChange={(e) => updateComponent(i, { right_input_key: e.target.value })}><option value="">اختر</option>{inputOptions.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}</select></div></div>}
                    <button type="button" className="btn ghost" onClick={() => setNodeForm((old) => ({ ...old, components: old.components.filter((_, j) => j !== i) }))}>حذف المكون</button>
                  </div>;
                })}
                <button type="button" className="btn ghost" style={{ marginTop: 10 }} onClick={() => setNodeForm((old) => ({ ...old, components: [...old.components, normalizeComponent(budgetDefaultComponent(old.calculation_type, old.components.length + 1))] }))}>+ مكون حساب</button>
              </div></Section>
            </>}

            <Section title="الجدولة" description="حدد التكرار وتاريخ الاستحقاق المرجعي. تاريخ الاستحقاق هو اليوم الذي تتوقع فيه نزول الفاتورة أو حلول الالتزام."><div className="form-grid" style={{ padding: 14 }}>
              <div className="field"><label>الدورية<InlineHelp text="تحدد وحدة التكرار: شهر أو سنة أو غيرها. الرقم في «كل كم دورة» يعمل على هذه الوحدة." /></label><select value={nodeForm.recurrence_unit} onChange={(e) => setNodeForm((old) => ({ ...old, recurrence_unit: e.target.value }))}>{RECURRENCES.map((r) => <option key={r} value={r}>{OPERATING_BUDGET.recurrenceLabels[r]}</option>)}</select></div>
              <div className="field"><label>كل كم دورة<InlineHelp text={`إذا كانت الدورية ${OPERATING_BUDGET.recurrenceLabels[nodeForm.recurrence_unit] || 'المختارة'} والرقم ${nodeForm.recurrence_interval_count || 1}، يتكرر الاستحقاق كل ${nodeForm.recurrence_interval_count || 1} دورة بدءًا من التاريخ المرجعي.`} /></label><input type="number" min="1" value={nodeForm.recurrence_interval_count} onChange={(e) => setNodeForm((old) => ({ ...old, recurrence_interval_count: e.target.value }))} /></div>
              <div className="field"><label>تاريخ الاستحقاق المرجعي<InlineHelp text="هذا هو الموعد الذي يبني عليه النظام سلسلة الاستحقاقات القادمة. تغيير هذا التاريخ يغيّر مواعيد الدورات التالية." /></label><input type="date" dir="ltr" value={nodeForm.anchor_date} onChange={(e) => setNodeForm((old) => ({ ...old, anchor_date: e.target.value }))} /></div>
              <div className="field"><label>نهاية السريان (اختياري)<InlineHelp text="آخر تاريخ تسري فيه هذه الجدولة. بعده لا يفترض إنشاء استحقاقات جديدة من نفس الجدول." /></label><input type="date" dir="ltr" value={nodeForm.schedule_valid_to || ''} onChange={(e) => setNodeForm((old) => ({ ...old, schedule_valid_to: e.target.value }))} /><small className="muted">اتركها فارغة إذا كان الالتزام مستمرًا بلا نهاية محددة.</small></div>
              <div className="field"><label>بداية الحجز<InlineHelp text="تحدد متى يبدأ النظام تكوين المخصص قبل موعد السداد؛ لا تغيّر موعد الاستحقاق نفسه." /></label><select value={nodeForm.accrual_start_rule} onChange={(e) => setNodeForm((old) => ({ ...old, accrual_start_rule: e.target.value }))}><option value="from_period_start">من بداية دورة الاستحقاق</option><option value="immediately_after_previous_due">بعد الاستحقاق السابق مباشرة</option><option value="fixed_months_before_due">قبل الاستحقاق بعدد أشهر</option></select></div>
              {nodeForm.accrual_start_rule === 'fixed_months_before_due' && <div className="field"><label>عدد الأشهر<InlineHelp text="كلما زاد هذا الرقم بدأ تكوين المخصص أبكر قبل تاريخ الاستحقاق." /></label><input type="number" min="1" value={nodeForm.accrual_lead_months} onChange={(e) => setNodeForm((old) => ({ ...old, accrual_lead_months: e.target.value }))} /></div>}
            </div></Section>
          </>}

          <div className="field"><label>ملاحظات</label><textarea value={nodeForm.notes} onChange={(e) => setNodeForm((old) => ({ ...old, notes: e.target.value }))} /></div>
          <Toolbar><button className="btn" type="submit" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ'}</button><button className="btn ghost" type="button" onClick={closeNodeEditor}>إلغاء</button><small className="muted">Esc للرجوع لنقطة البداية</small></Toolbar>
        </form>
      </EntrySurface>
    </div>;
  }

  function renderCatalogNode(node, depth = 0) {
    const children = catalogChildren.get(node.id) || [];
    const rate = node.node_type === 'item' ? effectiveRate(node.id) : null;
    const schedule = node.node_type === 'item' ? effectiveSchedule(node.id) : null;
    const nodeBands = rate ? bandsForRate(rate.id) : [];
    const editorBelongsHere = showNodeEditor && (nodeForm.node_id === node.id || (!nodeForm.node_id && nodeForm.parent_item_id === node.id));
    const addItemId = `budget-node-add-item-${node.id}`;
    const addGroupId = `budget-node-add-group-${node.id}`;
    const editId = `budget-node-edit-${node.id}`;

    return <div key={node.id} style={{ marginInlineStart: depth * 18, borderInlineStart: depth ? '1px solid var(--line, #333)' : 'none', paddingInlineStart: depth ? 10 : 0, marginBottom: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,1fr) minmax(160px,.8fr) minmax(130px,.6fr) auto', gap: 10, alignItems: 'center', padding: '10px 12px', border: '1px solid var(--line, #333)', borderRadius: 8 }}>
        <div><strong>{node.node_type === 'group' ? '▦' : '•'} {node.name}</strong><div className="muted">{node.node_type === 'group' ? 'تصنيف؛ لا يحمل قيمة مستقلة' : OPERATING_BUDGET.calculationLabels[node.calculation_type]}</div></div>
        <div>{node.node_type === 'group' ? `${children.length} عنصر/تصنيف` : budgetRateSummary(node.calculation_type, rate?.params || {}, nodeBands)}</div>
        <div>{node.node_type === 'group' ? '—' : schedule ? `${OPERATING_BUDGET.recurrenceLabels[schedule.recurrence_unit]}${schedule.valid_to ? ` · حتى ${dateAr(schedule.valid_to)}` : ''}` : 'غير مجدول'}</div>
        <Toolbar>
          {canEdit && node.node_type === 'group' && <button id={addItemId} className="btn ghost" onClick={() => startNode('item', node, addItemId)}>+ تفصيل</button>}
          {canEdit && node.node_type === 'group' && <button id={addGroupId} className="btn ghost" onClick={() => startNode('group', node, addGroupId)}>+ تصنيف</button>}
          {canEdit && <button id={editId} className="btn ghost" onClick={() => configureNode(node, editId)}>إعداد</button>}
        </Toolbar>
      </div>
      {editorBelongsHere && <div style={{ marginTop: 10 }}>{renderNodeEditor()}</div>}
      {children.map((child) => renderCatalogNode(child, depth + 1))}
    </div>;
  }

  if (loading) return <ConstitutionPage><EmptyState title="جارٍ تحميل ميزانية التشغيل" description="يتم تحميل الالتزامات والمخصصات والتوقعات." /></ConstitutionPage>;
  if (!canView) return <ConstitutionPage><Notice tone="error">لا تملك صلاحية عرض ميزانية وتشغيل الشركة.</Notice></ConstitutionPage>;

  const rootGroups = (catalogChildren.get('__root__') || []).filter((n) => n.node_type === 'group');
  const rootEditorOpen = showNodeEditor && !nodeForm.node_id && !nodeForm.parent_item_id && nodeForm.node_type === 'group';
  const rootAddId = 'budget-root-add-group';

  return <ConstitutionPage>
    <PageHeader
      eyebrow="المالية"
      title="ميزانية وتشغيل الشركة"
      description="خطة الشهر، الاستحقاقات، المتابعة والتنفيذ المالي."
      actions={<><input type="month" dir="ltr" value={month} onChange={(e) => setMonth(e.target.value)} /><a className="btn ghost" href={`/print/operating-budget?month=${month}`} target="_blank" rel="noreferrer">طباعة التقرير كاملًا</a><button className="btn ghost" onClick={loadAll} disabled={busy}>تحديث</button></>}
    />

    {err && <Notice tone="error">{err}</Notice>}
    {msg && <Notice tone="success">{msg}</Notice>}
    <AttentionArea sourceTable="budget_period_lines" title="متابعة" refreshToken={attentionRefresh} />

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

      <Section title="كشف الشهر" description="حدد ما تريد العمل عليه. التحديد لا ينشئ حركة مالية من تلقاء نفسه.">
        <WorkSelectionDock count={selectedStatementIds.size} summary={`قيمة المحدد ${amountLabel(selectedStatementTotal)}`} onClear={()=>setSelectedStatementIds(new Set())}>
          <button className="btn ghost" type="button" onClick={addSelectedToAttention} disabled={busy}>إضافة للمتابعة</button>
          <ProgramAction
            className="btn ghost"
            selectionCount={selectedStatementIds.size}
            action={{key:'operating-budget.print-selected',label:'طباعة المحدد',kind:WORK_ACTION_KIND.PRINT,actionScope:WORK_ACTION_SCOPE.SELECTION,consequence:WORK_ACTION_CONSEQUENCE.SAFE}}
            onClick={printSelectedStatement}
          >طباعة المحدد</ProgramAction>
        </WorkSelectionDock>
        {rootGroups.map((group) => renderReportGroup(group))}
        {!statement.length && <EmptyState title="لا توجد أوراق حسابية لهذا الشهر" description="أضف أو جدْول التفاصيل من إعداد الميزانية." />}
      </Section>

      <DisclosureSection title="رصيد الشهر" description={period.opening_bank_balance == null ? 'غير مسجل' : amountLabel(period.opening_bank_balance)} defaultOpen={period.opening_bank_balance == null}>
        <form onSubmit={saveOpeningBalance} style={{ padding: 10 }}><div className="form-grid"><div className="field"><label>الرصيد (ريال)<InlineHelp text="الرصيد الفعلي المتاح في بداية الشهر. يستخدمه النظام لحساب المتاح الحر والعجز أو الفائض المتوقع؛ لا ينشئ حركة خزينة." /></label><input type="number" step="0.01" dir="ltr" value={openingBalance} disabled={!canMutatePeriod} onChange={(e) => setOpeningBalance(e.target.value)} /></div><div className="field"><label>أدنى رصيد حر متوقع</label><strong>{summary.min_expected_free_balance == null ? '—' : amountLabel(summary.min_expected_free_balance)}</strong></div></div>{canMutatePeriod && <Toolbar><button className="btn" type="submit">حفظ الرصيد</button></Toolbar>}</form>
      </DisclosureSection>
    </>}

    <DisclosureSection title="التوقع" description={`${forecastMonths} أشهر`}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}><select value={forecastMonths} onChange={(e) => setForecastMonths(Number(e.target.value))}><option value={3}>3 أشهر</option><option value={6}>6 أشهر</option><option value={12}>12 شهرًا</option></select></div>
      <TableFrame><table><thead><tr><th>الشهر</th><th>استحقاقات</th><th>مخصص مطلوب</th><th>إجمالي الخطة</th></tr></thead><tbody>{forecast.map((row) => <tr key={row.period_start}><td>{monthLabelAr(row.period_start)}</td><td>{amountLabel(row.expected_due)}</td><td>{amountLabel(row.required_reserve)}</td><td><strong>{amountLabel(row.planned_total)}</strong></td></tr>)}</tbody></table></TableFrame>
    </DisclosureSection>

    <DisclosureSection title="إعداد الميزانية" description="التصنيفات والحساب والجدولة" defaultOpen={showNodeEditor}>
      {canEdit ? <Toolbar><button id={rootAddId} className="btn" onClick={() => startNode('group', null, rootAddId)}>+ تصنيف رئيسي</button></Toolbar> : null}
      {rootEditorOpen && <div style={{ marginBottom: 10 }}>{renderNodeEditor()}</div>}
      {rootGroups.map((node) => renderCatalogNode(node))}
    </DisclosureSection>
  </ConstitutionPage>;
}
