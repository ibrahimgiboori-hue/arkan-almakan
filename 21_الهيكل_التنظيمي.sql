-- ============================================================
-- الملف 21 : الهيكل التنظيمي القابل للإدارة
-- التصنيف | المنصب | المسمى الوظيفي
--
-- الهدف:
-- 1. عدم تخزين الهيكل كقوائم ثابتة داخل React.
-- 2. الحفاظ على employees كسجل الشخص الموحد.
-- 3. فصل الهيكل التنظيمي عن صلاحية استخدام البرنامج.
-- 4. منع التركيبات غير المعرفة بين التصنيف والمنصب والمسمى.
-- ============================================================

-- ------------------------------------------------------------
-- 1. الجداول المرجعية
-- ------------------------------------------------------------
create table if not exists org_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_ar text not null unique,
  sort_order integer not null default 100,
  is_board boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists org_positions (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references org_categories(id) on delete cascade,
  code text not null,
  name_ar text not null,
  rank_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, code),
  unique (category_id, name_ar)
);

create table if not exists org_job_titles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_ar text not null unique,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists org_position_job_titles (
  position_id uuid not null references org_positions(id) on delete cascade,
  job_title_id uuid not null references org_job_titles(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (position_id, job_title_id)
);

comment on table org_categories is 'المستوى الأول الظاهر للمستخدم: التصنيف التنظيمي.';
comment on table org_positions is 'المستوى الثاني: المنصب المتاح داخل التصنيف.';
comment on table org_job_titles is 'المستوى الثالث: المسمى الوظيفي الفعلي.';
comment on table org_position_job_titles is 'التركيبات المسموح بها بين المنصب والمسمى الوظيفي.';

-- ------------------------------------------------------------
-- 2. ربط سجل الشخص الموحد بالهيكل الجديد
-- ------------------------------------------------------------
alter table employees add column if not exists org_category_id uuid references org_categories(id);
alter table employees add column if not exists org_position_id uuid references org_positions(id);
alter table employees add column if not exists org_job_title_id uuid references org_job_titles(id);

comment on column employees.org_category_id is 'التصنيف التنظيمي الحالي للشخص.';
comment on column employees.org_position_id is 'المنصب التنظيمي الحالي للشخص.';
comment on column employees.org_job_title_id is 'المسمى الوظيفي المرجعي الحالي للشخص.';

create index if not exists idx_employees_org_category on employees(org_category_id);
create index if not exists idx_employees_org_position on employees(org_position_id);
create index if not exists idx_employees_org_job_title on employees(org_job_title_id);
create index if not exists idx_org_positions_category on org_positions(category_id);
create index if not exists idx_org_position_titles_title on org_position_job_titles(job_title_id);

-- ------------------------------------------------------------
-- 3. التصنيفات الأساسية
-- ------------------------------------------------------------
insert into org_categories (code, name_ar, sort_order, is_board) values
  ('board',       'مجلس الإدارة',        10, true),
  ('executive',   'الإدارة التنفيذية',   20, false),
  ('finance',     'الإدارة المالية',     30, false),
  ('hr',          'الموارد البشرية',     40, false),
  ('projects',    'إدارة المشاريع',      50, false),
  ('operations',  'التشغيل',             60, false),
  ('contracts',   'العقود',              70, false),
  ('sales',       'التسويق والمبيعات',   80, false),
  ('procurement', 'المشتريات',           90, false),
  ('quality',     'الجودة',             100, false),
  ('safety',      'السلامة',            110, false),
  ('part_time',   'الموظفون بدوام جزئي', 120, false)
on conflict (code) do update set
  name_ar = excluded.name_ar,
  sort_order = excluded.sort_order,
  is_board = excluded.is_board;

-- نحافظ على أي إدارة مكتوبة حاليًا ولم تدخل في التصنيفات الأساسية.
insert into org_categories (code, name_ar, sort_order, is_board)
select
  'legacy_' || substr(md5(trim(e.department)), 1, 12),
  trim(e.department),
  900,
  false
from employees e
where nullif(trim(e.department), '') is not null
  and not exists (
    select 1 from org_categories c where c.name_ar = trim(e.department)
  )
group by trim(e.department)
on conflict (name_ar) do nothing;

-- ------------------------------------------------------------
-- 4. مناصب مجلس الإدارة
-- ------------------------------------------------------------
insert into org_positions (category_id, code, name_ar, rank_order)
select c.id, x.code, x.name_ar, x.rank_order
from org_categories c
cross join (values
  ('chairman',          'رئيس مجلس الإدارة',       10),
  ('vice_chairman',     'نائب رئيس مجلس الإدارة',  20),
  ('managing_director', 'العضو المنتدب',           30),
  ('board_member',      'عضو مجلس الإدارة',        40),
  ('board_secretary',   'أمين سر مجلس الإدارة',    50)
) as x(code, name_ar, rank_order)
where c.code = 'board'
on conflict (category_id, code) do update set
  name_ar = excluded.name_ar,
  rank_order = excluded.rank_order;

-- ------------------------------------------------------------
-- 5. مستويات تنظيمية عامة لبقية التصنيفات
-- لا تعني صلاحية دخول، وإنما مكان الشخص في الهيكل فقط.
-- ------------------------------------------------------------
insert into org_positions (category_id, code, name_ar, rank_order)
select c.id, x.code, x.name_ar, x.rank_order
from org_categories c
cross join (values
  ('department_manager', 'مدير الإدارة',  20),
  ('section_head',       'رئيس قسم',      40),
  ('supervisor',         'مشرف',          60),
  ('staff',              'موظف',          80)
) as x(code, name_ar, rank_order)
where c.code <> 'board'
on conflict (category_id, code) do update set
  name_ar = excluded.name_ar,
  rank_order = excluded.rank_order;

-- الإدارة التنفيذية لها مناصب إضافية واضحة.
insert into org_positions (category_id, code, name_ar, rank_order)
select c.id, x.code, x.name_ar, x.rank_order
from org_categories c
cross join (values
  ('chief_executive', 'المدير التنفيذي', 5),
  ('general_manager', 'المدير العام',    10)
) as x(code, name_ar, rank_order)
where c.code = 'executive'
on conflict (category_id, code) do update set
  name_ar = excluded.name_ar,
  rank_order = excluded.rank_order;

-- ------------------------------------------------------------
-- 6. المسميات الوظيفية الحالية تصبح مرجعًا بدل أن تبقى نصوصًا مبعثرة
-- ------------------------------------------------------------
insert into org_job_titles (code, name_ar, sort_order)
select
  'legacy_' || substr(md5(trim(e.job_title)), 1, 12),
  trim(e.job_title),
  500
from employees e
where nullif(trim(e.job_title), '') is not null
group by trim(e.job_title)
on conflict (name_ar) do nothing;

-- مسميات أساسية متكررة في الهيكل الإداري.
insert into org_job_titles (code, name_ar, sort_order) values
  ('owner',                'مالك المنشأة',        10),
  ('financial_controller', 'المراقب المالي',      20),
  ('finance_manager',      'المدير المالي',       30),
  ('project_ops_manager',  'مدير عام العمليات',   40),
  ('project_manager',      'مدير المشاريع',       50),
  ('project_engineer',     'مهندس مشروع',         60),
  ('accountant',           'محاسب',               70),
  ('quality_officer',      'مسؤول الجودة',        80)
on conflict (code) do nothing;

-- ------------------------------------------------------------
-- 7. ترحيل آمن للبيانات الحالية دون تغيير النصوص الأصلية
-- ------------------------------------------------------------
-- أعضاء المجلس.
update employees e
set org_category_id = c.id
from org_categories c
where c.code = 'board'
  and e.person_kind::text = 'board'
  and e.org_category_id is null;

-- بقية الأشخاص: نحاول المطابقة مع الإدارة الحالية كما هي أولًا.
update employees e
set org_category_id = c.id
from org_categories c
where e.person_kind::text <> 'board'
  and e.org_category_id is null
  and nullif(trim(e.department), '') is not null
  and c.name_ar = trim(e.department);

-- تطبيع أشهر الصيغ الحالية دون حذف النص القديم.
update employees e
set org_category_id = c.id
from org_categories c
where e.person_kind::text <> 'board'
  and e.org_category_id is null
  and c.code = case
    when replace(replace(trim(e.department), ' ', ''), 'أ', 'ا') in ('الادارةالتنفيذية','الادارةالعامة') then 'executive'
    when replace(trim(e.department), ' ', '') = 'المواردالبشرية' then 'hr'
    when replace(trim(e.department), ' ', '') in ('التسويقوالمبيعات','التسويقوالمبيعات') then 'sales'
    when replace(trim(e.department), ' ', '') in ('الموظفينبدوامجزئي','الموظفونبدوامجزئي') then 'part_time'
    else null
  end;

-- ربط المسميات الحالية بالمرجع الجديد.
update employees e
set org_job_title_id = j.id
from org_job_titles j
where e.org_job_title_id is null
  and nullif(trim(e.job_title), '') is not null
  and j.name_ar = trim(e.job_title);

-- ربط مناصب المجلس الحالية مع قبول الصيغ القديمة.
update employees e
set org_position_id = p.id
from org_positions p
join org_categories c on c.id = p.category_id and c.code = 'board'
where e.person_kind::text = 'board'
  and e.org_position_id is null
  and p.code = case trim(coalesce(e.board_role, ''))
    when 'رئيس مجلس الإدارة' then 'chairman'
    when 'نائب الرئيس' then 'vice_chairman'
    when 'نائب رئيس مجلس الإدارة' then 'vice_chairman'
    when 'العضو المنتدب' then 'managing_director'
    when 'عضو مجلس إدارة' then 'board_member'
    when 'أمين السر' then 'board_secretary'
    when 'أمين سر مجلس الإدارة' then 'board_secretary'
    else null
  end;

-- التركيبات الموجودة فعليًا لأعضاء المجلس تصبح مسموحة تلقائيًا.
insert into org_position_job_titles (position_id, job_title_id)
select distinct e.org_position_id, e.org_job_title_id
from employees e
where e.person_kind::text = 'board'
  and e.org_position_id is not null
  and e.org_job_title_id is not null
on conflict (position_id, job_title_id) do nothing;

-- ------------------------------------------------------------
-- 8. التحقق من صحة السلسلة التنظيمية ومزامنة النصوص القديمة
-- ------------------------------------------------------------
create or replace function validate_employee_org_assignment()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_position_category uuid;
  v_category_name text;
  v_category_is_board boolean;
  v_position_name text;
  v_title_name text;
begin
  if new.org_position_id is not null then
    select p.category_id, p.name_ar
      into v_position_category, v_position_name
      from org_positions p
     where p.id = new.org_position_id and p.is_active;

    if v_position_category is null then
      raise exception 'المنصب المحدد غير موجود أو غير نشط';
    end if;

    if new.org_category_id is null then
      new.org_category_id := v_position_category;
    elsif new.org_category_id <> v_position_category then
      raise exception 'المنصب المحدد لا يتبع التصنيف المختار';
    end if;
  end if;

  if new.org_job_title_id is not null then
    select j.name_ar into v_title_name
    from org_job_titles j
    where j.id = new.org_job_title_id and j.is_active;

    if v_title_name is null then
      raise exception 'المسمى الوظيفي المحدد غير موجود أو غير نشط';
    end if;

    if new.org_position_id is not null and not exists (
      select 1
      from org_position_job_titles m
      where m.position_id = new.org_position_id
        and m.job_title_id = new.org_job_title_id
        and m.is_active
    ) then
      raise exception 'المسمى الوظيفي غير مسموح لهذا المنصب';
    end if;
  end if;

  if new.org_category_id is not null then
    select c.name_ar, c.is_board
      into v_category_name, v_category_is_board
      from org_categories c
     where c.id = new.org_category_id and c.is_active;

    if v_category_name is null then
      raise exception 'التصنيف المحدد غير موجود أو غير نشط';
    end if;
  end if;

  -- الحقول النصية القديمة تبقى متزامنة للتوافق مع الصفحات والتقارير الحالية.
  if new.org_job_title_id is not null then
    new.job_title := v_title_name;
  end if;

  if new.org_position_id is not null and coalesce(v_category_is_board, false) then
    new.board_role := v_position_name;
  end if;

  if new.org_category_id is not null and not coalesce(v_category_is_board, false) then
    new.department := v_category_name;
  end if;

  return new;
end $$;

drop trigger if exists trg_validate_employee_org_assignment on employees;
create trigger trg_validate_employee_org_assignment
before insert or update of org_category_id, org_position_id, org_job_title_id
on employees
for each row execute function validate_employee_org_assignment();

-- ------------------------------------------------------------
-- 9. View موحد لقراءة هوية الشخص التنظيمية
-- ------------------------------------------------------------
create or replace view v_people_org
with (security_invoker = true)
as
select
  e.id,
  e.employee_no,
  e.full_name_ar,
  e.full_name_en,
  e.person_kind,
  e.status,
  e.direct_manager_id,
  e.org_category_id,
  c.code as category_code,
  c.name_ar as category_name,
  e.org_position_id,
  p.code as position_code,
  p.name_ar as position_name,
  e.org_job_title_id,
  j.name_ar as job_title_name,
  case
    when c.is_board then concat_ws(' و', nullif(trim(p.name_ar), ''), nullif(trim(j.name_ar), ''))
    else nullif(trim(j.name_ar), '')
  end as display_title
from employees e
left join org_categories c on c.id = e.org_category_id
left join org_positions p on p.id = e.org_position_id
left join org_job_titles j on j.id = e.org_job_title_id;

-- إضافة الحقول الجديدة إلى تقرير مجلس الإدارة دون تغيير الحقول القديمة.
create or replace view v_board_report as
select
  id,
  employee_seq(employee_no) as seq,
  employee_no,
  full_name_ar,
  full_name_en,
  id_number,
  id_expiry,
  nationality,
  person_kind,
  board_role,
  job_title,
  ownership_pct,
  appointed_at,
  mobile,
  email,
  status,
  duties,
  case when appointed_at is not null
       then round((current_date - appointed_at)::numeric / 365.25, 1)
       else null::numeric end as years_served,
  case person_kind
    when 'board'::person_kind then 'عضو مجلس إدارة'::text
    when 'owner'::person_kind then 'مالك'::text
    when 'partner'::person_kind then 'شريك'::text
    else 'موظف'::text
  end as kind_label,
  org_category_id,
  org_position_id,
  org_job_title_id
from employees e
where person_kind <> 'employee'::person_kind
order by
  case person_kind
    when 'owner'::person_kind then 1
    when 'partner'::person_kind then 2
    when 'board'::person_kind then 3
    else 4
  end,
  employee_seq(employee_no);

-- ------------------------------------------------------------
-- 10. RLS لهذه الجداول في مرحلة المستخدم المركزي
-- الصلاحية هنا لا تُستنتج من المنصب الوظيفي.
-- ------------------------------------------------------------
alter table org_categories enable row level security;
alter table org_positions enable row level security;
alter table org_job_titles enable row level security;
alter table org_position_job_titles enable row level security;

drop policy if exists p_org_categories_authenticated on org_categories;
create policy p_org_categories_authenticated on org_categories
for all to authenticated using (true) with check (true);

drop policy if exists p_org_positions_authenticated on org_positions;
create policy p_org_positions_authenticated on org_positions
for all to authenticated using (true) with check (true);

drop policy if exists p_org_job_titles_authenticated on org_job_titles;
create policy p_org_job_titles_authenticated on org_job_titles
for all to authenticated using (true) with check (true);

drop policy if exists p_org_position_titles_authenticated on org_position_job_titles;
create policy p_org_position_titles_authenticated on org_position_job_titles
for all to authenticated using (true) with check (true);

grant select, insert, update, delete on org_categories to authenticated;
grant select, insert, update, delete on org_positions to authenticated;
grant select, insert, update, delete on org_job_titles to authenticated;
grant select, insert, update, delete on org_position_job_titles to authenticated;
grant select on v_people_org to authenticated;
