import { redirect } from 'next/navigation';

// التايم شيت الأسبوعي القديم أُلغي: الحضور سجل واحد داخل كل مشروع (المشروع ← الحضور).
export default function LegacyTimesheetLayout() {
  redirect('/dashboard/projects');
}
