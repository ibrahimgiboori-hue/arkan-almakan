'use client';
import { useParams } from 'next/navigation';
import DocumentFormRouter from '@/components/documents/DocumentFormRouter';

export default function EditDocument() {
  const { id } = useParams();
  return <DocumentFormRouter docId={id} />;
}
