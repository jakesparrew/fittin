"use server";
import { createClient } from "@/lib/supabase/server";

// Mijn favorieten ophalen voor de bibliotheek. Aparte server action (geen deel van de gecachte
// pagina) zodat /oefeningen statisch en dus snel kan blijven voor Google en voor anonieme
// bezoekers; deze lijst komt er los bij zodra je ingelogd bent.
export async function myFavorites() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ingelogd: false, oefeningen: [] };
  const { data } = await supabase
    .from("exercise_favorites")
    .select("exercise:exercises(id, name, slug, category, muscle, primary_muscles, difficulty, equipment, image_url)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(60);
  return { ingelogd: true, oefeningen: (data || []).map((r) => r.exercise).filter(Boolean) };
}
