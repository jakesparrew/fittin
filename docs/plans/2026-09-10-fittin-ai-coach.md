# Fittin — de AI-coach

Opgemaakt 10-09-2026, tweemaal herzien dezelfde dag na overleg met de eigenaar. Vertrekt van gemeten
gebruik in de live databank (30 dagen tot 10-09), niet van wat er gebouwd is. Bouwt op de
architectuur van de AI-assistent die voor SuperHoreca al draait
(`docs/superpowers/plans/2026-08-17-ai-assistent.md` in die repo) en op de trainingslaag die hier
vorige zomer werd neergezet (W0–W6, `2026-07-08-fittin-workout-training-masterplan.md`).

## Samenvatting

De eigenaar beschrijft de coach zo, en dat is de kern van dit plan:

> Een lid start op één plek — "Start je Fittin AI Coaching hier" — beantwoordt vragen over leeftijd,
> gewicht, doel, en kiest waarmee het hulp wil: Workouts, Meal plan, Motivatie. De agent bedenkt een
> **volledig plan** op maat en dat komt in de app. Het lid **vinkt af** wat het doet. Elke week komt
> per mail: "deze week doen we dit." Pas als dat af is, gaat het naar de volgende week. De coach
> **vraagt feedback, interpreteert die, en bouwt daarop verder** — geen wekelijkse chat, maar een
> analyse die zich opstapelt.

Dat is een meerweeks plan met poorten, één tik per stap, en een geheugen dat groeit. Het is precies
de vorm die de cijfers hier toelaten. Want die cijfers zijn hard: **zeven workout-logs in de
databank, ooit**, over 83 leden. Nul metingen, nul feedback. De trainingslaag van vorige zomer heeft
in de praktijk geen gebruikers. Alles wat vraagt om sets in te voeren, sterft hier. Maar één tik op
"gedaan" in een mail die je toch al opent — dat is een ander soort vraag. En de zaal leeft wél:
**35 leden, 122 solo-sessies per maand**, negen van hen vier keer of meer. Zij trainen een uur zonder
dat iemand hen iets zegt. Dat zijn de eerste leden van de coach.

Vier keuzes lopen door het plan:

1. **Het plan is de eenheid, niet de sessie.** De coach maakt een plan van zes tot twaalf weken. Elke
   week is een stap met een vast aantal sessies. De deurcodemail zegt welke sessie van deze week
   vandaag is; de zondagmail opent de volgende week. Het lid vinkt sessies af, in de mail of in de
   app, één tik.
2. **Poorten tussen weken — streng, niet strafbaar.** Week N+1 gaat pas open als week N is
   afgevinkt. Maar wie een week mist, krijgt geen muur: de coach past week N aan (korter, lichter, of
   herhaald) en vraagt wat er gebeurde. Een to-do-lijst straft; een coach past zich aan.
