# Opdracht: de AI-coach van gevoel naar gewoonte

Dit is een uitvoerbare brief, geen wensenlijst. Lees eerst alles, beslis dan, bouw daarna.

---

## Wat er nu staat

De AI-coach is **live sinds 10-09** (`0ca0ce8`) maar afgeschermd: `lib/coaching/toegang.js` laat
alleen `ran.knockaert@gmail.com`, `gaetanjansseune@gmail.com` en beheerders door. De poort staat op
vijf ingangen. Je kan dus vrij experimenteren zonder dat 86 leden het zien.

De volledige flow vandaag:

1. `/account` → groen kaartje "Start je AI Coaching" → `/coaching`
2. `IntakeWizard`, zeven stappen: doel → modules (+ voedingsvoorkeuren) → ervaring → dagen per week
   → planlengte → toon → toestemming voor lichaamsgegevens (geboortedatum, geslacht, gewicht,
   lengte, beperkingen)
3. "Maak mijn plan" → één aanroep van Sonnet bedenkt de structuur, `keuze.js` vult er echte
   oefeningen in uit de 886 rijen in de databank. Week 1 gaat open.
4. Je landt op `/coaching`: weekbalk, samenvatting, "Deze week — 0 van 3 gedaan", sessie 1
   uitgeklapt met vijf oefeningen, en daaronder "Klaar? Hoe voelde het?" met drie knoppen.
5. Je boekt via `/boeken`. Vijf minuten voor aanvang komt de deurcodemail — mét de oefeningen van
   die sessie erin (`workoutVoorBoeking` claimt lui de volgende sessie aan die boeking).
6. Je vinkt af op `/coaching`: te licht / goed / te zwaar.
7. Alles af, of de week staat zes dagen open → de check-in verschijnt (vier tikken, zes als de
   maaltijdmodule aanstaat).
8. Zondag 17:00 UTC draait `/api/cron/coaching`: eerst de check-in vragen, pas ná antwoord de
   volgende week openen, met een weekanalyse, eventueel een weekmenu en één mijlpaal.

Relevante bestanden: `app/(site)/coaching/` (page + actions), `components/coaching/` (IntakeWizard,
WeekPaneel, MaaltijdPaneel, PlanBeheer), `lib/coaching/` (plan, progressie, keuze, prompt, model,
budget, maaltijd, mijlpalen, levering, toegang), `app/api/cron/coaching/route.js`,
`lib/reminders.js` + `lib/email.js` voor de levering. Migraties 0157 en 0158.

---

## Het getal dat elke beslissing hier stuurt

**Zeven.** Zeven workout-logs ooit, over 86 leden. Nul lichaamsmetingen, nul coach-feedback. De
volledige trainingslaag die vóór dit systeem gebouwd werd (W0-W6) wordt niet gebruikt. Daartegenover
staan 35 actieve leden en 122 solo-sessies per maand: mensen kómen wel, ze noteren niets.

Daaruit volgt de harde regel van dit project: **bouw nooit iets dat vraagt om sets in te voeren.**

En daaruit volgt het echte risico van de AI-coach. De hele opvolging hangt aan één handeling — het
afvinken. Gebeurt dat niet, dan:
- schuift er niets in de progressie,
- komt er geen check-in,
- en pauzeert het plan na twee stille weken automatisch (dat is bewust zo gebouwd).

Een coach die stilvalt omdat niemand een vinkje zet, is geen coach. Dít is het probleem dat je
oplost. Alles hieronder is daaraan ondergeschikt.

---

## Wat er mis is met het scherm waar je in landt

Kijk zelf op `/coaching` met een lopend plan. Concreet:

1. **Er staat geen tijd in.** "Week 1 van 8", "0 van 3 gedaan" — maar geen enkele datum. Wanneer
   eindigt deze week? Wanneer train ik? Een week met drie sessies zonder dagen is een lijstje, geen
   plan.
2. **De eerste stap die het lid moet zetten, staat onderaan als tekstlink.** Zonder boeking gebeurt
   er niets: geen zaal, geen deurcode, geen workout in de mail. "Boek je sessie" hoort de duidelijkste
   handeling op dit scherm te zijn, niet een zin onder een streep.
