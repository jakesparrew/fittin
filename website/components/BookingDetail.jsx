"use client";
import { useEffect, useState } from "react";
import { getBookingDetail } from "@/app/booking-detail-action";
import { isSettled, sourceLabel } from "@/lib/booking-status";

const fmt = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const time = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const euro = (c) => "€ " + ((c || 0) / 100).toFixed(2).replace(".", ",");
const bron = (b) => sourceLabel(b);

// Click a booking name/card anywhere → slide-in side panel with the full details. Read-only.
// `coaches` + `assignAction` worden enkel door het beheerscherm meegegeven. De boekingslijst had
// vroeger een eigen kolom met een keuzelijst op élke rij; die stond bijna altijd op "geen" en was
// dus vooral ruis. Toewijzen hoort bij één specifieke boeking, dus staat het hier — op de plek waar
// je die boeking al open hebt. Zonder die props blijft dit paneel gewoon leesbaar-alleen (leden).
export default function BookingDetail({ bookingId, children, className = "", coaches = null, assignAction = null }) {
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);

  async function openPanel(e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    setOpen(true);
    if (!res) {
      setLoading(true);
      const r = await getBookingDetail(bookingId);
      setRes(r);
      setLoading(false);
    }
  }

  // Escape closes the drawer (basic dialog behaviour for keyboard users).
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" onClick={openPanel} className={"cursor-pointer text-left hover:underline " + className}>{children}</button>
      {open && (
        <div className="fixed inset-0 z-[60] flex justify-end bg-black/40" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Boekingsdetails" className="h-full w-full max-w-sm overflow-y-auto bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-brand">Boekingsdetails</h3>
              <button onClick={() => setOpen(false)} aria-label="Sluiten" className="rounded-lg px-2 py-1 text-xl leading-none text-brand/40 hover:text-brand">✕</button>
            </div>
            {loading && <p className="mt-6 text-sm text-brand/50">Laden…</p>}
            {res?.error && <p className="mt-6 text-sm font-semibold text-red-600">{res.error}</p>}
            {res?.booking && <Detail b={res.booking} bookingId={bookingId} coaches={coaches} assignAction={assignAction} />}
          </div>
        </div>
      )}
    </>
  );
}

function Detail({ b, bookingId, coaches, assignAction }) {
  const paid = isSettled(b);
  const magToewijzen = !!assignAction && !!coaches?.length && b.status === "bevestigd" && new Date(b.startsAt).getTime() >= Date.now();
  return (
    <div className="mt-5 space-y-3 text-sm">
      <div className="pb-1">
        <p className="text-2xl font-black text-brand">{b.reserved ? "Gereserveerd" : (b.memberName || "Lid")}</p>
        <p className="mt-0.5 capitalize text-brand/60">{fmt(b.startsAt)} – {time(b.endsAt)}</p>
      </div>
      <Row label="Sessie" value={b.serviceName} />
      <Row label="Personen" value={b.persons} />
      <Row label="Bron" value={bron(b)} />
      {b.coachName && <Row label="Coach" value={b.coachName} />}
      {b.memberEmail && <Row label="E-mail" value={b.memberEmail} />}
      <Row label="Status" value={<span className="capitalize">{b.status}</span>} />
      <Row label="Betaald" value={paid ? <span className="text-accentdark">✓ ja</span> : <span className="text-red-500">onbetaald</span>} />
      {b.priceCents > 0 && <Row label="Bedrag" value={euro(b.priceCents)} />}
      {b.coachBilling && <Row label="Coach-afrekening" value={b.coachBilling === "credit" ? "1 sessietegoed" : b.coachBilling === "invoice" ? euro(b.coachChargeCents) : b.coachBilling === "free" ? "gratis" : b.coachBilling} />}
      {b.createdAt && <Row label="Geboekt op" value={<span className="capitalize">{fmt(b.createdAt)}</span>} />}

      {magToewijzen && (
        <form action={assignAction} className="mt-5 rounded-xl bg-paper p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-lav">Coach toewijzen</p>
          <input type="hidden" name="bookingId" value={bookingId} />
          <div className="mt-2 flex items-center gap-2">
            <select name="coachId" defaultValue={b.coachId || ""} className="flex-1 rounded-lg border-2 border-borderc px-2 py-1.5 text-sm">
              <option value="">— geen coach —</option>
              {coaches.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <button className="rounded-full bg-brand px-4 py-1.5 text-xs font-bold text-white">Opslaan</button>
          </div>
        </form>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-borderc/60 pb-2">
      <span className="text-brand/50">{label}</span>
      <span className="text-right font-semibold text-brand">{value}</span>
    </div>
  );
}
