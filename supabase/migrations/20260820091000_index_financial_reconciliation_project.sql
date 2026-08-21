-- يغطي مفتاح المشروع في سجل المطابقة عند المراجعة أو حذف المشروع.
create index if not exists financial_reconciliation_project_idx
  on public.financial_reconciliation_audit (project_id, recorded_at desc);
