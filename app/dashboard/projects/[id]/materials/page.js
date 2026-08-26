import { redirect } from 'next/navigation';

export default function ProjectMaterialsPage({ params }) {
  redirect(`/dashboard/projects/${params.id}?view=docs`);
}
