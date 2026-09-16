# Meerdere momenten in één keer boeken — ontwerp

Status: ONTWERP v2 — herzien na adversariële review (101 agenten, 41 bevestigde breuken). **Deel v2 onderaan is bindend
en gaat vóór v1.** Nog niet gebouwd. 13-09-2026.
Bron: kaart van zes deelsystemen + criticus (workflow `multi-boeken-begrijpen`, 7 agenten), en eigen lezing
van `0145_c-paginas.sql:49-150`, `0121_shorter_hold.sql`, `app/(site)/boeken/actions.js:104-265`,
`app/api/stripe/webhook/route.js:99-140, 266-320`.

## Doel

Een lid kiest 2 tot 8 momenten (zelfde dienst, duur en aantal personen) en legt ze in één keer vast:

- **los of abonnement** → één Stripe Checkout met één regel per sessie;
- **tegoed** → in één klik, als het saldo alle momenten dekt;
- **welkomstsessie** → geldt voor het eerste in aanmerking komende moment, de rest wordt betaald en dat staat er zo.

Een boeking van één moment blijft **exact** het bestaande pad (`createBookingAction`), met buddies en
uitnodigingen. Meerdere momenten krijgen een eigen pad. De AI-coach bouwt hier later op.

## Wat vandaag breekt als je gewoon N keer de bestaande functie aanroept

Allemaal nagekeken in de code (bestand:regel in de kaart):

1. **Refund zonder bedrag** (`beheer/actions.js:193`, `webhook:108,117`). Annuleer je één sessie van drie, dan wordt alles
   teruggestort. Daarna vuurt `charge.refunded` met `refunded=true` en annuleert `handleRefund` (`webhook:277-283`) ook de
   andere twee, zonder mail.
2. **De webhook kent één `booking_id`** (`webhook:412`). De rest van de mand wordt nooit betaald gemarkeerd, vervalt na
   15 minuten, en het geld blijft staan.
3. **De bedragcontrole wordt waardeloos** (`webhook:103`). Het mandtotaal is altijd ≥ het bedrag van één sessie.
4. **De race-guard stort de volledige payment_intent terug** (`webhook:115-120`) als één hold van de mand verliep.
5. **Geen transactie rond N aanroepen.** Faalt moment 3, dan staan 1 en 2 al vast. Bij tegoed is het tegoed dan al afgeboekt.
6. **`block_hoarding`** (`0121:59-82`) weigert de 3e onbetaalde boeking. Een mand van 3 losse sessies kan dus nooit.
7. **Welkomstsessie**: met dezelfde vlag voor elk moment wordt de 1e gratis en de rest stil aan €15 aangerekend, terwijl
   het scherm "Gratis" toont.
8. **Korting per boeking**: een eenmalige code valideert N keer. Een vast bedrag gaat N keer af. De 2e redemption faalt
   stil op de unique-index `(code_id, user_id)` terwijl `used_count` wel stijgt.
9. **Hervatten per boeking** (`boeken/actions.js:323-360`, `/account` "Afrekenen") laat de gedeelde sessie verlopen en
   rekent maar één sessie aan.
10. **Betalingen en facturen**: `sessionByStripe[...] = b` houdt één boeking bij. De factuur zegt "Boeking · Fit60 ×1 €45".
    Een deelrefund verandert niets aan `payments`.
11. **`stripe_session_id` of `series_id` als mandsleutel is onveilig.** Het lid kan `stripe_session_id` zelf schrijven
    (`0055:21`), en `series_id` wordt gebruikt door "Annuleer reeks" van de coach.

## Ontwerp

### 1. Datamodel — migratie 0163

```sql
create table booking_orders (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references gyms(id),
  user_id uuid not null references profiles(id) on delete set null,   -- (nullable voor set null)
  status text not null default 'open' check (status in ('open','betaald','verlopen','geannuleerd')),
  total_cents int not null default 0,        -- wat er aangerekend wordt, na korting
  discount_code_id uuid references discount_codes(id),
  stripe_session_id text,
  stripe_payment_intent text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
alter table bookings add column order_id uuid references booking_orders(id);
alter table payments add column order_id uuid references booking_orders(id);
alter table payments add column refunded_cents int not null default 0;
```

