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
  it("admin comp booking (los + €0 + paid) is labelled as such", () => {
    expect(sourceLabel({ payment_source: "los", price_cents: 0, paid: true })).toBe("Ingepland door beheer");
  });
  it("unpaid €0 or unknown price never claims 'door beheer'", () => {
    expect(sourceLabel({ payment_source: "los", price_cents: 1500, paid: true })).toBe("Online");
    expect(sourceLabel({ payment_source: "los", paid: true })).toBe("Online");
  });
});

describe("sourceLabel · coach & credit zichtbaarheid", () => {
  it("coach-sessie via tegoed is GEEN beheer-boeking", () => {
    // coach_book_session schrijft los + €0 + paid, net als een admin-comp — coach_billing beslist.
    expect(sourceLabel({ payment_source: "los", price_cents: 0, paid: true, coach_billing: "credit" })).toBe("Coach-tegoed");
  });
  it("coach-factuur en gratis coach-sessie", () => {
    expect(sourceLabel({ payment_source: "los", price_cents: 0, paid: true, coach_billing: "invoice" })).toBe("Coach-factuur");
    expect(sourceLabel({ payment_source: "los", price_cents: 0, paid: true, coach_billing: "free" })).toBe("Coach · gratis");
  });
  it("beurtenkaart en abonnement blijven herkenbaar", () => {
    expect(sourceLabel({ payment_source: "credit", price_cents: 0, paid: true })).toBe("Beurtenkaart");
    expect(sourceLabel({ payment_source: "abo", price_cents: 1200, paid: true })).toBe("Abonnement");
  });
});
