-- 0053: one-time backfill so the feed isn't empty — turn the last 30 days of confirmed sessions
-- into activity posts (deduped against any the trigger already made).
insert into posts (gym_id, author_id, kind, body, booking_id, meta, audience, created_at)
select b.gym_id, b.user_id, 'activity',
       'trainde ' || greatest(1, round(extract(epoch from (b.ends_at - b.starts_at)) / 3600)::int) || ' uur' || coalesce(' · ' || s.name, ''),
       b.id,
       jsonb_build_object('service', s.name, 'starts_at', b.starts_at),
       'gym',
       b.starts_at
from bookings b
left join services s on s.id = b.service_id
where b.status = 'bevestigd' and (b.paid or b.price_cents = 0)
  and b.starts_at > now() - interval '30 days'
  and not exists (select 1 from posts p where p.booking_id = b.id and p.kind = 'activity');
