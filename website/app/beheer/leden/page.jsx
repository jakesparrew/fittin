import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { adminAdjustCredits, adminSetRole } from "../actions";
import { AddMemberForm } from "@/components/admin/MemberControls";

export const dynamic = "force-dynamic";

const ROLES = ["lid", "coach", "beheerder"];

export default async function Leden() {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym, profile } = ctx;

  const [{ data: members }, { data: ledger }, { data: links }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, role, welcome_code_used, created_at").eq("gym_id", gym.id).order("created_at", { ascending: false }),
    supabase.from("credits_ledger").select("user_id, delta").eq("gym_id", gym.id),
    supabase.from("coach_clients").select("client_id, coach:profiles!coach_clients_coach_id_fkey(full_name, email)").eq("gym_id", gym.id),
  ]);

  const credits = {};
  for (const r of ledger || []) credits[r.user_id] = (credits[r.user_id] || 0) + r.delta;
  const coachOf = {};
  for (const l of links || []) (coachOf[l.client_id] ||= []).push(l.coach?.full_name || l.coach?.email || "Coach");
  const isBeheerder = profile.role === "beheerder";

  return (
    <div className="px-8 py-8">
      <h1 className="text-3xl font-black text-brand">Leden</h1>
      <p className="mt-1 text-sm text-brand/50">{(members || []).length} accounts · rollen en sessies beheren.</p>

      {isBeheerder && <div className="mt-6"><AddMemberForm /></div>}

      <div className="mt-6 overflow-hidden rounded-2xl border border-borderc bg-white">
        <table className="w-full text-sm">
          <thead className="bg-paper text-left text-xs font-bold uppercase tracking-wide text-lav">
            <tr>
              <th className="px-5 py-3">Naam</th>
              <th className="px-5 py-3">Rol</th>
              <th className="px-5 py-3">Coach</th>
              <th className="px-5 py-3">Sessies</th>
              <th className="px-5 py-3">Acties</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borderc">
            {(members || []).map((m) => (
              <tr key={m.id} className="align-top">
                <td className="px-5 py-4">
                  <Link href={`/beheer/leden/${m.id}`} className="font-bold text-brand hover:text-accentdark">
                    {m.full_name || "—"}
                  </Link>
                  <p className="text-xs text-brand/50">{m.email}</p>
                </td>
                <td className="px-5 py-4">
                  {isBeheerder ? (
                    <form action={adminSetRole} className="flex items-center gap-2">
                      <input type="hidden" name="memberId" value={m.id} />
                      <select name="role" defaultValue={m.role} className="rounded-lg border-2 border-borderc px-2 py-1 text-sm font-semibold">
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <button className="rounded-lg bg-brand px-3 py-1 text-xs font-bold text-white">OK</button>
                    </form>
                  ) : (
                    <span className="font-semibold capitalize text-brand/70">{m.role}</span>
                  )}
                </td>
                <td className="px-5 py-4">
                  {(coachOf[m.id] || []).length ? (
                    <span className="text-xs font-semibold text-brand/70">{coachOf[m.id].join(", ")}</span>
                  ) : (
                    <span className="text-xs text-brand/30">—</span>
                  )}
                </td>
                <td className="px-5 py-4">
                  <span className="font-black text-brand">{credits[m.id] || 0}</span>
                </td>
                <td className="px-5 py-4">
                  <form action={adminAdjustCredits} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="memberId" value={m.id} />
                    <input name="delta" type="number" placeholder="+3 of -3" title="+ = sessies bijgeven, - = sessies afhalen" className="w-24 rounded-lg border-2 border-borderc px-2 py-1 text-sm" />
                    <input name="reason" placeholder="reden (lid krijgt mail)" className="w-36 rounded-lg border-2 border-borderc px-2 py-1 text-sm" />
                    <button className="rounded-lg bg-accent px-3 py-1 text-xs font-bold text-brand">Bijwerken</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
