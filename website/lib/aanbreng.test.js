import { describe, it, expect } from "vitest";
import {
  beurtenVoor,
  centsVoor,
  beurtTekst,
  euroTekst,
  feeZin,
  kostVanBoeking,
  naamLijktOp,
  teControleren,
  opbrengstCents,
  FEE_STANDAARD_CENTS,
  FEE_MAX_CENTS,
} from "@/lib/aanbreng";

// Dit bestand bewaakt geld en beschuldigingen. De rekenkant boekt beurten af bij een coach, de
// controlekant zet sessies bovenaan waar de eigenaar naar moet kijken. Beide mogen niet stil
// verschuiven: een halve beurt te veel is € 6 van iemand anders, en een verkeerd signaal kost
// vertrouwen bij een coach die niets fout deed.

describe("beurtenVoor en centsVoor", () => {
  it("rekent de vergoeding om naar beurten", () => {
    expect(beurtenVoor(600)).toBe(0.5);
    expect(beurtenVoor(300)).toBe(0.25);
    expect(beurtenVoor(1200)).toBe(1);
    expect(beurtenVoor(0)).toBe(0);
  });

  it("rekent beurten terug naar euro-cent", () => {
    expect(centsVoor(0.5)).toBe(600);
    expect(centsVoor(0.25)).toBe(300);
    expect(centsVoor(1)).toBe(1200);
    expect(centsVoor(0)).toBe(0);
  });

  // € 4 deelt niet netjes door € 12. Zonder afronding zou hier 0.3333333333333333 uitkomen, en
  // coach_ledger.delta is numeric(8,2): Postgres kapt dat stil af en de app toont dan een ander
  // getal dan de databank bewaart.
  it("houdt het op twee decimalen bij een bedrag dat niet opgaat", () => {
    expect(beurtenVoor(400)).toBe(0.33);
    expect(centsVoor(0.33)).toBe(396);
  });

  it("slikt onzin zonder NaN terug te geven", () => {
    expect(beurtenVoor(null)).toBe(0);
    expect(beurtenVoor(undefined)).toBe(0);
    expect(centsVoor(null)).toBe(0);
  });
});

describe("kostVanBoeking", () => {
  // DE BESLISSING VAN DE EIGENAAR (2026-09-03): per BOEKING, niet per uur. Een sessie van twee uur
  // met een aangebrachte klant kost 2 beurten zaal + 0,5 beurt aanbreng = 2,5. Wie dit ooit naar
  // 3 ziet kantelen, kijkt naar een bug en niet naar een nieuwe afspraak.
  it("rekent de aanbreng één keer per boeking, niet per uur", () => {
    expect(kostVanBoeking(2, 600)).toBe(2.5);
    expect(kostVanBoeking(1, 600)).toBe(1.5);
    expect(kostVanBoeking(3, 600)).toBe(3.5);
  });

  it("kost zonder aanbreng exact de zaalhuur", () => {
    expect(kostVanBoeking(2, 0)).toBe(2);
  });

  it("gaat uit van één uur wanneer de duur ontbreekt", () => {
    expect(kostVanBoeking(undefined, 600)).toBe(1.5);
  });

  // Zonder afronding levert de optelling drijvende-kommastaarten op (1.1400000000000001). Die staan
  // dan in het tegoedboek van een coach en in de zin die hij te zien krijgt.
  it("laat nooit meer dan twee decimalen achter, voor welk toegelaten bedrag ook", () => {
    for (let cents = 0; cents <= FEE_MAX_CENTS; cents++) {
      for (const uren of [1, 2, 3]) {
        const kost = kostVanBoeking(uren, cents);
        const decimalen = String(kost).split(".")[1] || "";
        expect(decimalen.length).toBeLessThanOrEqual(2);
      }
    }
  });
});

