# FUNCTIONS.md — Functionele specificatie Fittin' platform

Volledige functielijst voor Claude Code. Werk per fase, vink af wat klaar is.
Conventies: zie `CLAUDE.md`. Content & cijfers: zie `docs/CONTENT.md`.
Designreferentie: `app_mock.png`, `dash_mock.png`, `prog_mock.png`, `cal_mock.png`,
`community_mock.png` (root van de repo).

**Stack:** Next.js 15 (App Router) · Tailwind v4 · Supabase (db + auth) · Stripe ·
Resend · Vercel · Nuki-koppeling. **Alles multi-tenant: `gym_id` op elke tabel.**

---

## Status vandaag

- [x] Website-remake (`website/`): home, /degym, /personal-training, /boeken
- [x] Mock-boekingsflow in `/boeken` (deterministische slots in `slotState()`)
- [ ] `npm install` + `npm run build` nog niet geverifieerd — eerst draaien

---

## Fase 1 — Website & MVP

### 1. Accounts & rollen
- Supabase Auth (e-mail + magic link of wachtwoord; later social login)
- Rollen: `lid`, `coach`, `beheerder` — opgeslagen in `profiles.role`
- Profiel: naam, e-mail, telefoon, gym_id
- Registratie = gratis ("lid worden"), geen betaling nodig
- Nieuwe leden krijgen automatisch de welkomstcode-flow (zie 3)

### 2. Boekingssysteem (gym-slots)
- Dienst "Fit60": sessie van 1 uur, hele zaal, 1-4 personen, prijs €15 per boeking
  (géén kost per persoon) — werkelijke prijs op site & DB, bevestigd 2026-06-15
- Slots per uur, openingsvenster instelbaar per gym (default 07:00–21:00)
- Eén boeking per slot (privégym = exclusief); dubbelboeken onmogelijk (db-constraint)
- Daluren (instelbaar, default vóór 16:00): lagere prijs/credits, visueel gelabeld
- Annuleren: kosteloos tot 24u vooraf; daarna credit/bedrag kwijt
- Wachtlijst: bij geannuleerd slot → eerste op wachtlijst krijgt melding (Fase 1.5, mag later)
- Beheerder kan slots blokkeren (onderhoud, events)
- UI: vervang mock in `website/app/boeken/page.jsx` door echte data (server actions of
  route handlers + Supabase)

### 3. Betalingen (Stripe)
- Stripe Checkout/Payment Element; boekingen & PT zijn real-world services → geen
  Apple/Google IAP nodig, ook in de app via Stripe
- Betaalopties (zie pitch-slide "Hoe leden betalen"):
  - Losse boeking: €15 (werkelijk tarief op site & DB)
  - 10-beurtenkaart: €100 → 10 sessiecredits, 6 maanden geldig
  - Abonnement: €10/mnd → 1 sessie inclusief + boeken aan ledentarief (€8) +
    voorrang piekuren + extra dalurenkorting
- Promocode **FittinWelcome**: eerste sessie gratis (eenmalig per account)
- Stripe webhooks → boeking bevestigen / credits bijschrijven / abonnement status
- Terugbetaling bij tijdige annulatie (of credit teruggeven — kies credit als default)

### 4. Lidmaatschap & credits (één muntsysteem)
- `credits_ledger`: elke mutatie als rij (aankoop, abonnement, gebruik, challenge-beloning,
  referral, refund) — saldo = som
- Daluren kosten minder credits; piekuren = voorrang voor abonnees, geen korting
- Beurtenkaart-credits: vervaldatum 6 maanden; abonnementscredit: 1/mnd, rollover max 2
- Géén "lidgeld"-taal in de UI; abonnement heet "member-voordeel"

### 5. Deurtoegang (Nuki)
- Slot is al aanwezig; eenmalige koppeling/setup (€150, afgesproken)
- App toont "Open de deur"-knop enkel bij actieve boeking: van 5 min vóór start tot einde slot
- Server-side call naar Nuki (Web API of Bridge) — nooit client-side keys
- `door_log`: wie, wanneer, welke boeking; zichtbaar voor beheerder
- Failsafe: beheerder kan altijd openen; foutmelding met telefoonnummer bij storing

### 6. E-mail (Resend)
- Templates: bevestiging boeking, annulatie, reminder (24u en 1u vooraf),
  welkom + FittinWelcome-uitleg, betaalbevestiging
- Afzender: info@fittin.be; alle mails in het Nederlands

### 7. Beheer (mini-dashboard)
- Weekkalender van alle boekingen (zie `cal_mock.png`): kleurcodes geboekt/PT/daluur/vol
- Boeking aanmaken/annuleren namens een lid
- Leden lijst + zoeken
- Slots blokkeren

**Mijlpaal Fase 1: nieuwe site live — leden boeken, betalen en gaan zelf binnen.**

---

## Fase 2 — Super app: coaching

### 8. Programmabouwer (coach) — zie `prog_mock.png`
- Oefeningenbibliotheek (naam, spiergroep, optioneel video-URL) — gedeeld per gym
- Programma = dagen → oefeningen → sets/reps/rust/gewichtsuggestie
- Opslaan als template, toewijzen aan lid (kopie, daarna per lid aanpasbaar)
- AI-opzet: prompt → conceptprogramma dat de coach vrij bewerkt (server-side AI-call)

### 9. Workout-logging (lid) — zie `app_mock.png`
- Lid ziet plan van de week; logt per oefening sets × reps × gewicht; afvinken
- Geschiedenis + voortgang per oefening (grafiekje), PR-detectie
- Streaks: aantal weken met ≥X sessies

