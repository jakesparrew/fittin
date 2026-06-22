"use client";
import { useState } from "react";
import { adminAdjustCredits, adminSetRole } from "@/app/beheer/actions";
import OpenMemberButton from "@/components/admin/OpenMemberButton";
import ActionForm from "@/components/ui/ActionForm";

const ROLES = ["lid", "coach", "beheerder"];

const ago = (iso) => {
  if (!iso) return "—";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? "vandaag" : d === 1 ? "gisteren" : d < 31 ? `${d}d geleden` : d < 365 ? `${Math.floor(d / 30)} mnd` : `${Math.floor(d / 365)} jr`;
};
// Disengagement at a glance: red >30d, amber >14d, normal recent, grey never.
const tone = (iso) => {
  if (!iso) return "text-brand/30";
  const d = (Date.now() - new Date(iso).getTime()) / 86400000;
  return d > 30 ? "font-bold text-red-500" : d > 14 ? "font-semibold text-amber-500" : "text-brand/70";
};

export default function MembersTable({ members = [], credits = {}, coachOf = {}, lastLogin = {}, lastVisit = {}, isBeheerder }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const rows = needle
    ? members.filter((m) => (m.full_name || "").toLowerCase().includes(needle) || (m.email || "").toLowerCase().includes(needle))
    : members;

  return (
    <>
      <div className="mt-6 max-w-sm">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Zoek op naam of e-mail…"
          className="w-full rounded-full border-2 border-borderc bg-white px-5 py-2.5 text-sm text-brand outline-none transition focus:border-accent"
        />
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-borderc bg-white">
        <table className="w-full text-sm">
          <thead className="bg-paper text-left text-xs font-bold uppercase tracking-wide text-lav">
            <tr>
              <th className="px-5 py-3">Naam</th>
              <th className="px-5 py-3">Rol</th>
              <th className="px-5 py-3">Coach</th>
              <th className="px-5 py-3">Sessies</th>
              <th className="px-5 py-3">Laatste login</th>
              <th className="px-5 py-3">Laatste bezoek</th>
              <th className="px-5 py-3">Acties</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borderc">
            {rows.map((m) => (
              <tr key={m.id} className="align-top">
                <td className="px-5 py-4">
                  <OpenMemberButton id={m.id} name={m.full_name} email={m.email} />
                  <p className="text-xs text-brand/50">{m.email}</p>
                </td>
                <td className="px-5 py-4">
                  {isBeheerder ? (
                    <ActionForm action={adminSetRole} success="Rol gewijzigd ✓" className="flex items-center gap-2">
                      <input type="hidden" name="memberId" value={m.id} />
                      <select name="role" defaultValue={m.role} className="rounded-lg border-2 border-borderc px-2 py-1 text-sm font-semibold">
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <button className="rounded-lg bg-brand px-3 py-1 text-xs font-bold text-white">OK</button>
                    </ActionForm>
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
                <td className="px-5 py-4 whitespace-nowrap"><span className={"text-xs " + tone(lastLogin[m.id])}>{ago(lastLogin[m.id])}</span></td>
                <td className="px-5 py-4 whitespace-nowrap"><span className={"text-xs " + tone(lastVisit[m.id])}>{ago(lastVisit[m.id])}</span></td>
                <td className="px-5 py-4">
                  <ActionForm action={adminAdjustCredits} success="Sessietegoed aangepast ✓" className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="memberId" value={m.id} />
                    <input name="delta" type="number" placeholder="+3 of -3" title="+ = sessies bijgeven, - = sessies afhalen" className="w-24 rounded-lg border-2 border-borderc px-2 py-1 text-sm" />
                    <input name="reason" placeholder="reden (lid krijgt mail)" className="w-36 rounded-lg border-2 border-borderc px-2 py-1 text-sm" />
                    <button className="rounded-lg bg-accent px-3 py-1 text-xs font-bold text-brand">Bijwerken</button>
                  </ActionForm>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="mt-3 text-sm text-brand/50">Geen leden gevonden{q ? ` voor “${q}”` : ""}.</p>}
    </>
  );
}
