# Fittin — groei- en kwaliteitsaudit

Opgemaakt 17-08-2026. Twaalf domeinen parallel uitgekamd (homepage, boekflow, proeftraining,
prijzen, PT/coaches, SEO, mobiel, analytics, performance, security, retentie, codekwaliteit).
Elke bevinding is daarna door een tegenspreker in de code nagetrokken; wat weerlegd werd is
geschrapt. **Golf 0 is uitgevoerd en gepusht** (commit 45c3dc7 + migratie 0132).

## Samenvatting

Het werkplan gaat van "wat vandaag geld, gegevens of toegang lekt" naar "wat de omzet vergroot" naar "wat het onderhoud goedkoper maakt". Eerst één beveiligingsronde (elk lid kan vandaag via de publieke anon-sleutel een betaalde, bevestigde boeking wegschrijven en zo gratis binnen; 688 ledenadressen liggen ongenegeerd in de repo). Daarna de boekflow, waar afgebroken checkouts, onzichtbare foutmeldingen en liegende gratis-labels boekingen laten verdampen — allemaal kleine ingrepen op de pagina die het geld binnenhaalt. Vervolgens de gratis eerste sessie zichtbaar maken (een uitgelogde bezoeker leest vandaag "Totaal € 15,00" onder een knop die "gratis" belooft) en de personal-trainingroute, die aantoonbaar nul aanvragen opleverde in 46 dagen omdat geen enkele coachpagina naar het intakeformulier linkt. Prijzen, meting, retentie, SEO/performance en codekwaliteit volgen daarna. Bijna alles in de eerste vier golven is S-effort en verwijdert netto UI of tekst — dat sluit aan bij de declutter-regel; waar een advies tóch iets toevoegt, staat dat expliciet in de conflictenlijst.

## Golf 0 — Lekken dichtdraaien (geld, gegevens, toegang)

_Deze vijf staan vóór alle groeiwerk omdat ze niet over conversie gaan maar over geld dat vandaag kan weglopen, een onbemande zaal die gratis open kan, een ledenlijst die één 'git add -A' van GitHub verwijderd is, en gezondheidsdata die naar een niet-vermelde verwerker gaat. Allemaal S of M, geen enkele raakt de boekings- of betaalfunctionaliteit._

| id | wat | effort | impact |
|---|---|---|---|
| G0-1 | INSERT op bookings intrekken — lid kan nu een betaalde, bevestigde boeking wegschrijven | S | hoog |
| G0-2 | 688 ledenadressen in scripts/.blast-sent.json zijn niet genegeerd door git | S | hoog |
| G0-3 | Lid kan zijn beurt terugkrijgen door een voorbije boeking te annuleren | M | hoog |
| G0-4 | Gratis inschrijven op een betalend event door paid=true mee te sturen | S | hoog |
| G0-5 | /api/log-error kan 200 alarmmails per 5 minuten uit dezelfde Resend-account trekken als de deurcodes | S | hoog |
| G0-6 | Blessure-informatie gaat naar Anthropic, dat nergens als verwerker staat | S | hoog |

### G0-1 — INSERT op bookings intrekken — lid kan nu een betaalde, bevestigde boeking wegschrijven

Nieuwe migratie: 'revoke insert on bookings from authenticated, anon;' plus de policy aanscherpen tot paid=false / price_cents=0 als vangnet. Geverifieerd veilig: geen enkele plek in de app insert rechtstreeks in bookings — alles loopt via SECURITY DEFINER-RPC's die ongevoelig zijn voor kolomrechten. Daarna de live DB controleren op paid=true zonder bijhorende payments- of credits_ledger-rij.

Bestanden: `website/supabase/migrations/0003_admin.sql`, `website/supabase/migrations/0055_security_booking_payment_hardening.sql`, `website/app/(site)/boeken/actions.js`, `website/lib/reminders.js`

### G0-2 — 688 ledenadressen in scripts/.blast-sent.json zijn niet genegeerd door git

Regel toevoegen aan de root-.gitignore (website/scripts/.blast-sent.json, of ruimer met uitzondering voor scripts/seed/workouts.json) en de verzendstatus op termijn naar een DB-tabel of buiten de repo verhuizen. Ook blast-prepare.mjs en blast-send.mjs staan untracked in dezelfde map.

Bestanden: `.gitignore`, `website/scripts/.blast-sent.json`

### G0-3 — Lid kan zijn beurt terugkrijgen door een voorbije boeking te annuleren

Annuleren enkel nog via een SECURITY DEFINER-RPC die het 6u-venster afdwingt, verleden-slots weigert en dubbel annuleren blokkeert; als tweede laag een tijdscontrole (now() < starts_at) in refund_member_credit. Trek daarna het UPDATE-recht op status/cancelled_at bij authenticated in. Controleer bestaande 'refund'-rijen waarvan starts_at in het verleden ligt.

Bestanden: `website/supabase/migrations/0055_security_booking_payment_hardening.sql`, `website/supabase/migrations/0117_halfhour_sessions.sql`, `website/app/(site)/account/actions.js`

### G0-4 — Gratis inschrijven op een betalend event door paid=true mee te sturen

INSERT op event_signups intrekken bij authenticated en alles via reserve_event_seat laten lopen (die RPC bestaat al), of minstens 'and paid = false' in de with-check. Neem in dezelfde beurt de twee .update()-aanroepen in community/actions.js mee: er is geen UPDATE-policy, dus die raken vandaag stil 0 rijen.

Bestanden: `website/supabase/migrations/0004_community.sql`, `website/app/(site)/community/actions.js`

### G0-5 — /api/log-error kan 200 alarmmails per 5 minuten uit dezelfde Resend-account trekken als de deurcodes

Harde bovengrens op het aantal alarmgroepen per cronbeurt in error-alert.js (bv. 5, met 'en nog N andere'), plus een IP-limiet en een korte (message, path)-dedupe op de publieke endpoint. Dit beschermt het afzenderdomein waar ook de deurcodemails van afhangen.

Bestanden: `website/app/api/log-error/route.js`, `website/lib/error-alert.js`, `website/app/api/cron/access/route.js`

### G0-6 — Blessure-informatie gaat naar Anthropic, dat nergens als verwerker staat

Eenvoudigste weg (past bij declutter): haal 'na blessure' uit de placeholder van de AI-schemagenerator, beperk het veld tot niet-medische voorkeuren en filter serverside. Alternatief: Anthropic bij de verwerkers én de EER-doorgifte zetten en dezelfde uitdrukkelijke gezondheidstoestemming vragen als bij lichaamsmetingen (recordConsent/hasConsent bestaan al).

Bestanden: `website/app/(site)/plannen/genereer/GenerateForm.jsx`, `website/app/(site)/plannen/genereer/actions.js`, `website/app/(site)/privacy/page.jsx`, `website/lib/legal.js`

## Golf 1 — De boekflow lekt boekingen

_Prioriteit 2 van de eigenaar (meer boekingen), en dit is de goedkoopste golf van het hele plan: acht ingrepen op de pagina waar het geld binnenkomt, bijna allemaal één tot vijf regels. Elk item repareert een moment waarop iemand die al 'Bevestig' klikte of al betaalde alsnog wegvalt._

| id | wat | effort | impact |
|---|---|---|---|
| G1-1 | Afgebroken Stripe-checkout komt op een doodlopende pagina — de 'Betaal nu'-knop staat elders | S | hoog |
| G1-2 | Op mobiel toont de zwevende 'Bevestig'-knop geen enkele foutmelding | S | hoog |
| G1-3 | 'Je eerste uur is gratis' en 'betaal met je beurtenkaart' blijven staan terwijl het totaal € 30 toont | S | hoog |
| G1-4 | Uitgelogde bezoekers zien uren als 'vol' die al vrij zijn | S | hoog |
| G1-5 | Stripe-betaalvenster is 32 minuten terwijl de reservering na 15 minuten vrijvalt | S | hoog |
| G1-6 | Betaalde beurten verlopen zonder waarschuwing zodra credits_ledger boven 1000 rijen zit | S | hoog |
| G1-7 | Kortingscode blijft het oude bedrag tonen nadat de duur wijzigt | S | midden |
| G1-8 | create_booking mist het advisory lock op het sessietegoed dat de andere boekpaden wél hebben | S | midden |

### G1-1 — Afgebroken Stripe-checkout komt op een doodlopende pagina — de 'Betaal nu'-knop staat elders

cancel_url van de boeking naar /account?betaling=afgebroken zodat de bezoeker op de bestaande PendingPaymentBanner met aftelling landt. Doe in dezelfde beweging /lidmaatschap: die pagina leest helemaal geen searchParams, dus een afgebroken kaart- of abo-checkout van € 150 komt terug zonder één woord. Beide banners zijn leeg-is-onzichtbaar.

Bestanden: `website/app/(site)/boeken/actions.js`, `website/components/PendingPaymentBanner.jsx`, `website/app/(site)/lidmaatschap/page.jsx`, `website/app/(site)/lidmaatschap/actions.js`

### G1-2 — Op mobiel toont de zwevende 'Bevestig'-knop geen enkele foutmelding

Bij res.error ook toast('error', res.error) naast de bestaande setError — de toast-helper staat in hetzelfde bestand en wordt al voor netwerkfouten gebruikt. Neem meteen de wachtlijstknop mee (die slikt succes én fout op) en filter ruwe Postgres-fouten: P0001 doorlaten (die zijn in het Nederlands geschreven), de rest vervangen door één vaste zin.

Bestanden: `website/components/booking/BookingClient.jsx`, `website/app/(site)/boeken/actions.js`

### G1-3 — 'Je eerste uur is gratis' en 'betaal met je beurtenkaart' blijven staan terwijl het totaal € 30 toont

