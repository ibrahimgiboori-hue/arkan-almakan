-- تنظيف ما بعد توحيد محرك ميزانية التشغيل.
-- الكتابة لم تعد تمر عبر RLS edit policies؛ كل التعديل عبر RPC موحد، لذلك تبقى سياسات SELECT فقط.
drop policy if exists budget_edit_definitions on public.budget_item_definitions;
drop policy if exists budget_edit_schedules on public.budget_item_schedules;
drop policy if exists budget_edit_bands on public.budget_tariff_bands;
drop policy if exists budget_edit_branches on public.company_branches;

-- فهارس العلاقات المستخدمة في التاريخ، التسويات، الإقفال، والمخصصات.
create index if not exists idx_budget_item_definitions_created_by on public.budget_item_definitions(created_by);
create index if not exists idx_budget_item_schedules_created_by on public.budget_item_schedules(created_by);
create index if not exists idx_budget_line_settlements_recorded_by on public.budget_line_settlements(recorded_by);
create index if not exists idx_budget_obligation_estimate_events_obligation_id on public.budget_obligation_estimate_events(obligation_id);
create index if not exists idx_budget_obligation_estimate_events_changed_by on public.budget_obligation_estimate_events(changed_by);
create index if not exists idx_budget_obligations_schedule_id on public.budget_obligations(schedule_id);
create index if not exists idx_budget_period_cash_events_created_by on public.budget_period_cash_events(created_by);
create index if not exists idx_budget_period_cash_events_treasury_movement_id on public.budget_period_cash_events(treasury_movement_id);
create index if not exists idx_budget_period_lines_confirmed_by on public.budget_period_lines(confirmed_by);
create index if not exists idx_budget_period_lines_overridden_by on public.budget_period_lines(overridden_by);
create index if not exists idx_budget_period_lines_rate_version_id on public.budget_period_lines(rate_version_id);
create index if not exists idx_budget_period_reopen_log_period_id on public.budget_period_reopen_log(period_id);
create index if not exists idx_budget_period_reopen_log_reclosed_by on public.budget_period_reopen_log(reclosed_by);
create index if not exists idx_budget_period_reopen_log_reopened_by on public.budget_period_reopen_log(reopened_by);
create index if not exists idx_budget_periods_closed_by on public.budget_periods(closed_by);
create index if not exists idx_budget_periods_opened_by on public.budget_periods(opened_by);
create index if not exists idx_budget_rate_versions_created_by on public.budget_rate_versions(created_by);
create index if not exists idx_budget_rate_versions_verified_by on public.budget_rate_versions(verified_by);
create index if not exists idx_budget_reserve_movements_period_id on public.budget_reserve_movements(period_id);
create index if not exists idx_budget_reserve_movements_recorded_by on public.budget_reserve_movements(recorded_by);
create index if not exists idx_budget_reserve_movements_reverses_movement_id on public.budget_reserve_movements(reverses_movement_id);
create index if not exists idx_budget_reserve_movements_source_settlement_id on public.budget_reserve_movements(source_settlement_id);
