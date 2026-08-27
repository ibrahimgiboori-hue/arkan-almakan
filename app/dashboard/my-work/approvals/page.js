import { redirect } from 'next/navigation';

export default function LegacyMyApprovalsPage() {
  redirect('/dashboard/approvals');
}
