import { redirect } from 'next/navigation';

export default function InvoiceRequestRedirect({ params }) {
  redirect(`/print/claim/${params.id}?doc=memo`);
}