3. **De check-in is de motor.** Elke week drie tot vier gestructureerde vragen — hoe zwaar, hoe ging
   het, pijn, energie, één vrij veld. Het model leest de antwoorden, de afgevinkte sessies en de
   voorgaande weken, schrijft een korte analyse ("je bovenlichaam gaat sneller vooruit dan je benen;
   week 5 krijgt daarom …") en genereert de volgende week. Dat dossier is het geheugen. Het is geen
   chat: het lid antwoordt op knoppen, de coach antwoordt met een week.
4. **De coach stuurt door naar een mens.** De gym verdient €12–15 per sessie, wie ook coacht; de
   coaches verdienen de €60 van personal training. Drie weken "te zwaar", pijn, of een doel dat
   begeleiding vraagt → een gratis proeftraining bij een coach die nieuwe klanten aanneemt.

En één voorwaarde die vooraf komt: gewicht, blessures en een meal plan zijn gezondheidsgegevens
(art. 9 AVG). De vorige AI-generator stuurde blessure-informatie naar Anthropic zonder dat die als
verwerker vermeld stond (audit-bevinding G0-6) — daarom staat hij uit. Golf 0 regelt dat, vóór er
één regel modelcode komt.

Kosten zijn geen argument tegen: een week genereren kost een paar dollarcent, een check-in
interpreteren nog minder. Aan het huidige ledenaantal is dat alles samen minder dan twintig euro per
maand.

## Wat er al staat en hergebruikt wordt

Dit plan bouwt geen tweede trainingslaag. Het verbindt wat er ligt.

| bestaand | waar | rol in dit plan |
|---|---|---|
| `profiles.height_cm`, `profiles.goal_weight_kg` | databank | intakevelden die er al zijn; gewicht, geboortedatum, doel, ervaring komen erbij |
| `programs` + `program_exercises` met kg, RPE, tempo, superset (W2, migratie 0111) | databank | een **week** van het plan is een programma met sessies als dagen — geen nieuwe oefeningstabel |
| 886 oefeningen met media en materiaal | `exercises`, `/oefeningen` | de enige bron waaruit het model mag kiezen; wat er niet in staat, bestaat niet |
| kaal sessiescherm met rusttimer, "↻ herhaal vorige", +2,5 kg-hint | `/training/sessie`, `WorkoutPlayer` | het scherm waarop het lid een stap afwerkt; krijgt één knop "Gedaan ✓" |
| deurcode-cron elke 5 minuten, mail ~5 min vooraf mét `zaalNotitie`-slot | `/api/cron/access`, `sendAccessCode` | "vandaag: sessie 2 van week 3" — het kanaal met 100% openingsgraad |
| sterrenvraag ~45 min ná de sessie op dezelfde cron | `/api/cron/access` | krijgt de knop "Gedaan ✓" en "te licht · goed · te zwaar" |
| weekrapport-cron op maandag, activatie-cron, inzicht-mails met dedupe 30 dagen | `/api/cron/weekreport`, `/api/cron/activation`, `lib/insight-mails.js` | de zondagmail (nieuwe week + check-in) en het stilte-signaal rijden op bestaande crons |
| `coach_clients`, `client_request_coach`, `/personal-training#intake`, `coach_accepting_clients` | app | de doorverwijzing naar een mens |
| `lib/progress.js` (weekvolume, Epley-1RM, PR's) | lib | voedt de analyse zodra er afgevinkte weken zijn |
| AI-architectuur van SuperHoreca: gateway via `authToken`, getypeerde tools, voorstellen die een mens toepast, quota, prijstest, dagbudget, terugvalketen | andere repo, `src/lib/ai/*` | sjabloon; wordt overgenomen, niet heruitgevonden |

Wat er **niet** meer staat: de oude generator op `/plannen/genereer` is volledig verwijderd (commit
`e8ce129`), geen Anthropic-SDK in `package.json`, geen sleutel. Schoon vertrek. De route `/coaching`
is vrij (`/coach` is het dashboard van de menselijke coaches en blijft dat).

## Het dossier — wat de coach onthoudt

Dit is het stuk dat "steeds daarop verder bouwt" waarmaakt, dus het staat apart.

Per lid met coaching aan bestaat één dossier, in drie tabellen (A0-8):

- **`coaching_plans`** — het plan: doel, startdatum, aantal weken, sessies per week, status (lopend ·
  afgerond · gepauzeerd), de samenvatting die het model bij aanmaak schreef ("Plan van 8 weken, 3×
  per week, opbouw kracht met nadruk op …").
- **`coaching_weeks`** — één rij per week: nummer, het `programs`-id met de sessies, `unlocked_at`,
  `completed_at`, en de **analyse** die het model schreef vóór het deze week genereerde — in gewone
  taal, twee tot vier zinnen, leesbaar voor het lid én voor een menselijke coach die het dossier
  later openslaat.
- **`coaching_checkins`** — één rij per week: de antwoorden (zwaarte · verloop · pijn · energie · vrij
  veld), welke sessies afgevinkt zijn, en de **interpretatie** van het model met de aanpassing die
  eruit volgde ("herhalingen op squat verlaagd, rustdag toegevoegd").

Het model krijgt bij elke weekgeneratie: het plan, alle voorgaande analyses en interpretaties (kort,
in volgorde), de check-in van deze week, en de afgevinkte sessies. Het krijgt **niet**: naam,
e-mail, adres, exacte geboortedatum — een leeftijdsklasse volstaat. Zo groeit er per lid een verhaal
van acht tot twaalf korte hoofdstukken, en elk volgend hoofdstuk leest de vorige. Dat is de analyse
die zich opstapelt. En omdat het in gewone taal staat, kan een lid het teruglezen op `/coaching` en
kan een coach het overnemen bij een doorverwijzing.

## Golf 0 — Fundament: toestemming, verwerker, budget, dossier

_Niets hiervan is zichtbaar voor een lid. Alles hiervan is de reden dat de vorige poging uitstaat._

| id | wat | effort | impact |
|---|---|---|---|
| A0-1 | Verwerkersovereenkomst met de modelaanbieder afsluiten en opnemen in de privacyverklaring (sectie 3, verwerkers). Handtekening van de VZW, niet van de ontwikkelaar | S (owner) | blokkerend |
| A0-2 | Uitdrukkelijke toestemming (art. 9.2.a) vóór gewicht, lengte, blessures of voedingsinfo naar het model gaan: eigen vinkje in de intake, apart van de voorwaarden, intrekbaar op `/account`. Zonder toestemming: Workouts en Motivatie zonder die velden; Meal plan vereist ze | S | blokkerend |
| A0-3 | Gateway-aansluiting overnemen van SuperHoreca: `authToken` (Bearer), modelids `anthropic/…`, terugvalketen die eindigt op een tool-capabel niet-Anthropic-model | S | hoog |
| A0-4 | Prijstabel met test: elk routeerbaar model heeft een rij, anders faalt de suite. Dagbudget in micro-USD met noodrem. Géén redeneermodellen (nemotron-les: verborgen redenering brandt het budget op zonder tekst) | S | hoog |
| A0-5 | Getypeerde tools, het model schrijft nooit SQL: `get_dossier`, `search_exercises` (spiergroep/materiaal/niveau), `get_upcoming_bookings`, `propose_week`, `propose_mealweek`, `write_analysis` | M | hoog |
| A0-6 | Validatiestap na generatie: elke voorgestelde oefening moet een `exercises.id` zijn en bij het materiaal van de zaal passen. Wat niet bestaat wordt vervangen of het voorstel verworpen — nooit doorgelaten | S | hoog |
| A0-7 | Omgevingsvariabelen: `AI_COACH_ENABLED` (noodknop) en `AI_GATEWAY_API_KEY`; zonder sleutel bestaat de functie niet | S | — |
| A0-8 | Migratie: intakevelden op `profiles` (geboortedatum, gewicht, doel, ervaring, dagen/week, beperkingen, toestemming + tijdstip), `coaching_plans`, `coaching_weeks`, `coaching_checkins`, `mealweeks`. Kolomrechten expliciet: een nieuwe kolom erft hier niets (hardening 0132). RLS: lid leest zijn eigen dossier, coach leest het van zijn clienten, beheerder alles | M | blokkerend |

### A0-1 en A0-2 — waarom dit eerst komt

De privacyverklaring noemt gezondheidsgegevens vandaag correct als bijzondere categorie met
uitdrukkelijke toestemming, "alleen als je die zelf invult" — maar dat gaat over metingen die in de
eigen databank blijven. Zodra "ik weeg 92 kilo en heb een lage rugblessure" naar een extern model
gaat, is dat een doorgifte aan een verwerker die nergens vermeld staat. Twee dingen dus: de aanbieder
als verwerker opnemen (met DPA), en een aparte toestemming die de vraag stelt in de intake, met
uitleg waarom, niet verstopt in de voorwaarden. Het model krijgt expliciet te horen of het die
velden heeft; ontbreken ze, dan gokt het niet.

### A0-6 — de validatiestap

Het model kiest oefeningen via `search_exercises` en geeft ids terug; de server controleert dat elke
id bestaat, actief is en bij het materiaal past. Een week met een verzonnen oefening is niet "een
beetje verkeerd" — het lid staat in de zaal met een naam die nergens op slaat en geen video.

## Golf 1 — De ingang: `/coaching`

_De voordeur. "Start je Fittin AI Coaching hier." Eén keer doorlopen, daarna komt de coach naar je._

| id | wat | effort | impact |
|---|---|---|---|
| A1-1 | Pagina `/coaching`: voor wie nog niet begonnen is één uitnodiging en één knop. Voor wie bezig is: deze week met haar sessies en vinkjes, de analyse van de coach bovenaan, de vorige weken opvouwbaar, het meal plan en de laatste check-in | M | hoog |
| A1-2 | Intake als begeleid gesprek, één vraag per scherm, met uitleg waarom we het vragen: geboortedatum, lengte (bestaat), gewicht, doel (sterker · conditie · afvallen · spiermassa · gewoon bewegen), ervaring (nooit · soms · vaak), dagen per week, hoeveel weken (6 · 8 · 12), en — achter toestemming A0-2 — "iets wat we moeten vermijden?" Terug bewaart; halverwege stoppen bewaart wat er is | M | hoog |
| A1-3 | Modulekeuze: **Workouts · Meal plan · Motivatie**, elk met één zin wat het doet en wat het van je vraagt. Meerdere tegelijk mag; elk apart aan of uit op `/coaching` | S | hoog |
| A1-4 | Het plan verschijnt binnen de minuut: overzicht van alle weken in één regel per week ("week 1–2 wennen · week 3–6 opbouw · week 7–8 piek"), de eerste week volledig open met haar sessies, de andere weken zichtbaar maar op slot. Wie geen boeking heeft ziet één knop "Boek je eerste sessie". Geen leeg dashboard | M | hoog |
| A1-5 | Ingangen naar `/coaching`: knop op `/account`, kaart op `/training`, één regel in de welkomstmail, en na de gratis eerste sessie een zin in de sterrenmail: "Wil je dat je volgende weken klaarstaan?" | S | hoog |
| A1-6 | Vaste regel in elke uitvoer, als gedrag en niet als voetnoot: geen medisch advies, bij pijn stoppen, bij een medisch klinkende vraag doorverwijzen in plaats van genereren | S | blokkerend |

## Golf 2 — Module Workouts: het plan, de weken, de poorten

_De kern. Hier gebeurt "deze week doen we dit — ben je klaar, dan de volgende."_

| id | wat | effort | impact |
|---|---|---|---|
| A2-1 | Plan genereren bij afronden van de intake: N weken, elke week een `programs`-rij met sessies als dagen, oefeningen uit de bibliotheek, materiaal van de zaal, opbouw over de weken (volume, dan intensiteit, dan een lichtere week) volgens doel en ervaring. Alleen week 1 wordt nu in detail gegenereerd; latere weken krijgen een schets die pas concreet wordt als ze opengaan — zo verwerkt elke week de feedback van de vorige | M | hoog |
| A2-2 | Afvinken: elke sessie heeft één knop "Gedaan ✓" — in de app, in de sterrenmail na een boeking, en in de deurcodemail van de volgende dag als er nog niets aangevinkt is. Eén tik. Wie wil, logt sets in het sessiescherm; dat is extra, nooit vereist | S | hoog |
| A2-3 | De deurcodemail zegt welke stap vandaag is: "Vandaag: sessie 2 van week 3 — benen." Met de oefeningen en één knop naar `/training/sessie`. Boekt een lid vaker dan het plan voorziet, dan krijgt het een extra losse sessie in dezelfde stijl, buiten de telling | S | hoog |
| A2-4 | Zondagmail = check-in + volgende week. Eerst vier knoppenvragen (hoe zwaar · hoe verliep het · pijn · energie) plus één vrij veld; daarna, op basis daarvan, de analyse en week N+1. Wie de check-in niet invult krijgt na 48 uur een tweede korte vraag; daarna gaat de week open met de standaardopbouw en een zin dat de coach zonder feedback werkte | M | hoog |
| A2-5 | De poort: week N+1 gaat pas open als alle sessies van week N afgevinkt zijn óf de check-in ingevuld is. Wie week N niet haalt, krijgt geen muur maar een keuze in de zondagmail: "herhaal week N", "maak er een kortere week van", "ga toch door". De coach kiest een standaard op basis van hoeveel er af is (< 50% → herhaal; ≥ 50% → korter) en legt uit waarom | M | hoog |
| A2-6 | De analyse: vóór elke weekgeneratie schrijft het model twee tot vier zinnen op basis van het dossier — wat vooruitging, wat achterbleef, wat deze week daarom verandert. Die tekst staat bovenaan de zondagmail en bovenaan `/coaching`. Het is het gezicht van "steeds verder bouwen" | S | hoog |
| A2-7 | Progressie uit de check-in en de oordelen: "te licht" schuift streefgewicht of herhalingen op met een plafond per stap (+2,5 kg of +1), "te zwaar" trekt terug, pijn op een oefening → die oefening wordt vervangen en gemarkeerd in het dossier | M | midden |
| A2-8 | Afronding: na de laatste week een overzicht — weken gehaald, sessies gedaan, waar het gewicht omhoogging (uit `lib/progress.js` als er gelogd is, anders uit de oordelen) — en de vraag: nieuw plan met hetzelfde doel, ander doel, of een proeftraining bij een coach | S | midden |

### A2-1 — waarom latere weken pas concreet worden als ze opengaan

Als het model in de intake meteen alle acht weken in detail genereert, kan week 6 nooit rekening
houden met wat er in week 4 gebeurde. Dan is de feedback decoratie. Daarom: het hele plan als schets
(zodat het lid ziet waar het naartoe gaat), maar elke week wordt pas ingevuld op het moment dat ze
opengaat, met het dossier tot dan als invoer. Dat is het verschil tussen een pdf en een coach.

### A2-5 — waarom de poort niet strafbaar is

Een poort die dichtblijft tot alles af is, werkt één keer. De tweede keer dat iemand een week niet
haalt — ziek, vakantie, een drukke werkweek — is de poort een verwijt en stopt het lid. De cijfers
uit de zaal zeggen dat de meeste leden twee à drie keer per week komen, met gaten. Het plan moet dus
uitgaan van gaten. De poort blijft (je krijgt week 5 niet zonder week 4), maar wat "week 4 afmaken"
betekent, past zich aan: herhalen, inkorten, of bewust doorgaan. En de coach zegt erbij waarom hij
dat voorstelt.

## Golf 3 — Module Meal plan

_Zelfde ritme als de workouts: een week, een check-in, een aanpassing._

| id | wat | effort | impact |
|---|---|---|---|
| A3-1 | Weekmenu op basis van doel, gewicht, lengte, leeftijdsklasse, activiteit (sessies in het plan) en voorkeuren (vegetarisch · geen varken · lactose · noten · vrij veld). Zeven dagen, drie maaltijden en één tussendoortje, met boodschappenlijst. Belgische supermarktproducten | M | hoog |
| A3-2 | Levering op zondag in dezelfde mail als de trainingsweek, en op `/coaching`. Knoppen: "vervang deze dag", "maak dit vegetarisch". In de check-in twee extra vragen: "kon je het volgen?" en "honger?" — de volgende week past de porties of de eenvoud aan | M | hoog |
| A3-3 | Grenzen als gedrag én als code: nooit onder 1.500 kcal (vrouw) of 1.800 (man), nooit meer dan een half kilo per week als doel, en bij medische aandoening, zwangerschap, eetstoornis of medicatie stopt het model en verwijst het naar een diëtist. Een plan onder de grens wordt niet geleverd | S | blokkerend |
| A3-4 | Gewicht wordt gevraagd, niet gemeten: één veld op `/coaching`; het model rekent met het laatste en toont de trend alleen als het lid dat aanzet | S | midden |

### Waarom dit een eigen golf is

Een meal plan raakt drie dingen die een workout niet raakt: het vereist gewicht en dus toestemming,
het geeft advies waar mensen hun gezondheid aan ophangen, en een fout komt niet in de zaal maar in
het lichaam terecht. Daarom eerst Workouts live met de toestemmingsflow bewezen, en dan pas Meal plan
erbij. Geen twijfel over de module — volgorde.

## Golf 4 — Module Motivatie

_Goedkoop, en het onderdeel dat de rest doet terugkomen._

| id | wat | effort | impact |
|---|---|---|---|
| A4-1 | De analyse van A2-6 ís al de wekelijkse motivatie: wat vooruitging, in de stem van de coach. Deze module voegt de momenten *tussen* de weken toe | — | — |
| A4-2 | Stilte-signaal: tien dagen geen boeking terwijl er een open week staat → één bericht van de coach met één knop naar `/boeken`, en de vraag of het plan gepauzeerd moet worden. Rijdt op de activatie-cron met dedupe 30 dagen | S | hoog |
| A4-3 | Mijlpalen: eerste week af, eerste keer "te licht" waar het eerder "te zwaar" was, halfweg het plan, plan afgerond. Eén regel, geen confetti | S | midden |
| A4-4 | Toon instelbaar in de intake: "hou me scherp" of "hou het rustig". Het enige persoonlijkheidsknopje | S | midden |
| A4-5 | Pauzeknop op `/coaching`: het plan bevriest, de mails stoppen, de poorten blijven staan. Hervatten = de coach vraagt of je opnieuw begint bij deze week of één week terug | S | midden |

## Golf 5 — De brug naar de mens

_De AI is niet de eindbestemming. Ze is de instroom voor de coaches die er al zijn._

| id | wat | effort | impact |
|---|---|---|---|
| A5-1 | Doorverwijsmomenten, in de prompt én in code: pijn in twee check-ins, drie weken "te zwaar", een medisch klinkende vraag, of een doel dat begeleiding vraagt (revalidatie, wedstrijd, gewichtsdoel met medische context) → het model stopt met genereren en biedt een gratis proeftraining aan bij een coach die nieuwe klanten aanneemt | M | hoog |
| A5-2 | De doorverwijzing gebruikt de bestaande intake (`/personal-training#intake`) met de coach vooringevuld, en **het dossier gaat mee**: de coach leest de analyses en check-ins en begint niet van nul. Dat is het concrete voordeel van een dossier in gewone taal | S | hoog |
| A5-3 | Coach-assistent in de bouwer: "stel een week voor op basis van dit dossier". Zelfde motor, ander gezicht: voorstel, coach past aan, klikt Toepassen. Nooit rechtstreeks in het programma van een coach schrijven | M | midden |
| A5-4 | Wie een menselijke coach heeft, krijgt geen AI-weken tenzij de coach dat aanzet; Meal plan en Motivatie blijven beschikbaar. De coach ziet het dossier van zijn clienten | S | hoog |

### Waarom de coaches dit moeten willen

Vijf van 83 leden hebben vandaag een coach. De personal-trainingroute leverde in de audit van augustus
nul aanvragen op. De AI volgt elke week 35 leden die geen coach hebben, en weet wanneer die
vastzitten — en levert bij doorverwijzing een dossier af in plaats van een naam. Dat is een
verwijzingsmachine voor de coaches, mits ze het zo ervaren. Daarom A5-4 en A5-1. Dit hoort besproken
vóór golf 2 live gaat.

## Bewust niet, of niet nu

- **Open chat.** De intake en de check-in zijn gesprekken, maar geleid: één vraag per scherm, met
  knoppen en één vrij veld. Een vrij chatvenster komt pas als golf 1–4 aantonen dat leden hun weken
  afvinken. Een assistent die wacht tot iemand hem opent, wordt niet geopend.
- **Sets loggen als vereiste.** Nooit een poort die daarvan afhangt. Zeven logs in een jaar.
- **Wearables, stappentellers, slaap.** Geen data, geen vraag.
- **Autonome wijzigingen aan een programma van een coach.** Nooit. Voorstellen ja, toepassen doet
  een mens.
- **Supplementen in het meal plan.** Pas als de Upfront-samenwerking staat, en dan als aparte,
  gemarkeerde suggestie.
- **Spraak.** Nee.

## Beveiliging en grenzen — niet onderhandelbaar

- Het model schrijft nooit SQL en krijgt nooit een databankverbinding. Alleen getypeerde tools,
  scoped op het lid uit de sessie.
- Elke gegenereerde oefening wordt tegen `exercises` gevalideerd (A0-6). Elk meal plan tegen de
  kcal-ondergrens (A3-3). Een week die de validatie niet haalt, wordt niet geleverd — het lid krijgt
  de vorige week opnieuw en de fout gaat naar het foutalarm.
- Geen naam, e-mail, geboortedatum of adres in de prompt. Leeftijdsklasse en niveau volstaan.
- Gezondheidsinfo enkel met aparte, intrekbare toestemming (A0-2) en enkel naar een aanbieder met
  verwerkersovereenkomst (A0-1). Intrekken = die velden gaan niet meer mee én Meal plan gaat uit;
  het dossier blijft van het lid en is exporteerbaar via de bestaande `/api/me/export`.
- Dagbudget met harde stop; gefaalde aanroepen tellen niet. Eén generatie tegelijk per lid; een week
  wordt hoogstens één keer per dag opnieuw gegenereerd.
- De service worker mag geen POST of stream proxyen (SuperHoreca-incident: stille "connection dropped").
- Noodknop `AI_COACH_ENABLED=false`: mails vertrekken zonder coach-blok, `/coaching` toont "even
  niet beschikbaar", poorten bevriezen — niemand verliest een week door een storing bij ons.

## Wat het meet

Alles hieronder is meetbaar met `page_views`, `bookings`, `programs` en de nieuwe dossiertabellen.
Nulmeting = de maand tot 10-09.

| meting | nulmeting | doel na drie maanden |
|---|---|---|
| leden die de intake afronden en een plan krijgen | 0 | 40% van de actieve leden |
| afgevinkte sessies / geplande sessies (per lopende week) | — | > 60% |
| check-ins ingevuld / check-ins gevraagd | — | > 50% |
| leden die week 4 bereiken | — | > 50% van wie startte |
| solo-sessies per solo-lid per maand | 3,5 (122 / 35) | 4,5 |
| leden die na hun gratis uur een tweede sessie boeken | te meten | +20% |
| doorverwijzingen → intake-aanvragen bij een coach | ~0 per maand | 3 per maand |
| kost per lid met coaching per maand | — | < €0,50 |

## Open beslissingen voor de eigenaar

1. **Alle drie de modules bij lancering, of Workouts eerst?** Aanbeveling: golf 0 + 1 + 2 als één
   ronde live (ingang, intake, plan, weken, poorten, check-in), Meal plan en Motivatie er twee weken
   na. Zo is de toestemmingsflow bewezen vóór er gewichten door gaan, en heeft de ingang meteen iets
   dat leeft.
2. **Gratis voor elk lid, of een voordeel van het abonnement?** Tien actieve abonnementen op 83
   leden; het abonnement mist een reden van bestaan behalve de prijs. "Je eigen coach met een plan,
   een weekmenu en opvolging" is precies zo'n reden. Aanbeveling: intake en de eerste twee weken voor
   iedereen; vanaf week 3, Meal plan en Motivatie bij het abonnement.
3. **Hoe streng is de poort?** Het plan zegt: streng maar aanpasbaar (A2-5). Alternatief: hard —
   week N+1 nooit zonder week N volledig af. Aanbeveling: aanpasbaar; hard is een to-do-lijst.
4. **Wie tekent de verwerkersovereenkomst** — De Wereld Draait Door VZW; handtekening van Ran.
5. **Het gesprek met de acht coaches** vóór golf 2 live gaat: de AI als instroom mét dossier, niet
   als concurrent.
6. **Naam en toon.** "Je coach" zonder eigennaam, of een naam. Aanbeveling: geen naam — het is een
   functie van de gym, geen persoon die belooft er te zijn. De toon kiest het lid (A4-4).

## Volgorde en omvang

Golf 0, 1 en 2 samen zijn één aaneengesloten bouwronde van ongeveer drie tot vier weken: migratie
vooraf op productie, ingang, intake, plan met schets, week 1 concreet, afvinken in app en mail,
deurcodekoppeling, zondagmail met check-in en analyse, poorten. Golf 3 (Meal plan) en golf 4
(Motivatie) zijn elk ongeveer een week, zodra de toestemmingsflow twee weken live heeft gedraaid.
Golf 5 kan parallel met 3 en 4, na het gesprek met de coaches. Elke golf sluit met dezelfde poorten
als altijd: tests groen, lint nul fouten, schone productiebuild, en een adversariële review op het
toestemmings-, kcal- en budgetpad vóór de push.
