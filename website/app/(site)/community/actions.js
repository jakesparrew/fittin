"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendEventSignup } from "@/lib/email";

export async function redeemReferral(formData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("redeem_referral", { p_code: formData.get("code") });
  revalidatePath("/community");
  if (error) return { error: error.message };
  return { ok: true };
}

export async function signupEvent(formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { data: profile } = await supabase.from("profiles").select("gym_id, email, full_name").eq("id", user.id).single();
  if (!profile) return;
  const eventId = formData.get("eventId");
  const { error } = await supabase.from("event_signups").insert({
    gym_id: profile.gym_id,
    event_id: eventId,
    user_id: user.id,
  });
  if (!error && profile.email) {
    const { data: ev } = await supabase.from("events").select("title, starts_at").eq("id", eventId).maybeSingle();
    if (ev) await sendEventSignup({ to: profile.email, name: profile.full_name, title: ev.title, startsAt: ev.starts_at });
  }
  revalidatePath("/community");
}

export async function cancelSignup(formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("event_signups").delete().eq("id", formData.get("signupId")).eq("user_id", user.id);
  revalidatePath("/community");
}
