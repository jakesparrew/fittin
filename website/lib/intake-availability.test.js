import { describe, it, expect } from "vitest";
import { beschikbaarheidZin, DAGEN } from "@/app/(site)/personal-training/options";

// beschikbaarheidZin() is de enige poort tussen het publieke intakeformulier en vier plekken waar
// een beheerder meekijkt: het onderwerp van de mail naar de eigenaar, de tabelrij daarin, de
// previewregel in /beheer/inbox en de in-app melding. Vinkjes hebben geen maxLength en het
// formulier is publiek, dus de invoer is per definitie onbetrouwbaar: iemand kan zelf een POST
// samenstellen met vijfhonderd "dagen", met onbekende waarden of met HTML erin.
//
// De verdediging is dat de functie over de CONSTANTE filtert in plaats van over de invoer. Deze
// tests bewaken precies dat: wat eruit komt bestaat uitsluitend uit onze eigen woorden.
describe("beschikbaarheidZin", () => {
  it("laat niets door dat niet in de constanten staat", () => {
    expect(beschikbaarheidZin("<script>", ["<img onerror=x>", "ma"])).toBe("ma");
    expect(beschikbaarheidZin("nacht", ["maandag", "MA", " ma "])).toBe("ma"); // alleen de getrimde exacte waarde
    expect(beschikbaarheidZin("", [])).toBe("");
    expect(beschikbaarheidZin(null, null)).toBe("");
  });

  it("ontdubbelt en houdt altijd de volgorde ma→zo aan, ook bij omgekeerde invoer", () => {
    expect(beschikbaarheidZin("", ["do", "ma", "do", "di"])).toBe("ma, di, do");
    expect(beschikbaarheidZin("", ["zo", "za"])).toBe("in het weekend");
  });

  it("kan nooit meer dan zeven dagen opleveren, hoeveel er ook binnenkomen", () => {
    const bak = Array.from({ length: 500 }, () => "ma");
    expect(beschikbaarheidZin("", bak)).toBe("ma");
    const alles = Array.from({ length: 500 }, (_, i) => DAGEN[i % 7].v);
    expect(beschikbaarheidZin("", alles)).toBe("elke dag");
  });

  it("vat samen in mensentaal in plaats van zeven afkortingen op te sommen", () => {
    expect(beschikbaarheidZin("", DAGEN.map((d) => d.v))).toBe("elke dag");
    expect(beschikbaarheidZin("", ["ma", "di", "wo", "do", "vr"])).toBe("weekdagen");
    expect(beschikbaarheidZin("", ["za", "zo"])).toBe("in het weekend");
    // Zes dagen is geen van de drie gevallen — dan wél opsommen.
    expect(beschikbaarheidZin("", ["ma", "di", "wo", "do", "vr", "za"])).toBe("ma, di, wo, do, vr, za");
  });

  it("combineert dagdeel en dagen, en laat een ontbrekende helft gewoon weg", () => {
    expect(beschikbaarheidZin("avond", ["ma", "di", "do"])).toBe("'s avonds · ma, di, do");
    expect(beschikbaarheidZin("overdag", [])).toBe("overdag");
    expect(beschikbaarheidZin("flexibel", DAGEN.map((d) => d.v))).toBe("overdag of 's avonds · elke dag");
    expect(beschikbaarheidZin("", ["wo"])).toBe("wo");
  });

  it("blijft kort genoeg voor een mailonderwerp en een melding van 140 tekens", () => {
    const langst = DAGEN.slice(0, 6).map((d) => d.v); // het geval dat wél opsomt
    expect(beschikbaarheidZin("flexibel", langst).length).toBeLessThan(60);
  });
});
