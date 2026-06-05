import { getAdminContext } from "@/lib/admin";

export const dynamic = "force-dynamic";
const euro = (c) => "€ " + ((c || 0) / 100).toFixed(2).replace(".", ",");
const WD = ["ma", "di", "wo", "do", "vr", "za", "zo"];

function brussels(iso) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Brussels",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const wd = parts.find((p) => p.type === "weekday")?.value.toLowerCase().slice(0, 2);
  const map = { mo: "ma", tu: "di", we: "wo", th: "do", fr: "vr", sa: "za", su: "zo" };
  return { wd: map[wd] || wd, hour: parseInt(parts.find((p) => p.type === "hour")?.value, 10) };
}

export default async function Analytics() {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym } = ctx;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const windowStart = new Date(now.getTime() - 60 * 86400000);

  const [{ data: bookings }, { count: memberCount }] = await Promise.all([
    supabase.from("bookings").select("starts_at, paid, price_cents, created_at, status").eq("gym_id", gym.id).gte("starts_at", windowStart.toISOString()),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("gym_id", gym.id).eq("role", "lid"),
  ]);

  const all = bookings || [];
  const confirmed = all.filter((b) => b.status === "bevestigd");

  // Heatmap counts
  const hours = [];
  for (let h = gym.open_hour; h < gym.close_hour; h++) hours.push(h);
  const grid = {}; // key wd-hour -> count
  let max = 0;
  for (const b of confirmed) {
    const { wd, hour } = brussels(b.starts_at);
    const k = `${wd}-${hour}`;
    grid[k] = (grid[k] || 0) + 1;
    if (grid[k] > max) max = grid[k];
  }

  const revThisMonth = all.filter((b) => b.paid && new Date(b.created_at) >= monthStart).reduce((a, b) => a + (b.price_cents || 0), 0);
  const revLastMonth = all.filter((b) => b.paid && new Date(b.created_at) >= lastMonthStart && new Date(b.created_at) < monthStart).reduce((a, b) => a + (b.price_cents || 0), 0);

  return (
    <div className="px-8 py-8">
      <h1 className="text-3xl font-black text-brand">Analytics</h1>
      <p className="mt-1 text-sm text-brand/50">Bezetting, omzet en leden — om prijzen en daluren te sturen.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <Stat label="Actieve leden" value={memberCount ?? 0} />
        <Stat label="Boekingen (60d)" value={confirmed.length} />
        <Stat label="Omzet deze maand" value={euro(revThisMonth)} />
        <Stat label="Omzet vorige maand" value={euro(revLastMonth)} />
      </div>

      <section className="mt-8 rounded-2xl border border-borderc bg-white p-6">
        <h2 className="font-black text-brand">Bezettings-heatmap</h2>
        <p className="text-xs text-brand/50">Aantal boekingen per uur en weekdag (laatste 60 dagen).</p>
        <div className="mt-4 overflow-x-auto">
          <table className="text-xs">
            <thead>
              <tr className="text-brand/40">
                <th className="px-2 py-1"></th>
                {WD.map((d) => <th key={d} className="px-2 py-1 font-bold uppercase">{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {hours.map((h) => (
                <tr key={h}>
                  <td className="px-2 py-1 text-right font-bold text-brand/40">{h}:00</td>
                  {WD.map((d) => {
                    const c = grid[`${d}-${h}`] || 0;
                    const intensity = max ? c / max : 0;
                    return (
                      <td key={d} className="px-1 py-1">
                        <div
                          className="flex h-7 w-10 items-center justify-center rounded-md text-[10px] font-bold"
                          style={{
                            backgroundColor: c ? `rgba(95,218,107,${0.15 + intensity * 0.85})` : "#f5f6fa",
                            color: intensity > 0.5 ? "#22194f" : "#9b97ab",
                          }}
                        >
                          {c || ""}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border border-borderc bg-white p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-lav">{label}</p>
      <p className="mt-2 text-2xl font-black text-brand">{value}</p>
    </div>
  );
}
