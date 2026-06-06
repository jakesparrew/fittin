import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { createProgram } from "../coaching-actions";

export const dynamic = "force-dynamic";

export default async function Programmas() {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym } = ctx;

  const [{ data: programs }, { data: members }] = await Promise.all([
    supabase
      .from("programs")
      .select("id, name, is_template, member:profiles!programs_member_id_fkey(full_name)")
      .eq("gym_id", gym.id)
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name, email").eq("gym_id", gym.id).order("full_name"),
  ]);

  return (
    <div className="px-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-black text-brand">Programma's</h1>
        <Link href="/beheer/oefeningen" className="rounded-full bg-paper px-4 py-2 text-sm font-bold text-brand transition hover:bg-accent/15">≣ Oefeningenbibliotheek →</Link>
      </div>
      <p className="mt-1 text-sm text-brand/50">Bouw trainingsschema's en wijs ze toe aan leden. Oefeningen kun je ook rechtstreeks in de bouwer toevoegen.</p>

      <form action={createProgram} className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-borderc bg-white p-5">
        <label className="block">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Naam</span>
          <input name="name" placeholder="Upper / Lower" required className="w-52 rounded-xl border-2 border-borderc px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Voor lid (optioneel = template)</span>
          <select name="memberId" className="w-52 rounded-xl border-2 border-borderc px-3 py-2 text-sm">
            <option value="">— Template —</option>
            {(members || []).map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
          </select>
        </label>
        <button className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-brand">+ Nieuw programma</button>
      </form>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(programs || []).map((p) => (
          <Link key={p.id} href={`/beheer/programmas/${p.id}`} className="rounded-2xl border border-borderc bg-white p-5 transition hover:border-accent">
            <p className="font-black text-brand">{p.name}</p>
            <p className="mt-1 text-xs font-semibold text-accentdark">
              {p.is_template ? "Template" : p.member?.full_name || "Toegewezen"}
            </p>
          </Link>
        ))}
        {(!programs || programs.length === 0) && <p className="text-sm text-brand/50">Nog geen programma's.</p>}
      </div>
    </div>
  );
}
