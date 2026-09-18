# Fittin' Punten — gamification, community and growth

**Status:** GEBOUWD 2026-09-18 (migratie 0165, alle fasen). Plan v3 hieronder blijft de referentie. v3 (2026-09-18, evening) adds §13 *Business levers* after the owner's review:
daluren (empty hours), the abo campaign wired into the activation dashboard, more ratings → reviews, real attendance
via the door, cohort retention. **Everything goes through e-mail — no WhatsApp/SMS, ever.** Rejected by the owner:
calling non-starters by hand, promoting coaches to members, a weekly community hour. v1 written 2026-09-18 after a scan of the app and the production database; v2 is the
self-review of the same day: contradictions from the chat additions merged, weak spots fixed, phases re-ordered on
what the numbers say. Owner decisions so far: **no retroactive points**, points must buy a **free session**, big
emphasis on **inviting people**, points for **using the AI coach and logging body details**, a **full dashboard**.
v1 is kept next to this file for history.

---

## 0. What the data says (production, 2026-09-18)

| Fact | Value | Consequence |
|---|---|---|
| Members | 97, of which **92 joined in the last 90 days** (31 in the last 30) | Signups are not the problem — the Meta campaign works |
| Never booked · booked once · booked 2+ | **34 · 30 · 30** | **Activation is the leak**: 2 out of 3 members never became regulars |
| Days from signup to first session (avg) | 10 | The first two weeks decide |
| Active last 30 days · sessions | 40 · 126 | ≈ 4 sessions/day |
| Paid revenue last 30 days | **€ 1.836** (87 payments) · 10 active abonnementen | Every free session (~€ 12–15) is ~0,7 % of monthly revenue |
| Sessions with 2–4 persons (90 d) | **57 of 356 → ≈ 70 guest visits** | Guests already come; only 5 are known, 4 invites ever sent |
| Referrals rewarded · challenges · events sign-ups | 0 · 0 · 0 | The social features exist, nobody reaches them |
| Gym problem reports ever · post-session ratings ever | 1 · 5 (of 32 asked) | The report link in the door-code mail is ignored; the star mail gets ~15 % |
| Door-code mails | 93 of 126 sessions | The one channel that reaches every session |
| Door log | 27 rows ever | Attendance can't be proven; "confirmed booking in the past" is the best signal |
| Feed | 208 posts/30 d, all automatic; 0 comments, 5 kudos | Posts fire at **booking**, not after the session (bug) |
| Body metrics | 18 rows by 14 people · workout logs 7 | Logging is not a habit yet |

**Three levers, in order of value:** (1) get the 64 members who came 0–1 times to a second and third session,
(2) turn the ~70 anonymous guest visits per quarter into members, (3) keep the 30 regulars regular. The tidiness
check-in is the owner's operational need and rides on the same channel, so it ships first.

---

## 1. Rules of the game (principles)

1. **Ride on moments that already happen** — booking, the door-code mail, the after-session mail, the account home.
   Never a new place members must remember to visit.
2. **Only verifiable actions earn.** A session counts after `ends_at`, for a confirmed booking. Unverifiable inputs
   (weight, "I left it tidy") get small points and hard caps.
3. **Reward the report, not the complaint.** Clean and not-tidy earn the same.
4. **Two counters.** `lifetime` (level, only up) and `balance` (spendable, up and down). Redeeming never lowers a
   level; only a correction (cancelled/refunded session) lowers both.
5. **Points buy one thing: a free session.** No merch, no cash, no lotteries (Belgian gambling law). Every other
   payout is capped and budgeted.
6. **Accusations stay with the owner.** Members never see who was before them; the tidiness score is a pattern,
   never one data point, never automatic sanctions.
7. **Together beats against each other** at 40 actives: a gym-wide goal and "most improved" next to a top-3.
8. **Append-only ledger with unique source keys** — retries, double crons and re-delivered webhooks can't double-pay
   (pattern of `coach_ledger`, 0152). Point values are **frozen into each ledger row**; changing a setting never
   rewrites history.
9. **Per gym and per member switchable.** Multi-tenant settings row; member opt-out of everything visible without
   losing points.

---

## 2. Inventory — what exists and what it does in this plan

