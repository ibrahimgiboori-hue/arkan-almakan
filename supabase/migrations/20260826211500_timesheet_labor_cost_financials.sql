-- التايم شيت مصدر تكلفة العمالة الفعلية للمشروع.
-- الدفعات اللاحقة للمقاول/العامل تسوية للمستحق ولا تُنشئ تكلفة ثانية هنا.
-- نحافظ على ترتيب أعمدة الـView القديم، ونضيف labor_cost في النهاية للتوافق مع المستهلكين الحاليين.
create or replace view public.v_project_financials as
with earned as (
  select project_id,sum(earned_value) as earned_value,sum(contract_value) as contract_total,sum(budget_value) as budget_total
  from public.v_item_progress group by project_id
), claimed as (
  select project_id,
         sum(gross_amount) as claimed_gross,
         sum(case when status='collected' then coalesce(collected_amount,net_payable) else 0 end) as collected,
         sum(case when status in ('submitted','owner_approved','invoiced') then net_payable else 0 end) as pending_collection,
         sum(retention_amount) as retention_held
  from public.progress_claims group by project_id
), mats as (
  select project_id,sum(total_cost) as material_cost from public.project_materials group by project_id
), labor as (
  select d.project_id,sum(a.amount) as labor_cost
  from public.attendance a
  join public.timesheet_days d on d.id=a.day_id
  group by d.project_id
), cust as (
  select c.project_id,
         sum(case when t.direction='spend' and t.charge_to='arkan' then t.amount else 0 end) as spent_arkan,
         sum(case when t.direction='spend' and t.charge_to='owner' then t.amount else 0 end) as spent_owner,
         sum(case when t.direction='spend' and t.charge_to='contractor' then t.amount else 0 end) as spent_contractor,
         sum(case when t.direction='spend' then t.amount else 0 end) as spent_total,
         sum(case when t.direction='issue' then t.amount when t.direction in ('spend','return') then -t.amount else 0 end) as custody_balance
  from public.custodies c left join public.custody_transactions t on t.custody_id=c.id
  where c.project_id is not null group by c.project_id
), direct_exp as (
  select ce.project_id,
         sum(case when ce.charge_to='arkan' and coalesce(ce.is_recoverable,false)=false and not (ce.payer='arkan_custody' and ce.custody_trx_id is not null) then ce.amount else 0 end) as expense_cost_arkan,
         sum(case when ce.charge_to='owner' then ce.amount else 0 end) as expense_charged_owner,
         sum(case when ce.charge_to='contractor' then ce.amount else 0 end) as expense_charged_contractor
  from public.contractor_expenses ce group by ce.project_id
), rec as (
  select project_id,pending_recovery from public.v_owner_recoverables
)
select p.id as project_id,
       p.project_no,
       p.name_ar,
       p.stage,
       p.supply_scope,
       p.contract_value,
       p.commencement_date,
       p.duration_days,
       case when p.commencement_date is not null and p.duration_days is not null then p.commencement_date+p.duration_days-current_date else null end as days_remaining,
       coalesce(e.earned_value,0) as earned_value,
       coalesce(e.budget_total,0) as budget_total,
       case when coalesce(e.contract_total,0)>0 then round(coalesce(e.earned_value,0)/e.contract_total*100,2) else 0 end as computed_progress_pct,
       p.manual_progress_pct,
       coalesce(c.claimed_gross,0) as claimed_gross,
       coalesce(c.collected,0) as collected,
       coalesce(c.pending_collection,0) as pending_collection,
       coalesce(c.retention_held,0) as retention_held,
       case when p.supply_scope='labor_only' then 0 else coalesce(m.material_cost,0) end as material_cost,
       coalesce(cu.spent_total,0) as custody_spent,
       coalesce(cu.spent_arkan,0) as custody_cost_arkan,
       coalesce(cu.spent_owner,0)+coalesce(dx.expense_charged_owner,0) as charged_to_owner,
       coalesce(cu.spent_contractor,0)+coalesce(dx.expense_charged_contractor,0) as charged_to_contractor,
       coalesce(cu.custody_balance,0) as custody_balance,
       coalesce(r.pending_recovery,0) as owner_recovery_pending,
       (case when p.supply_scope='labor_only' then 0 else coalesce(m.material_cost,0) end)+coalesce(l.labor_cost,0)+coalesce(cu.spent_arkan,0)+coalesce(dx.expense_cost_arkan,0) as direct_cost_known,
       coalesce(e.earned_value,0)-(case when p.supply_scope='labor_only' then 0 else coalesce(m.material_cost,0) end)-coalesce(l.labor_cost,0)-coalesce(cu.spent_arkan,0)-coalesce(dx.expense_cost_arkan,0) as current_profit,
       (select count(*) from public.project_items i where i.project_id=p.id and i.kind='item' and not public.item_has_decision(i.id)) as items_without_decision,
       (select count(*) from public.custody_transactions t2 where t2.project_id=p.id and t2.direction='spend' and t2.charge_to is null) as unclassified_spend,
       coalesce(dx.expense_cost_arkan,0) as expense_cost_arkan,
       coalesce(l.labor_cost,0) as labor_cost
from public.projects p
left join earned e on e.project_id=p.id
left join claimed c on c.project_id=p.id
left join mats m on m.project_id=p.id
left join labor l on l.project_id=p.id
left join cust cu on cu.project_id=p.id
left join direct_exp dx on dx.project_id=p.id
left join rec r on r.project_id=p.id;
