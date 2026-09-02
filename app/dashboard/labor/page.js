import { redirect } from 'next/navigation';

export default function LaborRouter({ searchParams }) {
  const contractor = searchParams?.contractor || '';
  if (contractor) redirect(`/dashboard/contractors/${contractor}/labor`);
  redirect('/dashboard/site-operations');
}