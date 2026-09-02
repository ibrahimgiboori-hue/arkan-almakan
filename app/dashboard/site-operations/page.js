import { redirect } from 'next/navigation';

export default function LegacySiteOperationsPage() {
  redirect('/dashboard/projects');
}
