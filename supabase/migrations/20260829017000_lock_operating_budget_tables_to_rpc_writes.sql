revoke all on table
  public.company_branches,
  public.budget_item_definitions,
  public.budget_item_schedules,
  public.budget_rate_versions,
  public.budget_tariff_bands,
  public.budget_obligations,
  public.budget_obligation_estimate_events,
  public.budget_periods,
  public.budget_period_reopen_log,
  public.budget_period_cash_events,
  public.budget_period_lines,
  public.budget_line_settlements,
  public.budget_reserve_movements
from authenticated;

grant select on table
  public.company_branches,
  public.budget_item_definitions,
  public.budget_item_schedules,
  public.budget_rate_versions,
  public.budget_tariff_bands,
  public.budget_obligations,
  public.budget_obligation_estimate_events,
  public.budget_periods,
  public.budget_period_reopen_log,
  public.budget_period_cash_events,
  public.budget_period_lines,
  public.budget_line_settlements,
  public.budget_reserve_movements
to authenticated;
