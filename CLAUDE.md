# CLAUDE.md — Fittin' project

## Wat is dit project
Fittin' (fittin.be) is een privégym in Gent (Sint-Amandsberg). We herbouwen eerst de
website, daarna bouwen we er een volledige "super app" bovenop (boeken, coach-platform,
community). Klant: Fittin' — De Wereld Draait Door VZW. Ontwikkelaar: Gaetan Jansseune —
Sidestream OÜ (sidestream.be).

## Repo-indeling
- `website/` — de nieuwe Next.js-site (Fase 1, dit is de actieve codebase)
- `docs/CONTENT.md` — alle content & data van de oude site (source of truth voor teksten)
- `docs/FUNCTIONS.md` — volledige functionele specificatie per fase (werklijst voor Claude Code)
- `Fittin_Pitch_Offerte.pptx` / `.pdf` — klantpresentatie + offerte (22 slides)
- `app_mock.png`, `dash_mock.png`, `prog_mock.png`, `cal_mock.png`, `community_mock.png` —
  UI-mockups voor de app, het coach-dashboard, de programmabouwer, de boekingskalender en
  community. Gebruik deze als designreferentie voor nieuwe schermen.

## website/ — stack & commando's
- Next.js 15 (App Router, plain JSX — nog geen TypeScript), Tailwind CSS v4 via
  `@tailwindcss/postcss`. Geen andere dependencies.
- `npm install` · `npm run dev` · `npm run build`
- Pagina's: `/` (home), `/degym`, `/personal-training`, `/boeken` (mock-boekingsflow,
  client component).
- Componenten: `components/Nav.jsx` (client, mobiel menu), `components/Footer.jsx`.

## Brand / design system
Kleuren (Tailwind-tokens in `app/globals.css` onder `@theme`):
- `brand` #22194F (indigo, primaire tekst/donkere vlakken)
- `accent` #5FDA6B (groen, knoppen & accenten) · `accentdark` #33B24A (groene tekst op wit)
- `lav` #B2ADC2 (gedempte tekst) · `paper` #F5F6FA (lichte secties) · `borderc` #E6E4F0
Font: Lato (Google Fonts-link in `app/layout.jsx`). Wordmark: "Fittin" + **groene
apostrof** (`&rsquo;`). Stijl: witte/paper achtergronden, groene pill-knoppen
(`rounded-full`), `rounded-2xl/3xl` kaarten, decoratieve groene cirkel-"blobs", alle copy
in het Nederlands (Vlaams).

## Roadmap (afgesproken met de klant)
1. **Fase 1 — website (deze repo):** nieuwe site + boeken in de app, accounts & rollen
   (lid / coach / beheerder), Stripe-betalingen, lidmaatschap + credits, Nuki-deurkoppeling
   (slot is al aanwezig; eenmalige setup €150 — app opent de deur enkel tijdens het
   geboekte slot, met logboek).
2. **Fase 2 — super app: coaching:** programmabouwer + templates, AI-programmaopzet,
   workout-logging, coach-feedback op sessies, adherence-dashboard, e-mail (Resend) + push.
3. **Fase 3 — super app: community:** referral (breng een vriend → beiden credits),
   leaderboards, challenges (beloond in credits), events/groepslessen, bezettings-heatmap +
   omzetdashboard.
Later/optioneel: Superstream Lite (AI-chatbot voor leadgeneratie), uitrol naar meerdere
gyms, voedingsmodule, Apple Health / Google Fit.

## Geplande infra
Supabase (database + auth) · Stripe (betalingen — boekingen & PT zijn "real-world
services", dus géén 15-30% Apple/Google in-app-tax) · Resend (mail) · Vercel (hosting) ·
VPS · AI-tokens. Klant betaalt €120/mnd all-in (interne infrakost ±€30/mnd). Eenmalige
bouw: vriendenprijs €1.000 (marktwaarde €6.900, zie offerte). Native iOS/Android-app is
inbegrepen in de scope; App Store-lancering kost €100 (Apple) + €25 (Google).

## Businessdata (volledige bron: docs/CONTENT.md)
- Gymsessie: **€15** · 1 uur · 1-4 personen · géén lidgeld ("betaal enkel voor je tijd")
  (was €11 in oudere docs — werkelijke prijs op de site & in de DB is €15, bevestigd 2026-06-15)
- Eerste uur gratis met code **FittinWelcome** (dienst "Fit60")
- PT: 1-op-1 €60 · 1-op-2 €35 pp · 1-op-3 €30 pp · gratis intake + proeftraining ·
  kosteloos annuleren tot 24u vooraf
- Coaches: Yoshe Willems, Jelle Vercruysse, Billy Den Haese (details in docs/CONTENT.md)
- Contact: info@fittin.be · Aannemersstraat 186, 9040 Gent · De Wereld Draait Door VZW,
  BE 0772.565.606 · Instagram @fittin_gent · facebook.com/fittingent

## Conventies & aandachtspunten
- **Multi-tenant vanaf dag één:** zet `gym_id` op elk datamodel — uitbreiding naar meerdere
  gyms is de langetermijnvisie.
- `/boeken` is nu een demo: deterministische slots in `slotState()`. Vervangen door
  Supabase-data + Stripe checkout is de eerstvolgende grote taak.
- Positionering: géén "lidgeld"-taal op de site — het goedkope abonnement (€10/mnd, 1
  sessie inclusief, goedkoper bijboeken, daluren-korting) is een toekomstige feature en
  staat in de pitch, nog niet op de site.
- Foto's van de oude site staan op de Wix-CDN (zie docs/CONTENT.md); download originelen
  bij de klant op te vragen vóór migratie.
