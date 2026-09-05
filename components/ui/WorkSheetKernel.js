'use client';

import { forwardRef } from 'react';
import { uiSlot } from '@/lib/ui-skin-contract';

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
 * الجلد المرئي يتعامل فقط مع data-ui-slot والعقد الدلالي، لذلك يمكن استبداله
 * دون إعادة بناء هندسة الصفحة أو منطق الأعمال.
 */
export function WorkSheet({ children, className = '', ...props }) {
  return (
    <div className={cx(className)} data-work-sheet="true" data-ui-slot={uiSlot('sheet')} {...props}>
      {children}
    </div>
  );
}

export function WorkSheetHeader({ children, className = '', ...props }) {
  return (
    <header className={cx(className)} data-work-header="true" data-ui-slot={uiSlot('header')} {...props}>
      {children}
    </header>
  );
}

export const WorkSection = forwardRef(function WorkSection({ children, className = '', ...props }, ref) {
  return (
    <section ref={ref} className={cx(className)} data-work-section="true" data-ui-slot={uiSlot('section')} {...props}>
      {children}
    </section>
  );
});

export function WorkLedger({ children, className = '', ...props }) {
  return (
    <div className={cx(className)} data-work-ledger="true" data-ui-slot={uiSlot('ledger')} {...props}>
      {children}
    </div>
  );
}

export function WorkDock({ children, className = '', ...props }) {
  return (
    <footer className={cx(className)} data-work-dock="true" data-ui-slot={uiSlot('dock')} {...props}>
      {children}
    </footer>
  );
}

export function WorkSelectionDock({ count = 0, summary = null, actions = null, onClear, className = '', children = null }) {
  if (!count) return null;
  return (
    <WorkDock
      className={cx(className)}
      data-selection-dock="true"
      data-selection-count={count}
      data-ui-slot={uiSlot('selectionDock')}
    >
      <strong data-ui-part="selection-count">{count} محدد</strong>
      {summary ? <span data-selection-summary="true" data-ui-part="selection-summary">{summary}</span> : null}
      <span data-ui-part="selection-spacer" aria-hidden="true" />
      <div data-selection-actions="true" data-ui-part="selection-actions">
        {children || actions}
        {onClear ? <button type="button" onClick={onClear} data-ui-control="clear-selection">إلغاء التحديد</button> : null}
      </div>
    </WorkDock>
  );
}
