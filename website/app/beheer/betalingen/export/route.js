import { getAdminContext } from "@/lib/admin";

export const dynamic = "force-dynamic";

const KIND = { booking: "Boeking", beurtenkaart: "Beurtenkaart", abonnement: "Abonnement", coach_credits: "Coach-sessies", overig: "Overig" };
const csvCell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
// BE sport non-profit: consumer prices are VAT-inclusive at 6%. Break out net + VAT.
const VAT_RATE = 0.06;
const money = (c) => (c / 100).toFixed(2).replace(".", ",");

// CSV of every transaction in the gym (optionally filtered by ?kind=&from=&to=), with the 6% VAT
// split out per line so the bookkeeper has net + VAT + gross for the non-profit's accounts.
export async function GET(req) {
  const ctx = await getAdminContext();
  if (!ctx) return new Response("Geen toegang.", { status: 403 });
  const { supabase, gym } = ctx;
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  let q = supabase
    .from("payments")
    .select("amount_cents, currency, kind, description, status, stripe_id, created_at, member:profiles!payments_user_id_fkey(full_name, email)")
    .eq("gym_id", gym.id)
    .order("created_at", { ascending: false });
  if (kind) q = q.eq("kind", kind);
  if (from) q = q.gte("created_at", new Date(from).toISOString());
  if (to) q = q.lt("created_at", new Date(new Date(to).getTime() + 86400000).toISOString());
  const { data: rows } = await q;

  const header = ["Datum", "Lid", "E-mail", "Type", "Omschrijving", "Bedrag (incl. btw)", "Netto (excl. btw)", "Btw 6%", "Munt", "Status", "Stripe ID"];
  const lines = [header.map(csvCell).join(";")];
  for (const p of rows || []) {
    const gross = p.amount_cents || 0;
    const net = Math.round(gross / (1 + VAT_RATE));
    const vat = gross - net;
    const d = new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(p.created_at));
    lines.push([
      d,
      p.member?.full_name || "",
      p.member?.email || "",
      KIND[p.kind] || p.kind,
      p.description || "",
      money(gross),
      money(net),
      money(vat),
      (p.currency || "eur").toUpperCase(),
      p.status || "",
      p.stripe_id || "",
    ].map(csvCell).join(";"));
  }
  const total = (rows || []).reduce((a, p) => a + (p.amount_cents || 0), 0);
  const netTotal = (rows || []).reduce((a, p) => a + Math.round((p.amount_cents || 0) / (1 + VAT_RATE)), 0);
  lines.push("");
  lines.push(["TOTAAL", "", "", "", "", money(total), money(netTotal), money(total - netTotal)].map(csvCell).join(";"));

  const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
  // BOM so Excel reads UTF-8 correctly.
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fittin-transacties-${stamp}.csv"`,
    },
  });
}
