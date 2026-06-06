-- 0047: richer events — cover image + FAQ. Per-event pricing already lives in events.price_cents.
alter table events add column if not exists image_url text;
alter table events add column if not exists faq       jsonb not null default '[]'; -- [{q,a}, ...]

-- Public bucket for event cover images (uploads via service role).
insert into storage.buckets (id, name, public)
values ('event-images', 'event-images', true)
on conflict (id) do update set public = true;
