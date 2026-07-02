"use client";
import { useEffect } from "react";

// Catches errors in the root layout itself — must render its own <html>/<body> with inline styles
// (Tailwind/global CSS may not be available when the root layout fails).
export default function GlobalError({ error, reset }) {
  useEffect(() => {
    try {
      const body = JSON.stringify({ message: "global-error: " + (error?.message || "?"), stack: error?.stack || null, path: typeof location !== "undefined" ? location.pathname : null });
      navigator.sendBeacon?.("/api/log-error", new Blob([body], { type: "application/json" }));
    } catch { /* ignore */ }
  }, [error]);
  return (
    <html lang="nl">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", background: "#F5F6FA", color: "#22194F", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: "24px" }}>
        <div style={{ textAlign: "center", maxWidth: "460px" }}>
          <p style={{ fontSize: "40px", fontWeight: 800, margin: "0 0 10px" }}>Er ging iets mis</p>
          <p style={{ color: "#6b6685", lineHeight: 1.6, margin: "0 0 22px" }}>
            Sorry, er liep iets onverwacht fout. Probeer het opnieuw — gebeurt het nog, mail dan{" "}
            <a href="mailto:info@fittin.be" style={{ color: "#33B24A", fontWeight: 700 }}>info@fittin.be</a>.
          </p>
          <button onClick={() => reset()} style={{ background: "#5FDA6B", color: "#22194F", border: "none", fontWeight: 800, padding: "13px 26px", borderRadius: "999px", fontSize: "15px", cursor: "pointer" }}>
            Probeer opnieuw
          </button>
        </div>
      </body>
    </html>
  );
}
