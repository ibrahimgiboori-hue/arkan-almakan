'use client';

import styles from './portal-hall-interior.module.css';

function cx(...values) {
  return values.filter(Boolean).join(' ');
}

export function PortalHall({ portalKey, children, className = '' }) {
  return (
    <div
      className={cx(styles.hall, className)}
      data-interior-portal-hall="true"
      data-portal-key={portalKey || undefined}
      data-portal-body-role="work-first"
    >
      {children}
    </div>
  );
}

export function PortalLiveZone({ title, description, count, children, className = '' }) {
  return (
    <section
      className={cx(styles.liveZone, className)}
      data-portal-zone="live-operational-work"
      aria-label={title || 'العمل الجاري'}
    >
      <header className={styles.zoneHeader}>
        <div>
          {title ? <h2>{title}</h2> : null}
          {description ? <p>{description}</p> : null}
        </div>
        {count !== undefined && count !== null ? <span className={styles.count}>{count}</span> : null}
      </header>
      <div className={styles.zoneBody}>{children}</div>
    </section>
  );
}

export function PortalRegistry({ title, description, count, open = false, onToggle, children, className = '' }) {
  return (
    <details
      className={cx(styles.registry, className)}
      data-portal-zone="registry-and-history"
      open={open}
      onToggle={onToggle}
    >
      <summary className={styles.registrySummary}>
        <span className={styles.registryCopy}>
          <strong>{title}</strong>
          {description ? <small>{description}</small> : null}
        </span>
        <span className={styles.registryMeta}>
          {count !== undefined && count !== null ? <b>{count}</b> : null}
          <i aria-hidden="true">{open ? '−' : '+'}</i>
        </span>
      </summary>
      <div className={styles.registryBody}>{children}</div>
    </details>
  );
}
