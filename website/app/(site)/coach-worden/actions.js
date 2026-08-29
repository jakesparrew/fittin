"use server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendCoachApplyConfirmation, sendCoachApplyNotice } from "@/lib/email";
import { FORWARD_TO } from "@/lib/inbox";
import { notify } from "@/lib/notify";

// Publieke coach-aanmelding vanaf /coach-worden — zelfde patroon als de PT-intake: werkt zonder
// account (een coach die hier solliciteert ís nog geen gebruiker), landt als bericht in de
// beheer-Inbox, pingt de beheerders in-app, gaat door naar de eigenaarsmailbox met
// reply-to = de kandidaat, en bevestigt aan de kandidaat.
export async function applyAsCoach(formData) {
  // Honeypot: bots vullen elk veld in, mensen zien dit veld nooit. Stil accepteren en laten vallen.
  if (String(formData.get("website") || "").trim()) return { ok: true, already: true, message: "We hebben je aanmelding goed ontvangen." };

  const name = String(formData.get("name") || "").trim().slice(0, 120);
  const email = String(formData.get("email") || "").trim().toLowerCase().slice(0, 200);
  const phone = String(formData.get("phone") || "").trim().slice(0, 40);
  const specialty = String(formData.get("specialty") || "").trim().replace(/\s+/g, " ").slice(0, 120);
  const about = String(formData.get("about") || "").trim().slice(0, 2000);
  const socials = String(formData.get("socials") || "").trim().replace(/\s+/g, " ").slice(0, 300);
  if (!name) return { error: "Vul je naam in." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Vul een geldig e-mailadres in." };
  if (about.length < 20) return { error: "Vertel iets meer over jezelf — een paar zinnen volstaan." };

  const admin = createAdminClient();
  const { data: gym } = await admin.from("gyms").select("id").order("created_at").limit(1).single();
  if (!gym) return { error: "Er ging iets mis. Probeer het later opnieuw." };

  // Anti-misbruik: max 2 aanmeldingen per e-mailadres per dag. De rem telt op het onderwerp van de
  // inbound-rij, dus dat voorvoegsel mag nooit veranderen.
  const since = new Date(Date.now() - 86400000).toISOString();
  const { count } = await admin
    .from("inbound_emails")
    .select("id", { count: "exact", head: true })
    .eq("from_email", email)
    .ilike("subject", "Coach-aanmelding%")
    .gte("created_at", since);
  if ((count || 0) >= 2) return { ok: true, already: true, message: "We hebben je aanmelding al — we contacteren je snel." };

  const details = [
    specialty ? `Specialiteit: ${specialty}` : "",
    socials ? `Website / socials: ${socials}` : "",
  ].filter(Boolean).join("\n");
  const text = `${details ? `${details}\n\n` : ""}Naam: ${name}\nE-mail: ${email}${phone ? `\nTelefoon: ${phone}` : ""}\n\nOver de kandidaat:\n${about}`;

  const { error: insErr } = await admin.from("inbound_emails").insert({
    gym_id: gym.id,
    resend_id: `coach-apply-${crypto.randomUUID()}`, // synthetisch id — geen echte Resend-mail
    from_email: email,
    from_name: name,
    to_email: "coaches@fittin.be",
    subject: `Coach-aanmelding — ${name}`,
    text_body: text,
    received_at: new Date().toISOString(),
  });
  if (insErr) { console.error("coach apply insert:", insErr.message); return { error: "Er ging iets mis. Probeer het later opnieuw." }; }

  try {
    const { data: admins } = await admin.from("profiles").select("id").eq("gym_id", gym.id).eq("role", "beheerder");
    const body = [specialty, about].filter(Boolean).join(" · ").slice(0, 140) || email;
    for (const a of admins || []) {
      await notify({ gymId: gym.id, userId: a.id, type: "system", title: `Nieuwe coach-aanmelding: ${name}`, body, link: "/beheer/inbox" });
    }
  } catch (e) { console.error("coach apply notify:", e?.message); }
  try { await sendCoachApplyNotice({ to: FORWARD_TO, applicantName: name, applicantEmail: email, phone, specialty, socials, about }); } catch (e) { console.error("coach apply notice:", e?.message); }
  try { await sendCoachApplyConfirmation({ to: email, name }); } catch (e) { console.error("coach apply confirmation:", e?.message); }

  return { ok: true, message: "We hebben je aanmelding goed ontvangen." };
}
