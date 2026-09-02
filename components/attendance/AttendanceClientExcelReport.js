'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

const STATUS_AR = {
  complete: 'حضور كامل',
  missing_in: 'تفويت بصمة حضور',
  missing_out: 'تفويت بصمة انصراف',
  absent: 'غياب',
  day_off: 'إجازة الجمعة',
  no_schedule: 'ساعات الدوام غير محددة',
  needs_review: 'يحتاج مراجعة',
};

const DECISION_AR = {
  accepted: 'مقبول',
  rejected: 'غير مقبول',
  pending: 'بانتظار القرار',
};

const COLORS = {
  navy: 'FF24364B',
  slate: 'FF52616B',
  ink: 'FF1F2933',
  muted: 'FF66788A',
  line: 'FFD9E1E8',
  soft: 'FFF6F8FA',
  softBlue: 'FFEAF1F7',
  softGreen: 'FFEAF5EE',
  softAmber: 'FFFFF6DF',
  softRed: 'FFFBEAEC',
  white: 'FFFFFFFF',
};

function minutesBetween(start, end) {
  if (!start || !end) return 0;
  const a = new Date(String(start).replace(' ', 'T'));
  const b = new Date(String(end).replace(' ', 'T'));
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.max(0, Math.round((b - a) / 60000));
}

function hhmm(minutes) {
  if (minutes === null || minutes === undefined || Number.isNaN(Number(minutes))) return '—';
  const n = Math.max(0, Math.round(Number(minutes)));
  const h = Math.floor(n / 60);
  const m = n % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function clock(value) {
  if (!value) return '—';
  const s = String(value).replace('T', ' ');
  const match = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
  return match ? `${String(match[1]).padStart(2, '0')}:${match[2]}` : s;
}

function dateOnly(value) {
  if (!value) return '—';
  return String(value).slice(0, 10);
}

function dedupePunches(list) {
  const sorted = [...list].filter(Boolean).sort((a, b) => new Date(a) - new Date(b));
  const out = [];
  for (const value of sorted) {
    const current = new Date(value);
    const previous = out.length ? new Date(out[out.length - 1]) : null;
    if (!previous || Number.isNaN(previous.getTime()) || Number.isNaN(current.getTime()) || (current - previous) > 60000) out.push(value);
  }
  return out;
}

function subjectKey(day) {
  return day.external_person_id || day.employee_id || `${day.subject_no || ''}|${day.subject_name || ''}`;
}

function punchKey(punch) {
  return punch.external_person_id || punch.employee_id || `${punch.external_employee_no || ''}|${punch.external_employee_name || ''}`;
}

function styleHeader(row) {
  row.height = 28;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COLORS.white }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navy } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: COLORS.navy } },
      bottom: { style: 'thin', color: { argb: COLORS.navy } },
      left: { style: 'thin', color: { argb: COLORS.white } },
      right: { style: 'thin', color: { argb: COLORS.white } },
    };
  });
}

function styleBody(sheet, startRow, endRow, columnCount) {
  for (let r = startRow; r <= endRow; r += 1) {
    const row = sheet.getRow(r);
    row.height = 23;
    for (let c = 1; c <= columnCount; c += 1) {
      const cell = row.getCell(c);
      cell.font = { color: { argb: COLORS.ink }, size: 10 };
      cell.alignment = { vertical: 'middle', horizontal: c <= 2 ? 'right' : 'center', wrapText: true };
      cell.border = {
        top: { style: 'hair', color: { argb: COLORS.line } },
        bottom: { style: 'hair', color: { argb: COLORS.line } },
        left: { style: 'hair', color: { argb: COLORS.line } },
        right: { style: 'hair', color: { argb: COLORS.line } },
      };
      if (r % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.soft } };
    }
  }
}

function addTitle(sheet, title, subtitle, columnCount) {
  sheet.mergeCells(1, 1, 1, columnCount);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 16, color: { argb: COLORS.navy } };
  titleCell.alignment = { horizontal: 'right', vertical: 'middle' };
  sheet.getRow(1).height = 30;

  sheet.mergeCells(2, 1, 2, columnCount);
  const subCell = sheet.getCell(2, 1);
  subCell.value = subtitle;
  subCell.font = { size: 10, color: { argb: COLORS.muted } };
  subCell.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
  sheet.getRow(2).height = 36;
}

