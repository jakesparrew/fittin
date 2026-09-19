import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { veiligheid, limiet, schoon, opening, systeemTekst, metPijnRegel, PIJN_REGEL, DAGLIMIET, MAX_LENGTE } from "./chat-regels.js";
import { keurMoment, keurVerplaatsing, keurWissel, keurCheckin, keurCoach, keurFeit, voegFeitToe, isoVan, isVrij, vrijeUren, promoOp, kaartTekst, GEREEDSCHAP, VOORSTEL, LEZEN, MAX_FEITEN } from "./chat-tools.js";

const lees = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
// Dinsdag 22-09-2026 10:00 Brussel = 08:00 UTC.
const NU = new Date("2026-09-22T08:00:00Z");

describe("coach-chat: veiligheid zonder model", () => {
  it("herkent noodgevallen en crisis, en laat een zware set met rust", () => {
    expect(veiligheid("Ik heb pijn op de borst tijdens het lopen")).toBe("spoed");
    expect(veiligheid("ik kan niet meer ademen")).toBe("spoed");
    expect(veiligheid("mijn vriend is flauwgevallen in de zaal")).toBe("spoed");
    expect(veiligheid("soms wil ik niet meer leven")).toBe("crisis");
    expect(veiligheid("I want to kill myself")).toBe("crisis");
    expect(veiligheid("mijn knie doet pijn bij squats")).toBe("pijn");
    expect(veiligheid("ik was helemaal buiten adem na de sprint")).toBe(null);
    expect(veiligheid("ik heb spierpijn van gisteren")).toBe(null);
    expect(veiligheid("zoek een moment voor morgen")).toBe(null);
  });
  it("spoed en crisis gaan NOOIT naar het model", () => {
    const r = lees("app/api/coaching/chat/route.js");
    const v = r.indexOf("veiligheid(");
    const m = r.indexOf("roepMetTerugval(");
    expect(v).toBeGreaterThan(0);
    expect(m).toBeGreaterThan(v);
    expect(r).toMatch(/vlag === "spoed" \|\| vlag === "crisis"/);
  });
});

describe("coach-chat: pijn", () => {
  it("het stopadvies staat er altijd, ook als het model het vergat", () => {
    expect(metPijnRegel("Dat is genoteerd. Wil je dat ik je doorverwijs?")).toContain(PIJN_REGEL);
    expect(metPijnRegel("Stop met squats en ga langs bij een kinesist.")).not.toContain(PIJN_REGEL);
    expect(lees("app/api/coaching/chat/route.js")).toMatch(/if \(vlag === "pijn"\) antwoord = metPijnRegel\(antwoord\)/);
  });
});

describe("coach-chat: limieten", () => {
  it("dag- en minuutlimiet", () => {
    expect(limiet({ vandaag: 0, laatsteMinuut: 0 })).toBe(null);
    expect(limiet({ vandaag: DAGLIMIET, laatsteMinuut: 0 })).toMatch(/limiet/);
    expect(limiet({ vandaag: 3, laatsteMinuut: 4 })).toMatch(/minuutje/);
  });
  it("schoon kort af en plet witruimte", () => {
    expect(schoon("  hoi \n\n daar ")).toBe("hoi daar");
    expect(schoon("x".repeat(2000))).toHaveLength(MAX_LENGTE);
  });
  it("de route telt en remt vóór het model", () => {
    const r = lees("app/api/coaching/chat/route.js");
    expect(r.indexOf("limiet(")).toBeLessThan(r.indexOf("roepMetTerugval("));
    expect(r.indexOf("magNogOfBoek(")).toBeLessThan(r.indexOf("roepMetTerugval("));
    expect(r).toMatch(/CHAT_BUDGET_DEEL/);
    expect(r).toMatch(/coach_chat_akkoord_at/);
    expect(r).toMatch(/await wie\(\)/);
  });
});

