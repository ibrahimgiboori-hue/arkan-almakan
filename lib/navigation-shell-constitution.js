import { portalSectionHref } from './portal-section-constitution';

// دستور الجسد الجديد للملاحة فقط.
// لا يعرّف صلاحيات أو منطق أعمال؛ يقرر فقط كيف تُجمّع الوجهات الموجودة داخل القائمة السياقية.
// لذلك يمكن تطوير تجربة التنقل دون ربطها بهندسة الكتالوج القديمة.
export const SHELL_PORTAL_GROUPS = Object.freeze({
  projects: Object.freeze([
    Object.freeze({ key:'projects', label:'المشاريع', hrefs:Object.freeze(['/dashboard/projects']) }),
    Object.freeze({ key:'parties', label:'الأطراف', hrefs:Object.freeze(['/dashboard/contractors','/dashboard/entities']) }),
    Object.freeze({ key:'commercial', label:'العروض', hrefs:Object.freeze(['/dashboard/quotes']) }),
  ]),

  workforce: Object.freeze([
    Object.freeze({
      key:'employees', label:'الموظفون',
      hrefs:Object.freeze([
        '/dashboard/employees',
        '/dashboard/attendance',
        '/dashboard/leaves',
        '/dashboard/leave-history-import',
        portalSectionHref('workforce','compliance'),
        portalSectionHref('workforce','disciplinary'),
        portalSectionHref('workforce','end-service'),
      ]),
    }),
    Object.freeze({
      key:'recruitment', label:'التوظيف',
      hrefs:Object.freeze([
        '/dashboard/recruitment',
        '/dashboard/recruitment/offers',
        '/dashboard/recruitment/contracts',
        '/dashboard/recruitment/onboarding',
        portalSectionHref('workforce','performance'),
      ]),
    }),
    Object.freeze({ key:'payroll', label:'الرواتب', hrefs:Object.freeze([portalSectionHref('workforce','payroll')]) }),
  ]),

  finance: Object.freeze([
    Object.freeze({
      key:'transactions', label:'المعاملات',
      hrefs:Object.freeze([
        '/dashboard/advances',
        portalSectionHref('finance','cases'),
        portalSectionHref('finance','dues'),
      ]),
    }),
    Object.freeze({
      key:'cash', label:'الخزينة',
      hrefs:Object.freeze([
        portalSectionHref('finance','treasury'),
        portalSectionHref('finance','reconciliation'),
      ]),
    }),
    Object.freeze({
      key:'followup', label:'المتابعة المالية',
      hrefs:Object.freeze([
        portalSectionHref('finance','invoices'),
        portalSectionHref('finance','cashflow'),
        portalSectionHref('finance','payroll'),
        portalSectionHref('finance','vat'),
      ]),
    }),
    Object.freeze({ key:'approvals', label:'الاعتمادات', hrefs:Object.freeze(['/dashboard/approvals']) }),
  ]),

  documents: Object.freeze([
    Object.freeze({
      key:'documents', label:'المستندات',
      hrefs:Object.freeze([
        '/dashboard/documents',
        '/dashboard/register',
        portalSectionHref('documents','review'),
      ]),
    }),
    Object.freeze({ key:'archive', label:'الأرشيف', hrefs:Object.freeze(['/dashboard/archive']) }),
    Object.freeze({ key:'templates', label:'النماذج', hrefs:Object.freeze(['/dashboard/formbuilder']) }),
  ]),

  admin: Object.freeze([
    Object.freeze({
      key:'company', label:'الشركة',
      hrefs:Object.freeze(['/dashboard/board','/dashboard/settings','/dashboard/org-structure']),
    }),
    Object.freeze({ key:'access', label:'المستخدمون والصلاحيات', hrefs:Object.freeze(['/dashboard/system-user']) }),
    Object.freeze({
      key:'governance', label:'النظام والرقابة',
      hrefs:Object.freeze([
        portalSectionHref('admin','procedure-routes'),
        portalSectionHref('admin','workflows'),
        portalSectionHref('admin','audit'),
        portalSectionHref('admin','catalogs'),
      ]),
    }),
    Object.freeze({ key:'safety', label:'النسخ الاحتياطي', hrefs:Object.freeze(['/dashboard/backup']) }),
  ]),
});
