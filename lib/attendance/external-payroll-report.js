export const EXTERNAL_PAYROLL_REPORT_GROUPS = Object.freeze([
  Object.freeze({
    key:'employee',
    label:'البيانات الوظيفية',
    columns:Object.freeze([
      Object.freeze({key:'employeeNo',label:'الرقم الوظيفي',type:'text'}),
      Object.freeze({key:'employeeName',label:'اسم الموظف',type:'text'}),
    ]),
  }),
  Object.freeze({
    key:'attendance',
    label:'ملخص الحضور',
    columns:Object.freeze([
      Object.freeze({key:'completeDays',label:'حضور كامل',type:'number'}),
      Object.freeze({key:'absenceDays',label:'غياب',type:'number'}),
      Object.freeze({key:'missingPunches',label:'بصمات مفقودة',type:'number'}),
    ]),
  }),
  Object.freeze({
    key:'earnings',
    label:'الاستحقاقات',
    columns:Object.freeze([
      Object.freeze({key:'basicSalary',label:'الراتب الأساسي',type:'money'}),
      Object.freeze({key:'housingAllowance',label:'بدل السكن',type:'money'}),
      Object.freeze({key:'transportAllowance',label:'بدل النقل',type:'money'}),
      Object.freeze({key:'otherAllowances',label:'بدلات أخرى',type:'money'}),
    ]),
  }),
  Object.freeze({
    key:'additions',
    label:'الإضافات',
    columns:Object.freeze([
      Object.freeze({key:'overtimeAddition',label:'قيمة الوقت الإضافي',type:'money'}),
      Object.freeze({key:'otherAdditions',label:'إضافات أخرى',type:'money'}),
    ]),
  }),
  Object.freeze({
    key:'deductions',
    label:'الاستقطاعات',
    columns:Object.freeze([
      Object.freeze({key:'absenceDeduction',label:'خصم الغياب',type:'money'}),
      Object.freeze({key:'timeDeduction',label:'خصم نقص الوقت',type:'money'}),
      Object.freeze({key:'subscriptionDeduction',label:'خصم الاشتراكات',type:'money'}),
      Object.freeze({key:'otherDeductions',label:'خصومات أخرى',type:'money'}),
    ]),
  }),
  Object.freeze({
    key:'net',
    label:'صافي المستحق',
    columns:Object.freeze([
      Object.freeze({key:'netPay',label:'صافي الراتب المستحق',type:'money'}),
    ]),
  }),
]);

export const EXTERNAL_PAYROLL_REPORT_COLUMNS = Object.freeze(
  EXTERNAL_PAYROLL_REPORT_GROUPS.flatMap((group)=>group.columns),
);

// PDF is deliberately executive and compact. Detailed audit data belongs in Excel.
export const EXTERNAL_PAYROLL_PDF_COLUMNS = Object.freeze([
  Object.freeze({key:'employeeNo',label:'الرقم الوظيفي',type:'text'}),
  Object.freeze({key:'employeeName',label:'اسم الموظف',type:'text'}),
  Object.freeze({key:'grossSalary',label:'إجمالي الراتب',type:'money'}),
  Object.freeze({key:'totalAdditions',label:'إجمالي الإضافات',type:'money'}),
  Object.freeze({key:'totalDeductions',label:'إجمالي الخصومات',type:'money'}),
  Object.freeze({key:'netPay',label:'صافي المستحق',type:'money'}),
]);

// Excel keeps the full accounting and attendance audit trail.
export const EXTERNAL_PAYROLL_EXCEL_COLUMNS = Object.freeze([
  Object.freeze({key:'employeeNo',label:'الرقم الوظيفي',type:'text'}),
  Object.freeze({key:'employeeName',label:'اسم الموظف',type:'text'}),
  Object.freeze({key:'completeDays',label:'الحضور الكامل',type:'number'}),
  Object.freeze({key:'absenceDays',label:'أيام الغياب',type:'number'}),
  Object.freeze({key:'missingPunches',label:'البصمات المفقودة',type:'number'}),
  Object.freeze({key:'basicSalary',label:'الراتب الأساسي',type:'money'}),
  Object.freeze({key:'housingAllowance',label:'بدل السكن',type:'money'}),
  Object.freeze({key:'transportAllowance',label:'بدل النقل',type:'money'}),
  Object.freeze({key:'otherAllowances',label:'بدلات أخرى',type:'money'}),
  Object.freeze({key:'grossSalary',label:'إجمالي الراتب',type:'money'}),
  Object.freeze({key:'overtimeAddition',label:'قيمة الوقت الإضافي',type:'money'}),
  Object.freeze({key:'otherAdditions',label:'إضافات أخرى',type:'money'}),
  Object.freeze({key:'totalAdditions',label:'إجمالي الإضافات',type:'money'}),
  Object.freeze({key:'absenceDeduction',label:'خصم الغياب',type:'money'}),
  Object.freeze({key:'timeDeduction',label:'خصم نقص الوقت',type:'money'}),
  Object.freeze({key:'subscriptionDeduction',label:'خصم الاشتراكات',type:'money'}),
  Object.freeze({key:'otherDeductions',label:'خصومات أخرى',type:'money'}),
  Object.freeze({key:'totalDeductions',label:'إجمالي الخصومات',type:'money'}),
  Object.freeze({key:'netPay',label:'صافي المستحق',type:'money'}),
]);

