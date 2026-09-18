# Gamification + community — build plan

**Status:** plan, not built. Written 2026-09-18 after a scan of the whole app and the production database.
**Trigger:** the owner wants to know when the gym is left dirty, and by whom — and asked whether a points / rating
system could make members report the state of the gym, their workout and their experience.

---

## 0. The numbers this plan is built on (production, measured 2026-09-18)

| What | Value | What it means |
|---|---|---|
| Members (`role = lid`) | 97 | Small gym. Rankings with 3 people on them feel empty. |
| Active last 30 days | 40 | The real audience for anything we build. |
| Sessions last 30 days | 126 | ≈ 4 per day. Every session is a "touch". |
| Members with ≥ 2 / ≥ 4 sessions in 30 days | 25 / 9 | A core of ~10 regulars. |
| Door-code mails sent (30d) | 93 of 126 sessions got the report link | The one mail that reaches ~100 % of sessions. |
| Problem reports ever | **1** (2026-08-13) | The report link in the door-code mail is ignored. |
| Post-session star mails (30d) / ratings ever | 32 / **5** (avg 4.4) | ~15 % answer; capped at 1 ask per member per 30 days. |
| Challenges ever | **0** | The challenge engine works (0148) but nobody set one up. |
| Referrals / gym_referrals | **0 / 0** | Reward works again since 0147, still unused. |
| Buddies / booking participants | 2 / 5 | Inviting exists, barely used. |
| Events / sign-ups | 1 / 0 | |
| Workout logs (users) | 7 (4) | Logging is not a habit. |
| AI-coach plans / check-ins / milestones | 5 / 0 / 0 | Gated to 2 people. |
| Feed posts (30d) | 208 — **all automatic** (173 activity, 35 achievement) | Comments 0, kudos 5 from 4 people. |
| Door log rows ever | 27 | **Attendance cannot be proven.** Only "a confirmed booking in the past" can. |
| Leaderboard opt-outs | 1 | People don't mind being on it. |

**Conclusion that shapes everything below:** almost every community feature already exists and almost none is used.
The gap is not features, it is *reach* and *reason*. Nobody visits `/community` to be social; people open the
door-code mail because the code is in it. So gamification must **ride on moments that already happen** (booking,
door-code mail, after-session mail, the account home) instead of asking people to go somewhere new.

---

## 1. Principles

1. **Attach to existing moments.** No new place members must remember to visit. The first surface for everything
   is the door-code mail / push and the account home card.
2. **Only count what is verifiable.** A session counts when it is a confirmed booking whose `ends_at` is in the
   past (lesson from 0148: counting booked-but-future sessions paid out rewards to people who never came). Door log
   is too sparse to use.
3. **Reward reporting, never complaining.** "Clean" and "not tidy" earn the same points. Rewarding only negative
   reports teaches people to invent them.
4. **Points are not money.** Points buy status (level, badges, feed posts). Money (credits) only flows through
   challenges with a hard cap per challenge and a monthly budget the owner sets.
5. **Accusations stay with the owner.** A member never sees who was before them (already a rule in
   `lib/meldpunt.js`). The tidiness score is admin-only and is a *pattern*, never one data point.
6. **Together beats against each other** at this size. A gym-wide monthly goal ("samen 150 sessies") works with 40
   actives; a top-10 ranking shows the same 5 names forever.
7. **Idempotent and append-only.** Every point comes from one ledger row with a unique source key, so a retry, a
   cron running twice or a re-delivered webhook can never double-award (same pattern as `coach_ledger`, 0152).
8. **Everything can be turned off** per gym (multi-tenant) and per member (leaderboard opt-in already exists).

---

## 2. Inventory — every part of the app and what it contributes

