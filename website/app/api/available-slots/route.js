import { createClient } from "@/lib/supabase/server";
import { getGymCached } from "@/lib/cache";

export const dynamic = "force-dynamic";

// Returns the taken (unavailable) slot start-times for a single day, so the reschedule picker can
// grey out slots that are already booked. Same source (gym_taken_slots RPC) the /boeken grid uses.
export async function GET(req) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date"); // YYYY-MM-DD
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ taken: [] });

  const gym = await getGymCached();
  if (!gym) return Response.json({ taken: [] });

  const from = new Date(`${date}T00:00:00`);
  const to = new Date(from.getTime() + 86400000);
  const supabase = await createClient();
  const { data } = await supabase.rpc("gym_taken_slots", {
    p_gym: gym.id,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  return Response.json({ taken: (data || []).map((t) => t.starts_at) });
}
