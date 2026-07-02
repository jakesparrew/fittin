import { describe, it, expect } from "vitest";
import { isSettled, sourceLabel } from "./booking-status.js";

describe("isSettled", () => {
  it("paid=true is settled regardless of source", () => {
    expect(isSettled({ paid: true, payment_source: "los", price_cents: 1500 })).toBe(true);
  });
  it("unpaid los is NOT settled (owes Stripe)", () => {
    expect(isSettled({ paid: false, payment_source: "los", price_cents: 1500 })).toBe(false);
  });
  it("unpaid abo is NOT settled (owes €12)", () => {
    expect(isSettled({ paid: false, payment_source: "abo", price_cents: 1200 })).toBe(false);
  });
  it("credit/gratis/invite settle at creation", () => {
    expect(isSettled({ paid: false, payment_source: "credit", price_cents: 0 })).toBe(true);
    expect(isSettled({ paid: false, payment_source: "gratis_code", price_cents: 0 })).toBe(true);
    expect(isSettled({ paid: false, payment_source: "invite", price_cents: 0 })).toBe(true);
  });
  it("zero price is settled", () => {
    expect(isSettled({ paid: false, payment_source: "los", price_cents: 0 })).toBe(true);
  });
  it("works with the camelCase DTO shape", () => {
    expect(isSettled({ paid: false, paymentSource: "credit", priceCents: 0 })).toBe(true);
    expect(isSettled({ paid: false, paymentSource: "los", priceCents: 1500 })).toBe(false);
  });
  it("null/undefined → not settled", () => {
    expect(isSettled(null)).toBe(false);
    expect(isSettled(undefined)).toBe(false);
  });
});

describe("sourceLabel", () => {
  it("maps each source", () => {
    expect(sourceLabel({ payment_source: "abo" })).toBe("Abonnement");
    expect(sourceLabel({ payment_source: "credit" })).toBe("Beurtenkaart");
    expect(sourceLabel({ payment_source: "gratis_code" })).toBe("Gratis code");
    expect(sourceLabel({ payment_source: "invite" })).toBe("Uitgenodigd");
  });
  it("coach booking shows Via coach", () => {
    expect(sourceLabel({ payment_source: "los", coach_name: "Jelle" })).toBe("Via coach");
  });
  it("plain online booking", () => {
    expect(sourceLabel({ payment_source: "los" })).toBe("Online");
  });
});
