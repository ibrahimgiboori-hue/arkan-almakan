import fs from 'node:fs';

const path = 'app/dashboard/attendance/page.js';
let s = fs.readFileSync(path, 'utf8');

function once(from, to) {
  if (s.includes(to)) return;
  if (!s.includes(from)) throw new Error(`Missing snippet: ${from.slice(0, 120)}`);
  s = s.replace(from, to);
}

once(
  "import { useDashboardSession } from '@/lib/dashboard-session-context';",
  "import { useDashboardSession } from '@/lib/dashboard-session-context';\nimport AttendanceCalibrationPanel from '@/components/attendance/AttendanceCalibrationPanel';\nimport AttendanceClientExcelReport from '@/components/attendance/AttendanceClientExcelReport';"
);

s = s.replace("no_schedule:'لا يوجد روتين'", "no_schedule:'ساعات الدوام غير محددة'");
s = s.replace("uploaded:'مرفوع', parsed:'تم الاستخراج', analyzed:'تم التحليل'", "uploaded:'مرفوع', parsed:'تم الاستخراج', calibrated:'تمت معايرة ساعات الدوام', analyzed:'تم التحليل'");
s = s.replace("const STAGE_ORDER = ['parsed','analyzed'", "const STAGE_ORDER = ['parsed','calibrated','analyzed'");
s = s.replace("<p className=\"hint\" style={{marginTop:10}}>الرفع لا يحسب خصمًا رسميًا ولا يرحّل شيئًا. بعد الاستخراج تراجع الأشخاص والروتين ثم تبدأ التحليل.</p>", "<p className=\"hint\" style={{marginTop:10}}>الرفع لا يحسب خصمًا رسميًا ولا يرحّل شيئًا. بعد الاستخراج يعاير البرنامج ساعات الدوام من البصمات، ثم تراجع الاستثناءات وتبدأ التحليل.</p>");
s = s.replace("          {stage==='parsed'&&<button className=\"btn\" disabled={busy} onClick={()=>runStage('analyze')}>تحليل البيانات</button>}\n", "");

once(
  "          <button className=\"btn ghost\" disabled={busy} onClick={exportWorkbook}>تصدير Excel للحالة الحالية</button>",
  "          <button className=\"btn ghost\" disabled={busy} onClick={exportWorkbook}>ملف المراجعة Excel</button>\n          <AttendanceClientExcelReport activeImport={activeImport} disabled={busy || !['recalculated','ready_to_post','posted','closed'].includes(stage)} />"
);

once(
  "    {activeImport && !['posted','closed'].includes(stage) && <div className=\"section\">\n      <header><h2>روتين الدوام للدفعة</h2><span className=\"hint\">التحليل يعتمد على الروتين لتحديد الدخول والخروج والانحرافات.</span></header>",
  "    <AttendanceCalibrationPanel activeImport={activeImport} employees={employees} externalPeople={externalPeople} onRefresh={async()=>{ if(activeImport?.id){ await loadImports(activeImport.id); await loadActive(activeImport.id); } }} />\n\n    {activeImport && !['posted','closed'].includes(stage) && <div className=\"section\">\n      <header><h2>مراجعة / تعديل ساعات الدوام</h2><span className=\"hint\">استخدم هذا القسم فقط لتعديل الحالات التي لم يستطع البرنامج معايرتها بثقة أو لتسجيل ساعات دوام معتمدة من العميل.</span></header>"
);

s = s.replace('<label>اسم الروتين</label>', '<label>وصف ساعات الدوام</label>');
s = s.replace('تم حفظ الروتين. لا يوجد أثر رسمي قبل الترحيل.', 'تم حفظ ساعات الدوام. لا يوجد أثر رسمي قبل الترحيل.');
s = s.replace('كل يوم عمل يحتاج وقت بداية ونهاية.', 'كل يوم عمل يحتاج ساعة بداية وساعة نهاية.');
s = s.replace('اختر الشخص وحدد بداية سريان الروتين.', 'اختر الشخص وحدد بداية سريان ساعات الدوام.');
s = s.replace('>حفظ الروتين</button>', '>حفظ ساعات الدوام</button>');
s = s.replace('<th>الروتين</th>', '<th>ساعات الدوام</th>');

fs.writeFileSync(path, s);

const reportPath = 'components/attendance/AttendanceClientExcelReport.js';
let r = fs.readFileSync(reportPath, 'utf8');
r = r.replaceAll(
  "Math.max(0, Number(d.early_departure_minutes ?? (Number(d.departure_delta_minutes || 0) < 0 ? -Number(d.departure_delta_minutes || 0) : 0));",
  "Math.max(0, Number(d.early_departure_minutes ?? (Number(d.departure_delta_minutes || 0) < 0 ? -Number(d.departure_delta_minutes || 0) : 0)));"
);
fs.writeFileSync(reportPath, r);
