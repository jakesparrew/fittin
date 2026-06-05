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

  const { data: cancelled } = await supabase
    .from("bookings")
    .update({ status: "geannuleerd", cancelled_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .gt("starts_at", new Date().toISOString())
    .select("starts_at, services(name)")
    .maybeSingle();

  if (cancelled) {
    const { data: me } = await supabase.from("profiles").select("email, full_name").eq("id", user.id).single();
    await sendBookingCancelled({ to: me?.email, name: me?.full_name, serviceName: cancelled.services?.name || "Sessie", startsAt: cancelled.starts_at });
  }

  revalidatePath("/account");
  revalidatePath("/boeken");
}

// Open the gym door during an active booking (logs access; Nuki call would follow server-side).
export async function openDoorAction() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("open_door");
  if (error) return { error: error.message };
  // TODO: server-side Nuki Web API call to physically unlock, using NUKI_API_TOKEN.
  return { ok: true };
}
