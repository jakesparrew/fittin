"use client";
import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import ExerciseMedia from "./ExerciseMedia";

const DIFF = { beginner: "Beginner", intermediate: "Gemiddeld", gevorderd: "Gevorderd" };

// Library grid. Renders an initial server-provided slice and queries the server (searchLibrary)
// on search/filter — so the client never has to hold the whole ~900-exercise library.
export default function ExerciseLibrary({ initial, total, categories, onSearch, onFavorites }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("alle");
  // Favorieten: pas ophalen als je erop klikt, en de knop pas tonen als je er hebt. Een lege
  // "❤ Favorieten"-knop voor wie er nog geen heeft, is ruis (owner-regel: leeg = onzichtbaar).
  const [favs, setFavs] = useState(null);
  const [alleenFavs, setAlleenFavs] = useState(false);
  const [results, setResults] = useState(initial || []);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!onFavorites) return;
    let levend = true;
    onFavorites().then((d) => { if (levend) setFavs(d.ingelogd ? d.oefeningen : []); }).catch(() => {});
    return () => { levend = false; };
  }, [onFavorites]);

  useEffect(() => {
    if (alleenFavs) return; // favorietenlijst komt niet van de zoekserver
    if (!q.trim() && cat === "alle") { setResults(initial || []); return; }
    const t = setTimeout(() => startTransition(async () => setResults(await onSearch(q, cat))), 250);
    return () => clearTimeout(t);
  }, [q, cat, initial, onSearch, alleenFavs]);

  const browsingAll = !q.trim() && cat === "alle" && !alleenFavs;
  const zichtbaar = alleenFavs ? (favs || []) : results;

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
          {favs && favs.length > 0 && (
            <button
              onClick={() => { setAlleenFavs((v) => !v); setQ(""); setCat("alle"); }}
              aria-pressed={alleenFavs}
              className={"rounded-full px-3.5 py-1.5 text-xs font-bold transition " + (alleenFavs ? "bg-accent text-brand" : "bg-white text-accentdark hover:bg-accent/10")}
            >
              ❤ Mijn favorieten ({favs.length})
            </button>
          )}
          {(categories || ["alle"]).map((c) => (
            <button
              key={c}
              onClick={() => { setCat(c); setAlleenFavs(false); }}
              aria-pressed={cat === c}
              className={"rounded-full px-3.5 py-1.5 text-xs font-bold capitalize transition " + (cat === c ? "bg-brand text-white" : "bg-white text-brand/60 hover:text-brand")}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-4 text-xs font-bold text-brand/40">
        {alleenFavs ? `${zichtbaar.length} bewaard` : browsingAll ? `${total} oefeningen — typ of filter om te zoeken` : pending ? "Zoeken…" : `${zichtbaar.length} resultaten`}
      </p>

      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {zichtbaar.map((ex) => (
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

      {!pending && results.length === 0 && <p className="mt-10 text-center text-sm text-brand/50">Geen oefeningen gevonden.</p>}
    </div>
  );
}
