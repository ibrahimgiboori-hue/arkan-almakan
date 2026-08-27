'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import ApprovalGuidanceRow from './ApprovalGuidanceRow';

// المصدر يعرض حالة الاعتماد فقط عندما تكون الحالة جزءًا طبيعيًا من بياناته.
// مركز الاعتمادات نفسه هو المكان الوحيد لاتخاذ القرار؛ قسم الإدارة لا يكرر صندوق الاعتماد.
const DATA_KIND_SOURCES = Object.freeze({
  'finance-invoices': ['progress_claims'],
  'finance-cases': ['financial_cases'],
  'finance-payroll': ['payroll_runs'],
  'documents-review': ['documents'],
});

export default function ApprovalGuidanceList({ dataKind, compact = true }) {
  const [rows, setRows] = useState(null);
  const sources = useMemo(() => DATA_KIND_SOURCES[dataKind] || [], [dataKind]);

  const load = useCallback(async () => {
    if (!sources.length) { setRows([]); return; }
    const { data, error } = await supabase.rpc('fn_approval_guidance', { p_workflow_id:null });
    if (error) { setRows([]); return; }
    setRows((data || []).filter((row) => sources.includes(row.source_table)));
  }, [sources]);

  useEffect(() => { load(); }, [load]);

  if (!sources.length || !rows || rows.length === 0) return null;

  return (
    <div data-approval-context="true" style={{ borderBottom:'1px solid var(--line,#ddd)' }}>
      {rows.map((row) => (
        <ApprovalGuidanceRow key={row.workflow_id} guidance={row} compact={compact} />
      ))}
    </div>
  );
}