| Area | Exists today | Status / flaw found | Role in this plan |
|---|---|---|---|
| **Booking** (`/boeken`, `create_booking`, 0164 multi-slot) | ✅ | Works; multi-slot booking just shipped | Core point source (session completed), streak source, "book next week" nudges |
| **Door-code mail** (`sendDueAccessCodes`, cron `*/5`) | ✅ reaches every session | Report link at the bottom, ignored | **Carrier of the gym check-in (Pillar A)** + one status line (streak / points) |
| **After-session star mail** (`sendSessionFeedbackRequests`, `/f/[token]`, `session_feedback`) | ✅ | 1 per 30 days, 15 % answer, Google review rule in place | Becomes the **experience rating** (Pillar B), asked more often but lighter |
| **Meldpunt** (`/m/[token]`, `problem_reports`, 0150) | ✅ | 1 report ever. `vorigeGebruiker()` already resolves the previous booker | Merged into the gym check-in; stays for broken equipment / door |
| **Next-visitor note** (0150 `openMeldingNotitie`) | ✅ | Owner-written warning in the next door-code mail | Kept |
| **Buddies / invites** (0017, 0023, 0068, `/uitnodiging/[code]`) | ✅ | 2 buddies, 5 participants | Social points: bring someone (Pillar D) |
| **Referral** (0016, 0051, 0147, `ShareReferral`) | ✅ pays +1 credit | 0 ever | Bigger visibility + badge; the reward stays the credit |
| **Leaderboard** (`/community`, `/boeken`, 0067 opt-in) | ✅ | Sessions this month + referral bonus | Replaced by points-based board + gym-wide goal |
| **Challenges** (0058, 0148, `/beheer/challenges`) | ✅ engine works, capped | 0 challenges created | Pre-made templates + monthly "community goal" (Pillar D) |
| **Feed** (0052 `posts`, `post_kudos`, `post_comments`) | ✅ | **Posts on BOOKING, not after the session** ("trainde 1 uur" appears before training; milestone counts future bookings and survives a cancel) | Fix trigger; feed becomes the place badges/levels appear |
| **Events** (0004, 0031, 0047, `/events`) | ✅ | 1 event, 0 sign-ups | Points for attending; event badges (Pillar D, later) |
| **Waitlist** (0105) | ✅ | 9 entries | Small bonus for filling a freed slot (optional) |
| **Workout logging** (`/training`, `/training/sessie`, `workout_logs`) | ✅ | 7 logs | Points for logging (Pillar E) |
| **Workout feedback** (`workout_feedback`) | ✅ table | 0 rows | Part of Pillar E |
| **Exercise library + favourites** (`/oefeningen`, `exercise_favorites`) | ✅ | 5 favourites | Not a point source (browsing ≠ training). Only used as content |
| **Saved videos** (0149 `/bewaard`) | ✅ | | Not a point source |
| **Workouts / programmes** (`/workouts`, `/plannen`, coach programmes) | ✅ | | "Programme finished" badge |
| **AI coach** (0157–0161: plans, weeks, check-ins, milestones, afvinken via `/s/[token]`) | ✅ gated to 2 | 5 plans, 0 check-ins, 0 milestones | Frequency target → personal streak goal; afvinken → points; milestones → badges (Pillar E) |
| **Coach platform** (`/coach/*`, clients, messages, programmes) | ✅ | 8 coaches, 11 client links | Coaches see client streaks + give kudos (Pillar F). No coach ranking |
| **Aanbreng (coach brings client)** (0152) | ✅ | Money flow, separate | Not mixed with member points |
| **Abonnement / beurtenkaart / credits** | ✅ | | Reward currency (credits) comes only from challenges |
| **Newsletter / drips / activation** (`/beheer/nieuwsbrief`, `activatie`) | ✅ | | Weekly recap mail can carry the member's streak + gym goal |
| **Notifications (in-app bell)** | ✅ 568 rows | | Badge unlocked, streak at risk |
| **Native push** (`lib/native/push.js`, Capacitor) | ✅ code, app not in stores yet | | Second carrier for the check-in once the app is live |
| **Analytics / weekreport** (cron Monday 06:00) | ✅ | | Owner gets tidiness + engagement numbers in the week report |

---

## 3. The core model: one points ledger

### 3.1 Data

```sql
-- Append-only. One row per earned (or revoked) point event. Never updated, never deleted.
create table member_points (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references gyms(id),
  user_id     uuid not null references profiles(id) on delete cascade,
  kind        text not null,            -- 'sessie','zaalcheck','ervaring','log','buddy','aanbreng','event','afvink','streak','badge','challenge','correctie'
  points      int  not null,            -- negative only for 'correctie' (e.g. a session later cancelled/refunded)
  source_key  text not null,            -- idempotency: 'sessie:<booking_id>', 'zaalcheck:<booking_id>', 'streak:<user>:<iso-week>'
  meta        jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  unique (gym_id, source_key)
);
create view member_points_totals as
  select gym_id, user_id, sum(points) total,
         sum(points) filter (where created_at >= date_trunc('month', now())) this_month
  from member_points group by 1, 2;
```

