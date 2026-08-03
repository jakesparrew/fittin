"use client";
import { useEffect, useState } from "react";

// Live countdown to the member's next confirmed session. Hides itself once the session has started.
// De klok start pas NA mount (now=null tijdens SSR + eerste client-render): met Date.now() als
// initial state verschilden de servercijfers per definitie van de clientcijfers → React #418
// (hydration text mismatch) bij elke accountbezoeker met een geplande sessie.
export default function NextSessionTimer({ startsAt, name }) {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const ms = now == null ? null : new Date(startsAt).getTime() - now;
  if (ms != null && ms <= 0) return null;

  const d = ms == null ? 0 : Math.floor(ms / 86400000);
  const h = ms == null ? null : Math.floor((ms % 86400000) / 3600000);
  const m = ms == null ? null : Math.floor((ms % 3600000) / 60000);
  const s = ms == null ? null : Math.floor((ms % 60000) / 1000);
  const soon = ms != null && ms < 3600000; // < 1h
  const when = new Intl.DateTimeFormat("nl-BE", {
    timeZone: "Europe/Brussels", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  }).format(new Date(startsAt));

  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-brand p-6 text-white">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-lav">Je volgende sessie</p>
        <p className="mt-1 text-lg font-black">{name || "Sessie"}</p>
        <p className="mt-0.5 text-sm capitalize text-lav">{when}</p>
      </div>
      <div className="flex items-center gap-2 tabular-nums">
        {d > 0 && <Unit n={d} label="d" />}
        <Unit n={h} label="u" />
        <Unit n={m} label="m" />
        <Unit n={s} label="s" soon={soon} />
      </div>
    </div>
  );
}

function Unit({ n, label, soon }) {
  return (
    <span className="flex flex-col items-center">
      <span className={"min-w-[2.5rem] rounded-xl px-2 py-1.5 text-center text-xl font-black " + (soon ? "bg-accent text-brand" : "bg-white/10")}>
        {n == null ? "--" : String(n).padStart(2, "0")}
      </span>
      <span className="mt-1 text-[10px] font-bold uppercase tracking-widest text-lav">{label}</span>
    </span>
  );
}
