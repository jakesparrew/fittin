-- 0052: Strava-style social feed — activity posts, manual posts, achievements, coach tips,
-- with kudos (likes) and comments. Activities are auto-created when a session is confirmed+paid.

create table if not exists posts (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references gyms(id) on delete cascade,
  author_id  uuid not null references profiles(id) on delete cascade,
  kind       text not null default 'post',     -- post | activity | achievement | coach_tip
  body       text,
  image_url  text,
  booking_id uuid references bookings(id) on delete set null,
  meta       jsonb not null default '{}',
  audience   text not null default 'gym',       -- gym | buddies
  created_at timestamptz not null default now()
);
create index if not exists posts_gym_idx on posts(gym_id, created_at desc);
create index if not exists posts_author_idx on posts(author_id, created_at desc);

create table if not exists post_kudos (
  post_id    uuid not null references posts(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references posts(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_idx on post_comments(post_id, created_at);

alter table posts enable row level security;
alter table post_kudos enable row level security;
alter table post_comments enable row level security;

-- Everyone in the gym can read the feed.
drop policy if exists posts_select on posts;
create policy posts_select on posts for select using (gym_id = current_gym_id());
-- Members post as themselves (auto activity/achievement posts are inserted via security-definer trigger).
drop policy if exists posts_insert on posts;
create policy posts_insert on posts for insert with check (author_id = auth.uid() and gym_id = current_gym_id());
-- Authors delete their own; staff can moderate.
drop policy if exists posts_delete on posts;
create policy posts_delete on posts for delete using (author_id = auth.uid() or (gym_id = current_gym_id() and is_staff()));

drop policy if exists kudos_select on post_kudos;
create policy kudos_select on post_kudos for select using (exists (select 1 from posts p where p.id = post_id and p.gym_id = current_gym_id()));
drop policy if exists kudos_write on post_kudos;
create policy kudos_write on post_kudos for insert with check (user_id = auth.uid());
drop policy if exists kudos_delete on post_kudos;
create policy kudos_delete on post_kudos for delete using (user_id = auth.uid());

drop policy if exists comments_select on post_comments;
create policy comments_select on post_comments for select using (exists (select 1 from posts p where p.id = post_id and p.gym_id = current_gym_id()));
drop policy if exists comments_insert on post_comments;
create policy comments_insert on post_comments for insert with check (user_id = auth.uid());
drop policy if exists comments_delete on post_comments;
create policy comments_delete on post_comments for delete using (user_id = auth.uid() or exists (select 1 from posts p where p.id = post_id and p.gym_id = current_gym_id() and is_staff()));

-- Public bucket for feed photos.
insert into storage.buckets (id, name, public) values ('feed-images', 'feed-images', true)
on conflict (id) do update set public = true;

-- Auto-create an activity post (and milestone achievement) when a session is confirmed + paid.
create or replace function public.post_on_booking()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cnt int; v_name text; v_hours int;
begin
  if NEW.status <> 'bevestigd' then return NEW; end if;
  if not (NEW.paid or NEW.price_cents = 0) then return NEW; end if;
  if exists (select 1 from posts where booking_id = NEW.id and kind = 'activity') then return NEW; end if;

  select name into v_name from services where id = NEW.service_id;
  v_hours := greatest(1, round(extract(epoch from (NEW.ends_at - NEW.starts_at)) / 3600)::int);
  insert into posts (gym_id, author_id, kind, body, booking_id, meta, audience)
  values (NEW.gym_id, NEW.user_id, 'activity',
          'trainde ' || v_hours || ' uur' || coalesce(' · ' || v_name, ''),
          NEW.id,
          jsonb_build_object('service', v_name, 'hours', v_hours, 'starts_at', NEW.starts_at),
          'gym');

  select count(*) into v_cnt from bookings where user_id = NEW.user_id and status = 'bevestigd';
  if v_cnt in (1, 10, 25, 50, 100, 150, 200, 250, 300) then
    insert into posts (gym_id, author_id, kind, body, meta, audience)
    values (NEW.gym_id, NEW.user_id, 'achievement',
            case when v_cnt = 1 then 'logde de eerste sessie ooit 🎉' else 'behaalde ' || v_cnt || ' sessies 🏅' end,
            jsonb_build_object('milestone', v_cnt), 'gym');
  end if;
  return NEW;
end; $$;

drop trigger if exists trg_post_on_booking on bookings;
create trigger trg_post_on_booking after insert or update of paid, status on bookings
  for each row execute function public.post_on_booking();
