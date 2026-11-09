'use client';

import { projectOperationPeriod } from '@/lib/project-operation-context.mjs';
import styles from './ProjectLedgerFilterBar.module.css';

const PERIODS = [['today', 'اليوم'], ['week', 'آخر 7 أيام'], ['month', 'هذا الشهر'], ['last-month', 'الشهر الماضي']];

/**
 * فلتر أوراق المشروع الموحد: كل ورقة (الحضور، المصروفات، الإنجاز، السلف، العهدة، الحركات)
 * سجل واحد مستمر، والفلترة هي التي تحدد المقاول والفترة وما يظهر من صفوف.
 */
export default function ProjectLedgerFilterBar({ context, contractors = [], showContractor = true, searchPlaceholder = 'بحث…', children }) {
  const { contractorId, from, to, search, setContractorId, setRange, setSearch } = context;
  const active = PERIODS.find(([kind]) => {
    const period = projectOperationPeriod(kind);
    return period && period.from === from && period.to === to;
  })?.[0];
  return (
    <section className={styles.bar} data-ledger-filter="true" aria-label="فلترة الورقة">
      {showContractor && (
        <label className={styles.field}>
          <span>المقاول</span>
          <select value={contractorId} onChange={(event) => setContractorId(event.target.value)}>
            <option value="">كل المقاولين</option>
            {contractors.map((contractor) => <option key={contractor.id} value={contractor.id}>{contractor.operation_alias || contractor.name_ar}</option>)}
          </select>
        </label>
      )}
      <label className={styles.field}><span>من</span><input type="date" value={from} onChange={(event) => setRange(event.target.value, to < event.target.value ? event.target.value : to)} /></label>
      <label className={styles.field}><span>إلى</span><input type="date" value={to} onChange={(event) => setRange(from > event.target.value ? event.target.value : from, event.target.value)} /></label>
      <div className={styles.periods} role="group" aria-label="فترات سريعة">
        {PERIODS.map(([kind, label]) => (
          <button key={kind} type="button" className={active === kind ? styles.on : undefined} aria-pressed={active === kind} onClick={() => { const period = projectOperationPeriod(kind); setRange(period.from, period.to); }}>{label}</button>
        ))}
      </div>
      <label className={`${styles.field} ${styles.search}`}><span>بحث</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={searchPlaceholder} /></label>
      {children ? <div className={styles.extra}>{children}</div> : null}
    </section>
  );
}