### 10. Coach-feedback & notities
- Contextuele notitie bij een gelogde sessie (geen losse chat — bewuste keuze)
- Lid krijgt push/mail bij nieuwe notitie

### 11. Adherence-dashboard (coach) — zie `dash_mock.png`
- Per lid: % geplande sessies gedaan, laatste activiteit, status (on track / haakt af)
- Sorteer op risico; coach kan vanuit hier een notitie/mail sturen

### 12. PT-boekingen
- Coach zet beschikbaarheid (dagen/uren — zie coachdata in CONTENT.md)
- Lid boekt PT: 1-op-1 €60 · 1-op-2 €35 pp · 1-op-3 €30 pp; gratis intake/proefsessie
  als eerste afspraaktype; kosteloos annuleren tot 24u
- PT-boeking reserveert ook de zaal (zelfde slot-systeem, type `pt`)

### 13. Push-notificaties
- PWA web-push: nieuw plan, coach-notitie, reminder, wachtlijst-slot vrij
- Later native push (zie Fase native app)

**Mijlpaal Fase 2: coaches plannen en volgen leden volledig in de app.**

---

## Fase 3 — Super app: community & groei

### 14. Referral ("breng een vriend")
- Unieke code/link per lid; bij eerste betaalde boeking van de vriend krijgen beiden 1 credit
- Anti-misbruik: max X per maand, zelfde betaalmiddel/adres detecteren

### 15. Leaderboard — zie `community_mock.png`
- Punten per gelogde sessie/challenge; maandelijkse reset; opt-out mogelijk (privacy)
- Eigen positie altijd zichtbaar

### 16. Challenges
- Beheerder/coach maakt challenge: doel (X sessies, X daluren, streak), periode,
  beloning in credits; voortgangsbalk in de app
- Automatische uitbetaling credits bij behalen

### 17. Events & groepslessen
- Event = slot met capaciteit >4 en eigen prijs; inschrijven + betalen via zelfde flow
- Vooral bedoeld om daluren te vullen

### 18. Heatmap & omzet (beheerder)
- Bezetting per uur/dag (heatmap), omzet per maand, actieve leden, churn-signalen
- Gebruik dit om dalurenprijzen te tunen

**Mijlpaal Fase 3: volledige super app gelanceerd.**

---

## Later / optioneel (niet bouwen zonder akkoord)

- **Superstream Lite** — AI-chatbot op de site voor leadgeneratie (vragen beantwoorden,
  proeftraining boeken, lead naar coach doorspelen). Apart aan te zetten.
- **Native iOS/Android-app** — inbegrepen in scope; lancering kost €100 (Apple) + €25
  (Google). Aanpak: hergebruik backend; React Native/Expo of Capacitor rond de PWA.
- **Multi-gym uitrol** — onboarding nieuwe gym = nieuwe `gyms`-rij + eigen branding;
  credits zijn per gym geldig (geen cross-gym).
- **Voedingsmodule** — coach wijst maaltijdplan toe; externe voedingsdatabank, niet zelf
  bouwen.
- **Apple Health / Google Fit** — sync gewicht/activiteit.

---

## Datamodel (voorstel — alles met `gym_id`)

```
gyms(id, naam, slug, branding, opening_uren, daluur_tot)
profiles(id→auth.users, gym_id, role, naam, telefoon, referral_code)
services(id, gym_id, type[fit60|pt|event], naam, duur_min, prijs_cent, capaciteit)
bookings(id, gym_id, service_id, user_id, coach_id?, start_ts, einde_ts,
         status[bevestigd|geannuleerd|no_show], personen, bron_betaling[los|credit|abo|gratis_code])
  UNIQUE (gym_id, start_ts) WHERE status='bevestigd'   -- exclusieve zaal
credits_ledger(id, gym_id, user_id, delta, reden, ref_id?, vervalt_op?, created_at)
memberships(id, gym_id, user_id, stripe_sub_id, status, sinds)
punch_cards(id, gym_id, user_id, credits_initieel, vervalt_op)
coach_availability(id, gym_id, coach_id, weekdag, van, tot)
exercises(id, gym_id, naam, spiergroep, video_url?)
programs(id, gym_id, coach_id, lid_id?, naam, is_template)
program_days(id, program_id, dag_nr, naam)
program_exercises(id, program_day_id, exercise_id, sets, reps, rust_sec, volgorde)
workout_logs(id, gym_id, user_id, program_exercise_id?, datum, sets_json, pr_flag)
session_notes(id, gym_id, coach_id, user_id, booking_id?, workout_log_id?, tekst)
challenges(id, gym_id, naam, doel_type, doel_aantal, start, einde, beloning_credits)
challenge_progress(challenge_id, user_id, voortgang, behaald_op?)
referrals(id, gym_id, referrer_id, referred_id, status, beloond_op?)
events(= service type event) + event_inschrijvingen(event_id, user_id, betaald)
door_log(id, gym_id, user_id, booking_id, geopend_op, resultaat)
```

## Technische afspraken
- Server-side: Supabase RLS op `gym_id` + rol; geen service-keys in de client
- Geldbedragen in centen (int); tijden in Europe/Brussels; alle UI-teksten Nederlands
- Stripe-webhooks idempotent verwerken; betalingstatus is de bron van waarheid
- Houd `/boeken` UI-patroon aan (stappen: sessie → dag → uur → personen → bevestig)
- Schrijf bij elke feature minstens één happy-path test (Playwright of vitest)
