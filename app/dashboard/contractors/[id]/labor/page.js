import { redirect } from 'next/navigation';

// مسار متقاعد: العمالة مدخلها الوحيد داخل المشروع، وصفحة المقاول تعرض مشاريعه.
// data-retired-labor-entry="contractor-level" — لا إنشاء عمالة من هنا.
export default function RetiredContractorLaborRoute({ params }) {
  redirect(`/dashboard/contractors/${params.id}`);
}
