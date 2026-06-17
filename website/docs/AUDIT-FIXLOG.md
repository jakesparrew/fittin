# Audit fix log — juni 2026

Tracks which findings from `AUDIT-2026-06.md` are fixed. Fixes are local code + new
migrations `0055`/`0056` (apply to Supabase, then deploy). Nothing is live until you deploy.

## ✅ Batch 0 — docs price correction
- Session price corrected €11 → **€15** in `CLAUDE.md`, `docs/CONTENT.md`, `docs/FUNCTIONS.md`.
  (Site & DB were right; all "€15 should be €11" audit findings are therefore NOT bugs.)

## ✅ Batch 1 — critical security / payment (migration 0055 + webhook)
- **C1** `bookings` columns locked (members can only write status/cancelled_at/stripe_session_id);
  the `paid=true` payment-bypass is closed. `WITH CHECK` added to `bookings_update`.
- **C2** Atomic `EXCLUDE` constraint (`bookings_no_overlap`, btree_gist) — overlapping/multi-hour
  double-booking now impossible across member/admin/coach paths. `create_booking` catches it.
- **C3** Stripe webhook: handle-then-commit + delete-lock-and-500 on failure (Stripe retries);
  credit/punch-card/coach-ledger grants made idempotent via `stripe_ref`; confirmation email
  no longer rolls back a successful payment. Punch-card credits now carry a 6-month `expires_at`.

## ✅ Batch 2 — security & role-boundary (migration 0056 + actions)
- Admin booking/credit/block actions → `requireStaff(true)`; admin RPCs now require `is_beheerder()`.
- All `/beheer` coaching + community/event/challenge actions → beheerder-only.
- `coach_book_session`: own-client only, respects slot blocks + capacity, overlap-safe.
- Coach "create event" missing import fixed (flow was dead).
- Buddy "join request" accept fixed via new `respond_join_request` RPC (was always auto-declined).
- `coachAssignProgram`: clones template per member (no more data loss) + own-client check.
- `coachAddProgramExercise`/`coachDeleteProgramExercise`: day/exercise ownership validated (IDOR).
- `searchMembers`: RLS-safe `search_members` RPC instead of service-role (no more enumeration).
- Coach full profile no longer exposed to anon (dropped `profiles_public_coaches`; pages use service role).
- cron/queue endpoints require `CRON_SECRET` (fail closed, header-only — no secret in query string).
- Resend stats + inbound webhooks fail closed when their secret is unset.
- `setClientPrice` rejects €0 / invalid.

## ⚠️ DEPLOY ACTIONS REQUIRED
1. Apply migrations `0055` then `0056` to Supabase.
   - `0055` adds an EXCLUDE constraint; if legacy overlapping confirmed bookings exist it will
     fail. Find them first:
     `select a.id,b.id from bookings a join bookings b on a.gym_id=b.gym_id and a.id<b.id
       and a.status='bevestigd' and b.status='bevestigd'
       and tstzrange(a.starts_at,a.ends_at) && tstzrange(b.starts_at,b.ends_at);`
     Cancel/resolve any rows it returns, then apply.
2. Set env vars in Vercel (or these endpoints now return 401/503):
   - `CRON_SECRET` (required for the daily cron + newsletter queue).
   - `RESEND_WEBHOOK_SECRET` (delivery/bounce stats) and `RESEND_INBOUND_SECRET` (inbound mail).

## ✅ Batch 3 — data-integrity highs (migration 0057 + 0055 edit + libs)
- Credit-paid bookings refund the session credit(s) on cancel (`refund_member_credit` trigger).
- Referred friend now gets exactly ONE free session (removed the duplicate activation grant).
- Package credits carry a 6-month `expires_at`; spending (create_booking/admin) AND all 7 balance
  reads now exclude expired credits.
- FittinWelcome free session requires `welcome_status='eligible'` (verified card) server-side.
- Paid events can't be oversold — atomic `reserve_event_seat` (advisory lock, paid + ≤30 min holds).
- Newsletter queue skips anyone who unsubscribed/bounced after being queued.
- Resend bounce → subscriber `bounced`; complaint → `unsubscribed` (protects sender reputation).