describe("teksten", () => {
  // Deze zin staat op het voorstel aan de coach én bij elke boeking. Overal exact dezelfde woorden,
  // anders lijkt het op twee verschillende afspraken.
  it("zet de standaardvergoeding in één zin", () => {
    expect(feeZin(FEE_STANDAARD_CENTS)).toBe("0,5 beurt extra per sessie (€ 6)");
    expect(feeZin(300)).toBe("0,25 beurt extra per sessie (€ 3)");
    expect(feeZin(1200)).toBe("1 beurt extra per sessie (€ 12)");
  });

  it("schrijft euro's Vlaams en laat ,00 weg bij hele bedragen", () => {
    expect(euroTekst(600)).toBe("€ 6");
    expect(euroTekst(1250)).toBe("€ 12,50");
    expect(euroTekst(0)).toBe("€ 0");
  });

  it("schrijft beurten met een komma", () => {
    expect(beurtTekst(0.5)).toBe("0,5");
    expect(beurtTekst(2)).toBe("2");
    expect(beurtTekst(2.5)).toBe("2,5");
  });
});

describe("naamLijktOp", () => {
  // Deze vergelijking beschuldigt niemand, maar ze bepaalt wel welke sessie bovenaan komt. Te los en
  // twee verschillende Sarahs worden dezelfde persoon; te streng en "Sarah D." wordt nooit herkend.
  it("herkent een voornaam met een initiaal", () => {
    expect(naamLijktOp("sarah d", "Sarah Declerck")).toBe(true);
    expect(naamLijktOp("Sarah D.", "Sarah Declerck")).toBe(true);
  });

  it("houdt twee Sarahs uit elkaar zodra beide een achternaam hebben", () => {
    expect(naamLijktOp("Sarah Peeters", "Sarah Declerck")).toBe(false);
  });

  it("trekt zich niets aan van accenten en hoofdletters", () => {
    expect(naamLijktOp("José", "jose")).toBe(true);
    expect(naamLijktOp("JOSÉ Martínez", "josé martinez")).toBe(true);
  });

  it("matcht nooit op een lege naam", () => {
    expect(naamLijktOp("", "Sarah Declerck")).toBe(false);
    expect(naamLijktOp("Sarah Declerck", "")).toBe(false);
    expect(naamLijktOp("   ", "Sarah Declerck")).toBe(false);
  });
});

// ── Controlelijst ────────────────────────────────────────────────────────────────────
// Vaste klok: deze lijst hangt volledig af van "is die sessie al gebeurd" en "liep de doorgave
// toen al". Met de echte klok zou de test vanzelf van kleur veranderen zodra 2026-09-04 aanbreekt.
const NU = Date.parse("2026-09-03T12:00:00Z");
const doorgave = (extra = {}) => ({
  id: "r1",
  coach_id: "yoshe",
  client_name: "Sarah Declerck",
  status: "aanvaard",
  ended_at: null,
  referred_at: "2026-08-01T09:00:00Z",
  ...extra,
});
const sessie = (extra = {}) => ({
  id: "b1",
  coach_id: "yoshe",
  user_id: "yoshe", // eigen naam = geen gekoppelde client
  status: "bevestigd",
  starts_at: "2026-09-01T18:00:00Z",
  notes: "",
  ...extra,
});
const lijst = (bookings, extra = {}) => teControleren({ bookings, referrals: [doorgave()], ...extra }, NU);

