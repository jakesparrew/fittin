"use server";
import { createClient } from "@/lib/supabase/server";
import { wie } from "@/lib/coaching/wie.js";
import { laadLid, keurVoorstel } from "@/lib/coaching/chat-context.js";
import { opening } from "@/lib/coaching/chat-regels.js";
import { kaartTekst } from "@/lib/coaching/chat-tools.js";
import { notifyAdmins } from "@/lib/notify";
import { createBookingAction } from "@/app/(site)/boeken/actions";
import { rescheduleBookingAction } from "@/app/(site)/account/actions";
import { bewaarCheckin } from "./actions";

// De coach-chat, kant van het lid. Uitvoeren gebeurt HIER en nergens anders: na een tik, met de rechten van het lid
// zelf (boeken en verplaatsen gaan via dezelfde serveracties als de gewone schermen), en telkens opnieuw gekeurd.
//
// Nooit twee keer: een voorstel gaat eerst van 'voorgesteld' naar 'bezig' met een VOORWAARDELIJKE update op de hele
// acties-kolom. Tikt het lid twee keer (of in twee tabbladen), dan wint er één; de andere krijgt 0 rijen.

const VERVAL_MS = 24 * 3600000;
const KOLOMMEN = "id, rol, tekst, acties, vlag, created_at";

export async function laadGesprek() {
  const mij = await wie();
  if (!mij) return { error: "Geen toegang." };
  const { admin, user, profile } = mij;
  const [{ data: rijen }, { data: geh }] = await Promise.all([
    admin.from("coach_berichten").select(KOLOMMEN).eq("member_id", user.id).order("created_at", { ascending: false }).limit(40),
    admin.from("coach_geheugen").select("feiten").eq("member_id", user.id).maybeSingle(),
  ]);
  const berichten = (rijen || []).reverse();
  let begin = null;
  const laatste = berichten[berichten.length - 1];
  if (profile.coach_chat_akkoord_at && (!laatste || Date.now() - new Date(laatste.created_at).getTime() > 12 * 3600000)) {
    const lid = await laadLid(admin, await createClient(), profile).catch(() => null);
    begin = opening(lid?.opening || { naam: String(profile.full_name || "").split(" ")[0] });
  }
  return { berichten, feiten: geh?.feiten || [], akkoord: !!profile.coach_chat_akkoord_at, begin };
}

export async function akkoordCoachChat() {
  const mij = await wie();
  if (!mij) return { error: "Geen toegang." };
  const { error, count } = await mij.admin.from("profiles").update({ coach_chat_akkoord_at: new Date().toISOString() }, { count: "exact" }).eq("id", mij.user.id);
  if (error || !count) return { error: "Dat lukte niet. Probeer opnieuw." };
  return { ok: true };
}

/** Voorwaardelijk de status van één actie zetten. Geeft de nieuwe rij terug, of null als iemand ons voor was. */
async function zetStatus(admin, rij, actieId, velden) {
  const acties = (rij.acties || []).map((a) => (a.id === actieId ? { ...a, ...velden } : a));
  const { data, error } = await admin.from("coach_berichten").update({ acties })
    .eq("id", rij.id).eq("acties", JSON.stringify(rij.acties)).select(KOLOMMEN);
  if (error || !data?.length) return null;
  return data[0];
}

async function laadActie(admin, userId, berichtId, actieId) {
  const { data: rij } = await admin.from("coach_berichten").select(KOLOMMEN).eq("id", berichtId).eq("member_id", userId).maybeSingle();
  const actie = rij?.acties?.find((a) => a.id === actieId);
  return rij && actie ? { rij, actie } : null;
}

export async function weigerCoachActie(berichtId, actieId) {
  const mij = await wie();
  if (!mij) return { error: "Geen toegang." };
  const g = await laadActie(mij.admin, mij.user.id, berichtId, actieId);
  if (!g || g.actie.status !== "voorgesteld") return { error: "Dit voorstel is al afgehandeld." };
  const rij = await zetStatus(mij.admin, g.rij, actieId, { status: "geweigerd" });
  return rij ? { ok: true, bericht: rij } : { error: "Dit voorstel is al afgehandeld." };
}

