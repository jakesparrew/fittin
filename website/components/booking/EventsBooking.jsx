"use client";
import { useState } from "react";
import Link from "next/link";
import { signupEvent } from "@/app/(site)/community/actions";
import SubmitButton from "@/components/ui/SubmitButton";

const euro = (c) => "€ " + ((c || 0) / 100).toFixed(2).replace(".", ",");
const fmt = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

// Events overview shown on /boeken when the "Events" tab is active. Expandable cards, paid via
// Stripe (signupEvent handles the checkout). Replaces the time grid entirely.
export default function EventsBooking({ events = [], isLoggedIn }) {
  const [open, setOpen] = useState(null);

  if (!events.length) {
    return (
      <div className="mt-10 rounded-3xl border border-dashed border-borderc bg-white p-12 text-center">
        <p className="font-semibold text-brand/70">Er staan momenteel geen events gepland.</p>
        <p className="mt-1 text-sm text-brand/50">Kom later terug of boek een gewone sessie.</p>
      </div>
    );
  }

  return (
    <div className="mt-10 space-y-4">
      {events.map((ev) => {
        const full = ev.taken >= ev.capacity;
        const left = Math.max(0, ev.capacity - ev.taken);
        const isOpen = open === ev.id;
        return (
          <div key={ev.id} className="overflow-hidden rounded-3xl border border-borderc bg-white">
            <button onClick={() => setOpen(isOpen ? null : ev.id)} className="flex w-full flex-wrap items-center justify-between gap-3 p-6 text-left transition hover:bg-paper">
              <div>
                <p className="text-lg font-black text-brand">{ev.title}</p>
                <p className="mt-1 text-sm capitalize text-brand/60">{fmt(ev.starts_at)}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-lg font-black text-accentdark">{ev.price_cents ? euro(ev.price_cents) : "Gratis"}</span>
                <span className={"rounded-full px-3 py-1 text-xs font-bold " + (full ? "bg-paper text-brand/40" : "bg-accent/15 text-accentdark")}>{full ? "Volzet" : `${left} plaatsen`}</span>
                <span className="text-brand/40">{isOpen ? "▲" : "▼"}</span>
              </div>
            </button>
            {isOpen && (
              <div className="border-t border-borderc p-6">
                {ev.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ev.image_url} alt={ev.title} className="mb-4 max-h-72 w-full rounded-2xl object-cover" />
                )}
                {ev.description && <p className="leading-relaxed text-brand/70">{ev.description}</p>}
                {Array.isArray(ev.faq) && ev.faq.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-lav">Veelgestelde vragen</p>
                    {ev.faq.map((f, i) => (
                      <div key={i} className="rounded-xl bg-paper p-3">
                        <p className="text-sm font-bold text-brand">{f.q}</p>
                        <p className="mt-0.5 text-sm text-brand/65">{f.a}</p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-4">
                  {ev.mine ? (
                    <span className="inline-block rounded-full bg-accent/15 px-5 py-2.5 text-sm font-bold text-accentdark">✓ Je bent ingeschreven</span>
                  ) : full ? (
                    <span className="inline-block rounded-full bg-paper px-5 py-2.5 text-sm font-bold text-brand/50">Volzet</span>
                  ) : !isLoggedIn ? (
                    <Link href="/login?next=/boeken" className="inline-block rounded-full bg-brand px-6 py-3 text-sm font-bold text-white transition hover:opacity-90">Log in om te boeken</Link>
                  ) : (
                    <form action={signupEvent}>
                      <input type="hidden" name="eventId" value={ev.id} />
                      <SubmitButton pendingText="Bezig met inschrijven…" className="rounded-full bg-accent px-6 py-3 text-sm font-black text-brand transition hover:opacity-90">
                        {ev.price_cents ? `Boek & betaal ${euro(ev.price_cents)}` : "Schrijf gratis in"}
                      </SubmitButton>
                    </form>
                  )}
                  <p className="mt-2 text-xs text-brand/40">Events worden altijd betaald via de kassa — sessietegoed geldt niet.</p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
