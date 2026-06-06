import { createAdminClient } from "@/lib/supabase/admin";

// Record a coach action in the audit log. Service-role; never blocks the underlying action.
export async function logCoachActivity({ gymId, coachId, type, summary, refId = null }) {
  if (!gymId || !coachId || !type || !summary) return;
  try {
    await createAdminClient().from("coach_activity").insert({ gym_id: gymId, coach_id: coachId, type, summary, ref_id: refId });
  } catch {}
}
