'use client';

import { useEffect, useState } from 'react';
import DocumentForm from '@/components/DocumentForm';
import ProjectReportDocumentForm from '@/components/documents/ProjectReportDocumentForm';
import { supabase } from '@/lib/supabase';

const REPORT_CODE = 'PROJECT_WORK_CLAIMS_REPORT_V1';

export default function DocumentFormRouter({ code = null, docId = null }) {
  const [resolvedCode, setResolvedCode] = useState(code || '');
  const [loading, setLoading] = useState(!code && !!docId);

  useEffect(() => {
    if (code || !docId) return;
    let active = true;
    (async () => {
      const { data } = await supabase.from('documents').select('template_code').eq('id', docId).maybeSingle();
      if (!active) return;
      setResolvedCode(data?.template_code || '');
      setLoading(false);
    })();
    return () => { active = false; };
  }, [code, docId]);

  if (loading) return <div className="empty">جارٍ التحميل…</div>;
  if (resolvedCode === REPORT_CODE) return <ProjectReportDocumentForm docId={docId} />;
  return <DocumentForm code={code || resolvedCode || undefined} docId={docId || undefined} />;
}
