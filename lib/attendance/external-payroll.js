export const PAYMENT_METHODS = [
  ['mudad_wps','حماية الأجور – مدد'],
  ['bank_transfer','تحويل بنكي'],
  ['cash','نقدًا'],
];

export const PAYMENT_METHOD_LABEL = Object.fromEntries(PAYMENT_METHODS);

export function sourceEmployeeKey(day) {
  if (day?.external_person_id) return `external:${day.external_person_id}`;
  if (day?.employee_id) return `employee:${day.employee_id}`;
  if (day?.subject_no) return `no:${String(day.subject_no).trim()}`;
  return `name:${String(day?.subject_name || 'unknown').trim().toLowerCase()}`;
}

export function uniquePeople(days = []) {
  const map = new Map();
  for (const day of days) {
    const key = sourceEmployeeKey(day);
    if (!map.has(key)) {
      map.set(key, {
        key,
        externalPersonId: day?.external_person_id || null,
        employeeId: day?.employee_id || null,
        no: day?.subject_no || '',
        name: day?.subject_name || 'غير معروف',
      });
    }
  }
  return [...map.values()].sort((a,b)=>String(a.name).localeCompare(String(b.name),'ar',{numeric:true,sensitivity:'base'}));
}

export function groupDaysByEmployee(days = []) {
  const map = new Map();
  for (const day of days) {
    const key = sourceEmployeeKey(day);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(day);
  }
  return map;
}

function toMinutesBetween(start, end) {
  if (!start || !end) return null;
  const a = new Date(String(start).replace(' ','T'));
  const b = new Date(String(end).replace(' ','T'));
  const diff = Math.round((b.getTime()-a.getTime())/60000);
  return Number.isFinite(diff) && diff > 0 ? diff : null;
}

export function inferDayHours(days = []) {
  const counts = new Map();
  for (const day of days) {
    const minutes = toMinutesBetween(day?.scheduled_start, day?.scheduled_end);
    if (!minutes) continue;
    counts.set(minutes,(counts.get(minutes)||0)+1);
  }
  let bestMinutes = null;
  let bestCount = -1;
  for (const [minutes,count] of counts.entries()) {
    if (count > bestCount || (count===bestCount && minutes > (bestMinutes || 0))) {
      bestMinutes=minutes;
      bestCount=count;
    }
  }
  return bestMinutes ? Number((bestMinutes/60).toFixed(2)) : null;
}

export function calendarDivisor(periodFrom, periodTo) {
  if (!periodFrom) return 30;
  const start = new Date(`${String(periodFrom).slice(0,10)}T00:00:00`);
  const end = periodTo ? new Date(`${String(periodTo).slice(0,10)}T00:00:00`) : start;
  if (start.getFullYear()===end.getFullYear() && start.getMonth()===end.getMonth()) {
    return new Date(start.getFullYear(),start.getMonth()+1,0).getDate();
  }
  const inclusive = Math.round((end.getTime()-start.getTime())/86400000)+1;
  return Math.max(1,inclusive);
}

export function payrollMonthLabel(periodFrom, locale='ar-SA') {
  if (!periodFrom) return '';
  const date = new Date(`${String(periodFrom).slice(0,10)}T12:00:00`);
  return new Intl.DateTimeFormat(locale,{month:'long',year:'numeric'}).format(date);
}

export function formatMinutesSigned(minutes = 0) {
  const value = Number(minutes || 0);
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  const abs = Math.abs(value);
  const h = Math.floor(abs/60);
  const m = abs%60;
  return `${sign}${h}:${String(m).padStart(2,'0')}`;
}

