import { getGymCached } from "@/lib/cache";

// Batch 7.3 — single-gym pragmatism, documented in ONE place.
//
// Fittin' is one physical gym today, so ~everything resolves "the gym" as the first (and only) row.
// `getGymCached()` (lib/cache) already does this behind Next's Data Cache and is what pages should use.
// This module exists as the single, obvious swap-point the day a second gym arrives: at that moment,
// replace the body of getGym() with real tenant resolution (subdomain / path / session gym_id) and
// every caller that went through here follows along. New code should import getGym from here rather
// than reaching for getGymCached directly, so the eventual multi-tenant switch is a one-file change.
export async function getGym() {
  return getGymCached();
}
