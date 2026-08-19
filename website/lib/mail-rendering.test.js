import { describe, it, expect, vi, beforeEach } from "vitest";

// Rendertest voor de mails die iets MEEDRAGEN of iets BELOVEN. De Resend-client is gemockt, dus
// we zien exact wat er de deur uit zou gaan: welke bijlagen eraan hangen, en of een mager randgeval
// de functie doet crashen.
//
// Waarom dit bestaat: alle drie de gevallen hieronder waren echte defecten. De verplaatsingsmail
// ging jarenlang zonder agenda-bijlage buiten (de agenda hield de OUDE tijd, mét alarm), de
// herinnering beloofde "verplaatsen tot 6u vooraf" ook wanneer dat venster al dicht was, en
// sendErrorAlert gooide op een ontbrekende firstSeen — waardoor het foutalarm zichzelf kon
// vastdraaien vóór alerted_at gezet werd. Een fout hier is onzichtbaar: de mail komt gewoon aan,
// alleen klopt er iets niet aan wat hij meedraagt.

const verstuurd = [];
vi.mock("resend", () => ({
  Resend: class {
    constructor() {
      this.emails = { send: async (p) => { verstuurd.push(p); return { data: { id: "re_test" } }; } };
      this.batch = { send: async () => ({ data: { data: [] } }) };
    }
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({ insert: async () => ({}) }) }),
}));

process.env.RESEND_API_KEY = "re_test";

const { sendBookingRescheduled, sendSessionReminder, sendBookingConfirmation, sendErrorAlert } = await import("@/lib/email");

const B = {
  to: "coach@fittin.be",
  name: "Testcoach",
  serviceName: "Fit60",
  startsAt: "2026-09-01T17:00:00.000Z",
  endsAt: "2026-09-01T18:00:00.000Z",
};

beforeEach(() => { verstuurd.length = 0; });

describe("mailsjablonen met bijlage of belofte", () => {
  it("verplaatsingsmail draagt nu een agenda-bijlage met dezelfde UID als de bevestiging", async () => {
    await sendBookingConfirmation({ ...B, persons: 1, bookingId: "abc-123" });
    const bevestiging = verstuurd.at(-1);
    await sendBookingRescheduled({ ...B, bookingId: "abc-123" });
    const verplaatsing = verstuurd.at(-1);

    expect(bevestiging.attachments?.length).toBe(1);
    expect(verplaatsing.attachments?.length).toBe(1); // was 0 → agenda bleef op de oude tijd staan
    const lees = (m) => Buffer.from(m.attachments[0].content, "base64").toString("utf8");
    expect(lees(verplaatsing)).toContain("UID:booking-abc-123@fittin.be");
    expect(lees(bevestiging)).toContain("UID:booking-abc-123@fittin.be");
    expect(lees(verplaatsing)).toContain("SEQUENCE:");
    // Elke regel binnen de 75 octetten van RFC 5545.
    expect(Math.max(...lees(verplaatsing).split("\r\n").map((r) => Buffer.byteLength(r, "utf8")))).toBeLessThanOrEqual(75);
  });

  it("zonder bookingId gaat de verplaatsingsmail gewoon zonder bijlage buiten", async () => {
    await sendBookingRescheduled(B);
    expect(verstuurd.at(-1).attachments).toBeUndefined();
  });

  it("herinnering belooft geen verplaatsing meer als dat venster al dicht is", async () => {
    const straks = new Date(Date.now() + 2 * 3600000).toISOString();
    const morgen = new Date(Date.now() + 26 * 3600000).toISOString();
    await sendSessionReminder({ ...B, startsAt: straks, endsAt: straks, bookingId: "x" });
    expect(verstuurd.at(-1).html).not.toContain("tot 6u vooraf verplaatsen");
    await sendSessionReminder({ ...B, startsAt: morgen, endsAt: morgen, bookingId: "x" });
    expect(verstuurd.at(-1).html).toContain("tot 6u vooraf verplaatsen");
  });

  it("foutalarm overleeft een ontbrekende of kapotte firstSeen", async () => {
    await expect(sendErrorAlert({ to: "x@y.be", message: "boem" })).resolves.toBeTruthy();
    expect(verstuurd.at(-1).html).toContain("Sinds kort");
    await expect(sendErrorAlert({ to: "x@y.be", message: "boem", firstSeen: "geen-datum" })).resolves.toBeTruthy();
    expect(verstuurd.at(-1).html).toContain("Sinds kort");
    await sendErrorAlert({ to: "x@y.be", message: "boem", firstSeen: "2026-08-19T07:05:00.000Z" });
    expect(verstuurd.at(-1).html).not.toContain("Sinds kort");
  });
});
