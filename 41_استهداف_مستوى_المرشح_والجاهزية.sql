-- استهداف مستوى المرشح والجاهزية العامة
-- مطبق على Supabase الإنتاج بتاريخ 2026-08-19.

alter table public.job_vacancies
  add column if not exists target_experience_level text,
  add column if not exists target_city text,
  add column if not exists required_start_within_days integer not null default 14;

alter table public.candidates
  add column if not exists current_city text,
  add column if not exists employment_status text,
  add column if not exists notice_period_days integer;

alter table public.candidate_applications
  add column if not exists general_answers jsonb not null default '{}'::jsonb,
  add column if not exists start_within_required_window boolean,
  add column if not exists start_constraint_note text;

-- القاعدة التشغيلية:
-- البيانات العامة والجاهزية لا تدخل في درجة الجودة المهنية.
-- الدرجة المهنية تبنى من خمسة أسئلة مرتبطة بالمسمى ومستوى الخبرة المستهدف.
-- مستوى الخبرة المستهدف: entry | intermediate | advanced | expert | leadership.
