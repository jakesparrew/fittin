# Fittin' — Workout & Training masterplan (clients + coaches)

*Geschreven 2026-07-08 (Fable 5) op basis van een read-only audit van de live codebase + live DB.
Bouwen = Opus 4.8, batch per batch, elke batch eindigt groen (`npm run build` + vitest + een
geldpad/RLS-smoke) vóór commit. Dit plan bouwt VERDER op de bestaande stack — het herschrijft niets
dat al werkt.*

---

## 0. Guardrails — lees dit eerst

- **Live app.** Echte leden, echte betalingen, echt deurslot. Geen destructieve SQL, geen resets.
  Alle migraties **additief** via `scripts/migrate-mgmt.mjs` (mgmt-token kan verlopen → owner
  vernieuwt `SUPABASE_ACCESS_TOKEN`). Eerst read-only checken, dan `add column if not exists`, dan
  verifiëren dat rijen ongewijzigd zijn.
- **Niet aanraken:** de bestaande logging-actions (`logWorkoutSet`, `toggleWorkoutDone`,
  `saveWorkoutToPlans`), de `copy_template_to_member` RPC, de assign-copy-semantiek (assignen =
  KOPIE, template blijft herbruikbaar), Stripe/credit/deur-paden.
- **Copy in het Nederlands (Vlaams).** Geen AI-slop, geen fake urgentie, subtiel & premium.
- **RLS bij elke nieuwe tabel/kolom.** Member leest/schrijft eigen data; coach enkel eigen +
  accepted-client; secrets service-role. Nieuwe kolommen op `program_exercises` erven de RLS van hun
  parent — geen extra policy nodig, wél controleren.

---

## Huidige staat (geverifieerd — wat je NIET opnieuw moet bouwen)

**Werkt al volledig:**
- **Oefeningenbibliotheek** (`/oefeningen` + `[slug]` + `categorie/[cat]`): 885 oefeningen, rijk
  (instructies, primaire/secundaire spieren, materiaal, moeilijkheid, media). Zoeken, filteren,
  categorie-hubs, alternatieven per detailpagina. Media via één CDN (jsdelivr).
- **Publieke workouts** (`/workouts` + `[slug]`, `WorkoutFollow.jsx`): follow-along met secties
  (warming-up/hoofd/accessoire/finisher), set-logging (reps + gewicht per set), **PR-detectie**,
  rusttimer, "opslaan naar mijn plannen".
- **Eigen plannen** (`/plannen` + `[id]`): lid maakt eigen workouts, kopieert templates, voegt
  dagen/oefeningen toe, activeert. Werkt.
- **Toegewezen training** (`/training`, `WorkoutPlayer.jsx`): lid volgt het coach-schema, logt sets,
  ziet laatste sessie + PR + week-adherentie (aantal actieve dagen in 7d).
- **Coach programmabouwer** (`/coach/programmas` + `[id]`): dagen + oefeningen (sets/reps/rust),
  starter-presets (full body 3d / upper-lower 4d / PPL 3d), toewijzen aan accepted client (kopie +
  melding + activatie), voortgang per oefening (`✓ datum` / `nog niet`).
- **Coach oefeningen aanmaken/bewerken**: de *action* `coachUpsertExercise` schrijft rijke velden;
  `coachQuickExercise` maakt inline een oefening tijdens het bouwen.

**Stub / half af:**
- `/coach/oefeningen` = **ComingSoon-stub** (geen UI om coach-eigen oefeningen te beheren/uploaden).
- **Coach "publiceer als publieke workout"**: de action `setWorkoutPublic` bestaat, maar er is **geen
  paneel** in de coachbouwer (enkel de owner heeft `PublishWorkoutPanel`).
- **Progressie-visualisatie**: schema is er (`workout_logs.sets_json`, `is_pr`, `body_metrics`), maar
  er zijn **geen grafieken/dashboards** — enkel "X actieve dagen (7d)" en laatste sessie.