Twee labels de werkelijkheid laten volgen: bij duur > 1u het welkomstlabel vervangen door 'Je gratis uur geldt enkel voor een sessie van 1 uur', en bij useCredit zonder toereikend saldo het vinkje aanvullen met 'je saldo van {n} volstaat niet voor {duur} — je betaalt deze sessie'. Laat de amber-waarschuwing bij de duurkeuze staan: die zit precies waar de beslissing valt.

Bestanden: `website/components/booking/BookingClient.jsx`

### G1-4 — Uitgelogde bezoekers zien uren als 'vol' die al vrij zijn

expire_unpaid_bookings op /boeken draaien met de admin-client die al in hetzelfde bestand bestaat (de RPC is enkel aan authenticated/service_role toegekend, dus voor gasten faalt hij vandaag stil), en het resultaat in een variabele opvangen zodat een fout niet opnieuw verdwijnt.

Bestanden: `website/app/(site)/boeken/page.jsx`, `website/supabase/migrations/0096_unpaid_hold_restore.sql`

### G1-5 — Stripe-betaalvenster is 32 minuten terwijl de reservering na 15 minuten vrijvalt

Hou de 15 minuten (dat is de bewuste anti-hamsterkeuze van 0121) en toon vóór de doorverwijzing 'Rond je betaling binnen 15 minuten af, anders komt je uur weer vrij'. Werk de foute commentaarregel bij die nog naar de verdwenen 35-minutenhold van 0089 verwijst.

Bestanden: `website/app/(site)/boeken/actions.js`, `website/supabase/migrations/0121_shorter_hold.sql`, `website/app/api/stripe/webhook/route.js`

### G1-6 — Betaalde beurten verlopen zonder waarschuwing zodra credits_ledger boven 1000 rijen zit

sendCreditExpiryWarnings haalt de te controleren leden op zonder .limit() of .range(); Supabase kapt af op 1000 rijen. Pagineren met .range(), of beter een kleine RPC die distinct user_ids van nog niet-verlopen positieve grants teruggeeft. Tel eerst hoeveel rijen de tabel vandaag heeft om te weten of het al bijt.

Bestanden: `website/lib/reminders.js`

### G1-7 — Kortingscode blijft het oude bedrag tonen nadat de duur wijzigt

discountInfo wissen zodra priceCents verandert (één useEffect, of setDiscountInfo(null) in de bestaande onClick van duur en dienst). De server rekent al correct, alleen de tussenweergave liegt — en dat verschil verschijnt op de Stripe-pagina.

Bestanden: `website/components/booking/BookingClient.jsx`, `website/app/(site)/boeken/actions.js`

### G1-8 — create_booking mist het advisory lock op het sessietegoed dat de andere boekpaden wél hebben

In de credit-tak van create_booking dezelfde regel als admin_create_booking: pg_advisory_xact_lock(hashtext('credits:' || v_uid::text)) vlak vóór de saldolezing. Nieuwe migratie, bestaande boekingen niet aanraken.

Bestanden: `website/supabase/migrations/0117_halfhour_sessions.sql`, `website/supabase/migrations/0120_drop_balie_mode.sql`

## Golf 2 — De gratis eerste sessie zichtbaar en klikbaar maken

_Prioriteit 1 en 3 (meer klanten, meer proeftrainingen). Het gratis eerste uur is de hele acquisitiemotor en is technisch al perfect gebouwd — het probleem is dat een koude bezoeker hem niet ziet, of hem tegengesproken ziet worden door '€ 15,00' vlak boven de knop. Alle items zijn tekst-, klasse- of hrefwijzigingen op twee bestanden; netto verdwijnt er meer UI dan er bijkomt._

| id | wat | effort | impact |
|---|---|---|---|
| G2-1 | Uitgelogde bezoeker ziet 'Totaal € 15,00' onder de knop 'boek je eerste uur gratis' | S | hoog |
| G2-2 | De zwaarst gestylede hero-knop leidt naar een leeg registratieformulier in plaats van naar het rooster | S | hoog |
| G2-3 | De site vraagt om 'code FittinWelcome' terwijl de kortingsvalidatie die code expliciet weigert | S | hoog |
| G2-4 | Homepage boven de vouw: prijs onleesbaar, locatie afwezig, groepsprijs onuitgesproken | S | hoog |
| G2-5 | Homepagestructuur: prijs staat pas als achtste sectie, en de stats-band herhaalt de hero | S | hoog |
| G2-6 | Alles onder de hero rendert op opacity:0 en wordt pas zichtbaar via JavaScript | S | hoog |
| G2-7 | Op mobiel staat het uurrooster een volledig scherm diep, achter een keuze uit één optie | S | midden |
| G2-8 | Een moment uit week 2 verdwijnt zonder melding nadat de gast een account maakt | S | midden |
| G2-9 | De loginmuur op de laatste stap wordt nergens verklaard | S | midden |
| G2-10 | Install-banner overvalt de koude bezoeker en dekt de navigatie af | S | midden |

### G2-1 — Uitgelogde bezoeker ziet 'Totaal € 15,00' onder de knop 'boek je eerste uur gratis'

Voor gasten bij duur = 1 uur '€ 15,00 doorstreept · je eerste uur is gratis (bij je eerste boeking)' tonen in de prijsregel, dezelfde tekst in de mobiele vaste balk, en de bestaande gratis-intro ook voor gasten renderen in plaats van de neutrale zin. De nuance 'bij je eerste boeking' houdt de belofte ook waar voor een uitgelogd bestaand lid.

Bestanden: `website/components/booking/BookingClient.jsx`, `website/app/(site)/boeken/page.jsx`

### G2-2 — De zwaarst gestylede hero-knop leidt naar een leeg registratieformulier in plaats van naar het rooster

'Reserveer de gym' primair (groen) maken en 'Maak gratis account' secundair, en alle account-links op de homepage ?next=/boeken meegeven zodat een registratie altijd in de boekflow eindigt (safeNext laat een relatief pad al door). Het kalenderpad toont beschikbaarheid vóór de accountdrempel; het formulierpad vraagt vertrouwen vóór er waarde is.

Bestanden: `website/app/(site)/page.jsx`, `website/app/(site)/login/actions.js`

### G2-3 — De site vraagt om 'code FittinWelcome' terwijl de kortingsvalidatie die code expliciet weigert

Codeframing weghalen op /boeken (de pil bovenaan, het vinkjelabel, het bevestigingsscherm), in de meta-description en in de bevestigingsmail; overal 'je gratis eerste uur' in de bewoording van de homepage. Vervang meteen 'Fit60-sessie' door 'privé sessie'. De defensieve check in lib/discounts.js blijft staan voor wie de oude flyers nog heeft. Dit verwijdert tekst.

Bestanden: `website/components/booking/BookingClient.jsx`, `website/app/(site)/boeken/page.jsx`, `website/lib/email.js`, `website/lib/discounts.js`

### G2-4 — Homepage boven de vouw: prijs onleesbaar, locatie afwezig, groepsprijs onuitgesproken

Chips op minstens text-white/85 zetten (nu wit-60% over bewegende video, en dat is de enige prijsvermelding boven de vouw). Eén chip vervangen door 'Sint-Amandsberg, Gent · gratis parking' met link naar /degym (zet daar eerst id='locatie' als je het anker wil), en de chip '1 tot 4 personen' vervangen door de zaal-framing '€ 15 voor de hele zaal — ook met z'n vieren'. Zet 'in Gent' in de H1.

Bestanden: `website/app/(site)/page.jsx`, `website/app/(site)/degym/page.jsx`

### G2-5 — Homepagestructuur: prijs staat pas als achtste sectie, en de stats-band herhaalt de hero

Schrap de 'Fittin in cijfers'-band (die levert exact de chip-rij van twee schermen hoger onder een kop die tractie belooft) en verplaats de prijssectie naar direct na 'Zo begin je'. Werk in dezelfde ronde vier tekstjes bij: prijskaart 'Vanaf 1 uur — langer kan ook (1u30 tot 4u)', stap 3 eerlijk over de deurcode ±5 min vooraf, meta-description mét het gratis eerste uur, en 'Ontmoet onze coaches' naar /coaches. Netto één sectie minder.

Bestanden: `website/app/(site)/page.jsx`, `website/app/(site)/huisregels/page.jsx`

### G2-6 — Alles onder de hero rendert op opacity:0 en wordt pas zichtbaar via JavaScript

Draai de logica om: .reveal standaard zichtbaar, en de verborgen starttoestand pas onder een klasse die JS zelf zet (html.js .reveal). Geef intussen de hero-chips eager mee. Bij een chunk-laadfout — die deze site aantoonbaar kent — ziet de bezoeker nu een hero met duizenden pixels leegte eronder, inclusief prijzen en boekknoppen.

Bestanden: `website/app/globals.css`, `website/components/anim/Reveal.jsx`, `website/app/(site)/page.jsx`

### G2-7 — Op mobiel staat het uurrooster een volledig scherm diep, achter een keuze uit één optie

Render de kaart 'Kies je sessie' alleen wanneer services.length > 1 (er is in de praktijk altijd precies één dienst, de code anticipeert er zelfs op) en zet Card op p-5 sm:p-7 zodat mobiel 24px inhoudsbreedte vrijkomt. Hernummer de stappen. serviceId wordt al bij mount gezet, dus de flow blijft intact. Dit haalt UI weg.

Bestanden: `website/components/booking/BookingClient.jsx`, `website/app/(site)/boeken/page.jsx`

### G2-8 — Een moment uit week 2 verdwijnt zonder melding nadat de gast een account maakt

Leid weekOffset af uit de datum in de deeplink vóór de days-match (gasten mogen tot week 2 bladeren, maar het herstel kijkt enkel in de huidige week), en toon bij een niet meer boekbaar slot één regel in de bestaande foutzone: 'Dat moment is net weg — kies gerust een ander.'

Bestanden: `website/components/booking/BookingClient.jsx`

### G2-9 — De loginmuur op de laatste stap wordt nergens verklaard

