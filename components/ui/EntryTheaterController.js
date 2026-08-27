'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { dataEntryTheaterFor } from '@/lib/ui-governance';

export default function EntryTheaterController() {
  const pathname = usePathname();
  const router = useRouter();
  const theater = dataEntryTheaterFor(pathname);

  useEffect(() => {
    if (!theater) {
      delete document.body.dataset.entryTheater;
      return undefined;
    }
    document.body.dataset.entryTheater = 'true';
    return () => { delete document.body.dataset.entryTheater; };
  }, [theater?.key]);

  if (!theater) return null;

  function goBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(theater.fallback || '/dashboard/workspace');
  }

  return (
    <header className="constitution-entry-theater-bar" data-entry-theater-bar="true">
      <button type="button" className="constitution-entry-theater-back" onClick={goBack}>
        <span aria-hidden="true">←</span>
        <span>رجوع</span>
      </button>
      <div className="constitution-entry-theater-heading">
        <span>{theater.description || 'مساحة إدخال'}</span>
        <strong>{theater.title}</strong>
      </div>
    </header>
  );
}
