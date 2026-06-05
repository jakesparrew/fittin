"use server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enrollSubscriberInDrips } from "@/lib/newsletter";

// Public newsletter signup (footer). Adds an active subscriber and starts any welcome drip.
export async function subscribeAction(_prev, formData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const name = String(formData.get("name") || "").trim() || null;
  if (!email.includes("@")) return { error: "Vul een geldig e-mailadres in." };

  const admin = createAdminClient();
  const { data: gym } = await admin.from("gyms").select("id").order("created_at").limit(1).single();
  if (!gym) return { error: "Even niet beschikbaar." };

  const { data: sub, error } = await admin
    .from("subscribers")
    .upsert(
      { gym_id: gym.id, email, name, source: "signup", status: "active" },
      { onConflict: "gym_id,email" }
    )
    .select("id, email, name, unsub_token, status")
    .single();
  if (error) return { error: "Inschrijven lukte niet, probeer later opnieuw." };

  try { await enrollSubscriberInDrips(gym.id, sub); } catch {}
  return { ok: true };
}
