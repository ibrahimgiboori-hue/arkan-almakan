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
export const CLAIM_AR = {
  draft:'مسودة', submitted:'مُقدَّم للمالك', owner_approved:'اعتمده المالك',
  invoiced:'صدرت الفاتورة', collected:'محصَّل', rejected:'مرفوض',
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
