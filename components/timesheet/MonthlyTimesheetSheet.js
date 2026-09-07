'use client';

import styles from './monthly-timesheet-sheet.module.css';

const WEEKDAY_FULL = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const n = (value) => Number(value || 0);

// The whole table is 100%. These four non-day columns keep one stable share,
// and the remainder is divided mathematically by the actual number of days.
const FIXED_COLUMN_PERCENT = Object.freeze({
  index:2.1,
  name:14.6,
  identity:8.3,
  total:4.2,
});

export function daysInMonth(year, month) {
  return new Date(Number(year), Number(month), 0).getDate();
}

export function monthlyTimesheetColumnPlan(dayCount) {
  const count = Math.max(1,Math.trunc(Number(dayCount) || 31));
  const fixed = Object.values(FIXED_COLUMN_PERCENT).reduce((sum,value)=>sum+value,0);
  const dayArea = 100 - fixed;
  return Object.freeze({
    ...FIXED_COLUMN_PERCENT,
    fixed,
    dayArea,
    day:dayArea / count,
    dayCount:count,
  });
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

function attendanceVisual(displayMark, value, hasAttendance) {
  const token = displayMark == null ? '' : String(displayMark).trim();
  if (token === '✓') return { className:styles.statusFull, text:'✓', label:'حضور كامل' };
  if (token === '½') return { className:styles.statusHalf, text:'½', label:'نصف يوم' };
  if (token === 'غ') return { className:styles.statusAbsent, text:'', label:'غياب' };
  if (token) return { className:'', text:token, label:token };
  if (!hasAttendance) return { className:'', text:'', label:'' };
  if (n(value) === 1) return { className:styles.statusFull, text:'✓', label:'حضور كامل' };
  if (n(value) === 0.5) return { className:styles.statusHalf, text:'½', label:'نصف يوم' };
  if (n(value) === 0) return { className:styles.statusAbsent, text:'', label:'غياب' };
  return { className:'', text:mark(value), label:'' };
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
  const columns = monthlyTimesheetColumnPlan(dayCount);
  const pct = (value) => `${value}%`;

  return <div className={`${styles.document} ${className}`.trim()}>
    <div className={styles.head} data-print-keep-with-next="true">
      <div><h1>{title}</h1><p>{subtitle}</p></div>
      {reference ? <div className={styles.reference}>{reference}</div> : null}
    </div>

    {meta.length ? <div className={styles.meta} data-print-keep-with-next="true">
      {meta.map((item, index) => <div key={`${item.label}-${index}`}><span>{item.label}</span><strong>{item.value || '—'}</strong></div>)}
    </div> : null}

    <table
      className={styles.table}
      style={{'--timesheet-day-count':dayCount,'--timesheet-day-width':pct(columns.day)}}
      data-print-flow="repeatable-table"
    >
      <colgroup>
        <col className={styles.indexCol} style={{width:pct(columns.index)}}/>
        <col className={styles.nameCol} style={{width:pct(columns.name)}}/>
        <col className={styles.identityCol} style={{width:pct(columns.identity)}}/>
        {days.map((day) => <col key={day} className={styles.dayCol} style={{width:pct(columns.day)}}/>)}
        <col className={styles.totalCol} style={{width:pct(columns.total)}}/>
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
            const key = String(day);
            const source = row.attendance || {};
            const hasAttendance = Object.prototype.hasOwnProperty.call(source,key);
            const value = n(source[key]);
            const explicit = row.marks?.[key];
            const displayMark = explicit === undefined || explicit === null ? mark(value) : String(explicit);
            const visual = attendanceVisual(displayMark,value,hasAttendance || explicit !== undefined);
            const date = new Date(Number(year), Number(month) - 1, day);
            const cellClass = [date.getDay() === 5 ? styles.friday : '',visual.className].filter(Boolean).join(' ');
            return <td key={day} className={cellClass} aria-label={visual.label || undefined} title={visual.label || undefined}>
              {visual.text ? <span className={visual.text === '½' ? styles.half : styles.mark}>{visual.text}</span> : null}
              {visual.label === 'غياب' ? <span className={styles.srOnly}>غياب</span> : null}
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
