'use client';

import styles from './constitution-ui.module.css';
import {
  WorkSheet,
  WorkSheetHeader,
  WorkSection,
  WorkLedger,
  WorkDock,
} from './WorkSheetKernel';

function cx(...values) {
  return values.filter(Boolean).join(' ');
}

export function ConstitutionPage({ children, className = '' }) {
  return (
    <WorkSheet
      className={cx(styles.page, className)}
      data-ui-constitution="native"
      data-page-surface="true"
    >
      {children}
    </WorkSheet>
  );
}

export function PageHeader({ title, description, actions, eyebrow, children }) {
  const headerActions = actions || children;
  return (
    <WorkSheetHeader className={styles.pageHeader} data-page-header="true">
      <div className={styles.pageHeaderCopy}>
        {eyebrow ? <div className={styles.eyebrow}>{eyebrow}</div> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {headerActions ? <div className={styles.actions} data-entry-ignore="true">{headerActions}</div> : null}
    </WorkSheetHeader>
  );
}

export function Section({ title, description, actions, children, className = '' }) {
  return (
    <WorkSection className={cx(styles.section, className)} data-data-surface="true">
      {(title || description || actions) ? (
        <header className={styles.sectionHeader}>
          <div>
            {title ? <h2 data-section-title="true">{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className={styles.actions} data-entry-ignore="true">{actions}</div> : null}
        </header>
      ) : null}
      <div className={styles.sectionBody}>{children}</div>
    </WorkSection>
  );
}

export function SummaryStrip({ items = [], label = 'الملخص' }) {
  if (!items.length) return null;
  return (
    <div className={styles.summaryStrip} aria-label={label} data-work-summary="true">
      {items.map((item, index) => (
        <div className={styles.summaryItem} key={item.key || item.label || index}>
          <strong>{item.value}</strong>
          <span>{item.label}</span>
          {item.note ? <small>{item.note}</small> : null}
        </div>
      ))}
    </div>
  );
}

export function FilterSurface({ children }) {
  return <div className={styles.filterSurface} data-entry-ignore="true" data-work-filters="true">{children}</div>;
}

/* مساحة إدخال صريحة داخل نفس ورقة العمل، وليست تخطيطًا موازيًا. */
export function EntrySurface({ title, description, actions, children, className = '' }) {
  return (
    <WorkSection
      className={cx(styles.section, styles.entrySurface, className)}
      data-entry-surface="true"
      data-data-surface="true"
    >
      {(title || description || actions) ? (
        <header className={styles.sectionHeader}>
          <div>
            {title ? <h2 data-section-title="true">{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </header>
      ) : null}
      <div className={styles.sectionBody}>{children}</div>
    </WorkSection>
  );
}

export function Notice({ children, tone = 'neutral', actions }) {
  return (
    <div className={cx(styles.notice, styles[`notice_${tone}`])} role={tone === 'error' ? 'alert' : undefined}>
      <div>{children}</div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}

export function Toolbar({ children, className = '' }) {
  return <div className={cx(styles.toolbar, className)} data-entry-ignore="true" data-work-toolbar="true">{children}</div>;
}

export function TableFrame({ children, className = '' }) {
  return (
    <WorkLedger className={cx(styles.tableFrame, className)} data-table-surface="true">
      {children}
    </WorkLedger>
  );
}

/*
 * الشريط السفلي القياسي للصفحات التشغيلية. لا يُستخدم لكل Toolbar؛ فقط للأوامر
 * التي تخص الورقة كلها: حفظ/إضافة/إعادة تحميل/حالة السجل، مثل دفتر المصروفات.
 */
export function ActionDock({ actions, status, children, className = '' }) {
  const dockActions = actions || children;
  return (
    <WorkDock className={className} data-entry-ignore="true">
      <div data-work-dock-actions="true">{dockActions}</div>
      {status ? <div data-work-dock-status="true">{status}</div> : null}
    </WorkDock>
  );
}

export function EmptyState({ title = 'لا توجد بيانات', description }) {
  return (
    <div className={styles.empty}>
      <strong>{title}</strong>
      {description ? <span>{description}</span> : null}
    </div>
  );
}
