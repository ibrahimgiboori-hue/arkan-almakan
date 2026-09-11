import { PRINT_FLOW_KIND } from '@/lib/print-governance';
import { latinDigits } from '@/lib/latin-digits';
import styles from './ExternalPayrollRunReport.module.css';

const moneyFormatter=new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

function money(value){return latinDigits(moneyFormatter.format(Number(value||0)));}
function num(value){return latinDigits(String(Number(value||0)));}
function date(value){return value?latinDigits(String(value).slice(0,10)):'—';}

const WIDTHS={
  employeeNo:'6%',employeeName:'14%',completeDays:'4%',absenceDays:'4%',missingPunches:'4%',
  basicSalary:'6%',housingAllowance:'6%',transportAllowance:'6%',otherAllowances:'6%',
  overtimeAddition:'6%',otherAdditions:'6%',absenceDeduction:'6%',timeDeduction:'6%',
  subscriptionDeduction:'6%',otherDeductions:'6%',netPay:'8%',
};

function valueCell(row,column){
  const value=row[column.key];
  if(column.type==='money')return money(value);
  if(column.type==='number')return num(value);
  return latinDigits(value||'—');
}

function totalFor(report,column){
  const totals=report.totals;
  if(column.key==='employeeNo'||column.key==='employeeName')return null;
  return totals[column.key] ?? null;
}

export default function ExternalPayrollRunReport({report}){
  const {meta,groups,columns,rows,totals}=report;
  return <div className={styles.report} dir="rtl" data-payroll-report="external-monthly-run-v1">
    <div className={styles.header}>
      <div>
        <h1 className={styles.title}>مسير الرواتب الشهري</h1>
        <div className={styles.subtitle}>{latinDigits(meta.clientName||'')}</div>
      </div>
      <div className={styles.meta}>
        <span className={styles.metaItem}>الفترة: {date(meta.periodFrom)} — {date(meta.periodTo)}</span>
        <span className={styles.metaItem}>عدد الموظفين: {num(totals.employeeCount)}</span>
      </div>
    </div>

    <table className={styles.table} aria-label="مسير الرواتب الشهري وتفاصيل صافي الراتب المستحق" data-print-flow={PRINT_FLOW_KIND.REPEATABLE_TABLE}>
      <colgroup>{columns.map((column)=><col key={column.key} style={{width:WIDTHS[column.key]||'6%'}}/>)}</colgroup>
      <thead>
        <tr data-print-row data-print-row-atomic="true">
          {groups.map((group)=><th key={group.key} className={styles.groupHead} colSpan={group.columns.length}>{group.label}</th>)}
        </tr>
        <tr data-print-row data-print-row-atomic="true">
          {columns.map((column)=><th key={column.key} className={styles.columnHead}>{column.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row)=><tr key={row.lineId||row.sourceEmployeeKey} data-print-row data-print-row-atomic="true">
          {columns.map((column)=>{
            const classes=[
              column.key==='employeeName'?styles.employeeName:'',
              column.key==='employeeNo'?styles.employeeNo:'',
              column.type==='number'?styles.number:'',
              column.type==='money'?styles.money:'',
              column.key==='netPay'?styles.net:'',
            ].filter(Boolean).join(' ');
            return <td key={column.key} className={classes} data-print-type={column.type}>{valueCell(row,column)}</td>;
          })}
        </tr>)}
        <tr className={styles.totalRow} data-print-row data-print-row-role="total" data-print-row-atomic="true">
          <td colSpan={2} className={styles.totalLabel}>الإجمالي العام</td>
          {columns.slice(2).map((column)=>{
            const value=totalFor(report,column);
            const classes=[column.type==='money'?styles.money:styles.number,column.key==='netPay'?styles.net:''].filter(Boolean).join(' ');
            return <td key={column.key} className={classes}>{column.type==='money'?money(value):num(value)}</td>;
          })}
        </tr>
      </tbody>
    </table>

    <div className={styles.summaryTitle}>ملخص المسير</div>
    <div className={styles.summaryGrid}>
      <div className={styles.summaryCard}><span>إجمالي الرواتب الأساسية</span><strong>{money(totals.basicSalary)} ر.س</strong></div>
      <div className={styles.summaryCard}><span>إجمالي البدلات</span><strong>{money(totals.allowances)} ر.س</strong></div>
      <div className={styles.summaryCard}><span>إجمالي الإضافات</span><strong>{money(totals.additions)} ر.س</strong></div>
      <div className={styles.summaryCard}><span>إجمالي الاستقطاعات</span><strong>{money(totals.deductions)} ر.س</strong></div>
      <div className={styles.summaryCard}><span>إجمالي أيام الغياب</span><strong>{num(totals.absenceDays)}</strong></div>
      <div className={`${styles.summaryCard} ${styles.summaryCardNet}`}><span>إجمالي صافي المستحق</span><strong>{money(totals.netPay)} ر.س</strong></div>
    </div>

    <table className={styles.breakdown}>
      <tbody>
        <tr data-print-row data-print-row-atomic="true">
          <td className={styles.breakdownLabel}>بدل السكن</td><td className={styles.breakdownValue}>{money(totals.housingAllowance)}</td>
          <td className={styles.breakdownLabel}>بدل النقل</td><td className={styles.breakdownValue}>{money(totals.transportAllowance)}</td>
          <td className={styles.breakdownLabel}>بدلات أخرى</td><td className={styles.breakdownValue}>{money(totals.otherAllowances)}</td>
          <td className={styles.breakdownLabel}>الوقت الإضافي</td><td className={styles.breakdownValue}>{money(totals.overtimeAddition)}</td>
        </tr>
        <tr data-print-row data-print-row-atomic="true">
          <td className={styles.breakdownLabel}>خصم الغياب</td><td className={styles.breakdownValue}>{money(totals.absenceDeduction)}</td>
          <td className={styles.breakdownLabel}>خصم نقص الوقت</td><td className={styles.breakdownValue}>{money(totals.timeDeduction)}</td>
          <td className={styles.breakdownLabel}>خصم الاشتراكات</td><td className={styles.breakdownValue}>{money(totals.subscriptionDeduction)}</td>
          <td className={styles.breakdownLabel}>خصومات أخرى</td><td className={styles.breakdownValue}>{money(totals.otherDeductions)}</td>
        </tr>
      </tbody>
    </table>

    <p className={styles.note}>جميع المبالغ بالريال السعودي. «خصم نقص الوقت» يعكس صافي فرق الوقت المحتسب وفق سياسة المسير، و«خصومات أخرى» تشمل خصم البصمة المفقودة والخصومات اليدوية عند وجودها.</p>
    {!report.reconciliationOk&&<div className={styles.warning}>تنبيه محاسبي: توجد أسطر لا تتطابق فيها مكونات الاستحقاق والاستقطاع الظاهرة مع صافي الراتب. لا يعتمد المسير قبل المراجعة.</div>}
  </div>;
}
