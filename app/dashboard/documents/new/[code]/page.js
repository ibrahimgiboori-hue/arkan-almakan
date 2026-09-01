'use client';
import { useParams } from 'next/navigation';
import DocumentFormRouter from '@/components/documents/DocumentFormRouter';

export default function NewDocument() {
  const { code } = useParams();
  return <DocumentFormRouter code={code} />;
}