- Writes only via `security definer` functions or the service role (same pattern as `coach_ledger`). Members read
  their own rows; staff read all. **Revoke per role** (`anon`, `authenticated`) — `revoke from public` is not
  enough on Supabase (lesson from the growth audit).
- A cancelled or refunded session after points were given → one `correctie` row with the negative amount, keyed
  `correctie:sessie:<booking_id>`. Never delete.

### 3.2 Point values (v1 — tune after 4 weeks)

| Action | Points | Source key | Cap |
|---|---|---|---|
| Session completed (booker **and** each joined participant) | 10 | `sessie:<booking>:<user>` | — |
| Gym check-in answered (any answer) | 3 | `zaalcheck:<booking>` | 1 per booking |
| Photo added to a "not tidy" / "broken" check-in | +2 | `zaalfoto:<booking>` | 1 per booking |
| Experience rating answered | 2 | `ervaring:<booking>` | 1 per booking |
| Workout logged (≥ 1 set) | 3 | `log:<user>:<date>` | 1 per day |
| AI-coach session ticked off (`afvink`) | 3 | `afvink:<session>` | 1 per session |
| Brought a buddy who joined the session | 5 (both) | `buddy:<booking>:<user>` | 4 per month |
| Referral rewarded (existing 0147 flow) | 25 | `aanbreng:<referral>` | existing 10 / 30 d brake |
| Event attended | 10 | `event:<event>:<user>` | — |
| Weekly streak kept | 5 × streak length, max 25 | `streak:<user>:<iso-week>` | 1 per week |
| Badge unlocked | per badge (10–50) | `badge:<user>:<badge>` | once |

Sessions dominate on purpose: showing up is the behaviour the gym lives on.

### 3.3 Levels

Cumulative points → level name (Dutch UI): Starter (0) · Regular (100) · Vaste klant (300) · Fittin'er (700) ·
Legende (1500). At 10 points a session, "Vaste klant" ≈ 25 sessions. Levels never go down (a `correctie` can lower
points but the reached level is stored with its date).

### 3.4 Streaks

- Unit = **ISO week**, not day (a gym you visit 2× a week has no daily habit).
- Target per member: default **1 session / week**. If the member has an AI-coach plan, the target is the plan's
  frequency (`coaching_plans`). Members can choose 1–4 in their profile.
- A week counts when the member has ≥ target completed sessions (booker or participant) in that week.
- **One free "pauzeweek"** per 8 weeks so a holiday doesn't break a 10-week streak.
- Evaluated by the Monday cron (weekreport already runs Monday 06:00) → writes `streak:` rows.
- "Streak at risk" nudge: Thursday, if the target isn't met yet and there are free slots → notification + link to
  book (this is where multi-slot booking pays off: "boek je volgende 4 weken in één keer").

### 3.5 Badges (first set)

| Badge | Rule |
|---|---|
| Eerste sessie | 1 completed session |
| 10 / 25 / 50 / 100 sessies | milestones (replaces the booking-time milestone posts in 0052) |
| Vroege vogel | 5 sessions starting before 08:00 |
| Nachtuil | 5 sessions starting ≥ 21:00 |
| Daluren-held | 10 sessions in off-peak hours (reuse `dal_from/dal_to` from challenges) |
| 4 / 12 / 26 weken op rij | streak lengths |
| Zaalwachter | 10 gym check-ins answered |
| Oog voor detail | 3 check-ins with a photo that the owner marked "useful" |
| Buddy | brought 3 different people |
| Ambassadeur | 1 rewarded referral |
| Logboek | 20 workout logs |
| Plan afgewerkt | finished an AI-coach or coach programme |

Badges are rows in `member_badges (user_id, badge, earned_at, unique(user_id, badge))` plus one `member_points`
row each. Rules live in one pure JS module (`lib/badges.js`) with tests; a nightly cron evaluates them.

---

## 4. Pillar A — the gym check-in ("Zaalcheck") ← build first