export function formatMoney(value) {
  const n = Number(value || 0);
  return new Intl.NumberFormat('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
}

function round2(value) {
  return Math.round((Number(value || 0)+Number.EPSILON)*100)/100;
}

function dateOnly(value) {
  return value ? String(value).slice(0,10) : '';
}

export function calculateExternalPayroll({
  days = [],
  line = {},
  batch = {},
  profile = {},
  periodFrom,
  periodTo,
}) {
  const referenceNet = Number(line?.reference_net_salary);
  const dayHours = Number(line?.day_hours_override) > 0
    ? Number(line.day_hours_override)
    : inferDayHours(days);
  const divisorDays = batch?.divisor_policy === 'calendar_days'
    ? calendarDivisor(periodFrom,periodTo)
    : 30;

  if (!Number.isFinite(referenceNet) || referenceNet < 0) {
    return {ready:false,reason:'أدخل صافي الراتب المرجعي.'};
  }
  if (!dayHours || !Number.isFinite(dayHours) || dayHours <= 0) {
    return {ready:false,reason:'تعذر تحديد ساعات اليوم. أدخل ساعات اليوم للموظف.'};
  }

  const absenceDates=[];
  const missingPunchDates=[];
  let missingInCount=0;
  let missingOutCount=0;
  let extraMinutes=0;
  let shortMinutes=0;

  for (const day of days) {
    const decision = String(day?.justification_decision || '');
    if (day?.day_status === 'absent' && decision !== 'accepted') {
      absenceDates.push(dateOnly(day.work_date));
      continue;
    }
    if (['missing_in','missing_out'].includes(day?.day_status) && decision !== 'accepted') {
      if (day.day_status === 'missing_in') missingInCount += 1;
      if (day.day_status === 'missing_out') missingOutCount += 1;
      missingPunchDates.push({date:dateOnly(day.work_date),kind:day.day_status});
      continue;
    }
    if (day?.day_status !== 'complete') continue;
    const scheduledMinutes = toMinutesBetween(day?.scheduled_start,day?.scheduled_end);
    const workedMinutes = Number(day?.worked_minutes);
    if (!scheduledMinutes || !Number.isFinite(workedMinutes)) continue;
    const delta = workedMinutes - scheduledMinutes;
    if (delta > 0) extraMinutes += delta;
    if (delta < 0) shortMinutes += Math.abs(delta);
  }

  const netMinutes = extraMinutes - shortMinutes;
  const dayValue = referenceNet/divisorDays;
  const hourValue = dayValue/dayHours;
  const absenceAmount = round2(absenceDates.length*dayValue);
  const missingPunchDays = missingPunchDates.length;
  const missingPunchDeductionDays = Math.max(0,Number(batch?.missing_punch_deduction_days || 0));
  const missingPunchAmount = round2(missingPunchDays*missingPunchDeductionDays*dayValue);
  let timeAmount = round2((netMinutes/60)*hourValue);
  if (batch?.positive_time_policy === 'offset_only' && timeAmount > 0) timeAmount=0;

  const manualAdditions = Math.max(0,Number(line?.manual_additions || 0));
  const manualDeductions = Math.max(0,Number(line?.manual_deductions || 0));
  const timeAddition = Math.max(0,timeAmount);
  const timeDeduction = Math.max(0,-timeAmount);
  const totalAdditions = round2(timeAddition+manualAdditions);
  const totalDeductions = round2(absenceAmount+missingPunchAmount+timeDeduction+manualDeductions);
  const finalNetSalary = round2(referenceNet+totalAdditions-totalDeductions);
  const paymentMethod = line?.payment_method || profile?.default_payment_method || batch?.default_payment_method || null;

  const snapshot = {
    payroll_month: payrollMonthLabel(periodFrom),
    period_from: dateOnly(periodFrom),
    period_to: dateOnly(periodTo),
    employee: {
      source_key: line?.source_employee_key || '',
      source_no: profile?.source_employee_no || '',
      source_name: profile?.source_employee_name || '',
      employee_no: profile?.display_employee_no || profile?.source_employee_no || '',
      display_name: profile?.display_name || profile?.source_employee_name || '',
      job_title: profile?.job_title || '',
      identity_no: profile?.identity_no || '',
      show_job_title: !!line?.show_job_title,
      show_identity: !!line?.show_identity,
    },
    salary: {
      reference_net_salary: referenceNet,
      basic_salary: line?.basic_salary == null ? null : Number(line.basic_salary),
      housing_allowance: line?.housing_allowance == null ? null : Number(line.housing_allowance),
      transport_allowance: line?.transport_allowance == null ? null : Number(line.transport_allowance),
      other_allowances: line?.other_allowances == null ? null : Number(line.other_allowances),
    },
    attendance: {
      absence_days: absenceDates.length,
      absence_dates: absenceDates,
      missing_punch_days: missingPunchDays,
      missing_in_count: missingInCount,
      missing_out_count: missingOutCount,
      missing_punch_dates: missingPunchDates,
      extra_minutes: extraMinutes,
      short_minutes: shortMinutes,
      net_minutes: netMinutes,
    },
    calculation: {
      divisor_policy: batch?.divisor_policy || 'thirty',
      divisor_days: divisorDays,
      day_hours: dayHours,
      day_value: round2(dayValue),
      hour_value: round2(hourValue),
      missing_punch_deduction_days: missingPunchDeductionDays,
      positive_time_policy: batch?.positive_time_policy || 'pay_net',
      absence_amount: absenceAmount,
      missing_punch_amount: missingPunchAmount,
      time_amount: timeAmount,
      manual_additions: manualAdditions,
      manual_additions_reason: line?.manual_additions_reason || '',
      manual_deductions: manualDeductions,
      manual_deductions_reason: line?.manual_deductions_reason || '',
      total_additions: totalAdditions,
      total_deductions: totalDeductions,
      final_net_salary: finalNetSalary,
    },
    payment_method: paymentMethod,
  };

  return {
    ready:true,
    divisorDays,
    dayHours,
    dayValue,
    hourValue,
    absenceDays:absenceDates.length,
    absenceDates,
    missingPunchDays,
    missingInCount,
    missingOutCount,
    missingPunchDates,
    extraMinutes,
    shortMinutes,
    netMinutes,
    absenceAmount,
    missingPunchAmount,
    timeAmount,
    totalAdditions,
    totalDeductions,
    finalNetSalary,
    paymentMethod,
    snapshot,
  };
}
