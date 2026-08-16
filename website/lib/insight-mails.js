// Inhoud + rekenwerk voor de inzicht-acties: de voorgeschreven mails die een beheerder met één
// klik verstuurt vanaf een dashboardkaart, en de stappen van de gerichte mailreeksen.
//
// Waarom dit bestand puur is (geen Resend, geen database): de overtuigingskracht zit in de
// CIJFERS VAN HET LID ZELF — "jij deed 7 sessies en betaalde € 99; met het abo was dat € 84" —
// en zo'n rekensom moet testbaar zijn zonder mailserver. Het versturen zelf gebeurt in
// app/beheer/insight-actions.js.
//
// Prijslogica (bron: CLAUDE.md, live prijzen 2026): losse sessie € 15 · 10-beurtenkaart € 150
// voor 11 sessies (10+1 gratis) · abo € 12/mnd met 1 sessie inbegrepen, elke volgende € 12.
// n sessies per maand kost met abo dus 12 + 12·(n−1) = 12n (en minimaal € 12).
import { eur, statGrid, calloutBox } from "@/lib/email-visuals";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";
export const LOS_CENTS = 1500;
export const KAART_CENTS_PER_SESSIE = 15000 / 11; // ≈ € 13,64
export const ABO_CENTS_PER_SESSIE = 1200;

const half = (n) => Math.round(n * 2) / 2;
const voornaam = (naam) => String(naam || "").trim().split(/\s+/)[0] || "sporter";

// Wat kost het huidige gedrag per maand, en wat zou het abo kosten?
// `los` en `kaart` zijn aantallen sessies in de afgelopen 60 dagen.
export function aboMath({ los = 0, kaart = 0 }) {
  const totaal60 = los + kaart;
  const perMaand = half(totaal60 / 2);
  const kostNuMaand = Math.round((los * LOS_CENTS + kaart * KAART_CENTS_PER_SESSIE) / 2);
  // Abo: € 12 vast (1 sessie inbegrepen) + € 12 per extra sessie — minimaal de vaste € 12.
  const kostAboMaand = Math.round(Math.max(1, perMaand) * ABO_CENTS_PER_SESSIE);
  const besparingMaand = Math.max(0, kostNuMaand - kostAboMaand);
  return { totaal60, perMaand, kostNuMaand, kostAboMaand, besparingMaand, besparingJaar: besparingMaand * 12 };
}

// Na hoeveel dagen mag dezelfde soort mail opnieuw naar hetzelfde lid? Eén overtuigingsmail is
// een dienst; twee in dezelfde maand is spam die ook de échte mails (deurcodes!) in de
// ongewenst-map duwt.
export const HERHAAL_DAGEN = 30;
export function magOpnieuw(laatstVerstuurd, nu = new Date()) {
  if (!laatstVerstuurd) return true;
  return nu.getTime() - new Date(laatstVerstuurd).getTime() >= HERHAAL_DAGEN * 86400000;
}

// ---- De voorgeschreven mails (onderwerp + binnenkant; de schil met uitschrijflink komt van
// newsletterHtml, want dit is marketing en moet uitschrijfbaar zijn). ----

export function buildAboVoorstel({ name, math }) {
  const v = voornaam(name);
  const loont = math.besparingMaand > 0;
  return {
    kind: "insight_abo_voorstel",
    subject: loont
      ? `${v}, je betaalt nu meer dan nodig — dit is jouw rekensom`
      : `${v}, dit is wat het abo voor jou zou betekenen`,
    preheader: "Geen kleine lettertjes: jouw eigen cijfers van de voorbije 60 dagen.",
    body: `
      <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#2b2550">Hey ${v},</p>
      <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#2b2550">
        Geen verkooppraatje — gewoon jouw eigen cijfers van de voorbije 60 dagen:</p>
      ${statGrid([
        { label: "Jouw sessies", value: String(math.totaal60).replace(".", ",") },
        { label: "Wat je nu betaalt", value: eur(math.kostNuMaand) + "/mnd" },
        { label: "Met het abo", value: eur(math.kostAboMaand) + "/mnd" },
      ])}
      ${loont
        ? calloutBox(`Zelfde sessies, zelfde gym: <strong>${eur(math.besparingMaand)} per maand goedkoper</strong> — dat is ${eur(math.besparingJaar)} op een jaar.`, "good")
        : calloutBox(`Aan jouw huidige ritme kost het abo ongeveer hetzelfde — maar elke sessie erbij kost je dan <strong>€ 12 in plaats van € 15</strong>, en je kaart kan nooit meer "op" zijn.`, "neutral")}
      <p style="margin:16px 0;font-size:15px;line-height:1.6;color:#2b2550">
        Het abo is € 12 per maand met één sessie inbegrepen, en daarna élke sessie aan € 12.
        Maandelijks opzegbaar, geen instapkost, niets dat vervalt.</p>`,
    cta: { href: `${SITE}/lidmaatschap`, label: "Bekijk het abo →" },
  };
}

