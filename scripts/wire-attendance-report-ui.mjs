import fs from 'node:fs';

const path = 'app/dashboard/attendance/page.js';
let s = fs.readFileSync(path, 'utf8');

function once(from, to) {
  if (s.includes(to)) return;
  if (!s.includes(from)) throw new Error(`Missing snippet: ${from.slice(0, 120)}`);
  s = s.replace(from, to);
}

once(
  "import AttendanceClientExcelReport from '@/components/attendance/AttendanceClientExcelReport';",
  "import AttendanceClientExcelReport from '@/components/attendance/AttendanceClientExcelReport';\nimport AttendanceProcessingTable from '@/components/attendance/AttendanceProcessingTable';\nimport AttendanceJustificationDialog from '@/components/attendance/AttendanceJustificationDialog';"
);

const processedStart = '    {activeImport && stageIndex(stage)>=stageIndex(\'analyzed\') && <div className="section">';
const justificationStart = '    {selectedDay && activeImport && ![\'posted\',\'closed\'].includes(stage) && <div className="section">';
const eventsStart = '    {activeImport && events.length>0 && <div className="section">';

if (s.includes(processedStart)) {
  const a = s.indexOf(processedStart);
  const b = s.indexOf(justificationStart, a);
  if (b < 0) throw new Error('Could not locate justification block after processed table');
  s = s.slice(0,a) + `    {activeImport && stageIndex(stage)>=stageIndex('analyzed') && <AttendanceProcessingTable days={days} stage={stage} onOpenJustification={openJustification} />}\n\n` + s.slice(b);
}

if (s.includes(justificationStart)) {
  const a = s.indexOf(justificationStart);
  const b = s.indexOf(eventsStart, a);
  if (b < 0) throw new Error('Could not locate events block after justification panel');
  const replacement = `    {selectedDay && activeImport && !['posted','closed'].includes(stage) && <AttendanceJustificationDialog day={selectedDay} isPrimary={isPrimary} onClose={()=>setSelectedDay(null)} onRefresh={async()=>{ await loadActive(activeImport.id); await loadImports(activeImport.id); }} />}\n\n`;
  s = s.slice(0,a) + replacement + s.slice(b);
}

fs.writeFileSync(path, s);

const reportPath = 'components/attendance/AttendanceClientExcelReport.js';
let r = fs.readFileSync(reportPath, 'utf8');
if (!r.includes('const JUSTIFICATION_AR =')) {
  r = r.replace(
    "const DECISION_AR = {\n  accepted: 'مقبول',\n  rejected: 'غير مقبول',\n  pending: 'بانتظار القرار',\n};",
    "const DECISION_AR = {\n  accepted: 'مقبول',\n  rejected: 'غير مقبول',\n  pending: 'بانتظار القرار',\n};\n\nconst JUSTIFICATION_AR = {\n  sick_leave:'إجازة مرضية', approved_leave:'إجازة معتمدة', non_working_day:'اليوم غير ضمن أيام العمل',\n  outside_work:'عمل خارج المركز', biometric_device_issue:'مشكلة تقنية في جهاز البصمة', forgot_punch:'نسيان البصمة',\n  approved_shift_change:'تغيير ساعات دوام / شفت معتمد', approved_late_early_permission:'إذن تأخير أو خروج معتمد',\n  training_meeting_assignment:'تدريب / اجتماع / تكليف رسمي', other_site_branch:'العمل في فرع أو موقع آخر', other:'أخرى',\n};"
  );
}
r = r.replace(
  "const processHeaders = ['رقم الموظف','الموظف','التاريخ','الحالة الأولية','التبرير المقدم','المرجع / المستند','قرار صاحب العمل','ملاحظة القرار','الخصم الأولي','الخصم بعد القرار','النتيجة'];",
  "const processHeaders = ['رقم الموظف','الموظف','التاريخ','الحالة الأولية','نوع التبرير','تفاصيل التبرير','المرجع / المستند','قرار صاحب العمل','ملاحظة القرار','الخصم الأولي','الخصم بعد القرار','النتيجة'];"
);
r = r.replace(
  "d.justification_text || 'لا يوجد تبرير', d.paper_reference || '—', decision === 'none' ? 'لا يوجد تبرير' : (DECISION_AR[decision] || decision),",
  "d.justification_id ? (JUSTIFICATION_AR[d.justification_type] || 'تبرير مسجل') : 'لا يوجد تبرير', d.justification_text || '—', d.paper_reference || '—', decision === 'none' ? 'لا يوجد تبرير' : (DECISION_AR[decision] || decision),"
);
r = r.replace(
  "if (decision === 'accepted') row.getCell(7).fill",
  "if (decision === 'accepted') row.getCell(8).fill"
);
r = r.replace(
  "if (decision === 'rejected') row.getCell(7).fill",
  "if (decision === 'rejected') row.getCell(8).fill"
);
r = r.replace(
  "if (decision === 'pending') row.getCell(7).fill",
  "if (decision === 'pending') row.getCell(8).fill"
);
fs.writeFileSync(reportPath, r);

const calibrationPath = 'components/attendance/AttendanceCalibrationPanel.js';
let c = fs.readFileSync(calibrationPath, 'utf8');
c = c.replace('تمت معايرة ساعات الدوام جماعيًا من الملف على رؤوس الساعات.','تمت معايرة ساعات الدوام جماعيًا باعتماد النمط الأكثر تكرارًا فعليًا، مع تثبيت الساعات على رأس الساعة.');
c = c.replace('يستنتج البرنامج ساعات الدوام من تجمع البصمات حول رأس الساعة :00، ثم تراجع الاستثناءات فقط.','يستنتج البرنامج ساعات الدوام من النمط الأكثر تكرارًا فعليًا لحركات البصمة حول رأس الساعة :00؛ التعادل فقط يُحال للمراجعة.');
c = c.replace(
  "        {activeImport.status==='parsed'&&<button className=\"btn\" disabled={busy} onClick={()=>act('calibrate')}>معايرة ساعات الدوام من الملف</button>}",
  "        {activeImport.status==='parsed'&&<button className=\"btn\" disabled={busy} onClick={()=>act('calibrate')}>معايرة ساعات الدوام من الملف</button>}\n        {['calibrated','analyzed','recalculated','ready_to_post'].includes(activeImport.status)&&<button className=\"btn ghost\" disabled={busy} onClick={()=>act('calibrate')}>إعادة معايرة ساعات الدوام</button>}"
);
fs.writeFileSync(calibrationPath, c);
