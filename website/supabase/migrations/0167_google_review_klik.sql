-- 0167 — Wie op "Schrijf een review op Google" tikte, krijgt die vraag nooit meer.
-- Google vertelt ons niet wie een review schreef; de tik is het beste signaal dat we hebben.
alter table public.profiles add column if not exists google_review_klik_at timestamptz;