De bestaande regel over verplaatsen aanvullen met 'Een account is nodig om je deurcode te sturen — 30 seconden, geen betaalgegevens.' Eén bestaande tekstregel, geen element erbij.

Bestanden: `website/components/booking/BookingClient.jsx`

### G2-10 — Install-banner overvalt de koude bezoeker en dekt de navigatie af

Sluit in-app browsers uit (Instagram/FBAN/FBAV matchen nu op de iOS-detectie terwijl daar geen 'Zet op beginscherm' bestaat) en vuur niet op de eerste pageview — alleen op ingelogde routes of bij een terugkerend bezoek. Verplaats de banner NIET naar bottom-[4.75rem]: daar staat de bevestigbalk van de boekflow.

Bestanden: `website/components/PWAInstallPrompt.jsx`, `website/app/layout.jsx`

## Golf 3 — Personal training: van nul leads naar een werkende route

_Prioriteit 3 (meer proeftrainingen) en meteen het hardste cijfer uit de audit: nul PT-intakes in inbound_emails sinds het formulier op 2 juli online ging. Het formulier werkt perfect — het is alleen vanaf geen enkele coachpagina bereikbaar, en de coachpagina's zijn de warmste leads van de site. PT is bovendien de duurste dienst (€ 60/u)._

| id | wat | effort | impact |
|---|---|---|---|
| G3-1 | Coachpagina's zijn losgekoppeld van de enige PT-conversieroute | S | hoog |
| G3-2 | Het intakeformulier vraagt niet met wie, welke formule of wanneer — en bevestigt alleen met een toast van 4,2 s | S | hoog |
| G3-3 | Eén publieke coach onder een tekst die keuze belooft, in een raster van drie | M | hoog |
| G3-4 | Op mobiel staat de PT-aanvraagknop ver onder de vouw | S | hoog |
| G3-5 | Nergens staat hoe lang de proeftraining duurt, wat je meebrengt of dat er geen bankkaart nodig is | S | hoog |
| G3-6 | De SEO-omschrijving van /coaches belooft rechtstreeks boeken, wat bewust uit staat | S | midden |
| G3-7 | 'Verbind met deze coach' stuurt alleen een belletje in de app, geen mail | S | midden |
| G3-8 | Coachprofiel toont zes keer 'Voormiddag · 06:00–23:00' — dat zijn de openingsuren, niet een agenda | S | midden |
| G3-9 | Coaches vullen PT-tarieven in die nergens getoond worden, en kunnen via 'Extra prijsinfo' publiek prijzen lekken | S | midden |
| G3-10 | 1-op-1, 1-op-2 en 1-op-3 zijn drie identieke kaarten | S | midden |
| G3-11 | Beeld op de PT-pagina: de duurste dienst verkoopt een mens en een plek zonder één foto | M | midden |
| G3-12 | 'Gecertificeerde coaches' wordt geclaimd maar nergens onderbouwd | S | laag |

### G3-1 — Coachpagina's zijn losgekoppeld van de enige PT-conversieroute

Vervang op /coaches/[id] de knop 'Boek een sessie / Maak een account om te boeken' (die naar /boeken gaat, waar de pt-dienst bewust weggefilterd is) door 'Gratis proeftraining met {voornaam}' naar /personal-training?coach={slug}#intake — let op de volgorde: querystring vóór het fragment, anders bereikt de parameter de server nooit. Zet dezelfde link één keer onderaan /coaches, ook in de niet-lege staat. Dit is een vervanging: er staat daarna één CTA minder.

Bestanden: `website/app/(site)/coaches/[id]/page.jsx`, `website/app/(site)/coaches/page.jsx`, `website/app/(site)/personal-training/page.jsx`, `website/app/(site)/page.jsx`

### G3-2 — Het intakeformulier vraagt niet met wie, welke formule of wanneer — en bevestigt alleen met een toast van 4,2 s

Vier wijzigingen in één formulier: (1) zichtbare select 'Formule (1-op-1 / duo / trio / weet ik nog niet)'; (2) VERBORGEN coachveld gevuld uit ?coach= (leeg = onzichtbaar; toon de coachkeuze pas zichtbaar bij 2+ publieke coaches); (3) optioneel veld 'Wanneer kan je meestal?'; (4) bij succes de inhoud van de bestaande kaart vervangen door een inline bevestiging ('je krijgt meteen een bevestigingsmail; we mailen je binnen 1 werkdag'). Neem alles mee in de eigenaarsmail. Voeg de /privacy-link toe in de bestaande zin eronder én in hulp/HelpForm.jsx, en haal 'na blessure' uit de placeholder.

Bestanden: `website/app/(site)/personal-training/page.jsx`, `website/app/(site)/personal-training/actions.js`, `website/app/(site)/hulp/HelpForm.jsx`, `website/components/ui/ActionForm.jsx`

### G3-3 — Eén publieke coach onder een tekst die keuze belooft, in een raster van drie

Eigenaarsactie: zet bestaande coachprofielen publiek en laat ze foto/specialiteit/bio invullen (Jean Francois Dujardyn en Achilius Batius hebben al gegevens; Yoshe Willems en Billy Den Haese bestaan nog niet als profiel). Codegarantie erbij: kop, introtekst en kolomaantal afhankelijk maken van coaches.length, zodat er nooit twee gaten naast één kaart staan.

Bestanden: `website/app/(site)/personal-training/page.jsx`, `website/app/(site)/coaches/page.jsx`, `website/app/sitemap.js`

### G3-4 — Op mobiel staat de PT-aanvraagknop ver onder de vouw

Kopieer het patroon dat de homepage al bewust toepast: py-14 sm:py-24 op de hero, text-3xl sm:text-4xl md:text-5xl op de H1, text-base sm:text-lg op de intro, en zet alleen de eerste alinea boven de knop. Doe hetzelfde op /degym. Alleen verkleinen, niets toevoegen.

Bestanden: `website/app/(site)/personal-training/page.jsx`, `website/app/(site)/degym/page.jsx`, `website/app/(site)/page.jsx`

### G3-5 — Nergens staat hoe lang de proeftraining duurt, wat je meebrengt of dat er geen bankkaart nodig is

Herschrijf stap 1 tot drie feiten (±60 minuten · sportkledij en drinkbus volstaan · je moet niets kunnen), vul het FAQ-antwoord 'is het echt gratis' aan met 'geen bankkaart, geen abonnement', voeg één FAQ-item 'Wat breng ik mee?' toe met de tekst die al in het coachdashboard staat, en zet in het formulierintro of je mail of telefoon krijgt. Voeg op /hulp twee items toe voor wie nog géén klant is, en corrigeer op /huisregels 'Je betaalt meteen' (klopt niet voor de gratis sessie).

Bestanden: `website/app/(site)/personal-training/page.jsx`, `website/app/(site)/hulp/page.jsx`, `website/app/(site)/huisregels/page.jsx`, `website/app/coach/page.jsx`

### G3-6 — De SEO-omschrijving van /coaches belooft rechtstreeks boeken, wat bewust uit staat

Description en introtekst herschrijven naar de werkelijke route ('vraag een gratis intake aan'). Zuivere tekstwijziging die verkeerd verkeer met transactie-intentie wegneemt.

Bestanden: `website/app/(site)/coaches/page.jsx`

### G3-7 — 'Verbind met deze coach' stuurt alleen een belletje in de app, geen mail

In clientRequestCoach dezelfde mail-helper aanroepen die de intake al gebruikt, met de coach als ontvanger en reply-to op het lid. Minimaal: de wachttekst eerlijk maken ('hoor je binnen 2 dagen niets, mail info@fittin.be').

Bestanden: `website/app/(site)/account/actions.js`, `website/lib/notify.js`, `website/app/(site)/coaches/[id]/page.jsx`

### G3-8 — Coachprofiel toont zes keer 'Voormiddag · 06:00–23:00' — dat zijn de openingsuren, niet een agenda

Label het blok op zijn dekking in plaats van op het startuur (toon gewoon het bereik wanneer het meer dan één dagdeel beslaat) en zet er één regel onder: 'Ander moment nodig? Vraag het bij je gratis intake' met de intakelink. Signaleer aan de eigenaar dat coaches hun echte beschikbaarheid moeten invullen.

Bestanden: `website/app/(site)/coaches/[id]/page.jsx`

### G3-9 — Coaches vullen PT-tarieven in die nergens getoond worden, en kunnen via 'Extra prijsinfo' publiek prijzen lekken

Twee labels en één placeholder: de helptekst bij de tariefvelden eerlijk maken ('deze tarieven zijn intern — prijzen staan bewust op aanvraag'), het vrije veld hernoemen naar 'Extra info over je aanpak — geen prijzen' met een placeholder zonder bedragen, en op het publieke profiel de kop 'Prijzen' vervangen door 'Goed om te weten'. Raak BookingClient niet aan: de PT-tak moet blijven werken als de eigenaar boeken ooit weer aanzet.

Bestanden: `website/app/coach/profiel/page.jsx`, `website/app/(site)/coaches/[id]/page.jsx`

### G3-10 — 1-op-1, 1-op-2 en 1-op-3 zijn drie identieke kaarten

Vervang het identieke streepje door 1, 2 of 3 gevulde vormpjes en zet in elke kaart één concrete zin over wat de bezoeker zelf doet ('jij + 1 die je zelf meebrengt'). Voeg één niet-numerieke zin toe over de kost per persoon — nooit 'goedkoper', want het totaal stijgt wél; zo blijft de 'prijs op aanvraag'-lijn intact.

Bestanden: `website/app/(site)/personal-training/page.jsx`

### G3-11 — Beeld op de PT-pagina: de duurste dienst verkoopt een mens en een plek zonder één foto

Vervang in plaats van toe te voegen: zet de bestaande videoposter van de lege zaal in de hero (dat beeld ís het privacy-argument) en verkort in ruil de tweede hero-alinea; vervang de 64px-avatars door dezelfde 4:3-kaartvorm die /coaches al gebruikt. Bestaande componenten, minder tekst.

