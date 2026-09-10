// Welke sessie is vandaag aan de beurt, en hoe ziet ze eruit in een mail.
//
// Dit is het kanaal dat het hele ontwerp draagt. Een lid opent geen extra scherm — maar de mail met
// zijn deurcode opent hij wél, want zonder die code raakt hij de zaal niet binnen. Daar hoort de
// workout dus in, en nergens anders.
//
// De koppeling is bewust lui: een sessie krijgt pas een boeking toegewezen op het moment dat de
// deurcode vertrekt. Vooraf koppelen zou betekenen dat een verplaatste of geannuleerde boeking een
// sessie meesleept, en dan klopt de volgorde van de week niet meer.

import { magCoaching } from "./toegang.js";
import { nieuwToken } from "@/lib/meldpunt";

/**
 * Zoekt de sessie die bij deze boeking hoort en koppelt ze eraan vast.
 * Geeft null terug wanneer er niets te leveren valt — dan gaat de deurcodemail gewoon zonder blok.
 *
 * @returns {null | {weekNr:number, totaalWeken:number, volgnummer:number, totaal:number, naam:string, oefeningen:object[]}}
 */
export async function workoutVoorBoeking(admin, { bookingId, memberId }) {
  if (!bookingId || !memberId) return null;

  // De proefgroep-poort geldt ook hier. Deze mail was de enige ingang die hem niet passeerde: wie
  // ooit een plan maakte toen de lijst ruimer stond, kreeg zijn schema anders gewoon blijven
  // toegestuurd. De poort is de poort, op alle vijf — nu zes — ingangen.
  const { data: lid } = await admin.from("profiles").select("id, email, role").eq("id", memberId).maybeSingle();
  if (!magCoaching(lid)) return null;

  const { data: plan } = await admin.from("coaching_plans")
    .select("id, weken, status").eq("member_id", memberId).eq("status", "lopend").maybeSingle();
  if (!plan) return null;

  const { data: week } = await admin.from("coaching_weeks")
    .select("id, weeknummer, program_id, unlocked_at, completed_at")
    .eq("plan_id", plan.id).not("unlocked_at", "is", null).is("completed_at", null)
    .order("weeknummer", { ascending: false }).limit(1).maybeSingle();
  if (!week?.program_id) return null;

  const { data: sessies } = await admin.from("coaching_sessions")
    .select("id, volgnummer, program_day_id, booking_id, gedaan_at, afvink_token")
    .eq("week_id", week.id).order("volgnummer");
  if (!sessies?.length) return null;

  // Al aan deze boeking gekoppeld? Dan die. Anders de eerste die nog niet gedaan is en nog geen
  // boeking heeft. Zo blijft een tweede mail voor dezelfde boeking dezelfde sessie tonen.
  const sessie = sessies.find((s) => s.booking_id === bookingId)
    || sessies.find((s) => !s.gedaan_at && !s.booking_id);
  if (!sessie) return null;

  // De sleutel voor het afvinken. Lui gemunt op precies dit moment, samen met de koppeling, want
  // dit is het enige moment waarop hij nodig is. Zie 0160 voor waarom dit NIET het meldtoken van de
  // boeking mag zijn: dat token staat ook in de mail van de COACH (in de meldpuntlink), en die zou
  // er dan de sessie van zijn client mee kunnen afvinken.
  const afvinkToken = sessie.afvink_token || nieuwToken();
  const velden = {};
  if (sessie.booking_id !== bookingId) velden.booking_id = bookingId;
  if (!sessie.afvink_token) velden.afvink_token = afvinkToken;
  if (Object.keys(velden).length) {
    const { error } = await admin.from("coaching_sessions").update(velden).eq("id", sessie.id);
    // Zonder token geen afvinklinks — maar de deurcode moet hoe dan ook vertrekken.
    if (error) console.error("coaching: sessie koppelen mislukt:", error.message);
  }

  const { data: dag } = await admin.from("program_days")
    .select("id, name").eq("id", sessie.program_day_id).maybeSingle();
  const { data: oefeningen } = await admin.from("program_exercises")
    .select("sets, reps, rest_sec, position, section, target_weight_kg, exercises(name)")
    .eq("program_day_id", sessie.program_day_id).order("position");

  if (!oefeningen?.length) return null;

  return {
    weekNr: week.weeknummer,
    totaalWeken: plan.weken,
    // Reist mee IN het workoutblok en nergens anders. Dat is de hele veiligheidsconstructie.
    afvinkToken,
    volgnummer: sessie.volgnummer,
    totaal: sessies.length,
    naam: dag?.name || `Sessie ${sessie.volgnummer}`,
    oefeningen: oefeningen.map((o) => ({
      naam: o.exercises?.name || "Oefening",
      sets: o.sets,
      reps: o.reps,
      kg: o.target_weight_kg,
      rust: o.rest_sec,
      sectie: o.section,
    })),
  };
}