function asObject(value){
  return value && typeof value==='object' && !Array.isArray(value) ? value : {};
}

function number(value){
  const parsed=Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value){
  return Math.round((number(value)+Number.EPSILON)*100)/100;
}

function dateOnly(value){
  return value ? String(value).slice(0,10) : '';
}

function employeeSort(a,b){
  const noCompare=String(a.employeeNo||'').localeCompare(String(b.employeeNo||''),'en',{numeric:true,sensitivity:'base'});
  if(noCompare!==0)return noCompare;
  return String(a.employeeName||'').localeCompare(String(b.employeeName||''),'ar',{numeric:true,sensitivity:'base'});
}

function groupAttendanceByExternalPerson(days=[]){
  const grouped=new Map();
  for(const day of days||[]){
    const key=day?.external_person_id;
    if(!key)continue;
    if(!grouped.has(key))grouped.set(key,[]);
    grouped.get(key).push(day);
  }
  return grouped;
}

function buildRow(line,profile,attendanceDays){
  const snapshot=asObject(line?.calculation_snapshot);
  const employee=asObject(snapshot.employee);
  const salary=asObject(snapshot.salary);
  const attendance=asObject(snapshot.attendance);
  const calculation=asObject(snapshot.calculation);

  const basicSalary=roundMoney(salary.basic_salary ?? line?.basic_salary);
  const housingAllowance=roundMoney(salary.housing_allowance ?? line?.housing_allowance);
  const transportAllowance=roundMoney(salary.transport_allowance ?? line?.transport_allowance);
  const otherAllowances=roundMoney(salary.other_allowances ?? line?.other_allowances);
  const grossSalary=roundMoney(basicSalary+housingAllowance+transportAllowance+otherAllowances);
  const timeAmount=roundMoney(calculation.time_amount ?? line?.calculated_time_amount);
  const overtimeAddition=roundMoney(Math.max(0,timeAmount));
  const otherAdditions=roundMoney(calculation.manual_additions ?? line?.manual_additions);
  const totalAdditions=roundMoney(overtimeAddition+otherAdditions);
  const absenceDeduction=roundMoney(calculation.absence_amount ?? line?.calculated_absence_amount);
  const timeDeduction=roundMoney(Math.max(0,-timeAmount));
  const subscriptionDeduction=roundMoney(salary.gosi_employee_deduction ?? line?.calculated_gosi_employee_deduction);
  const missingPunchDeduction=roundMoney(calculation.missing_punch_amount ?? line?.calculated_missing_punch_amount);
  const manualDeductions=roundMoney(calculation.manual_deductions ?? line?.manual_deductions);
  const otherDeductions=roundMoney(missingPunchDeduction+manualDeductions);
  const totalDeductions=roundMoney(absenceDeduction+timeDeduction+subscriptionDeduction+otherDeductions);
  const netPay=roundMoney(calculation.final_net_salary ?? line?.calculated_final_net_salary);

  const completeDays=(attendanceDays||[]).filter((day)=>day?.day_status==='complete').length;
  const absenceDays=Math.max(0,number(attendance.absence_days ?? line?.calculated_absence_days));
  const missingIn=Math.max(0,number(attendance.missing_in_count ?? line?.calculated_missing_in_count));
  const missingOut=Math.max(0,number(attendance.missing_out_count ?? line?.calculated_missing_out_count));
  const missingPunches=missingIn+missingOut || Math.max(0,number(attendance.missing_punch_days ?? line?.calculated_missing_punch_days));

  const visibleEarnings=roundMoney(grossSalary+totalAdditions);
  const visibleDeductions=totalDeductions;
  const reconciliationDifference=roundMoney(visibleEarnings-visibleDeductions-netPay);

  return Object.freeze({
    lineId:line?.id||'',
    sourceEmployeeKey:line?.source_employee_key||'',
    employeeNo:String(employee.employee_no||profile?.display_employee_no||employee.source_no||profile?.source_employee_no||'').trim(),
    employeeName:String(employee.display_name||profile?.display_name||employee.source_name||profile?.source_employee_name||'غير معروف').trim(),
    completeDays,
    absenceDays,
    missingPunches,
    basicSalary,
    housingAllowance,
    transportAllowance,
    otherAllowances,
    grossSalary,
    overtimeAddition,
    otherAdditions,
    totalAdditions,
    absenceDeduction,
    timeDeduction,
    subscriptionDeduction,
    otherDeductions,
    totalDeductions,
    netPay,
    visibleEarnings,
    visibleDeductions,
    reconciliationDifference,
    calculatedAt:line?.calculated_at||null,
  });
}