Bestanden: `website/app/(site)/personal-training/page.jsx`, `website/app/(site)/coaches/page.jsx`, `website/public/video-poster.jpg`

### G3-12 — 'Gecertificeerde coaches' wordt geclaimd maar nergens onderbouwd

Ofwel de claim onderbouwen zonder schemawijziging (opleiding als eerste regel van coach_bio), ofwel op de homepage 'gecertificeerde' vervangen door het veiligere 'ervaren' dat de PT-pagina al gebruikt. Dit vult meteen een stukje van de ontbrekende social proof — zonder iets te verzinnen.

Bestanden: `website/app/(site)/page.jsx`, `website/app/(site)/personal-training/page.jsx`, `website/app/(site)/coaches/[id]/page.jsx`

## Golf 4 — Prijzen die kloppen en overtuigen

_Prioriteit 4 (conversie). De prijzenpagina is het beslispunt en verzwijgt vandaag het gratis eerste uur, maakt de drie formules onvergelijkbaar, verkoopt twee abo-voordelen die niet bestaan en heeft een betaalknop met een hardgecodeerd bedrag naast een prijs uit de database. Dat laatste is ook juridisch (art. VI.46 §2 WER en art. VI.97 WER) en raakt de staande regel 'nooit iets verzinnen'._

| id | wat | effort | impact |
|---|---|---|---|
| G4-1 | Abo-knop zegt hardgecodeerd '€ 12/maand' terwijl Stripe de DB-prijs aanrekent | S | hoog |
| G4-2 | Prijzenpagina: gratis uur ontbreekt, formules zijn onvergelijkbaar, personen-regel is verwarrend | S | hoog |
| G4-3 | Het abonnement adverteert voordelen die niet bestaan; het enige gebouwde voordeel wordt verzwegen | S | hoog |
| G4-4 | Beheerschermen kunnen prijzen tonen die de site tegenspreekt | S | midden |
| G4-5 | € 15 en € 12 staan hardgecodeerd op zes pagina's; de ledenprijs is in het beheer zelfs onzichtbaar | M | midden |
| G4-6 | Eén pagina heet drie dingen, en de abo-sessie heet 'beurtenkaart' | S | laag |
| G4-7 | De vergelijkingstabel is op mobiel een zijwaartse scroller | S | laag |

### G4-1 — Abo-knop zegt hardgecodeerd '€ 12/maand' terwijl Stripe de DB-prijs aanrekent

Laat de knoptekst en de bullet 'ledenprijs € 12' de prijs uit p.price_cents renderen, precies zoals de kaart-knop ernaast al doet. Vervang in /beheer/pakketten de onjuiste zin 'abonnementen gebruiken een vaste Stripe-prijs (prijs hier is informatief)' door de waarheid, en verwijder de dode stripe_price_id-waarschuwing.

Bestanden: `website/app/(site)/lidmaatschap/page.jsx`, `website/app/(site)/lidmaatschap/actions.js`, `website/app/beheer/pakketten/page.jsx`, `website/app/beheer/actions.js`

### G4-2 — Prijzenpagina: gratis uur ontbreekt, formules zijn onvergelijkbaar, personen-regel is verwarrend

Vier tekstingrepen in één bestand: (1) één zin in de bestaande intro 'Je eerste uur is sowieso gratis'; (2) kolom 'Per sessie' in de bestaande tabel (€ 15 · ±€ 13,64 · € 12) zodat de claim 'beste prijs per sessie' voor het eerst controleerbaar is; (3) de personen-regel uit de drie kaarten halen en vervangen door één zin boven het drieluik ('elke prijs geldt voor de hele zaal, 1 tot 4 personen') — netto twee opsommingsregels minder; (4) '1 beurt = 1 uur (2 uur boeken kost 2 beurten)' bij de kaart en 'per uur' bij de losse sessie.

Bestanden: `website/app/(site)/lidmaatschap/page.jsx`, `website/lib/insight-mails.js`, `website/supabase/migrations/0117_halfhour_sessions.sql`

### G4-3 — Het abonnement adverteert voordelen die niet bestaan; het enige gebouwde voordeel wordt verzwegen

'Voorrang bij events & member-acties' en 'voorrang bij piekuren' schrappen op /lidmaatschap, /account en in de member-mail (geen van beide bestaat in de code) en vervangen door het bewijsbare 'Boek tot 8 weken vooruit (zonder abo: 2)'. Dwing die horizon meteen serverside af in create_booking — vandaag is het puur een UI-afspraak. Maak in dezelfde ronde de drempel consistent op drie plekken, zonder over te claimen ('vanaf één sessie per maand goedkoper — train je maanden niets, blijf dan bij losse sessies').

Bestanden: `website/app/(site)/lidmaatschap/page.jsx`, `website/app/(site)/account/page.jsx`, `website/lib/email.js`, `website/supabase/migrations/0117_halfhour_sessions.sql`, `website/app/beheer/newsletter-actions.js`

### G4-4 — Beheerschermen kunnen prijzen tonen die de site tegenspreekt

Leid de kaartbadge en de ondertitel af uit p.credits (nu staat '10 + 1 GRATIS' en '11 sessies' hardgecodeerd naast een DB-waarde), zet de geldigheidsduur als één constante die pagina én grantCredits gebruiken, en maak het veld 'Sessies' bij een abonnement read-only óf laat de webhook pkg.credits gebruiken in plaats van hardgecodeerd 1.

Bestanden: `website/app/(site)/lidmaatschap/page.jsx`, `website/app/beheer/pakketten/page.jsx`, `website/app/api/stripe/webhook/route.js`

### G4-5 — € 15 en € 12 staan hardgecodeerd op zes pagina's; de ledenprijs is in het beheer zelfs onzichtbaar

Laat /lidmaatschap de losse prijs en de ledenprijs uit services lezen (getServicesCached bestaat al) en toon member_price_cents als veld in /beheer/diensten — dat veld komt vandaag in géén enkel beheerscherm voor, terwijl het de kern van de abo-belofte is. Voor de redactionele pagina's volstaat één gedeelde constante of een checklist in CLAUDE.md.

Bestanden: `website/app/(site)/lidmaatschap/page.jsx`, `website/app/beheer/diensten/page.jsx`, `website/app/beheer/actions.js`, `website/lib/cache.js`

### G4-6 — Eén pagina heet drie dingen, en de abo-sessie heet 'beurtenkaart'

Nav, footer en H1 gelijktrekken op 'Prijzen' (URL laten staan, die is geïndexeerd), en in de boekflow 'Betaal met je beurtenkaart' vervangen door 'Betaal met je sessietegoed' — de beheerkant gebruikt die neutrale term al, want de abo-sessie komt in hetzelfde grootboek terecht.

Bestanden: `website/components/Nav.jsx`, `website/components/Footer.jsx`, `website/app/(site)/lidmaatschap/page.jsx`, `website/components/booking/BookingClient.jsx`

### G4-7 — De vergelijkingstabel is op mobiel een zijwaartse scroller

hidden sm:block op de wrapper: op de telefoon doen de drie kaarten en de adviesalinea het werk al. Minder UI, niet meer.

Bestanden: `website/app/(site)/lidmaatschap/page.jsx`

## Golf 5 — Meten wat werkt

