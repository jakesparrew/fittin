// Welke sessie is vandaag aan de beurt, en hoe ziet ze eruit in een mail.
//
// Dit is het kanaal dat het hele ontwerp draagt. Een lid opent geen extra scherm — maar de mail met
// zijn deurcode opent hij wél, want zonder die code raakt hij de zaal niet binnen. Daar hoort de
// workout dus in, en nergens anders.
//
// De koppeling is bewust lui: een sessie krijgt pas een boeking toegewezen op het moment dat de
// deurcode vertrekt. Vooraf koppelen zou betekenen dat een verplaatste of geannuleerde boeking een
// sessie meesleept, en dan klopt de volgorde van de week niet meer.

/**
 * Zoekt de sessie die bij deze boeking hoort en koppelt ze eraan vast.
 * Geeft null terug wanneer er niets te leveren valt — dan gaat de deurcodemail gewoon zonder blok.
 *
 * @returns {null | {weekNr:number, totaalWeken:number, volgnummer:number, totaal:number, naam:string, oefeningen:object[]}}
 */
export async function workoutVoorBoeking(admin, { bookingId, memberId }) {
  if (!bookingId || !memberId) return null;

  const { data: plan } = await admin.from("coaching_plans")
    .select("id, weken, status").eq("member_id", memberId).eq("status", "lopend").maybeSingle();
  if (!plan) return null;

  const { data: week } = await admin.from("coaching_weeks")
    .select("id, weeknummer, program_id, unlocked_at, completed_at")
    .eq("plan_id", plan.id).not("unlocked_at", "is", null).is("completed_at", null)
    .order("weeknummer", { ascending: false }).limit(1).maybeSingle();
  if (!week?.program_id) return null;

  const { data: sessies } = await admin.from("coaching_sessions")
    .select("id, volgnummer, program_day_id, booking_id, gedaan_at")
    .eq("week_id", week.id).order("volgnummer");
  if (!sessies?.length) return null;

  // Al aan deze boeking gekoppeld? Dan die. Anders de eerste die nog niet gedaan is en nog geen
  // boeking heeft. Zo blijft een tweede mail voor dezelfde boeking dezelfde sessie tonen.
  const sessie = sessies.find((s) => s.booking_id === bookingId)
    || sessies.find((s) => !s.gedaan_at && !s.booking_id);
  if (!sessie) return null;

  if (sessie.booking_id !== bookingId) {
    const { error } = await admin.from("coaching_sessions").update({ booking_id: bookingId }).eq("id", sessie.id);
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