- RLS op `booking_orders`: SELECT enkel eigen rij of staff. **Geen enkele schrijfrechten voor `authenticated`.**
- `bookings.order_id` erft geen kolomrechten (0132 zette kolomgrants). Het lid kan zijn boeking dus niet aan een andere mand hangen.
  Nagaan met een rollback-test.

### 2. RPC `create_booking_batch` — alles of niets

```
create_booking_batch(p_service uuid, p_slots jsonb, p_persons int, p_hours numeric,
                     p_use_credit boolean, p_use_welcome boolean) returns uuid  -- order_id
```

- `security definer`, eist `auth.uid()`, 2 ≤ slots ≤ 8, geen duplicaten, en geen onderlinge overlap (anders botst hij toch
  op de exclusion constraint, maar met een duidelijke zin).
- Maakt eerst de `booking_orders`-rij, en roept daarna **binnen dezelfde transactie** per moment `create_booking` aan, met
  een nieuwe optionele parameter `p_order`. Alle checks (openingsuren, horizon, overlap, blokkade, prijs, tegoed-lock)
  blijven op één plek. **Eén raise = alles teruggedraaid**, ook het tegoed.
- **Welkom**: `p_use_welcome` gaat enkel mee met het eerste moment (chronologisch) dat fit60 en 1 uur is. `create_booking` zet
  `welcome_code_used` al binnen de transactie, dus een tweede kan niet gratis worden, ook niet parallel.
- **Tegoed**: vooraf `pg_advisory_xact_lock('credits:'+uid)`, dan `credits_balance ≥ som(uren)`, anders één zin met het tekort.
  Geen gemengde betaling in deze versie.
- `create_booking` krijgt `p_order uuid default null` en zet `order_id` bij de insert. Signatuurwijziging = drop + create →
  **rechten per rol opnieuw zetten** (anon/PUBLIC weg, authenticated execute), zoals in 0153.
- Na de lus: `total_cents = som(price_cents)` van de onbetaalde rijen. Is dat 0 (alles tegoed of welkom), dan `status='betaald'`.
- Alle rijen hebben dezelfde `created_at` (`now()` is constant binnen een transactie), dus hun holds vervallen samen.

### 3. Hamsterrem per mand

`block_hoarding` telt **openstaande reserveringen**, niet rijen: `count(distinct coalesce(order_id, id))` over de onbetaalde
los/abo-rijen van de laatste 15 minuten, **zonder de eigen `new.order_id`**. Een mand telt als één reservering, en de
bovengrens van 8 momenten per mand houdt het begrensd.

### 4. Serveractie `createBookingsAction` (nieuw, in `boeken/actions.js`)

1. RPC → `order_id`. Fout = één zin, er staat niets vast.
2. Rijen van de order lezen. Wachtlijst-inschrijvingen van het lid op die momenten wissen.
3. **Alles al betaald** (tegoed/welkom) → één bevestigingsmail met álle momenten + één .ics per sessie.
4. **Korting op het totaal, één keer**: `validateDiscount` op `total`. Verdeel de korting over de regels zodat
   `som(charge_cents) = charge_total`, pro rata, met de centenrest op de laatste regel. Zo heeft elke sessie een eigen,
   terugbetaalbaar bedrag. 100% → alles betaald, één redemption.
5. **Stripe Checkout**: één `line_item` per sessie ("Fit60 — di 16 sep 19:00"), `metadata: { kind: "booking_order",
   order_id, discount_code_id }`, `expires_at` zoals nu. `charge_cents`, `discount_code_id` en `stripe_session_id` per boeking
   en `stripe_session_id`/`total_cents` op de order via de service role.
6. Geen buddies of e-mailuitnodigingen bij meerdere momenten (het scherm verbergt ze). Dat komt later als het nodig is.