describe("teControleren", () => {
  it("zet een sessie met een gelijkende externe naam op 'naam-match'", () => {
    const r = lijst([sessie({ notes: "Sarah D." })]);
    expect(r).toHaveLength(1);
    expect(r[0].reden).toBe("naam-match");
    expect(r[0].bookingId).toBe("b1");
    expect(r[0].naam).toBe("Sarah D.");
    expect(r[0].kandidaten.map((k) => k.id)).toEqual(["r1"]);
    expect(r[0].doorgaven).toHaveLength(1);
  });

  it("markeert dezelfde sessie zonder naam als 'geen-naam'", () => {
    const r = lijst([sessie({ notes: "" })]);
    expect(r[0].reden).toBe("geen-naam");
    expect(r[0].naam).toBe(null);
    expect(r[0].kandidaten).toEqual([]);
  });

  it("markeert een naam die op niets lijkt als 'andere-naam'", () => {
    const r = lijst([sessie({ notes: "Tom Peeters" })]);
    expect(r[0].reden).toBe("andere-naam");
    expect(r[0].kandidaten).toEqual([]);
  });

  // Staat de klant wél gekoppeld, dan doet de trigger het werk al. Zou deze sessie hier tóch
  // opduiken, dan zou de eigenaar ze een tweede keer kunnen aanrekenen.
  it("laat een sessie met een gekoppelde client weg", () => {
    expect(lijst([sessie({ user_id: "lid-sarah" })])).toEqual([]);
  });

  it("laat een geannuleerde sessie weg", () => {
    expect(lijst([sessie({ status: "geannuleerd", notes: "Sarah D." })])).toEqual([]);
  });

  it("laat een sessie weg die nog moet plaatsvinden", () => {
    expect(lijst([sessie({ starts_at: "2026-09-04T18:00:00Z", notes: "Sarah D." })])).toEqual([]);
  });

  // Vóór referred_at liep er nog geen afspraak. Die sessies alsnog aanrekenen zou met terugwerkende
  // kracht zijn, en dat is precies wat de coach niet aanvaard heeft.
  it("laat een sessie van vóór de doorgave weg", () => {
    expect(lijst([sessie({ starts_at: "2026-07-20T18:00:00Z", notes: "Sarah D." })])).toEqual([]);
  });

  it("laat een afgevinkte boeking weg", () => {
    expect(lijst([sessie({ notes: "Sarah D." })], { checked: ["b1"] })).toEqual([]);
  });

  // Zonder aanvaarding bestaat de afspraak niet, en na beëindiging bestaat ze niet meer. In geen van
  // beide gevallen mag er iets in de controlelijst opduiken om aan te rekenen.
  it("kijkt alleen naar doorgaven die op dat moment liepen", () => {
    const b = [sessie({ notes: "Sarah D." })];
    expect(teControleren({ bookings: b, referrals: [doorgave({ status: "voorgesteld" })] }, NU)).toEqual([]);
    expect(teControleren({ bookings: b, referrals: [doorgave({ ended_at: "2026-08-20T09:00:00Z" })] }, NU)).toEqual([]);
    expect(teControleren({ bookings: b, referrals: [] }, NU)).toEqual([]);
  });

  // De volgorde is de hele bedoeling van het scherm: de eigenaar kijkt van boven naar beneden en
  // stopt wanneer het te vaag wordt. De reden weegt zwaarder dan de datum — daarom staat hier de
  // meest RECENTE sessie ('andere-naam') bewust onderaan.
  it("sorteert naam-match boven geen-naam boven andere-naam", () => {
    const r = lijst([
      sessie({ id: "b-anders", starts_at: "2026-09-02T20:00:00Z", notes: "Tom Peeters" }),
      sessie({ id: "b-leeg", starts_at: "2026-09-02T10:00:00Z", notes: "" }),
      sessie({ id: "b-match", starts_at: "2026-09-01T10:00:00Z", notes: "Sarah D." }),
    ]);
    expect(r.map((x) => x.bookingId)).toEqual(["b-match", "b-leeg", "b-anders"]);
  });

  it("geeft een lege lijst zonder invoer", () => {
    expect(teControleren()).toEqual([]);
  });
});

describe("opbrengstCents", () => {
  // Een aanrekening die teruggedraaid wordt, mag niet als omzet blijven staan in het dashboard.
  it("valt terug op nul zodra een aanbreng teruggedraaid is", () => {
    expect(opbrengstCents([
      { reason: "aanbreng", delta: -0.5 },
      { reason: "aanbreng_terug", delta: 0.5 },
    ])).toBe(0);
  });

  it("telt twee aanrekeningen op tot € 12", () => {
    expect(opbrengstCents([
      { reason: "aanbreng", delta: -0.5 },
      { reason: "aanbreng", delta: -0.5 },
    ])).toBe(1200);
  });

  // Het tegoedboek bevat ook sessies, aankopen en kwijtscheldingen. Zouden die meetellen, dan zou de
  // aanbrengomzet de volledige zaalomzet opslokken.
  it("telt regels met een andere reden niet mee", () => {
    expect(opbrengstCents([
      { reason: "sessie", delta: -1 },
      { reason: "aankoop", delta: 10 },
      { reason: "kwijtschelding", delta: 0.5 },
      { reason: "aanbreng", delta: -0.5 },
    ])).toBe(600);
  });

  it("geeft nul terug bij een lege lijst", () => {
    expect(opbrengstCents()).toBe(0);
    expect(opbrengstCents([])).toBe(0);
  });
});
