"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function markAllRead() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
  revalidatePath("/notificaties");
  return { ok: true };
}

export async function markRead(formData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("notifications").update({ read: true }).eq("id", formData.get("id")).eq("user_id", user.id);
  revalidatePath("/notificaties");
}

// Mark a single notification read by id (called from the client when a row is clicked, so the
// unread badge only clears for items the member actually opened — not everything on page load).
export async function markOne(id) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !id) return;
  await supabase.from("notifications").update({ read: true }).eq("id", id).eq("user_id", user.id);
  return { ok: true };
}
