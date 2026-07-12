# Fittin' — Abonnement-conversie & statistiek masterplan
*Geschreven 2026-07-12. Te bouwen met Opus 4.8, batch per batch (build + test + commit per batch, additieve migraties). Live project — nooit destructieve DB-ops.*

## Waarom dit plan
De owner ziet in `/beheer/betalingen` en `/beheer/boekingen` losse betalingen zonder context (twee legitieme boekingen leken een dubbele betaling), en wil **statistisch met abonnementen werken** én **leden zoveel mogelijk naar het abonnement duwen** — op een eerlijke manier die bij het merk past ("betaal enkel voor je tijd, géén lidgeld").

De **klaar-nu duidelijkheids-fixes** zijn al gebouwd (commit van 2026-07-12):
- Betalingen tonen nu de **sessiedatum + persons + Abo/Los/Beurtenkaart-badge** per boeking (join `payments.stripe_id → bookings.stripe_session_id`).
- Leden-tabel heeft een **Abonnement-kolom** (★ Abo · duur, "opgezegd — loopt af") + duidelijker tegoed-kolom.
- Boekingsformulier: coach-veld is nu een **opt-in "+ Coach"-toggle** i.p.v. altijd zichtbaar.

Dit plan bouwt daarop verder: van *tonen* naar *sturen*.

## Huidige situatie (live data, 2026-07-12)
- **6 actieve abonnees** (`memberships.status='actief'`), oudste sinds 24 jun 2026. MRR ≈ €72.
- **Boekingen laatste 90d per bron:** `credit` 36 · `los` 30 · `gratis_code` 18 · **`abo` 11**. → De overgrote meerderheid boekt los of via kaart; abo is nog klein → grote conversie-ruimte.
- **Abo-kandidaten nu al** (≥3 los/kaart-sessies in 60d, géén actief abo): Arne (5×), Floris Brugmans (3×), Pieter Veelaert (3×), Jeroen Vandenbroucke (3×). Deze mensen betalen structureel méér dan een abonnee.
- Nazli is het omgekeerde signaal: actief abo én ze boekt bovendien losse sessies aan €12 (abo-tarief) — correct gedrag, maar het was onzichtbaar in de UI.

## Datamodel (bestaand)
- `memberships`: `user_id, gym_id, stripe_sub_id, status('actief'…), started_at, current_period_end, cancel_at_period_end, price_id`. **Alleen huidige staat** — geen historiek → churn over tijd is nu niet meetbaar (zie S1/migratie).
- `bookings.payment_source` enum: `los | credit | abo | gratis_code`. `price_cents` = wat effectief betaald werd.
- `payments`: `kind, amount_cents, stripe_id, description, status`. `kind='abonnement'` = maandincasso; `kind='booking'` = losse/abo-sessieboeking.
- Analytics (`/beheer/analytics`) heeft al: MRR-KPI, conversie-funnel eindigend op "Abonnee", omzet/groei-trends, retentie-donut, heatmap. **Niet opnieuw bouwen** — uitbreiden.

---

## DEEL A — Statistiek: van losse betaling naar inzicht

### S1 — Abonnement-cockpit in Analytics
Nieuwe sectie "Abonnementen" op `/beheer/analytics` (of aparte tab `/beheer/analytics/abonnementen`):
- **KPI's:** actieve abo's · MRR (echt uit `memberships` × prijs, niet enkel uit laatste-30d-betalingen) · gem. abo-leeftijd (tenure) · abo-aandeel van de omzet · netto abo-groei deze maand (+nieuw −opgezegd).
- **Tenure-distributie:** staafgrafiek "hoelang zijn leden al abonnee" (0–1 / 1–3 / 3–6 / 6–12 / 12+ mnd). Beantwoordt letterlijk "hoelang iemand al abonnement heeft".
- **Omzetmix:** donut los vs beurtenkaart vs abo (uit `bookings.payment_source` + `payments.kind`), zodat de owner ziet hoeveel omzet recurring is vs transactioneel.
- **Abo-leden die tóch los boeken:** teller + lijst (zoals Nazli) — inzicht of het abo goed geprijsd is / of mensen extra sessies kopen bovenop hun inclusieve sessie.
- **Churn & opzeggingen:** aantal `cancel_at_period_end=true` (aangekondigde opzeg) + afgelopen abo's. **Vereist historiek** → migratie `membership_events` (append-only: `user_id, event('created'|'renewed'|'cancel_scheduled'|'canceled'|'reactivated'), at, meta`), gevuld vanuit de Stripe-webhook. Zonder dit is churn-over-tijd niet berekenbaar.

**Migratie (additief):** `01xx_membership_events.sql` + webhook schrijft events bij `customer.subscription.*`.

### S2 — Abo-context overal waar je een lid ziet *(deels klaar)*
De owner moet nooit hoeven raden of iemand abonnee is.
- ✅ Leden-tabel: Abonnement-kolom.
- ✅ Betalingen: Abo/Los-badge + sessiedatum.
- **Nog te doen:** lid-detail (`/beheer/leden/[id]`) → abo-blok (sinds wanneer, volgende incasso, opzegstatus, levenslange waarde = som `payments.amount_cents`). Boekingslijst (`BookingsList`) → Abo/Los-badge per rij. Coach-clientview idem.

