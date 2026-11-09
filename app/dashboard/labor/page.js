import { redirect } from 'next/navigation';

// العمالة تُدار داخل المشروع (المشروع ← العمالة). صفحة المقاول تعرض مشاريعه فقط.
export default function LaborRouter({ searchParams }) {
  const contractor = searchParams?.contractor || '';
  redirect(contractor ? `/dashboard/contractors/${contractor}` : '/dashboard/contractors');
}
