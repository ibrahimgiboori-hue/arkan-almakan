'use client';

import styles from './constitution-ui.module.css';

function cx(...values) {
  return values.filter(Boolean).join(' ');
}

export function ConstitutionPage({ children, className = '' }) {
  return <div className={cx(styles.page, className)} data-ui-constitution="native">{children}</div>;
}

export function PageHeader({ title, description, actions, eyebrow }) {
  return (
    <div className={styles.pageHeader}>
      <div className={styles.pageHeaderCopy}>
        {eyebrow ? <div className={styles.eyebrow}>{eyebrow}</div> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}

export function Section({ title, description, actions, children, className = '' }) {
  return (
    <section className={cx(styles.section, className)}>
      {(title || description || actions) ? (
        <header className={styles.sectionHeader}>
          <div>
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </header>
      ) : null}
      <div className={styles.sectionBody}>{children}</div>
    </section>
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
  return <div className={cx(styles.toolbar, className)}>{children}</div>;
}

export function TableFrame({ children, className = '' }) {
  return <div className={cx(styles.tableFrame, className)}>{children}</div>;
}

export function EmptyState({ title = 'لا توجد بيانات', description }) {
  return (
    <div className={styles.empty}>
      <strong>{title}</strong>
      {description ? <span>{description}</span> : null}
    </div>
  );
}
