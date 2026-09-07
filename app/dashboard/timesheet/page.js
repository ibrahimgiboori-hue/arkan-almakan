import { redirect } from 'next/navigation';

// مسار توافق فقط بعد إلغاء واجهة التايم شيت الأسبوعية القديمة.
// التشغيل الحقيقي للحضور والتايم شيت أصبح داخل كل مشروع.
export default function LegacyTimesheetRedirect() {
  redirect('/dashboard/projects');
}
