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
    employee_based_contribution: 'مساهمة حسب الموظفين',
    subscription_plus_usage: 'اشتراك + استخدام',
    composite_formula: 'معادلة مركبة',
  }),
  recurrenceLabels: Object.freeze({
    month: 'شهري',
    quarter: 'ربع سنوي',
    half_year: 'نصف سنوي',
    year: 'سنوي',
    one_time: 'مرة واحدة',
  }),
});

export function budgetNodeCanCarryValue(nodeType) {
  return OPERATING_BUDGET.nodePolicy[nodeType]?.carriesOwnValue === true;
}

export function budgetNodeMayHaveChildren(nodeType) {
  return OPERATING_BUDGET.nodePolicy[nodeType]?.mayHaveChildren === true;
}

export function budgetInputFields(calculationType) {
  switch (calculationType) {
    case 'quantity_x_unit_price':
      return [
        { key: 'quantity', label: 'الكمية' },
        { key: 'unit_price', label: 'سعر الوحدة' },
      ];
    case 'percentage_of_base':
      return [
        { key: 'base_amount', label: 'المبلغ الأساس' },
        { key: 'percentage', label: 'النسبة %' },
      ];
    case 'tiered':
      return [{ key: 'count', label: 'العدد الخاضع للشريحة' }];
    case 'external_forecast_actual':
      return [];
    default:
      return [{ key: 'amount', label: 'القيمة المتوقعة' }];
  }
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
