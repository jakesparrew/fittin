"use server";
import { revalidatePath } from "next/cache";
import { nagekeken, leesbareFout } from "@/lib/uitkomst";
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
    // Plafond op het aantal winnaars (0148). Zonder dit is er geen bovengrens op wat een challenge
    // kost. Leeg laten kan bewust — dan is er geen limiet — maar de wizard vult altijd iets in.
    max_winners: num(formData.get("max_winners"), null),
  });
  if (e) return { error: leesbareFout(e, "Challenge aanmaken") };
  revalidatePath("/beheer/challenges");
  revalidatePath("/community");
  return { ok: true, message: `Challenge "${formData.get("name")}" staat live ✓` };
}

export async function deleteChallenge(formData) {
  const { supabase, error } = await requireStaff(true);
  if (error) return { error };
  const res = await supabase.from("challenges").delete({ count: "exact" }).eq("id", formData.get("id"));
  const fout = nagekeken(res, "Challenge verwijderen");
  if (fout) return fout;
  revalidatePath("/beheer/challenges");
  return { ok: true, message: "Challenge verwijderd ✓" };
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
  if (!ev) return { error: "Dit event bestaat niet meer." };
  if (decision === "reject") {
    // Pas de coach verwittigen als het ook echt weg is — anders krijgt hij "afgewezen" voor een
    // event dat gewoon blijft staan (bv. omdat het al goedgekeurd was).
    const fout = nagekeken(await supabase.from("events").delete({ count: "exact" }).eq("id", id).eq("status", "pending"), "Event afwijzen");
    if (fout) return fout;
    if (ev?.coach_id) await notify({ gymId: ev.gym_id || profile.gym_id, userId: ev.coach_id, type: "event", title: "Je event werd afgewezen", body: ev.title, link: "/coach/events" });
  } else {
    const fout = nagekeken(await supabase.from("events").update({ status: "approved" }, { count: "exact" }).eq("id", id), "Event goedkeuren");
    if (fout) return fout;
    if (ev?.coach_id) await notify({ gymId: ev.gym_id || profile.gym_id, userId: ev.coach_id, type: "event", title: "Je event is goedgekeurd 🎉", body: `${ev.title} staat nu live`, link: "/coach/events" });
  }
  revalidatePath("/beheer/events");
  revalidatePath("/community");
  return { ok: true, message: decision === "reject" ? `"${ev.title}" afgewezen${ev.coach_id ? " — de coach is verwittigd" : ""} ✓` : `"${ev.title}" staat live${ev.coach_id ? " — de coach is verwittigd" : ""} ✓` };
}

export async function deleteEvent(formData) {
  const { supabase, error } = await requireStaff(true);
  if (error) return { error };
  const fout = nagekeken(await supabase.from("events").delete({ count: "exact" }).eq("id", formData.get("id")), "Event verwijderen");
  if (fout) return fout;
  revalidatePath("/beheer/events");
  return { ok: true, message: "Event verwijderd ✓" };
}
