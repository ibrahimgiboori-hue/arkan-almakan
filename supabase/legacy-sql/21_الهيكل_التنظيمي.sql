-- الهيكل التنظيمي
-- التصنيف | المنصب | المسمى الوظيفي
-- منفصل عن صلاحيات استخدام البرنامج.

create table if not exists org_classifications (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_ar text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists org_positions (
  id uuid primary key default gen_random_uuid(),
  classification_id uuid not null references org_classifications(id) on delete cascade,
  code text not null,
  name_ar text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (classification_id, code),
  unique (classification_id, name_ar)
);

create table if not exists org_job_titles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_ar text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists org_position_job_titles (
  position_id uuid not null references org_positions(id) on delete cascade,
  job_title_id uuid not null references org_job_titles(id) on delete cascade,
  is_active boolean not null default true,
  primary key (position_id, job_title_id)
);

alter table employees add column if not exists org_classification_id uuid references org_classifications(id);
alter table employees add column if not exists org_position_id uuid references org_positions(id);
alter table employees add column if not exists org_job_title_id uuid references org_job_titles(id);

insert into org_classifications (code,name_ar,sort_order) values
('board','مجلس الإدارة',10),
('executive','الإدارة التنفيذية',20),
('finance','الإدارة المالية',30),
('projects','إدارة المشاريع',40),
('hr','الموارد البشرية',50),
('contracts','العقود والتطوير',60),
('quality','الجودة',70),
('part_time','الموظفون بدوام جزئي',80)
on conflict (code) do update set name_ar=excluded.name_ar,sort_order=excluded.sort_order;

with c as (select id,code from org_classifications)
insert into org_positions (classification_id,code,name_ar,sort_order)
select c.id,x.code,x.name_ar,x.sort_order
from c join (values
('board','chairman','رئيس مجلس الإدارة',10),
('board','vice_chairman','نائب رئيس مجلس الإدارة',20),
('board','managing_director','العضو المنتدب',30),
('board','board_member','عضو مجلس الإدارة',40),
('board','board_secretary','أمين سر مجلس الإدارة',50),
('executive','general_manager','المدير العام',10),
('executive','executive_manager','المدير التنفيذي',20),
('finance','finance_manager','المدير المالي',10),
('finance','financial_controller','المراقب المالي',20),
('projects','projects_manager','مدير المشاريع',10),
('projects','project_operations_manager','مدير عام عمليات المشاريع',20),
('hr','hr_manager','مدير الموارد البشرية',10),
('contracts','contracts_manager','مدير العقود والتطوير',10),
('quality','quality_manager','مدير الجودة',10),
('part_time','part_time_staff','موظف بدوام جزئي',10)
) as x(class_code,code,name_ar,sort_order) on x.class_code=c.code
on conflict (classification_id,code) do update set name_ar=excluded.name_ar,sort_order=excluded.sort_order;

insert into org_job_titles (code,name_ar,sort_order) values
('owner','مالك المنشأة',10),
('ceo','المدير التنفيذي',20),
('general_manager','المدير العام',30),
('financial_controller','المراقب المالي',40),
('finance_manager','المدير المالي',50),
('project_operations_director','مدير عام عمليات المشاريع',60),
('projects_manager','مدير المشاريع',70),
('hr_governance_specialist','أخصائي الموارد البشرية والحوكمة',80),
('contracts_bd_specialist','أخصائي عقود وتطوير',90),
('site_quality_engineer','مهندس جودة ومتابعة ميدانية',100),
('cost_control_engineer','مهندس تكاليف كميات',110)
on conflict (code) do update set name_ar=excluded.name_ar,sort_order=excluded.sort_order;

with p as (
 select op.id,op.code from org_positions op join org_classifications oc on oc.id=op.classification_id where oc.code='board'
), j as (select id,code from org_job_titles)
insert into org_position_job_titles(position_id,job_title_id)
select p.id,j.id from p join j on (
 (p.code='chairman' and j.code in ('owner','ceo','general_manager')) or
 (p.code='vice_chairman' and j.code in ('financial_controller','finance_manager','general_manager')) or
 (p.code='managing_director' and j.code in ('ceo','general_manager','financial_controller')) or
 (p.code='board_member' and j.code in ('financial_controller','finance_manager','general_manager','projects_manager')) or
 (p.code='board_secretary' and j.code in ('hr_governance_specialist','contracts_bd_specialist'))
) on conflict do nothing;

create or replace view v_org_options with (security_invoker=true) as
select oc.id classification_id,oc.code classification_code,oc.name_ar classification_name,
       op.id position_id,op.code position_code,op.name_ar position_name,
       jt.id job_title_id,jt.code job_title_code,jt.name_ar job_title_name
from org_classifications oc
join org_positions op on op.classification_id=oc.id and op.is_active
left join org_position_job_titles map on map.position_id=op.id and map.is_active
left join org_job_titles jt on jt.id=map.job_title_id and jt.is_active
where oc.is_active;

alter table org_classifications enable row level security;
alter table org_positions enable row level security;
alter table org_job_titles enable row level security;
alter table org_position_job_titles enable row level security;

create policy org_classifications_read on org_classifications for select to authenticated using (true);
create policy org_positions_read on org_positions for select to authenticated using (true);
create policy org_job_titles_read on org_job_titles for select to authenticated using (true);
create policy org_position_job_titles_read on org_position_job_titles for select to authenticated using (true);
