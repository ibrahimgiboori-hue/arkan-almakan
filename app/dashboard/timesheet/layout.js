import { redirect } from 'next/navigation';

export default function LegacyTimesheetLayout() {
  redirect('/dashboard/site-operations');
}
