'use client';

import { useEffect, useRef } from 'react';
import styles from './constitution-ui.module.css';
import { useWorkSurface } from './WorkSurfaceRuntime';
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

export function ConstitutionPage({ children, className = '', mode }) {
  const surface = useWorkSurface();
  const resolvedMode = surface?.mode || mode || 'notebook';
  return (
    <WorkSheet
      className={cx(styles.page, className)}
      data-ui-constitution="native"
      data-page-surface="true"
      data-page-mode={resolvedMode}
      data-page-portal={surface?.portalKey || undefined}
      data-page-tool={surface?.toolKey || undefined}
      data-work-underwear="transaction-shell-v1"
    >
      {children}
    </WorkSheet>
  );
}

export function PageHeader({ title, description, actions, eyebrow, children }) {
  const headerActions = actions || children;
  return (
    <WorkSheetHeader className={styles.pageHeader} data-page-header="true" data-work-header-density="compact">
      <div className={styles.pageHeaderCopy} data-page-header-copy="true">
        {eyebrow ? <div className={styles.eyebrow} data-page-eyebrow="true">{eyebrow}</div> : null}
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
        <header className={styles.sectionHeader} data-work-section-header="true">
          <div data-work-section-copy="true">
            {title ? <h2 data-section-title="true">{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className={styles.actions} data-entry-ignore="true" data-action-placement="at-origin">{actions}</div> : null}
        </header>
      ) : null}
      <div className={styles.sectionBody} data-work-section-body="true">{children}</div>
    </WorkSection>
  );
}

export function SummaryStrip({ items = [], label = 'الملخص' }) {
  if (!items.length) return null;
  return (
    <div className={styles.summaryStrip} aria-label={label} data-work-summary="true">
      {items.map((item, index) => (
        <div className={styles.summaryItem} data-work-summary-item="true" key={item.key || item.label || index}>
          <strong>{item.value}</strong>
          <span>{item.label}</span>
          {item.note ? <small>{item.note}</small> : null}
        </div>
      ))}
    </div>
  );
}

/* حالة تشغيلية مشتركة؛ اللون معنى، والهندسة يملكها القبطان المركزي. */
export function StatusChip({ children, tone = 'neutral', className = '' }) {
  if (children === null || children === undefined || children === '') return null;
  return <span className={className} data-status-chip="true" data-status-tone={tone}>{children}</span>;
}

export function StatusDot({ tone = 'neutral', className = '' }) {
  return <span className={className} data-status-dot="true" data-status-tone={tone} aria-hidden="true" />;
}

/*
 * الملابس الداخلية الموحدة للمعاملة: الصفحة تحدد معنى الحقل فقط، لا هندسته.
 * mode يفرق الوظيفة دون كسر اللغة البصرية: editable/read-only/generated/linked/calculated.
 */
export function WorkFormGrid({ children, className = '', columns = 12, label }) {
  return (
    <div
      className={cx(styles.workFormGrid, className)}
      data-work-form-grid="true"
      data-work-form-columns={columns}
      aria-label={label}
      style={{ '--work-form-columns':String(columns) }}
    >
      {children}
    </div>
  );
}

export function WorkField({
  label,
  children,
  value,
  hint,
  mode = 'editable',
  span = 3,
  className = '',
  dir,
}) {
  const renderedValue = value === null || value === undefined || value === '' ? '—' : value;
  const body = children || <output className={styles.workFieldValue}>{renderedValue}</output>;
  return (
    <label
      className={cx(styles.workField, className)}
      data-work-field="true"
      data-field-mode={mode}
      data-field-editable={mode === 'editable' ? 'true' : 'false'}
      style={{ '--work-field-span':String(span) }}
      dir={dir}
    >
      {label ? <span className={styles.workFieldLabel}>{label}</span> : null}
      <span className={styles.workFieldControl}>{body}</span>
      {hint ? <small className={styles.workFieldHint}>{hint}</small> : null}
    </label>
  );
}

/* جسم مستندي/تقريري من نفس العائلة؛ لا ينشئ Canvas أو Shell ثانيًا. */
export function DocumentBody({ children, className = '', label = 'محتوى المستند' }) {
  return <div className={cx(styles.documentBody, className)} data-document-body="true" aria-label={label}>{children}</div>;
}

export function DocumentSection({ title, children, actions, className = '' }) {
  return (
    <section className={cx(styles.documentSection, className)} data-document-section="true">
      {(title || actions) ? <header>
        {title ? <h2>{title}</h2> : <span />}
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </header> : null}
      <div className={styles.documentSectionBody}>{children}</div>
    </section>
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
        <header className={styles.sectionHeader} data-work-section-header="true">
          <div data-work-section-copy="true">
            {title ? <h2 data-section-title="true">{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className={styles.actions} data-action-placement="at-origin">{actions}</div> : null}
        </header>
      ) : null}
      <div className={styles.sectionBody} data-work-section-body="true">{children}</div>
    </WorkSection>
  );
}

export function Notice({ children, tone = 'neutral', actions }) {
  return (
    <div className={cx(styles.notice, styles[`notice_${tone}`])} role={tone === 'error' ? 'alert' : undefined} data-inline-feedback="true" data-status-tone={tone}>
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
      data-status-tone={tone}
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
    <div className={cx(styles.recordRowShell, selected && styles.recordRowSelected, className)} role="listitem" data-record-row="true" data-selected={selected ? 'true' : undefined}>
      <Tag className={styles.recordRowMain} data-record-row-main="true" aria-label={ariaLabel} {...interactiveProps}>{children}</Tag>
      {actions ? <div className={styles.recordRowActions} data-record-actions="true">{actions}</div> : null}
    </div>
  );
}

/* تشريح موحّد للسجل: هوية، وصف موجز، حقائق، ومؤشرات. الصفحات تمرر المعنى لا الهندسة. */
export function RecordSummary({ kicker, title, badge, meta = [], metrics = [], progress = null, note }) {
  const safeProgress = progress == null ? null : Math.max(0, Math.min(100, Number(progress) || 0));
  return (
    <div className={styles.recordSummary} data-record-summary="true">
      <div className={styles.recordIdentity} data-record-identity="true">
        <div className={styles.recordTitleLine} data-record-title-line="true">
          <span className={styles.recordTitle} data-record-title="true">{title}</span>
          {badge ? <span className={styles.recordBadge} data-record-badge="true">{badge}</span> : null}
        </div>
        {kicker ? <span className={styles.recordKicker} data-record-kicker="true">{kicker}</span> : null}
        {meta.length ? <div className={styles.recordMeta} data-record-meta="true">{meta.filter(Boolean).map((value,index)=><span key={`${value}-${index}`}>{value}</span>)}</div> : null}
        {note ? <small className={styles.recordNote} data-record-note="true">{note}</small> : null}
      </div>
      {(metrics.length || safeProgress != null) ? (
        <div className={styles.recordMeasures} data-record-measures="true">
          {metrics.filter((item)=>item && item.value !== undefined).map((item,index)=><span key={item.key || item.label || index}><small>{item.label}</small><strong>{item.value}</strong></span>)}
          {safeProgress != null ? <span className={styles.recordProgress} data-record-progress="true"><small>الإنجاز</small><strong>{safeProgress.toFixed(0)}%</strong><i aria-hidden="true"><b style={{width:`${safeProgress}%`}} /></i></span> : null}
        </div>
      ) : null}
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