function statusFill(cell, status) {
  let color = COLORS.softBlue;
  if (status === 'complete' || status === 'day_off') color = COLORS.softGreen;
  if (status === 'missing_in' || status === 'missing_out' || status === 'needs_review') color = COLORS.softAmber;
  if (status === 'absent') color = COLORS.softRed;
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
  cell.font = { bold: true, color: { argb: COLORS.ink }, size: 10 };
}

function setupSheet(sheet, headerRow, lastColumn) {
  sheet.views = [{ state: 'frozen', ySplit: headerRow, rightToLeft: true }];
  sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: lastColumn } };
  sheet.properties.defaultRowHeight = 22;
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  sheet.headerFooter.oddFooter = '&Rصفحة &P من &N';
}

export default function AttendanceClientExcelReport({ activeImport, disabled = false }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function exportReport() {
    if (!activeImport?.id) return;
    setBusy(true);
    setErr('');
    try {
      const [{ default: ExcelJS }, dayQ, punchQ] = await Promise.all([
        import('exceljs'),
        supabase.from('v_hr_attendance_processing_days').select('*').eq('import_id', activeImport.id).order('subject_no').order('subject_name').order('work_date'),
        supabase.from('hr_attendance_punches').select('employee_id,external_person_id,external_employee_no,external_employee_name,punch_local,punch_date').eq('import_id', activeImport.id).order('punch_local'),
      ]);
      if (dayQ.error) throw dayQ.error;
      if (punchQ.error) throw punchQ.error;

      const days = dayQ.data || [];
      const punches = punchQ.data || [];
      if (!days.length) throw new Error('لا توجد نتائج تحليل يومية لهذه الدفعة بعد.');

      const punchMap = new Map();
      for (const p of punches) {
        const key = `${punchKey(p)}|${p.punch_date}`;
        if (!punchMap.has(key)) punchMap.set(key, []);
        punchMap.get(key).push(p.punch_local);
      }

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Attendance Processing Lab';
      workbook.created = new Date();
      workbook.modified = new Date();
      workbook.company = activeImport.client_name_snapshot || '';

      const client = activeImport.client_name_snapshot || (activeImport.processing_scope === 'internal' ? 'أركان المكان' : 'العميل');
      const period = `${activeImport.period_from || '—'} إلى ${activeImport.period_to || '—'}`;
      const calibratedNote = 'عند عدم تزويدنا بساعات دوام معتمدة، تمت معايرة ساعات الدوام المستخدمة في التحليل استنادًا إلى النمط المتكرر لحركات البصمة. وتُستبدل بها ساعات الدوام المعتمدة من العميل متى تم تزويدنا بها.';
      const justificationNote = 'وجود تبرير أو مستند مقدم من الموظف لا يعني قبوله، ولا يتغير أثر المخالفة إلا بقرار صاحب العمل أو من يفوضه. وفي حال عدم تقديم تبرير تظل المخالفة وأثرها قائمين.';

      // 1) Daily audit and analysis
      const daily = workbook.addWorksheet('1- الجرد والتحليل اليومي', { views: [{ rightToLeft: true }] });
      const dailyHeaders = ['رقم الموظف','الموظف','التاريخ','البصمات بعد إزالة التكرار','ساعات الدوام','الدخول المحتسب','الخروج المحتسب','ساعات العمل المحسوبة','ساعات العمل الافتراضية','التحليل الأولي','التأخير','الخروج المبكر','الوقت الزائد المرصود','الخصم الأولي','ملاحظة التحليل'];
      addTitle(daily, 'الجرد والتحليل اليومي', `${client} — الفترة ${period}. ${calibratedNote}`, dailyHeaders.length);
      daily.addRow([]);
      const dailyHeaderRow = daily.addRow(dailyHeaders);
      styleHeader(dailyHeaderRow);

      const dailyStart = dailyHeaderRow.number + 1;
      for (const d of days) {
        const raw = dedupePunches(punchMap.get(`${subjectKey(d)}|${d.work_date}`) || []);
        const scheduled = d.scheduled_start && d.scheduled_end ? `${clock(d.scheduled_start)}–${clock(d.scheduled_end)}` : '—';
        const scheduleMinutes = minutesBetween(d.scheduled_start, d.scheduled_end);
        const late = Math.max(0, Number(d.late_arrival_minutes ?? d.arrival_delta_minutes ?? 0));
        const earlyOut = Math.max(0, Number(d.early_departure_minutes ?? (Number(d.departure_delta_minutes || 0) < 0 ? -Number(d.departure_delta_minutes || 0) : 0));
        const extra = Math.max(0, Number(d.late_departure_minutes ?? d.departure_delta_minutes ?? 0));
        const row = daily.addRow([
          d.subject_no || '', d.subject_name || '', dateOnly(d.work_date), raw.map(clock).join(' | ') || '—', scheduled,
          clock(d.check_in), clock(d.check_out), d.worked_minutes == null ? '—' : hhmm(d.worked_minutes),
          scheduleMinutes ? hhmm(scheduleMinutes) : '—', STATUS_AR[d.day_status] || d.day_status || '—',
          late ? hhmm(late) : '0:00', earlyOut ? hhmm(earlyOut) : '0:00', extra ? hhmm(extra) : '0:00',
          Number(d.preliminary_deduction_days || 0), d.analysis_note || '',
        ]);
        statusFill(row.getCell(10), d.day_status);
      }
      styleBody(daily, dailyStart, daily.lastRow.number, dailyHeaders.length);
      daily.columns = [12,24,13,34,18,14,14,18,18,22,12,14,18,12,42].map((width) => ({ width }));
      setupSheet(daily, dailyHeaderRow.number, dailyHeaders.length);

      // 2) Justifications and decisions
      const processing = workbook.addWorksheet('2- التبريرات والمعالجات', { views: [{ rightToLeft: true }] });
      const processHeaders = ['رقم الموظف','الموظف','التاريخ','الحالة الأولية','التبرير المقدم','المرجع / المستند','قرار صاحب العمل','ملاحظة القرار','الخصم الأولي','الخصم بعد القرار','النتيجة'];
      addTitle(processing, 'التبريرات والمعالجات', `${client} — الفترة ${period}. ${justificationNote}`, processHeaders.length);
      processing.addRow([]);
      const processHeaderRow = processing.addRow(processHeaders);
      styleHeader(processHeaderRow);
      const processStart = processHeaderRow.number + 1;
      const processDays = days.filter((d) => ['absent','missing_in','missing_out','needs_review'].includes(d.day_status) || d.justification_id || Number(d.preliminary_deduction_days || 0) > 0);
      for (const d of processDays) {
        const decision = d.justification_decision || (d.justification_text ? 'pending' : 'none');
        const result = decision === 'accepted' ? 'تم قبول التبرير وإعادة احتساب الأثر' : decision === 'rejected' ? 'التبرير غير مقبول والأثر قائم' : decision === 'pending' ? 'بانتظار قرار صاحب العمل — الأثر لا يزال قائمًا' : 'لا يوجد تبرير — الأثر قائم';
        const row = processing.addRow([
          d.subject_no || '', d.subject_name || '', dateOnly(d.work_date), STATUS_AR[d.day_status] || d.day_status || '—',
          d.justification_text || 'لا يوجد تبرير', d.paper_reference || '—', decision === 'none' ? 'لا يوجد تبرير' : (DECISION_AR[decision] || decision),
          d.decision_note || '—', Number(d.preliminary_deduction_days || 0), Number(d.final_deduction_days ?? d.preliminary_deduction_days ?? 0), result,
        ]);
        if (decision === 'accepted') row.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.softGreen } };
        else if (decision === 'rejected' || decision === 'none') row.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.softRed } };
        else row.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.softAmber } };
      }
      if (!processDays.length) processing.addRow(['','','','','لا توجد حالات تحتاج تبريرًا أو معالجة في هذه الدفعة.']);
      styleBody(processing, processStart, processing.lastRow.number, processHeaders.length);
      processing.columns = [12,24,13,22,38,24,22,34,12,14,42].map((width) => ({ width }));
      setupSheet(processing, processHeaderRow.number, processHeaders.length);

      // 3) Final dashboard
      const final = workbook.addWorksheet('3- النتيجة النهائية', { views: [{ rightToLeft: true }] });
      const finalHeaders = ['رقم الموظف','الموظف','أيام الحضور الكامل','أيام الغياب المحتسبة','تفويت بصمة حضور','تفويت بصمة انصراف','ساعات العمل المحسوبة','ساعات العمل الافتراضية','إجمالي التأخير','إجمالي الخروج المبكر','الوقت الزائد المرصود','إجمالي الخصم النهائي'];
      addTitle(final, 'النتيجة النهائية', `${client} — الفترة ${period}. هذه الورقة هي خلاصة ما انتهت إليه المعالجة بعد تطبيق قرارات التبريرات المتاحة.`, finalHeaders.length);
      final.addRow([]);
      const finalHeaderRow = final.addRow(finalHeaders);
      styleHeader(finalHeaderRow);

      const groups = new Map();
      for (const d of days) {
        const key = subjectKey(d);
        if (!groups.has(key)) groups.set(key, { no: d.subject_no || '', name: d.subject_name || '', complete: 0, absent: 0, missIn: 0, missOut: 0, worked: 0, scheduled: 0, late: 0, earlyOut: 0, extra: 0, deduction: 0 });
        const g = groups.get(key);
        const finalDeduction = Number(d.final_deduction_days ?? d.preliminary_deduction_days ?? 0);
        if (d.day_status === 'complete') g.complete += 1;
        if (d.day_status === 'absent' && finalDeduction > 0) g.absent += 1;
        if (d.day_status === 'missing_in' && finalDeduction > 0) g.missIn += 1;
        if (d.day_status === 'missing_out' && finalDeduction > 0) g.missOut += 1;
        g.worked += Number(d.worked_minutes || 0);
        if (!['day_off','no_schedule'].includes(d.day_status)) g.scheduled += minutesBetween(d.scheduled_start, d.scheduled_end);
        g.late += Math.max(0, Number(d.late_arrival_minutes ?? d.arrival_delta_minutes ?? 0));
        g.earlyOut += Math.max(0, Number(d.early_departure_minutes ?? (Number(d.departure_delta_minutes || 0) < 0 ? -Number(d.departure_delta_minutes || 0) : 0));
        g.extra += Math.max(0, Number(d.late_departure_minutes ?? d.departure_delta_minutes ?? 0));
        g.deduction += finalDeduction;
      }

      const finalStart = finalHeaderRow.number + 1;
      [...groups.values()].sort((a, b) => String(a.no || a.name).localeCompare(String(b.no || b.name), 'ar')).forEach((g) => {
        final.addRow([g.no, g.name, g.complete, g.absent, g.missIn, g.missOut, hhmm(g.worked), hhmm(g.scheduled), hhmm(g.late), hhmm(g.earlyOut), hhmm(g.extra), Number(g.deduction.toFixed(2))]);
      });
      styleBody(final, finalStart, final.lastRow.number, finalHeaders.length);
      final.columns = [12,24,16,18,18,18,20,20,16,18,18,18].map((width) => ({ width }));
      setupSheet(final, finalHeaderRow.number, finalHeaders.length);

      const safe = String(client).replace(/[\\/:*?"<>|]/g, '-').slice(0, 70);
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `تقرير_الحضور_${safe}_${activeImport.period_from || ''}_${activeImport.period_to || ''}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return <span style={{display:'inline-flex',flexDirection:'column',gap:6}}>
    <button className="btn" type="button" disabled={disabled || busy || !activeImport?.id} onClick={exportReport}>{busy ? 'جارٍ إعداد تقرير العميل…' : 'تقرير العميل Excel'}</button>
    {err && <span className="hint" style={{color:'#8B2E2E'}}>{err}</span>}
  </span>;
}
