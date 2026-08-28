export const OPERATING_BUDGET = Object.freeze({
  route: '/dashboard/operating-budget',
  capability: Object.freeze({
    view: 'finance.operating_budget.view',
    edit: 'finance.operating_budget.edit',
    reopen: 'finance.operating_budget.reopen',
  }),
  nodePolicy: Object.freeze({
    group: Object.freeze({
      label: 'تصنيف تجميعي',
      carriesOwnValue: false,
      valueSource: 'recursive-descendant-leaf-sum',
      mayHaveChildren: true,
    }),
    item: Object.freeze({
      label: 'عنصر حسابي',
      carriesOwnValue: true,
      valueSource: 'calculation-engine',
      mayHaveChildren: false,
      requiresGroupParent: true,
    }),
  }),
  reportingPolicy: Object.freeze({
    calculationSource: 'single-leaf-calculation-tree',
    collapsedView: 'derived-group-total',
    expandedView: 'same-total-with-descendant-detail',
    forbidIndependentGroupAmount: true,
  }),
  groupLabels: Object.freeze({
    office_supplies: 'المستلزمات المكتبية',
    hospitality: 'الضيافة',
    cleaning: 'النظافة والخدمات',
    rent: 'الإيجارات',
    utilities: 'الخدمات والفواتير',
    government_subscriptions: 'الاشتراكات والالتزامات الحكومية',
    payroll: 'الرواتب',
    other: 'أخرى',
  }),
  costBehaviorLabels: Object.freeze({
    fixed_contractual: 'التزام تعاقدي ثابت',
    variable_recurring: 'مصروف متكرر متغير',
    consumable_budget: 'استهلاك تفصيلي',
    government_payroll_linked: 'التزام حكومي مرتبط بالرواتب',
    recurring_subscription: 'اشتراك متجدد',
    payroll_linked: 'مرتبط بمسير الرواتب',
    one_off: 'مرة واحدة',
  }),
  calculationLabels: Object.freeze({
    fixed_amount: 'مبلغ ثابت',
    quantity_x_unit_price: 'كمية × سعر',
    variable_monthly: 'تقدير شهري متغير',
    tiered: 'شرائح',
    percentage_of_base: 'نسبة من أساس',
    manual_actual: 'قيمة فعلية يدوية',
    external_forecast_actual: 'مصدر نظامي تلقائي',
    employee_based_contribution: 'مساهمة على إجمالي الأجور الخاضعة',
    subscription_plus_usage: 'اشتراك + استخدام',
    composite_formula: 'معادلة مركبة آمنة',
  }),
  recurrenceLabels: Object.freeze({
    month: 'شهري',
    quarter: 'ربع سنوي',
    half_year: 'نصف سنوي',
    year: 'سنوي',
    one_time: 'مرة واحدة',
  }),
  componentModeLabels: Object.freeze({
    fixed: 'قيمة ثابتة',
    input_amount: 'قيمة مدخلة كما هي',
    percentage_of_input: 'نسبة من مدخل',
    per_unit: 'عدد استخدام × سعر',
    multiply_inputs: 'مدخل × مدخل',
    input_times_constant: 'مدخل × معامل ثابت',
  }),
  metricBucketLabels: Object.freeze({
    employer_cost: 'حصة المنشأة',
    employee_withheld: 'حصة الموظفين المحجوزة',
    subscription: 'الاشتراك الأساسي',
    usage: 'الاستخدام',
    other: 'أخرى',
  }),
});

const MONEY_FIELD = { kind: 'money', step: '0.01' };
const NUMBER_FIELD = { kind: 'number', step: '0.01' };

export function budgetNodeCanCarryValue(nodeType) {
  return OPERATING_BUDGET.nodePolicy[nodeType]?.carriesOwnValue === true;
}

export function budgetNodeMayHaveChildren(nodeType) {
  return OPERATING_BUDGET.nodePolicy[nodeType]?.mayHaveChildren === true;
}

export function normalizeBudgetInputSchema(schema = []) {
  if (!Array.isArray(schema)) return [];
  return schema
    .filter((field) => field && field.key)
    .map((field) => ({
      key: String(field.key),
      label: String(field.label || field.key),
      kind: field.kind === 'count' ? 'count' : field.kind === 'number' ? 'number' : 'money',
      step: field.step || (field.kind === 'count' ? '1' : '0.01'),
      required: field.required !== false,
      help: field.help || '',
    }));
}

function inferredComponentInputs(params = {}) {
  const found = new Map();
  for (const component of Array.isArray(params.components) ? params.components : []) {
    const keys = [];
    if (component.input_key) keys.push(component.input_key);
    if (component.left_input_key) keys.push(component.left_input_key);
    if (component.right_input_key) keys.push(component.right_input_key);
    for (const key of keys) {
      if (!found.has(key)) found.set(key, {
        key,
        label: component.input_label || component.label || key,
        kind: component.mode === 'per_unit' ? 'count' : 'money',
        step: component.mode === 'per_unit' ? '1' : '0.01',
        required: true,
      });
    }
  }
  return [...found.values()];
}

