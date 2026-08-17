"use server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNewsletterConfirm } from "@/lib/email";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";

// Publieke nieuwsbriefinschrijving (footer), met dubbele opt-in.
//
// Waarom: dit formulier zette élk ingevuld adres meteen op 'active' én startte de welkomstreeks.
// Wie het adres van een ander intikte, liet dus mails van Fittin' bij een vreemde in de bus vallen
// — en de upsert zette een eerder UITGESCHREVEN adres gewoon terug op active, waardoor iemand
// ongevraagd heringeschreven kon worden. Nu:
//   • nieuw adres        → rij op 'pending' + één bevestigingsmail; pas de klik maakt 'active'
//   • uitgeschreven adres → status blijft staan; enkel de klik in de mail kan hem heropenen
//   • al actief           → geen nieuwe mail, geen verandering
// Antwoord is altijd hetzelfde, ook bij de daglimiet: wie hier zit te proberen mag niet kunnen
// aflezen of een adres al bekend is.
const NEUTRAAL = { ok: true, message: "Bijna klaar — check je mailbox en bevestig je inschrijving." };

export async function subscribeAction(_prev, formData) {
  const email = String(formData.get("email") || "").trim().toLowerCase().slice(0, 200);
  const name = String(formData.get("name") || "").trim().slice(0, 120) || null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Vul een geldig e-mailadres in." };

  const admin = createAdminClient();
  const { data: gym } = await admin.from("gyms").select("id").order("created_at").limit(1).single();
  if (!gym) return { error: "Even niet beschikbaar." };

  // Daglimiet, zoals het hulpformulier die al heeft: drie bevestigingsmails per adres per dag is
  // ruim genoeg voor iemand die de mail niet vindt, en te weinig om iemands mailbox te bestoken.
  const sinds = new Date(Date.now() - 86400000).toISOString();
  const { count } = await admin
    .from("email_log").select("id", { count: "exact", head: true })
    .eq("kind", "nieuwsbrief_bevestiging").eq("to_email", email).gte("created_at", sinds);
  if ((count || 0) >= 3) return NEUTRAAL;

  const { data: bestaand } = await admin
    .from("subscribers").select("id, name, status, unsub_token")
    .eq("gym_id", gym.id).eq("email", email).maybeSingle();

  if (bestaand?.status === "active") return { ok: true, message: "Je stond al op de lijst — tot in de volgende nieuwsbrief!" };

  let sub = bestaand;
  if (!sub) {
    const { data: nieuw, error } = await admin
      .from("subscribers")
      .insert({ gym_id: gym.id, email, name, source: "signup", status: "pending" })
      .select("id, name, status, unsub_token").single();
    if (error) return { error: "Inschrijven lukte niet, probeer later opnieuw." };
    sub = nieuw;
  } else if (name && !bestaand.name) {
    // Naam aanvullen mag; de status bewust NIET aanraken — dat is precies wat de klik moet doen.
    await admin.from("subscribers").update({ name }).eq("id", sub.id);
  }

  // Mislukt de mail, dan mag hier geen "check je mailbox" staan: die bevestiging komt dan nooit en
  // de bezoeker blijft wachten op iets dat niet onderweg is.
  const r = await sendNewsletterConfirm({
    to: email,
    name: name || sub.name,
    confirmUrl: `${SITE}/nieuwsbrief/bevestigen?token=${sub.unsub_token}`,
  });
  if (r?.ok === false) return { error: "De bevestigingsmail kon niet verstuurd worden. Probeer het later opnieuw of mail ons op info@fittin.be." };
  return NEUTRAAL;
}