This is the owner's actual question: *when is the gym dirty, and who left it like that?*

### 4.1 The moment

The check-in is asked **at the start of the session**, when the member walks in and sees the gym as the previous
person left it. Not after the session — by then the member's own use is mixed in.

Carriers, in order:
1. **Door-code mail** (already reaches every session): the mail gets a block *above* the fold:
   > **Hoe vond je de zaal toen je binnenkwam?**
   > [👍 Netjes] [🧼 Niet netjes] [🔧 Iets stuk]
   Three big links to `/z/{token}?s=netjes|rommel|stuk`. One tap = recorded. The code stays the first thing.
2. **Push** (once the native app is live): 10 minutes after `starts_at`, same three buttons.
3. **Account home card** during the session window ("Je sessie loopt · hoe was de zaal?").

After the tap a small page (no login, token like `/f/` and `/m/`):
- 👍 → "Bedankt! +3 punten" + optional "wil je nog iets kwijt?".
- 🧼 → optional photo (camera opens on phone) + optional chips: *handdoeken / flessen / gewichten niet
  teruggelegd / vloer / kleedkamer / afval*. "+3, +2 met foto".
- 🔧 → routes to the existing meldpunt flow (category `toestel`, urgent mail to the owner).

### 4.2 Data

```sql
create table zaal_checks (
  booking_id       uuid primary key references bookings(id) on delete cascade,  -- one per session
  gym_id           uuid not null,
  user_id          uuid not null,
  state            text not null check (state in ('netjes','rommel','stuk')),
  tags             text[] not null default '{}',
  photo_path       text,                       -- private bucket, signed URLs (like 0154)
  previous_booking uuid references bookings(id) on delete set null,  -- resolved AT INSERT, never later
  owner_verdict    text check (owner_verdict in ('terecht','onterecht')),  -- owner's judgement, optional
  created_at       timestamptz not null default now()
);
```

- `previous_booking` = the last confirmed booking that **ended before this one started, the same day, within
  3 hours** (reuse / tighten `vorigeGebruiker`). Nothing earlier → `null` ("first of the day / gap too long"),
  because blaming someone from yesterday evening for this morning is not fair.
- Joined participants of the previous booking are stored in `meta` too — the booker isn't always the one who
  made the mess, but the booker is responsible for their group.

### 4.3 Tidiness score (admin only)

Per member, over the last 90 days, counted on the check-ins where they were the `previous_booking`:
- `netjes` → +1, `rommel` → −1, `rommel` with photo or owner verdict `terecht` → −2, owner verdict `onterecht`
  → 0.
- Shown as a traffic light, and **only after ≥ 3 check-ins** about that member:
  🟢 mostly clean · 🟠 mixed · 🔴 ≥ 2 confirmed "rommel" in 30 days.
- Never visible to members, never in rankings, never automatic sanctions. It is information for the owner.

### 4.4 Owner surfaces

- **`/beheer/netheid`** (new, in the Gym menu next to Meldingen):
  - This week: % sessions checked in, % "netjes", trend over 8 weeks (small chart).
  - Timeline of every "rommel" / "stuk" check-in: time, photo, tags, **previous booker (name, time slot,
    participants)**, buttons *Terecht* / *Onterecht* / *Stuur een vriendelijke herinnering*.
  - "Aandacht" list: members with a 🔴 score.
