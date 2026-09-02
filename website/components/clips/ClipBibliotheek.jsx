"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ClipEmbed from "./ClipEmbed";
import BewaarSheet from "./BewaarSheet";
import { hernoemClip, verplaatsClip, verwijderClip, hernoemMap, verwijderMap } from "@/app/(site)/bewaard/actions";

// De plank: mappen bovenaan, kaarten eronder, en één tik naar de video.
//
// WAAROM DE KAARTEN GEEN THUMBNAIL VAN DE BRON TONEN: Instagram en TikTok geven alleen
// ondertekende beeld-URL's die na enkele dagen verlopen. Zo'n beeld kopiëren betekent een
// bibliotheek die er over een week uitziet als een muur gebroken plaatjes. YouTube publiceert wel
// een blijvend adres; die kaarten krijgen dus een echt beeld, de rest een eigen tegel met de naam
// groot. Dat is meteen leesbaarder dan een minuscuul stilstaand kadertje.

const TEGEL = {
  instagram: "from-[#f0d3e6] to-[#e2c7f0]",
  tiktok: "from-[#d6d2e6] to-[#c3c9de]",
  youtube: "from-[#f2d2d2] to-[#e6c9c9]",
  video: "from-paper to-borderc/60",
  link: "from-paper to-borderc/60",
};

