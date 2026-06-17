"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/staff";
import { slotInstant } from "@/lib/time";
import { notify } from "@/lib/notify";
import { uploadEventImage, parseFaq } from "@/lib/eventmedia";

const num = (v, d = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};
const cents = (v) => Math.round(parseFloat(String(v || "0").replace(",", ".")) * 100) || 0;

// ---------------- Challenges ----------------
export async function createChallenge(formData) {
  const { supabase, profile, error } = await requireStaff(true);
  if (error) return { error };
  const { error: e } = await supabase.from("challenges").insert({
    gym_id: profile.gym_id,
    name: formData.get("name"),
    goal_type: formData.get("goal_type") || "sessions",
    goal_count: num(formData.get("goal_count"), 1),
    starts_on: formData.get("starts_on") || null,
    ends_on: formData.get("ends_on") || null,
    reward_credits: num(formData.get("reward_credits"), 0),
  });
  if (e) return { error: e.message };
  revalidatePath("/beheer/challenges");
  revalidatePath("/community");
}

export async function deleteChallenge(formData) {
  const { supabase, error } = await requireStaff(true);
  if (error) return { error };
  await supabase.from("challenges").delete().eq("id", formData.get("id"));
  revalidatePath("/beheer/challenges");
}

// ---------------- Events ----------------
export async function createEvent(formData) {
  const { supabase, profile, error } = await requireStaff(true);
  if (error) return { error };
  const date = formData.get("date");
  const hour = num(formData.get("hour"), 18);
  const dur = num(formData.get("duration_min"), 60);
  const start = slotInstant(date, hour);
  const end = new Date(start.getTime() + dur * 60000);
  let image_url = null;
  try { image_url = await uploadEventImage(formData.get("image"), profile.gym_id); } catch (err) { return { error: err.message }; }
  const { error: e } = await supabase.from("events").insert({
    gym_id: profile.gym_id,
    title: formData.get("title"),
    description: formData.get("description") || null,
    image_url,
    faq: parseFaq(formData),
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    capacity: num(formData.get("capacity"), 12),
    price_cents: cents(formData.get("price_eur")),
    status: "approved", // admin-created → live immediately
    created_by: profile.id,
  });
  if (e) return { error: e.message };
  revalidatePath("/beheer/events");
  revalidatePath("/community");
  revalidatePath("/events");
  return { ok: true, message: "Event aangemaakt ✓" };
}

// Approve (or reject) a coach-submitted event.
export async function approveEvent(formData) {
  const { supabase, profile, error } = await requireStaff(true);
  if (error) return { error };
  const id = formData.get("id");
  const decision = formData.get("decision");
  const { data: ev } = await supabase.from("events").select("title, coach_id, gym_id").eq("id", id).maybeSingle();
  if (decision === "reject") {
    await supabase.from("events").delete().eq("id", id).eq("status", "pending");
    if (ev?.coach_id) await notify({ gymId: ev.gym_id || profile.gym_id, userId: ev.coach_id, type: "event", title: "Je event werd afgewezen", body: ev.title, link: "/coach/events" });
  } else {
    await supabase.from("events").update({ status: "approved" }).eq("id", id);
    if (ev?.coach_id) await notify({ gymId: ev.gym_id || profile.gym_id, userId: ev.coach_id, type: "event", title: "Je event is goedgekeurd 🎉", body: `${ev.title} staat nu live`, link: "/coach/events" });
  }
  revalidatePath("/beheer/events");
  revalidatePath("/community");
}

export async function deleteEvent(formData) {
  const { supabase, error } = await requireStaff(true);
  if (error) return { error };
  await supabase.from("events").delete().eq("id", formData.get("id"));
  revalidatePath("/beheer/events");
}
