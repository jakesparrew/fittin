import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { leesbareFout, nagekeken, gegooid } from "./uitkomst.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const lees = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

describe("een databankfout als zin", () => {
  it("vertaalt de fouten die een beheerder echt tegenkomt", () => {
    expect(leesbareFout({ code: "23505", message: "duplicate key" }, "Code aanmaken")).toBe("Code aanmaken mislukt: dat bestaat al.");
    expect(leesbareFout({ code: "23503" }, "Oefening verwijderen")).toMatch(/hangt nog aan iets anders vast/);
    expect(leesbareFout({ code: "42501" }, "Opslaan")).toMatch(/geen rechten/);
    expect(leesbareFout({ code: "22P02" }, "Code wijzigen")).toMatch(/verkeerde formaat/);
  });

  it("valt terug op de technische tekst in plaats van iets te verzinnen", () => {
    expect(leesbareFout({ code: "P0001", message: "Dit uur is al geboekt" }, "Boeken")).toBe("Boeken mislukt: Dit uur is al geboekt.");
  });

  it("herkent een verbindingsprobleem", () => {
    expect(leesbareFout({ message: "TypeError: fetch failed" })).toMatch(/geen verbinding/);
  });

  it("geen fout, geen zin", () => {
    expect(leesbareFout(null)).toBe(null);
  });
});

describe("een schrijfactie nakijken", () => {
  it("nul rijen geraakt is een fout — dat is de stilte die hier 43 keer zat", () => {
    // Gemeten op productie op 13-09: een UPDATE op een id dat niet bestaat geeft `error: null`
    // en `count: 0`. Zonder `{ count: "exact" }` is count null en zag niemand het.
    const uit = nagekeken({ error: null, count: 0 }, "Code wijzigen");
    expect(uit.error).toMatch(/er is niets gewijzigd/);
  });

  it("zonder count (INSERT, UPSERT) telt enkel de fout", () => {
    expect(nagekeken({ error: null, count: null })).toBe(null);
    expect(nagekeken({ error: null, data: [{ id: 1 }] })).toBe(null);
  });

  it("minstens één rij = in orde", () => {
    expect(nagekeken({ error: null, count: 3 })).toBe(null);
  });

  it("een fout gaat voor op de telling", () => {
    expect(nagekeken({ error: { code: "23505" }, count: 0 }, "X").error).toMatch(/bestaat al/);
  });

  it("een gegooide fout wordt ook een zin", () => {
    expect(gegooid(new Error("Resend 500"), "Mail sturen").error).toBe("Mail sturen mislukt: Resend 500.");
  });
});

