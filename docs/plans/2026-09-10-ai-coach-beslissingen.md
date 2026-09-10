# De keuzes, vóór er code verandert

Antwoord op `2026-09-10-ai-coach-onboarding-engagement.md`. Eén zin per keuze, met de reden.
Wat gemeten is staat bovenaan, want twee metingen kantelen twee werkvelden.

---

## Wat de databank zei (10-09-2026, productie)

| | |
|---|---|
| Leden | 86 |
| Boekingen laatste 30 dagen | 159, over 42 leden (gem. 3,8) |
| Rijen in `door_log` laatste 30 dagen | **20** |
| Workout-logs ooit | 7 |
| Coachingplannen | 1 (het testplan van de eigenaar) |
| Afgevinkte sessies | 0 |
| Check-ins | 0 |

**De belangrijkste meting is 20 tegen 159.** `door_log` krijgt alleen een rij van de in-app
openknop. Wie zijn persoonlijke keypadcode uit de deurcodemail intypt — de normale weg — laat
geen enkel spoor na. `app/beheer/leden/page.jsx` waarschuwde daar al voor in een commentaar.

---

## Werkveld 2 — afvinken zonder inspanning

> *Kan het afvinken hangen aan iets dat het systeem al wéét (`door_events`)?*

**Nee, en dat is gemeten, niet vermoed.** 13% van de boekingen laat een deurspoor na. Aanwezigheid
afleiden zou 87% van de sessies als "niet gedaan" markeren. Dat is erger dan niets vragen.

> *Kan het afvinken in de deurcodemail, via een token-link, zonder inloggen?*

**Ja. Dat wordt de kern van deze ronde.** De deurcodemail is het enige kanaal met 100% dekking en
tegen 100% opening: zonder die code raak je de zaal niet binnen. Hij draagt al de oefeningen van de
sessie én al een `report_token`.

Concreet: drie links onderaan het workoutblok — *Te licht · Goed · Te zwaar* → `/s/{token}?v=…`.
Eén tik zet `gedaan_at` en `oordeel`. Geen login, geen scherm ertussen.

Drie grenzen bij die sleutel-in-een-mail:
- **Venster.** Pas geldig vanaf de start van de sessie, tot 96 uur na afloop — hetzelfde venster als
  `/f/{token}`. Daarna dood.
- **Alleen het lid.** De links zitten *in* het workoutblok, en de coach krijgt in zijn kopie van
  dezelfde mail geen workout. De bestaande test die bewaakt dat maar één van de twee
  `sendAccessCode`-aanroepen een workout meegeeft, bewaakt hiermee ook de afvinklinks.
- **Wat een gestolen link kan.** Een sessie afvinken van iemand anders. Geen gegevens lezen, geen
  geld, geen deur. Dat is de goedkoopste sleutel in dit systeem, en dat is het waard.

> *Als het antwoord op beide nee is: wat maakt het vinkje op `/coaching` de moeite waard?*

Niet van toepassing, maar de eerlijke helft van dat antwoord blijft staan: **het vinkje deed
zichtbaar niets.** Je tikt "te licht" en de week erna ziet er identiek uit, want de AI-plannen
hebben geen streefgewichten (zie onder) en de rep-verhoging staat nergens vermeld. Daarom komt er
naast de nieuwe weg ook een zichtbaar gevolg: `3×10 → 3×11`, met de reden erbij.

---

## Werkveld 1 — de aankomst

- **Er hoort geen extra scherm tussen wizard en dashboard.** Een gebouwd tussenscherm dat één keer
  gezien wordt is duur onderhoud. Het dashboard zelf wordt het aankomstmoment: zolang er nog niets
  geboekt is, is boeken het enige dat groot op dat scherm staat.
- **Week 1 krijgt een geschreven coachzin, zonder model.** Nu is week 1 de enige week zonder stem —
  `weekanalyse` begint pas bij week 2. De zin legt uit waaróm week 1 behapbaar is (de coach weet nog
  niet wat voor jou zwaar is) en dat het afvinken dat bepaalt. Nul tokens, altijd dezelfde kwaliteit.
