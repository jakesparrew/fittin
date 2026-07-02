"use server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendIntakeConfirmation, sendIntakeNotice } from "@/lib/email";
import { FORWARD_TO } from "@/lib/inbox";
import { notify } from "@/lib/notify";

// Public "gratis intake & proeftraining" request — the redeem path for every PT CTA. Works without
// an account (PT prospects are usually not members yet). The request lands in the superadmin Inbox
// (as a normal customer message), pings the beheerders in-app, forwards to the owner mailbox with
// reply-to = prospect, and confirms to the prospect.
export async function requestIntake(formData) {
  // Honeypot: bots fill every field; humans never see this one. Silently accept + drop.
  if (String(formData.get("website") || "").trim()) return { ok: true, message: "Aanvraag verstuurd ✓" };

  const name = String(formData.get("name") || "").trim().slice(0, 120);
  const email = String(formData.get("email") || "").trim().toLowerCase().slice(0, 200);
  const phone = String(formData.get("phone") || "").trim().slice(0, 40);
  const goal = String(formData.get("goal") || "").trim().slice(0, 2000);
  if (!name) return { error: "Vul je naam in." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Vul een geldig e-mailadres in." };

  const admin = createAdminClient();
  const { data: gym } = await admin.from("gyms").select("id").order("created_at").limit(1).single();
  if (!gym) return { error: "Er ging iets mis. Probeer het later opnieuw." };

  // Anti-abuse: max 3 requests per e-mail address per day.
  const since = new Date(Date.now() - 86400000).toISOString();
  const { count } = await admin
    .from("inbound_emails")
    .select("id", { count: "exact", head: true })
    .eq("from_email", email)
    .ilike("subject", "PT-intake%")
    .gte("created_at", since);
  if ((count || 0) >= 3) return { ok: true, message: "We hebben je aanvraag al — we contacteren je snel!" };

  const text = `Naam: ${name}\nE-mail: ${email}${phone ? `\nTelefoon: ${phone}` : ""}\n\nDoel / vraag:\n${goal || "(niet ingevuld)"}`;
  const { error: insErr } = await admin.from("inbound_emails").insert({
    gym_id: gym.id,
    resend_id: `intake-${crypto.randomUUID()}`, // synthetic id — not a Resend message
    from_email: email,
    from_name: name,
    to_email: "intake@fittin.be",
    subject: `PT-intake aanvraag — ${name}`,
    text_body: text,
    received_at: new Date().toISOString(),
  });
  if (insErr) { console.error("intake insert:", insErr.message); return { error: "Er ging iets mis. Probeer het later opnieuw." }; }

  try {
    const { data: admins } = await admin.from("profiles").select("id").eq("gym_id", gym.id).eq("role", "beheerder");
    for (const a of admins || []) {
      await notify({ gymId: gym.id, userId: a.id, type: "system", title: `Nieuwe PT-intake: ${name}`, body: goal ? goal.slice(0, 120) : email, link: "/beheer/inbox" });
    }
  } catch (e) { console.error("intake notify:", e?.message); }
  try { await sendIntakeNotice({ to: FORWARD_TO, prospectName: name, prospectEmail: email, phone, goal }); } catch (e) { console.error("intake notice:", e?.message); }
  try { await sendIntakeConfirmation({ to: email, name }); } catch (e) { console.error("intake confirmation:", e?.message); }

  return { ok: true, message: "Aanvraag verstuurd ✓ — we contacteren je snel!" };
}
