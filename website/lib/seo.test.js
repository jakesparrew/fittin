import { describe, it, expect } from "vitest";
import { isDutchExercise, IMPORTED_EXERCISE_SOURCE } from "./seo.js";

// Deze regel bepaalt zowel wat in de sitemap staat als welke detailpagina noindex krijgt. Loopt ze
// uiteen, dan de-indexeert er niets (sitemap-only) of blijven er dode URL's staan (noindex-only).
describe("isDutchExercise", () => {
  it("houdt overgenomen Engelse oefeningen buiten de index", () => {
    expect(isDutchExercise({ slug: "barbell-curl", source: IMPORTED_EXERCISE_SOURCE })).toBe(false);
  });
  it("laat eigen en vertaalde oefeningen door", () => {
    expect(isDutchExercise({ slug: "bench-press", source: "gym" })).toBe(true);
  });
  it("behandelt een lege source als eigen content (kolomdefault is 'gym')", () => {
    expect(isDutchExercise({ slug: "push-up", source: null })).toBe(true);
    expect(isDutchExercise({ slug: "push-up" })).toBe(true);
  });
});
