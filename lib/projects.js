export const STAGE_AR = {
  opportunity:'فرصة', pricing:'تسعير', submitted:'عرض مقدّم',
  awarded:'ترسية', execution:'تنفيذ', closed:'مقفل', lost:'خسارة',
};
export const STAGE_CLASS = {
  opportunity:'', pricing:'', submitted:'warn', awarded:'warn',
  execution:'ok', closed:'', lost:'bad',
};
export const SCOPE_AR = {
  labor_only:'مصنعية فقط', with_materials:'مصنعية ومواد', supply_only:'توريد فقط',
};
export const MODE_AR = {
  sublet:'إسناد بالباطن', piecework:'مقاول بالمتر',
  daywork:'يوميات', self:'تنفيذ ذاتي', supply_only:'توريد فقط',
};

export const PROJECT_CARE_AR = Object.freeze({
  prep:'قيد الإعداد',
  active:'المشاريع النشطة',
  closing:'قيد الإقفال',
  closed:'المشاريع المغلقة',
});

// الحاضنة نتيجة للحقائق، وليست حقلاً يقرر الحقيقة منفردًا.
// أي إعلان إغلاق مع ذيل مالي/تشغيلي مفتوح يبقى «قيد الإقفال».
export function projectCaretakerState(project, financial = {}, facts = {}) {
  const progress=Number(financial.computed_progress_pct||project?.manual_progress_pct||0);
  const activeAssignments=Number(facts.activeAssignments||0);
  const openClaims=Number(facts.openClaims||0);
  const openSettlements=Number(facts.openSettlements||0);
  const openCustodies=Number(facts.openCustodies||0);

  const hasExecution = project?.stage === 'execution' || progress > 0 || activeAssignments > 0;
  const declaredComplete = project?.stage === 'closed' || project?.status === 'closed' || progress >= 99.999;
  const outstanding =
    Number(financial.pending_collection||0) > 0 ||
    Number(financial.retention_held||0) > 0 ||
    Math.abs(Number(financial.custody_balance||0)) > 0.009 ||
    Number(financial.owner_recovery_pending||0) > 0 ||
    Number(financial.items_without_decision||0) > 0 ||
    Number(financial.unclassified_spend||0) > 0 ||
    openClaims > 0 || openSettlements > 0 || openCustodies > 0;

  if (project?.stage === 'lost') return 'closed';
  if (declaredComplete) return outstanding ? 'closing' : 'closed';
  if (hasExecution) return 'active';
  return 'prep';
}

export const ITEM_EXECUTION_AR = Object.freeze({
  unassigned:'بلا إسناد',
  planned:'جاهز للتنفيذ',
  active:'قيد التنفيذ',
  paused:'متوقف مؤقتًا',
  ended:'منتهٍ',
});
export const ITEM_EXECUTION_CLASS = Object.freeze({
  unassigned:'bad', planned:'warn', active:'ok', paused:'warn', ended:'',
});
export function itemExecutionState(assignment) {
  if (!assignment) return 'unassigned';
  if (assignment.end_date) return 'ended';
  if (!assignment.start_date) return 'planned';
  if (assignment.status === 'paused' || assignment.is_active === false) return 'paused';
  return 'active';
}
export const CLAIM_AR = {
  draft:'مسودة القياس', submitted:'مطالبة مقدمة', owner_approved:'مطالبة معتمدة',
  invoiced:'مفوتر - حالة قديمة', collected:'تم السداد', rejected:'مرفوض',
};
export const CLAIM_CLASS = {
  draft:'', submitted:'warn', owner_approved:'warn',
  invoiced:'warn', collected:'ok', rejected:'bad',
};
export const CHARGE_AR = { owner:'المالك', contractor:'المقاول', arkan:'أركان' };
export const SPEND_CATEGORIES = [
  'شراء مواد','إيجار معدات','نقل مواد','وجبات','تنقلات','سكن',
  'عدد وأدوات','رسوم ووثائق','تأمين دخول موقع','مصروف تشغيلي للمقاول',
  'دفعة لمقاول','أخرى',
];
