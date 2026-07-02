# Fittin' — UX, Design, Onboarding, Growth & Superadmin Masterplan

> **For the implementing session (Opus 4.8):** this plan was researched by 7 parallel code-readers + a completeness critic on 2026-07-02 — every claim carries file:line refs from that day (paths relative to `website/`). Execute batch-by-batch, gate every batch with `npm run build` (must compile clean) + a manual smoke of the money paths (book→pay, credits, door) + the Batch-0 vitest suite once it exists. Commit per batch, push = Vercel deploy **to a LIVE gym with paying members**. Migrations: additive SQL only, numbered `01xx`, applied via `node --env-file=.env.local scripts/migrate-mgmt.mjs <file>` — never destructive, always `if not exists` discipline. Verify a file's current state before editing — refs may have drifted.

**Goal:** make the paid product feel as designed as the marketing homepage (not AI slop), never let a member silently overpay, automate the first-30-days money funnel that today goes dead after the free session, turn the ~900-page exercise moat + built-but-buried referral loop into real acquisition, and give the owner a one-screen cockpit instead of a 4-page morning scan.

---

## 0. Guardrails — read before writing any code

**Business rules that are settled. Do NOT reopen:**
- Pricing: losse sessie **€15** · 10-beurtenkaart **€150** (=11, 6-month expiry) · abo **€12/mnd** (1 incl. session expiring end-of-month, then €12/session) · coach credits €12 (may go negative). No duration discounts.
- FittinWelcome = first session **automatically free** (no code entry — copy was fixed 2026-07-02; the prefab drip still says "code", fix in 2.4).
- Positioning: "betaal enkel voor je tijd" — no membership fee pressure, honest copy, no dark patterns.
- All public/member/coach copy is **Dutch (Vlaams)**. Code comments English.
- Multi-tenant `gym_id` on every data model stays mandatory (see owner decision #7 for the tenancy pragmatics).

**Production constraints:**
- LIVE Stripe. Do not touch: webhook idempotency (`stripe_events` PK + `paid=false` single-transition guard), the 35-min unpaid-hold vs 32-min checkout-window alignment, the race-refund logic, FIFO credit functions (`credits_balance`, `credits_balance_detail`), deferred booking-invites (sent only after payment), the inbox self-loop guard in `lib/inbox.js`, `send()`'s `res.error` checking.
- ⚠️ `gyms` table is world-readable (`0001_init.sql:330 using(true)`) and carries `iban` + `access_code` columns. **The owner must not fill those fields until Batch 0.2 ships.** The admin forms currently invite exactly that mistake (betalingen/page.jsx:67, instellingen/page.jsx:45).
- No new runtime dependencies without strong justification (currently the bundle is essentially dependency-free besides sharp/stripe/resend/supabase). No TypeScript migration — plain JSX is the codebase convention.

**Anti-slop charter (the owner's hard requirement — applies to every visual/copy task):**
1. **The identity already exists — amplify it, invent nothing.** It is: the 7-token palette (`globals.css:3-13` — brand indigo / accent green / lav / paper / borderc), Bricolage Grotesque on every h1-h3 via one global rule (`globals.css:28-32`), Lato body, green pill CTAs, white bordered `rounded-2xl/3xl` cards with hover-lift, floaty blobs + brand-mesh, the green apostrophe wordmark, honest Flemish copy. The homepage (`app/(site)/page.jsx`) is the flagship — extend it inward.
2. **No**: stock/undraw illustrations, fake testimonials or invented numbers, generic gradient heroes, emoji-as-UI (47 occurrences to remove, not add), confetti, countdown-fake-urgency, new icon fonts or component libraries, new hex values outside the tokens.
3. **Copy voice:** direct, concrete, Flemish. Numbers over adjectives ("Dit was je 3e losse sessie deze maand (€45). Met het abo betaalde je €36." — not "Bespaar nu!"). Every empty state names the next action.
4. **Motion:** only the existing keyframes/utilities (`floaty`, `fade-up`/Reveal, `shine`, `pulse-ring`, `shimmer` — globals.css:34-101); `prefers-reduced-motion` is already guarded, keep it that way.
5. **Photography:** design the slots, ship branded placeholders (brand-mesh + blob, existing aesthetic), drop the owner's REAL photos in later. Never stock photos of a different gym.

---

## 1. North star & measurement (instrument BEFORE building nudges)

**North star:** weekly booked sessions (the direct revenue proxy at €12-15/session).
**Activation:** 2nd booking within 30 days of the first. **Secondary:** free-session→paid conversion, referral signups, at-risk count (owner already sees it: analytics/page.jsx:73).

Current instrumentation: a genuinely good cookieless first-party pageview pipeline (`0082_page_views.sql` + `/api/pv` + `/beheer/verkeer` — a privacy story worth keeping) and a DB-derived funnel on `/beheer/analytics`. But: **zero events** (slot chosen / checkout started / signup are invisible — pv/route.js stores pageviews only), and **UTM params are stripped** (pv/route.js:17-18) so the owner's Google Ads / Instagram spend is unattributable. Batch 0 fixes both with ~4 beacon call sites, no external tracker.

---

## BATCH 0 — Foundations, safety net & unblockers (~2-3 days)

### 0.1 Minimal event beacon + UTM capture (extend what exists — no new tracker)
- One migration `01xx_site_events.sql`: add nullable `event text`, `utm_source/utm_medium/utm_campaign text` columns to `page_views` (or a sibling `site_events` table mirroring 0082's RLS). Beacon accepts `{event}`: instrument `booking_slot_chosen`, `checkout_started` (redirect into Stripe in `boeken/actions.js`), `signup_completed`, `install_prompt_shown/accepted` (PWAInstallPrompt.jsx), `referral_link_shared` (Batch 5). PageView component whitelists+lowercases UTM once per landing.
- `/beheer/verkeer`: add a "Campagnes" panel next to Herkomst + a booking-funnel strip (bezoek → slot → checkout → betaald, joining events with bookings).
- `/beheer/analytics`: monthly activation cohort card (signup month × % first booking ≤14d × % 2nd booking ≤30d — computable from data the page already fetches, page.jsx:80-88).

### 0.2 ⚠️ Move `iban` + `access_code` off the world-readable gyms row (unblocks the owner)
Migrate both columns into the service-role-only `gym_integrations` table (the Nuki token already proves the pattern — instellingen/page.jsx:15-28). Update the two admin forms + their actions in `beheer/actions.js` (read/write via `createAdminClient`), and `lib/reminders.js:76-84` (static door-code fallback) + invoice rendering to fetch server-side. Keep the old columns (additive discipline) but stop reading them; note in the migration header they're retired. **Then tell the owner IBAN + door code are safe to enter.**

### 0.3 Shared primitives (each ~S, they pay for themselves across every later batch)
- `components/ui/Icon.jsx` — merge the three existing hand-rolled stroke-icon dictionaries (BottomTabBar.jsx:8-17, page.jsx:384-405) into one `{name, size}` component (~20 24px stroke-2 paths). Swap the dingbats/emoji in AdminSidebar.jsx:6-27, CoachSidebar.jsx:7-16, ☰/✕ drawer buttons, ToastHost ✓/⚠, coach/layout.jsx:41-47 banners. No icon font.
- `components/ui/Button.jsx` — variants accent/brand/outline/ghost, sizes matching the 3 most common existing specs. **Adopt opportunistically** (new code + files you touch), no big-bang codemod of the 159 hand-typed pills.
- `components/ui/EmptyState.jsx` — generalize the good-but-unused ComingSoon pattern (dashed rounded-3xl + accent/15 icon chip + title + CTA pill). Wire the top spots: leaderboard-empty → "Boek je sessie", coach clients-empty → "Nodig je eerste klant uit", account betalingen, beheer inbox. (50 bare "Nog geen…" paragraphs exist; convert the ~10 highest-traffic.)
- `lib/format.js` — `euro()`, `fmt()`, `fmtDay()`, `ago()`, `tone()`; sweep at least the 9 admin copies (drift is real: `ago()` variants disagree).

### 0.4 Contrast remap at the token layer (verified WCAG failures, ~750 call sites, one remap)
On white: `text-lav` 2.18:1 (211×), `text-accentdark` 2.76:1 (177×), `text-brand/40` 2.45:1, `/45` 2.79:1, `/50` 3.22:1. Fix centrally in `globals.css`: add `--color-ink-soft` (≈#5A5479, ~6:1) for muted-on-light; darken accentdark **for text use** to ~#1e7a33 (≈5:1) or add `--color-accent-text`; codemod on-white usages (keep `text-lav` on `bg-brand` — 7.31:1, passes). Check the pricing-card `✓` on white (page.jsx:347, 1.79:1). Older members are a core gym demographic; this is readability, not pedantry.

### 0.5 Regression safety net (critic finding: zero tests, no CI, no error monitoring)
- Add vitest (dev-only) + ~15 pure-logic tests for the money seams: `lib/booking-status.js` isSettled/sourceLabel matrix, `lib/format.js`, discount CAS logic (mockable), ICS generator (Batch 1.4), price math in BookingClient extracted to a pure helper.
- `.github/workflows/ci.yml`: `npm run build` + `vitest run` on push (stub env vars).
- Decide error monitoring (owner decision #5): recommend **no external SDK** (keeps the "geen externe tracker" claim); instead a tiny `logError()` that inserts into a `client_errors` table from a global error boundary + `window.onerror`, surfaced in the Batch 6 health strip.

### 0.6 Legal & safety layer (critic blind spots — the gym is explicitly unstaffed)
- **Emergency block** (owner supplies final text; draft now): address + "bel 112" + EHBO-kit location + emergency contact in (a) the access-code email (lib/email.js access-code sender — the one message every member reads at the door), (b) `/huisregels`, (c) the Batch 2.6 first-visit card. Grep confirms zero noodgeval/112/EHBO content today.
- **Algemene voorwaarden + herroepingsrecht** page (Belgian consumer law for online sales of €150 cards/abo's): draft `/voorwaarden` (route + footer link), reference it at checkout (`checkoutParams` custom_text or a line above the pay button), cover punch-card expiry, abo cancellation, reschedule-tot-6u policy, herroeping carve-out for booked services. **Owner/accountant must review before publish** (decision #6).

---

## BATCH 1 — The money-honest member loop (mobile-first daily driver, ~3-4 days)

*The single biggest trust bug + the highest-frequency journeys. Mostly S-effort, huge yield.*

### 1.1 Auto-apply credits at checkout (top trust bug left in the product)
`useCredit` starts `false` (BookingClient.jsx:38) — a €150 punch-card holder silently pays €15 cash unless they find a low checkbox (L506-511) while their credits run toward expiry. FittinWelcome already auto-applies (L37) — credits must behave the same: init `creditBalance >= duration && !welcomeApplies`, checkbox becomes opt-OUT ("Betaal liever cash"), show "Je saldo: N (vervalt {date})" at the top of the summary, label the total "{duration} sessies" when duration>1. Mirror the server default in `createBookingAction` if it trusts the flag.

### 1.2 Mobile sticky booking bar (deferred item, verified at BookingClient.jsx:497)
Summary panel is `lg:sticky` only; on phones price + "Bevestig" sit below ~5 cards. Add a `<lg` fixed bottom bar (above BottomTabBar) showing selected moment + total + confirm; state is already lifted. Most bookings are mobile — this is the checkout-friction fix.

### 1.3 Notifications visible on mobile + a bell that updates
- Nav bell is `hidden sm:block` (Nav.jsx:88) and BottomTabBar has no badge (L24): add an unread dot to the Account tab (it already fetches `/api/me`), and/or show the bell on all viewports.
- Refetch `/api/me` on `visibilitychange`/`focus` (+60s interval when `display-mode: standalone`) — today the badge is fetched once on mount (Nav.jsx:46) and never again, so an installed-PWA user never sees a new door code or coach message arrive.
- Stop bulk-marking ALL notifications read on page open (notificaties/page.jsx:25-26) — mark on click + keep an "Alles gelezen" button.

### 1.4 Add-to-calendar (ICS) — table stakes for a booking product, zero matches in repo
Small `lib/ics.js` (VCALENDAR/VEVENT, TZID Europe/Brussels, UID=booking id, LOCATION Aannemersstraat 186, SEQUENCE bump on reschedule). Attach to the confirmation + reschedule emails (lib/email.js), route `app/api/bookings/[id]/ics` (auth: owner of booking), "Zet in je agenda" buttons on the confirmed screen (BookingClient.jsx:194-211) and each upcoming booking card. Unit-test the generator (0.5).

### 1.5 Quick-rebook (nearly free — the restore effect already consumes ?d/&h/&p/&u, BookingClient.jsx:88-104)
"Boek opnieuw →" on every history row linking to `/boeken?d=<next same weekday>&h=<same hour>…`; on the account CTA, compute the member's modal weekday+hour server-side and offer "Jouw vaste moment: wo 18:00 — boek in 1 tik".

### 1.6 Door moment hardening (before push exists — Batch 7 adds the channel)
- `DoorButton.jsx` has **no try/catch** — offline at the gym door it freezes on "Openen…" forever. Catch → Dutch error + retry.
- Render the access code inline in the next-session card on `/account` within the lead window (data path exists — reminders.js already writes it to a notification); the network-first SW then caches the page, so the last-seen code survives signal loss at the door.
- Replace the SW offline fallback (sw.js:33 serves the *marketing homepage* for any uncached page) with a tiny cached `/offline` route: "Geen verbinding — je code staat in je e-mail + onderaan /account."
- Availability-aware reschedule (deferred item): reuse the **existing** solved pattern — `coach_free_hours` RPC + CoachSlotPicker (components/coach/CoachSlotPicker.jsx) — for the member's RescheduleBooking.jsx (today: blind date+select+server-error, L57-77). Effort S-M, not from scratch. Replace its `window.location.reload()` with `router.refresh()`.

### 1.7 Honest membership copy
"voorrang bij piekuren" (account/page.jsx:227) promises a feature that doesn't exist. Either remove it, or implement the cheap real version: members book N days further ahead (one check in `create_booking` comparing horizon vs membership) — a genuine abo perk. Owner decision #4.

---

## BATCH 2 — Lifecycle automation: the first-30-days money spine (~3-4 days)

*Resolution of the research contradiction: the TRANSACTIONAL spine becomes automatic and always-on; MARKETING campaigns stay owner-controlled but become one-click prefabs. Post-first-session is currently a total dead zone — no touchpoint exists between the door code and (maybe) a credit-expiry warning.*

### 2.1 Day-0 branded welcome for self-signups
Self-signups get only the Supabase confirm template; Google signups get nothing (login/actions.js:30-53, auth/callback/route.js:29-31 — sendWelcomeNewAccount is admin/coach-created-only). Send a transactional welcome (FROM_BOOKING, no unsubscribe dependency): free first session auto-applied, how the door works, book at /boeken, huisregels link.

### 2.2 Post-first-session follow-up (the missing conversion beat — likely highest-ROI change in this plan)
`sendFirstSessionFollowup` + a sweep in the existing daily cron: members whose FIRST booking ended 2-24h ago → "Hoe was je eerste sessie?" + rebook CTA + honest pricing recap (€15 los / €150=11 / €12 abo) + Google-review ask (only once GBP exists, Batch 5.6). Idempotent via a marker (notification trail or `first_followup_sent`).

### 2.3 Nth-single-session nudge (honest math, no dark pattern)
On the 2nd/3rd paid single session in 30 days, append one line to the confirmation email + the `?betaald=1` banner: "Dit was je 3e losse sessie deze maand (€45). Met de beurtenkaart betaalde je €40.90, met het abo €36." Pure arithmetic in the existing senders.

### 2.4 Drip fixes (stop-on-convert was deferred — verified still open)
- Steps are pre-scheduled wholesale in Resend at enrollment (newsletter.js:199-239); only unsubscribe cancels (303-314). On abo/punch-card purchase (webhook) and optionally first booking: cancel scheduled `campaign_sends` via `resend.emails.cancel(resend_id)` + mark rows.
- Prefab drip step 1 still says "met de code FittinWelcome" (newsletter-actions.js:109) — align with the live "automatisch gratis" copy.
- "Schrijf bestaande leden in" backfill button on drip campaigns (skip step 1 when `visits_total>0`).

### 2.5 Prefab win-back campaigns (one-click, mirroring createOnboardingDrip)
Two drafts in `activation-actions.js`: "We missen je" (inactive ≥14d, honest tone, no discount) and "Abonnement gestopt" (lapsed_member, optional +1 reward credit). Owner reviews copy → one toggle → the existing daily cron does the rest. Turns the dormant activation engine into running retention.

### 2.6 "Jouw eerste bezoek" card on /account (pre-first-session)
When `bookedCount===0` or first booking upcoming: 3 steps (code 5 min vooraf per mail + app → paneel naast de deur → werkt enkel tijdens jouw slot) + address/maps + huisregels link + the 0.6 emergency line. Reuse the exact confirmation-email copy (email.js:107-121) so email and app tell one story. Today a nervous first-timer finds the door story only in email.

### 2.7 Guest → member funnel (critic blind spot: warmest leads, one email ever)
Buddy guests (email_invites) physically train at the gym and then hear nothing — the invite mail is the only consumer of that table (lib/booking-invites.js:34-40). Day-after email to non-member guests: "Hoe was het trainen bij Fittin'? Je eerste eigen sessie is gratis" + signup link carrying `?ref=` of the inviter (rewards the existing referral loop).

### 2.8 Coach first-run checklist + publish gate
New coaches land on a bare dashboard, invisible on /coaches until they find the buried `coach_public` checkbox (profiel/page.jsx:36), and blocked until they buy credits — nothing tells them. Dismissible 4-step checklist on /coach (foto+bio → tarieven → zet jezelf publiek → eerste tegoed), computed from fields already in getCoachContext. Change `addCoach` (beheer/actions.js:660-662) to NOT auto-publish empty profiles (gate on photo+bio present). Extend the role-changed mail into a proper "welkom als coach" sequence of one.

---

## BATCH 3 — Coach/PT platform: from booking tool to coaching tool (~4-5 days)

*PT is the highest-margin product (€60/u) and coaches recruit members (AddClientInline). Today the core deliverable is a ComingSoon stub while the full backend sits orphaned.*

### 3.1 Un-stub the coach program builder (backend 100% done, verified orphaned)
/coach/programmas + /coach/oefeningen render ComingSoon while `coaching-actions.js` contains the complete guarded backend (create/edit programs, days, exercises, assign-with-copy → member notification → /training rendering) and the owner has a working builder UI at /beheer/programmas/[id]. Port that UI with coach scoping. The dashboard already advertises this feature (page.jsx:260-275) — make the promise true.

### 3.2 `/coach/clienten/[id]` — per-client detail (the most-requested PT screen)
Upcoming + past bookings, workout_logs adherence vs the assigned program (mirror /beheer/leden/[id]/page.jsx:45-61 with a coach_clients authorization check), weight trend, message shortcut, and private notes (small `coach_client_notes` table, coach-only RLS). The owner has all of this for every member; the coach has none of it for their own clients.

### 3.3 Route PT intakes to coaches
Intake form gets an optional "Voorkeurscoach" select (coaches are showcased on the same page); `requestIntake` notifies the chosen coach (else all public coaches) + an "Intakes" block on /coach with one-click "maak client aan & verbind" (reuse coachCreateClient). Today the person who will actually do the intake only hears about it if the owner forwards it manually.

### 3.4 Messaging UX pass
`coach_messages` has no read state (0042); threads sort ~alphabetically, default to `clients[0]`, no unread badges, newest messages hidden below the 60vh scroll box (MessageThread.jsx:17-19). One migration (`read_at`), unread badges in CoachSidebar + member side, recency sort + default-most-recent, scroll-to-newest, and an after-N-hours-unread email nudge via the existing cron. Member side: `/training` assumes ONE coach (`limit(1)` — training/page.jsx:40); render a coach switcher for multi-coach members so coach #2's messages stop vanishing.

### 3.5 Attendance & recurring
- Past-sessions view on /coach/agenda (query already returns everything; group past desc) + per-client month counts — coaches invoice clients from this. Cap the dashboard's fetch-ALL-bookings query while there (page.jsx:53).
- Surface `coachBulkBook` (weekly recurrence ×N weeks, fully built at actions.js:140-186, zero callers) as "Herhaal wekelijks" in the booking form + scheduler modal.

### 3.6 Payment-request feature: ship it or delete it (owner decision #3)
Both ends dead despite live plumbing: no coach UI calls sendCoachPaymentRequest (actions.js:349-380); the member account fetches requests + imports payCoachRequest but never renders them (account/page.jsx:8,71,85 — a dead query on every load). **Ship** = form on the client card + pay-card on /account + status on /coach/betalingen. **Delete** = remove the dead fetches and ~5 files of confusion. Recommend ship — it's a new payment rail for PT.

### 3.7 Coach ergonomics
Planner nav unification (client-side week toggle + server ?w arrows are two competing systems on one widget — page.jsx:277-323 vs CoachScheduler.jsx:13,96); make Client optional in the scheduler modal (hero form allows reserve-only, modal doesn't); collapse the duplicated "Aankomende sessies" into a 3-item preview; replace the 3 `window.location.reload()` calls in CoachSessionActions with `router.refresh()`; `px-8`→`px-4 md:px-8` on coach pages; a mobile day-column view for CoachScheduler (min-w-[640px] forces horizontal scroll on the coach's daily screen).

---

## BATCH 4 — /account rebuild + design unification (~4-5 days)

### 4.1 Restructure /account into a "Vandaag"-first member home (L — the one big rebuild in this plan)
The 578-line page renders ~20 sections; the door code and next booking sit ~15 sections deep, below leaderboard/promos/a 120-row weight table (page.jsx L399-437 before L439-521; history unbounded L528-556). Split: **/account** (Vandaag: door/pay banners, NextSessionTimer, next booking WITH door code, book CTA, actionable requests) · **/account/boekingen** (upcoming + paginated history + reschedule + quick-rebook) · **/account/voortgang** (metrics, weight chart, session stats/streaks — new Stat strip: sessions this month, weekly streak, hours trained, next credit expiry; data already exists) · **/account/profiel** (settings, linking, betalingen, leaderboard opt-out). Keep every server action; this is IA surgery, not logic changes. Fix the BottomTabBar guest-flash (role=undefined→guest tabs, L42) while touching it.

### 4.2 Carry the motion system into the product (existing tokens only)
Reveal on account/workouts cards; the never-used `animate-pulse-ring` (globals.css:51-55 — dead CSS today) becomes the **door-open heartbeat** on DoorButton and the imminent-session CTA — Fittin's signature interaction gets its signature animation for free; `.shine` on the booking summary confirm.

### 4.3 Display-type moments in the app
Reuse the homepage Counter-band treatment (font-display numerals, page.jsx:161-177) for beheer stats (beheer/page.jsx:86-93), coach stats, and member credit/session counters. Load Bricolage weight 900 (layout.jsx:19) so `font-black` headings stop silently resolving to 800.

### 4.4 Photography slots (design now, owner photos later — decision #1)
/degym hero = full-bleed photo slot behind brand/65 overlay (mirroring the homepage video treatment); the three "We love …" cards (degym/page.jsx:45-49) become photo cards; coaches/[id] hero. Branded placeholders until real photos arrive; `next/image` throughout (pattern at coaches/page.jsx:37-38). /degym — the page about the physical gym — currently contains zero photographs.

### 4.5 Responsive shells + page-shaped skeletons
The 32 hard-coded `px-8 py-8` beheer/coach wrappers → `px-4 py-6 md:px-8 md:py-8` (owner phone-admin recovers ~18% width). Add loading.jsx composing SkStats/SkList to the heaviest routes (beheer/boekingen, leden, betalingen).

### 4.6 EmptyState + icon rollout completion
Finish converting the remaining "Nog geen…" spots (0.3 did the top 10) and the last emoji-as-UI stragglers found by grep.

---

## BATCH 5 — Growth & SEO: activate the moats (~3-4 days + owner material)

### 5.1 Exercise category hubs (highest-leverage SEO change available)
~850 of ~900 exercise pages are internally near-orphaned: the index server-renders only 48 (oefeningen/page.jsx:18 `slice(0,48)`), filters are buttons not URLs, detail pages link 6 siblings. Build `/oefeningen/[categorie]` hubs (categories already come from getExercisesCached) listing ALL exercises per category + intro copy; real `<Link>` filter chips on the index; breadcrumbs on detail pages; hubs into sitemap.js. This converts sitemap-only URLs into a linked topical cluster that can actually rank → every exercise page carries the signup CTA.

### 5.2 Schema completion via one shared `lib/seo.js`
Merge the two drifted HealthClub LD blobs (home has sameAs no hasMap; degym vice-versa; neither has telephone/openingHoursSpecification). Add: FAQPage LD on personal-training (faq array exists, page.jsx:83-108 — calorieen-berekenen already ships the pattern), Person LD + canonical-to-slug on coaches/[id] (uuid + slug both resolve today = duplicate content), canonicals on /workouts(+slug), Breadcrumb LD on exercise pages, title template `%s | Fittin'` (layout.jsx:27-31) with page titles stripped.

### 5.3 /degym becomes the "privégym in Gent" location page
Heading surgery only (copy stays honest): H1 "Privégym in Gent — de zaal is helemaal van jou", a "Fitness in Sint-Amandsberg" section around the existing map/parking block. Today no heading on the site says "Gent". Weave "personal training in Gent" H2 coverage into personal-training. Add /coaches to the public nav (Nav.jsx:6-12) + real coach cards (photo/name/specialty from getPublicCoachesCached) replacing the abstract 4-tile grid on home — faces are the strongest trust element available without new material.

### 5.4 Referral: one honest amplification (fully built, fully invisible)
The loop works end-to-end (code → ?ref= signup → pending_referral → webhook reward) but lives only on auth-gated /community as a non-copyable pill. Add "Deel je link" (copy + WhatsApp via the existing ShareRank `navigator.share` pattern) on /account and the booking-success screen ("Breng volgende keer een vriend mee — die traint gratis"). **Keep the promise:** community copy pledges the inviter "een extra punt op het scoreboard" but the /community leaderboard ignores referral_points while /boeken counts them (boeken/page.jsx:51-64 vs community/page.jsx:196-215) — align them. Fire the 0.1 `referral_link_shared` event.

### 5.5 Waitlist on full slots (critic blind spot — demand capture, NEW)
A full slot is a dead grey "vol" cell (BookingClient.jsx:309/347) and the demand evaporates invisibly. Small `slot_waitlist` table (gym_id, user_id, date, hour, created_at, notified_at) + "Zet me op de wachtlijst" on full cells (logged-in only) + a hook in the cancel/reschedule paths: when a slot frees, notify (bell + email; push in Batch 7) the first N waiters with a deep-link `/boeken?d=&h=`. First-come stays fair; owner gets a demand heatmap signal on /beheer/analytics for free.

### 5.6 Owner-material sprint (parallel track — code can't fake any of this)
GBP claim/complete (photos, hours, booking link, phone), publish the phone number (exists only in a script: +32 498 62 74 10 — decision #1), real gym photos into the 4.4 slots, genuine review requests via the 2.2 follow-up email once GBP is live, then (and only then) aggregateRating in the LD. Zero fabrication.

### 5.7 Small growth finishers
Workout share button (pending task #47 — Web Share on /workouts/[slug], pattern in ShareRank.jsx); public /events list + /events/[id] with Event LD (approved events exist auth-gated in /community; the public /events is a ComingSoon *that is in the sitemap* — fix either way); one more programmatic tool page reusing the calorieen-berekenen pattern (e.g. 1RM-calculator linking into oefeningen hubs). Recommend AGAINST a blog — it will rot; the programmatic pattern matches the owner's capacity.

---

## BATCH 6 — Superadmin cockpit (~3-4 days)

### 6.1 Dashboard → action cockpit (data already fetched elsewhere, this is regrouping)
Three bands on beheer/page.jsx: **VANDAAG** (money received today, today's sessions with paid-badge (isSettled) + coach, next-session countdown) · **ACTIE NODIG** (unpaid confirmed bookings count+€total, pending coach_session_requests, unread inbound_emails, failed payments, PT intakes) · **DEZE MAAND** (revenue vs last, new members, at-risk count → link). The owner's morning check currently spans 4 pages.

### 6.2 Automated-email log (task #49 — verified: lib/email.js persists nothing)
Extend `send()` to insert into `sent_emails` (add kind, to_user_id, status, resend_id, error) fire-and-forget; wire the existing `/api/resend/webhook` delivery/bounce events to update status; "Automatisch" tab in /beheer/inbox with kind chips + red failure rows; last-10-mails block on leden/[id]. Owner can finally answer "kreeg je mijn mail?" in 10 seconds.

### 6.3 Unpaid-money queue
"Onbetaald" tab on BookingsList (`!isSettled && bevestigd`) with count + outstanding-€ chip, same count on the dashboard queue + a sidebar badge; expose the fetched-but-hidden payments.status with a "Mislukt" filter on betalingen (page.jsx:33).

### 6.4 At-risk list with one-tap outreach
Analytics' atRisk count (page.jsx:73) links to a campaign builder, not names. Make it link to `/beheer/leden?filter=atrisk` (server-filtered, sorted by lastVisit — MembersTable already computes the tones), add mailto/tel per row + a "stuur win-back" shortcut pre-filling the 2.5 prefab campaign.

### 6.5 System-health strip
Tiny `cron_runs` table; both cron routes already build error arrays — persist one row per run. Card on dashboard/instellingen: access-code cron last ran X min ago (red >15 — this cron lets members INTO the building), activation last run, Nuki enabled + last test, last Stripe webhook received, recent client_errors (0.5). The owner currently learns the door system is down from a locked-out member.

### 6.6 Performance + ergonomics carryovers (all verified)
Server-side pagination for boekingen (limit(1000) serialization at page.jsx:43 → searchParams-driven, default "komende 14 dagen", 50/page); leden's 10×1000 auth.listUsers per render → nightly-cached last-login sweep; monthly-leaderboard RPC (community/page.jsx:44, reusable in analytics); sidebar regroup by owner jobs (VANDAAG/MENSEN/GELD/GROEI/INSTELLINGEN) with unread/pending badges + 0.3 icons; touch support for AdminWeekGrid (tap-first mode below md — drag ops silently fail on touch today, AdminWeekGrid.jsx:97-131); monthly close-out page (revenue by kind + VAT split + coach settlements + unpaid leftovers + CSV — merges the owner's scattered month ritual).

---

## BATCH 7 — Platform: push, offline, and the native-app promise (~3-4 days + owner decision)

### 7.1 Web Push (VAPID) — reconciled effort M; the door code is the first payload
`push_subscriptions` table; subscribe prompt on /account **after first booking** ("Ontvang je deurcode als melding" — not on first visit); `push`/`notificationclick` in sw.js; fan-out in `lib/notify.js` (single write-path, one-file change) so bell notifications also push; wire `sendDueAccessCodes` + day-before reminder + waitlist frees + coach messages. Door code by email 5 minutes before a session is the platform's biggest real-world risk (Gmail sorting/spam/fetch-delay routinely exceed 5 min) — push de-risks Nuki activation.

### 7.2 PWA → TWA staged path (the contract's phase-1 iOS/Android promise — decision #2)
Honest recommendation: a React Native rebuild is a parallel product and not warranted at this scale. Stage 1 = Batch 1.6 + 7.1 (the installed PWA becomes genuinely app-grade: push, offline door fallback, live bell). Stage 2 = Android TWA via Bubblewrap (needs only `.well-known/assetlinks.json` + store listing, ~days). Stage 3 = iOS: installed-PWA (push works since iOS 16.4 for installed PWAs) or a thin Capacitor wrapper with system-browser Stripe if App Store presence is contractually required. Post-install re-login nudge on iOS (Safari cookies don't transfer into the standalone container — PWAInstallPrompt.jsx:36 currently just dismisses).

### 7.3 Housekeeping
Drop `@vercel/analytics` (layout.jsx:65) — it duplicates the first-party pipeline and undermines the "geen externe tracker" claim on /beheer/verkeer:55 (or soften that copy — decision #5). Delete or explicitly flag-park the dormant FittinWelcome card-fingerprint chain (welcome_status defaults 'eligible' since 0069:5, so activateWelcome + handleWelcomeSetup + welcome_claims are dead code — decision #8: current policy is one-free-per-account, fingerprint anti-abuse off). Document the single-gym pragmatism: 5+ paths resolve "the gym" as first-row-by-created_at — add a `lib/gym.js` `getGym()` helper as the one place to swap when gym #2 ever arrives (decision #7).

---

## Sequencing & effort summary

| Batch | Theme | Effort | Depends on |
|---|---|---|---|
| 0 | Foundations: events/UTM, secrets unblock, primitives, contrast, tests/CI, legal/safety | ~2-3d | — |
| 1 | Money-honest member loop (credits, sticky bar, bell, ICS, rebook, door hardening) | ~3-4d | 0 |
| 2 | Lifecycle automation (day-0 → day-30 spine, prefabs, coach first-run) | ~3-4d | 0 (events), 5.6 for review-ask |
| 3 | Coach/PT platform (builder un-stub, client detail, intakes, messaging) | ~4-5d | 0 |
| 4 | /account rebuild + design unification | ~4-5d | 0 (primitives) |
| 5 | Growth & SEO (hubs, schema, referral, waitlist, owner material) | ~3-4d | 0; 5.6 is owner-paced |
| 6 | Superadmin cockpit | ~3-4d | 0 (cron_runs, format.js) |
| 7 | Platform: push, TWA path, housekeeping | ~3-4d | 1.6; decision #2 |

**Recommended order: 0 → 1 → 2 → 5 → 6 → 3 → 4 → 7** (trust + revenue funnel first, then acquisition + owner time, then the coach product, visual overhaul once function is right, platform last — but pull 7.1 push forward if Nuki activation is scheduled). Batches 3, 5 and 6 touch largely disjoint files and can run as parallel lanes. Every batch = own commit series + gates.

**Open decisions for the owner (answer before the relevant batch):**
1. **Owner material** (blocks 4.4/5.6): real gym photos, GBP access, publish phone number yes/no, who asks for the first reviews?
2. **Native-app promise** (7.2): accept the staged PWA→TWA path (recommended), or is a store-listed iOS app contractually required (→ Capacitor wrapper)?
3. **Coach payment-requests** (3.6): ship the feature or delete the dead code? (Recommend ship.)
4. **Membership perk** (1.7): drop "voorrang bij piekuren" copy, or implement members-book-further-ahead for real? (Recommend implement.)
5. **Analytics posture** (0.5/7.3): drop @vercel/analytics to keep the "geen externe tracker" claim clean (recommended), or keep it and soften the claim? External error-tracking SDK, or the first-party client_errors table (recommended)?
6. **Voorwaarden/herroeping** (0.6): draft ready for your + accountant review — needed before we link it at checkout.
7. **Multi-gym**: bless the documented single-gym pragmatism via one `getGym()` helper (recommended), or invest in real tenancy plumbing now?
8. **FittinWelcome anti-abuse**: stay with one-free-per-account (delete the dormant card-fingerprint chain), or re-enable card-on-file activation?

## Do-NOT list (final reminder for the implementer)
No destructive SQL or DB resets — this is a live gym. No touching: Stripe webhook idempotency/race guards, FIFO credit math, 35/32-min hold alignment, deferred booking-invites, the inbox self-loop guard, `send()` error checks. No new hex values outside the tokens, no icon/component/font libraries, no stock imagery, no fabricated reviews/stats, no emoji-as-UI, no confetti, no fake urgency. No new Free-style limits or paywalls on existing member features. Copy stays honest Flemish ("betaal enkel voor je tijd" is the brand). Owner must NOT enter IBAN/door code until 0.2 ships. All migrations additive via `scripts/migrate-mgmt.mjs`. Every batch ends green (`npm run build` + vitest + money-path smoke) before push.
