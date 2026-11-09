import { redirect } from 'next/navigation';

// المصروفات سجل واحد داخل كل مشروع (المشروع ← المصروفات).
export default function LegacyExpensesRedirect() {
  redirect('/dashboard/projects');
}