### S3 — "Abo-kandidaten"-lijst (actielijst voor de owner)
Nieuwe view (of filter op `/beheer/activatie`): leden **zonder** actief abo die in de laatste 30/60d ≥N sessies los/kaart boekten, met de berekening *"betaalde €X los — met abo €Y — bespaart €Z/mnd"*. Eén-klik "stuur abo-voorstel" (mail, zie S5). De query bestaat al (zie Huidige situatie).

---

## DEEL B — Conversie-engine: eerlijk naar abo duwen

Leidraad: **alleen nudgen wie er écht goedkoper van wordt.** Het abo (€12/sessie, 1 inclusief) is per sessie de goedkoopste optie; iemand die ≥1×/maand komt bespaart t.o.v. los (€15) en kaart (€13,64). Nooit dark patterns — de besparing is echt, dus toon ze gewoon.

### S4 — Checkout-nudge bij een losse boeking
In de boekingsflow (`/boeken` → Stripe Checkout) en op de bevestigingspagina: als het lid geen abo heeft en dit z'n 2e+ losse sessie in 30d is → banner *"Je boekte deze maand al N sessies. Met een abonnement had je €X betaald i.p.v. €Y. Overstappen? →"* met knop naar de abo-checkout. Niet-blokkerend, één regel.

### S5 — Lifecycle-mails (Resend) — automatisch
Bestaande mail-infra hergebruiken (Resend + het bestaande e-mail-log in superadmin).
- **Kandidaat-nudge:** cron detecteert S3-kandidaten → gepersonaliseerde mail 1×, met de €-besparing en een 1-klik-link. Suppressie: max 1×/60d, respecteert unsubscribe/suppression-lijst.
- **Onboarding-nudge:** nieuw lid dat 1e sessie deed maar geen abo → dag 3 "zo werkt het abonnement".
- **Win-back:** `cancel_at_period_end=true` of net afgelopen abo → mail met terugkeer-aanbod (bv. eerste maand aan verlaagd tarief — owner beslist of dit mag).
- **Tenure-mijlpaal:** "6 maanden abonnee 🎉" — retentie/goodwill, geen upsell.

### S6 — Gepersonaliseerde upgrade-CTA in de app
- `/account` en `/lidmaatschap`: voor niet-abonnees die recent los boekten → *"Op basis van jouw N sessies zou een abonnement je €X/maand besparen."* (echte cijfers uit hun historiek).
- Voor abonnees: toon hun **besparing tot nu toe** ("je bespaarde al €X sinds je abonnee werd") → versterkt retentie.

### S7 — Retentie & eerlijke opzeg-flow
- Opzeggen mag simpel blijven (merkbelofte), maar toon bij opzeg een **pauzeer**-optie (1 maand skippen) i.p.v. enkel volledig stoppen — vaak stopt men door tijdelijke redenen.
- Bij opzeg: "je verliest je €12-tarief; losse sessies zijn weer €15" — feitelijk, geen angst.

---

## Owner-beslissingen (ingevuld met best-judgment defaults — pas aan indien gewenst)
1. **Abo-leden nudgen die tóch los boeken?** → NEE upsell (ze zijn al abonnee); wél tonen in stats als prijs-signaal. *(default)*
2. **Win-back met korting-aanbod?** → JA, eerste maand aan verlaagd tarief, max 1×/lid/jaar. *(default; owner kan uitzetten)*
3. **Nudge-frequentie?** → Max 1 abo-nudge per lid per 60 dagen, altijd unsubscribe-baar. *(default)*
4. **Drempel "kandidaat"?** → ≥3 sessies in 60d zonder abo. *(default; instelbaar)*
5. **Pauzeer-optie i.p.v. enkel opzeggen?** → JA bouwen (S7). *(default)*
6. **Churn-historiek (`membership_events` migratie + webhook)?** → JA — zonder dit geen echte churn-cijfers. *(default)*

## KPI's om succes te meten
Abo-aandeel van boekingen (nu ~12% → doel), MRR-groei, conversieratio kandidaat→abo, churn-rate, netto abo-groei/maand, gem. tenure.

## Aanbevolen bouwvolgorde (Opus 4.8)
**S2-rest → S3 → S1(+migratie) → S6 → S4 → S5 → S7.**
Eerst zichtbaarheid & actielijst (goedkoop, direct nuttig), dan de cockpit met historiek, dan de actieve conversie-touchpoints, tot slot retentie. Elke batch: additieve migratie waar nodig, build + vitest, commit, push.

## Wat NIET opnieuw bouwen
MRR-KPI + conversie-funnel + omzet/groei-trends (bestaan in Analytics), `memberships`-model, credits-ledger, Resend-mailinfra + suppressielijst + e-mail-log, en de reeds-gebouwde 2026-07-12 duidelijkheids-fixes (betalingen-badge, leden-abo-kolom, coach-toggle).
