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

const { sendBookingRescheduled, sendSessionReminder, sendBookingConfirmation, sendErrorAlert, sendAccessCode } = await import("@/lib/email");

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

// ---------------------------------------------------------------------------
// De deurcodemail en het afvinken
// ---------------------------------------------------------------------------
//
// Deze groep bestaat omdat de vorige versie van dit stuk zijn veiligheid op een HANDMATIGE meting
// zette ("op de gerenderde HTML nagemeten: lid 3 links, coach 0") en op drie regexen over de
// BRONTEKST van email.js. Die meten opmaak, niet uitvoer: elke herstructurering die het gedrag niet
// raakt, breekt ze of laat ze vals slagen. Hieronder wordt de echte payload geïnspecteerd.

const WORKOUT = {
  weekNr: 2, totaalWeken: 8, volgnummer: 1, totaal: 3, naam: "Onderlichaam",
  afvinkToken: "sessietoken0123456789",
  oefeningen: [{ naam: "Barbell Lunge", sets: 4, reps: 8, kg: null, rust: 120, sectie: "Hoofdoefening" }],
};
const DEUR = {
  serviceName: "Gymsessie", startsAt: "2026-09-11T17:00:00.000Z", endsAt: "2026-09-11T18:00:00.000Z",
  accessCode: "482913", personal: true, address: "Aannemersstraat 186", mapsUrl: "https://maps.example",
};

describe("de deurcodemail draagt het afvinken", () => {
  it("het LID krijgt een afvinkknop die naar zijn sessietoken wijst", async () => {
    await sendAccessCode({ ...DEUR, to: "lid@x.be", name: "Lid", reportToken: "meldtoken0123456789", workout: WORKOUT });
    const html = verstuurd.at(-1).html;
    expect(html).toContain("/s/sessietoken0123456789");
    expect(html).toContain("Barbell Lunge");
  });

  it("de COACH krijgt dezelfde code maar GEEN enkele afvinklink", async () => {
    // Dit is de eigenschap die er echt toe doet. Ze werd eerder verdedigd met "de knoppen staan
    // binnen het workoutblok" — een opmaakargument. Het echte lek zat elders: coach en lid deelden
    // hetzelfde `report_token`, dat óók in de meldpuntlink /m/{token} van de coach staat. Vervang
    // /m/ door /s/ en de coach vinkt de sessie van zijn client af. Sinds 0160 draagt het afvinken
    // een eigen sleutel op de SESSIE, die alleen in de mail van het lid terechtkomt.
    await sendAccessCode({ ...DEUR, to: "coach@x.be", name: "Coach", reportToken: "meldtoken0123456789" });
    const html = verstuurd.at(-1).html;
    expect(html).toContain("482913");                    // de deurcode moet hij wél hebben
    expect(html).not.toContain("/s/");                   // geen enkele afvinkweg
    expect(html).not.toContain("Barbell Lunge");         // en geen schema van zijn client
  });

  it("het meldtoken van de coach opent geen afvinkpagina meer", async () => {
    // De regressie in één test: als /s/ ooit weer op report_token zou resolven, staat de sleutel
    // van de coach opnieuw in zijn eigen mail.
    await sendAccessCode({ ...DEUR, to: "coach@x.be", name: "Coach", reportToken: "meldtoken0123456789" });
    const html = verstuurd.at(-1).html;
    expect(html).toContain("/m/meldtoken0123456789");    // het meldpunt hoort hij wél te krijgen
    expect(html).not.toContain("/s/meldtoken0123456789");
  });

  it("zonder afvinktoken valt de mail terug op de coachingpagina, niet op een dode link", async () => {
    const { afvinkToken, ...zonder } = WORKOUT;
    await sendAccessCode({ ...DEUR, to: "lid@x.be", name: "Lid", reportToken: "meldtoken0123456789", workout: zonder });
    const html = verstuurd.at(-1).html;
    expect(html).not.toContain("/s/");
    expect(html).toContain("/coaching");
  });

  it("de afvinkknop schrijft niets: geen oordeel in de URL", async () => {
    // De eerste versie zette `?v=goed` in de mail. Een linkscanner die elke URL ophaalt, koos dan
    // het oordeel voor het lid — en de verdediging ("de mail vertrekt vóór de sessie") klopte niet,
    // want sendDueAccessCodes verstuurt tot zestien minuten NA de start.
    await sendAccessCode({ ...DEUR, to: "lid@x.be", name: "Lid", reportToken: "meldtoken0123456789", workout: WORKOUT });
    const html = verstuurd.at(-1).html;
    expect(html).not.toMatch(/\?v=(goed|te_licht|te_zwaar)/);
  });

  it("een lid zonder coaching krijgt exact dezelfde mail als voorheen", async () => {
    // Dit bestand raakt alle 86 leden. Zonder workout mag er niets veranderd zijn.
    await sendAccessCode({ ...DEUR, to: "lid@x.be", name: "Lid", reportToken: "meldtoken0123456789" });
    const zonderCoaching = verstuurd.at(-1).html;
    expect(zonderCoaching).not.toContain("/s/");
    expect(zonderCoaching).not.toContain("workout");
    expect(zonderCoaching).toContain("482913");
  });
});