| Area (migrations / routes) | Today | Flaw found | Role |
|---|---|---|---|
| Booking incl. multi-slot (0164) | works | — | Core earn; "book your next 4 weeks" nudge |
| Door-code mail (`sendDueAccessCodes`, cron */5) | reaches every session | report link at the bottom, ignored | **Carrier** of the check-in and the one-line status |
| After-session star mail (`/f/[token]`, `session_feedback`) | 15 % answer, 1 per 30 d | — (Google review rule guarded by test) | Experience rating, brake to 7 d |
| Meldpunt (`/m/[token]`, 0150) + `vorigeGebruiker()` | 1 report ever | previous booker resolved by time only | Merged into check-in; 🔧 keeps the urgent path |
| Buddies / participants / e-mail invites (0017, 0023, 0068) | 2 / 5 / 4 | guests stay anonymous | **Name your guests** |
| Referral (0016, 0051, 0147) | pays +1 credit, 0 uses | double reward once points exist | Replace the credit by the points ladder (decision §9) |
| Leaderboard (0067 opt-in) | sessions this month | same names forever | Points board + most improved + top bringer |
| Challenges (0058, 0148) | engine with caps, 0 created | empty form | Templates + monthly gym goal (`goal_type='gym_total'`) |
| Feed (0052) | automatic posts | fires at booking; milestones count future bookings | Move to "session completed"; badges/levels post here |
| Events (0004/0031/0047) | 1 event, 0 sign-ups | — | Points for attending — **later**, no events yet |
| Workout logging, body metrics, favourites, saved videos | little use | — | Small daily/weekly points (log, weight); browsing earns nothing |
| AI coach (0157–0161, `/s/[token]` afvinken) | gated to 2 people | 0 check-ins | Frequency → streak target; intake/check-in/afvink/milestone/plan earn |
| Coach platform | 8 coaches, 11 client links | — | Coaches see streaks, give kudos; **no coach points** |
| Credits (`credits_ledger`, FIFO 0095, expiry) | works | — | Redemption currency, reason `punten` |
| Abonnement / 10-card | 10 active | — | Earn on start / monthly payment / card |
| Notifications, native push (`lib/native/push.js`) | bell works; app not in stores | — | Second carrier once the app is live |
| Week report (Mon 06:00), activation drips | works | — | Owner numbers; drips carry the starter quest |
| Privacy / terms (v2) | — | no loyalty or tidiness paragraph | Update needed (§10) |

---

## 3. The ledger

```sql
create table member_points (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references gyms(id),
  user_id    uuid not null references profiles(id) on delete cascade,
  kind       text not null,     -- see §4; plus 'inwissel' (redeem), 'verval' (expiry), 'correctie', 'scorebord', 'badge', 'handmatig'
  points     int  not null,     -- negative for inwissel / verval / correctie / handmatig(-)
  source_key text not null,     -- 'sessie:<booking>:<user>', 'week:<user>:<iso-week>', 'inwissel:<credit_grant>', …
  meta       jsonb not null default '{}',  -- {rule_version, base, multiplier, reason, by}
  created_at timestamptz not null default now(),
  unique (gym_id, source_key)
);
-- lifetime = sum(points) where kind not in ('inwissel','verval')   → level, never lowered by spending
-- balance  = sum(points)                                            → spendable
-- ranking  = sum(points) this month where kind not in ('inwissel','verval','scorebord','handmatig')
```

- Writes only via `security definer` functions / service role; members read own rows, staff read all; **revoke per
  role** (`revoke from public` does nothing on Supabase — growth-audit lesson); `count: "exact"` on every write.
- Settings in `gamification_settings` (one row per gym): value per action + on/off, redeem price, caps, expiry,
  level thresholds, perk multiplier, launch date. Every earn row stores `base × multiplier` and the `rule_version`.
- Corrections are automatic for a cancelled/refunded session (`correctie:sessie:<booking>:<user>`), manual only
  with a reason and the admin's id (`handmatig:<uuid>`).
- Expiry job (nightly): a member with **no session in 12 months** gets a `verval` row that zeroes the balance.
  Lifetime stays.
- Account deletion (`/account-verwijderen`): balance forfeited, rows deleted with the profile (terms say so).

---

## 4. What earns points

### 4.1 Starter quest — the activation lever (new in v2)

