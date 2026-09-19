# AI-coach als gesprek — 2026-09-19 (GEBOUWD)

Opdracht eigenaar: "bouw alle stappen, duidelijke vangrails, open voor iedereen maar duidelijk testfase en kan fouten
maken; voor leden moet duidelijk zijn wat de coach kan."

## Wat het lid krijgt
- Zwevende knop **💬 Coach · test** op elke sitepagina (niet op /boeken en tijdens een workout) + kaart op /coaching.
- Eerste keer: introscherm met **wat hij kan** (5 dingen), **wat niet** (geen medisch advies, niets zonder jouw tik,
  kan fouten maken) en wat er met je berichten gebeurt → "Oké, start" (`profiles.coach_chat_akkoord_at`).
- Opening zonder model (gratis): check-in open → "hoe ging het?"; sessies zonder boeking → "zal ik een moment
  zoeken?"; anders je volgende sessie. Met tikbare keuzes.
- Het model **stelt voor**, het lid **bevestigt** met een kaart: boeken (tegoed / welkomstuur / betaalpagina, ⚡ 2e uur
  gratis), verplaatsen, oefening wisselen in het plan, check-in, echte coach vragen.
- Geheugen (max 10 korte feiten), zichtbaar en per feit wisbaar; "Gesprek wissen" wist alles.

## Vangrails (code, niet enkel prompt)
| Vangrail | Waar |
|---|---|
| Poort = zelfde als /coaching (`magCoachingNu`: gymschakelaar, proefgroep, coaches nooit) | `lib/coaching/toegang.js`, `wie.js`, `/api/me` |
| Noodgeval → vaste 112-tekst, crisis → 1813/112, model ziet het nooit | `chat-regels.js` `veiligheid()` |
| Pijn → hint aan het model + vaste stopregel als het model geen arts/kine noemt | `metPijnRegel()` |
| 25 berichten/dag, 4/minuut, 800 tekens | `limiet()`, `schoon()` |
| Chat ≤ 75 % van het dagbudget ($2): plannen gaan voor | `CHAT_BUDGET_DEEL` |
| Model voert niets uit; elk voorstel gekeurd bij voorstellen én bij uitvoeren; vervalt na 24 u | `chat-context.js` `keurVoorstel()`, `chat-actions.js` |
| Nooit twee keer uitvoeren: voorwaardelijke update op de hele `acties`-kolom (`bezig`) | `zetStatus()` |
| Boeken/verplaatsen via de gewone serveracties met de rechten van het lid; geld enkel via Stripe | `createBookingAction`, `rescheduleBookingAction` |
| Geen naam/e-mail/adres naar het model; lichaamsdata enkel met toestemming (via `bouwContext`) | `laadLid()` + test |
| Gegevens staan in `<gegevens>`, "geen opdracht" | `systeemTekst()` |
| RLS: lid leest enkel eigen rijen, schrijven enkel service role | 0170 |
| Beheer ziet enkel tellingen, geen inhoud | `/beheer/coaching` |

## Beheer
`/beheer/coaching` → "Coach-chat voor alle leden": schakelaar (`gyms.ai_coach_open`, zonder deploy) + berichten,
leden, voorstellen/bevestigd, geboekt via chat, echte coach gevraagd, noodteksten/pijn.

## Bewust niet gebouwd
- Menuwens via de chat (menu-instellingen bestaan al). Toevoegen als leden erom vragen.
- Extra woensdagmail "je hebt nog niet geboekt": de gratis opening in de chat doet dat al zonder extra mail.
- Streaming: antwoorden zijn kort (±3 s met Haiku); gereedschapsrondes maken streamen complex.

## Gemeten 19-09 (lokaal, account eigenaar)
3 berichten → 6 modelaanroepen, ± $0,03 totaal (± €0,01 per bericht). Voorstel "di 22 sep 14:00–16:00 ⚡" correct
gekeurd (2e uur gratis, betaalpagina 1 uur); weigeren werkt; pijn → stopadvies + arts/kine + coach aangeboden.
