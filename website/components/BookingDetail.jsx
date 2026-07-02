"use client";
import { useState } from "react";
import { getBookingDetail } from "@/app/booking-detail-action";
import { isSettled, sourceLabel } from "@/lib/booking-status";

const fmt = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const time = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const euro = (c) => "€ " + ((c || 0) / 100).toFixed(2).replace(".", ",");
const bron = (b) => sourceLabel(b);

// Click a booking name/card anywhere → slide-in side panel with the full details. Read-only.
export default function BookingDetail({ bookingId, children, className = "" }) {
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

  return (
    <>
      <button type="button" onClick={openPanel} className={"cursor-pointer text-left hover:underline " + className}>{children}</button>
      {open && (
        <div className="fixed inset-0 z-[60] flex justify-end bg-black/40" onClick={() => setOpen(false)}>
          <div className="h-full w-full max-w-sm overflow-y-auto bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-brand">Boekingsdetails</h3>
              <button onClick={() => setOpen(false)} aria-label="Sluiten" className="rounded-lg px-2 py-1 text-xl leading-none text-brand/40 hover:text-brand">✕</button>
            </div>
            {loading && <p className="mt-6 text-sm text-brand/50">Laden…</p>}
            {res?.error && <p className="mt-6 text-sm font-semibold text-red-600">{res.error}</p>}
            {res?.booking && <Detail b={res.booking} />}
          </div>
        </div>
      )}
    </>
  );
}

function Detail({ b }) {
  const paid = isSettled(b);
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