## ✅ Batch 4 — mediums (migration 0058 + actions)
- Discount code recorded only after payment succeeds (abandoning checkout no longer burns it);
  resume-checkout re-charges the original discounted amount (`bookings.charge_cents/discount_code_id`).
- Challenge reward credits are actually granted (`award_challenges`, run from the daily cron).
- Sequential, gap-free invoice numbers (`gyms.invoice_seq` → `payments.invoice_no`, BE VAT).
- Community page counts only paid signups (no false "Vol"); seat enforced atomically server-side.
- Nav `/api/me` is skipped for logged-out visitors (no serverless+DB hit on marketing pages).

## ✅ Batch 5 — lows (SEO / a11y / perf)
- `fit@fittin.be` → `info@fittin.be` (PT + degym CTAs); degym address standardised to "9040 Gent".
- Sitemap adds /lidmaatschap + /disclosure; home gets metadata + self-canonical; degym canonical;
  home HealthClub JSON-LD enriched (geo, email, image).
- Mobile nav: Notificaties link added; hamburger has aria-expanded/aria-controls.
- `uploadCoachPhoto` busts the coaches cache tag; notifications mark read on open;
  `credits_ledger(gym_id)` index added (0059).

## ✅ Deferred polish — now done
- Session duration resolved: **60 min** (1 uur). Docs standardised (CLAUDE.md, CONTENT.md, FUNCTIONS.md).
- `next.config` image domains added (`*.supabase.co`); coach profile photo → `next/image`.
- Perf: betalingen + events page queries parallelised (`Promise.all`); events uses `getGymCached`.
- a11y: wachtwoord-vergeten email input labelled.

## ⏳ Still deferred (low impact / needs product input)
- Remaining `<img>` → `next/image` on /coaches list, /events, community feed (Supabase-hosted; safe to convert later).
- Micro perf: coach dashboard fetches all members for the picker (use coach_clients) · drop a
  redundant referral_code re-query · feed over-fetches post_comments · `getSessionProfile`
  select('*') (left as-is: regression risk for a tiny gain).
- `gyms` row exposes IBAN/VAT to anon (LOW) — needs a gym_billing split / anon column grants.
- Inbound email files under the oldest gym (moot until a 2nd gym exists).
- A couple of placeholder-only inputs (buddy search, referral code) still need labels.

---

# Oefeningen & Workouts upgrade (2026-06-16) — built
Spec: `docs/superpowers/specs/2026-06-16-exercises-workouts-upgrade-design.md`. Build passes.
- **Migration 0060**: rich `exercises` (slug, category, primary/secondary muscles, equipment,
  difficulty, instructions[], tips, image_url, animation_url) + unique (gym, slug) + **~20 seeded
  common exercises** with written explanations.
- **Exercise library** `/oefeningen` (searchable/filterable grid) + **detail** `/oefeningen/[slug]`
  (looping demo, target muscles, numbered steps, tips). New `ExerciseMedia`/`ExerciseDetail`/
  `ExerciseLibrary` components. Added to nav + sitemap.
- **Workout player** (rebuilt `/training`): per-set logging (reps×kg, prefilled from last session),
  rest timer, tap-to-see demo + instructions, **PR badge + last-session** per exercise, streak.
  New `logExercise` action (set arrays + PR detection).
- **Coach + admin editors** capture the rich fields (instructions, muscles, equipment, difficulty,
  media URLs); `revalidateTag("exercises")` on change.
- **Media note:** demos show when a coach/admin sets `animation_url`/`image_url`/`video_url` per
  exercise (paste a GIF/MP4/YouTube link); a clean placeholder shows until then. No proprietary/paid
  API wired — a bulk animated-GIF source can be imported later without rework.

## Deploy: apply migration `0060` (after 0055–0059).

## Migrations to apply (in order): 0055 → 0056 → 0057 → 0058 → 0059
