import { redirect } from 'next/navigation';

// تقارير التايم شيت مدخلها الوحيد داخل المشروع (المشروع ← تقارير التايم شيت).
export default function LegacyTimesheetReportsRedirect() {
  redirect('/dashboard/projects');
}