describe("coach-chat: de systeemtekst", () => {
  it("zegt testfase, geen diagnose, niets zelf uitvoeren, gegevens ≠ opdracht", () => {
    const s = systeemTekst({ context: "Tegoed: 2", nu: "di 22 sep 10:00" });
    expect(s).toMatch(/TESTFASE/);
    expect(s).toMatch(/GEEN diagnose/);
    expect(s).toMatch(/voert NIETS zelf uit/);
    expect(s).toMatch(/<gegevens>[\s\S]*Tegoed: 2[\s\S]*<\/gegevens>/);
    expect(s).toMatch(/geen opdracht/);
  });
  it("de context bevat geen naam of e-mail (privacy punt 3)", () => {
    const c = lees("lib/coaching/chat-context.js");
    const tekstDeel = c.slice(c.indexOf("const r = [];"), c.indexOf("tekst: r.join"));
    expect(tekstDeel.length).toBeGreaterThan(500);
    expect(tekstDeel).not.toMatch(/full_name|email|phone|telefoon|adres|geboortedatum/);
    // lichaamsgegevens enkel via bouwContext (die de toestemming afdwingt)
    expect(tekstDeel).not.toMatch(/gewicht_kg|coaching_beperkingen/);
    expect(tekstDeel).toMatch(/contextTekst\(bouwContext\(profiel/);
  });
});

describe("coach-chat: opening zonder model", () => {
  it("check-in gaat voor, dan het tekort, dan de volgende sessie", () => {
    expect(opening({ naam: "An", plan: { checkinOpen: true } }).tekst).toMatch(/Hoi An!.*hoe ging het/);
    const t = opening({ plan: { gepland: 3, gedaan: 1, geboektDezeWeek: 1 }, rustig: true });
    expect(t.tekst).toMatch(/nog 1 sessie zonder boeking.*rustig uur/);
    expect(opening({ volgende: "2026-09-23T16:00:00Z" }).tekst).toMatch(/volgende sessie is woensdag/);
    expect(opening({}).keuzes.length).toBe(3);
  });
});

describe("coach-chat: voorstellen keuren", () => {
  const ramen = { nu: NU, open: 6, dicht: 23 };
  it("een moment: vol uur, geldige duur, open, niet voorbij, niet te ver", () => {
    expect(keurMoment({ datum: "2026-09-23", uur: 18, duur: 1 }, ramen).ok).toBe(true);
    expect(keurMoment({ datum: "2026-09-23", uur: 18.5, duur: 1 }, ramen).fout).toMatch(/vol uur/);
    expect(keurMoment({ datum: "2026-09-23", uur: 22, duur: 2 }, ramen).fout).toMatch(/open van/);
    expect(keurMoment({ datum: "2026-09-23", uur: 18, duur: 5 }, ramen).fout).toMatch(/duur/);
    expect(keurMoment({ datum: "2026-09-22", uur: 9, duur: 1 }, ramen).fout).toMatch(/voorbij/);
    expect(keurMoment({ datum: "2026-11-30", uur: 9, duur: 1 }, ramen).fout).toMatch(/vooruit/);
    expect(keurMoment({ datum: "23-09-2026", uur: 9 }, ramen).fout).toMatch(/YYYY/);
  });
  it("isoVan rekent in Brussel (zomertijd)", () => {
    expect(isoVan("2026-09-23", 18)).toBe("2026-09-23T16:00:00.000Z");
    expect(isoVan("2026-12-02", 18.5)).toBe("2026-12-02T17:30:00.000Z");
  });
  it("vrij = elk halfuur vrij", () => {
    const bezet = new Set([new Date("2026-09-23T16:30:00Z").getTime()]);
    expect(isVrij("2026-09-23", 18, 1, bezet)).toBe(false);
    expect(isVrij("2026-09-23", 17, 1, bezet)).toBe(true);
    expect(isVrij("2026-09-23", 17, 2, bezet)).toBe(false);
  });
  it("verplaatsen: enkel eigen boeking, tot 6 uur vooraf", () => {
    const boekingen = [
      { id: "b1", starts_at: "2026-09-24T16:00:00Z", ends_at: "2026-09-24T17:00:00Z" },
      { id: "b2", starts_at: "2026-09-22T11:00:00Z", ends_at: "2026-09-22T12:00:00Z" },
    ];
    expect(keurVerplaatsing({ boeking_id: "b1", datum: "2026-09-25", uur: 9 }, { ...ramen, boekingen }).ok).toBe(true);
    expect(keurVerplaatsing({ boeking_id: "bX", datum: "2026-09-25", uur: 9 }, { ...ramen, boekingen }).fout).toMatch(/niet van dit lid/);
    expect(keurVerplaatsing({ boeking_id: "b2", datum: "2026-09-25", uur: 9 }, { ...ramen, boekingen }).fout).toMatch(/6 uur/);
  });
  it("wissel: enkel een oefening uit het eigen plan, naar een echte id", () => {
    const planOefeningen = [{ id: "p1", exercise_id: "11111111-1111-1111-1111-111111111111", naam: "Squat" }];
    expect(keurWissel({ plan_oefening_id: "p1", nieuwe_oefening_id: "22222222-2222-2222-2222-222222222222" }, { planOefeningen }).ok).toBe(true);
    expect(keurWissel({ plan_oefening_id: "p9", nieuwe_oefening_id: "22222222-2222-2222-2222-222222222222" }, { planOefeningen }).fout).toBeTruthy();
    expect(keurWissel({ plan_oefening_id: "p1", nieuwe_oefening_id: "Lunge" }, { planOefeningen }).fout).toMatch(/zoek_oefening/);
  });
  it("check-in: enkel met open week en echte antwoorden", () => {
    expect(keurCheckin({ zwaarte: "goed" }, { weekId: null }).fout).toBeTruthy();
    expect(keurCheckin({ zwaarte: "super" }, { weekId: "w" }).fout).toBeTruthy();
    const c = keurCheckin({ zwaarte: "te_zwaar", energie: "laag", pijn: true, pijn_waar: "knie" }, { weekId: "w" });
    expect(c).toMatchObject({ ok: true, weekId: "w", zwaarte: "te_zwaar", energie: "laag", pijn: true, pijn_waar: "knie" });
  });
  it("coach en geheugen", () => {
    expect(keurCoach({ reden: "  " }).fout).toBeTruthy();
    expect(keurCoach({ reden: "knie" }).ok).toBe(true);
    expect(keurFeit("x")).toBe(null);
    let f = [];
    for (let i = 0; i < 15; i++) f = voegFeitToe(f, `feit ${i}`);
    expect(f).toHaveLength(MAX_FEITEN);
    expect(f[0]).toBe("feit 5");
    expect(voegFeitToe(["Traint graag 's ochtends"], "traint graag 's ochtends")).toHaveLength(1);
  });
});

describe("coach-chat: rustige uren zoals de boekingspagina", () => {
  const rustig = { aan: true, rijen: [{ dow: 3, hour: 14, klasse: "rustig" }, { dow: 3, hour: 15, klasse: "rustig" }] };
  it("⚡ enkel als start- én volgend uur rustig zijn", () => {
    expect(promoOp("2026-09-23", 14, rustig, NU)).toBe("rustig");
    expect(promoOp("2026-09-23", 15, rustig, NU)).toBe(null);
  });
  it("vrije uren markeren ⚡ en of het 2e uur gratis kan", () => {
    const uit = vrijeUren({ van: "2026-09-23", dagen: 1, duur: 1, enkelRustig: true }, { bezet: new Set(), rustig, nu: NU });
    expect(uit).toEqual([{ datum: "2026-09-23", uur: 14, promo: "rustig", tweedeGratis: true }]);
    const bezet = new Set([new Date(isoVan("2026-09-23", 15)).getTime()]);
    expect(vrijeUren({ van: "2026-09-23", dagen: 1, enkelRustig: true }, { bezet, rustig, nu: NU })[0].tweedeGratis).toBe(false);
  });
});

describe("coach-chat: gereedschap", () => {
  it("elk voorstel heeft een kaart en niets anders dan lezen of voorstellen", () => {
    for (const g of GEREEDSCHAP) expect(LEZEN.has(g.name) || VOORSTEL.has(g.name)).toBe(true);
    for (const t of VOORSTEL) expect(kaartTekst({ type: t, invoer: { datum: "2026-09-23", uur: 18, duur: 1, van: "a", naar: "b", reden: "r" } }).knop).not.toBe("Bevestig");
  });
  it("uitvoeren gebeurt enkel via de serveractie, opnieuw gekeurd, en nooit twee keer", () => {
    const a = lees("app/(site)/coaching/chat-actions.js");
    expect(a).toMatch(/keurVoorstel\(/);
    expect(a).toMatch(/status: "bezig"/);
    expect(a).toMatch(/\.eq\("acties", /);
    expect(a).toMatch(/member_id", mij\.user\.id|eq\("member_id", mij\.user\.id\)/);
  });
});
