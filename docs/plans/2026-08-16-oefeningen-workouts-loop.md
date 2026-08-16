# Oefeningen → Workouts: van encyclopedie naar lus

*Geschreven 2026-08-16 op vraag van de owner: "Bij oefeningen kan je zelf workouts samenstellen
en oefeningen saven of favorieten. Denk hoe je dit hele deel kan verbeteren in combinatie met de
rest van de app. Workouts delen kan ook interessant zijn, of samen oefeningen doen en daar je
reps ingeven."*

## Diagnose — wat er vandaag staat

| Stuk | Staat | Probleem |
|---|---|---|
| `/oefeningen` | Rijke bibliotheek: categorieën, spieren, stappen, media | **Doodlopend.** Op een oefeningpagina kan je níéts doen: geen bewaren, geen "in mijn schema", geen "doe nu". Alleen doorklikken naar een andere oefening. |
| `/plannen` | Volwaardige schema-bouwer + AI-generator + templates | Eiland. Je bouwt er schema's, maar vanuit de bibliotheek (waar je oefeningen ontdekt) kom je er nooit. |
| `/workouts` | Gecureerde workouts + follow-along-speler met set-logging | Tweede eiland. Een publieke workout kan je volgen maar niet **overnemen als eigen schema** en aanpassen. |
| `/training` | Voortgang: volume, PR's, streak uit `workout_logs` | Werkt, maar wordt enkel gevoed door de speler — losse oefeningen loggen kan niet. |
| Community | Buddies, feed (`shareWorkoutDone`, kudos), challenges, leaderboard-deelkaart (`/api/share/rank`) | Deel-momenten bestaan, maar het waardevolste deelbare object — *je eigen schema* — is niet deelbaar. |
| Favorieten | **Bestaat nergens.** | |

De verbetering is niet "meer features" maar **één lus sluiten**:
**ontdek** (oefeningen) → **bewaar** (favorieten) → **bouw** (plan) → **doe** (speler) →
**log** (voortgang) → **deel** (feed/link) → terug naar ontdek.

Owner-credo's die dit plan bewaken: elke pagina een handeling, geen nieuwe permanente UI-ruis
(contextuele knoppen, leeg = onzichtbaar), data alleen in functie van groei.

---

## Fase 1 — De bibliotheek een handeling geven *(klein werk, direct voelbaar)*

**1a. Favorieten.** Nieuwe tabel `exercise_favorites (user_id, exercise_id, created_at, unique)`.
- Hartje op elke oefeningkaart + detailpagina (alleen ingelogd; anoniem → login-nudge).
- Filter "❤ Mijn favorieten" bovenaan de bibliotheek — enkel zichtbaar als je er hebt.
- Favorieten komen **bovenaan** in de zoekresultaten van de plan-bouwer (`searchExercises`)
  en de AI-generator gebruikt ze als voorkeursinput ("bouw rond wat hij al leuk vindt").

**1b. Actieknoppen op de oefening-detailpagina.**
- **"＋ In mijn schema"** — kiezer: bestaand plan + dag, of "nieuw schema". Hergebruikt
  `addExerciseToDay`; wie nog geen plan heeft krijgt er automatisch één ("Mijn workout").
- **"▶ Doe nu & log"** — de set-logger uit de speler (reps × kg, al gebouwd en net mobiel-gefixt)
  rechtstreeks op de oefeningpagina; schrijft naar `workout_logs` zodat `/training` het meetelt.
  Daarmee kan een lid dat géén schema wil tóch loggen — vandaag is loggen exclusief voor
  speler-gebruikers.
- **"Komt voor in"** — lijstje workouts/templates die deze oefening bevatten → ontdekking richting
  fase 2.

## Fase 2 — Eén workoutbegrip *(de twee eilanden verbinden)*

- **"Bewaar als mijn schema"** op elke publieke workout: kopieert de workout naar een eigen,
  bewerkbaar plan (zelfde beweging als `copyTemplate`, andere bron). De gecureerde content wordt
  zo startpunt in plaats van eindpunt.
