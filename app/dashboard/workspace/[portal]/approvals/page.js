import { redirect } from 'next/navigation';

// صندوق الاعتمادات واحد للبرنامج كله: «اعتماداتي».
export default function LegacyPortalApprovalsRedirect() {
  redirect('/dashboard/approvals');
}