export async function voerCoachActieUit(berichtId, actieId) {
  const mij = await wie();
  if (!mij) return { error: "Geen toegang." };
  const { admin, user, profile } = mij;
  const g = await laadActie(admin, user.id, berichtId, actieId);
  if (!g) return { error: "Voorstel niet gevonden." };
  if (g.actie.status !== "voorgesteld") return { error: "Dit voorstel is al afgehandeld." };
  if (Date.now() - new Date(g.rij.created_at).getTime() > VERVAL_MS) {
    const rij = await zetStatus(admin, g.rij, actieId, { status: "verlopen" });
    return { error: "Dit voorstel is ouder dan een dag — vraag de coach een nieuw.", bericht: rij };
  }

  // Opnieuw keuren tegen de toestand van NU, met de invoer die het lid op de kaart zag.
  const supabase = await createClient();
  const lid = await laadLid(admin, supabase, profile);
  const keur = await keurVoorstel({ admin, supabase, profiel: profile, lid }, g.actie.type, g.actie.invoer);
  if (keur.fout) {
    const rij = await zetStatus(admin, g.rij, actieId, { status: "mislukt", resultaat: keur.fout });
    return { error: `Gaat niet meer: ${keur.fout}.`, bericht: rij };
  }
  const bezig = await zetStatus(admin, g.rij, actieId, { status: "bezig" });
  if (!bezig) return { error: "Dit voorstel wordt al uitgevoerd." };

  const i = keur.invoer;
  let uit;
  try {
    uit = await uitvoeren({ admin, profile, user }, g.actie.type, i);
  } catch (e) {
    uit = { error: e?.message || "Onbekende fout" };
  }
  const klaar = await zetStatus(admin, bezig, actieId, uit.error ? { status: "mislukt", resultaat: uit.error } : { status: "uitgevoerd", resultaat: uit.melding });
  // Een regel in het gesprek, zodat het model volgende keer weet wat er gebeurde.
  const { data: log } = await admin.from("coach_berichten").insert({
    gym_id: profile.gym_id, member_id: user.id, rol: "systeem",
    tekst: uit.error ? `✗ ${kaartTekst(g.actie).titel}: ${uit.error}` : `✓ ${uit.melding}`,
  }).select(KOLOMMEN).single();
  return { ...(uit.error ? { error: uit.error } : { ok: true }), checkoutUrl: uit.checkoutUrl || null, link: uit.link || null, bericht: klaar, log };
}

async function uitvoeren({ admin, profile, user }, type, i) {
  if (type === "stel_boeking_voor") {
    const { data: dienst } = await admin.from("services").select("id").eq("gym_id", profile.gym_id).eq("type", "fit60").eq("active", true).limit(1).maybeSingle();
    if (!dienst) return { error: "Geen gymsessie gevonden." };
    const r = await createBookingAction({ serviceId: dienst.id, date: i.datum, hour: i.uur, persons: 1, hours: i.duur, useWelcome: !!i.welkom, useCredit: !!i.metTegoed, coachId: null });
    if (r?.error) return { error: r.error };
    const wat = kaartTekst({ type, invoer: i }).regel;
    if (r.checkoutUrl) return { melding: `Moment vastgehouden: ${wat} — rond af met betalen.`, checkoutUrl: r.checkoutUrl };
    return { melding: `Geboekt: ${wat}. Je deurcode komt per mail.`, link: "/account" };
  }
  if (type === "stel_verplaatsing_voor") {
    const f = new FormData();
    f.set("bookingId", i.boeking_id); f.set("date", i.datum); f.set("hour", String(i.uur));
    const r = await rescheduleBookingAction(f);
    return r?.error ? { error: r.error } : { melding: `Verplaatst naar ${kaartTekst({ type, invoer: i }).regel.replace(/^naar /, "")}.`, link: "/account" };
  }
  if (type === "stel_oefeningwissel_voor") {
    // Eigendom: de plan-oefening hoort bij het plan van DEZE week van dit lid (keurVoorstel keek al in zijn eigen
    // dossier); hier alleen nog de schrijf-uitkomst nakijken.
    const { error, count } = await admin.from("program_exercises").update({ exercise_id: i.nieuwe_oefening_id }, { count: "exact" }).eq("id", i.plan_oefening_id);
    if (error || !count) return { error: "Wisselen lukte niet." };
    return { melding: `Gewisseld: ${i.van} → ${i.naar}.`, link: "/training" };
  }
  if (type === "stel_checkin_voor") {
    const f = new FormData();
    for (const [k, v] of Object.entries(i)) if (v != null && k !== "ok") f.set(k, k === "pijn" ? (v ? "ja" : "") : String(v));
    const r = await bewaarCheckin(f);
    return r?.error ? { error: r.error } : { melding: "Check-in verstuurd — je plan past zich aan." };
  }
  if (type === "stel_coach_voor") {
    await notifyAdmins({ gymId: profile.gym_id, type: "system", title: `🙋 ${profile.full_name || "Een lid"} vraagt een echte coach (via AI-coach)`, body: i.reden, link: `/beheer/leden/${user.id}`, actorId: user.id });
    return { melding: "Gevraagd — Fittin' neemt contact met je op. Een gratis intake plannen kan ook meteen.", link: "/personal-training#intake" };
  }
  return { error: "Onbekend voorstel." };
}

export async function vergeetFeit(index) {
  const mij = await wie();
  if (!mij) return { error: "Geen toegang." };
  const { data: geh } = await mij.admin.from("coach_geheugen").select("feiten").eq("member_id", mij.user.id).maybeSingle();
  const feiten = (geh?.feiten || []).filter((_, n) => n !== Number(index));
  const { error } = await mij.admin.from("coach_geheugen").update({ feiten, updated_at: new Date().toISOString() }).eq("member_id", mij.user.id);
  return error ? { error: "Vergeten lukte niet." } : { ok: true, feiten };
}

/** Het hele gesprek én het geheugen wissen. Het lid beslist; er is geen herstel. */
export async function wisGesprek() {
  const mij = await wie();
  if (!mij) return { error: "Geen toegang." };
  const [a, b] = await Promise.all([
    mij.admin.from("coach_berichten").delete().eq("member_id", mij.user.id),
    mij.admin.from("coach_geheugen").delete().eq("member_id", mij.user.id),
  ]);
  return a.error || b.error ? { error: "Wissen lukte niet helemaal. Probeer opnieuw." } : { ok: true };
}
