"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Creates a booking via the create_booking RPC (Brussels TZ + race-safe slot lock).
export async function createBookingAction({ serviceId, date, hour, persons, useWelcome }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Je moet ingelogd zijn om te boeken." };

  const { data, error } = await supabase.rpc("create_booking", {
    p_service: serviceId,
    p_date: date,
    p_hour: hour,
    p_persons: persons,
    p_use_welcome: !!useWelcome,
  });

  if (error) return { error: error.message };
  revalidatePath("/account");
  revalidatePath("/boeken");
  return { ok: true, bookingId: data };
}
