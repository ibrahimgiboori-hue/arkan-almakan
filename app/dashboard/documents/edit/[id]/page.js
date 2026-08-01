'use client';
import { useParams } from 'next/navigation';
import DocumentForm from '@/components/DocumentForm';

export default function EditDocument() {
  const { id } = useParams();
  return <DocumentForm docId={id} />;
}