- **De samenvatting van het model spreekt het lid aan.** De prompt vroeg om "wat dit plan doet",
  en kreeg een productbeschrijving. Hij vraagt nu om een aanspreking met het antwoord van het lid
  erin, en verbiedt het woord "plan" als onderwerp van de eerste zin.

## Werkveld 1 — datums

**Het scherm krijgt tijd.** Nu staat er "Week 1 van 8 · 0 van 3 gedaan" en geen enkele datum.
Er komt bij: wanneer deze week afloopt, en — belangrijker — de **echte boekingen** van dit lid,
gekoppeld aan de sessies. Drie sessies en één geboekt moment wordt dan zichtbaar als een tekort in
plaats van als een lijstje.

## Werkveld 3 — de vragen erna

Nagekeken wie elk antwoord leest:

| Vraag | Stuurt iets? |
|---|---|
| `zwaarte` | ja — terugval-oordeel per sessie, en drie weken "te zwaar" = doorverwijzen |
| `pijn` + `pijn_waar` | ja — oefening vervangen, drie weken = doorverwijzen |
| `menu_gevolgd`, `honger` | ja — `moetVernieuwen` |
| `verloop` | **nee** — alleen bewaard |
| `energie` | **nee** — alleen bewaard |
| `vrij` | half — gaat naar het model voor de weekzin |

De brief zegt: gooi weg wat niets stuurt. **Ik gooi ze niet weg, ik laat ze sturen** — want ze
leggen een echt gat bloot. Vandaag is de enige manier om een lichtere week te krijgen: níét komen
opdagen. Wie alles afwerkt en zegt dat hij op is, wordt de week erna zwaarder belast. Dat is de
omgekeerde wereld voor een coach.

Nieuwe regel, klein gehouden: **`energie = laag` of `verloop = moeilijk` schrapt het duwtje.**
"Te licht" telt die week als "goed", en de reeks-teller gaat terug naar nul. Geen volumekorting,
dus geen neerwaartse spiraal — de week blijft staan waar hij staat tot het lid weer bijkomt.

Het vrije tekstveld blijft, ongewijzigd. Het is het enige plek waar iemand iets kan zeggen dat we
niet voorzien hebben, en het kost een lid niets om het leeg te laten.

## Werkveld 4 — de coach als aanwezigheid

**Er komt geen tweede meldingenstroom.** De coach krijgt precies één nieuw kanaal, en dat is een
kanaal dat al bestond: de deurcodemail. Buiten zondag en die mail zwijgt hij.

`/training` en `/coaching` blijven allebei bestaan; de coachingweken zijn gewone `programs` en
horen dus in het weekprogramma. Dat is geen dubbel scherm maar hetzelfde schema vanuit twee kanten.

---

## De bekende gaten

| Gat | Beslissing |
|---|---|
| `reeksGoed` staat hard op 0 | **Gerepareerd.** De historiek per `exercise_id` over de weken van het plan is één query. |
| `start_reps` = reps van déze week | **Gerepareerd.** Het voorschrift van week 1 is het startpunt, dus het repplafond schuift niet meer mee. |
| Cron 60s tegen model 90s | **Gerepareerd.** `maxDuration` naar 300 (Vercel Pro) plus een tijdsbudget dat de lus netjes afbreekt en meldt wie er niet aan de beurt kwam. |
| `coaching_mealweeks` uniek zonder `plan_id` | **Gerepareerd** in migratie 0159. |
| `target_weight_kg` altijd null | **Blijft zo, en wordt eerlijk opgeschreven.** Een gewicht kan alleen uit het lid komen, en dat is precies de invoer waarvan de zaal bewijst dat niemand ze doet. De AI-plannen laten de herhalingen het werk doen; `volgendGewicht()` blijft staan voor schema's die een coach met de bouwer maakt — daar staan wél gewichten in. |

---

## Waarop dit beoordeeld wordt

Eén vraag: *is de kans groter dat wie maandag begint, in week vier nog afvinkt?*

De weddenschap van deze ronde is dat het afvinken moest verhuizen van een pagina waar niemand komt
naar een mail die iedereen opent, en dat het gevolg van dat vinkje zichtbaar moest worden.
