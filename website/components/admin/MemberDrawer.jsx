"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminUpdateMember, resendInviteMail, adminSetRole, adminAdjustCredits, assignCoachClient, unassignCoachClient, deleteUser } from "@/app/beheer/actions";

const euro = (c) => "€ " + ((c || 0) / 100).toFixed(2).replace(".", ",");
const fmt = (iso) => (iso ? new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—");
const day = (iso) => (iso ? new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso)) : "—");
const ROLES = ["lid", "coach", "beheerder"];
const KIND = { booking: "Boeking", beurtenkaart: "Beurtenkaart", abonnement: "Abonnement", coach_credits: "Coach", overig: "Overig" };
const toast = (type, msg) => window.dispatchEvent(new CustomEvent("fittin:toast", { detail: { type, msg } }));

export default function MemberDrawer() {
  const router = useRouter();
  const [id, setId] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (mid) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/beheer/leden/${mid}`, { cache: "no-store" });
      setData(r.ok ? await r.json() : null);
    } catch { setData(null); }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onOpen = (e) => { const mid = e.detail?.id; if (mid) { setId(mid); setData(null); load(mid); } };
    window.addEventListener("fittin:open-member", onOpen);
    const onKey = (e) => { if (e.key === "Escape") setId(null); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("fittin:open-member", onOpen); window.removeEventListener("keydown", onKey); };
  }, [load]);

  async function run(action, fd, { close, refresh } = {}) {
    setBusy(true);
    const res = await action(fd);
    setBusy(false);
    if (res?.error) { toast("error", res.error); return; }
    toast("success", res?.message || "Opgeslagen ✓");
    if (close) setId(null);
    if (refresh) router.refresh();
    else if (id) load(id);
  }
  const submit = (action, opts) => (e) => { e.preventDefault(); run(action, new FormData(e.currentTarget), opts); };

  if (!id) return null;
  const p = data?.profile;
  const s = data?.stats || {};

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setId(null)}>
      <div className="absolute inset-0 bg-brand/30" />
      <aside className="relative h-full w-full max-w-xl overflow-y-auto bg-paper shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {loading || !data ? (
          <div className="flex h-full items-center justify-center text-brand/40">{loading ? "Laden…" : "Geen gegevens."}</div>
        ) : (
          <div className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black text-brand">{p.full_name || "—"}</h2>
                <p className="text-sm text-brand/50">{p.email}{p.phone ? ` · ${p.phone}` : ""}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                  <span className="rounded-full bg-brand/10 px-2.5 py-0.5 capitalize text-brand/70">{p.role}</span>
                  <span className="rounded-full bg-paper px-2.5 py-0.5 text-brand/50">lid sinds {day(p.created_at)}</span>
                  {data.membership && <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-accentdark">member ✓</span>}
                  {data.coach && <span className="rounded-full bg-paper px-2.5 py-0.5 text-brand/60">coach: {data.coach.full_name}</span>}
                </div>
              </div>
              <button onClick={() => setId(null)} className="rounded-full p-2 text-brand/40 hover:bg-white hover:text-brand">✕</button>
            </div>

            {/* Stats */}
            <div className="mt-5 grid grid-cols-3 gap-2">
              <Tile label="Sessies (saldo)" value={data.credits} />
              <Tile label="Totaal geboekt" value={s.totalBooked} />
              <Tile label="Deze maand" value={s.sessionsThisMonth} />
              <Tile label="Totaal betaald" value={euro(s.totalSpentCents)} />
              <Tile label="Buddies" value={s.buddies} />
              <Tile label="Aanbrengingen" value={s.referrals} />
            </div>

            {/* Admin actions */}
            <Section title="Beheer">
              <form onSubmit={submit(adminUpdateMember)} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="memberId" value={id} />
                <L t="Naam"><input name="full_name" defaultValue={p.full_name || ""} className="w-40 rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></L>
                <L t="Telefoon"><input name="phone" defaultValue={p.phone || ""} className="w-32 rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></L>
                <button disabled={busy} className="rounded-full bg-brand px-4 py-1.5 text-xs font-bold text-white">Opslaan</button>
              </form>

              <div className="mt-2 flex flex-wrap items-end gap-2">
                <form onSubmit={submit(adminSetRole)} className="flex items-end gap-2">
                  <input type="hidden" name="memberId" value={id} />
                  <L t="Rol"><select name="role" defaultValue={p.role} className="rounded-lg border-2 border-borderc px-2 py-1.5 text-sm">{ROLES.map((r) => <option key={r}>{r}</option>)}</select></L>
                  <button disabled={busy} className="rounded-full bg-paper px-3 py-1.5 text-xs font-bold text-brand">Rol opslaan</button>
                </form>
                <form onSubmit={submit(resendInviteMail)}>
                  <input type="hidden" name="memberId" value={id} />
                  <button disabled={busy} className="rounded-full bg-paper px-3 py-1.5 text-xs font-bold text-brand">✉ Uitnodiging (her)sturen</button>
                </form>
              </div>

              <form onSubmit={submit(adminAdjustCredits)} className="mt-2 flex flex-wrap items-end gap-2">
                <input type="hidden" name="memberId" value={id} />
                <L t="Sessies ±"><input name="delta" type="number" placeholder="+3 / -3" className="w-24 rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></L>
                <L t="Reden (lid krijgt mail)"><input name="reason" placeholder="bv. compensatie" className="w-40 rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></L>
                <button disabled={busy} className="rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-brand">Bijwerken</button>
              </form>

              <div className="mt-2 flex flex-wrap items-end gap-2">
                {data.coach ? (
                  <form onSubmit={submit(unassignCoachClient)} className="flex items-end gap-2">
                    <input type="hidden" name="clientId" value={id} />
                    <input type="hidden" name="coachId" value={data.coach.id} />
                    <span className="text-xs text-brand/60">Coach: <b>{data.coach.full_name}</b></span>
                    <button disabled={busy} className="rounded-full border-2 border-borderc px-3 py-1.5 text-xs font-bold text-brand/60">Ontkoppel</button>
                  </form>
                ) : (
                  <form onSubmit={submit(assignCoachClient)} className="flex items-end gap-2">
                    <input type="hidden" name="clientId" value={id} />
                    <L t="Koppel coach"><select name="coachId" required className="rounded-lg border-2 border-borderc px-2 py-1.5 text-sm"><option value="">Kies…</option>{(data.coaches || []).map((c) => <option key={c.id} value={c.id}>{c.full_name || c.email}</option>)}</select></L>
                    <button disabled={busy} className="rounded-full bg-paper px-3 py-1.5 text-xs font-bold text-brand">Koppel</button>
                  </form>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between">
                <Link href={`/beheer/leden/${id}`} className="text-xs font-bold text-accentdark hover:underline">Volledige pagina →</Link>
                <button
                  disabled={busy}
                  onClick={() => { if (confirm(`${p.full_name || "dit lid"} definitief verwijderen?`)) { const fd = new FormData(); fd.set("userId", id); run(deleteUser, fd, { close: true, refresh: true }); } }}
                  className="text-xs font-bold text-red-500 hover:underline"
                >Lid verwijderen</button>
              </div>
            </Section>

            {/* Bookings */}
            <Section title={`Boekingen (${data.bookings.length})`}>
              <List items={data.bookings} empty="Geen boekingen." render={(b) => (
                <Row key={b.id} left={`${b.services?.name || "Sessie"}${b.coach ? ` · coach ${b.coach.full_name}` : ""}`} sub={`${fmt(b.starts_at)} · ${b.persons}p`} right={<span className={b.status === "geannuleerd" ? "text-brand/40" : b.paid || b.price_cents === 0 ? "text-accentdark" : "text-red-500"}>{b.status === "geannuleerd" ? "geannuleerd" : b.paid ? euro(b.price_cents) : b.price_cents ? "onbetaald" : "gratis"}</span>} />
              )} />
            </Section>

            {/* Payments */}
            <Section title={`Betalingen (${data.payments.length})`}>
              <List items={data.payments} empty="Geen betalingen." render={(p2, i) => (
                <Row key={i} left={`${KIND[p2.kind] || p2.kind}${p2.description ? ` · ${p2.description}` : ""}`} sub={fmt(p2.created_at)} right={<span className="font-black text-brand">{euro(p2.amount_cents)}</span>} />
              )} />
            </Section>

            {/* Events */}
            <Section title={`Events (${data.events.length})`}>
              <List items={data.events} empty="Geen events." render={(e, i) => (
                <Row key={i} left={e.title} sub={fmt(e.startsAt)} right={<span className={e.paid ? "text-accentdark" : "text-brand/40"}>{e.paid ? "ingeschreven" : "onbetaald"}</span>} />
              )} />
            </Section>

            {/* Coach payment requests */}
            {data.paymentRequests.length > 0 && (
              <Section title={`Coach-betaalverzoeken (${data.paymentRequests.length})`}>
                <List items={data.paymentRequests} render={(r, i) => (
                  <Row key={i} left={r.description || "Sessie"} sub={fmt(r.created_at)} right={<span className={r.status === "paid" ? "text-accentdark" : "text-brand/50"}>{euro(r.amount_cents)} · {r.status}</span>} />
                )} />
              </Section>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function Tile({ label, value }) {
  return <div className="rounded-xl border border-borderc bg-white p-3 text-center"><p className="text-[10px] font-bold uppercase tracking-wide text-lav">{label}</p><p className="mt-0.5 text-lg font-black text-brand">{value ?? 0}</p></div>;
}
function Section({ title, children }) {
  return <div className="mt-6 rounded-2xl border border-borderc bg-white p-5"><p className="text-xs font-bold uppercase tracking-widest text-lav">{title}</p><div className="mt-3">{children}</div></div>;
}
function L({ t, children }) {
  return <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">{t}</span>{children}</label>;
}
function List({ items, render, empty }) {
  if (!items?.length) return <p className="text-sm text-brand/40">{empty || "—"}</p>;
  return <div className="divide-y divide-borderc">{items.map(render)}</div>;
}
function Row({ left, sub, right }) {
  return <div className="flex items-center justify-between gap-3 py-2 text-sm"><div className="min-w-0"><p className="truncate font-semibold text-brand">{left}</p><p className="truncate text-xs capitalize text-brand/45">{sub}</p></div><div className="shrink-0 text-xs font-bold">{right}</div></div>;
}
