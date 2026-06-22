// Clean, URL-safe slugs for public pages.
export function slugify(s) {
  return String(s || "")
    .normalize("NFKD").replace(/\p{Diacritic}/gu, "") // strip accents (é → e)
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Public href segment for a coach: a clean name-slug when possible, else the uuid (always resolvable).
export function coachSlug(coach) {
  return slugify(coach?.full_name) || coach?.id || "";
}

export const isUuid = (s) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ""));
