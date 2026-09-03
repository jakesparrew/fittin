import { describe, it, expect } from "vitest";
import { isCoachSessie, coachStats, statsVan, perWeek } from "@/lib/coach-stats";

// Deze regels bepalen wat er op /beheer/coaches als "sessies" en "laatst" staat. Tellen ze fout,
// dan lijkt een coach stil te liggen terwijl hij vorige week nog trainde — en daar bel je iemand
// over op. Vandaar dat elk geval dat in productie echt voorkomt hier vastligt.

const NU = new Date("2026-09-03T12:00:00Z");
const dagenGeleden = (n) => new Date(NU.getTime() - n * 86400000).toISOString();
const overDagen = (n) => new Date(NU.getTime() + n * 86400000).toISOString();

describe("isCoachSessie", () => {
  it("telt een bevestigde sessie ZONDER coach_billing", () => {
    // Dit is het geval waar een herontwerp bijna op sneuvelde: admin_create_booking zet geen
    // coach_billing, de trigger uit 0094 zet daar wél coach_id. Op productie zijn dat 6 van
    // Jelle's 24 sessies. Filteren op coach_billing zou die stilzwijgend wissen.
    expect(isCoachSessie({ coach_id: "c1", status: "bevestigd", coach_billing: null })).toBe(true);
  });
  it("telt een geannuleerde sessie niet", () => {
    expect(isCoachSessie({ coach_id: "c1", status: "geannuleerd", coach_billing: "credit" })).toBe(false);
  });
  it("telt een boeking zonder coach niet", () => {
    expect(isCoachSessie({ coach_id: null, status: "bevestigd" })).toBe(false);
  });
  it("valt niet over niets", () => {
    expect(isCoachSessie(null)).toBe(false);
  });
});

describe("coachStats", () => {
  const rijen = [
    { coach_id: "c1", status: "bevestigd", starts_at: dagenGeleden(3) },
    { coach_id: "c1", status: "bevestigd", starts_at: dagenGeleden(40), coach_billing: null },
    { coach_id: "c1", status: "bevestigd", starts_at: dagenGeleden(120) },   // buiten 90 dagen
    { coach_id: "c1", status: "geannuleerd", starts_at: dagenGeleden(1) },   // telt niet
    { coach_id: "c1", status: "bevestigd", starts_at: overDagen(5) },        // gepland
    { coach_id: "c2", status: "bevestigd", starts_at: dagenGeleden(74) },
  ];
  const map = coachStats(rijen, NU);

  it("telt enkel bevestigde, voorbije sessies in de 90 dagen", () => {
    expect(map.get("c1").sessies90).toBe(2);
  });
  it("telt alle bevestigde sessies in het totaal, ook geplande", () => {
    expect(map.get("c1").totaal).toBe(4);
  });
  it("telt geplande sessies apart", () => {
    expect(map.get("c1").gepland).toBe(1);
  });
  it("neemt een geplande sessie NIET als laatste sessie", () => {
    // Anders staat er "laatst: over 5 dagen" en lijkt iedereen met een boeking springlevend.
    expect(map.get("c1").dagenGeleden).toBe(3);
  });
  it("rekent dagen sinds de laatste sessie", () => {
    expect(map.get("c2").dagenGeleden).toBe(74);
  });
  it("geeft een nul-object voor een coach die nog nooit iets deed", () => {
    // Map.get geeft undefined, en undefined.sessies90 sloopt de pagina zodra er een coach bijkomt.
    expect(statsVan(map, "onbekend").sessies90).toBe(0);
    expect(statsVan(map, "onbekend").laatste).toBe(null);
  });
});

describe("perWeek", () => {
  const rijen = [
    { coach_id: "c1", status: "bevestigd", starts_at: dagenGeleden(1) },   // lopende week
    { coach_id: "c1", status: "bevestigd", starts_at: dagenGeleden(10) },
    { coach_id: "c1", status: "bevestigd", starts_at: dagenGeleden(11) },
    { coach_id: "c1", status: "geannuleerd", starts_at: dagenGeleden(12) },
    { coach_id: "c1", status: "bevestigd", starts_at: overDagen(2) },      // toekomst
  ];
  const { reeks, dezeWeek } = perWeek(rijen, NU, 12);

  it("levert 12 volledige weken", () => {
    expect(reeks).toHaveLength(12);
  });
  it("houdt de lopende week buiten de reeks", () => {
    // TrendLine zet de laatste waarde groot in beeld; een halve week naast volle weken leest als
    // een instorting die er niet is.
    expect(dezeWeek).toBe(1);
    expect(reeks.reduce((a, p) => a + p.value, 0)).toBe(2);
  });
  it("telt de toekomst niet mee", () => {
    expect(reeks.at(-1).value + dezeWeek).toBeLessThan(4);
  });
});
