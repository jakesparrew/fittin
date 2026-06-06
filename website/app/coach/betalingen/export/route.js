import { getCoachContext } from "@/lib/coach";

export const dynamic = "force-dynamic";

const csvCell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const money = (c) => ((c || 0) / 100).toFixed(2).replace(".", ",");

// CSV of the coach's payment requests for their accounting.
export async function GET() {
  const ctx = await getCoachContext();
  if (!ctx) return new Response("Geen toegang.", { status: 403 });
  const { supabase, userId } = ctx;
  const { data: reqs } = await supabase
    .from("coach_payment_requests")
    .select("amount_cents, description, status, paid_at, created_at, client:profiles!coach_payment_requests_client_id_fkey(full_name, email)")
    .eq("coach_id", userId)
    .order("created_at", { ascending: false });

  const header = ["Datum", "Client", "E-mail", "Omschrijving", "Bedrag", "Status"];
  const lines = [header.map(csvCell).join(";")];
  for (const r of reqs || []) {
    const d = new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(r.paid_at || r.created_at));
    lines.push([d, r.client?.full_name || "", r.client?.email || "", r.description || "Sessie", money(r.amount_cents), r.status].map(csvCell).join(";"));
  }
  const paidTotal = (reqs || []).filter((r) => r.status === "paid").reduce((a, r) => a + (r.amount_cents || 0), 0);
  lines.push("");
  lines.push(["TOTAAL BETAALD", "", "", "", money(paidTotal), ""].map(csvCell).join(";"));

  const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fittin-coach-betalingen-${stamp}.csv"`,
    },
  });
}
