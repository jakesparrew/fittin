"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncInbox, sendReply, sendEmail } from "@/lib/inbox";

const IDENTITIES = ["info@fittin.be", "boekingen@booking.fittin.be", "nieuwsbrief@news.fittin.be"];

export async function sendNewEmail(formData) {
  const { error } = await requireStaff(true);
  if (error) return { error };
  const from = IDENTITIES.includes(formData.get("from")) ? formData.get("from") : "info@fittin.be";
  const to = String(formData.get("to") || "").trim();
  const subject = String(formData.get("subject") || "").trim();
  const body = String(formData.get("body") || "").trim();
  if (!to.includes("@")) return { error: "Geldig e-mailadres vereist." };
  if (!subject) return { error: "Onderwerp vereist." };
  const r = await sendEmail({ from, to, subject, body });
  if (r?.error) return { error: r.error.message };
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
  revalidatePath(`/beheer/inbox/${id}`);
  return { ok: true };
}