_Vanaf hier stopt het raden. Twee cijfers zijn vandaag aantoonbaar fout (de coachpagina's worden door een prefix-bug volledig uit de meting gefilterd, en funnel-events tellen mee als paginaweergaves) en het hoofdconversiedoel — hoeveel proeftrainingen, hoeveel accounts — wordt nergens geteld. Alles hier is onzichtbare meetcode of één kaart op een bestaande beheerpagina, geen nieuwe dashboards._

| id | wat | effort | impact |
|---|---|---|---|
| G5-1 | /coaches en elk coachprofiel worden door een prefix-fout dubbel uit de statistieken gegooid | S | hoog |
| G5-2 | Funnel-events tellen mee als paginaweergaves — /boeken en 'weergaves per bezoeker' zijn opgeblazen | S | hoog |
| G5-3 | De grootste uitvalstap (account maken) en het hoofddoel (proeftraining) worden niet geteld | M | hoog |
| G5-4 | Drie leesfuncties voor trechter en campagnes bestaan al, maar geen enkele pagina roept ze aan | S | hoog |
| G5-5 | Het gratis eerste uur heeft geen enkel geaggregeerd cijfer, en de bestaande funnel telt personeel mee | M | midden |
| G5-6 | Het wekelijkse eigenaarsrapport bevat geen enkel verkeers- of trechtercijfer | S | laag |
| G5-7 | UTM-labels overleven de landingspagina niet | M | laag |

### G5-1 — /coaches en elk coachprofiel worden door een prefix-fout dubbel uit de statistieken gegooid

Vervang op beide plekken startsWith('/coach') door een exacte segmenttest (path === '/coach' || path.startsWith('/coach/')), idem voor /beheer. Twee regels. Zonder dit lijkt het alsof niemand de PT-verkooppagina's bezoekt.

Bestanden: `website/components/analytics/PageView.jsx`, `website/app/api/pv/route.js`

### G5-2 — Funnel-events tellen mee als paginaweergaves — /boeken en 'weergaves per bezoeker' zijn opgeblazen

'and event is null' toevoegen aan pv_summary, pv_daily, pv_top_paths en pv_top_referrers (create or replace, geen datamigratie). booking_slot_chosen vuurt bij élke slottik, dus /boeken staat kunstmatig bovenaan en verbergt hoe weinig verkeer /degym, /personal-training en /lidmaatschap krijgen.

Bestanden: `website/supabase/migrations/0082_page_views.sql`, `website/supabase/migrations/0101_site_events.sql`, `website/app/beheer/verkeer/page.jsx`

### G5-3 — De grootste uitvalstap (account maken) en het hoofddoel (proeftraining) worden niet geteld

Vuur signup_completed af (staat al op de whitelist maar wordt nergens aangeroepen), voeg intake_requested, booking_completed en één home_cta_click/signup_cta_clicked toe aan de whitelist en aan de twee gast-CTA's, de hero-knoppen en de kaart-/abo-koopknop op /lidmaatschap. Zonder zichtbare UI. checkout_started blijft een 'poging' — booking_completed geeft het de noemer.

Bestanden: `website/app/api/pv/route.js`, `website/components/booking/BookingClient.jsx`, `website/components/auth/LoginForm.jsx`, `website/app/(site)/personal-training/actions.js`, `website/app/(site)/lidmaatschap/page.jsx`

### G5-4 — Drie leesfuncties voor trechter en campagnes bestaan al, maar geen enkele pagina roept ze aan

Eén extra kaart op de bestaande /beheer/verkeer met twee rijen: de trechter (bezoekers op /boeken via pv_path_visitors → slot gekozen → checkout gestart, met uitval per stap) en een campagnetabel uit pv_campaigns die alleen verschijnt als er UTM-data is. Zet er de drie referralgetallen bij (gedeeld / aangemeld met code / beloond). Geen migraties nodig, de indexen staan al klaar.

Bestanden: `website/app/beheer/verkeer/page.jsx`, `website/supabase/migrations/0101_site_events.sql`

### G5-5 — Het gratis eerste uur heeft geen enkel geaggregeerd cijfer, en de bestaande funnel telt personeel mee

Voeg aan de bestaande funnel-kaart op /beheer/analytics twee stappen toe ('Gratis sessie gebruikt', 'Tweede sessie betaald' — beide af te leiden uit profiles.welcome_code_used en bookings, geen nieuwe tracking). Fix in dezelfde beurt: filter bookedRepeat en activeMemberships op dezelfde lids-set als stap 2 (nu kan de trechter breder worden naarmate hij dieper gaat), hernoem de KPI 'Actieve leden' naar 'Accounts' en bereken ARPU over wie deze maand effectief betaalde.

Bestanden: `website/app/beheer/analytics/page.jsx`, `website/app/beheer/leden/page.jsx`

### G5-6 — Het wekelijkse eigenaarsrapport bevat geen enkel verkeers- of trechtercijfer

Twee regels aan het bestaande rapport: 'X bezoekers deze week (±% t.o.v. vorige), Y kozen een moment, Z rondden af' plus de sterkste herkomstbron. Geen nieuwe mail, geen nieuw dashboard — automatiseren in plaats van een actiepunt.

Bestanden: `website/lib/weekreport.js`, `website/vercel.json`

### G5-7 — UTM-labels overleven de landingspagina niet

Geef track() dezelfde readUtm()-spread als PageView, zodat events binnen dezelfde landing gelabeld zijn, en breid pv_campaigns uit met een intentiekolom (bezoekers met booking_slot_chosen of checkout_started op dezelfde dag en dezelfde bron). Verkoop dit intern als same-day-attributie: de bezoeker-hash roteert bewust dagelijks en die cookieloze keuze blijft.

Bestanden: `website/lib/track.js`, `website/components/analytics/PageView.jsx`, `website/supabase/migrations/0101_site_events.sql`

## Golf 6 — Leden terugbrengen

_Een tweede boeking is goedkoper dan een nieuwe klant, en de hele retentie-infrastructuur (mails, drips, wachtlijst, referral, notificaties) is al gebouwd — ze staat alleen deels uit, meet op de verkeerde bron of is onvindbaar. Begint met de dubbele abo-kaart, letterlijk de goedkoopste en meest zichtbare fix van het hele plan._

| id | wat | effort | impact |
|---|---|---|---|
| G6-1 | De abo-nudge staat twee keer identiek onder elkaar op /account | S | hoog |
| G6-2 | Lege agenda zegt tegen terugkerende leden dat ze 'nog geen sessies' boekten | S | hoog |
| G6-3 | De at-risk-lijst meet 'laatste bezoek' via de deurknop, niet via de keypadcode | M | hoog |
| G6-4 | Er vertrekt geen enkele automatische comeback-mail | M | hoog |
| G6-5 | Een lid krijgt geen actiegericht signaal wanneer zijn beurtenkaart op is | M | hoog |
| G6-6 | De referral-uitnodiging is voor de meeste leden onvindbaar, en de aanbrenger krijgt alleen een punt | M | hoog |
| G6-7 | Het bevestigingsscherm na een gratis of tegoed-boeking is een doodlopend straatje | S | midden |
| G6-8 | Bevestigingsmail bevat geen agenda-item terwijl de ICS-generator klaarstaat | S | midden |
| G6-9 | Meegenodigde buddies en gasten krijgen geen dag-vooraf-herinnering | S | midden |
| G6-10 | Twee gebouwde functies werken stil niet door een ontbrekend kolomrecht | S | midden |
| G6-11 | Segment 'Sessies bijna op' rekent met een saldo dat vervallen beurten meetelt | S | midden |
| G6-12 | Geschiedenis op /account staat niet op datum, dus 'Boek opnieuw' wijst niet naar de laatste sessie | S | laag |
| G6-13 | Tijdkritische momenten leunen volledig op e-mail (geen push) | L | laag |

### G6-1 — De abo-nudge staat twee keer identiek onder elkaar op /account

Verwijder het tweede blok (dezelfde conditie, dezelfde rekensom, dezelfde knop; enkel 'voordeliger' vs 'goedkoper' verschilt). Zuiver schrappen — precies de declutter-regel, op de pagina waar een lid na een betaling landt.

Bestanden: `website/app/(site)/account/page.jsx`

### G6-2 — Lege agenda zegt tegen terugkerende leden dat ze 'nog geen sessies' boekten

Splits de lege staat: nieuw lid houdt de huidige tekst, lid met geschiedenis krijgt 'Je laatste sessie was [dag] om [uur]. Zelfde moment volgende week?' met de bestaande rebookHref. Dezelfde kaart, andere inhoud — en het is het belangrijkste herhaalboek-moment van het product.

Bestanden: `website/app/(site)/account/page.jsx`

### G6-3 — De at-risk-lijst meet 'laatste bezoek' via de deurknop, niet via de keypadcode

Gebruik voor 'laatste bezoek' dezelfde bron als de rest van de app (laatste bevestigde boeking in het verleden) en toon door_log hoogstens als extra kolom — wie met de persoonlijke code binnenkomt laat nu geen spoor na en staat dus bovenaan de at-risk-lijst met een comeback-knop ernaast. Laat de bulkknop dezelfde set berekenen als de lijst toont en sluit leden met 0 sessies uit (die horen in de onboarding-reeks).

Bestanden: `website/app/beheer/leden/page.jsx`, `website/components/admin/MembersTable.jsx`, `website/app/beheer/insight-actions.js`

### G6-4 — Er vertrekt geen enkele automatische comeback-mail

Bouw niets nieuws: zet één activatiecampagne standaard actief (segment inactive, 21 dagen, cooldown 45 dagen, géén gratis sessie erbij) óf laat de dagelijkse cron de bestaande comeback-reeks starten voor leden die 30 dagen niet boekten. De engine, de segmenten en de reeksen bestaan allemaal — de snelstart-sjablonen worden alleen als 'draft' weggeschreven.

Bestanden: `website/lib/activation.js`, `website/app/beheer/activation-actions.js`, `website/app/api/cron/activation/route.js`, `website/lib/insight-mails.js`

### G6-5 — Een lid krijgt geen actiegericht signaal wanneer zijn beurtenkaart op is

Maak de saldoregel in de bevestigingsmail actiegericht wanneer het saldo 0 bereikt (één zin + link naar /lidmaatschap; fix meteen dat een half tegoed vandaag helemaal niets toont door de Number.isInteger-check) en stuur bij de overgang 1→0 één mail + belletje via dezelfde lijn als sendCreditsExpiring. Dit is het moment met de hoogste koopintentie van de hele levenscyclus.

Bestanden: `website/lib/email.js`, `website/lib/reminders.js`, `website/app/(site)/account/page.jsx`

### G6-6 — De referral-uitnodiging is voor de meeste leden onvindbaar, en de aanbrenger krijgt alleen een punt

Haal ShareReferral uit de betaald=1-conditie op /account en toon hem één keer onder 'Aankomende boekingen', plus op het boekingsbevestigingsscherm — kaart-, abo- en gratis-boekers zien de deelknop vandaag nooit. Géén zesde tab. Leg de eigenaar daarnaast één beloningskeuze voor: aanbrenger krijgt 1 tegoed bij de eerste betaling van de vriend, óf € 5 korting — vandaag zit alle waarde (± € 30 aan gratis uren) bij de ontvanger.

Bestanden: `website/app/(site)/account/page.jsx`, `website/components/ShareReferral.jsx`, `website/components/booking/BookingClient.jsx`, `website/supabase/migrations/0057_data_integrity.sql`

### G6-7 — Het bevestigingsscherm na een gratis of tegoed-boeking is een doodlopend straatje

Voeg onder de bestaande regel één zin toe ('Je bevestiging staat in je mailbox. Je deurcode komt automatisch ± 5 min voor je sessie — verplaatsen kan tot 6u vooraf') en hergebruik de bestaande agenda- en deelknoppen. Dit is voor een nieuw lid letterlijk het eerste scherm na de allereerste boeking.

Bestanden: `website/components/booking/BookingClient.jsx`, `website/app/(site)/boeken/actions.js`, `website/components/booking/DoorCodeCard.jsx`

### G6-8 — Bevestigingsmail bevat geen agenda-item terwijl de ICS-generator klaarstaat

Hang het ICS-bestand als Resend-bijlage aan sendBookingConfirmation en aan de herinneringsmail. Dezelfde generator, geen auth-probleem (de route vereist nu een cookie-sessie), geen extra knop in de UI. Een sessie met alarm in de agenda verlaagt no-shows.

Bestanden: `website/lib/email.js`, `website/app/api/ics/[bookingId]/route.js`

### G6-9 — Meegenodigde buddies en gasten krijgen geen dag-vooraf-herinnering

Breid sendDueReminders uit met de deelnemers en genodigden van dezelfde boeking, met een kortere tekst en dezelfde reminder_sent-guard per ontvanger. De gast-opvolgmail ná de sessie bestaat al — alleen de kans dat de gast opdaagt wordt niet beschermd.

Bestanden: `website/lib/reminders.js`, `website/lib/booking-invites.js`

### G6-10 — Twee gebouwde functies werken stil niet door een ontbrekend kolomrecht

Sinds 0015 heeft elke profiles-kolom die een lid zelf zet een expliciete grant nodig: 'grant update (training_visible_to_buddies) on profiles to authenticated' — zonder dat kan de privacyschakelaar nooit slagen en geeft /api/me/duo structureel een lege lijst. Laat series_id op bookings schrijven door de admin-client die twee regels verderop al gebruikt wordt (in plaats van bookings opnieuw schrijfbaar te maken), en vervang de lege catch door een console.error; nu kan een coach een reeks van 26 sessies niet in één keer afzeggen.

Bestanden: `website/supabase/migrations/0131_exercise_loop.sql`, `website/app/(site)/oefeningen/loop-actions.js`, `website/app/coach/actions.js`, `website/supabase/migrations/0110_booking_series.sql`

### G6-11 — Segment 'Sessies bijna op' rekent met een saldo dat vervallen beurten meetelt

Laat member_engagement.credits public.credits_balance(p.id) gebruiken in plaats van een kale sum(delta). Een lid met een verlopen kaart valt nu buiten het segment — precies het lid dat een nieuwe kaart van € 150 zou kopen.

Bestanden: `website/supabase/migrations/0117_halfhour_sessions.sql`, `website/lib/activation.js`

### G6-12 — Geschiedenis op /account staat niet op datum, dus 'Boek opnieuw' wijst niet naar de laatste sessie

Sorteer de gecombineerde lijst één keer op starts_at vóór het splitsen in upcoming/history (meegenodigde sessies belanden nu als blok vooraan) en toon standaard de laatste 10 met 'toon meer'.

Bestanden: `website/app/(site)/account/page.jsx`

### G6-13 — Tijdkritische momenten leunen volledig op e-mail (geen push)

Aparte bouwronde ná al het goedkope werk, en dan alleen voor drie gevallen: wachtlijstplek vrij, deurcode, sessie start binnen 1 uur. Geen algemeen meldingenkanaal. De PWA-infrastructuur staat er al; er is geen web-push-dependency, geen abonnementstabel.

Bestanden: `website/lib/notify.js`, `website/lib/waitlist.js`, `website/package.json`

## Golf 7 — Vindbaarheid en snelheid

_Prioriteit 6 en 7. Bewust ná de conversieronde: SEO en performance vergroten het verkeer naar pagina's die dan al goed converteren. Begint met twee S-ingrepen met bovengemiddelde opbrengst (elke gedeelde link toont vandaag het homepage-kaartje; de hero-video is 81% van het mobiele paginagewicht) en eindigt met de grote Engelstalige oefeningenbibliotheek._

| id | wat | effort | impact |
|---|---|---|---|
| G7-1 | Elke gedeelde link toont het homepage-kaartje | S | hoog |
| G7-2 | 1,19 MB hero-video laadt ook op mobiel; het footer-logo krijgt intussen hoge prioriteit | S | hoog |
| G7-3 | 885 oefeningpagina's worden per bezoek opnieuw gerenderd, terwijl de code denkt dat ze statisch zijn | S | hoog |
| G7-4 | Zeven publieke pagina's zonder canonical, waaronder /boeken met querystring-varianten | S | midden |
| G7-5 | H1's zonder zoekterm, en 885 oefeningpagina's zonder enige H1 | S | midden |
| G7-6 | De commerciële middenmoot mist alle structured data | S | midden |
| G7-7 | Lokale zoektermen ontbreken in titles: 'zonder lidgeld' en 'Sint-Amandsberg' | S | midden |
| G7-8 | Oefeningsdemo's laden als 72 KB-originelen voor thumbnails van 64 px | M | midden |
| G7-9 | /boeken en /account doen onnodig zware en seriële databankrondes | M | midden |
| G7-10 | Publieke workoutpagina's staan op force-dynamic, en /api/me wordt dubbel opgehaald | M | midden |
| G7-11 | Sitemap- en crawlhygiëne | S | laag |
| G7-12 | Cachekoppen en beeldstabiliteit | S | laag |
| G7-13 | 892 van de 913 sitemap-URL's zijn Engelstalige oefeningpagina's | L | midden |
| G7-14 | De homepage is als enige marketingpagina niet CDN-cachebaar | M | laag |

### G7-1 — Elke gedeelde link toont het homepage-kaartje

Haal title, description en url uit het openGraph-blok in de root layout en laat enkel type, locale en siteName staan — Next vult og:title/og:description dan automatisch per pagina. Exact één pagina definieert vandaag een eigen openGraph-blok, dus alle andere erven de homepagewaarden, inclusief elke gedeelde workout en elk coachprofiel. Test daarna één deellink.

Bestanden: `website/app/layout.jsx`, `website/components/ShareButton.jsx`, `website/app/(site)/calorieen-berekenen/page.jsx`

### G7-2 — 1,19 MB hero-video laadt ook op mobiel; het footer-logo krijgt intussen hoge prioriteit

Toon de video alleen vanaf md: en geef mobiel enkel de poster als <img fetchPriority="high"> (preload="none" doet niets zolang autoPlay aanstaat). Zet loading="lazy" op het footer-logo, dat React 19 nu automatisch preloadt terwijl niemand het ziet. Meet eerst welk element werkelijk LCP is vóór je een preload voor de poster toevoegt. Dit haalt UI weg op mobiel.

Bestanden: `website/app/(site)/page.jsx`, `website/components/Footer.jsx`, `website/public/video-poster.jpg`

### G7-3 — 885 oefeningpagina's worden per bezoek opnieuw gerenderd, terwijl de code denkt dat ze statisch zijn

generateStaticParams() toevoegen (de slugs staan al klaar via getExercisesCached) en in de routetabel van next build controleren dat de route als SSG staat. Live gemeten: X-Vercel-Cache MISS en 176-242 ms TTFB tegenover ~100 ms voor de wél geprerenderde lijstpagina, en elke crawl kost twee DB-queries.

Bestanden: `website/app/(site)/oefeningen/[slug]/page.jsx`, `website/lib/cache.js`, `website/components/exercises/ExerciseActions.jsx`

### G7-4 — Zeven publieke pagina's zonder canonical, waaronder /boeken met querystring-varianten

Dezelfde alternates.canonical-regel toevoegen op /boeken, /workouts, /workouts/[slug] (in generateMetadata), /huisregels, /hulp, /disclosure en /community. Bij /boeken weegt het het zwaarst: die pagina leest ?geannuleerd, ?personen en ?duur, en genereert zelf deelbare links met ?d=&h=&p=&u=.

Bestanden: `website/app/(site)/boeken/page.jsx`, `website/app/(site)/workouts/page.jsx`, `website/app/(site)/workouts/[slug]/page.jsx`, `website/app/(site)/hulp/page.jsx`

### G7-5 — H1's zonder zoekterm, en 885 oefeningpagina's zonder enige H1

PT-H1 wordt 'Personal training in Gent — je coach volgt je in de zaal én in de app' (de title zegt het al, de H1 niet). Geef ExerciseDetail een as-prop met default 'h2' en zet die op de detailroute op h1 — de speler en de modals blijven ongewijzigd, er verandert visueel niets.

Bestanden: `website/app/(site)/personal-training/page.jsx`, `website/components/exercises/ExerciseDetail.jsx`, `website/app/(site)/oefeningen/[slug]/page.jsx`

### G7-6 — De commerciële middenmoot mist alle structured data

healthClubLd + faqLd op /personal-training (zes echte FAQ-items staan er al), healthClubLd + breadcrumbs op /coaches, en op /lidmaatschap een nieuwe offerLd met de drie echte prijzen uit de database. Voeg address + areaServed toe aan personLd en zet de zaalposter als image in healthClubLd. Volledig onzichtbaar voor de bezoeker. Wees eerlijk over de verwachting: de winst zit in entiteitsherkenning, niet in sterretjes.

Bestanden: `website/lib/seo.js`, `website/app/(site)/personal-training/page.jsx`, `website/app/(site)/lidmaatschap/page.jsx`, `website/app/(site)/coaches/page.jsx`

### G7-7 — Lokale zoektermen ontbreken in titles: 'zonder lidgeld' en 'Sint-Amandsberg'

Herschrijf title en H1 van /lidmaatschap ('Prijzen — trainen zonder lidgeld in Gent' / 'Trainen zonder lidgeld') in plaats van een aparte SEO-pagina te bouwen die dezelfde tabel zou herhalen. Zet Sint-Amandsberg in de title van /degym en breid de bestaande locatie-alinea uit met twee bereikbaarheidsfeiten. Coachtitels worden '{naam} — personal trainer in Gent'.

Bestanden: `website/app/(site)/lidmaatschap/page.jsx`, `website/app/(site)/degym/page.jsx`, `website/app/(site)/coaches/[id]/page.jsx`

### G7-8 — Oefeningsdemo's laden als 72 KB-originelen voor thumbnails van 64 px

Spiegel de stills éénmalig naar Supabase Storage in twee maten (160 en 640 px, AVIF/WebP) met sharp — supabase.co staat al in remotePatterns — en laat ExerciseMedia next/image gebruiken. Winst ~90% per thumbnail, en de externe CDN-afhankelijkheid verdwijnt. Zet als tussenoplossing meteen een preconnect naar cdn.jsdelivr.net (de HTML van /oefeningen bevat 96 verwijzingen, zonder één preconnect).

Bestanden: `website/components/exercises/ExerciseMedia.jsx`, `website/scripts/import-exercises.mjs`, `website/next.config.mjs`, `website/app/layout.jsx`

### G7-9 — /boeken en /account doen onnodig zware en seriële databankrondes

Op /boeken: haal het leaderboard weg (staat al op /account) en de events-query (die modus is onbereikbaar) — dat schrapt drie queries én twee blokken onder het formulier; laat de expire-RPC parallel lopen met de zes onafhankelijke queries en keten enkel gym_taken_slots eraan. Op /account: trek de drie vergeten golven (gyms, gym_integrations, consent/subscribers) mee in de bestaande Promise.all — ze gebruiken alleen gegevens die na golf 1 al bekend zijn.

Bestanden: `website/app/(site)/boeken/page.jsx`, `website/app/(site)/account/page.jsx`

### G7-10 — Publieke workoutpagina's staan op force-dynamic, en /api/me wordt dubbel opgehaald

Splits de personalisatie van /workouts/[slug] af naar een client-eiland zodat de pagina statisch kan met revalidate 300 (test dat een ingelogd lid zijn vorige sets nog ziet). Haal bij /api/me alleen de [pathname]-dependency weg en laat Nav en BottomTabBar één fetch delen — maak de (site)-layout NIET cookie-afhankelijk, anders sneuvelt de prerender van alle marketingpagina's.

Bestanden: `website/app/(site)/workouts/[slug]/page.jsx`, `website/components/workouts/WorkoutFollow.jsx`, `website/components/BottomTabBar.jsx`, `website/components/Nav.jsx`

### G7-11 — Sitemap- en crawlhygiëne

lastModified in plaats van de genegeerde changeFrequency/priority, /hulp, /voorwaarden en /cookies toevoegen, /plannen, /community, /login en /uitschrijven disallowen in robots (/w/ NIET, die moet crawlbaar blijven voor zijn noindex), en /events uit de sitemap halen zolang geen enkele pagina ernaar linkt terwijl dezelfde events al op /boeken staan.

Bestanden: `website/app/sitemap.js`, `website/app/robots.js`, `website/app/(site)/events/page.jsx`

### G7-12 — Cachekoppen en beeldstabiliteit

Tweede headers()-regel in next.config.mjs voor de vaste media (video, poster, logo's, icons) met lange caching — mét de afspraak dat de bestandsnaam meewijzigt bij nieuwe inhoud, anders max-age=604800 met stale-while-revalidate. Zet de ongebruikte logo.avif in via <picture> (12 KB winst in het kritieke venster) of verwijder hem samen met jelle.avif na bevestiging van de eigenaar. Geef de feed- en event-beelden een vaste ratio via next/image (ze komen uit Supabase Storage, dat staat al toegelaten).

Bestanden: `website/next.config.mjs`, `website/components/community/Feed.jsx`, `website/components/booking/EventsBooking.jsx`, `website/public/logo.avif`

### G7-13 — 892 van de 913 sitemap-URL's zijn Engelstalige oefeningpagina's

Vertaal naam, instructies en tips van de ± 60-100 oefeningen die in de publieke workouts en de categoriehubs zitten — en verander daarbij NOOIT de slug, want die is de sleutel in sitemap, hubs en workoutlinks. Zet noindex op de niet-vertaalde detailpagina's en haal ze uit de sitemap (uit de sitemap halen alleen dé-indexeert niets). Bouw geen extra SEO-pagina's: de hubstructuur is prima, het probleem is de taal.

Bestanden: `website/app/sitemap.js`, `website/app/(site)/oefeningen/[slug]/page.jsx`, `website/scripts/import-exercises.mjs`

### G7-14 — De homepage is als enige marketingpagina niet CDN-cachebaar

Alleen doen als apart, los getest ingreepje en mét voormeting: de ingelogd-redirect naar een middleware die enkel op pathname '/' kijkt of er een sb-cookie bestaat (geen Supabase-oproep). Een clientside redirect geeft ingelogde leden een flits van de marketingpagina. Op een live site met echte leden is het risico op auth-cookies reëel — laat de server-redirect staan als de gemeten TTFB-winst tegenvalt.

Bestanden: `website/app/(site)/page.jsx`, `website/lib/auth.js`

## Golf 8 — Mobiele hygiëne, beveiligingshygiëne en codekwaliteit

_Prioriteit 5 en 8: het werk dat niets direct oplevert maar wel voorkomt dat het bovenstaande stukgaat of dubbel gedaan moet worden. Bewust achteraan, met de zwaarste refactor helemaal als laatste — die raakt de programmabouwer die coaches dagelijks gebruiken._

| id | wat | effort | impact |
|---|---|---|---|
| G8-1 | Beheer verwijdert oefeningen en programma's zonder bevestiging, de coach-tweeling wél | S | midden |
| G8-2 | sharp draait in productie maar staat als devDependency | S | midden |
| G8-3 | Een fout of trage klik in de (site)-routes laat de bezoeker zonder navigatie achter | S | midden |
| G8-4 | Tikdoelen onder de aanraakminima en vaste balken die elkaar overlappen | S | midden |
| G8-5 | De Google Maps-iframe spreekt de cookiepagina tegen | S | midden |
| G8-6 | Beveiligingshygiëne die 0098 en 0102 hebben overgeslagen | M | midden |
| G8-7 | Het privacybeleid belooft bewaartermijnen die niets afdwingt | M | midden |
| G8-8 | Nieuwsbriefinschrijving zonder bevestiging: iedereen kan elk adres inschrijven | M | midden |
| G8-9 | Half afgewerkte beheerschermen: zoekveld dat niet rendert, dode Events-stubs | S | laag |
| G8-10 | Opruimen: dode bestanden, dubbele componenten, eenmalige scripts | S | laag |
| G8-11 | lib/format.js wordt door 2 bestanden gebruikt terwijl 51 bestanden hun eigen euro() declareren | M | laag |
| G8-12 | Beheer- en coachpagina's zijn kopieën die uit elkaar lopen | L | laag |

### G8-1 — Beheer verwijdert oefeningen en programma's zonder bevestiging, de coach-tweeling wél

Vervang de kale <button> in /beheer/oefeningen en /beheer/programmas/[id] door de bestaande ConfirmSubmit met dezelfde teksten als de coach-versie ('De client verliest dit schema onder Training'). Eén import en twee regels per bestand; de bevestiging bestaat alleen op het klikmoment.

Bestanden: `website/app/beheer/oefeningen/page.jsx`, `website/app/beheer/programmas/[id]/page.jsx`, `website/components/ui/ConfirmSubmit.jsx`

### G8-2 — sharp draait in productie maar staat als devDependency

Verplaats 'sharp' naar dependencies. Eén regel, geen gedragswijziging — maar elke build met npm ci --omit=dev breekt vandaag stil het uploaden van event-beelden, want de module wordt op moduleniveau geïmporteerd door twee productie-server-actions.

Bestanden: `website/package.json`, `website/lib/eventmedia.js`

### G8-3 — Een fout of trage klik in de (site)-routes laat de bezoeker zonder navigatie achter

Twee bestanden: app/(site)/error.jsx (dezelfde inhoud als app/error.jsx, maar onder de layout zodat Nav, Footer en BottomTabBar blijven staan) en app/(site)/loading.jsx met de bestaande PageSkeleton — dat dekt in één keer /lidmaatschap, /coaches, /plannen, /events, /hulp en /workouts/[slug]. Beide schermen bestaan alleen tijdens een fout of een laadmoment.

Bestanden: `website/app/error.jsx`, `website/app/(site)/layout.jsx`, `website/app/(site)/boeken/loading.jsx`

### G8-4 — Tikdoelen onder de aanraakminima en vaste balken die elkaar overlappen

Hamburgerknop naar p-3 + min-h-11/min-w-11 (nu ~38x32px en op <640px de enige knop in de balk), filterchips van de oefeningenbibliotheek naar py-2.5, en op /account shrink-0 vervangen door w-full sm:w-auto text-center (meet op 360px, en neem de tweede shrink-0-knop mee). Zet de rusttimer in /training op bottom-24 md:bottom-6 zoals de publieke speler al doet, toasts op bottom-20 md:bottom-4, en de bevestigbalk md:bottom-0 zodat de lege strook op tablets verdwijnt zonder de snelle bevestigknop te verliezen.

Bestanden: `website/components/Nav.jsx`, `website/components/exercises/ExerciseLibrary.jsx`, `website/app/(site)/account/page.jsx`, `website/app/(site)/training/WorkoutPlayer.jsx`, `website/components/ui/ToastHost.jsx`, `website/components/booking/BookingClient.jsx`

### G8-5 — De Google Maps-iframe spreekt de cookiepagina tegen

Behandel dit als consistentiekwestie, niet als scrollbug: vervang de iframe op /degym door een statisch kaartbeeld dat naar dezelfde Maps-URL linkt (de 'Routebeschrijving'-knop is toch al het echte pad), óf pas de cookiepagina aan die vandaag letterlijk zegt dat er niets van Google op de site staat.

Bestanden: `website/app/(site)/degym/page.jsx`, `website/app/(site)/cookies/page.jsx`

### G8-6 — Beveiligingshygiëne die 0098 en 0102 hebben overgeslagen

Bundel in één migratie plus twee kleine codewijzigingen: gyms_update naar is_beheerder() + invoice_seq buiten bereik (een coach kan nu openingsuren en de factuurteller herschrijven); workout_feedback_insert de coach_clients-check geven die de action al doet (copy van het cpr_insert-patroon); create_booking laten controleren dat p_coach écht een coach in dezelfde gym is; programs/program_days/program_ex write-policies beperken tot eigenaar of beheerder; resolveProblemReport op requireStaff(true); de legacy iban/access_code-kolommen op gyms wegzetten plus de twee || gymRow?.iban-fallbacks weg (ze staan vandaag op null — dit is hygiëne, geen lek); IP-limiet op /api/pv; en een 300s-ouderdomscontrole in beide Resend-webhookverificaties.

Bestanden: `website/supabase/migrations/0001_init.sql`, `website/supabase/migrations/0112_workout_feedback.sql`, `website/supabase/migrations/0117_halfhour_sessions.sql`, `website/app/api/pv/route.js`, `website/app/api/resend/webhook/route.js`, `website/app/beheer/actions.js`

### G8-7 — Het privacybeleid belooft bewaartermijnen die niets afdwingt

Eén opruimstap in de bestaande dagelijkse activation-cron: page_views ouder dan 14 maanden, client_errors en door_log ouder dan 12 maanden, profielen zonder sessie in 12 maanden anonimiseren. Log het in cron_runs zoals de andere taken. Laat betalingen en facturen met rust (7-jarige boekhoudplicht, correct beschreven op de pagina). Geen nieuwe infrastructuur, geen UI.

Bestanden: `website/app/api/cron/activation/route.js`, `website/app/(site)/privacy/page.jsx`, `website/vercel.json`

### G8-8 — Nieuwsbriefinschrijving zonder bevestiging: iedereen kan elk adres inschrijven

Nieuwe inschrijvingen op 'pending' met één bevestigingsmail via het bestaande unsub_token-patroon, pas daarna 'active' en pas dan de drip. Voeg de daglimiet toe die het hulpformulier al heeft, en zorg dat de upsert een 'unsubscribed'-rij nooit terugzet op active — iemand kan vandaag ongevraagd heringeschreven worden.

Bestanden: `website/app/(site)/newsletter-actions.js`, `website/app/(site)/hulp/actions.js`, `website/lib/newsletter.js`

### G8-9 — Half afgewerkte beheerschermen: zoekveld dat niet rendert, dode Events-stubs

Render ListSearch op /beheer/abonnementen (de import en de ?q=-filterlogica staan er al, alleen de component niet — je kan nu enkel zoeken door zelf ?q= te typen). Haal het Events-item uit AdminSidebar met dezelfde motivering die CoachSidebar al gebruikt, laat de coach-notificatie 'keur goed in Events' naar een bestaande pagina wijzen, en verwijder de twee stubs plus ComingSoon.jsx.

Bestanden: `website/app/beheer/abonnementen/page.jsx`, `website/components/admin/AdminSidebar.jsx`, `website/app/coach/coaching-actions.js`, `website/app/beheer/events/page.jsx`

### G8-10 — Opruimen: dode bestanden, dubbele componenten, eenmalige scripts

Verwijder components/ui/Skeleton.jsx, components/admin/PlanSlotCell.jsx en lib/supabase/middleware.js (nul importers). Kies expliciet voor Button.jsx en EmptyState.jsx: standaard vanaf nu, of weg. Houd één PrintButton, hernoem de tweede ConfirmSubmit naar ConfirmActionButton, haal zes ongebruikte imports weg, en verplaats de ~21 eenmalige diag-/fix-/verify-scripts (waarvan meerdere met de voornaam van een echt lid) naar scripts/archief/ buiten de lint-scope — een verlopen script kan nu de deploy-poort dichtgooien.

Bestanden: `website/components/ui/Skeleton.jsx`, `website/components/admin/PlanSlotCell.jsx`, `website/lib/supabase/middleware.js`, `website/components/admin/CampaignControls.jsx`, `website/eslint.config.mjs`

### G8-11 — lib/format.js wordt door 2 bestanden gebruikt terwijl 51 bestanden hun eigen euro() declareren

Geen big-bang codemod: vervang de lokale declaraties opportunistisch, te beginnen bij de zes geldpagina's waar het NaN-risico echt is (account, account/betalingen, beheer, beheer/betalingen, beheer/leden/[id], coach/betalingen) — lib/format.js heeft een (cents || 0)-vangnet dat de lokale kopieën missen.

Bestanden: `website/lib/format.js`, `website/app/(site)/account/page.jsx`, `website/app/beheer/betalingen/page.jsx`, `website/app/beheer/leden/[id]/page.jsx`

### G8-12 — Beheer- en coachpagina's zijn kopieën die uit elkaar lopen

Laatste item van het plan, en het risicovolste: trek de gedeelde presentatie van de programma- en oefeningenpagina's naar één component die context en acties als props krijgt, zodat de twee routes dunne wrappers worden. Doe dit pas ná de ConfirmSubmit-fix (G8-1), zodat die niet meeschuift in de refactor, en bouw er tests omheen — dit raakt de bouwer die coaches dagelijks gebruiken. Extraheer bij ExercisePicker/SearchSelect alleen de gedeelde primitieven; raak de 11 bestaande SearchSelect-gebruikers niet aan.

Bestanden: `website/app/beheer/programmas/[id]/page.jsx`, `website/app/coach/programmas/[id]/page.jsx`, `website/app/beheer/oefeningen/page.jsx`, `website/components/admin/ExercisePicker.jsx`, `website/components/admin/SearchSelect.jsx`

## Botst met een bewuste keuze van de eigenaar

- DECLUTTER — de trechter- en campagnekaart op /beheer/verkeer (G5-4) voegt wél een permanent blok toe. Verantwoording: het is één kaart op een bestaande pagina (geen nieuw dashboard, geen nav-ingang), de campagnetabel is onzichtbaar zonder UTM-data, en het beantwoordt één concrete groeivraag — welke bron levert boekingen op. Zonder dit blok is elke euro advertentiebudget onmeetbaar. Dit is geen data om data, maar het is wel een uitzondering die de eigenaar moet goedkeuren.
- DECLUTTER — de kolom 'Per sessie' in de prijzentabel (G4-2) voegt een kolom toe. Verantwoording: hij maakt een claim die er al staat ('beste prijs per sessie') voor het eerst controleerbaar, en in dezelfde ingreep verdwijnen twee opsommingsregels uit de kaarten. Netto blijft het gelijk of minder.
- DECLUTTER — het intakeformulier krijgt twee velden erbij (formule-select en beschikbaarheid, G3-2). Verantwoording: het staat binnen een formulier dat de bezoeker bewust opende, niet als permanent element elders, en de coachkeuze wordt bewust een VERBORGEN veld zolang er maar één publieke coach is. Een select met één optie zou precies de rommel zijn die de regel verbiedt.
- DECLUTTER vs. WETTELIJK — dubbele opt-in op de nieuwsbrief (G8-8) voegt één stap toe aan een vandaag frictieloze inschrijving. Dat botst met 'minder stappen', maar toestemming aantoonbaar maken is een verplichting, geen UI-verfraaiing. Beslissing van de eigenaar over het moment, niet over het of.
- ANTI-HAMSTERKEUZE 0121 — het Stripe-venster van 32 minuten kan technisch niet onder 30, dus het advies om de hold te verlengen zou de bewuste keuze uit migratie 0121 (max 2 openstaande reserveringen, 15 minuten) terugdraaien. Daarom kiest G1-5 voor copy in plaats van een langere hold. Verleng de hold alleen als de eigenaar zelf op die beslissing terugkomt.
- POSITIONERING — '€ 3,75 per persoon' als hoofdclaim (G2-4) botst met het eigen verhaal 'betaal enkel voor je tijd, niet per persoon'. Daarom is de aanbeveling de zaal-framing ('€ 15 voor de hele zaal — ook met z'n vieren') en niet de prijs per kop.
- EERLIJKHEID vs. CONVERSIE — de abo-drempel van 2 naar 1 sessie per maand verlagen (G4-3) klopt rekenkundig, maar bij nul sessies in een maand betaalt het lid € 12 voor niets. De voorgestelde formulering houdt de nuance erin ('train je maanden niets, blijf dan bij losse sessies') in plaats van maximaal te claimen.
- PT BEWUST UITGESCHAKELD — geen enkel item zet coach-boeking op de publieke site weer aan. De volledige PT-tak in BookingClient blijft bestaan als dode code; dat is een bewuste keuze en geen op te ruimen restant.
- GEEN VERZONNEN SOCIAL PROOF — het advies om echte citaten op de PT-pagina en het coachprofiel te zetten is en blijft eigenaarshuiswerk (2-3 echte klanten, één zin plus voornaam). Zolang die er niet zijn, verandert er niets aan de pagina: een lege of gefabriceerde sectie is erger dan geen sectie. Hetzelfde geldt voor aggregateRating in het schema — dat er vandaag geen in staat is correct.
- NAV-SLOT /coaches — het advies om 'Coaches' uit de marketingnav te halen is NIET opgenomen: het botst met de twee pagina's die als enige op een coachnaam + Gent kunnen ranken, en met de nieuwe intakeroute uit G3-1. Herbekijk dat slot pas nadat G3-1 en G3-3 uitgevoerd zijn.
- LIVE SITE — het advies om de homepage statisch te maken via middleware (G7-14) raakt Supabase-auth-cookies op een site met echte leden. Daarom apart, met voormeting, en niet meeliftend op een copy-ronde. Idem voor het advies om de rol in de (site)-layout op te halen: dat zou de prerender van alle marketingpagina's slopen en is daarom uit G7-10 gehaald.
- OPDRACHTOMSCHRIJVING ACHTERHAALD — de pakketten Fit'60 / Fit'90 / Fit'120 bestaan niet meer in code noch database. Er is één dienst 'Privé sessie' met een duurkiezer van 1 tot 4 uur en pro-rata prijs. Bouw die pakketten niet terug.
- ASSETS — jelle.avif en logo.avif verwijderen pas ná bevestiging van de eigenaar; logo.avif is mogelijk bedoeld als lichtere variant en levert dan 12 KB winst per pagina op in plaats van een schrapping.