For the 64 members who came 0–1 times. Shown as a checklist on the account home and in the existing activation
drips; each step once per member, ever.

| Step | Points |
|---|---|
| Complete your profile (goal, training frequency, birth year, photo) | 20 |
| Book your first session | 10 |
| **Attend your first session** | 50 |
| Attend a second session within 14 days of the first | 40 |
| Attend a third session within 30 days | 30 |
| Tell us how you found the gym (after the first session) | 5 |

A completed quest is 155 points = half a free session. The quest is the *only* thing a brand-new member sees;
levels, streaks and the board appear after the third session so the first screen isn't a wall of zeros.

### 4.2 Training

| Action | Points | Rule |
|---|---|---|
| Session attended, own booking | 10 | after `ends_at`, confirmed, not cancelled |
| Session attended as a **participant** of someone else's booking | 5 | only if the participant **confirmed** ("Ik kom") from their own mail — that tap is also the attendance signal; max 1/day |
| Week with ≥ 1 attended session | 5 | per ISO week; the member's target can be 1–4 (AI-coach plan frequency overrides) |
| 4 consecutive weeks (4, 8, 12 …) | 20 | 1 pause week per 8 weeks; Thursday nudge if the week is still open and slots are free |
| Workout logged (≥ 1 set) | 3 | 1/day |
| Weight or body measurement logged | 3 | **1/week** — unverifiable, so small and capped |
| Session rating (stars) | 2 | 1/booking; ask brake 30 d → 7 d; opt-out stays; Google rule untouched |
| **Daluren session** (off-peak, see §13.1) | **×2 on the session points** | uses the gym's `dal_from/dal_to` (exists for challenges) |

### 4.3 The gym check-in (Pillar A)

| Action | Points | Rule |
|---|---|---|
| Check-in at the start: 👍 Netjes / 🧼 Niet netjes / 🔧 Iets stuk | 3 | 1/booking, valid `starts_at − 10 min … ends_at + 2 h`; same for every answer |
| Photo with 🧼 / 🔧 | +2 | 1/booking |
| "Ik heb alles teruggelegd ✅" in the after-session mail | 1 | 1/booking; informational, gives the next check-in context |

### 4.4 Paying and staying

| Action | Points |
|---|---|
| Abonnement started | 50 (once per member ever) |
| Abonnement month paid (Stripe invoice paid) | 20 |
| 10-session card bought | 30 |

### 4.5 Growth — bringing people (Pillar D, owner emphasis)