**Data-audit (885 oefeningen — algemeen gezond, kleine schoonmaak):**
- 0 dubbele namen, 0 zonder slug ✓ · media 864/885 op jsdelivr (consistent) ✓
- **21** oefeningen zónder enige media (tonen placeholder) · **6** zonder instructies · **78** zonder
  materiaal-veld · **1** zonder categorie · **1** zonder primaire spier · **1** zonder moeilijkheid.
- `program_exercises` mist rijke velden: **geen coach-notitie, geen streefgewicht, geen tempo, geen
  supersets, geen RPE/RIR** — alleen sets/reps/rust.

---

## De echte gaten (waar dit plan op mikt)

| Vraag van de owner | Status vandaag | Gat |
|---|---|---|
| Leden maken eigen workouts | ✅ ~80% (`/plannen`) | geen wizard/begeleiding; geen swap-tijdens-workout |
| Progress tracken | 🟡 ~10% (data ✓, UI ✗) | **geen grafieken** (gewicht/volume/PR/adherentie/lichaamsgewicht) |
| Oefeningen insteken/loggen | ✅ ~80% | geen "herhaal vorige sessie", geen RPE, geen offline |
| Coaches workouts doorgeven | ✅ 100% | — (werkt: kopie→melding→/training) |
| Coaches rijke workouts bouwen | 🟡 | geen notities/tempo/supersets/streefgewicht per oefening |
| Coaches progressie opvolgen | 🟡 basis | geen trends/grafieken; geen feedback op een gelogde sessie |

---

## BATCH W0 — Datahygiëne & waarheids-fixes (~0.5-1 dag)

Kleine, hoog-vertrouwen opkuis zodat de bibliotheek 100% klopt.
- **Fix de 1 oefening zonder categorie** (zet correcte categorie), **1** zonder primaire spier, **1**
  zonder moeilijkheid — via een additieve data-migratie of het admin-formulier.
- **21 oefeningen zonder media**: markeer ze in `/beheer/oefeningen` met een "⚠ geen media"-badge en
  een filter, zodat de owner/coach ze gericht kan aanvullen. (Niet automatisch scrapen — media komt
  van de owner.) De placeholder-render bestaat al, dus niets breekt.
- **6 zonder instructies / 78 zonder materiaal**: idem — filter "onvolledig" in de admin-lijst.
- **Un-stub `/coach/oefeningen`** (W5 doet de volledige versie; hier minimaal: lijst coach-eigen
  oefeningen + link naar bewerken) — of expliciet "binnenkort" met redirect naar `/oefeningen`.
- Bevestig via een read-only query dat geen enkele oefening een dubbele slug per gym heeft (uniek-check).

*Migratie: klein/optioneel (data-fix). Geen risico.*

---

## BATCH W1 — Progressie-visualisatie (grootste lid-gat, hoogste ROI) (~3-4 dagen)

Alles zit al in `workout_logs` + `body_metrics`; dit is puur UI + aggregatie. Geen nieuwe schrijf-paden.

- **Voortgang-tab op `/training` en/of `/account`** met, per lid:
  - **Gewicht per oefening** (lijn­grafiek): kies een oefening → max/gemiddeld gewicht over tijd.
  - **Volume over tijd** (sets × reps × gewicht per week) — de #1 motivator.
  - **PR-geschiedenis**: lijst/tijdlijn van alle `is_pr=true` logs ("🔥 Bankdrukken 80kg · 3 juli").
  - **Adherentie-heatmap + streak**: kalender-heatmap van gelogde dagen + huidige/langste reeks.
  - **Lichaamsgewicht-tijdlijn**: `body_metrics` heeft de data, er is nog geen grafiek → toevoegen
    (hergebruik `WeightChart` als die bestaat, anders een lichte SVG-lijn).
- **Reken server-side** (een `progress_summary`-RPC of geaggregeerde query) — houd de client licht.
- **Geen externe chart-lib** (conventie "geen extra dependencies"): lichte inline SVG-grafieken
  (zoals de bestaande sparkline-stijl), motion-safe.

*Migratie: enkel een read-only aggregatie-RPC (SECURITY DEFINER, `p_user` = auth.uid() of staff).
Owner-beslissing: tonen we dit ook aan de coach op de clientpagina? (Ja — zie W3.)*

