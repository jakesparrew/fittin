import { describe, it, expect } from "vitest";
import { bouwDagen, kiesDagId, schatMinuten, sessieResultaat } from "@/lib/training-dagen";

// De dagkeuze bepaalt welk scherm een lid opent als hij op "Start training" tikt. Kiest ze de
// verkeerde dag, dan traint iemand twee keer borst en nooit benen — en dat merkt niemand aan een
// foutmelding, want er faalt niets. Vandaar deze tests.

const prog = (dagen) => ({
  program_days: dagen.map((d, i) => ({
    id: d.id, day_no: d.day_no ?? i + 1, name: d.name || null,
    program_exercises: (d.ex || []).map((e) => ({
      id: e.id, position: e.position ?? 0, sets: e.sets ?? 3, reps: 10, rest_sec: e.rest ?? 90,
      exercises: { id: "x", name: e.id },
    })),
  })),
});
const D3 = prog([
  { id: "d1", ex: [{ id: "a" }, { id: "b" }] },
  { id: "d2", ex: [{ id: "c" }] },
  { id: "d3", ex: [{ id: "e" }] },
]);
const log = (pe, dag, sets = [{ reps: 10, weight_kg: 20 }]) => ({ program_exercise_id: pe, logged_on: dag, sets_json: sets, created_at: dag });

describe("kiesDagId", () => {
  it("begint bij dag 1 als er nog nooit gelogd is", () => {
    expect(kiesDagId(bouwDagen(D3, [], "2026-08-30"), [], "2026-08-30")).toBe("d1");
  });

  it("blijft op de dag waar je vandaag al mee bezig bent", () => {
    const logs = [log("c", "2026-08-30")];
    expect(kiesDagId(bouwDagen(D3, logs, "2026-08-30"), logs, "2026-08-30")).toBe("d2");
  });

  it("schuift door naar de volgende dag na een eerdere sessie", () => {
    const logs = [log("a", "2026-08-28")];
    expect(kiesDagId(bouwDagen(D3, logs, "2026-08-30"), logs, "2026-08-30")).toBe("d2");
  });

  it("loopt rond: na de laatste dag volgt weer dag 1", () => {
    const logs = [log("e", "2026-08-29")];
    expect(kiesDagId(bouwDagen(D3, logs, "2026-08-30"), logs, "2026-08-30")).toBe("d1");
  });

  it("kijkt naar de MEEST RECENTE eerdere dag, niet naar de eerste in de lijst", () => {
    const logs = [log("a", "2026-08-20"), log("c", "2026-08-29")]; // d1 oud, d2 recent
    expect(kiesDagId(bouwDagen(D3, logs, "2026-08-30"), logs, "2026-08-30")).toBe("d3");
  });

  it("negeert logs van oefeningen die niet in dit programma zitten", () => {
    const logs = [log("van-een-ander-programma", "2026-08-29")];
    expect(kiesDagId(bouwDagen(D3, logs, "2026-08-30"), logs, "2026-08-30")).toBe("d1");
  });

  it("geeft null bij een programma zonder dagen in plaats van te crashen", () => {
    expect(kiesDagId([], [], "2026-08-30")).toBe(null);
    expect(kiesDagId(null, null, "2026-08-30")).toBe(null);
  });
});

describe("bouwDagen", () => {
  it("sorteert oefeningen op position, en op id waar position nog 0 is", () => {
    const p = prog([{ id: "d1", ex: [{ id: "zzz", position: 0 }, { id: "aaa", position: 0 }, { id: "eerst", position: 1 }] }]);
    // position 1 wint van 0; binnen dezelfde 0 beslist het id.
    expect(bouwDagen(p, [], "2026-08-30")[0].exercises.map((e) => e.peId)).toEqual(["aaa", "zzz", "eerst"]);
  });

  it("markeert alleen wat VANDAAG gelogd is als klaar, en bewaart de vorige sessie apart", () => {
    const logs = [log("a", "2026-08-30", [{ reps: 8, weight_kg: 60 }]), log("a", "2026-08-28", [{ reps: 8, weight_kg: 55 }])];
    const pe = bouwDagen(D3, logs, "2026-08-30")[0].exercises[0];
    expect(pe.doneToday).toBe(true);
    expect(pe.lastSets).toEqual([{ reps: 8, weight_kg: 55 }]); // de sessie van eergisteren
    expect(pe.pr).toBe(60);
  });

  it("overleeft een programma zonder dagen", () => {
    expect(bouwDagen(null, [], "2026-08-30")).toEqual([]);
  });
});

describe("schatMinuten", () => {
  it("rondt af op vijf minuten en zakt nooit onder tien", () => {
    expect(schatMinuten([{ sets: 1, rest_sec: 0 }])).toBe(10);
    const m = schatMinuten([{ sets: 3, rest_sec: 90 }, { sets: 3, rest_sec: 90 }]);
    expect(m % 5).toBe(0);
    expect(m).toBe(15); // 6 sets x 130s = 780s = 13 min -> 15
  });

  it("rekent met 90s rust als de coach niets invulde", () => {
    expect(schatMinuten([{ sets: 3 }])).toBe(schatMinuten([{ sets: 3, rest_sec: 90 }]));
  });
});

describe("sessieResultaat", () => {
  it("telt sets en volume van vandaag, niet van eerdere dagen", () => {
    const logs = [
      log("a", "2026-08-30", [{ reps: 10, weight_kg: 20 }, { reps: 8, weight_kg: 20 }]),
      log("b", "2026-08-28", [{ reps: 10, weight_kg: 100 }]),
    ];
    const dag = bouwDagen(D3, logs, "2026-08-30")[0];
    const r = sessieResultaat(dag, logs, "2026-08-30");
    expect(r.oefeningen).toBe(1);
    expect(r.totaal).toBe(2);
    expect(r.sets).toBe(2);
    expect(r.volume).toBe(10 * 20 + 8 * 20); // 360, de 100kg van eergisteren telt niet mee
  });
});
