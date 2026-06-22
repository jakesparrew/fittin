"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notify";
import { viewAsActive } from "@/lib/coach";

// Send a message in a coach↔client thread. The sender (auth user) must be either the coach or the
// client of the pair. Works from both the coach area and the member's training page.
export async function sendMessage(formData) {
  const coachId = formData.get("coachId");
  const clientId = formData.get("clientId");
  const body = String(formData.get("body") || "").trim();
  if (!coachId || !clientId || !body) return { error: "Schrijf een bericht." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };
  if (await viewAsActive()) return { error: "Alleen-lezen tijdens ‘bekijk als coach’." };
  if (user.id !== coachId && user.id !== clientId) return { error: "Geen toegang tot dit gesprek." };
  const { data: me } = await supabase.from("profiles").select("gym_id, full_name").eq("id", user.id).single();
  if (!me) return { error: "Profiel niet gevonden." };
  // Confirm the coach↔client relationship exists.
  const { data: link } = await supabase.from("coach_clients").select("id").eq("coach_id", coachId).eq("client_id", clientId).eq("status", "accepted").maybeSingle();
  if (!link) return { error: "Geen actieve coach-client koppeling." };

  const { error } = await supabase.from("coach_messages").insert({ gym_id: me.gym_id, coach_id: coachId, client_id: clientId, sender_id: user.id, body });
  if (error) return { error: error.message };

  const fromCoach = user.id === coachId;
  const other = fromCoach ? clientId : coachId;
  // Deep-link straight to the conversation: coach → client's training-thread; client → that client's thread.
  const notifLink = fromCoach ? "/training#berichten" : `/coach/berichten?client=${clientId}`;
  await notify({ gymId: me.gym_id, userId: other, actorId: user.id, type: "system", title: `Nieuw bericht van ${me.full_name || (fromCoach ? "je coach" : "je client")}`, body: body.slice(0, 80), link: notifLink });

  revalidatePath("/coach/berichten");
  revalidatePath("/training");
  return { ok: true };
}