export function buildWinback({ name, laatsteBezoek, sessiesOoit = 0 }) {
  const v = voornaam(name);
  const weken = laatsteBezoek ? Math.max(1, Math.round((Date.now() - new Date(laatsteBezoek).getTime()) / (7 * 86400000))) : null;
  return {
    kind: "insight_winback",
    subject: `${v}, je plekje in de gym staat er nog 💪`,
    preheader: "Boeken duurt 30 seconden en je deurcode komt vanzelf.",
    body: `
      <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#2b2550">Hey ${v},</p>
      <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#2b2550">
        ${weken ? `Het is ${weken === 1 ? "een week" : weken + " weken"} geleden` : "Het is even geleden"} sinds je laatste sessie${sessiesOoit >= 5 ? ` — en dat terwijl je er al ${sessiesOoit} deed` : ""}.
        Geen schuldgevoel-mail, gewoon een herinnering: de gym is nog altijd van jou alleen tijdens je uur.</p>
      ${calloutBox(`Boeken duurt 30 seconden, je <strong>deurcode komt automatisch</strong> voor de start, en er hangt niemand over je schouder. Zoals altijd.`, "neutral")}
      <p style="margin:16px 0;font-size:15px;line-height:1.6;color:#2b2550">
        Nieuw sinds je laatste bezoek: een gratis <a href="${SITE}/workouts" style="color:#33B24A;font-weight:bold">workout-bibliotheek</a> die je tijdens je sessie kan volgen, stap voor stap.</p>`,
    cta: { href: `${SITE}/boeken`, label: "Boek je comeback-sessie →" },
  };
}

export function buildPastdueHulp({ name }) {
  const v = voornaam(name);
  return {
    kind: "insight_pastdue",
    subject: `${v}, je abo-betaling lukte niet — in 1 minuut opgelost`,
    preheader: "Waarschijnlijk een verlopen kaart. Zo fix je het meteen.",
    body: `
      <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#2b2550">Hey ${v},</p>
      <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#2b2550">
        De maandelijkse betaling van je abo is niet gelukt — meestal is dat een verlopen of vervangen
        bankkaart, niets ergs. Tot het in orde is, boek je tijdelijk aan het losse tarief van € 15
        in plaats van je abo-prijs van € 12.</p>
      ${calloutBox(`Open <strong>Mijn account</strong>, kies <strong>Abonnement beheren</strong> en werk je betaalmethode bij. Stripe probeert daarna vanzelf opnieuw — je hoeft verder niets te doen.`, "neutral")}`,
    cta: { href: `${SITE}/account`, label: "Betaalmethode bijwerken →" },
  };
}

export function buildOpzegBehoud({ name, eindDatum }) {
  const v = voornaam(name);
  return {
    kind: "insight_opzeg",
    subject: `${v}, mogen we vragen waarom?`,
    preheader: "Je abo loopt nog — en één antwoord helpt ons meer dan je denkt.",
    body: `
      <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#2b2550">Hey ${v},</p>
      <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#2b2550">
        Je zegde je abo op${eindDatum ? ` — het loopt nog tot ${eindDatum} en tot dan verandert er niets` : ""}.
        Helemaal oké. Eén vraag, als je heel even hebt: <strong>wat had beter gekund?</strong>
        Antwoord gewoon op deze mail; we lezen alles zelf.</p>
      ${calloutBox(`Bedenk je je? Je abo weer aanzetten kan met twee klikken via <strong>Mijn account</strong> — zelfde voorwaarden, € 12 per maand, maandelijks opzegbaar.`, "neutral")}`,
    cta: { href: `${SITE}/account`, label: "Naar mijn account →" },
  };
}

