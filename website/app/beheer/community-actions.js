"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/staff";
import { slotInstant } from "@/lib/time";

const num = (v, d = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};
const cents = (v) => Math.round(parseFloat(String(v || "0").replace(",", ".")) * 100) || 0;

// ---------------- Challenges ----------------
export async function createChallenge(formData) {
  const { supabase, profile, error } = await requireStaff();
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
  const { supabase, error } = await requireStaff();
  if (error) return { error };
  await supabase.from("challenges").delete().eq("id", formData.get("id"));
  revalidatePath("/beheer/challenges");
}

// ---------------- Events ----------------
export async function createEvent(formData) {
  const { supabase, profile, error } = await requireStaff();
  if (error) return { error };
  const date = formData.get("date");
  const hour = num(formData.get("hour"), 18);
  const dur = num(formData.get("duration_min"), 60);
  const start = slotInstant(date, hour);
  const end = new Date(start.getTime() + dur * 60000);
  const { error: e } = await supabase.from("events").insert({
    gym_id: profile.gym_id,
    title: formData.get("title"),
    description: formData.get("description") || null,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    capacity: num(formData.get("capacity"), 12),
    price_cents: cents(formData.get("price_eur")),
  });
  if (e) return { error: e.message };
  revalidatePath("/beheer/events");
  revalidatePath("/community");
}

export async function deleteEvent(formData) {
  const { supabase, error } = await requireStaff();
  if (error) return { error };
  await supabase.from("events").delete().eq("id", formData.get("id"));
  revalidatePath("/beheer/events");
}
