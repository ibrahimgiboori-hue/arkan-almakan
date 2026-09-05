'use client';

import { useEffect, useRef } from 'react';
import styles from './constitution-ui.module.css';
import { useWorkSurface } from './WorkSurfaceRuntime';
import { uiSlot } from '@/lib/ui-skin-contract';
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
      data-ui-slot={uiSlot('page')}
      data-page-surface="true"
      data-page-mode={resolvedMode}
      data-page-portal={surface?.portalKey || undefined}
      data-page-tool={surface?.toolKey || undefined}
    >
      {children}
    </WorkSheet>
  );
}

export function PageHeader({ title, description, actions, eyebrow, children }) {
  const headerActions = actions || children;
  return (
    <WorkSheetHeader className={styles.pageHeader} data-page-header="true" data-ui-slot={uiSlot('pageHeader')} data-work-header-density="compact">
      <div className={styles.pageHeaderCopy} data-ui-part="header-copy">
        {eyebrow ? <div className={styles.eyebrow} data-ui-part="eyebrow">{eyebrow}</div> : null}
        <h1 data-ui-part="title">{title}</h1>
        {description ? <p data-ui-part="description">{description}</p> : null}
      </div>
      {headerActions ? <div className={styles.actions} data-ui-part="actions" data-entry-ignore="true" data-action-placement="compact-header">{headerActions}</div> : null}
    </WorkSheetHeader>
  );
}

export function Section({ title, description, actions, children, className = '', boundary = false }) {
  return (
    <WorkSection
      className={cx(styles.section, boundary && styles.sectionBoundary, className)}
      data-data-surface="true"
      data-ui-slot={uiSlot('section')}
      data-work-section-style={boundary ? 'boundary' : 'flow'}
    >
      {(title || description || actions) ? (
        <header className={styles.sectionHeader} data-ui-slot={uiSlot('sectionHeader')}>
          <div data-ui-part="section-copy">
            {title ? <h2 data-section-title="true" data-ui-part="title">{title}</h2> : null}
            {description ? <p data-ui-part="description">{description}</p> : null}
          </div>
          {actions ? <div className={styles.actions} data-ui-part="actions" data-entry-ignore="true" data-action-placement="at-origin">{actions}</div> : null}
        </header>
      ) : null}
      <div className={styles.sectionBody} data-ui-slot={uiSlot('sectionBody')}>{children}</div>
    </WorkSection>
  );
}

export function SummaryStrip({ items = [], label = 'الملخص' }) {
  if (!items.length) return null;
  return (
    <div className={styles.summaryStrip} aria-label={label} data-work-summary="true" data-ui-slot={uiSlot('summary')}>
      {items.map((item, index) => (
        <div className={styles.summaryItem} key={item.key || item.label || index} data-ui-part="summary-item">
          <strong data-ui-part="value">{item.value}</strong>
          <span data-ui-part="label">{item.label}</span>
          {item.note ? <small data-ui-part="note">{item.note}</small> : null}
        </div>
      ))}
    </div>
  );
}

export function FilterSurface({ children }) {
  return <div className={styles.filterSurface} data-entry-ignore="true" data-work-filters="true" data-ui-slot={uiSlot('filters')}>{children}</div>;
}

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
      data-ui-slot={uiSlot('entry')}
      data-work-section-style="boundary"
      aria-label={title || 'منطقة الإدخال'}
      style={{ scrollMarginTop: '112px' }}
    >
      {(title || description || actions) ? (
        <header className={styles.sectionHeader} data-ui-slot={uiSlot('sectionHeader')}>
          <div data-ui-part="section-copy">
            {title ? <h2 data-section-title="true" data-ui-part="title">{title}</h2> : null}
            {description ? <p data-ui-part="description">{description}</p> : null}
          </div>
          {actions ? <div className={styles.actions} data-ui-part="actions" data-action-placement="at-origin">{actions}</div> : null}
        </header>
      ) : null}
      <div className={styles.sectionBody} data-ui-slot={uiSlot('sectionBody')}>{children}</div>
    </WorkSection>
  );
}

export function Notice({ children, tone = 'neutral', actions }) {
  return (
    <div className={cx(styles.notice, styles[`notice_${tone}`])} role={tone === 'error' ? 'alert' : undefined} data-inline-feedback="true" data-ui-slot={uiSlot('notice')} data-ui-tone={tone}>
      <div data-ui-part="message">{children}</div>
      {actions ? <div className={styles.actions} data-ui-part="actions">{actions}</div> : null}
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
      data-ui-role="status"
      data-ui-tone={tone}
    >
      {children}
    </span>
  );
}

export function Toolbar({ children, className = '' }) {
  return <div className={cx(styles.toolbar, className)} data-entry-ignore="true" data-work-toolbar="true" data-ui-slot={uiSlot('toolbar')}>{children}</div>;
}

