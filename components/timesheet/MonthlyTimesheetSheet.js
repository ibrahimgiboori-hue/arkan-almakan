'use client';

import styles from './monthly-timesheet-sheet.module.css';

const WEEKDAY_FULL = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const n = (value) => Number(value || 0);

export function daysInMonth(year, month) {
  return new Date(Number(year), Number(month), 0).getDate();
}

export function monthlyTimesheetMonthLabel(year, month) {
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { month:'long', year:'numeric' })
    .format(new Date(Number(year), Number(month) - 1, 1));
}

function mark(value) {
  const number = n(value);
  if (number === 1) return '✓';
  if (number === 0.5) return '½';
  return '';
}

function dayNo(day) {
  return String(day).padStart(2, '0');
}

export default function MonthlyTimesheetSheet({
  title = 'كشف حضور شهري',
  subtitle = 'MONTHLY TIMESHEET',
  reference = '',
  year,
  month,
  meta = [],
  rows = [],
  identityLabel = 'الصفة / المهنة',
  footerLabel = 'إجمالي أيام العمل لجميع العمال',
  signoffLabels = ['إعداد','مراجعة','اعتماد'],
  className = '',
}) {
  const dayCount = daysInMonth(year, month);
  const days = Array.from({ length:dayCount }, (_, index) => index + 1);
  const totalDays = rows.reduce((sum, row) => sum + n(row.totalDays), 0);

  return <div className={`${styles.document} ${className}`.trim()}>
    <div className={styles.head} data-print-keep-with-next="true">
      <div><h1>{title}</h1><p>{subtitle}</p></div>
      {reference ? <div className={styles.reference}>{reference}</div> : null}
    </div>

    {meta.length ? <div className={styles.meta} data-print-keep-with-next="true">
      {meta.map((item, index) => <div key={`${item.label}-${index}`}><span>{item.label}</span><strong>{item.value || '—'}</strong></div>)}
    </div> : null}

    <table className={styles.table} data-print-flow="repeatable-table">
      <colgroup>
        <col className={styles.indexCol}/>
        <col className={styles.nameCol}/>
        <col className={styles.identityCol}/>
        {days.map((day) => <col key={day} className={styles.dayCol}/>)}
        <col className={styles.totalCol}/>
      </colgroup>
      <thead>
        <tr className={styles.weekdayRow}>
          <th rowSpan={2}>م</th>
          <th rowSpan={2}>اسم العامل</th>
          <th rowSpan={2}>{identityLabel}</th>
          {days.map((day) => {
            const date = new Date(Number(year), Number(month) - 1, day);
            return <th key={day} className={date.getDay() === 5 ? styles.friday : ''}>
              <div className={styles.weekdayCell}><span>{WEEKDAY_FULL[date.getDay()]}</span></div>
            </th>;
          })}
          <th rowSpan={2}>الإجمالي</th>
        </tr>
        <tr className={styles.dateRow}>
          {days.map((day) => {
            const date = new Date(Number(year), Number(month) - 1, day);
            return <th key={day} className={date.getDay() === 5 ? styles.friday : ''}>
              <span className={styles.dateNo}>{dayNo(day)}</span>
            </th>;
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => <tr key={row.id || `${row.name}-${index}`} data-print-flow-item="row">
          <td>{index + 1}</td>
          <td className={styles.name}>{row.name || '—'}</td>
          <td className={styles.identity}>{row.identity || '—'}</td>
          {days.map((day) => {
            const value = n(row.attendance?.[String(day)] ?? row.attendance?.[day]);
            const explicit = row.marks?.[String(day)] ?? row.marks?.[day];
            const displayMark = explicit === undefined || explicit === null ? mark(value) : String(explicit);
            const date = new Date(Number(year), Number(month) - 1, day);
            return <td key={day} className={date.getDay() === 5 ? styles.friday : ''}>
              <span className={displayMark === '½' ? styles.half : styles.mark}>{displayMark}</span>
            </td>;
          })}
          <td className={styles.total}>{n(row.totalDays)}</td>
        </tr>)}
      </tbody>
      <tfoot><tr className={styles.grand}><td colSpan={3 + dayCount}>{footerLabel}</td><td>{totalDays}</td></tr></tfoot>
    </table>

    <div className={styles.signoff} data-print-keep-together="true">
      {signoffLabels.map((label) => <div key={label}><strong>{label}</strong><span className={styles.line}/></div>)}
    </div>
  </div>;
}