3. **"Klaar? Hoe voelde het?" staat er vóór je getraind hebt.** De vraag is er altijd, dus betekent
   ze niets.
4. **De coach heeft geen stem in week 1.** `weekanalyse` wordt pas vanaf week 2 geschreven. Het enige
   wat er staat is een samenvatting die leest als een productbeschrijving ("Dit plan bouwt rustig aan
   pure kracht op…"), niet als iemand die iets tegen jóú zegt.
5. **Sessies zijn nummers.** "Sessie 1, 2, 3" zonder relatie tot je agenda, tot elkaar of tot wat je
   vorige week deed.
6. **Modules die je aanzette zijn onzichtbaar** tot er toevallig iets bestaat. Wie Meal plan
   aanvinkte in de intake, ziet daar op dit scherm niets van tot hij zelf een knop vindt.
7. **Na de intake is er geen moment.** Je vult zeven schermen in, er wordt tien seconden gerekend, en
   dan sta je in een dashboard. Er is geen "kijk, dit heb ik voor je gemaakt, en dit is waarom".

---

## Wat je moet opleveren

Vier werkvelden. Bij elk staan de vragen die je moet beantwoorden — met een keuze, niet met een
opsomming van mogelijkheden.

### 1. De aankomst (na "Maak mijn plan")

Nu: wizard → dashboard. Onderzoek of daar een moment tussen hoort waarin de coach het plan uitlegt
en één ding vraagt: boek je eerste sessie.

- Wat is het minimum dat iemand na de intake moet zien om te begrijpen wat er nu gaat gebeuren?
- Hoort de eerste boeking onderdeel van de onboarding te zijn in plaats van iets wat daarna komt?
- Er is al een tekst van het model (`samenvatting`). Is die goed genoeg, of moet de prompt in
  `prompt.js` gevraagd worden om iets persoonlijkers — en waaraan meet je dat?

### 2. Afvinken zonder inspanning — het scharnier

Dit is het belangrijkste stuk. Zoek de plek waar het lid tóch al is.

- De **deurcodemail** wordt door iedereen geopend, want zonder die code raak je de zaal niet binnen.
  Hij bevat al de oefeningen van die sessie. Kan het afvinken dáár gebeuren — één klik in de mail,
  via een token-link, zonder inloggen? Het patroon bestaat al: `/w/{token}` uit
  `docs/plans/2026-08-16-oefeningen-workouts-loop.md`. Weeg dat af tegen de veiligheid: een token in
  een mail is een sleutel.
- Kan het afvinken hangen aan iets dat het systeem al wéét — dat er een deur geopend is op het uur
  van je sessie (`door_events`)? Wat is dan nog de rol van "te licht / goed / te zwaar"?
- Als het antwoord op beide nee is: wat maakt het vinkje op `/coaching` dan de moeite waard? Geef
  een eerlijk antwoord, geen hoopvol antwoord.

### 3. De vragen erna

De check-in is nu vier tikken (zes met maaltijden) en verschijnt zodra de week rijp is.

- Zijn dit de juiste vragen? Welke van de vier stuurt écht iets in `progressie.js`, en welke wordt
  alleen bewaard? Gooi weg wat niets stuurt.
- Moet de check-in één moment zijn, of hoort een deel ervan bij de sessie zelf?
- Wat gebeurt er met het vrije tekstveld? Nu gaat het naar het model voor de weekzin. Is dat genoeg
  om het te blijven vragen?

### 4. De coach als aanwezigheid, niet als pagina

- Wanneer laat de coach iets van zich horen buiten zondag? En hoe voorkom je dat dit een tweede
  meldingenstroom wordt — de app heeft al notificaties, mails en een deurcodemail.
- Wat is de plek van de AI-coach ten opzichte van de acht échte coaches? De doorverwijzing bestaat
  (`doorverwezen_at`, zichtbaar op `/beheer/coaching` als lead). Is er meer nodig?
- `/training` toont het weekprogramma al, want de coachingweken worden als gewone `programs`
  weggeschreven. Er staat nu een strook naar `/coaching`. Is dat de juiste verhouding, of hoort
  één van die twee schermen te verdwijnen?

---

## Wat je NIET mag breken

- **De proefgroep-poort.** Elke nieuwe ingang moet door `magCoaching()`. Er staat een test op.
- **De toestemmingspoort.** Gezondheidsvelden bestaan niet in de DOM tot het lid ze aanzet, en
  zonder `coaching_toestemming_at` gaat er niets van dat soort naar het model. Zonder toestemming is
  er géén weekmenu — ook geen algemener menu.
- **De deurcodemail.** Die opent iedereen. Een coachingfout mag nooit een deur dichthouden; de
  `.catch()` in `lib/reminders.js` blijft staan, en er staat een test op dat maar één van de twee
  `sendAccessCode`-aanroepen een workout meegeeft (de coach krijgt dezelfde code, niet het schema
  van zijn client).
- **De dagrem.** Elke modelaanroep achter `magNog()`, elke aanroep geboekt met `boekVerbruik()`, ook
  een mislukte.
- **Het ontwerp.** Het model schrijft één keer, de code volgt op. Het model kiest nooit een oefening.
  Wil je dat veranderen, dan is dat een expliciete beslissing met een reden, geen bijwerking.
- **Geen nieuwe permanente UI zonder dat er iets te tonen is.** Leeg is onzichtbaar.

---

## Bekende gaten — niet opnieuw melden, wél beslissen

Een adversariële review van 10-09 (134 agents, 42 beweringen, 23 overleefden) leverde twaalf fixes op.
Deze bleven bewust open omdat ze een beslissing vragen:

- **`target_weight_kg` is altijd null.** Het model stelt geen gewichten voor en het lid vult ze
  nergens in, dus de hele gewichtsprogressie in `volgendGewicht()` is dode code. Alleen herhalingen
  bewegen. Dit raakt werkveld 2 direct: wil je gewichtsprogressie, dan moet er ergens een getal
  binnenkomen — en dat is precies het soort invoer waarvan we weten dat niemand het doet.
- **`reeksGoed` staat hard op 0**, dus "drie keer goed → toch een duwtje" vuurt nooit. Er is geen
  historiek per oefening.
- **`start_reps` krijgt de reps van de lopende week**, waardoor het repplafond meeschuift.
- **De cron mag 60 seconden draaien, het model mag er 90 nemen**, sequentieel over alle plannen.
  Prima voor twee leden, niet voor tachtig.

---

## Werkwijze

1. **Kijk eerst.** Start de dev-server (`launch.json` entry `fittin`, poort 3100), log in als lid en
   loop de flow één keer helemaal door: intake → plan → boeken → deurcodemail → afvinken → check-in.
   Schrijf op wat je zelf niet begreep. Dat is je echte lijst.
2. **Meet waar je kan.** De databank is klein genoeg om te lezen. Hoeveel sessies zijn er afgevinkt,
   hoeveel check-ins ingevuld, hoeveel dagen zat er tussen een boeking en een vinkje?
3. **Beslis en schrijf het op** vóór je bouwt: wat verandert er, en welk gedrag zou dat moeten
   veranderen. Eén zin per keuze.
4. **Bouw in kleine stappen**, per bestand gestageerd (`git add -A` sleept 23 MB mee).
5. **Verifieer echt**: `npx vitest run` (466 tests nu), `npx next lint` (0 fouten, 15 bestaande
   warnings), `npm run build` — en nooit een build naast een draaiende dev-server.
6. **Zeg wat je niet gedaan hebt.** Een eerlijke restlijst is meer waard dan een volledig
   klinkend verslag.

---

## Waar het op beoordeeld wordt

Niet op het aantal schermen. Op één vraag: **is de kans groter geworden dat iemand die maandag
begint, in week vier nog steeds afvinkt?**

Alles wat daar niet aan bijdraagt, mag weg uit het voorstel.
