import { describe, it, expect } from "vitest";
import { isPdf, keurCv, keurFoto, leeg, opslagPad, veiligeBestandsnaam, MAX_BYTES, MAX_MB } from "./coach-aanmelding.js";

// Een "bestand" zoals een FormData het aanlevert: we gebruiken alleen size, type en name.
const f = (name, type, size) => ({ name, type, size });

describe("isPdf", () => {
  it("herkent een echte pdf aan de kop", () => {
    expect(isPdf(Buffer.from("%PDF-1.7\n..."))).toBe(true);
  });

  // Dit is de reden dat deze functie bestaat: het MIME-type komt van de indiener, niet van ons.
  // Wie een zip of een script "application/pdf" noemt, moet hier alsnog stranden.
  it("trapt niet in een verkeerd MIME-type", () => {
    expect(isPdf(Buffer.from("PKzipinhoud"))).toBe(false);
    expect(isPdf(Buffer.from("<?php system($_GET[0]); ?>"))).toBe(false);
  });

  it("laat een pdf met wat voorloop toe, maar niet een verstopte kop verderop", () => {
    expect(isPdf(Buffer.concat([Buffer.alloc(64, 0x20), Buffer.from("%PDF-1.4")]))).toBe(true);
    expect(isPdf(Buffer.concat([Buffer.alloc(4000, 0x41), Buffer.from("%PDF-1.4")]))).toBe(false);
  });

  it("valt niet over leeg of te kort", () => {
    expect(isPdf(null)).toBe(false);
    expect(isPdf(Buffer.from("%PD"))).toBe(false);
  });
});

describe("leeg", () => {
  // Een niet-ingevulde file-input levert een File met size 0 op. Dat is "niets bijgevoegd" en mag
  // nooit als fout gelden — de bijlage is optioneel.
  it("beschouwt een niet-ingevuld veld als leeg", () => {
    expect(leeg(null)).toBe(true);
    expect(leeg("")).toBe(true);
    expect(leeg(f("leeg.pdf", "application/pdf", 0))).toBe(true);
    expect(leeg(f("cv.pdf", "application/pdf", 10))).toBe(false);
  });
});

describe("keurCv", () => {
  it("laat door zonder bijlage", () => {
    expect(keurCv(null, null)).toEqual({ ok: true, bestand: null });
  });

  it("weigert te groot", () => {
    const r = keurCv(f("cv.pdf", "application/pdf", MAX_BYTES + 1), Buffer.from("%PDF-1.7"));
    expect(r.error).toContain(`${MAX_MB} MB`);
  });

  it("weigert een bestand dat geen pdf is, ook al zegt de browser van wel", () => {
    const r = keurCv(f("cv.pdf", "application/pdf", 100), Buffer.from("GIF89a"));
    expect(r.error).toMatch(/pdf/i);
  });

  it("laat een echte pdf door", () => {
    const file = f("mijn cv.pdf", "application/pdf", 100);
    expect(keurCv(file, Buffer.from("%PDF-1.7"))).toEqual({ ok: true, bestand: file });
  });
});

describe("keurFoto", () => {
  it("laat door zonder bijlage", () => {
    expect(keurFoto(null)).toEqual({ ok: true, bestand: null });
  });

  it("weigert te groot en weigert een niet-afbeelding", () => {
    expect(keurFoto(f("p.jpg", "image/jpeg", MAX_BYTES + 1)).error).toContain(`${MAX_MB} MB`);
    expect(keurFoto(f("cv.pdf", "application/pdf", 100)).error).toMatch(/foto/i);
  });

  it("aanvaardt de gangbare telefoonformaten", () => {
    for (const t of ["image/jpeg", "image/png", "image/webp", "image/heic"]) {
      expect(keurFoto(f("p", t, 100)).ok).toBe(true);
    }
  });

  it("kijkt niet naar hoofdletters in het type", () => {
    expect(keurFoto(f("p.JPG", "IMAGE/JPEG", 100)).ok).toBe(true);
  });
});

describe("veiligeBestandsnaam", () => {
  // Deze naam belandt in de databank en wordt een downloadnaam. Alles wat een pad of een
  // aanhalingsteken kan worden, moet eruit — anders schrijft de indiener mee aan onze headers.
  it("haalt padtekens en aanhalingstekens eruit", () => {
    // De schuine strepen worden streepjes en de voorloopstippen vallen weg, zodat er geen naam
    // overblijft die als pad of als verborgen bestand gelezen kan worden.
    expect(veiligeBestandsnaam('../../etc/pas"swd.pdf')).toBe("etc-passwd.pdf");
    expect(veiligeBestandsnaam("cv\\jan.pdf")).toBe("cv-jan.pdf");
  });

  it("geeft een bruikbare naam terug als er niets bruikbaars overblijft", () => {
    expect(veiligeBestandsnaam("")).toBe("bestand");
    expect(veiligeBestandsnaam("...", "cv.pdf")).toBe("cv.pdf");
  });

  it("laat een gewone naam met accenten leesbaar", () => {
    expect(veiligeBestandsnaam("CV Jose Garcia 2026.pdf")).toBe("CV Jose Garcia 2026.pdf");
  });

  it("kapt af zodat een eindeloze naam de kolom niet opvult", () => {
    expect(veiligeBestandsnaam("a".repeat(500)).length).toBe(80);
  });
});

describe("opslagPad", () => {
  // Nooit de naam van de kandidaat in het pad: die is niet uniek en niet altijd veilig.
  it("bouwt een pad op gym en id, niet op de bestandsnaam", () => {
    expect(opslagPad("g1", "m1", "cv", "pdf")).toBe("g1/m1-cv.pdf");
    expect(opslagPad("g1", "m1", "foto", "webp")).toBe("g1/m1-foto.webp");
  });
});
