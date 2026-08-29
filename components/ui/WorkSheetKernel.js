'use client';

import { forwardRef } from 'react';

function cx(...values) {
  return values.filter(Boolean).join(' ');
}

/**
 * Work Sheet Kernel
 * -----------------
 * هذا هو العظم الهندسي لصفحات العمل داخل البرنامج.
 * لا يقرر ألوان الصفحة أو منطقها التشغيلي؛ يقرر فقط أين تعيش الصفحة،
 * أين يبدأ رأسها، أين توجد منطقة السجل، وأين تثبت منطقة الإجراءات.
 *
 * أي واجهة نهائية مستقبلًا يمكنها تغيير الجلد، لكن لا تنشئ هندسة صفحة موازية.
 */
export function WorkSheet({ children, className = '', ...props }) {
  return (
    <div className={cx(className)} data-work-sheet="true" {...props}>
      {children}
    </div>
  );
}

export function WorkSheetHeader({ children, className = '', ...props }) {
  return (
    <header className={cx(className)} data-work-header="true" {...props}>
      {children}
    </header>
  );
}

export const WorkSection = forwardRef(function WorkSection({ children, className = '', ...props }, ref) {
  return (
    <section ref={ref} className={cx(className)} data-work-section="true" {...props}>
      {children}
    </section>
  );
});

export function WorkLedger({ children, className = '', ...props }) {
  return (
    <div className={cx(className)} data-work-ledger="true" {...props}>
      {children}
    </div>
  );
}

export function WorkDock({ children, className = '', ...props }) {
  return (
    <footer className={cx(className)} data-work-dock="true" {...props}>
      {children}
    </footer>
  );
}