export default function ClipBibliotheek({ clips = [], folders = [], onNaarOefening = null }) {
  const router = useRouter();
  const [map, setMap] = useState("alles");
  const [open, setOpen] = useState(null); // clip in de sheet
  const [bewaren, setBewaren] = useState(false);

  const zonderMap = useMemo(() => clips.some((c) => !c.folder_id), [clips]);
  const getoond = useMemo(() => {
    if (map === "alles") return clips;
    if (map === "los") return clips.filter((c) => !c.folder_id);
    return clips.filter((c) => c.folder_id === map);
  }, [clips, map]);

  const tellen = (id) =>
    id === "alles" ? clips.length
      : id === "los" ? clips.filter((c) => !c.folder_id).length
        : clips.filter((c) => c.folder_id === id).length;

  const na = () => { setOpen(null); router.refresh(); };

  return (
    <>
      <button
        type="button"
        onClick={() => setBewaren(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent px-6 py-4 text-lg font-black text-brand transition hover:opacity-90 sm:w-auto sm:px-8"
      >
        + Video bewaren
      </button>

      {/* Mappen. Ze verschijnen pas zodra er iets te kiezen valt — één knop "Alles" boven een lege
          plank is ruis. Zelfde lijn als de rest van de app: leeg = onzichtbaar. */}
      {(folders.length > 0 || zonderMap) && (
        <div className="scrollbar-slim mt-6 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <Chip actief={map === "alles"} op={() => setMap("alles")} label="Alles" n={tellen("alles")} />
          {folders.map((f) => (
            <Chip key={f.id} actief={map === f.id} op={() => setMap(f.id)} label={f.name} n={tellen(f.id)} />
          ))}
          {zonderMap && <Chip actief={map === "los"} op={() => setMap("los")} label="Zonder map" n={tellen("los")} />}
        </div>
      )}

      {/* Beheer van de open map: hernoemen en verwijderen horen hier, niet bij elke kaart. */}
      {map !== "alles" && map !== "los" && (
        <MapBalk
          map={folders.find((f) => f.id === map)}
          aantal={tellen(map)}
          na={() => { setMap("alles"); router.refresh(); }}
        />
      )}

      {getoond.length === 0 ? (
        <Leeg heeftClips={clips.length > 0} />
      ) : (
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {getoond.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setOpen(c)}
                className="group block w-full overflow-hidden rounded-2xl border border-borderc bg-white text-left transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <span className={`relative flex aspect-[4/5] items-end bg-gradient-to-br ${TEGEL[c.provider] || TEGEL.link}`}>
                  {c.poster && (
                    // Bewust een kale <img>: img.youtube.com staat niet in next.config.mjs en de
                    // optimizer weigert (met een runtime-fout) elke host die er niet in staat.
                    <img src={c.poster} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
                  )}
                  <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-brand">
                    {c.label}
                  </span>
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/85 text-brand shadow-sm transition group-hover:scale-105">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M6 4l14 8-14 8z" /></svg>
                    </span>
                  </span>
                </span>
                <span className="block p-3">
                  <span className="line-clamp-2 block text-sm font-bold leading-snug text-brand">{c.title}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <ClipSheet
          clip={open}
          folders={folders}
          sluit={() => setOpen(null)}
          na={na}
          onNaarOefening={onNaarOefening}
        />
      )}
      {bewaren && (
        <BewaarSheet
          folders={folders}
          sluit={() => setBewaren(false)}
          na={() => { setBewaren(false); router.refresh(); }}
        />
      )}
    </>
  );
}

function Chip({ actief, op, label, n }) {
  return (
    <button
      type="button"
      onClick={op}
      className={
        "shrink-0 rounded-full border-2 px-4 py-2 text-sm font-bold transition " +
        (actief ? "border-accent bg-accent/10 text-brand" : "border-borderc text-ink-soft hover:border-lav hover:text-brand")
      }
    >
      {label} <span className="tabular-nums opacity-60">{n}</span>
    </button>
  );
}

function Leeg({ heeftClips }) {
  return (
    <div className="mt-6 rounded-3xl border border-dashed border-borderc bg-white p-8 text-center">
      <p className="font-bold text-brand">{heeftClips ? "Deze map is nog leeg." : "Nog niets bewaard."}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
        Kom je een oefening tegen op Instagram, YouTube of TikTok? Kopieer de link en bewaar hem
        hier onder een eigen map — bijvoorbeeld “Leg day” of “Mobiliteit”.
      </p>
    </div>
  );
}

function MapBalk({ map, aantal, na }) {
  const [naam, setNaam] = useState(map?.name || "");
  const [bewerk, setBewerk] = useState(false);
  const [fout, setFout] = useState(null);
  const [pending, start] = useTransition();
  if (!map) return null;

  const opslaan = () => start(async () => {
    const r = await hernoemMap(map.id, naam);
    if (r?.error) return setFout(r.error);
    setBewerk(false);
    setFout(null);
  });

  const wissen = () => {
    if (!window.confirm(`Map “${map.name}” verwijderen? De ${aantal} ${aantal === 1 ? "video blijft" : "video's blijven"} bewaard onder “Zonder map”.`)) return;
    start(async () => {
      const r = await verwijderMap(map.id);
      if (r?.error) return setFout(r.error);
      na();
    });
  };

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-paper px-4 py-3">
      {bewerk ? (
        <>
          <input
            value={naam}
            onChange={(e) => setNaam(e.target.value)}
            maxLength={40}
            className="min-w-0 flex-1 rounded-xl border-2 border-borderc bg-white px-3 py-2 text-base text-brand outline-none focus:border-accent"
          />
          <button type="button" disabled={pending} onClick={opslaan} className="rounded-full bg-accent px-4 py-2 text-sm font-black text-brand disabled:opacity-50">Bewaar</button>
          <button type="button" onClick={() => { setBewerk(false); setNaam(map.name); }} className="text-sm font-bold text-ink-soft">Annuleer</button>
        </>
      ) : (
        <>
          <p className="min-w-0 flex-1 truncate text-sm font-bold text-brand">{map.name}</p>
          <button type="button" onClick={() => setBewerk(true)} className="text-sm font-bold text-ink-soft hover:text-brand">Hernoem</button>
          <button type="button" disabled={pending} onClick={wissen} className="text-sm font-bold text-red-500 hover:underline disabled:opacity-50">Verwijder map</button>
        </>
      )}
      {fout && <p className="w-full text-sm font-semibold text-red-600">{fout}</p>}
    </div>
  );
}

function ClipSheet({ clip, folders, sluit, na, onNaarOefening }) {
  const [titel, setTitel] = useState(clip.title);
  const [fout, setFout] = useState(null);
  const [melding, setMelding] = useState(null);
  const [pending, start] = useTransition();

  const doe = (fn, klaar) => start(async () => {
    setFout(null);
    const r = await fn();
    if (r?.error) return setFout(r.error);
    if (klaar) klaar(r);
  });

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white" role="dialog" aria-modal="true" aria-label={clip.title}>
      <div className="flex items-center gap-3 border-b border-borderc px-4 py-3">
        <button type="button" onClick={sluit} aria-label="Sluiten" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-brand/50 transition hover:bg-paper hover:text-brand">✕</button>
        <p className="min-w-0 flex-1 truncate font-black text-brand">{clip.title}</p>
        <a href={clip.url} target="_blank" rel="noreferrer nofollow" className="shrink-0 text-sm font-bold text-accentdark hover:underline">Bron ↗</a>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto max-w-lg">
          <ClipEmbed clip={clip} />

          <label className="mt-6 block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Naam</span>
            <input
              value={titel}
              onChange={(e) => setTitel(e.target.value)}
              onBlur={() => titel.trim() && titel !== clip.title && doe(() => hernoemClip(clip.id, titel))}
              maxLength={120}
              className="w-full rounded-xl border-2 border-borderc bg-white px-3 py-2.5 text-base text-brand outline-none transition focus:border-accent"
            />
          </label>

          <div className="mt-4">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Map</span>
            <div className="flex flex-wrap gap-2">
              <MapKnop actief={!clip.folder_id} op={() => doe(() => verplaatsClip(clip.id, ""), na)} label="Zonder map" />
              {folders.map((f) => (
                <MapKnop key={f.id} actief={clip.folder_id === f.id} op={() => doe(() => verplaatsClip(clip.id, f.id), na)} label={f.name} />
              ))}
            </div>
          </div>

          {onNaarOefening && (
            <div className="mt-6 rounded-2xl bg-paper p-4">
              <p className="font-black text-brand">In een schema gebruiken</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                Maakt hier een oefening van met deze video, zodat je hem in de programmabouwer kan
                kiezen. Je clienten zien de video bij die oefening.
              </p>
              <button
                type="button"
                disabled={pending}
                onClick={() => doe(() => onNaarOefening(clip.id), (r) => setMelding(r?.melding || "Oefening aangemaakt ✓"))}
                className="mt-3 rounded-full bg-accent px-5 py-2.5 text-sm font-black text-brand transition hover:opacity-90 disabled:opacity-50"
              >
                Maak er een oefening van
              </button>
              {melding && <p className="mt-2 text-sm font-semibold text-accentdark">{melding}</p>}
            </div>
          )}

          {fout && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{fout}</p>}

          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(`“${clip.title}” uit je bibliotheek verwijderen?`)) return;
              doe(() => verwijderClip(clip.id), na);
            }}
            className="mt-8 w-full rounded-full border-2 border-borderc py-3 text-sm font-bold text-red-500 transition hover:border-red-200 hover:bg-red-50 disabled:opacity-50"
          >
            Verwijder uit mijn bibliotheek
          </button>
        </div>
      </div>
    </div>
  );
}

function MapKnop({ actief, op, label }) {
  return (
    <button
      type="button"
      onClick={op}
      className={
        "rounded-full border-2 px-4 py-2 text-sm font-bold transition " +
        (actief ? "border-accent bg-accent/10 text-brand" : "border-borderc text-ink-soft hover:border-lav hover:text-brand")
      }
    >
      {label}
    </button>
  );
}
