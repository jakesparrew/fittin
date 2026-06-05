"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { resumeCheckoutAction } from "@/app/(site)/boeken/actions";

const euro = (c) => "€ " + ((c || 0) / 100).toFixed(2).replace(".", ",");

// Sticky countdown for confirmed-but-unpaid bookings. When the 20-min window runs out the slot
// is auto-released — the banner refreshes the page so it reflects reality.
export default function PendingPaymentBanner({ items }) {
  const [now, setNow] = useState(() => Date.now());
  const router = useRouter();

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const live = items.filter((i) => new Date(i.deadline).getTime() > now);

  useEffect(() => {
    if (live.length < items.length) router.refresh(); // one expired → resync from server
  }, [live.length, items.length, router]);

  if (!live.length) return null;

  return (
    <div className="sticky top-2 z-40 mb-6 rounded-2xl border-2 border-accent bg-brand p-4 text-white shadow-lg">
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
              <button className="rounded-full bg-accent px-5 py-2.5 text-sm font-black text-brand transition hover:opacity-90">
                Betaal nu {euro(i.price)}
              </button>
            </form>
          </div>
        );
      })}
    </div>
  );
}
