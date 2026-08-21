import { redirect } from 'next/navigation';

export default function LegacyLaborPage() {
  redirect('/dashboard/site-operations');
}
