-- 0041: public storage bucket for coach profile photos (uploads done via service role).
insert into storage.buckets (id, name, public)
values ('coach-photos', 'coach-photos', true)
on conflict (id) do update set public = true;
