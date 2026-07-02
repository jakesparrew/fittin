"use client";
import Link from "next/link";
import { useEffect } from "react";

// Catches unexpected errors in any route segment (rendered inside the app layout).
export default function Error({ error, reset }) {
  useEffect(() => {
    try {
      const body = JSON.stringify({ message: error?.message || "route-error", stack: error?.stack || null, path: typeof location !== "undefined" ? location.pathname : null });
      navigator.sendBeacon?.("/api/log-error", new Blob([body], { type: "application/json" }));
    } catch { /* ignore */ }
  }, [error]);
  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-paper px-5 py-20">
      <div className="max-w-md text-center">
        <p className="text-5xl font-black text-brand">Oeps</p>
        <p className="mt-3 leading-relaxed text-brand/60">
          Er liep iets onverwacht fout. Probeer het opnieuw — blijft het misgaan, mail{" "}
          <a href="mailto:info@fittin.be" className="font-bold text-accentdark">info@fittin.be</a>.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button onClick={() => reset()} className="rounded-full bg-accent px-6 py-3 text-sm font-black text-brand transition hover:opacity-90">
            Probeer opnieuw
          </button>
          <Link href="/" className="rounded-full border-2 border-borderc px-6 py-3 text-sm font-bold text-brand transition hover:border-lav">
            Naar home
          </Link>
        </div>
      </div>
    </main>
  );
}
