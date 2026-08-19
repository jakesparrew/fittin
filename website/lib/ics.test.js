import { describe, it, expect } from "vitest";
import { bookingIcs, icsAttachment } from "@/lib/ics";

// Dit bestand vertrekt voortaan als bijlage bij elke bevestigings- en herinneringsmail. Een fout
// hier is onzichtbaar: de mail komt gewoon aan, alleen de agenda-uitnodiging opent niet. Vandaar
// de randen: onvolledige invoer, tekens die het formaat breken, en de stabiele UID.

const boeking = {
  id: "3f1c2a10-0000-4000-8000-abcdefabcdef",
  startsAt: "2026-08-20T17:00:00.000Z",
  endsAt: "2026-08-20T18:00:00.000Z",
  serviceName: "Fit60",
  address: "Aannemersstraat 186, 9040 Gent",
};

describe("bookingIcs", () => {
  it("bouwt een geldig VEVENT met alarm en CRLF-regeleindes", () => {
    const s = bookingIcs(boeking);
    expect(s.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(s.endsWith("END:VCALENDAR")).toBe(true);
    expect(s).toContain("\r\n");
    expect(s).toContain("DTSTART:20260820T170000Z");
    expect(s).toContain("DTEND:20260820T180000Z");
    expect(s).toContain("BEGIN:VALARM");
    expect(s).not.toContain("undefined");
    expect(s).not.toContain("NaN");
  });

  it("houdt de UID stabiel per boeking, zodat een tweede mail geen dubbele afspraak maakt", () => {
    expect(bookingIcs(boeking)).toContain(`UID:booking-${boeking.id}@fittin.be`);
    // Herinneringsmail: zelfde boeking, adres onbekend → nog steeds dezelfde afspraak.
    expect(bookingIcs({ ...boeking, address: null })).toContain(`UID:booking-${boeking.id}@fittin.be`);
  });

  it("escapet komma's in het adres (anders knipt de agenda het veld af)", () => {
    const s = bookingIcs(boeking);
    expect(s).toContain("LOCATION:Aannemersstraat 186\\, 9040 Gent");
  });

  it("geeft null bij onvolledige invoer, zodat de mail zonder bijlage vertrekt", () => {
    expect(bookingIcs({})).toBe(null);
    expect(bookingIcs({ id: "x", startsAt: boeking.startsAt })).toBe(null);
    expect(icsAttachment({ id: null })).toBe(null);
  });

  it("houdt elke regel binnen de 75 octetten van RFC 5545 (line folding)", () => {
    const s = bookingIcs(boeking);
    const langste = Math.max(...s.split("\r\n").map((r) => Buffer.byteLength(r, "utf8")));
    expect(langste).toBeLessThanOrEqual(75);
    // Ontvouwen (CRLF + spatie weg) moet de originele tekst teruggeven — dus niets verloren,
    // en de meerbyte-· uit de SUMMARY staat er nog heel.
    const ontvouwd = s.replace(/\r\n /g, "");
    expect(ontvouwd).toContain("Je toegangscode komt ± 5 minuten voor je sessie per e-mail.");
    expect(ontvouwd).toContain("SUMMARY:Fit60 · Fittin'");
    expect(s).not.toContain("�"); // geen halve UTF-8-tekens
  });

  it("draagt een SEQUENCE die stijgt, zodat een verplaatste sessie het agenda-item bijwerkt", () => {
    const bevestiging = bookingIcs(boeking, new Date("2026-08-18T10:00:00Z"));
    const verplaatsing = bookingIcs(boeking, new Date("2026-08-19T10:00:00Z"));
    const seq = (s) => Number(s.match(/\r\nSEQUENCE:(\d+)/)[1]);
    expect(seq(bevestiging)).toBeGreaterThanOrEqual(0);
    expect(seq(verplaatsing)).toBeGreaterThan(seq(bevestiging));
    // DTSTAMP volgt hetzelfde moment, niet de starttijd: anders loopt hij bij een verplaatsing
    // naar vroeger achteruit en leest de agenda dat als een oudere versie.
    expect(bevestiging).toContain("DTSTAMP:20260818T100000Z");
    expect(verplaatsing).toContain("DTSTAMP:20260819T100000Z");
  });

  it("levert een Resend-bijlage met base64-inhoud", () => {
    const a = icsAttachment(boeking);
    expect(a.filename).toBe("fittin-sessie.ics");
    expect(Buffer.from(a.content, "base64").toString("utf8")).toContain("BEGIN:VCALENDAR");
  });
});
