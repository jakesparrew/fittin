import { ImageResponse } from "next/og";

// Default social-share card for every page (WhatsApp, Facebook, LinkedIn, X, …).
export const runtime = "edge";
export const alt = "Fittin' — privé fitness & personal training in Gent";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "90px",
          background: "linear-gradient(135deg, #22194f 0%, #1a1440 100%)",
          color: "#fff",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        <div style={{ position: "absolute", top: -120, right: -120, width: 360, height: 360, borderRadius: "50%", background: "#5fda6b", opacity: 0.9 }} />
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 8, textTransform: "uppercase", color: "#b2adc2" }}>Gent · privégym</div>
        <div style={{ fontSize: 130, fontWeight: 900, marginTop: 14, display: "flex" }}>
          Fittin<span style={{ color: "#5fda6b" }}>&rsquo;</span>
        </div>
        <div style={{ fontSize: 44, fontWeight: 700, marginTop: 8, maxWidth: 820, lineHeight: 1.2 }}>
          Privé fitness &amp; personal training — reserveer de zaal voor jezelf.
        </div>
        <div style={{ marginTop: 40, display: "flex", gap: 16 }}>
          {["elke dag 6–23u", "€ 15 / sessie", "geen lidgeld"].map((t) => (
            <div key={t} style={{ background: "rgba(255,255,255,0.1)", borderRadius: 999, padding: "12px 26px", fontSize: 28, fontWeight: 700 }}>{t}</div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