### 5. Webhook — tak `booking_order`

In `checkout.session.completed`, vóór de bestaande `metadata.booking_id`-tak:

1. Order + rijen lezen. `status='betaald'` → klaar (idempotent).
2. `amount_total` moet ≥ `som(charge_cents)` van de rijen die nog onbetaald en geldig zijn. Anders niets bevestigen en
   beheerders alarmeren.
3. Per rij beslissen:
   - bevestigd en onbetaald → `paid=true, stripe_payment_intent` (voorwaardelijke update, zoals nu);
   - intussen geannuleerd (hold verlopen, plek weg) of al betaald via een andere PI → op de lijst **terug te betalen**.
4. **Eén** `refunds.create({ payment_intent, amount: som, metadata: { booking_ids } })` voor enkel die rijen.
5. **Eén** `payments`-rij (`stripe_id = session.id`, `order_id`, omschrijving met de momenten).
6. **Eén** redemption. Eén bevestigingsmail met de bevestigde momenten, en apart vermeld wat teruggestort werd.
7. `booking_orders.status='betaald'`, `paid_at`, `stripe_payment_intent`.

Faalt iets halverwege, dan gooit de handler → het event-slot wordt vrijgegeven → Stripe probeert opnieuw. Elke stap
hierboven is idempotent (voorwaardelijke updates, upsert op `stripe_id`, refund-controle via metadata).

### 6. Terugbetalen per sessie — ook voor enkele boekingen

- `adminCancelBooking` (en elke andere plek die `refunds.create` doet): **altijd `amount: charge_cents ?? price_cents` en
  `metadata: { booking_id }`**. Bij een enkele boeking is dat het volle bedrag, dus het gedrag verandert niet.
- `handleRefund`:
  - **volledig** → zoals nu (alle rijen met die PI);
  - **gedeeltelijk** → refunds van deze charge ophalen, per refund met `metadata.booking_id(s)` die boekingen annuleren
    (als dat nog niet gebeurde, idempotent), `payments.refunded_cents = charge.amount_refunded`. Geen valse
    "controleer handmatig"-alarmering meer voor refunds die wij zelf deden.

### 7. Hervatten per mand

- `/account` toont één "Afrekenen" per mand, niet per sessie.
- `buildResumeCheckout` krijgt de order: vervalt de oude sessie, en maakt een nieuwe checkout voor de rijen die nog open
  staan. Is een rij intussen vervallen, dan wordt ze niet meer aangerekend.

### 8. Vervallen

`expire_unpaid_bookings`: zet ook `booking_orders.status='verlopen'` als al hun rijen vervielen, en maakt **één melding per
mand** (groeperen op `coalesce(order_id, id)`) in plaats van drie.

### 9. Betalingen, facturen

- `/beheer/betalingen`: een order-betaling toont alle sessies.
- Factuur: één regel per sessie, met datum, als de betaling een `order_id` heeft. `refunded_cents` staat er zichtbaar bij.

### 10. Scherm

- `BookingClient`: `selected` wordt een lijst. Een klik zet een moment erbij of haalt het weg, met een maximum van 8.
- Samenvatting: lijst met momenten (elk met ✕), totaal = som, welkomst "1 gratis, rest € …", tegoed enkel aan als
  saldo ≥ N × duur (anders zegt het scherm hoeveel er ontbreekt).
- 1 moment → bestaand pad met buddies. Meer → nieuw pad, uitnodigingen verborgen.
- Bevestigingsscherm: alle momenten + agenda-items.

## Bewust NIET in deze versie

- Gemengde betaling (deels tegoed, deels Stripe).
- Buddies/uitnodigingen bij meerdere momenten.
- Verschillende diensten of duur per moment in één mand.
- Coach/PT-sessies in een mand (`/boeken` filtert PT al weg, `page.jsx:84`).

## Bestaande fouten die de kaart vond (los van deze functie)

Niet in deze wijziging, wel melden aan de eigenaar:

- `refund_member_cancel` (0133:44) boekt `round(uren)` terug: een tegoedsessie van 1,5u geeft 2 terug.
- Teruggeboekt tegoed krijgt geen `expires_at`: een abo-beurt die "vervalt" wordt via boeken-en-annuleren blijvend.
- `credits_balance` FIFO rekent verbruik toe aan al vervallen grants (0117:66-80).
- Een lid kan via PostgREST zelf `status` op zijn eigen boeking zetten (0055:21 + 0133:27-31).
- Chargebacks (`charge.dispute.*`) doen niets met boekingen of deurcodes.

## Verificatie vóór live

1. Migratie eerst als **rollback-test op productie** (`begin; …; rollback;`): tabel, grants, de RPC met een echte
   `auth.uid()` via `set local role authenticated` + `request.jwt.claims`, een mand van 3, een mand waarvan moment 3 bezet
   is (alles terug?), tegoed tekort (niets afgeboekt?), welkomst (enkel 1 gratis?), hamsterrem (mand = 1 reservering).
2. Webhook-tak met nagebootste events in unit-tests (partial expired → deelrefund met het juiste bedrag).
3. Stripe **testmodus** end-to-end als er een testsleutel is. Zonder testsleutel: niet live zetten zonder expliciet akkoord.
   → Nagekeken: `.env.local` én `.env.live` hebben `sk_test_`. Productie draait Stripe in testmodus.

---

# v2 — wat de review veranderde (bindend)

