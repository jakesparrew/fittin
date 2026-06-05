"use client";
import { useEffect, useState } from "react";

// Live countdown to the member's next confirmed session. Hides itself once the session has started.
export default function NextSessionTimer({ startsAt, name }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const ms = new Date(startsAt).getTime() - now;
  if (ms <= 0) return null;

  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const soon = ms < 3600000; // < 1h

  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-brand p-6 text-white">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-lav">Je volgende sessie</p>
        <p className="mt-1 text-lg font-black">{name || "Sessie"}</p>
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
        {String(n).padStart(2, "0")}
      </span>
      <span className="mt-1 text-[10px] font-bold uppercase tracking-widest text-lav">{label}</span>
    </span>
  );
}
