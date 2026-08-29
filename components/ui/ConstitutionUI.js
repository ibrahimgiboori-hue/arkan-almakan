'use client';

import { useEffect, useRef } from 'react';
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

export function ConstitutionPage({ children, className = '', mode = 'notebook' }) {
  return (
    <WorkSheet
      className={cx(styles.page, className)}
      data-ui-constitution="native"
      data-page-surface="true"
      data-page-mode={mode}
    >
      {children}
    </WorkSheet>
  );
}

export function PageHeader({ title, description, actions, eyebrow, children }) {
  const headerActions = actions || children;
  return (
    <WorkSheetHeader className={styles.pageHeader} data-page-header="true" data-work-header-density="compact">
      <div className={styles.pageHeaderCopy}>
        {eyebrow ? <div className={styles.eyebrow}>{eyebrow}</div> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {headerActions ? <div className={styles.actions} data-entry-ignore="true" data-action-placement="compact-header">{headerActions}</div> : null}
    </WorkSheetHeader>
  );
}

/*
 * القسم في الدفتر ليس Card افتراضيًا. boundary=true فقط عندما تكون هناك حدود
 * عمل حقيقية: إدخال حساس، مقارنة مستقلة، أو منطقة تحتاج فصلًا بصريًا صريحًا.
 */
export function Section({ title, description, actions, children, className = '', boundary = false }) {
  return (
    <WorkSection
      className={cx(styles.section, boundary && styles.sectionBoundary, className)}
      data-data-surface="true"
      data-work-section-style={boundary ? 'boundary' : 'flow'}
    >
      {(title || description || actions) ? (
        <header className={styles.sectionHeader}>
          <div>
            {title ? <h2 data-section-title="true">{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className={styles.actions} data-entry-ignore="true" data-action-placement="at-origin">{actions}</div> : null}
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

/* مساحة إدخال داخل نفس الورقة، وليست شاشة أو Shell موازية. */
export function EntrySurface({ title, description, actions, children, className = '', focusOnOpen = true }) {
  const surfaceRef = useRef(null);

  useEffect(() => {
    if (!focusOnOpen || !surfaceRef.current || typeof window === 'undefined') return undefined;
    const frame = window.requestAnimationFrame(() => {
      const node = surfaceRef.current;
      if (!node) return;
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      node.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start', inline: 'nearest' });
      const firstField = node.querySelector(
        '[autofocus], input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
      );
      if (firstField && typeof firstField.focus === 'function') {
        try { firstField.focus({ preventScroll: true }); } catch { firstField.focus(); }
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusOnOpen]);

  return (
    <WorkSection
      ref={surfaceRef}
      className={cx(styles.section, styles.sectionBoundary, styles.entrySurface, className)}
      data-entry-surface="true"
      data-entry-auto-focus={focusOnOpen ? 'true' : 'false'}
      data-data-surface="true"
      data-work-section-style="boundary"
      aria-label={title || 'منطقة الإدخال'}
      style={{ scrollMarginTop: '112px' }}
    >
      {(title || description || actions) ? (
        <header className={styles.sectionHeader}>
          <div>
            {title ? <h2 data-section-title="true">{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className={styles.actions} data-action-placement="at-origin">{actions}</div> : null}
        </header>
      ) : null}
      <div className={styles.sectionBody}>{children}</div>
    </WorkSection>
  );
}

export function Notice({ children, tone = 'neutral', actions }) {
  return (
    <div className={cx(styles.notice, styles[`notice_${tone}`])} role={tone === 'error' ? 'alert' : undefined} data-inline-feedback="true">
      <div>{children}</div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}

export function InlineStatus({ children, tone = 'neutral', live = false }) {
  if (!children) return null;
  return (
    <span
      className={cx(styles.inlineStatus, styles[`inlineStatus_${tone}`])}
      role={tone === 'error' ? 'alert' : undefined}
      aria-live={live ? 'polite' : undefined}
      data-work-inline-status="true"
    >
      {children}
    </span>
  );
}

export function Toolbar({ children, className = '' }) {
  return <div className={cx(styles.toolbar, className)} data-entry-ignore="true" data-work-toolbar="true">{children}</div>;
}

/* الإجراء الأول قريب من موضع العمل؛ البقية في قائمة ثانوية هادئة. */
export function ContextActions({ primary, secondary = [], label = 'المزيد', className = '' }) {
  return (
    <div className={cx(styles.contextActions, className)} data-context-actions="true" data-entry-ignore="true">
      {primary ? <div className={styles.primaryAction} data-action-placement="at-origin">{primary}</div> : null}
      {secondary.length ? (
        <details className={styles.actionMenu} data-action-placement="secondary-overflow">
          <summary aria-label={label} title={label}>⋯</summary>
          <div className={styles.actionMenuBody}>
            {secondary.map((action, index) => <div key={action?.key || index}>{action?.node || action}</div>)}
          </div>
        </details>
      ) : null}
    </div>
  );
}

export function ViewOptions({ children, label = 'طريقة العرض' }) {
  return (
    <details className={styles.viewOptions} data-view-options="true" data-entry-ignore="true">
      <summary>{label}</summary>
      <div className={styles.viewOptionsBody}>{children}</div>
    </details>
  );
}

export function RecordList({ children, className = '', label }) {
  return <div className={cx(styles.recordList, className)} role="list" aria-label={label} data-record-list="true">{children}</div>;
}

export function RecordRow({ children, onOpen, href, className = '', actions, selected = false, ariaLabel }) {
  const Tag = href ? 'a' : onOpen ? 'button' : 'div';
  const interactiveProps = href
    ? { href }
    : onOpen
      ? { type:'button', onClick:onOpen }
      : {};
  return (
    <div className={cx(styles.recordRowShell, selected && styles.recordRowSelected, className)} role="listitem" data-record-row="true">
      <Tag className={styles.recordRowMain} aria-label={ariaLabel} {...interactiveProps}>{children}</Tag>
      {actions ? <div className={styles.recordRowActions} data-record-actions="true">{actions}</div> : null}
    </div>
  );
}

export function TableFrame({ children, className = '' }) {
  return (
    <WorkLedger className={cx(styles.tableFrame, className)} data-table-surface="true" data-ledger-behavior="semantic-grid">
      {children}
    </WorkLedger>
  );
}

/* أوامر تخص الورقة كلها فقط؛ الإجراءات المحلية تبقى عند موضع العمل. */
export function ActionDock({ actions, status, children, className = '' }) {
  const dockActions = actions || children;
  return (
    <WorkDock className={className} data-entry-ignore="true">
      <div data-work-dock-actions="true">{dockActions}</div>
      {status ? <div data-work-dock-status="true">{status}</div> : null}
    </WorkDock>
  );
}

export function EmptyState({ title = 'لا توجد بيانات', description, actions }) {
  return (
    <div className={styles.empty} data-empty-state="true">
      <strong>{title}</strong>
      {description ? <span>{description}</span> : null}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
