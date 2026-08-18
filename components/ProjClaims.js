-- ============================================================
--  الملف 31 : لا خطوة بلا مستند
--  يمنع تقدّم المستخلص قبل إصدار مستنده أو رفع إثباته
-- ============================================================

-- ------------------------------------------------------------
--  ١. مرفقات عامة : تصلح لأي عملية في النظام
-- ------------------------------------------------------------
create table if not exists op_attachments (
  id            uuid primary key default gen_random_uuid(),
  entity_type   text not null,                -- claim / settlement / expense …
  entity_id     uuid not null,
  stage         text,                          -- المرحلة التي رُفع فيها
  direction     text not null default 'in',    -- in وارد | out صادر
  title         text,
  file_path     text,                          -- مسار الملف في التخزين
  doc_id        uuid,                          -- أو مستند من محرك النماذج
  ref_no        text,
  doc_date      date default current_date,
  amount        numeric(14,2),
  notes         text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_opatt_entity on op_attachments(entity_type, entity_id);
create index if not exists idx_opatt_stage  on op_attachments(entity_type, entity_id, stage);

alter table op_attachments enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='op_attachments') then
    create policy opatt_all on op_attachments
      for all to authenticated using (true) with check (true);
  end if;
end $$;

-- ------------------------------------------------------------
--  ٢. مخزن الملفات
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('docs', 'docs', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname='storage' and policyname='docs_rw') then
    create policy docs_rw on storage.objects
      for all to authenticated
      using (bucket_id = 'docs') with check (bucket_id = 'docs');
  end if;
end $$;

-- ------------------------------------------------------------
--  ٣. تعريف المراحل : ما المستند المطلوب في كل خطوة
--     المفاتيح مطابقة لقيم عمود status الموجود
-- ------------------------------------------------------------
create table if not exists claim_stage_defs (
  stage      text primary key,
  seq        int  not null,
  name_ar    text not null,
  direction  text not null,      -- out نُصدره | in نستقبله
  doc_ar     text not null,
  required   boolean not null default true
);

insert into claim_stage_defs (stage, seq, name_ar, direction, doc_ar, required) values
  ('draft',          1, 'مسودة',         'out', 'كشف المستخلص',                  true),
  ('submitted',      2, 'مقدَّم للمالك',  'out', 'خطاب تقديم المستخلص',           true),
  ('owner_approved', 3, 'معتمد',          'in',  'اعتماد المالك أو محضر مراجعة',  true),
  ('invoiced',       4, 'مفوتر',          'out', 'الفاتورة الضريبية',             true),
  ('collected',      5, 'محصَّل',          'in',  'إشعار التحويل أو سند القبض',    true)
on conflict (stage) do update
  set seq = excluded.seq, name_ar = excluded.name_ar,
      direction = excluded.direction, doc_ar = excluded.doc_ar,
      required = excluded.required;

-- ------------------------------------------------------------
--  ٤. الحارس : يمنع التقدم قبل مستند المرحلة الحالية
-- ------------------------------------------------------------
create or replace function guard_claim_stage()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  d    record;
  nd   record;
  cnt  int;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select * into d  from claim_stage_defs where stage = old.status;
  select * into nd from claim_stage_defs where stage = new.status;

  -- الرجوع للخلف مسموح دائماً (تصحيح خطأ)
  if d.seq is null or nd.seq is null or nd.seq < d.seq then
    return new;
  end if;

  if d.required then
    select count(*) into cnt from op_attachments
     where entity_type = 'claim' and entity_id = new.id and stage = old.status;
    if cnt = 0 then
      raise exception 'لا يمكن الانتقال إلى «%» قبل % «%» في مرحلة «%»',
        nd.name_ar,
        case when d.direction = 'out' then 'إصدار' else 'رفع' end,
        d.doc_ar, d.name_ar
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_guard_claim_stage on progress_claims;
create trigger trg_guard_claim_stage
  before update on progress_claims
  for each row execute function guard_claim_stage();

-- ------------------------------------------------------------
--  ٥. هل يجوز التقدم؟ — للاستعلام من الواجهة قبل المحاولة
-- ------------------------------------------------------------
create or replace function claim_can_advance(p_claim uuid)
returns table (ok boolean, reason text)
language plpgsql stable security definer set search_path = public
as $$
declare cur text; d record; cnt int;
begin
  select status into cur from progress_claims where id = p_claim;
  if cur is null then
    return query select false, 'المستخلص غير موجود'::text; return;
  end if;

  select * into d from claim_stage_defs where stage = cur;
  if d.seq is null then
    return query select true, 'مرحلة غير معرّفة'::text; return;
  end if;
  if d.seq >= (select max(seq) from claim_stage_defs) then
    return query select false, 'المستخلص في مرحلته الأخيرة'::text; return;
  end if;

  if d.required then
    select count(*) into cnt from op_attachments
     where entity_type = 'claim' and entity_id = p_claim and stage = cur;
    if cnt = 0 then
      return query select false,
        ('يلزم ' || case when d.direction = 'out' then 'إصدار ' else 'رفع ' end
         || d.doc_ar)::text;
      return;
    end if;
  end if;

  return query select true, 'جاهز'::text;
end $$;

-- ------------------------------------------------------------
--  ٦. حالة المستندات لكل مستخلص
-- ------------------------------------------------------------
drop view if exists v_claim_missing_docs;
drop view if exists v_claim_docs;

create view v_claim_docs with (security_invoker = true) as
select
  c.id                    as claim_id,
  c.project_id,
  c.claim_no,
  c.status,
  s.stage                 as step,
  s.seq                   as step_seq,
  s.name_ar               as step_ar,
  s.direction,
  s.doc_ar,
  s.required,
  d.seq                   as current_seq,
  (s.seq <  d.seq)        as passed,
  (s.seq =  d.seq)        as is_current,
  (select count(*) from op_attachments a
    where a.entity_type = 'claim' and a.entity_id = c.id and a.stage = s.stage) as docs
from progress_claims c
join claim_stage_defs d on d.stage = c.status
cross join claim_stage_defs s;

-- المستخلصات التي مرّت مراحل بلا مستند — دَين توثيقي
create view v_claim_missing_docs with (security_invoker = true) as
select claim_id, project_id, claim_no, status,
       string_agg(step_ar || ' (' || doc_ar || ')', ' · ' order by step_seq) as missing,
       count(*) as missing_count
from v_claim_docs
where required and docs = 0 and (passed or is_current)
group by claim_id, project_id, claim_no, status;

-- ------------------------------------------------------------
--  ٧. تحقق
-- ------------------------------------------------------------
notify pgrst, 'reload schema';

select
  (select count(*) from claim_stage_defs)                  as "المراحل",
  (select count(*) from progress_claims)                   as "المستخلصات",
  (select count(*) from v_claim_missing_docs)              as "ينقصها توثيق",
  (select string_agg(name_ar, ' ← ' order by seq)
     from claim_stage_defs)                                as "الدورة";