function sum(rows,key){
  return roundMoney(rows.reduce((total,row)=>total+number(row?.[key]),0));
}

export function buildExternalPayrollReport({batch={},attendanceImport={},lines=[],profiles=[],days=[]}={}){
  const profileByKey=new Map((profiles||[]).map((profile)=>[profile.source_employee_key,profile]));
  const daysByPerson=groupAttendanceByExternalPerson(days);
  const rows=(lines||[]).map((line)=>buildRow(
    line,
    profileByKey.get(line?.source_employee_key)||null,
    daysByPerson.get(line?.external_person_id)||[],
  )).sort(employeeSort);

  const uncalculatedRows=rows.filter((row)=>!row.calculatedAt);
  const reconciliationExceptions=rows.filter((row)=>Math.abs(row.reconciliationDifference)>0.01);
  const totalHousing=sum(rows,'housingAllowance');
  const totalTransport=sum(rows,'transportAllowance');
  const totalOtherAllowances=sum(rows,'otherAllowances');
  const totalOvertime=sum(rows,'overtimeAddition');
  const totalOtherAdditions=sum(rows,'otherAdditions');
  const totalAbsenceDeduction=sum(rows,'absenceDeduction');
  const totalTimeDeduction=sum(rows,'timeDeduction');
  const totalSubscriptionDeduction=sum(rows,'subscriptionDeduction');
  const totalOtherDeductions=sum(rows,'otherDeductions');

  const totals=Object.freeze({
    employeeCount:rows.length,
    completeDays:rows.reduce((total,row)=>total+number(row.completeDays),0),
    absenceDays:rows.reduce((total,row)=>total+number(row.absenceDays),0),
    missingPunches:rows.reduce((total,row)=>total+number(row.missingPunches),0),
    basicSalary:sum(rows,'basicSalary'),
    housingAllowance:totalHousing,
    transportAllowance:totalTransport,
    otherAllowances:totalOtherAllowances,
    allowances:roundMoney(totalHousing+totalTransport+totalOtherAllowances),
    grossSalary:sum(rows,'grossSalary'),
    overtimeAddition:totalOvertime,
    otherAdditions:totalOtherAdditions,
    additions:sum(rows,'totalAdditions'),
    totalAdditions:sum(rows,'totalAdditions'),
    absenceDeduction:totalAbsenceDeduction,
    timeDeduction:totalTimeDeduction,
    subscriptionDeduction:totalSubscriptionDeduction,
    otherDeductions:totalOtherDeductions,
    deductions:sum(rows,'totalDeductions'),
    totalDeductions:sum(rows,'totalDeductions'),
    netPay:sum(rows,'netPay'),
  });

  return Object.freeze({
    meta:Object.freeze({
      batchId:batch?.id||'',
      clientName:String(attendanceImport?.client_name_snapshot||'').trim(),
      periodFrom:dateOnly(attendanceImport?.period_from),
      periodTo:dateOnly(attendanceImport?.period_to),
      status:batch?.status||'',
    }),
    groups:EXTERNAL_PAYROLL_REPORT_GROUPS,
    columns:EXTERNAL_PAYROLL_REPORT_COLUMNS,
    pdfColumns:EXTERNAL_PAYROLL_PDF_COLUMNS,
    excelColumns:EXTERNAL_PAYROLL_EXCEL_COLUMNS,
    rows:Object.freeze(rows),
    totals,
    uncalculatedCount:uncalculatedRows.length,
    reconciliationOk:reconciliationExceptions.length===0,
    reconciliationExceptions:Object.freeze(reconciliationExceptions.map((row)=>Object.freeze({
      lineId:row.lineId,
      employeeNo:row.employeeNo,
      employeeName:row.employeeName,
      difference:row.reconciliationDifference,
    }))),
  });
}
