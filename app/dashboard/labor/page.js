import { redirect } from 'next/navigation';

export default function LaborRouter({ searchParams }) {
  const contractor = searchParams?.contractor || '';
  const add = searchParams?.add === '1';
  if (contractor) {
    redirect(`/dashboard/contractors/${contractor}/labor${add ? '?add=1' : ''}`);
  }
  redirect('/dashboard/site-operations');
}