---

## BATCH W2 — Rijkere voorschriften (coach-kernwerk) (~3-4 dagen)

Geef de coach de velden die een PT écht nodig heeft. Additieve kolommen op `program_exercises`.

- **Migratie** (`program_exercises`, allemaal nullable): `coach_note text`, `target_weight_kg numeric`,
  `tempo text` (bv. "3-1-2"), `rpe int` (of `rir int`), `superset_group smallint`, `superset_order smallint`.
- **Bouwer-UI** (`/coach/programmas/[id]` + de owner-versie): per oefening een uitklap "meer" met
  notitie, streefgewicht, tempo, RPE, en een "koppel als superset (A1/A2)"-toggle.
- **Speler-UI** (`WorkoutPlayer` + `WorkoutFollow`): toon de coach-notitie prominent, het streefgewicht
  als hint in het log-veld ("streef: 80kg"), tempo-badge, en groepeer supersets visueel (A1→A2).
- **Progressie-schema (optioneel, licht)**: een "auto-suggestie" — als vorige sessie ≥ doel gehaald,
  stel +2,5kg voor. Puur een hint in de speler, niets automatisch.

*Migratie: additief, erft RLS van `program_days`/`programs`. Geen breuk: bestaande programma's hebben
gewoon `null` in de nieuwe velden en renderen zoals nu.*

---

## BATCH W3 — Coach ↔ client feedback-lus (~3-4 dagen)

De coach ziet nu enkel "gedaan/niet gedaan". Maak er een echte opvolging van.