- **The friendly reminder** is a pre-written, neutral mail ("we kregen een melding dat de zaal na jouw sessie van
  dinsdag 19:00 niet helemaal netjes was …") that the owner sends with one click — never automatic.
- **Alert:** 2 "rommel" check-ins in a row → bell notification to the owner. A "stuk" follows the existing urgent
  mail.
- **Week report** (Monday mail): one line with the clean % and the number of "rommel" check-ins.
- On the member's page in Beheer (`/beheer/leden/[id]`): their tidiness light + the check-ins about them.

### 4.5 Detecting deterioration without complaints

- The clean % per week is the early warning: if it drops from 90 % to 70 %, something changed (a new regular,
  cleaning schedule, broken bin) before anyone complains.
- Split by hour band (morning / afternoon / evening) — mess tends to cluster in one band.
- If no one answers at all (< 20 % response) the numbers are shown greyed out with "te weinig antwoorden".

### 4.6 Also build: "Ik laat de zaal netjes achter"

In the after-session mail, one optional tap: *"Ik heb alles teruggelegd ✅"* (+1 point). It costs nothing, nudges
the right behaviour (the house rules already say it) and gives the next check-in context: a "rommel" after a self-
declared "netjes" is a stronger signal for the owner.

---

## 5. Pillar B — the experience rating

- The existing post-session star mail stays the carrier (`session_feedback`, `/f/[token]`), with its Google-review
  rule untouched (**never** filter the review link by score — `lib/meldpunt` + test already guard this).
- Change the brake from "1 per 30 days" to "**1 per 7 days**", because it now gives points and is one tap.
  Opt-out (`feedback_opt_out`) stays.
- Add one optional second question on the thank-you page: *"Hoe voelde je training?"* 😫 😐 🙂 💪 (energy, not
  gym quality). Stored in `session_feedback.energie`. Feeds the AI coach (Pillar E) and the member's own history.
- Owner view: average stars per week + all comments, on `/beheer/netheid` (tab "Ervaring") — one page for "how is
  the gym doing".

---

## 6. Pillar C — consistency (streaks, levels, badges)

See §3.3–3.5. Member surfaces:

- **Account home card** (top of `/account`): level + progress bar to the next level, current streak with the week
  dots (●●●○), next badge within reach ("nog 2 sessies voor 25 sessies 🏅"), and a **Book** button.
- **Door-code mail footer line**: "🔥 6 weken op rij · Vaste klant · 312 punten". One line, no extra mail.
- **Badge unlocked**: in-app notification + an automatic feed post (existing `posts`, kind `achievement`) — the
  member can hide it from the feed (setting).
- **Profile page**: badge shelf (earned in colour, locked in grey with the rule).

---

## 7. Pillar D — social and community

### 7.1 The monthly gym goal (replaces the empty challenge page as the default)

- Every month one shared target, set automatically at 110 % of last month's completed sessions (owner can
  override): *"Samen 140 sessies in oktober"*.
- Progress bar on the account home, the booking page and `/community`.
- Reached → every member with ≥ 2 sessions that month gets a reward the owner chose (default: a badge + 20
  points; optionally 1 credit, drawn from the monthly budget). This is a `challenges` row with a new
  `goal_type = 'gym_total'` so the capped payout logic of 0148 is reused.
- Why: with 40 actives, a common goal makes every session count for everyone, and nobody is "last".

### 7.2 Challenge templates

`/beheer/challenges` gets 6 one-click templates so the owner doesn't start from an empty form (the reason there are
0 challenges): *4 weken op rij · 8 sessies deze maand · Daluren-maand · Breng een vriend · Log 10 trainingen ·
Probeer een event*. Each pre-filled with dates, cap (`max_winners`) and a suggested reward.

### 7.3 Buddies and invites

- Points for both when a buddy joins a session (§3.2). The invite screen shows "+5 voor jullie allebei".
- "Train samen"-badge. On the booking confirmation screen: *"Neem iemand mee — +5 punten voor jullie allebei"*.
- Referral: keep the credit reward (0147); add 25 points + the Ambassadeur badge and show the referral link on the
  level card ("volgende level sneller: breng een vriend").

### 7.4 Leaderboard (demoted, not removed)

- Ranking on **points this month**, opt-in kept (0067), coaches and staff excluded (as today).
- Show top 5 + "jij staat op plaats 14 — 30 punten tot plaats 10" instead of a long list.
- Second board "**Meest verbeterd**" (points this month vs. last month) so newcomers can win something.

### 7.5 Feed

- **Fix 0052**: the activity post and milestone posts are created on booking, so they appear before the session
  and survive a cancellation. Move them to "session completed" (nightly job, after `ends_at`) and count milestones
  on completed sessions only.
- Feed shows: badges, levels, streak milestones, the gym goal progress, events. No per-session spam: one post per
  member per week at most ("trainde 3× deze week").
- Kudos stay (one tap). Giving kudos earns nothing (avoids kudos farming).

### 7.6 Events

- Points + badge for attending. Event page shows "+10 punten".
- Later: a quarterly "Fittin' community-avond" as the reward for reaching 3 monthly gym goals in a row.

---

## 8. Pillar E — training and the AI coach

