import { describe, it, expect } from "vitest";
import { euro, euro0, ago, tone } from "./format.js";

describe("euro", () => {
  it("formats cents as Flemish euro", () => {
    expect(euro(1500)).toBe("€ 15,00");
    expect(euro(1250)).toBe("€ 12,50");
    expect(euro(0)).toBe("€ 0,00");
    expect(euro(null)).toBe("€ 0,00");
  });
  it("euro0 drops decimals", () => {
    expect(euro0(1500)).toBe("€ 15");
    expect(euro0(15000)).toBe("€ 150");
  });
});

describe("ago", () => {
  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
  it("today / gisteren", () => {
    expect(ago(daysAgo(0))).toBe("vandaag");
    expect(ago(daysAgo(1))).toBe("gisteren");
  });
  it("days, months, years", () => {
    expect(ago(daysAgo(5))).toBe("5d geleden");
    expect(ago(daysAgo(60))).toBe("2 mnd geleden");
    expect(ago(daysAgo(400))).toBe("1 jaar geleden");
  });
  it("empty → empty", () => { expect(ago(null)).toBe(""); });
});

describe("tone", () => {
  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
  it("red >30d, amber >14d, muted recent", () => {
    expect(tone(daysAgo(40))).toBe("text-red-500");
    expect(tone(daysAgo(20))).toBe("text-amber-500");
    expect(tone(daysAgo(3))).toBe("text-brand/50");
    expect(tone(null)).toBe("text-brand/40");
  });
});