// ---- Gerichte mailreeksen (drips). Bewust kind 'drip_target': de algemene onboarding-inschrijving
// pakt élke actieve campagne met kind 'drip', en deze reeksen mogen nooit automatisch naar elk
// nieuw account — alleen naar wie de beheerder er bewust in zet. ----

export const TARGET_DRIPS = {
  abo_reeks: {
    naam: "Abo-reeks (gericht)",
    omschrijving: "3 mails over 8 dagen voor leden die veel los/kaart boeken zonder abo.",
    steps: [
      {
        delay_hours: 0,
        subject: "Elke sessie aan € 12 — zonder kaart die opraakt",
        body_html: `<p>Je boekt regelmatig bij Fittin' — top. Dan is dit goed om te weten: met het <strong>abonnement</strong> betaal je € 12 per maand met één sessie inbegrepen, en daarna kost <strong>élke sessie € 12</strong> in plaats van € 15.</p><p>Geen beurtenkaart die op is op het verkeerde moment, geen gedoe — gewoon boeken wanneer je wil.</p><p><a href="${SITE}/lidmaatschap" style="display:inline-block;background:#22194F;color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">Bekijk het abo →</a></p>`,
      },
      {
        delay_hours: 72,
        subject: "Reken even mee: € 144 per jaar verschil",
        body_html: `<p>Stel: je traint 4 keer per maand.</p><p>Los betaal je dan <strong>€ 60</strong> per maand. Met het abo: <strong>€ 48</strong>. Dat is € 12 per maand — <strong>€ 144 per jaar</strong> — voor exact dezelfde sessies in exact dezelfde gym.</p><p>Hoe vaker je komt, hoe groter het verschil.</p><p><a href="${SITE}/lidmaatschap" style="display:inline-block;background:#22194F;color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">Start met het abo →</a></p>`,
      },
      {
        delay_hours: 192,
        subject: "Laatste duwtje (daarna zwijgen we erover)",
        body_html: `<p>Beloofd: dit is de laatste mail hierover.</p><p>Het abo is <strong>maandelijks opzegbaar</strong>, heeft geen instapkost, en je eerste sessie van elke maand zit er al in. Je kan het vandaag starten en volgende maand stoppen als het niets voor je is.</p><p>En zo niet: geen probleem, losse sessies blijven gewoon bestaan. Jij kiest.</p><p><a href="${SITE}/lidmaatschap" style="display:inline-block;background:#22194F;color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">Ik probeer het abo →</a></p>`,
      },
    ],
  },
  comeback_reeks: {
    naam: "Comeback-reeks (gericht)",
    omschrijving: "2 mails over 5 dagen voor leden die 30+ dagen niet kwamen.",
    steps: [
      {
        delay_hours: 0,
        subject: "Je plekje in de gym staat er nog 💪",
        body_html: `<p>Het is even geleden — en dat is oké. Maar je privégym staat er nog precies zoals je ze achterliet: één uur, helemaal van jou, niemand die meekijkt.</p><p>Boeken duurt 30 seconden en je deurcode komt automatisch. Kleinste stap die er bestaat.</p><p><a href="${SITE}/boeken" style="display:inline-block;background:#22194F;color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">Boek je comeback-sessie →</a></p>`,
      },
      {
        delay_hours: 120,
        subject: "Deze week nog een rustig plekje voor jou",
        body_html: `<p>Nog niet geboekt? De rustigste momenten zijn doordeweeks overdag — dan is de kans het grootst dat je exact het uur vindt dat jou past.</p><p>Tip voor de herstart: kies een <a href="${SITE}/workouts" style="color:#33B24A;font-weight:bold">kant-en-klare workout</a> uit de bibliotheek, dan hoef je zelf niets te bedenken. Gewoon volgen.</p><p><a href="${SITE}/boeken" style="display:inline-block;background:#22194F;color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">Kies je moment →</a></p>`,
      },
    ],
  },
};
