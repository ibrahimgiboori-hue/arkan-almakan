'use client';

import { useEffect, useState } from 'react';
import DocumentForm from '@/components/DocumentForm';
import ProjectReportDocumentForm from '@/components/documents/ProjectReportDocumentForm';
import DocumentSmartFillPanel from '@/components/documents/DocumentSmartFillPanel';
import LegacyDocumentSmartFillPanel from '@/components/documents/LegacyDocumentSmartFillPanel';
import SalaryCertificateDocumentForm from '@/components/documents/SalaryCertificateDocumentForm';
import ProjectProgressSmartFillPanel, {
  DAILY_PROGRESS_CODE,
  ACHIEVEMENT_LOG_CODE,
} from '@/components/documents/ProjectProgressSmartFillPanel';
import { supabase } from '@/lib/supabase';

const REPORT_CODE = 'PROJECT_WORK_CLAIMS_REPORT_V1';
const SALARY_CERT_CODE = 'SALARY_CERT';

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

  const activeCode = code || resolvedCode || undefined;
  if (activeCode === SALARY_CERT_CODE) {
    return <SalaryCertificateDocumentForm docId={docId || undefined} />;
  }

  if (activeCode === DAILY_PROGRESS_CODE || activeCode === ACHIEVEMENT_LOG_CODE) {
    return <>
      <ProjectProgressSmartFillPanel code={activeCode} docId={docId || undefined} />
      <DocumentForm code={activeCode} docId={docId || undefined} />
    </>;
  }

  return <>
    <DocumentSmartFillPanel code={activeCode} docId={docId || undefined} />
    <LegacyDocumentSmartFillPanel code={activeCode} docId={docId || undefined} />
    <DocumentForm code={activeCode} docId={docId || undefined} />
  </>;
}
