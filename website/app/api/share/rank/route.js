import { ImageResponse } from "next/og";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MON = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

// A square, Instagram-shareable card of the member's current leaderboard position.
export async function GET() {
  const { user, profile } = await getSessionProfile();
  if (!user || !profile) return new Response("unauthorized", { status: 401 });

  const admin = createAdminClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const { data: rows } = await admin
    .from("bookings")
    .select("user_id")
    .eq("gym_id", profile.gym_id)
    .eq("status", "bevestigd")
    .gte("starts_at", monthStart.toISOString())
    .lt("starts_at", now.toISOString());

  const counts = {};
  for (const r of rows || []) counts[r.user_id] = (counts[r.user_id] || 0) + 1;
  const board = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = board.length;
  const idx = board.findIndex(([id]) => id === user.id);
  const rank = idx >= 0 ? idx + 1 : total + 1;
  const sessions = counts[user.id] || 0;
  const name = (profile.full_name || "Lid").split(" ")[0];

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#22194F", color: "#fff", padding: 80, fontFamily: "sans-serif", position: "relative" }}>
        <div style={{ position: "absolute", top: -120, right: -120, width: 420, height: 420, borderRadius: 420, background: "rgba(95,218,107,0.25)" }} />
        <div style={{ display: "flex", fontSize: 54, fontWeight: 800, letterSpacing: -1 }}>
          Fittin<span style={{ color: "#C6F24E" }}>&rsquo;</span>
        </div>
        <div style={{ display: "flex", marginTop: 18, fontSize: 30, color: "#B2ADC2", textTransform: "uppercase", letterSpacing: 6 }}>Leaderboard · {MON[now.getMonth()]}</div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 24 }}>
            <div style={{ fontSize: 240, fontWeight: 800, lineHeight: 1, color: "#5FDA6B" }}>#{rank}</div>
            <div style={{ display: "flex", flexDirection: "column", paddingBottom: 30 }}>
              <div style={{ fontSize: 44, fontWeight: 800 }}>{name}</div>
              <div style={{ fontSize: 30, color: "#B2ADC2" }}>van de {total} leden</div>
            </div>
          </div>
          <div style={{ display: "flex", marginTop: 30, fontSize: 40, fontWeight: 700 }}>
            <span style={{ background: "#C6F24E", color: "#22194F", padding: "10px 28px", borderRadius: 999 }}>{sessions} sessies deze maand 💪</span>
          </div>
        </div>

        <div style={{ display: "flex", marginTop: 60, fontSize: 26, color: "#B2ADC2" }}>Train mee in jouw eigen privégym · fittin.be</div>
      </div>
    ),
    { width: 1080, height: 1080 }
  );
}
