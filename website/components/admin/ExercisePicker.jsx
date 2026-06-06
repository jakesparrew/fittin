"use client";
import { useEffect, useRef, useState } from "react";

// Searchable exercise combobox with an inline "+ nieuwe oefening" that creates the exercise on the
// spot (via addAction) and selects it — no round-trip to the exercises page. Submits the chosen id
// through a hidden input named `name`, so it drops into the existing add-exercise <form>.
export default function ExercisePicker({ name, options: initial = [], addAction }) {
  const [options, setOptions] = useState(initial);
  const [value, setValue] = useState(initial[0]?.id || "");
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setCreating(false); } };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const selected = options.find((o) => o.id === value);
  const filtered = q ? options.filter((o) => o.name.toLowerCase().includes(q.toLowerCase())) : options;

  async function create() {
    const n = q.trim();
    if (!n || busy) return;
    setBusy(true);
    const r = await addAction(n);
    setBusy(false);
    if (r?.id) {
      setOptions((o) => [...o, { id: r.id, name: r.name }]);
      setValue(r.id);
      setQ(""); setCreating(false); setOpen(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <input type="hidden" name={name} value={value} required />
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-52 items-center justify-between gap-2 rounded-lg border-2 border-borderc bg-white px-3 py-1.5 text-left text-sm text-brand">
        <span className={selected ? "" : "text-brand/40"}>{selected ? selected.name : "Kies oefening…"}</span>
        <span className="text-brand/40">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-64 overflow-hidden rounded-xl border border-borderc bg-white shadow-lg">
          <div className="p-2">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek of typ nieuwe…" className="w-full rounded-lg border-2 border-borderc px-3 py-1.5 text-sm outline-none focus:border-accent" />
          </div>
          <div className="max-h-52 overflow-y-auto pb-1">
            {filtered.map((o) => (
              <button key={o.id} type="button" onClick={() => { setValue(o.id); setOpen(false); setQ(""); }} className={"block w-full px-3 py-2 text-left text-sm transition hover:bg-paper " + (o.id === value ? "bg-accent/10 font-bold text-accentdark" : "text-brand")}>
                {o.name}
              </button>
            ))}
            {q.trim() && !filtered.some((o) => o.name.toLowerCase() === q.trim().toLowerCase()) && (
              <button type="button" onClick={create} disabled={busy} className="block w-full border-t border-borderc px-3 py-2 text-left text-sm font-bold text-accentdark transition hover:bg-accent/10 disabled:opacity-50">
                {busy ? "Bezig…" : `+ Nieuwe oefening "${q.trim()}"`}
              </button>
            )}
            {filtered.length === 0 && !q.trim() && <p className="px-3 py-2 text-sm text-brand/40">Typ om te zoeken of toe te voegen.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
