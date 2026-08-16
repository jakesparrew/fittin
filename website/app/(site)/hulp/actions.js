"use server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";

// Hulpvraag vanaf /hulp. Werkt bewust voor IEDEREEN, ook zonder account: wie niet kan inloggen of
// nog geen lid is, heeft juist het meest behoefte aan een hulpknop. De bestaande meldfunctie op
// /account vereist een sessie en dekt dat geval dus niet.
//
// Ingelogd  → problem_reports (verschijnt bij Meldingen) + belletje bij elke beheerder.
// Anoniem   → inbound_emails (verschijnt in de Inbox), met honeypot en een dagelijkse limiet,
//             zodat een formulier op een publieke pagina geen spamkanaal wordt.
export async function sendHelpRequest(formData) {
  // Honeypot: bots vullen elk veld in, mensen zien dit veld nooit. Stil accepteren en laten vallen —
  // een bot die een foutmelding krijgt, probeert opnieuw.
  if (String(formData.get("website") || "").trim()) return { ok: true, message: "Bedankt! We nemen snel contact op." };

  const bericht = String(formData.get("message") || "").trim().slice(0, 2000);
  if (bericht.length < 5) return { error: "Beschrijf kort waarmee we je kunnen helpen." };
  const pad = String(formData.get("page") || "").slice(0, 300) || null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = createAdminClient();

  if (user) {
    const { data: p } = await admin.from("profiles").select("gym_id, full_name").eq("id", user.id).single();
    if (!p?.gym_id) return { error: "Geen gym gevonden bij je account." };
    const { error } = await admin.from("problem_reports").insert({ gym_id: p.gym_id, user_id: user.id, message: bericht, page: pad });
    if (error) return { error: error.message };
    try {
      const { data: beheerders } = await admin.from("profiles").select("id").eq("gym_id", p.gym_id).eq("role", "beheerder");
      for (const b of beheerders || []) {
        await notify({
          gymId: p.gym_id, userId: b.id, actorId: user.id, type: "system",
          title: `🛟 Hulpvraag van ${p.full_name || "een lid"}`,
          body: bericht.slice(0, 80), link: "/beheer/meldingen",
        });
      }
    } catch { /* melden mag nooit falen omdat een belletje niet lukt */ }
    return { ok: true, message: "Bedankt! We bekijken het zo snel mogelijk en antwoorden je per mail. 🙏" };
  }

  // ---- Anoniem ----
  const naam = String(formData.get("name") || "").trim().slice(0, 120);
  const email = String(formData.get("email") || "").trim().toLowerCase().slice(0, 200);
  if (!naam) return { error: "Vul je naam in." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Vul een geldig e-mailadres in zodat we kunnen antwoorden." };

  const { data: gym } = await admin.from("gyms").select("id").order("created_at").limit(1).single();
  if (!gym) return { error: "Er ging iets mis. Probeer het later opnieuw." };

  // Max 3 hulpvragen per adres per dag — genoeg voor een echt probleem, te weinig om te spammen.
  const sinds = new Date(Date.now() - 86400000).toISOString();
  const { count } = await admin
    .from("inbound_emails").select("id", { count: "exact", head: true })
    .eq("from_email", email).ilike("subject", "Hulpvraag%").gte("created_at", sinds);
  if ((count || 0) >= 3) return { ok: true, message: "We hebben je vraag al ontvangen — we antwoorden zo snel mogelijk." };

  const tekst = `Naam: ${naam}\nE-mail: ${email}${pad ? `\nPagina: ${pad}` : ""}\n\nVraag:\n${bericht}`;
  const { error } = await admin.from("inbound_emails").insert({
    gym_id: gym.id,
    resend_id: `hulp-${crypto.randomUUID()}`, // synthetisch id — dit kwam niet via Resend binnen
    from_email: email,
    from_name: naam,
    subject: `Hulpvraag van ${naam}`,
    text_body: tekst,
  });
  if (error) return { error: "Versturen lukte niet. Mail ons gerust rechtstreeks op info@fittin.be." };
  return { ok: true, message: "Bedankt! We antwoorden zo snel mogelijk op het adres dat je opgaf. 🙏" };
}