export function ContextActions({ primary, secondary = [], label = 'المزيد', className = '' }) {
  return (
    <div className={cx(styles.contextActions, className)} data-context-actions="true" data-entry-ignore="true" data-ui-slot={uiSlot('contextActions')}>
      {primary ? <div className={styles.primaryAction} data-ui-part="primary-action" data-action-placement="at-origin">{primary}</div> : null}
      {secondary.length ? (
        <details className={styles.actionMenu} data-ui-part="secondary-actions" data-action-placement="secondary-overflow">
          <summary aria-label={label} title={label}>⋯</summary>
          <div className={styles.actionMenuBody} data-ui-part="menu-body">
            {secondary.map((action, index) => <div key={action?.key || index}>{action?.node || action}</div>)}
          </div>
        </details>
      ) : null}
    </div>
  );
}

export function ViewOptions({ children, label = 'طريقة العرض' }) {
  return (
    <details className={styles.viewOptions} data-view-options="true" data-entry-ignore="true" data-ui-role="view-options">
      <summary>{label}</summary>
      <div className={styles.viewOptionsBody}>{children}</div>
    </details>
  );
}

export function RecordList({ children, className = '', label }) {
  return <div className={cx(styles.recordList, className)} role="list" aria-label={label} data-record-list="true" data-ui-slot={uiSlot('recordList')}>{children}</div>;
}

export function RecordRow({ children, onOpen, href, className = '', actions, selected = false, ariaLabel }) {
  const Tag = href ? 'a' : onOpen ? 'button' : 'div';
  const interactiveProps = href
    ? { href }
    : onOpen
      ? { type:'button', onClick:onOpen }
      : {};
  return (
    <div className={cx(styles.recordRowShell, selected && styles.recordRowSelected, className)} role="listitem" data-record-row="true" data-record-selected={selected ? 'true' : 'false'} data-ui-slot={uiSlot('recordRow')}>
      <Tag className={styles.recordRowMain} aria-label={ariaLabel} data-ui-part="record-primary" {...interactiveProps}>{children}</Tag>
      {actions ? <div className={styles.recordRowActions} data-record-actions="true" data-ui-part="record-actions">{actions}</div> : null}
    </div>
  );
}

export function RecordSummary({ kicker, title, badge, meta = [], metrics = [], progress = null, note }) {
  const safeProgress = progress == null ? null : Math.max(0, Math.min(100, Number(progress) || 0));
  return (
    <div className={styles.recordSummary} data-record-summary="true" data-ui-slot={uiSlot('recordSummary')}>
      <div className={styles.recordIdentity} data-ui-part="identity">
        <div className={styles.recordTitleLine} data-ui-part="title-line">
          <span className={styles.recordTitle} data-ui-part="title">{title}</span>
          {badge ? <span className={styles.recordBadge} data-ui-part="badge">{badge}</span> : null}
        </div>
        {kicker ? <span className={styles.recordKicker} data-ui-part="kicker">{kicker}</span> : null}
        {meta.length ? <div className={styles.recordMeta} data-ui-part="meta">{meta.filter(Boolean).map((value,index)=><span key={`${value}-${index}`}>{value}</span>)}</div> : null}
        {note ? <small className={styles.recordNote} data-ui-part="note">{note}</small> : null}
      </div>
      {(metrics.length || safeProgress != null) ? (
        <div className={styles.recordMeasures} data-ui-part="measures">
          {metrics.filter((item)=>item && item.value !== undefined).map((item,index)=><span key={item.key || item.label || index}><small>{item.label}</small><strong>{item.value}</strong></span>)}
          {safeProgress != null ? <span className={styles.recordProgress} data-ui-part="progress"><small>الإنجاز</small><strong>{safeProgress.toFixed(0)}%</strong><i aria-hidden="true"><b style={{width:`${safeProgress}%`}} /></i></span> : null}
        </div>
      ) : null}
    </div>
  );
}

export function TableFrame({ children, className = '' }) {
  return (
    <WorkLedger className={cx(styles.tableFrame, className)} data-table-surface="true" data-ui-slot={uiSlot('table')} data-ledger-behavior="semantic-grid">
      {children}
    </WorkLedger>
  );
}

export function ActionDock({ actions, status, children, className = '' }) {
  const dockActions = actions || children;
  return (
    <WorkDock className={className} data-entry-ignore="true">
      <div data-work-dock-actions="true" data-ui-part="dock-actions">{dockActions}</div>
      {status ? <div data-work-dock-status="true" data-ui-part="dock-status">{status}</div> : null}
    </WorkDock>
  );
}

export function EmptyState({ title = 'لا توجد بيانات', description, actions }) {
  return (
    <div className={styles.empty} data-empty-state="true" data-ui-slot={uiSlot('empty')}>
      <strong data-ui-part="title">{title}</strong>
      {description ? <span data-ui-part="description">{description}</span> : null}
      {actions ? <div className={styles.actions} data-ui-part="actions">{actions}</div> : null}
    </div>
  );
}
