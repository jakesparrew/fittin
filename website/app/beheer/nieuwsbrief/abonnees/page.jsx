import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { addSubscriber, setSubscriberStatus } from "../../newsletter-actions";
import ActionForm from "@/components/ui/ActionForm";

export const dynamic = "force-dynamic";
const fmt = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
const SOURCE = { auto: "Lid", signup: "Website", import: "Handmatig" };

export default async function Subscribers() {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym } = ctx;

  const { data: subs } = await supabase
    .from("subscribers")
    .select("id, email, name, status, source, created_at")
    .eq("gym_id", gym.id)
    .order("created_at", { ascending: false });

  const active = (subs || []).filter((s) => s.status === "active").length;
  const unsub = (subs || []).filter((s) => s.status === "unsubscribed").length;

  return (
    <div className="px-8 py-8">
      <Link href="/beheer/nieuwsbrief" className="text-sm font-semibold text-brand/50 hover:text-brand">← Campagnes</Link>
      <h1 className="mt-2 text-3xl font-black text-brand">Abonnees</h1>
      <p className="mt-1 text-sm text-brand/50">{active} actief · {unsub} uitgeschreven · {(subs || []).length} totaal. Elk lid wordt automatisch toegevoegd.</p>

      <ActionForm action={addSubscriber} success="Abonnee toegevoegd ✓" className="mt-6 flex flex-wrap items-end gap-2 rounded-2xl border border-borderc bg-white p-4">
        <input name="name" placeholder="Naam (optioneel)" className="rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
        <input name="email" type="email" required placeholder="E-mailadres" className="flex-1 rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
        <button className="rounded-full bg-brand px-4 py-2 text-sm font-bold text-white">+ Abonnee toevoegen</button>
      </ActionForm>

      <div className="mt-6 overflow-hidden rounded-2xl border border-borderc bg-white">
        <table className="w-full text-sm">
          <thead className="bg-paper text-left text-xs font-bold uppercase tracking-wide text-lav">
            <tr>
              <th className="px-5 py-3">E-mail</th>
              <th className="px-5 py-3">Naam</th>
              <th className="px-5 py-3">Bron</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Sinds</th>
              <th className="px-5 py-3 text-right">Actie</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borderc">
            {(subs || []).map((s) => (
              <tr key={s.id}>
                <td className="px-5 py-3 font-semibold text-brand">{s.email}</td>
                <td className="px-5 py-3 text-brand/60">{s.name || "—"}</td>
                <td className="px-5 py-3"><span className="rounded-full bg-paper px-2.5 py-0.5 text-xs font-bold text-brand/60">{SOURCE[s.source] || s.source}</span></td>
                <td className="px-5 py-3">
                  {s.status === "active" ? <span className="text-xs font-bold text-accentdark">Actief</span> : <span className="text-xs font-bold text-brand/40">{s.status === "unsubscribed" ? "Uitgeschreven" : "Bounced"}</span>}
                </td>
                <td className="px-5 py-3 text-xs text-brand/40">{fmt(s.created_at)}</td>
                <td className="px-5 py-3 text-right">
                  <ActionForm action={setSubscriberStatus} success="Bijgewerkt ✓" className="inline">
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="status" value={s.status === "active" ? "unsubscribed" : "active"} />
                    <button className="text-xs font-bold text-brand/50 hover:text-brand">{s.status === "active" ? "Uitschrijven" : "Heractiveren"}</button>
                  </ActionForm>
                </td>
              </tr>
            ))}
            {(!subs || subs.length === 0) && <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-brand/40">Nog geen abonnees.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
