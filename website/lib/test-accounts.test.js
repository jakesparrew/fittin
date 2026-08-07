import { describe, it, expect } from "vitest";
import { isTestAccount, zonderTest, TEST_ACCOUNT_EMAILS } from "./test-accounts.js";

describe("isTestAccount", () => {
  it("herkent het bekende testaccount", () => {
    expect(isTestAccount({ email: "coach@fittin.be" })).toBe(true);
  });

  it("is hoofdletterongevoelig — e-mail komt uit auth en kan anders geschreven staan", () => {
    expect(isTestAccount({ email: "Coach@Fittin.BE" })).toBe(true);
  });

  it("laat echte leden en coaches met rust", () => {
    for (const e of ["coachgent.pt@gmail.com", "janmatthyss@icloud.com", "info@fittin.be"]) {
      expect(isTestAccount({ email: e })).toBe(false);
    }
  });

  // info@fittin.be is het ECHTE adres van de gym. Een filter op domein zou dat meenemen en dus
  // echte gymdata verbergen — daarom matchen we op het volledige adres, niet op "@fittin.be".
  it("filtert niet op domein", () => {
    expect(isTestAccount({ email: "info@fittin.be" })).toBe(false);
    expect(isTestAccount({ email: "ran@fittin.be" })).toBe(false);
  });

  it("valt niet om over een ontbrekend of leeg profiel", () => {
    expect(isTestAccount(null)).toBe(false);
    expect(isTestAccount({})).toBe(false);
    expect(isTestAccount({ email: null })).toBe(false);
  });
});

describe("zonderTest", () => {
  const test = new Set(["t1"]);

  it("verwijdert rijen van het testaccount", () => {
    const rijen = [{ user_id: "a" }, { user_id: "t1" }, { user_id: "b" }];
    expect(zonderTest(rijen, test).map((r) => r.user_id)).toEqual(["a", "b"]);
  });

  // Een boeking heeft twee rollen. Staat het testaccount er als coach in, dan telt ze evenmin mee —
  // ook al is het lid een echte klant.
  it("kijkt naar elk opgegeven veld", () => {
    const rijen = [
      { user_id: "a", coach_id: "t1" },
      { user_id: "t1", coach_id: "c" },
      { user_id: "a", coach_id: "c" },
    ];
    expect(zonderTest(rijen, test, ["user_id", "coach_id"])).toHaveLength(1);
  });

  it("geeft de lijst ongemoeid terug als er geen testaccounts zijn", () => {
    const rijen = [{ user_id: "a" }, { user_id: "t1" }];
    expect(zonderTest(rijen, new Set())).toHaveLength(2);
    expect(zonderTest(rijen, null)).toHaveLength(2);
  });

  it("overleeft lege invoer", () => {
    expect(zonderTest(null, test)).toEqual([]);
    expect(zonderTest([{ user_id: undefined }], test)).toHaveLength(1);
  });
});

describe("de lijst zelf", () => {
  it("bevat geen adres van een echte gebruiker", () => {
    expect(TEST_ACCOUNT_EMAILS).toEqual(["coach@fittin.be"]);
  });
});
