"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncInbox, sendReply, sendEmail } from "@/lib/inbox";

const IDENTITIES = ["info@fittin.be", "boekingen@booking.fittin.be", "nieuwsbrief@news.fittin.be"];

export async function sendNewEmail(formData) {
  const { profile, error } = await requireStaff(true);
  if (error) return { error };
  const from = IDENTITIES.includes(formData.get("from")) ? formData.get("from") : "info@fittin.be";
  // Accept multiple comma- (or semicolon-) separated recipients.
  const recipients = String(formData.get("to") || "")
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const subject = String(formData.get("subject") || "").trim();
  const body = String(formData.get("body") || "").trim();
  if (!recipients.length || recipients.some((r) => !r.includes("@"))) return { error: "Geef geldige e-mailadressen op (gescheiden door komma's)." };
  if (!subject) return { error: "Onderwerp vereist." };
  const r = await sendEmail({ from, to: recipients, subject, body });
  if (r?.error) return { error: r.error.message };
  // Log to the Sent view.
  try {
    await createAdminClient().from("sent_emails").insert({
      gym_id: profile.gym_id, from_email: from, to_email: recipients.join(", "), subject, body, sent_by: profile.id,
    });
  } catch {}
  revalidatePath("/beheer/inbox");
  return { ok: true };
}

export async function syncInboxAction() {
  const { profile, error } = await requireStaff(true);
  if (error) return { error };
  const res = await syncInbox(profile.gym_id);
  revalidatePath("/beheer/inbox");
  return res;
}

export async function markRead(id, read = true) {
  const { profile, error } = await requireStaff(true);
  if (error) return;
  await createAdminClient().from("inbound_emails").update({ read }).eq("id", id).eq("gym_id", profile.gym_id);
}

export async function archiveInbox(formData) {
  const { profile, error } = await requireStaff(true);
  if (error) return { error };
  await createAdminClient().from("inbound_emails").update({ archived: true }).eq("id", formData.get("id")).eq("gym_id", profile.gym_id);
  revalidatePath("/beheer/inbox");
  redirect("/beheer/inbox");
}

export async function replyInboxAction(formData) {
  const { profile, error } = await requireStaff(true);
  if (error) return { error };
  const id = formData.get("id");
  const body = String(formData.get("body") || "").trim();
  if (!body) return { error: "Schrijf een antwoord." };
  const admin = createAdminClient();
  const { data: m } = await admin.from("inbound_emails").select("*").eq("id", id).eq("gym_id", profile.gym_id).single();
  if (!m) return { error: "Bericht niet gevonden." };
  const r = await sendReply({ fromEmail: m.to_email, toEmail: m.from_email, subject: m.subject, body, inReplyTo: m.message_id });
  if (r?.error) return { error: r.error.message };
  await admin.from("inbound_emails").update({ read: true }).eq("id", id);
  try {
    await admin.from("sent_emails").insert({
      gym_id: profile.gym_id, from_email: m.to_email, to_email: m.from_email,
      subject: /^re:/i.test(m.subject || "") ? m.subject : "Re: " + (m.subject || ""), body, sent_by: profile.id, reply_to: id,
    });
  } catch {}
  revalidatePath(`/beheer/inbox/${id}`);
  return { ok: true };
}
