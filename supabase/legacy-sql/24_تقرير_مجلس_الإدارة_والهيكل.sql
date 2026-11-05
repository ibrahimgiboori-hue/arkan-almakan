create or replace view v_board_report with (security_invoker=true) as
select
  e.id,
  employee_seq(e.employee_no) as seq,
  e.employee_no,
  e.full_name_ar,
  e.full_name_en,
  e.id_number,
  e.id_expiry,
  e.nationality,
  e.person_kind,
  e.board_role,
  e.job_title,
  e.ownership_pct,
  e.appointed_at,
  e.mobile,
  e.email,
  e.status,
  e.duties,
  case when e.appointed_at is not null then round((current_date-e.appointed_at)::numeric/365.25,1) else null end as years_served,
  case e.person_kind
    when 'board'::person_kind then 'مجلس الإدارة'
    when 'owner'::person_kind then 'مالك'
    when 'partner'::person_kind then 'شريك'
    else 'موظف'
  end as kind_label,
  e.org_classification_id,
  e.org_position_id,
  e.org_job_title_id
from employees e
where e.person_kind <> 'employee'::person_kind
order by case e.person_kind when 'owner'::person_kind then 1 when 'partner'::person_kind then 2 when 'board'::person_kind then 3 else 4 end,
         employee_seq(e.employee_no);
