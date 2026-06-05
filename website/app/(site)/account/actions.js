"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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

  await supabase
    .from("bookings")
    .update({ status: "geannuleerd", cancelled_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .gt("starts_at", new Date().toISOString());

  revalidatePath("/account");
  revalidatePath("/boeken");
}
