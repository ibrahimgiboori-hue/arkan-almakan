import { PRINT_FLOW_KIND } from '@/lib/print-governance';
import { latinDigits } from '@/lib/latin-digits';
import styles from './ExternalPayrollRunReport.module.css';

const moneyFormatter=new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

function money(value){return latinDigits(moneyFormatter.format(Number(value||0)));}
function date(value){return value?latinDigits(String(value).slice(0,10)):'—';}

const WIDTHS={
  employeeNo:'12%',
  employeeName:'28%',
  grossSalary:'15%',
  totalAdditions:'15%',
  totalDeductions:'15%',
  netPay:'15%',
};

function valueCell(row,column){
  if(column.type==='money')return money(row[column.key]);
  return latinDigits(row[column.key]||'—');
}

export default function ExternalPayrollRunReport({report}){
  const {meta,pdfColumns,rows,totals}=report;
  return <div className={styles.report} dir="rtl" data-payroll-report="external-monthly-run-v2">
    <div className={styles.header}>
      <div>
        <h1 className={styles.title}>مسير الرواتب الشهري</h1>
        <div className={styles.subtitle}>{latinDigits(meta.clientName||'')}</div>
      </div>
      <div className={styles.meta}>
        <span>{date(meta.periodFrom)} — {date(meta.periodTo)}</span>
        <span>عدد الموظفين: {latinDigits(String(totals.employeeCount||0))}</span>
      </div>
    </div>

    <table className={styles.table} aria-label="ملخص مسير الرواتب الشهري" data-print-flow={PRINT_FLOW_KIND.REPEATABLE_TABLE}>
      <colgroup>{pdfColumns.map((column)=><col key={column.key} style={{width:WIDTHS[column.key]}}/>)}</colgroup>
      <thead>
        <tr data-print-row data-print-row-atomic="true">
          {pdfColumns.map((column)=><th key={column.key} className={styles.columnHead}>{column.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row)=><tr key={row.lineId||row.sourceEmployeeKey} data-print-row data-print-row-atomic="true">
          {pdfColumns.map((column)=>{
            const classes=[
              column.key==='employeeName'?styles.employeeName:'',
              column.key==='employeeNo'?styles.employeeNo:'',
              column.type==='money'?styles.money:'',
              column.key==='netPay'?styles.net:'',
            ].filter(Boolean).join(' ');
            return <td key={column.key} className={classes} data-print-type={column.type}>{valueCell(row,column)}</td>;
          })}
        </tr>)}
        <tr className={styles.totalRow} data-print-row data-print-row-role="total" data-print-row-atomic="true">
          <td colSpan={2} className={styles.totalLabel}>الإجمالي العام</td>
          <td className={styles.money}>{money(totals.grossSalary)}</td>
          <td className={styles.money}>{money(totals.totalAdditions)}</td>
          <td className={styles.money}>{money(totals.totalDeductions)}</td>
          <td className={`${styles.money} ${styles.net}`}>{money(totals.netPay)}</td>
        </tr>
      </tbody>
    </table>

    {!report.reconciliationOk&&<div className={styles.warning}>تنبيه محاسبي: توجد فروقات مصالحة. راجع التقرير التفصيلي قبل الاعتماد.</div>}
  </div>;
}