| Step | Host | Friend |
|---|---|---|
| Guest named on a booking and the guest **confirms** the invite | 5 | — |
| Guest / referred friend creates an account | 20 | — |
| Friend attends their **first paid** session (the free welcome hour doesn't count) | 100 | 25 |
| Friend takes an abonnement or buys a card | 150 | — |
| Ambassador tiers: 1 converted friend → badge · 3 → badge **+ 1 free session** · 5 → "Ambassadeur" + 1 free session | | |

A fully converted friend ≈ 270 points ≈ 0,9 free session (~€ 12) for the host — cheaper than a paid-ad signup.
"Converted" = first paid session. Attribution is first-touch on `profiles.invited_by` (guest link, referral code,
`/van/{code}` page) so a friend can only be claimed once.

### 4.6 AI coach (gated today; earns once opened up)

| Step | Points |
|---|---|
| Intake done + first plan generated | 30 (once) |
| Weekly check-in answered | 5 (1/week) |
| Planned session ticked off (`/s/[token]`) | 3 |
| Milestone reached (`coaching_mijlpalen`) | 20 |
| Plan finished | 50 |

### 4.7 Monthly scoreboard (paid on the 1st, kind `scorebord`, not counted in the next ranking)

Top 3: 50 / 30 / 20 · **Most improved** (vs. previous month, min. 4 sessions): 50 · **Top bringer** (≥ 1 converted
friend): 50. Board is opt-in (0067), coaches/staff excluded. Shown as top 5 + "jij staat 14e — nog 30 punten tot de
top 10".

### 4.8 Community goal

One shared monthly target, default 110 % of last month's attended sessions ("Samen 140 sessies in oktober"); once a
quarter the target is **new members** instead. Reached → everyone with ≥ 2 sessions that month gets 25 points; the
owner may add 1 credit from the budget. Implemented as a `challenges` row (`goal_type='gym_total'`) so the 0148 cap
logic is reused. `/beheer/challenges` gets 6 one-click templates so it stops being an empty form.

---

## 5. Levels and badges

| Level | lifetime | 1×/week reaches it in |
|---|---|---|
| Starter | 0 | — |
| Regular | 250 | ~2 months |
| Vaste klant | 750 | ~6–7 months · **perk: +10 % on every earn** |
| Fittin'er | 1500 | ~1 year |
| Legende | 3000 | 2+ years |

Badges (`member_badges`, + one `badge` ledger row each; rules in `lib/badges.js`, nightly cron): Eerste sessie ·
10/25/50/100 sessies · Vroege vogel (5× before 08:00) · Nachtuil (5× ≥ 21:00) · Daluren-held (10 off-peak) ·
4/12/26 weken op rij · Zaalwachter (10 check-ins) · Oog voor detail (3 photos marked useful) · Buddy (3 different
guests) · Ambassadeur tiers · Logboek (20 logs) · Plan afgewerkt.

---

## 6. Spending: the free session

- **300 points → 1 credit** (`credits_ledger`, reason `punten`, valid 3 months), booked like any session. Cancel
  → credit returns via the existing refund trigger; the points don't.
- Caps: 1 redemption per member per month; **gym-wide monthly cap, default 10** (≈ € 120–150, ~7 % of current
  revenue); when reached, redeeming waits for the 1st and the member sees why.
- Ambassador free sessions come from a separate **referral budget** (default 5/month) so growth isn't throttled by
  regulars redeeming.
- Expected pace: abonnee 2×/week ≈ 180 pts/month → free session every ~7 weeks (≈ 7–9 % discount for the best
  customers); 1×/week ≈ 110 → ~11 weeks; 2×/month ≈ 40 → ~7 months.
- Worst case with all caps hit: 15 free sessions/month ≈ € 200 ≈ 11 % of revenue. The owner sees this live (§8.4).

---

## 7. Pillar A in detail — the gym check-in and tidiness

**Moment:** at the start of the session, when the member sees the gym as the previous person left it.
**Carrier:** the door-code mail gets the three buttons *under the code* (code first, always). Later: push 10 min
after start; account-home card during the session.

```sql
create table zaal_checks (
  booking_id       uuid primary key references bookings(id) on delete cascade,
  gym_id uuid not null, user_id uuid not null,
  state            text not null check (state in ('netjes','rommel','stuk')),
  tags             text[] not null default '{}',        -- handdoeken, flessen, gewichten, vloer, kleedkamer, afval
  photo_path       text,                                -- private bucket, signed URLs (0154 pattern)
  previous_booking uuid references bookings(id) on delete set null,   -- resolved AT INSERT
  previous_kind    text,                                -- 'lid' | 'eigen' (same member) | 'pt' (coach present) | null (gap > 3 h / first of day)
  owner_verdict    text check (owner_verdict in ('terecht','onterecht')),
  created_at       timestamptz not null default now()
);
```

- **Previous booking** = last confirmed booking that ended ≤ 3 h before, same day. Same member (multi-slot, 0164)
  → `eigen`, no attribution. A PT session → attributed to the **coach** (professionally present), not the client.
  Participants of the previous booking stored in `meta`; the booker is responsible for their group.
- **Tidiness score (admin only):** last 90 days over the check-ins where the member was `previous_booking`:
  netjes +1 · rommel −1 · rommel with photo or verdict `terecht` −2 · `onterecht` 0. Traffic light only after ≥ 3
  check-ins: 🟢 · 🟠 · 🔴 (≥ 2 confirmed rommel in 30 days).
- **Owner surfaces:** `/beheer/netheid` — clean % per week and per hour band (8-week trend), timeline of 🧼/🔧 with
  photo, tags and previous booker (name, slot, participants), buttons *Terecht / Onterecht / Stuur vriendelijke
  herinnering* (pre-written neutral mail, always sent by hand), "Aandacht" list (🔴), tab *Ervaring* (stars +
  comments); tidiness light on `/beheer/leden/[id]`; a line in the Monday week report; bell alert on 2 rommel in a
  row; 🔧 keeps the urgent mail. Response < 20 % → numbers shown grey with "te weinig antwoorden".

---

## 8. Beheer → Punten (owner dashboard, menu Groei)

1. **This month** — points earned, members earning (% of actives), free sessions redeemed vs. cap, € cost,
   referral budget used.
2. **Is it working?** — baseline snapshot frozen at launch (sessions/active, % with ≥ 4 sessions, activation:
   % of new members with a 2nd session within 14 days, new members/month) vs. now, 8-week trend.
3. **Where points come from** — bar per action; shows what the system drives and what nobody does.
4. **Open balance** — outstanding spendable points as free sessions and €, expiring in 30 days.
5. **Growth via members** — funnel: guests named → confirmed → account → first paid session → abonnement; top
   bringers; points and free sessions spent on referrals; cost per new member vs. the Meta campaign.
6. **Levels** — members per level.
7. **Members table** — name, level, lifetime, balance, streak, last session, tidiness light, redemptions, brought.
   Click → full ledger ("waarom deze punten") + manual correction (± with required reason, logged).
8. **Watch list** — caps hit every period, weight exactly at the cap every week or implausible jumps, participants
   who never confirm, many check-ins without photo. Informational.
9. **Settings** — every value in §4–6 editable, on/off per action, launch date; changes apply from save time only.

Plus: points block on `/beheer/leden/[id]`; one line in the Monday week report.

---

## 9. Owner decisions still open

1. **Replace the +1 credit referral reward (0147) by the points ladder?** Recommended yes: same cost, paid out only
   when the friend actually converts, and no double reward.
2. Caps: gym-wide 10 free sessions/month + 5 referral sessions/month — OK?
3. Previous-booker window: same day, ≤ 3 h; PT sessions attributed to the coach — OK?
4. Approve the terms/privacy paragraphs (§10).
5. Open the AI coach to more members before or after launch? (Its earns only matter once it's open.)
6. Level names and thresholds (§5).

Decided: no retroactive points · points buy a free session · redeeming never lowers a level · no lotteries · friendly
reminder always by hand · scoreboard bonuses incl. most improved and top bringer.

---

## 10. Legal, privacy, fairness

- **Terms:** loyalty programme paragraph — points have no cash value, can be changed or ended with 30 days' notice,
  expire after 12 months without a session, forfeited on account deletion; free sessions subject to availability.
- **Privacy:** tidiness link to the previous booking, visible only to the operator; guest data (name, e-mail/phone
  given by a host) used for the visit itself and **one** follow-up ("maak je account"), no marketing without
  opt-in, deletable on request; photos in a private bucket, no people in photos, owner can delete.
- **VAT:** a free session via points is a discount on a 6 % sports service — confirm with the accountant, like the
  aanbreng wording.
- **Anti-gaming:** unique source keys; session points only after `ends_at`; participant points only after the
  guest's own confirmation; unverifiable inputs small and capped; no points for kudos; bonuses excluded from the
  next ranking; watch list for patterns.

---

## 11. Phases (each ships alone, measured after 4 weeks)

| # | Scope | Size | Success | Kill / rethink |
|---|---|---|---|---|
| **1. Zaalcheck** | §7: table, `/z/[token]`, mail block, `/beheer/netheid`, previous booker, alerts, week-report line, "netjes achtergelaten" | ~3 d | ≥ 30 % of sessions checked in; every 🧼 has a named source or an explicit "gap" | < 10 % → move the ask to the account card / push first |
| **2. Guests named + invite link** (no points needed) | §4.5 flow without the points: "Wie komt er mee?", guest mail with confirm + door code, `/van/{code}`, `invited_by`, funnel block | ~3 d | ≥ 50 % of 2–4-person bookings name a guest; ≥ 5 guest accounts | Hosts skip it → make it required for persons > 1 |
| **3. Ledger + starter quest + redeem + dashboard core** | §3, §4.1–4.4, §6, §8 (1–4, 7, 9), account-home card, door-code footer line, terms/privacy | ~5 d | activation: 2nd session within 14 d for new members ↑ vs. baseline; ≥ 60 % of actives open the card | Nobody opens the card → keep earning, drop the card |
| **4. Growth points + ambassador + scoreboard** | §4.5 points, tiers, referral budget, §4.7, §8.5, replace 0147 credit (if decided) | ~3 d | ≥ 3 converted friends/month | |
| **5. Streaks, badges, feed fix, community goal, templates** | §4.2 week/streak rows, §5, 0052 trigger fix, §4.8 | ~4 d | % of actives with ≥ 4 sessions/month ↑ | No change after 8 weeks |
| **6. Rating v2 + AI coach + coach view** | 7-day brake, energy question, §4.6, coach kudos | ~2 d | rating response ≥ 15 % at 4× the asks; check-ins > 0 | unsubscribes ↑ → back to 30 d |
| **7. Events** | points + badge when events exist | ~1 d | first event with ≥ 5 sign-ups | |

Gates per phase, as always: rollback-test the migration on production (DO block + raise), per-role revokes and
column grants, `count: "exact"` on writes, ESLint 0 errors, tests for `lib/punten.js`, `lib/badges.js`,
`lib/netheid.js`, stage per file. Freeze the **baseline snapshot** (§8.2) before phase 3 goes live.

---

## 13. Business levers (v3) — beyond points

Measured 2026-09-18: bookable 17 h/day, sold ≈ 4/day → **occupancy ≈ 25 %**; last 30 days evening 53 · morning 39 ·
afternoon 34 sessions, waitlist 9 (peak); 17 members trained before and not in the last 45 days; 10 abonnementen on
40 actives; door log 27 rows ever.

### 13.1 Rustige uren — automatic, not a fixed window

**Why not a fixed 12–17 window:** measured over the last 8 weeks, the busiest hours are Monday 17–19 (booked 8 of 8
weeks), **Sunday 10–12** (7 of 8), Wednesday 18, Thursday/Friday 08. Of the 119 bookable hours in a week, only 77 were
ever booked in 8 weeks. A fixed afternoon window would promote some busy Sunday hours and miss quiet evenings.

**How it works (fully automatic):**
1. **Nightly job** scores every hour-of-week (e.g. "Tuesday 14:00") on the last 8 weeks: in how many of those weeks
   was it booked. ≤ 2 of 8 → **rustig**. ≥ 5 of 8 → **druk** (never promoted). In between → normal. Stored in
   `slot_demand (gym_id, dow, hour, weeks_booked, klasse, computed_at)`.
2. **Last-minute rule:** any slot still free **within the next 24 h** that isn't `druk` is promoted too, whatever its
   history.
3. It **corrects itself**: an hour that starts filling up because of the promotion reaches 5 of 8 and stops being
   promoted; a busy hour that empties becomes quiet again.
4. **Owner override** on the dashboard: pin an hour to "never promote" or "always promote", switch the whole thing
   off, change the thresholds.

**What the member gets on a rustig uur:**
- **Double points** on the session.
- **2 uur voor de prijs van 1** when the next hour is also free (same for a credit: 1 credit = 2 hours).
- Not stackable with a discount code. **Half price / half a credit: no** (halves revenue on hours that would have
  been paid in full; `credits_ledger.delta` is `int`). Kept as a later experiment.

**Where it is visible:**
- **`/boeken` rooster**: rustige uren get a green badge "⚡ Rustig · 2u voor 1 · dubbele punten"; a toggle
  "Toon enkel rustige uren" above the grid; `druk` hours get a small "populair" label (also nudges people who can
  choose). Mobile the same, in the slot list.
- **Multi-slot basket** (0164): "3 van je 4 momenten zijn rustige uren: +60 punten en 3 uur gratis".
- **Account home card**: "Deze week rustig: di 14:00 · wo 15:00 · do 21:00 — boek met dubbele punten".
- **Weekly e-mail** (existing recap / week-report style, members): the 3 quietest slots of the coming week.
- The promotion is **frozen onto the booking** when it's made (`bookings.promo`), so it can't disappear after booking
  or be changed by the nightly job.

**Owner dashboard:** a week heatmap (7 × 17 hours) coloured rustig / normaal / druk, with the pins; occupancy per
band before/after launch; how many sessions moved from `druk` to `rustig`; free hours given away via 2-for-1.

### 13.2 Abonnement campaign — wired into Activation, per person

Today: an insight mail (`insight_abo_voorstel`, 9 sent/30 d) and a card on the dashboard. Change it into a
**tracked campaign** in the existing `campaigns` engine (`kind='activation'`, matcher "2nd paid los session in the
same calendar month, no active abonnement"), so it gets what every activation campaign has: cooldown, sends log,
and a per-member status.

Owner view on `/beheer/activatie/<abo>` must read as a **story per person**, not a number:
"**Sam** · 2e sessie op 14 sep → mail verstuurd 15 sep → geopend → abonnement gestart 18 sep ✓" or
"… → geen reactie · 3e sessie op 21 sep → herinnering 22 sep". Columns: trigger date, mail sent, opened (Resend
webhook), clicked, converted (membership row), or "nog open" with the next step. Totals at the top (matched / mailed /
converted / € per month gained) come *from* that list, not instead of it. Member side: the same message on the
account home the moment the 2nd session is booked ("Met een abonnement had deze sessie € 12 gekost — € 3 minder"),
plus +50 points on start (§4.4).

### 13.3 More ratings, more reviews

- Ask brake 30 d → **7 d**, and ask again after a **redeemed free session** and after a **level-up** (happy moments).
- Rating = 2 points (§4.2); the thank-you page keeps the Google link for **every** score (policy rule, test-guarded).
- ~~After a 4–5 rating, an extra Google line~~ — **dropped while building**: asking only happy raters is exactly
  the "selective solicitation" Google forbids. The review ask stays identical after every score (existing rule).
- Dashboard (§8, tab *Ervaring*): ratings/week, response %, average, comments, and the Google review count pulled by
  hand once a month (no API) — target 20 reviews before the next Meta campaign.

### 13.4 Real attendance through the door (enabler)

Per-booking Nuki codes exist (0102/keypad plan) but are not configured — the owner must enter the token and
smartlock id. Once every session opens the door with its own code, `door_log` tells who actually came. Then:
session points switch from "confirmed booking after `ends_at`" to "door opened", tidiness attribution becomes fair,
participant confirmation is no longer needed, and no-shows become visible (and can lose the week's bonus). Until
then the plan runs on bookings.

### 13.5 Cohort retention — the one number

Dashboard block (§8.2): for each signup month, % still training after 1 / 2 / 3 months (≥ 1 session in the
month). One small table, twelve rows. Baseline frozen at launch. This is the number that says whether §4.1, §13.1 and
§13.2 work.

### 13.6 Phase changes

Phase 3 gains §13.2 (abo campaign as tracked activation) and §13.5. Phase 5 gains §13.1 (daluren double points +
2-for-1) — or earlier as its own 2-day phase if the owner wants occupancy first. §13.3 is in phase 6. §13.4 is an
owner action, not a build phase.

---

## 12. Risks

- **Question fatigue** — check-in at start + rating after. Both one tap, optional, rating max 1/7 d, check-in skipped
  if answered today already.
- **Unfair blame** — no door log, shared codes, participants. Admin-only, pattern-based, verdict, never automatic.
- **Cost creep** — every credit is revenue lost. Two budgets, live € on the dashboard, values frozen per row.
- **Farming participants** — solved by requiring the guest's own confirmation and 5 pts instead of 10.
- **Empty rankings** — community goal + most improved + top bringer.
- **Complexity** — one ledger, one settings row, three pure rule modules with tests. No per-feature point code.


---

## 19. Build notes (2026-09-18)

Decided while building (the owner said "decide yourself"):
- **Referral credit kept.** The existing +1 credit from 0147 is promised in onboarding copy and terms; the points
  ladder comes on top. At 0 referrals so far, the extra cost is negligible; revisit if referrals take off.
- **Community goal pays points only** (25), no credits.
- **Challenge templates: 3, not 6** — only goal types that `award_challenges()` actually pays out (sessions, off-peak,
  streak). "Bring a friend" and "log 10" live in the points ladder instead.
- **Profile quest step** = goal (`coaching_doel`, shared with the AI coach) + weekly target (`streak_target`).
- **Campaigns "Abonnement na 2e sessie" and "Rustige uren deze week"** exist as templates (Activatie → Sjablonen),
  created as drafts — nothing is mailed until the owner activates them.
- **Signed links instead of token columns** for the check-in (`/z/`) and "Ik kom" (`/k/`): `lib/sleutel.js`.
- **Only role `lid` earns points**; coaches and beheerders never do.
- **Refund fix bundled:** `refund_member_credit` now refunds exactly what was used (also fixes 1.5 h → 2 credits).