export function budgetInputFields(calculationType, rateParams = {}) {
  switch (calculationType) {
    case 'quantity_x_unit_price':
      return [
        { key: 'quantity', label: 'الكمية', ...NUMBER_FIELD },
        { key: 'unit_price', label: 'سعر الوحدة', ...MONEY_FIELD },
      ];
    case 'percentage_of_base':
      return [
        { key: 'base_amount', label: 'المبلغ الأساس', ...MONEY_FIELD },
        { key: 'percentage', label: 'النسبة %', ...NUMBER_FIELD },
      ];
    case 'tiered':
      return [{ key: 'count', label: 'العدد الخاضع للشريحة', kind: 'count', step: '1', required: true }];
    case 'employee_based_contribution':
      return normalizeBudgetInputSchema(rateParams.input_schema?.length ? rateParams.input_schema : [
        {
          key: 'contributory_wages',
          label: 'إجمالي الأجور الخاضعة للاشتراك',
          kind: 'money',
          required: true,
          help: 'أدخل إجمالي الفئة فقط؛ لا حاجة لأسماء الموظفين.',
        },
      ]);
    case 'subscription_plus_usage':
    case 'composite_formula': {
      const explicit = normalizeBudgetInputSchema(rateParams.input_schema || []);
      return explicit.length ? explicit : inferredComponentInputs(rateParams);
    }
    case 'external_forecast_actual':
      return [];
    default:
      return [{ key: 'amount', label: 'القيمة المتوقعة', ...MONEY_FIELD }];
  }
}

export function budgetRateFields(calculationType) {
  switch (calculationType) {
    case 'quantity_x_unit_price':
      return [
        { key: 'quantity', label: 'الكمية الافتراضية', ...NUMBER_FIELD },
        { key: 'unit_price', label: 'سعر الوحدة الافتراضي', ...MONEY_FIELD },
      ];
    case 'percentage_of_base':
      return [
        { key: 'base_amount', label: 'الأساس الافتراضي', ...MONEY_FIELD },
        { key: 'percentage', label: 'النسبة %', ...NUMBER_FIELD },
      ];
    case 'fixed_amount':
    case 'variable_monthly':
    case 'manual_actual':
      return [{ key: 'amount', label: 'القيمة الافتراضية', ...MONEY_FIELD }];
    default:
      return [];
  }
}

export function budgetDefaultRateProfile(calculationType) {
  if (calculationType === 'employee_based_contribution') {
    return {
      input_schema: [{
        key: 'contributory_wages',
        label: 'إجمالي الأجور الخاضعة للاشتراك',
        kind: 'money',
        required: true,
        help: 'الإجمالي فقط للفئة ذات قاعدة الاشتراك نفسها.',
      }],
      components: [],
    };
  }
  if (calculationType === 'subscription_plus_usage') return { input_schema: [], components: [] };
  if (calculationType === 'composite_formula') return { input_schema: [], components: [] };
  return {};
}

export function budgetDefaultComponent(calculationType, ordinal = 1) {
  const base = {
    key: `component_${ordinal}`,
    label: '',
    mode: 'fixed',
    bucket: 'other',
    include_in_total: true,
    input_key: '',
    input_label: '',
    left_input_key: '',
    right_input_key: '',
    amount: '',
    rate_percent: '',
    unit_price: '',
    included_units: 0,
    factor: '',
  };
  if (calculationType === 'employee_based_contribution') {
    return {
      ...base,
      label: 'حصة المنشأة',
      mode: 'percentage_of_input',
      bucket: 'employer_cost',
      input_key: 'contributory_wages',
      input_label: 'إجمالي الأجور الخاضعة للاشتراك',
    };
  }
  if (calculationType === 'subscription_plus_usage') {
    return { ...base, label: 'الاشتراك الأساسي', mode: 'fixed', bucket: 'subscription' };
  }
  return base;
}

export function budgetRateSummary(calculationType, params = {}, bands = []) {
  const money = (value) => new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 2 }).format(Number(value || 0));
  if (['fixed_amount', 'variable_monthly', 'manual_actual'].includes(calculationType)) return `${money(params.amount)} ريال`;
  if (calculationType === 'quantity_x_unit_price') return `${Number(params.quantity || 0)} × ${money(params.unit_price)} = ${money(Number(params.quantity || 0) * Number(params.unit_price || 0))} ريال`;
  if (calculationType === 'percentage_of_base') return `${money(params.base_amount)} × ${Number(params.percentage || 0)}%`;
  if (calculationType === 'tiered') return `${bands.length} شريحة`;
  if (calculationType === 'employee_based_contribution') return `${Array.isArray(params.components) ? params.components.length : 0} مكوّن اشتراك`;
  if (calculationType === 'subscription_plus_usage') return `${Array.isArray(params.components) ? params.components.length : 0} مكوّن اشتراك/استخدام`;
  if (calculationType === 'composite_formula') return `${Array.isArray(params.components) ? params.components.length : 0} مكوّن حساب`;
  if (calculationType === 'external_forecast_actual') return 'من النظام';
  return '—';
}

export function monthStart(value) {
  if (!value) return '';
  return /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : String(value).slice(0, 7) + '-01';
}

export function monthKey(value) {
  return String(value || '').slice(0, 7);
}

export function monthLabelAr(value) {
  const raw = monthStart(value);
  if (!raw) return '—';
  const d = new Date(`${raw}T00:00:00+03:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { month: 'long', year: 'numeric', timeZone: 'Asia/Riyadh' }).format(d);
}
