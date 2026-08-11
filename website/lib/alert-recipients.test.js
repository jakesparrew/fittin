import { describe, it, expect, beforeEach, vi } from "vitest";

// Twee soorten alarm, twee ontvangerslijsten — en die mogen nooit opnieuw samenvallen.
//
// Wat er misging: de foutmails hergebruikten LOCK_ALERT_EMAILS, de lijst van de deurslot-batterij.
// Daardoor kreeg de gym-uitbater JS-stacktraces die hij niet kan plaatsen. Het gevaar zit niet in
// de overlast maar in de gewenning: een alarm dat je niet kan behandelen leer je wegklikken, en
// dan mis je óók de batterijmail die wél voor jou bedoeld is.
//
// Deze test bewaakt de scheiding, want ze is met één copy-paste weer weg.

const laad = async (env = {}) => {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const fouten = await import("./error-alert.js");
  const batterij = await import("./lock-battery.js");
  return { fout: fouten.RECIPIENTS, bat: batterij.RECIPIENTS };
};

describe("alarm-ontvangers", () => {
  beforeEach(() => {
    delete process.env.ERROR_ALERT_EMAILS;
    delete process.env.LOCK_ALERT_EMAILS;
  });

  it("stuurt foutmails standaard enkel naar de ontwikkelaar", async () => {
    const { fout } = await laad();
    expect(fout).toEqual(["gaetanjansseune@gmail.com"]);
  });

  it("stuurt GEEN foutmails naar de gym", async () => {
    const { fout } = await laad();
    expect(fout).not.toContain("info@fittin.be");
    expect(fout).not.toContain("ran.knockaert@gmail.com");
  });

  it("laat de batterijmail wél naar de gym gaan — dat is werk ter plekke", async () => {
    const { bat } = await laad();
    expect(bat).toContain("info@fittin.be");
    expect(bat).toContain("ran.knockaert@gmail.com");
  });

  it("houdt de twee lijsten volledig gescheiden", async () => {
    const { fout, bat } = await laad();
    expect(fout.some((a) => bat.includes(a))).toBe(false);
  });

  // De env-variabelen mogen elkaar niet beïnvloeden: wie de batterijlijst aanpast, mag daarmee
  // niet ongemerkt de foutmails omleiden (precies de fout die we net rechtgezet hebben).
  it("laat LOCK_ALERT_EMAILS de foutmails ongemoeid", async () => {
    const { fout } = await laad({ LOCK_ALERT_EMAILS: "iemand@anders.be" });
    expect(fout).toEqual(["gaetanjansseune@gmail.com"]);
  });

  it("laat ERROR_ALERT_EMAILS de batterijmail ongemoeid", async () => {
    const { bat } = await laad({ ERROR_ALERT_EMAILS: "dev@voorbeeld.be" });
    expect(bat).toContain("info@fittin.be");
  });

  it("ondersteunt meerdere adressen, met spaties ertussen", async () => {
    const { fout } = await laad({ ERROR_ALERT_EMAILS: "a@b.be, c@d.be " });
    expect(fout).toEqual(["a@b.be", "c@d.be"]);
  });
});