- Workout log → 3 points (1 per day). The log screen shows it.
- AI coach (still gated): its weekly frequency becomes the member's streak target (§3.4); `afvink` via
  `/s/[token]` gives 3 points; `coaching_mijlpalen` rows unlock badges; the weekly coaching mail shows level +
  streak. The energy answer from Pillar B goes into the coach's dossier ("je voelde je 3× 😫 deze week").
- Coach programmes (`/coach/programmas`): "programme finished" badge; the coach sees it.

---

## 9. Pillar F — coaches

- On `/coach/clienten/[id]`: the client's streak, level, last check-ins and energy answers. Useful for the coach,
  motivating for the client.
- Coaches can give a **kudo with a short note** to their client (shows in the client's notifications). No coach
  ranking, no coach points — coaches are paid professionals, not players.
- Sessions a coach books for a client count for the client (already true for the leaderboard, 0067).

---

## 10. Rewards and the money guard

- Points never convert to money automatically.
- Credits are only given through `challenges` (existing capped engine) and the monthly gym goal.
- New gym setting: **monthly reward budget in credits** (default 10). The payout function refuses once the month's
  budget is spent and notifies the owner. Shown on `/beheer/challenges`: "deze maand 6 van 10 tegoeden
  uitgedeeld".
- Level perks that cost nothing: early access to event sign-up, a badge on the profile, a mention in the monthly
  newsletter (opt-in).

---

## 11. Privacy and fairness

- Tidiness score and previous-booker link: admin-only, documented in the privacy policy (new paragraph: "meldingen
  over de staat van de zaal kunnen gekoppeld worden aan de vorige boeking; enkel de uitbater ziet dit").
- Photos in a private bucket with signed URLs (pattern from 0154). Photos of people are not allowed — the upload
  page says so; the owner can delete a photo.
- Anti-gaming: point caps per day/booking, check-ins only via the booking's own token, only within the session
  window (starts_at − 10 min … ends_at + 2 h), one check-in per booking, no points for kudos.
- A member can see their own point history ("waarom heb ik deze punten?") — the ledger makes that free.
- Opt-out of everything visible (leaderboard, feed posts) without losing points.

---

## 12. Build phases

Each phase ships on its own, with a success metric measured 4 weeks later and a kill criterion.

| Phase | Scope | Size | Success after 4 weeks | Kill / rethink if |
|---|---|---|---|---|
| **1. Zaalcheck** | §4: `zaal_checks`, `/z/[token]`, door-code mail block, `/beheer/netheid`, previous booker, alert, week-report line, "ik laat het netjes achter" | ~3 days | ≥ 30 % of sessions checked in; owner can name the source of every "rommel" | < 10 % response → move the question to push / account card first |
| **2. Points ledger + levels + account card** | §3.1–3.3, §6 card, door-code footer line, points for sessions / check-ins / ratings (from launch day on — **no retroactive points**, owner decision 2026-09-18) | ~3 days | ≥ 50 % of actives open the card (tracked) | Nobody opens it → keep points, drop the card |
| **3. Streaks + badges** | §3.4–3.5, Monday cron, Thursday nudge, badge shelf, feed fix (§7.5) | ~3 days | Share of actives with ≥ 2 sessions/month goes up from 25/40 | No change after 8 weeks |
| **4. Community goal + templates + leaderboard v2** | §7.1–7.4, reward budget §10 | ~2 days | Goal reached at least 1 of 2 months; ≥ 2 challenges created by the owner | |
| **5. Experience rating v2** | §5: 7-day brake, energy question, "Ervaring" tab | ~1 day | Response ≥ 15 % with 4× more asks | Unsubscribes rise → back to 30 days |
| **6. Training + AI coach + coaches** | §8, §9 | ~2 days | Workout logs > 30 / month | |
| **7. Events** | §7.6 | ~1 day | First event with ≥ 5 sign-ups | |

Phase 1 is independent and solves the owner's real problem; it can ship without any gamification. Phases 2–3 are
the gamification core. Everything after is optional and should be decided on the phase-2/3 numbers.

Per phase, the usual gates: rollback test of the migration on production (DO-block + raise), per-role revokes and
column grants, `count: "exact"` on every write, ESLint 0 errors, tests for the pure rule modules (`lib/punten.js`,
`lib/badges.js`, `lib/netheid.js`), stage per file.

---

## 13. Owner decisions needed before building

1. **Point values and level names** (§3.2–3.3) — fine as proposed?
2. **Monthly reward budget** in credits (default 10), and whether the gym goal pays a credit or only a badge.
3. **Previous-booker window**: same day and ≤ 3 hours gap (proposed) — or stricter?
4. **Who sends the friendly reminder** — always the owner by hand (proposed), never automatic.
5. **Privacy text** for the tidiness link — approve the paragraph in §11.
6. ~~Retroactive points~~ — **decided 2026-09-18: no.** Everyone starts at 0 on launch day.
7. **Leaderboard**: keep it visible, or only the gym goal and personal progress?

---

## 14. Risks

- **Question fatigue**: a check-in at the start *and* a rating after the session. Mitigation: both one tap, both
  optional, rating capped at 1 per 7 days, check-in skipped automatically if the member answered today already.
- **Unfair blame**: the previous booker isn't always the one who made the mess (no door log, shared codes,
  participants). Mitigation: admin-only, pattern-based, owner verdict, never automatic action.
- **Empty rankings** at 40 actives: mitigated by the gym goal and the "most improved" board.
- **Hidden cost**: every credit given is revenue lost. Mitigated by the monthly budget and the 0148 caps.
- **Maintenance**: one ledger and one rules module keep the logic in one place; avoid per-feature point code.

---

## 15. Points economy v2 — agreed in chat 2026-09-18 (REPLACES §3.2, §3.3 and §10)

**Two counters.** `lifetime` (level points, only goes up) and `balance` (spendable). Redeeming lowers `balance`
only; a correction (cancelled / refunded session) lowers both. Ledger rows carry `kind='inwissel'` for redemptions
and are excluded from `lifetime`. **No retroactive points** — everyone starts at 0 on launch day.

| Action | Points | Cap / rule |
|---|---|---|
| Session attended (after `ends_at`) | 10 | booker + joined participants |
| Week with ≥ 1 session | +5 | per ISO week |
| Every 4 consecutive weeks (4, 8, 12 …) | +20 | 1 pause week per 8 weeks |
| Abonnement started | +50 | once per member, ever |
| Abonnement month paid | +20 | per paid invoice |
| 10-session card bought | +30 | per card |
| Gym check-in at start | 3 (+2 with photo) | 1 per booking, within the session window |
| Session rating | 2 | 1 per booking |
| Workout logged | 3 | 1 per day |
| Friend joins your session | +10 each | distinct people, max 2 per month |
| Referred friend trains for the first time | +50 | existing 0147 brake |
| AI coach: intake done + first plan | +30 | once |
| AI coach: weekly check-in answered | +5 | 1 per week |
| AI coach: planned session ticked off | +3 | 1 per session |
| AI coach: milestone reached | +20 | per milestone |
| AI coach: plan finished | +50 | per plan |
| Profile complete (goal, photo, birth year, frequency target) | +20 | once |
| Weight / body measurement logged | +3 | **max 1 per week** (values can't be verified — the cap limits the incentive to fake) |

**Reward:** 1 free session = **300 points** → 1 credit (`credits_ledger`, reason `punten`), valid 3 months.
Max 1 redemption per member per month; a gym-wide monthly cap set by the owner (default 15). Spendable points
expire after 12 months without a session. Points have no cash value (terms).

**Levels on `lifetime`:** Starter 0 · Regular 250 · Vaste klant 750 · Fittin'er 1500 · Legende 3000.
Perk: from Vaste klant on, +10 % points.

**Expected pace:** abonnee 2×/week ≈ 180 pts/month (free session every ~7 weeks); 1×/week ≈ 110 (~11 weeks);
2×/month ≈ 40 (~7 months). Effective discount for regulars ≈ 7–9 %.

All values live in one settings row per gym (`gamification_settings`), editable from the dashboard — never
hard-coded in the rules module.

## 16. Beheer → Punten (owner dashboard)

New menu item under **Groei**. One page, top to bottom:

1. **This month at a glance** — points earned, members who earned anything (% of actives), free sessions redeemed
   vs. the monthly cap, their cost in € (redemptions × session price).
2. **Is it working?** — sessions per active member and share of actives with ≥ 4 sessions/month, before launch vs.
   now (8-week trend); number of running streaks; abonnementen started since launch.
3. **Where points come from** — bar per action (sessions, streaks, check-ins, AI coach, profile, …): shows which
   behaviour the system actually drives, and which actions nobody does.
4. **Open balance** — total spendable points outstanding, expressed as free sessions and € (the liability), plus
   points expiring in the next 30 days.
5. **Level distribution** — how many members per level.
6. **Members table** — name, level, lifetime, balance, current streak, last session, tidiness light (Pillar A),
   redemptions. Search + sort. Click → the member's full ledger ("why these points") with a **manual correction**
   (+/− with a required reason, logged as `kind='correctie'`, owner name in `meta`).
7. **Watch list** — members hitting caps every period, weight logged at the exact cap every week with implausible
   jumps, many check-ins without a photo; purely informational.
8. **Settings** — point value per action (and on/off), price of a free session, monthly gym cap, per-member cap,
   expiry, level thresholds + perk. Changes apply from the moment of saving (never retroactive) and are logged.

Also: a points block on `/beheer/leden/[id]` (level, balance, streak, last 10 ledger rows) and a line in the Monday
week report ("deze week X punten verdiend, Y gratis sessies ingewisseld, € Z").

---

## 17. Growth through members — agreed direction 2026-09-18 (extends §7.3 and §15)

**Measured:** in the last 90 days 356 sessions, of which **57 with 2–4 persons** (≈ 70 guest visits, because a
session is priced per hour for 1–4 people). Only **5** of those guests are known to the system (booking
participants) and **4** email invites were ever sent. Guests already come — they are just anonymous. Capturing them
is the biggest growth lever, bigger than any new referral mechanic.

1. **Name your guests.** Booking with persons > 1 → "Wie komt er mee?" (name + email or phone, optional but asked
   every time). The guest gets a personal mail/WhatsApp link: "Jan neemt je mee naar Fittin' op dinsdag 19:00" with
   their own door-code copy and a 1-tap account creation. Their FittinWelcome hour stays unused (they came along, it
   wasn't their booking).
2. **Referral points (replace the §15 rows):** guest creates an account → host +20 · guest's first own session →
   host +100, guest +25 · guest takes an abonnement or buys a card → host +150. A friend who fully converts is worth
   ≈ 270 points ≈ almost one free session (~€12) — cheaper than a paid-ad signup.
3. **Ambassador tiers:** 1 converted friend → badge · 3 → badge + 1 free session (outside the monthly cap, from the
   referral budget) · 5 → "Ambassadeur" level flag + second free session.
4. **Personal invite page** `/van/{naam-code}`: "Jan traint bij Fittin' en nodigt je uit — je eerste uur is gratis",
   with the host's first name and level. One link to share via WhatsApp (native share sheet in the app).
5. **Ask at happy moments only:** after a 4–5 star rating, a level-up, a 4-week streak, a redeemed free session —
   "Ken je iemand die dit ook wil? Jullie krijgen allebei punten." Never after a 1–3 star rating or a "rommel"
   check-in.
6. **Gym goal "samen groeien":** one month a quarter the shared goal is new members, not sessions ("10 nieuwe
   leden in november"); reached → everyone who brought someone gets a bonus.
7. **Attribution:** store `invited_by` on the profile (first touch: guest link, referral code, `/van/` page) so the
   dashboard can show which members bring people in, and so points can't be claimed twice.

Dashboard (§16) gets a **Groei via leden** block: guests named vs. unnamed sessions, invites sent, guests → accounts
→ first own session → abonnement (funnel), top bringers, points and free sessions spent on referrals, cost per new
member vs. the Meta campaign.

## 18. Monthly scoreboard bonuses — 2026-09-18

Paid out on the 1st for the previous month (points this month, opt-in board, coaches/staff excluded):
- **Top 3:** +50 / +30 / +20.
- **Most improved** (points vs. previous month, min. 4 sessions): +50 — so newcomers can win too.
- **Top bringer** (most converted friends that month, ≥ 1): +50.
- These bonus points count for level and balance but are **not** themselves counted in next month's ranking.
- No draws / lotteries (Belgian gambling law) — only earned placements.
