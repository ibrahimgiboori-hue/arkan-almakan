import { redirect } from 'next/navigation';

export default function LegacyExpensesPage() {
  redirect('/dashboard/site-operations');
}
