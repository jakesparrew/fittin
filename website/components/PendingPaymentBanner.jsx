"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { resumeCheckoutAction } from "@/app/(site)/boeken/actions";
import SubmitButton from "@/components/ui/SubmitButton";

const euro = (c) => "€ " + ((c || 0) / 100).toFixed(2).replace(".", ",");

// Sticky countdown for confirmed-but-unpaid bookings. When the 15-minute window runs out the slot
// is auto-released — the banner refreshes the page so it reflects reality.
//
// De klok start pas NA mount (now = null tijdens SSR én de eerste client-render). Met
// `useState(() => Date.now())` als startwaarde stond er op de server per definitie een andere
// tijd dan op de client, en die twee cijfers botsten bij hydratie → React #418. Zelfde oorzaak en
// zelfde oplossing als in NextSessionTimer; die was gefixt, deze niet — vandaar dat #418 op
// /account bleef terugkomen bij iedereen met een onbetaalde boeking.
export default function PendingPaymentBanner({ items }) {
  const [now, setNow] = useState(null);
  const router = useRouter();

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Vóór mount weten we de tijd niet, dus tonen we nog niets: een banner die "15:00" zegt en een
  // tel later naar de echte waarde springt, is misleidender dan even niets.
  const live = now == null ? [] : items.filter((i) => new Date(i.deadline).getTime() > now);

  useEffect(() => {
    if (now != null && live.length < items.length) router.refresh(); // one expired → resync from server
  }, [now, live.length, items.length, router]);

  if (!live.length) return null;

  return (
    <div className="sticky top-2 z-40 mb-6 space-y-3 divide-y divide-white/10 rounded-2xl border-2 border-accent bg-brand p-4 text-white shadow-lg">
      {live.map((i) => {
        const ms = Math.max(0, new Date(i.deadline).getTime() - now);
        const m = Math.floor(ms / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        const urgent = ms < 5 * 60000;
        return (
          <div key={i.id} className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <p className="font-black">⏳ Je boeking is nog niet betaald</p>
              <p className="text-lav">
                {i.name} — betaal binnen{" "}
                <span className={"font-black tabular-nums " + (urgent ? "text-red-300" : "text-accent")}>
                  {m}:{String(s).padStart(2, "0")}
                </span>{" "}
                of je plek komt weer vrij.
              </p>
            </div>
            <form action={resumeCheckoutAction}>
              <input type="hidden" name="bookingId" value={i.id} />
              <SubmitButton className="rounded-full bg-accent px-5 py-2.5 text-sm font-black text-brand transition hover:opacity-90" pendingText="Bezig…">
                Betaal nu {euro(i.price)}
              </SubmitButton>
            </form>
          </div>
        );
      })}
    </div>
  );
}