/**
 * Zet de workout om in een regel tekst per oefening. Puur, zodat de mailtemplate en de tests
 * dezelfde vorm gebruiken.
 */
export function oefeningRegel(o) {
  const delen = [`${o.sets}×${o.reps}`];
  if (o.kg) delen.push(`${o.kg} kg`);
  if (o.rust) delen.push(`${o.rust}s rust`);
  return `${o.naam} — ${delen.join(" · ")}`;
}

/** De kop boven het blok: "Week 3 · sessie 2 van 3 — Onderlichaam". */
export function workoutKop(w) {
  return `Week ${w.weekNr} · sessie ${w.volgnummer} van ${w.totaal} — ${w.naam}`;
}

// ---------------------------------------------------------------------------
// Afvinken vanuit de mail
// ---------------------------------------------------------------------------
//
// Waarom hier en niet op /coaching: gemeten op 10-09-2026 stonden er 159 boekingen tegenover 20
// rijen in `door_log` en zeven workout-logs ooit. De zaal kan het afvinken niet afleiden — wie zijn
// keypadcode intypt laat geen spoor na — en de pagina waar het vinkje stond, wordt niet bezocht.
//
// Wat wél 100% dekking heeft is deze mail zelf. Dus verhuist de handeling naar waar het lid al is:
// drie links onder zijn workout, één tik, geen login.
//
// De sleutel is `bookings.report_token` — hij zit al in deze mail (het meldpunt gebruikt hem) en is
// al per boeking. Wat een gestolen link kan: één sessie van iemand anders afvinken. Geen gegevens,
// geen geld, geen deur. Zie app/s/[token] voor het venster waarin hij geldig is.

/** De drie tikken, in de volgorde waarin ze in de mail staan. */
export const AFVINK_OORDELEN = [
  { v: "te_licht", l: "Te licht" },
  { v: "goed", l: "Goed" },
  { v: "te_zwaar", l: "Te zwaar" },
];

/**
 * Het pad van de afvinkpagina. Puur en zonder site-URL, zodat de mailtemplate en de tests dezelfde
 * vorm gebruiken en dit bestand niets over hosting hoeft te weten.
 *
 * GEEN `?v=` MEER, en dat is een correctheidseis. De eerste versie liet de mail rechtstreeks een
 * oordeel wegschrijven via een GET. De verdediging daarvoor was dat de mail vijf minuten vóór de
 * sessie vertrekt en de actie alles vóór `starts_at` weigert — maar `sendDueAccessCodes` verstuurt
 * in een venster dat tot zestien minuten NA de start loopt (lib/reminders.js), en bij een
 * verplaatste boeking gaat de mail opnieuw uit. Een linkscanner die elke URL in een mail ophaalt,
 * kan dus wel degelijk binnen het venster vallen en het oordeel voor het lid kiezen.
 *
 * Nu opent de mail alleen de pagina; het oordeel gaat er met een formulier (POST) uit. Dat kost
 * één tik meer op een scherm dat toch al open staat, en het haalt de schrijfactie uit de GET.
 */
export function afvinkPad(token) {
  if (!token) return null;
  return `/s/${encodeURIComponent(token)}`;
}
