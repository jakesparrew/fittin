"use server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";
import { geefNu } from "@/lib/punten-db";
import { REDEN_SET } from "@/lib/ervaring";

// De score uit de mail vastleggen, en daarna de vervolgvraag.
//
// GEEN VERTAKKING OP DE SCORE. De reviewvraag op de bedankpagina is voor iedereen identiek — ook
// voor wie 1 ster gaf. Google's beleid verbiedt woordelijk "negatieve reviews ontmoedigen of
// verbieden, en selectief vragen om positieve reviews"
// (support.google.com/contributionpolicy/answer/7400114), en de sanctie loopt tot schorsing van het
// bedrijfsprofiel. Wie hier ooit `if (rating >= 4)` bij zet, zet dat profiel op het spel.

const kort = (v, n) => String(v ?? "").trim().slice(0, n);

export async function boekingVanToken(token) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("bookings")
    .select("id, gym_id, user_id, starts_at, ends_at, status, member:profiles!bookings_user_id_fkey(full_name, feedback_opt_out, google_review_klik_at)")
    .eq("report_token", kort(token, 64))
    .maybeSingle();
  if (!data || data.status !== "bevestigd") return null;
  // Zelfde venster als het meldpunt: tot vier dagen na de sessie. Daarna is de link dood.
  if (Date.now() > new Date(data.ends_at).getTime() + 96 * 3600000) return null;
  return data;
}

export async function bestaandeScore(bookingId) {
  const admin = createAdminClient();
  const { data } = await admin.from("session_feedback").select("rating, comment, redenen").eq("booking_id", bookingId).maybeSingle();
  return data || null;
}

export async function bewaarScore(token, rating, comment = null) {
  const b = await boekingVanToken(token);
  if (!b) return { error: "Deze link is verlopen." };
  const n = Number(rating);
  if (!Number.isInteger(n) || n < 1 || n > 5) return { error: "Ongeldige score." };

  const admin = createAdminClient();
  // upsert op booking_id: nog eens op een andere ster tikken corrigeert, het maakt geen tweede rij.
  const { error } = await admin.from("session_feedback").upsert(
    { gym_id: b.gym_id, booking_id: b.id, user_id: b.user_id, rating: n, comment: kort(comment, 1000) || null },
    { onConflict: "booking_id" }
  );
  if (error) return { error: "Bewaren lukte niet." };

  // Een lage score met tekst is een signaal dat aandacht verdient. Een score ZONDER tekst wordt
  // bewust géén taak op het bord van de eigenaar: bij een onbemande zaal betekent een 3 meestal
  // "ik had een slechte trainingsdag", niet "de gym deugt niet".
  if (n <= 3 && kort(comment, 1000)) {
    try {
      const { data: admins } = await admin.from("profiles").select("id").eq("gym_id", b.gym_id).eq("role", "beheerder");
      for (const a of admins || []) {
        await notify({
          gymId: b.gym_id, userId: a.id, type: "system",
          title: `${n}★ met een opmerking van ${b.member?.full_name || "een lid"}`,
          body: kort(comment, 90),
          link: "/beheer/meldingen",
        });
      }
    } catch {}
  }
  return { ok: true, rating: n };
}

// Waarom Oké of Niet goed? Vaste keuzes (lib/ervaring.js), zodat het beheer telt i.p.v. leest.
export async function bewaarRedenen(token, redenen) {
  const b = await boekingVanToken(token);
  if (!b) return { error: "Deze link is verlopen." };
  const r = (Array.isArray(redenen) ? redenen : []).filter((x) => REDEN_SET.has(x)).slice(0, 8);
  const { error, count } = await createAdminClient().from("session_feedback").update({ redenen: r }, { count: "exact" }).eq("booking_id", b.id);
  if (error || !count) return { error: "Kies eerst hoe het was." };
  return { ok: true };
}

// Hoe voelde de training (1 zwaar · 2 matig · 3 goed · 4 sterk)? Optioneel, na de sterren. Voedt het overzicht
// "Ervaring" en later de AI-coach.
export async function bewaarEnergie(token, energie) {
  const b = await boekingVanToken(token);
  if (!b) return { error: "Deze link is verlopen." };
  const n = Number(energie);
  if (!Number.isInteger(n) || n < 1 || n > 4) return { error: "Ongeldig antwoord." };
  const { error, count } = await createAdminClient().from("session_feedback").update({ energie: n }, { count: "exact" }).eq("booking_id", b.id);
  if (error || !count) return { error: "Geef eerst je sterren." };
  return { ok: true };
}

// "Ik heb alles teruggelegd." Geen bewijs — wel context: een 'niet netjes' ná zo'n verklaring zegt de uitbater
// meer. 1 punt, één keer per boeking.
export async function verklaarNetjes(token) {
  const b = await boekingVanToken(token);
  if (!b) return { error: "Deze link is verlopen." };
  const admin = createAdminClient();
  const { error } = await admin.from("bookings").update({ netjes_verklaard_at: new Date().toISOString() }).eq("id", b.id).is("netjes_verklaard_at", null);
  if (error) return { error: "Bewaren lukte niet." };
  const punten = await geefNu(admin, { gymId: b.gym_id, userId: b.user_id, kind: "netjes", sourceKey: `netjes:${b.id}`, meta: { booking: b.id } }).catch(() => 0);
  return { ok: true, punten };
}

// De tik op de Google-knop onthouden: wie al naar Google ging, krijgt de vraag nooit meer (0167).
export async function googleReviewGeklikt(token) {
  const b = await boekingVanToken(token);
  if (!b?.user_id) return { ok: false };
  const { error } = await createAdminClient().from("profiles").update({ google_review_klik_at: new Date().toISOString() })
    .eq("id", b.user_id).is("google_review_klik_at", null);
  return error ? { ok: false } : { ok: true };
}

// Bezwaarrecht (art. 21 AVG): apart van de nieuwsbriefschakelaar, en bereikbaar zonder in te loggen
// — anders is het geen echt uitschrijfrecht maar een hindernisbaan.
export async function zetFeedbackUit(token) {
  const b = await boekingVanToken(token);
  if (!b?.user_id) return { error: "Deze link is verlopen." };
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ feedback_opt_out: true }).eq("id", b.user_id);
  if (error) return { error: "Uitzetten lukte niet." };
  return { ok: true };
}