- Omgekeerd bestaat al half: coach/beheer publiceert via `PublishWorkoutPanel`. Toevoegen:
  vanuit een eigen plan "voorstellen aan de gym" (beheerder keurt goed) — leden voeden de
  bibliotheek.

## Fase 3 — Delen *(groei; herbruikt bestaande patronen)*

- **Deelbare schema-link**: `programs.share_token` + publieke pagina `/w/{token}` (login-vrij,
  read-only) met CTA *"Train dit schema bij Fittin' — maak een account en neem het over"*.
  Een lid dat zijn schema op WhatsApp/Instagram zet is het goedkoopste acquisitiekanaal dat
  er bestaat; de overnemer is meteen een warme lead met een reden om te registreren.
  Zelfde veiligheidslijn als de HR-link bij SuperShift: token intrekbaar, geen persoonsdata
  van de deler op de pagina behalve voornaam.
- **Workout-klaar-deelkaart**: og-image in de stijl van `/api/share/rank` (bestaat al voor het
  leaderboard) maar voor een afgewerkte sessie: volume, aantal PR's, streak. Aangeboden op het
  "klaar!"-moment in de speler, samen met de bestaande feed-post (`shareWorkoutDone`).
- Feed-post na afloop automatisch vóórinvullen in plaats van leeg veld.

## Fase 4 — Samen trainen *(retentie; grootste bouwwerk, bewust laatst)*

Samen boeken bestaat al (buddies + boekingsuitnodigingen). Wat ontbreekt is **samen doen**:

- **MVP "Duo-zicht"**: wie met een geaccepteerde buddy op dezelfde dag dezelfde workout doet,
  ziet in de speler een strookje "Jelle: set 2 van 3 ✓" — gewoon polling op `workout_logs`
  van je buddies (opt-in, zelfde privacy-lijn als het leaderboard-opt-in-veld dat al bestaat).
  Geen websockets, geen gedeelde sessie: ieder logt op zijn eigen telefoon, precies zoals nu.
- Daarna pas: duo-challenges ("samen 20 sessies deze maand") op de bestaande challenge-machinerie.

**Bewust niet doen:** twee accounts laten loggen op één toestel. Auth is per apparaat; elke
omweg daaromheen (pincode-switch, gast-rijen) maakt de logdata onbetrouwbaar — en de voortgang
op `/training` is het product. Reps van je buddy op jouw scherm zien is het sociale effect,
zonder de datakwaliteit te slopen.

## Fase 5 — Coach in de lus *(klein)*

Coach ziet de favorieten van zijn client in de programma-bouwer ("bouw rond wat hij graag doet")
en krijgt een seintje wanneer een client drie keer dezelfde losse oefening logde zonder schema —
dat is een warme kandidaat voor een voorschrift of PT-gesprek.

---

## Volgorde en waarom

1. **F1** — kleinste werk, grootste dagelijkse zichtbaarheid; maakt van elke oefeningpagina een
   handeling (zelfde filosofie als de inzicht-acties op het beheer).
2. **F3** — groeikanaal met bijna alles herbruikbaar (og-patroon, feed, tokens à la HR-link).
3. **F2** — verbindt de eilanden; maakt de gecureerde content het startpunt van eigen schema's.
4. **F4** — retentie; MVP is klein maar het effect hangt af van kritische massa buddies.
5. **F5** — kers op de taart, pas zinnig zodra F1-data (favorieten, losse logs) bestaat.

**Datamodel-toevoegingen totaal:** `exercise_favorites`, `programs.share_token` (+ `is_public`),
verder niets — alles anders bestaat al.

**Migraties**: via `scripts/migrate-mgmt.mjs` (verse `SUPABASE_ACCESS_TOKEN` nodig als de huidige
verlopen is). **Bouwvolgorde binnen elke fase**: migratie → lib (puur, getest) → actions → UI,
zoals bij de inzicht-acties.
