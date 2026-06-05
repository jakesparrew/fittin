"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { sendBookingCancelled } from "@/lib/email";

// Cancel one of the caller's own future bookings (free until 24h before per house rules;
// MVP allows cancel up to start time). Flipping status off 'bevestigd' frees the slot.
export async function cancelBookingAction(formData) {
  const id = formData.get("bookingId");
  if (!id) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Cancellation window: members may cancel up to gym.cancel_hours before the start.
  const { data: me } = await supabase.from("profiles").select("email, full_name, gym_id").eq("id", user.id).single();
  const { data: gym } = me?.gym_id ? await supabase.from("gyms").select("cancel_hours").eq("id", me.gym_id).single() : { data: null };
  const cancelHours = gym?.cancel_hours ?? 1;
  const cutoff = new Date(Date.now() + cancelHours * 3600000).toISOString();

  const { data: cancelled } = await supabase
    .from("bookings")
    .update({ status: "geannuleerd", cancelled_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .gt("starts_at", cutoff)
    .select("starts_at, services(name)")
    .maybeSingle();

  if (!cancelled) {
    return { error: cancelHours > 0 ? `Je kan tot ${cancelHours} uur voor de sessie annuleren.` : "Annuleren niet meer mogelijk." };
  }

  await sendBookingCancelled({ to: me?.email, name: me?.full_name, serviceName: cancelled.services?.name || "Sessie", startsAt: cancelled.starts_at });
  revalidatePath("/account");
  revalidatePath("/boeken");
  return { ok: true };
}

// Open the gym door during an active booking. open_door() authorises (active booking only) + logs.
// Physically unlocks via the Nuki Web API when configured; otherwise reports an honest pending
// state instead of a false "opened" (so the UI never lies to the member).
export async function openDoorAction() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("open_door");
  if (error) return { error: error.message }; // e.g. "Je hebt nu geen actieve boeking."

  const token = process.env.NUKI_API_TOKEN;
  const lock = process.env.NUKI_SMARTLOCK_ID;
  if (!token || !lock) return { pending: true }; // door hardware not connected yet

  try {
    const r = await fetch(`https://api.nuki.io/smartlock/${lock}/action`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: 3 }), // 3 = unlatch (open)
    });
    if (!r.ok) return { error: "De deur reageerde niet. Probeer opnieuw of bel ons even." };
    return { ok: true };
  } catch {
    return { error: "Kon het deursysteem niet bereiken. Probeer opnieuw." };
  }
}
