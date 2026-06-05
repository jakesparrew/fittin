"use client";
import { useEffect, useRef, useState } from "react";

// Searchable dropdown (combobox) that submits `value` via a hidden input named `name` — drop-in
// replacement for a <select> in any server-action form. Filters as you type.
export default function SearchSelect({ name, options, placeholder = "Kies…", required, defaultValue = "", className = "" }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [value, setValue] = useState(defaultValue);
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const selected = options.find((o) => o.value === value);
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;

  return (
    <div ref={ref} className={"relative " + className}>
      <input type="hidden" name={name} value={value} required={required} />
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full min-w-[200px] items-center justify-between gap-2 rounded-lg border-2 border-borderc bg-white px-3 py-2 text-left text-sm text-brand">
        <span className={selected ? "" : "text-brand/40"}>{selected ? selected.label : placeholder}</span>
        <span className="text-brand/40">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-borderc bg-white shadow-lg">
          <div className="p-2">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek…"
              className="w-full rounded-lg border-2 border-borderc px-3 py-1.5 text-sm outline-none focus:border-accent" />
          </div>
          <div className="max-h-60 overflow-y-auto pb-1">
            {filtered.length === 0 && <p className="px-3 py-2 text-sm text-brand/40">Geen resultaten.</p>}
            {filtered.map((o) => (
              <button key={o.value} type="button"
                onClick={() => { setValue(o.value); setOpen(false); setQ(""); }}
                className={"block w-full px-3 py-2 text-left text-sm transition hover:bg-paper " + (o.value === value ? "bg-accent/10 font-bold text-accentdark" : "text-brand")}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
