import { redirect } from 'next/navigation';

export default function ProjectDocumentsPage({ params }) {
  redirect(`/dashboard/projects/${params.id}?view=docs`);
}
