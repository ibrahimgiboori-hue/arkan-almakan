-- ترحيل الهيكل الحالي والتحقق من صحة العلاقات
-- لا يحذف النصوص القديمة ولا يخترع منصبًا أعلى من الواقع.

create index if not exists idx_employees_org_classification on employees(org_classification_id);
create index if not exists idx_employees_org_position on employees(org_position_id);
create index if not exists idx_employees_org_job_title on employees(org_job_title_id);
create index if not exists idx_org_positions_classification on org_positions(classification_id);
create index if not exists idx_org_position_titles_job on org_position_job_titles(job_title_id);

insert into org_job_titles (code,name_ar,sort_order)
select 'legacy_' || substr(md5(trim(e.job_title)),1,12),trim(e.job_title),500
from employees e
where nullif(trim(e.job_title),'') is not null
  and not exists (select 1 from org_job_titles j where j.name_ar=trim(e.job_title))
group by trim(e.job_title)
on conflict (name_ar) do nothing;

with c as (select id from org_classifications where code<>'board')
insert into org_positions (classification_id,code,name_ar,sort_order)
select c.id,'staff','موظف',900 from c
on conflict (classification_id,code) do nothing;

update employees e set org_classification_id=c.id
from org_classifications c
where e.person_kind::text='board' and c.code='board' and e.org_classification_id is null;

update employees e set org_classification_id=c.id
from org_classifications c
where e.person_kind::text<>'board' and e.org_classification_id is null
and c.code=case
  when replace(replace(trim(coalesce(e.department,'')),' ',''),'أ','ا') in ('الادارةالتنفيذية','الادارةالعامة') then 'executive'
  when replace(trim(coalesce(e.department,'')),' ','')='المواردالبشرية' then 'hr'
  when replace(trim(coalesce(e.department,'')),' ','') in ('التسويقوالمبيعات','التسويقوالمبيعات') then 'contracts'
  when replace(trim(coalesce(e.department,'')),' ','') in ('الموظفينبدوامجزئي','الموظفونبدوامجزئي') then 'part_time'
  else null end;

update employees e set org_job_title_id=j.id
from org_job_titles j
where e.org_job_title_id is null and nullif(trim(e.job_title),'') is not null and j.name_ar=trim(e.job_title);

update employees e set org_position_id=p.id
from org_positions p join org_classifications c on c.id=p.classification_id and c.code='board'
where e.person_kind::text='board' and e.org_position_id is null
and p.code=case trim(coalesce(e.board_role,''))
  when 'رئيس مجلس الإدارة' then 'chairman'
  when 'نائب الرئيس' then 'vice_chairman'
  when 'نائب رئيس مجلس الإدارة' then 'vice_chairman'
  when 'العضو المنتدب' then 'managing_director'
  when 'عضو مجلس إدارة' then 'board_member'
  when 'أمين السر' then 'board_secretary'
  when 'أمين سر مجلس الإدارة' then 'board_secretary'
  else null end;

update employees e set org_position_id=p.id
from org_positions p
where e.person_kind::text<>'board'
  and e.org_classification_id=p.classification_id
  and e.org_position_id is null
  and p.code='staff';

insert into org_position_job_titles(position_id,job_title_id)
select distinct e.org_position_id,e.org_job_title_id
from employees e
where e.org_position_id is not null and e.org_job_title_id is not null
on conflict (position_id,job_title_id) do update set is_active=true;

create or replace function validate_employee_org_assignment()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_position_classification uuid;
  v_classification_code text;
  v_classification_name text;
  v_position_name text;
  v_title_name text;
begin
  if new.org_position_id is not null then
    select p.classification_id,p.name_ar into v_position_classification,v_position_name
    from org_positions p where p.id=new.org_position_id and p.is_active;
    if v_position_classification is null then raise exception 'المنصب المحدد غير موجود أو غير نشط'; end if;
    if new.org_classification_id is null then new.org_classification_id:=v_position_classification;
    elsif new.org_classification_id<>v_position_classification then raise exception 'المنصب المحدد لا يتبع التصنيف المختار'; end if;
  end if;

  if new.org_classification_id is not null then
    select code,name_ar into v_classification_code,v_classification_name
    from org_classifications where id=new.org_classification_id and is_active;
    if v_classification_code is null then raise exception 'التصنيف المحدد غير موجود أو غير نشط'; end if;
  end if;

  if new.org_job_title_id is not null then
    select name_ar into v_title_name from org_job_titles where id=new.org_job_title_id and is_active;
    if v_title_name is null then raise exception 'المسمى الوظيفي المحدد غير موجود أو غير نشط'; end if;
    if new.org_position_id is not null and not exists (
      select 1 from org_position_job_titles m
      where m.position_id=new.org_position_id and m.job_title_id=new.org_job_title_id and m.is_active
    ) then raise exception 'المسمى الوظيفي غير مسموح لهذا المنصب'; end if;
    new.job_title:=v_title_name;
  end if;

  if v_classification_code='board' then
    new.person_kind:='board'::person_kind;
    if new.org_position_id is not null then new.board_role:=v_position_name; end if;
  elsif v_classification_code is not null then
    if new.person_kind::text='board' then new.person_kind:='employee'::person_kind; end if;
    new.board_role:=null;
    new.department:=v_classification_name;
  end if;

  return new;
end $$;

drop trigger if exists trg_validate_employee_org_assignment on employees;
create trigger trg_validate_employee_org_assignment
before insert or update of org_classification_id,org_position_id,org_job_title_id on employees
for each row execute function validate_employee_org_assignment();
