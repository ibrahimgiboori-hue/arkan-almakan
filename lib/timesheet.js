import { SYSTEM } from './system-constitution';
import { LABOR_CLASS_AR } from './labor-class-summary.mjs';

// الحالات القديمة تبقى قابلة للقراءة تاريخياً، لكن الإدخال الجديد يلتزم بالدستور: كامل/نصف/غياب فقط.
export const ATTEND = {
  [SYSTEM.attendance.states.full]:   { ar:'يوم كامل', short:'ك', cls:'a-full', factor:SYSTEM.attendance.fullDay },
  [SYSTEM.attendance.states.half]:   { ar:'نصف يوم', short:'½', cls:'a-half', factor:SYSTEM.attendance.halfDay },
  stopped:                           { ar:'حاضر — عمل متوقف', short:'ت', cls:'a-stop', factor:0, legacy:true },
  leave:                             { ar:'إجازة', short:'ج', cls:'a-leave', factor:0, legacy:true },
  [SYSTEM.attendance.states.absent]: { ar:'غياب', short:'−', cls:'a-abs', factor:0 },
};
export const ATTEND_CYCLE = Object.freeze([SYSTEM.attendance.states.full,SYSTEM.attendance.states.half,SYSTEM.attendance.states.absent]);
export const ATTEND_READABLE = Object.freeze(Object.keys(ATTEND));
export const CLASS_AR = LABOR_CLASS_AR;
export const TRADES = ['بنّاء','مليّس','نجار','حداد','كهربائي','سبّاك','دهّان','بلاط','عازل','مساعد','سائق','أخرى'];
export const BASIS_AR = { daily:'باليومية', salary:'بالراتب', piecework:'بالمقطوعية' };
export const DAY_EXPENSE_CATS = ['ترحيل','وجبات','سكن','آليات','عدد وأدوات','أخرى'];
export const dayName = (d) => { if(!d)return'—';const value=/^\d{4}-\d{2}-\d{2}$/.test(String(d))?`${d}T12:00:00+03:00`:d;const x=new Date(value);if(Number.isNaN(x.getTime()))return'—';return new Intl.DateTimeFormat(SYSTEM.locale,{weekday:'long',timeZone:SYSTEM.timezone}).format(x); };
