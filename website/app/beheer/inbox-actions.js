"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncInbox, sendReply } from "@/lib/inbox";

export async function syncInboxAction() {
  const { profile, error } = await requireStaff(true);
  if (error) return { error };
  const res = await syncInbox(profile.gym_id);
  revalidatePath("/beheer/inbox");
  return res;
}

export async function markRead(id, read = true) {
  const admin = createAdminClient();
  await admin.from("inbound_emails").update({ read }).eq("id", id);
}

export async function archiveInbox(formData) {
  const { error } = await requireStaff(true);
  if (error) return { error };
  const admin = createAdminClient();
  await admin.from("inbound_emails").update({ archived: true }).eq("id", formData.get("id"));
  revalidatePath("/beheer/inbox");
  redirect("/beheer/inbox");
}

export async function replyInboxAction(formData) {
  const { error } = await requireStaff(true);
  if (error) return { error };
  const id = formData.get("id");
  const body = String(formData.get("body") || "").trim();
  if (!body) return { error: "Schrijf een antwoord." };
  const admin = createAdminClient();
  const { data: m } = await admin.from("inbound_emails").select("*").eq("id", id).single();
  if (!m) return { error: "Bericht niet gevonden." };
  const r = await sendReply({ fromEmail: m.to_email, toEmail: m.from_email, subject: m.subject, body, inReplyTo: m.message_id });
  if (r?.error) return { error: r.error.message };
  await admin.from("inbound_emails").update({ read: true }).eq("id", id);
  revalidatePath(`/beheer/inbox/${id}`);
  return { ok: true };
}
