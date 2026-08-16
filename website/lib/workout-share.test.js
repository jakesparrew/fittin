import { describe, it, expect } from "vitest";
import { nieuwShareToken, SHARE_TOKEN_LEN, publiekSchema, kopieVelden, duoVoortgang, shareUrl } from "./workout-share.js";

describe("deel-token", () => {
  it("heeft de afgesproken lengte en bevat geen verwarrende tekens", () => {
    const t = nieuwShareToken();
    expect(t).toHaveLength(SHARE_TOKEN_LEN);
    // i/l/o/u ontbreken bewust: een deellink wordt overgetikt en die verwarren met 1/0.
    expect(t).not.toMatch(/[ilou]/);
    expect(t).toMatch(/^[a-z0-9]+$/);
  });

  it("geeft bij elke oproep iets anders", () => {
    const set = new Set(Array.from({ length: 200 }, () => nieuwShareToken()));
    expect(set.size).toBe(200);
  });

  it("bouwt een nette publieke URL", () => {
    expect(shareUrl("abc", "https://fittin.be")).toBe("https://fittin.be/w/abc");
  });
});

// Een gedeeld schema is een RECEPT, geen dagboek. Wat hier lekt, lekt naar het hele internet:
// de pagina is login-vrij. Daarom staan deze verwachtingen expliciet.
describe("publiekSchema", () => {
  const program = { name: "Push/Pull", subtitle: "3× per week", level: "gemiddeld", est_minutes: 45 };
  const dagen = [{
    name: "Dag 1", day_no: 1,
    oefeningen: [{
      sets: 4, reps: 8, rep_text: "8-10", rest_sec: 90, target_weight_kg: 82.5,
      exercise: { name: "Bench Press", slug: "bench-press", image_url: "/x.jpg" },
    }],
  }];

  it("toont het schema zelf", () => {
    const p = publiekSchema(program, dagen, "Floris Brugmans");
    expect(p.naam).toBe("Push/Pull");
    expect(p.dagen[0].oefeningen[0]).toMatchObject({ naam: "Bench Press", sets: 4, reps: "8-10", rust: 90 });
  });

  it("toont enkel de VOORNAAM van de deler", () => {
    expect(publiekSchema(program, dagen, "Floris Brugmans").door).toBe("Floris");
  });

  it("lekt het gewicht van de deler NIET — dat is zijn dagboek, niet het recept", () => {
    const json = JSON.stringify(publiekSchema(program, dagen, "Floris Brugmans"));
    expect(json).not.toContain("82.5");
    expect(json).not.toContain("target_weight");
  });

  it("overleeft een leeg schema", () => {
    expect(publiekSchema(null, [], "").dagen).toEqual([]);
  });
});

describe("kopieVelden", () => {
  const bron = { name: "Push/Pull", subtitle: "s", level: "l", is_public: true, slug: "push-pull", share_token: "tok", is_template: true };

  it("maakt een losse kopie voor de nieuwe eigenaar", () => {
    const k = kopieVelden(bron, "user-2", "gym-1");
    expect(k.member_id).toBe("user-2");
    expect(k.gym_id).toBe("gym-1");
    expect(k.name).toBe("Push/Pull (overgenomen)");
  });

  // Zonder dit zou een kopie onder dezelfde publieke link leven: bewerkt de overnemer zijn versie,
  // dan verandert wat de deler denkt gedeeld te hebben.
  it("neemt NOOIT de deellink, publicatie of slug over", () => {
    const k = kopieVelden(bron, "user-2", "gym-1");
    expect(k.share_token).toBeNull();
    expect(k.slug).toBeNull();
    expect(k.is_public).toBe(false);
    expect(k.is_template).toBe(false);
  });
});

describe("duoVoortgang", () => {
  const vandaag = "2026-08-17";
  const basis = {
    buddyIds: ["b1", "b2"],
    zichtbaar: ["b1", "b2"],
    vandaag,
    peIds: ["pe1", "pe2"],
    logs: [
      { user_id: "b1", logged_on: vandaag, program_exercise_id: "pe1", sets_json: [{}, {}, {}] },
      { user_id: "b1", logged_on: vandaag, program_exercise_id: "pe2", sets_json: [{}] },
      { user_id: "b2", logged_on: vandaag, program_exercise_id: "pe1", sets_json: [{}, {}] },
    ],
  };

  it("telt sets en oefeningen per buddy, drukste eerst", () => {
    const r = duoVoortgang(basis);
    expect(r).toEqual([
      { userId: "b1", oefeningen: 2, sets: 4 },
      { userId: "b2", oefeningen: 1, sets: 2 },
    ]);
  });

  it("toont niemand die zichtbaarheid NIET aanzette — ook al is hij buddy", () => {
    expect(duoVoortgang({ ...basis, zichtbaar: ["b2"] }).map((x) => x.userId)).toEqual(["b2"]);
  });

  it("toont geen vreemden, ook al staat hun zichtbaarheid aan", () => {
    expect(duoVoortgang({ ...basis, buddyIds: ["b1"] }).map((x) => x.userId)).toEqual(["b1"]);
  });

  it("negeert wat niet van vandaag is — samen trainen is een moment, geen archief", () => {
    const oud = { ...basis, logs: basis.logs.map((l) => ({ ...l, logged_on: "2026-07-01" })) };
    expect(duoVoortgang(oud)).toEqual([]);
  });

  it("negeert oefeningen buiten deze workout", () => {
    expect(duoVoortgang({ ...basis, peIds: ["pe2"] })).toEqual([{ userId: "b1", oefeningen: 1, sets: 1 }]);
  });

  it("geeft een lege lijst bij geen buddies", () => {
    expect(duoVoortgang({ ...basis, buddyIds: [], zichtbaar: [] })).toEqual([]);
  });
});
