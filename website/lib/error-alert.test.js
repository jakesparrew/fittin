import { describe, it, expect, vi, beforeEach } from "vitest";

// De alarmmails vertrekken uit dezelfde Resend-account als de deurcodes. Eén cronbeurt die 200
// losse alarmen stuurt kan die afzender doen dichtslibben, en dan raken leden niet meer binnen.
// Deze test legt het plafond vast — een latere "we willen toch alles zien"-aanpassing moet hem
// bewust breken, niet per ongeluk.

const verstuurd = [];
vi.mock("@/lib/email", () => ({
  sendErrorAlert: vi.fn(async (arg) => { verstuurd.push(arg); return { ok: true }; }),
}));
vi.mock("@/lib/error-triage", () => ({ classifyClientError: () => "app" }));

const { alertNewClientErrors } = await import("./error-alert.js");

// Minimale nabootsing van de query-keten die alertNewClientErrors gebruikt.
function nepAdmin(rijen) {
  const bijgewerkt = [];
  const keten = (data) => {
    const k = {
      select: () => k, is: () => k, order: () => k, limit: () => k, in: () => k, eq: () => k,
      update: (v) => { bijgewerkt.push(v); return k; },
      then: (r) => Promise.resolve({ data }).then(r),
    };
    return k;
  };
  return {
    bijgewerkt,
    from: (t) => (t === "client_errors" ? keten(rijen) : keten([])),
  };
}

const maakRijen = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `id-${i}`, message: `Fout nummer ${i}`, stack: "at x", path: `/pagina-${i}`,
    created_at: new Date().toISOString(), user_id: null,
  }));

describe("alarmmails bij clientfouten", () => {
  beforeEach(() => { verstuurd.length = 0; });

  it("stuurt hoogstens 5 mails, ook bij 200 verschillende foutgroepen", async () => {
    const admin = nepAdmin(maakRijen(200));
    const r = await alertNewClientErrors(admin);
    expect(verstuurd.length).toBe(5);
    expect(r.alerted).toBe(5);
  });

  it("vermeldt in de laatste mail hoeveel foutgroepen er nog wachten", async () => {
    const admin = nepAdmin(maakRijen(200));
    await alertNewClientErrors(admin);
    expect(verstuurd[verstuurd.length - 1].stack).toContain("195 andere nieuwe foutgroepen");
  });

  it("laat een gewone ronde ongemoeid en zet er geen staart aan", async () => {
    const admin = nepAdmin(maakRijen(3));
    await alertNewClientErrors(admin);
    expect(verstuurd.length).toBe(3);
    expect(verstuurd.every((m) => !m.stack.includes("andere nieuwe foutgroep"))).toBe(true);
  });

  it("markeert ALLE gescande rijen als gealarmeerd, ook de niet-gemailde", async () => {
    // Anders loopt elke cronbeurt van vijf minuten dezelfde stapel opnieuw af.
    const admin = nepAdmin(maakRijen(200));
    await alertNewClientErrors(admin);
    expect(admin.bijgewerkt.some((v) => v.alerted_at)).toBe(true);
  });

  it("meldt de luidste fout eerst", async () => {
    const rijen = [
      ...Array.from({ length: 9 }, (_, i) => ({ id: `veel-${i}`, message: "Veelvoorkomend", stack: "s", path: "/a", created_at: "2026-01-01", user_id: null })),
      { id: "zeldzaam", message: "Zeldzaam", stack: "s", path: "/b", created_at: "2026-01-01", user_id: null },
    ];
    await alertNewClientErrors(nepAdmin(rijen));
    expect(verstuurd[0].message).toBe("Veelvoorkomend");
    expect(verstuurd[0].count).toBe(9);
  });
});
