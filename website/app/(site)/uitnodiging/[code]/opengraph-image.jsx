import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";

// Het deelkaartje van een uitnodiging. Dit is het hele punt van brok 2: tot nu deelde een lid de
// URL /login?mode=signup&ref=CODE, en WhatsApp toonde daarvan een kaartje met "Inloggen | Fittin'"
// erop. Niemand tikt op een loginformulier.
//
// Alleen de VOORNAAM van de aanbrenger komt op de kaart — geen achternaam, geen foto. Dat is de
// grens: een uitnodigingslink kan in eender welke groepschat belanden.
export const runtime = "nodejs";
export const alt = "Uitnodiging voor Fittin' — je eerste uur is gratis";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OG({ params }) {
  const logo = await readFile(join(process.cwd(), "public/logo-white.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  // Onbekende of ontbrekende code → de neutrale variant. Nooit een fout: een kapot deelkaartje is
  // erger dan een kaartje zonder naam.
  let voornaam = "";
  try {
    const code = String((await params)?.code || "").trim();
    if (/^[A-Za-z0-9]{4,16}$/.test(code)) {
      const { data } = await createAdminClient()
        .from("profiles").select("full_name").ilike("referral_code", code).maybeSingle();
      voornaam = String(data?.full_name || "").trim().split(/\s+/)[0] || "";
    }
  } catch { /* stil: de kaart moet altijd renderen */ }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          justifyContent: "center", padding: "90px",
          background: "linear-gradient(135deg, #22194f 0%, #1a1440 100%)",
          color: "#fff", fontFamily: "sans-serif", position: "relative",
        }}
      >
        <div style={{ position: "absolute", top: -120, right: -120, width: 360, height: 360, borderRadius: "50%", background: "#5fda6b", opacity: 0.9 }} />
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 8, textTransform: "uppercase", color: "#b2adc2" }}>Gent · privégym</div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} width={400} height={106} style={{ marginTop: 20 }} alt="Fittin'" />
        <div style={{ fontSize: 60, fontWeight: 800, marginTop: 24, maxWidth: 900, lineHeight: 1.1 }}>
          {voornaam ? `${voornaam} nodigt je uit` : "Je bent uitgenodigd"}
        </div>
        <div style={{ fontSize: 42, fontWeight: 700, marginTop: 14, color: "#5fda6b" }}>Jouw eerste uur is gratis</div>
        <div style={{ marginTop: 36, display: "flex", gap: 16 }}>
          {["de hele zaal privé", "€ 15 / uur", "geen lidgeld"].map((t) => (
            <div key={t} style={{ background: "rgba(255,255,255,0.1)", borderRadius: 999, padding: "12px 26px", fontSize: 26, fontWeight: 700 }}>{t}</div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
