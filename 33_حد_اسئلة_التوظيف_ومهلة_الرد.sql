-- يظل نموذج المرشح مختصراً: خمسة أسئلة وظيفية نشطة كحد أقصى.
-- مهلة الرد تبدأ من قرار عدم الاستمرار، لا من لحظة التقديم.
update public.candidate_applications set response_due_at=null where status in ('submitted','screening','interview') and response_sent_at is null;

create or replace function public.limit_vacancy_active_requirements()
returns trigger language plpgsql set search_path='public' as $$
declare n integer;
begin
  if coalesce(new.is_active,true) then
    select count(*) into n from public.vacancy_requirements
    where vacancy_id=new.vacancy_id and is_active
      and id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid);
    if n>=5 then
      raise exception 'النموذج يسمح بخمسة أسئلة وظيفية نشطة كحد أقصى؛ احذف أو عطّل سؤالاً قبل إضافة آخر';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_limit_vacancy_active_requirements on public.vacancy_requirements;
create trigger trg_limit_vacancy_active_requirements
before insert or update of vacancy_id,is_active on public.vacancy_requirements
for each row execute function public.limit_vacancy_active_requirements();