Workflow `multi-boeken-ontwerp-aanvallen`: 5 invalshoeken, 48 bevindingen, elk door 2 sceptici. **41 unaniem echt**, 3
verdeeld, 4 gesneuveld. Volledige lijst in scratchpad `multiboek-review.json`. De punten hieronder dekken ze allemaal (#nr).

## A. De SESSIE is de bron van waarheid, niet de order
- Bij het maken van een Checkout: `booking_order_lines(session_id, booking_id, charge_cents)` via de service role. De webhook
  kijkt ENKEL naar de rijen die in déze sessie aangerekend werden, tegen het bedrag van déze sessie. (#3 #5 #13)
- Idempotentie per sessie: `booking_order_settlements(session_id pk, payment_intent, confirmed uuid[], refund_cents,
  refund_id, created_at)`. Een tweede aflevering leest het resultaat en doet niets opnieuw. (#1 #11 #23)

## B. Afrekenen in één SQL-transactie
RPC `settle_booking_order(p_session, p_pi)`, enkel `service_role`:
1. De order `for update`, daarna de lijnrijen `for update` (volgorde op id).
2. Per lijn: `bevestigd & !paid` → betaald met deze PI. Al `paid` met déze PI → hoort bij ons. `paid` met een andere of GEEN PI
   (cash, of hervat) → terugbetalen. Geannuleerd → terugbetalen. (#12 #29 #37)
3. Schrijft de settlement en geeft `confirmed[]`, `refund_cents` en `order_id` terug. JS beslist niets op basis van een eerder gelezen rij.
4. Order `betaald` enkel als er ≥ 1 rij bevestigd is. Anders gaat de hele sessie terug.

Webhook-volgorde: **payments-rij eerst** (upsert op session.id) → `refunds.create({ amount, metadata: {order_id, session_id,
reden} }, { idempotencyKey: 'settle:'+session.id })` enkel als `refund_cents > 0` → refund-id opslaan. Elke supabase-fout
gooit, zodat Stripe opnieuw probeert. (#4 #17 #31)

## C. Refunds = eigen, negatieve betaalrijen
Elke Stripe-refund krijgt een `payments`-rij: `stripe_id = re_…` (uniek, idempotent), `kind='refund'`, negatief bedrag,
`order_id`. Omzet, btw, dashboard en weekrapport netten zo vanzelf. (#6 #7 #30)
**Bij het bouwen nakijken:** welke schermen filteren op kind/status en zo'n rij zouden missen of dubbel tellen.

## D. handleRefund annuleert enkel wat met dát geld betaald werd
- Gedeeltelijk: annuleren `where id = any(ids) and stripe_payment_intent = pi and status='bevestigd'`, enkel bij
  `reden='annulering'`. Bij `vervallen` of `dubbel` wordt niets geannuleerd. (#2 #14 #25 #29)
- Negatieve betaalrijen uit `refunds.list({ payment_intent })`, idempotent per re_-id.
- `refund.failed`: neutraliseert de rij en maakt een beheerdersmelding. (#10) ⚠ Het event moet de eigenaar in het Stripe-dashboard aanzetten.

## E. adminCancelBooking
Bedrag = `min(charge, charge.amount − amount_refunded)`. `metadata { booking_id, reden:'annulering' }`. Faalt de refund →
`{ error }` + beheerdersmelding, nooit ✓. (#9)

## F. Korting in een mand = voor ÉÉN sessie
Base = de prijs van één regel, resultaat op de eerste regel. Redemption enkel als die regel bevestigd wordt. `used_count` enkel
na een gelukte insert. De code wordt vóór de RPC gevalideerd. (#8 #32 #34)

## G. Welkomstsessie NIET in een mand
Het gratis uur geldt enkel bij een enkele boeking, en het scherm zegt dat. (#5 #36)
Los daarvan wordt de claim in `create_booking` atomair (`update … where not welcome_code_used … returning`), want **de
parallelle dubbele welkomstsessie bestaat vandaag al**. (#15)

## H. Publieke signatuur van create_booking blijft ONGEWIJZIGD
De body verhuist naar `_create_booking(…, p_order)`, `revoke` per rol (public, anon, authenticated). `create_booking` wordt
een wrapper. De batch controleert dat de order van `auth.uid()` is, `open` staat en in deze transactie gemaakt werd. (#22 #28)

## I. create_booking_batch
- Eerst `expire_unpaid_bookings(gym)` in dezelfde transactie. (#19)
- Gesorteerd op starts_at tegen deadlocks. `deadlock_detected` krijgt een nette zin. (#20)
- Een fout per moment opnieuw gooien mét het moment ("do 18 sep 19:00 — …") en de index in `hint`. (#39)
- `client_key uuid`, `unique(user_id, client_key)`: dezelfde indiening geeft dezelfde order terug. (#21 #38)

## J. Hamsterrem
Eerst `pg_advisory_xact_lock('hold:'+user)`, dat is re-entrant. (#18) Rij MET order: weigeren als er andere onbetaalde
rijen buiten deze order openstaan (één open mand tegelijk, max 8). Rij ZONDER order: zoals nu, `>= 2`, en een mand telt als
één. NULL wordt expliciet afgehandeld. (#24 #35)

## K. Vroege exit na de RPC → rijen van de order annuleren (service role), order `geannuleerd`. (#32)

## L. Hervatten
- `buildResumeCheckout` sluit `order_id`-rijen uit. (#26)
- Order-hervatting: `retrieve` de oude sessie. `complete` → "wordt verwerkt". `open` → `expire`, en de fout NIET inslikken.
  Enkel `expired` → nieuwe sessie met de nog open rijen. (#1 #13)
- `/account`: banner en "Afrekenen" per mand. (#40) `recoverBookingAction` gaat bij een order-rij naar de order. (#26)

## M. Vervallen
De order-status in een apart statement ná de CTE, en één melding per mand. (#16)

## N. Datamodel
Alle nieuwe FK's `on delete set null`, `booking_orders.user_id` nullable. (#27 #33)

## O. Scherm
Label uit de eigen `dateStr` (Brussels), sleutel `slotInstant().getTime()`. `canBook` telt de gekozen momenten mee, ook na
een duurwissel. (#41)

## Verdeeld — gemeld, niet opgenomen
- Een opgezegd abo boekt nog 8 weken vooruit aan het abotarief. Dat kan vandaag al per moment. Productbeslissing.
