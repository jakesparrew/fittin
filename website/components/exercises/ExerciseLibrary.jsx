"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import ExerciseMedia from "./ExerciseMedia";

const DIFF = { beginner: "Beginner", intermediate: "Gemiddeld", gevorderd: "Gevorderd" };

// Searchable/filterable grid of the gym's exercise library. Client-side filtering (the library
// is small — tens of rows). Each card links to the detail page with the demo + instructions.
export default function ExerciseLibrary({ exercises }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("alle");

  const categories = useMemo(() => {
    const set = new Set((exercises || []).map((e) => e.category).filter(Boolean));
    return ["alle", ...Array.from(set).sort()];
  }, [exercises]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (exercises || []).filter((e) => {
      if (cat !== "alle" && e.category !== cat) return false;
      if (!term) return true;
      const hay = [e.name, e.muscle, e.equipment, ...(e.primary_muscles || [])].join(" ").toLowerCase();
      return hay.includes(term);
    });
  }, [exercises, q, cat]);

  return (
    <div>
      <div className="sticky top-16 z-10 -mx-1 bg-paper/80 px-1 py-3 backdrop-blur">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Zoek een oefening…"
          aria-label="Zoek een oefening"
          className="w-full rounded-2xl border-2 border-borderc bg-white px-4 py-3 text-sm text-brand outline-none transition focus:border-accent"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              aria-pressed={cat === c}
              className={"rounded-full px-3.5 py-1.5 text-xs font-bold capitalize transition " + (cat === c ? "bg-brand text-white" : "bg-white text-brand/60 hover:text-brand")}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((ex) => (
          <Link key={ex.id} href={`/oefeningen/${ex.slug}`} className="group rounded-3xl border border-borderc bg-white p-2 transition hover:-translate-y-0.5 hover:shadow-md">
            <ExerciseMedia exercise={ex} thumb className="aspect-square w-full" rounded="rounded-2xl" />
            <div className="px-2 pb-2 pt-3">
              <p className="font-black leading-tight text-brand">{ex.name}</p>
              <p className="mt-1 text-xs text-brand/50">
                {(ex.primary_muscles?.[0] || ex.muscle || ex.category || "").toString()}
                {ex.difficulty ? ` · ${DIFF[ex.difficulty] || ex.difficulty}` : ""}
              </p>
            </div>
          </Link>
        ))}
      </div>

      {shown.length === 0 && (
        <p className="mt-10 text-center text-sm text-brand/50">Geen oefeningen gevonden.</p>
      )}
    </div>
  );
}
