import { redirect } from 'next/navigation';

// عروض الأسعار سجل واحد للبرنامج كله؛ عروض مشروع معين = نفس السجل مفلترًا بالمشروع.
export default function ProjectQuotesRedirect({ params }) {
  redirect(`/dashboard/quotes?project=${params.id}`);
}
