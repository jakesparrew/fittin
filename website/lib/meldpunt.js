// Het meldpunt: wat kan je melden, wie hoort het meteen, en wat weet de volgende bezoeker.
//
// WAAROM DIT ZO GEBOUWD IS: er staat geen personeel in de zaal. Wie een kapot toestel of een vuile
// kleedkamer tegenkomt, kan dat vandaag alleen kwijt via een dichtgeklapt tekstvak op zijn
// accountpagina — met als gemeten resultaat één melding in vijf maanden. De drempel is niet dat
// mensen niets te melden hebben; de drempel is zes stappen en een leeg veld.

export const CATEGORIEEN = [
  { v: "toestel", l: "Toestel stuk", emoji: "🔧", urgent: true, hint: "Welk toestel, en wat is er mis?" },
  { v: "netheid", l: "Niet netjes", emoji: "🧼", urgent: false, hint: "Wat lag er, en waar?" },
  { v: "temperatuur", l: "Te warm / te koud", emoji: "🌡", urgent: false, hint: "Hoe voelde het aan?" },
  { v: "deur", l: "Deur of code", emoji: "🚪", urgent: true, hint: "Wat gebeurde er toen je binnen wilde?" },
  { v: "anders", l: "Iets anders", emoji: "💬", urgent: false, hint: "Vertel kort wat er scheelt." },
];

export const catLabel = (v) => CATEGORIEEN.find((c) => c.v === v)?.l || "Melding";
export const catEmoji = (v) => CATEGORIEEN.find((c) => c.v === v)?.emoji || "🛟";
// Toestel en deur raken de VOLGENDE bezoeker meteen: een kapotte kabel of een klemmende deur maakt
// van een geboekt uur een verloren uur. Die twee mailen; de rest belt alleen het belletje.
export const isUrgent = (v) => !!CATEGORIEEN.find((c) => c.v === v)?.urgent;

// Web Crypto i.p.v. node:crypto, zodat dit bestand ook door een client-component geimporteerd
// mag worden (de categorieen staan hier ook, en die heeft het formulier nodig).
export const nieuwToken = () =>
  Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");

// Zorgt dat een boeking een meldtoken heeft. Lui aangemaakt op het moment dat de deurcodemail
// vertrekt, zodat de boekings-RPC ongemoeid blijft — die is al vaak genoeg aangepast.
export async function zorgVoorToken(admin, bookingId, huidig) {
  if (huidig) return huidig;
  const token = nieuwToken();
  const { data } = await admin.from("bookings").update({ report_token: token }).eq("id", bookingId).is("report_token", null).select("report_token").maybeSingle();
  return data?.report_token || token;
}

/**
 * De waarschuwingsregel die meereist naar de volgende bezoeker. Bewust de notitie van de UITBATER
 * en nooit de tekst van het lid: die kan een naam, een verwijt of een privé-detail bevatten.
 */
export async function openMeldingNotitie(admin, gymId) {
  const { data } = await admin
    .from("problem_reports")
    .select("public_note")
    .eq("gym_id", gymId)
    .is("resolved_at", null)
    .not("public_note", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const n = String(data?.public_note || "").trim();
  return n || null;
}

/**
 * Wie had het slot vóór deze sessie? ALLEEN voor het beheerscherm.
 *
 * De huisregels zeggen letterlijk "laat de zaal netjes achter voor de volgende", dus bij een
 * netheidsmelding is dit de relevante vraag. Maar lid A de naam van lid B tonen is persoonsgegevens
 * doorgeven aan een andere klant, en dit project heeft die keuze al eerder andersom gemaakt
 * (training_visible_to_buddies staat standaard uit). Dus: de uitbater ziet het, de leden nooit.
 */
export async function vorigeGebruiker(admin, gymId, startsAt, excludeBookingId) {
  if (!startsAt) return null;
  const { data } = await admin
    .from("bookings")
    .select("id, starts_at, ends_at, user_id, member:profiles!bookings_user_id_fkey(full_name, email)")
    .eq("gym_id", gymId)
    .eq("status", "bevestigd")
    .lte("starts_at", startsAt)
    .neq("id", excludeBookingId || "00000000-0000-0000-0000-000000000000")
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    naam: data.member?.full_name || data.member?.email || "onbekend",
    starts_at: data.starts_at,
    ends_at: data.ends_at,
  };
}

// Eenvoudige snelheidsrem per lid. reportProblem had er geen enkele: één lengtecontrole en dan een
// insert plus een belletje bij élke beheerder. De anonieme /hulp-tak heeft wél 3 per dag; de
// ingelogde niet. Met een mail bij urgente categorieën wordt een belletje anders een telefoon die
// afgaat.
export async function teVeelGemeld(admin, userId, max = 5, urenTerug = 24) {
  if (!userId) return false;
  const sinds = new Date(Date.now() - urenTerug * 3600000).toISOString();
  const { count } = await admin
    .from("problem_reports")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", sinds);
  return (count || 0) >= max;
}
