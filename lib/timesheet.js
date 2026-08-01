export const ATTEND = {
  full:    { ar:'يوم كامل',      short:'ك', cls:'a-full' },
  half:    { ar:'نصف يوم',       short:'½', cls:'a-half' },
  stopped: { ar:'حاضر — عمل متوقف', short:'ت', cls:'a-stop' },
  leave:   { ar:'إجازة',         short:'ج', cls:'a-leave' },
  absent:  { ar:'غياب',          short:'−', cls:'a-abs' },
};
export const ATTEND_CYCLE = ['full','half','stopped','absent','leave'];

export const CLASS_AR = { worker:'عامل', technician:'صنايعي', foreman:'مقدّم' };
export const TRADES = ['بنّاء','مليّس','نجار','حداد','كهربائي','سبّاك',
                       'دهّان','بلاط','عازل','مساعد','سائق','أخرى'];
export const BASIS_AR = { daily:'باليومية', salary:'بالراتب', piecework:'بالمقطوعية' };
export const DAY_EXPENSE_CATS = ['ترحيل','وجبات','سكن','آليات','عدد وأدوات','أخرى'];

export const dayName = (d) => ['الأحد','الإثنين','الثلاثاء','الأربعاء',
  'الخميس','الجمعة','السبت'][new Date(d).getDay()];