describe("geen enkele beheerknop is nog stil", () => {
  const ACTIEBESTANDEN = fs.readdirSync(path.join(ROOT, "app/beheer"))
    .filter((f) => /actions\.js$/.test(f)).map((f) => `app/beheer/${f}`);

  // Schrijfacties die BEWUST niet nagekeken worden, met reden. Elk ervan volgt op iets dat al
  // onomkeerbaar gebeurd is (een mail die vertrok), en een foutmelding zou tot een tweede verzending
  // leiden. Wie hier iets bijzet, schrijft de reden erbij in de code zelf.
  const BEWUST_STIL = [
    'from("sent_emails").insert',              // log van een mail die al WEG is
    'from("inbound_emails").update({ read',    // gelezen-vinkje; draait vanzelf of na een verstuurd antwoord
    'from("gym_referral_checks").upsert',      // na een gelukte aanrekening; de nettostand-controle blokkeert dubbel
  ];

  it("elke UPDATE, DELETE, INSERT of UPSERT kijkt naar zijn antwoord", () => {
    const stil = [];
    for (const f of ACTIEBESTANDEN) {
      const regels = lees(f).split("\n");
      regels.forEach((r, i) => {
        // Een schrijfactie waarvan het resultaat nergens heen gaat: `await x.from(...).update(...)` als
        // losse opdracht, zonder `const`, zonder `nagekeken(`.
        if (!/^\s*await\s+(supabase|admin|createAdminClient\(\))\s*\.from\(/.test(r)) return;
        const blok = regels.slice(i, i + 3).join(" ");
        if (!/\.(update|delete|insert|upsert)\(/.test(blok)) return;
        if (BEWUST_STIL.some((b) => blok.includes(b))) return;
        stil.push(`${f}:${i + 1}  ${r.trim().slice(0, 90)}`);
      });
    }
    expect(stil).toEqual([]);
  });

  it("een UPDATE of DELETE die nagekeken wordt, telt ook de rijen", () => {
    // Zonder `{ count: "exact" }` is `count` null en kan nagekeken() nul geraakte rijen niet zien.
    const zonderTelling = [];
    for (const f of ACTIEBESTANDEN) {
      const s = lees(f);
      for (const m of s.matchAll(/nagekeken\(\s*await\s+[\s\S]{0,260}?\)\s*,\s*"/g)) {
        const stuk = m[0];
        if (/\.(update|delete)\(/.test(stuk) && !/count:\s*"exact"/.test(stuk)) {
          zonderTelling.push(`${f}: ${stuk.replace(/\s+/g, " ").slice(0, 100)}`);
        }
      }
    }
    expect(zonderTelling).toEqual([]);
  });

  it("elke beheeractie zegt wat er gebeurde: een melding, een fout of een doorverwijzing", () => {
    // Acties die niets teruggeven, lieten het scherm "Opgeslagen ✓" tonen — ook als er niets gebeurde.
    const UITZONDERINGEN = new Set([
      "adminDayAvailability", // leest vrije uren voor een keuzelijst, geen knop
      "testNukiConnection",   // geeft een testrapport terug dat het scherm zelf uitschrijft
      "markRead",             // draait vanzelf bij het openen van een bericht
      "quickExercise",        // geeft de nieuwe oefening terug aan de kiezer, die haar meteen selecteert
      "stopViewAsCoach",      // enkel een doorverwijzing
    ]);
    const zonder = [];
    for (const f of ACTIEBESTANDEN) {
      const s = lees(f);
      const namen = [...s.matchAll(/export async function (\w+)\(/g)];
      namen.forEach((m, i) => {
        const body = s.slice(m.index, namen[i + 1]?.index ?? s.length);
        if (UITZONDERINGEN.has(m[1])) return;
        if (/message:|redirect\(/.test(body)) return;
        zonder.push(`${f}: ${m[1]}`);
      });
    }
    expect(zonder).toEqual([]);
  });

  it("geen kaal <form action={serveractie}> in beheer — dan valt elke uitkomst weg", () => {
    const kaal = [];
    const loop = (dir) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) { loop(p); continue; }
        if (!p.endsWith(".jsx")) continue;
        for (const m of lees(p).matchAll(/<form action=\{(\w+)\}/g)) {
          // Hook-gebonden acties (useActie) heten action/formAction/blockAction — die tonen hun uitkomst.
          if (/^(action|formAction|blockAction)$/.test(m[1])) continue;
          kaal.push(`${p}: ${m[1]}`);
        }
      }
    };
    loop("app/beheer");
    loop("components/admin");
    expect(kaal).toEqual([]);
  });

  it("beheerschermen gebruiken useActie, niet elk hun eigen useActionState", () => {
    const eigen = fs.readdirSync(path.join(ROOT, "components/admin"))
      .filter((f) => f.endsWith(".jsx") && /useActionState\(/.test(lees(`components/admin/${f}`)));
    expect(eigen).toEqual([]);
  });

  it("een actie die gooit, wordt een melding en geen foutpagina", () => {
    const h = lees("components/ui/useActie.js");
    expect(h).toMatch(/catch \(e\) \{[\s\S]{0,80}isNextNavigatie\(e\)\) throw e;[\s\S]{0,40}return \{ error: SERVERFOUT \}/);
    expect(lees("components/ui/ActionForm.jsx")).toMatch(/useActie\(action/);
  });

  it("een fout blijft lang genoeg staan om te lezen", () => {
    expect(lees("components/ui/ToastHost.jsx")).toMatch(/t\.type === "error" \? 10000 : 4200/);
  });
});