- **Client-progressie voor de coach** op `/coach/clienten/[id]`: dezelfde grafieken als W1 (gewicht per
  oefening, volume, PR's, adherentie) — via de service-role-lezing die daar al bestaat, met de
  accepted-link-check als autorisatie.
- **Geschatte 1RM per hoofdoefening** (Epley: `gewicht × (1 + reps/30)`) — één cijfer dat vooruitgang
  samenvat.
- **Feedback op een gelogde sessie**: nieuwe tabel `workout_feedback` (`workout_log_id` of
  `(user_id, program_exercise_id, logged_on)`, `coach_id`, `body`, `created_at`; coach-only RLS).
  Coach tikt "top PR! 💪" of "let op je vorm bij de laatste set"; het lid ziet dit in `/training` bij
  de betreffende oefening + krijgt een bel-melding (hergebruik `notify`).
- **Sessie-RPE (optioneel)**: laat het lid na een sessie een 1-10 "hoe zwaar voelde het" geven →
  waardevolle context voor de coach, één tik.

*Migratie: `workout_feedback` tabel + RLS (coach schrijft, lid + coach lezen). Additief.*

---

## BATCH W4 — Lid self-serve: wizard + swap + herhaal (~3-4 dagen)

Maak "eigen workout maken" laagdrempelig en het loggen sneller.

- **Workout-wizard** op `/plannen`: "Kies spiergroepen + dagen per week → wij stellen een startschema
  voor" (put uit de bibliotheek per categorie/difficulty). Eindigt in een bewerkbaar plan — geen
  black box. (De AI-plangenerator uit een eerdere fase kan hier hergebruikt worden als die bestaat;
  anders een regel-gebaseerde suggestie.)
- **Oefening wisselen tijdens de workout**: "vervang" naast een oefening → toont de al-berekende
  alternatieven (zelfde categorie/spier) → swap in het actieve plan of enkel voor vandaag.
- **"Herhaal vorige sessie"**: één knop die de sets/reps/gewicht van de laatste log voor-invult →
  loggen in seconden i.p.v. tikken.
- **Rustdag / deload-markering** op een dag ("Rust" of "Deload -10%") — puur label + speler-copy.

*Migratie: geen (of een klein `program_days.kind`-veld voor rust/deload). Grotendeels UI.*

---

## BATCH W5 — Coach-oefeningenbibliotheek + publiceren (~2-3 dagen)

Un-stub de laatste coach-stukken.

- **`/coach/oefeningen` volledig**: lijst coach-eigen oefeningen (`coach_id = userId`) + gym-brede
  (read-only), formulier om te maken/bewerken met **media-upload** (hergebruik de admin-oefening-UI +
  de foto-upload/compressie die de coach al voor zijn profielfoto heeft). Verwijderen met bevestiging
  (`ConfirmSubmit` bestaat al).
- **Publiceer-paneel in de coachbouwer**: render `PublishWorkoutPanel` (of een coach-variant) in
  `/coach/programmas/[id]` voor templates (niet toegewezen) → de coach kan zijn schema publiek maken op
  `/workouts` (de `setWorkoutPublic`-action + RLS bestaan al). Owner-beslissing: mag elke coach
  publiceren, of enkel na owner-review? (Aanbevolen: coach mag, owner kan verbergen.)

*Migratie: geen. Enkel UI op bestaande actions.*

---

## BATCH W6 — Engagement, deelbaarheid & offline (~3-4 dagen, optioneel/later)

- **PR-/adherentie-leaderboard**: de challenge-infra bestaat; toon een maandelijkse PR-/volume-ranking
  in `/community` (respecteer `leaderboard_opt_in`).
- **Voltooide workout delen** in de community-feed ("Jelle rondde 'Push A' af — nieuw PR 🔥") — hergebruik
  de bestaande `posts`/kudos.
- **Offline loggen (PWA)**: service-worker sync-queue zodat een set die je in de kelder logt lokaal
  bewaard wordt en synct zodra er netwerk is. (Grotere, aparte klus — laatst.)
- **Auto-progressie** (opt-in): na 3× doel gehaald, verhoog het streefgewicht automatisch in het schema.

---

## Volgorde & effort

| Batch | Thema | Effort | Migratie? |
|---|---|---|---|
| W0 | Datahygiëne + un-stub minimaal | ~0.5-1d | data-fix (klein) |
| W1 | **Progressie-visualisatie (lid)** | ~3-4d | read-only RPC |
| W2 | Rijke voorschriften (coach) | ~3-4d | additieve kolommen |
| W3 | Coach↔client feedback-lus | ~3-4d | `workout_feedback` tabel |
| W4 | Lid-wizard + swap + herhaal | ~3-4d | geen/klein |
| W5 | Coach-oefeningen-UI + publiceren | ~2-3d | geen |
| W6 | Engagement + offline | ~3-4d | geen/klein |

**Aanbevolen volgorde: W0 → W1 → W2 → W3 → W5 → W4 → W6.**
(Eerst de waarheid opkuisen, dan het grootste lid-gat (progressie tonen — motiveert retentie), dan de
coach z'n kernwerk verrijken en de feedback-lus sluiten, dan de laatste coach-UI, dan self-serve gemak,
engagement/offline als laatste.) W1 en W2/W3 raken grotendeels aparte bestanden → kunnen als parallelle
sporen als je met meerdere sessies werkt.

---

## Open owner-beslissingen (beantwoord vóór de betrokken batch)

1. **Progressie zichtbaar voor coach** op de clientpagina (W1/W3)? → Aanbevolen ja (met accepted-link-check).
2. **RPE of RIR** als intensiteitsmaat (W2/W3)? RPE (1-10) is voor leden intuïtiever; RIR is preciezer.
3. **Coach-publiceren**: vrij, of pas na owner-review (W5)? → Aanbevolen vrij + owner kan verbergen.
4. **Auto-progressie** (W6): willen we het, en opt-in of uit? → Aanbevolen opt-in, uit standaard.
5. **AI-wizard** (W4): bestaat er nog een bruikbare plangenerator om te hergebruiken, of regel-gebaseerd starten?
6. **21 media-loze + 78 materiaal-loze oefeningen** (W0): vult de owner die aan, of laten we ze met een
   nette placeholder/badge staan? (Geen scraping.)

---

## Do-NOT (herinnering)
Geen herschrijf van de werkende logging/PR/copy-template-paden. Geen externe chart-/component-libs (lichte
inline SVG). Geen destructieve migraties. Geen automatische media-scraping. Elke batch groen (build +
vitest + smoke) vóór push, één commit-serie per batch.
