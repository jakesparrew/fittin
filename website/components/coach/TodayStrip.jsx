import Link from "next/link";
import ShareSession from "./ShareSession";

// Wat een coach 's ochtends wil weten staat nu bovenaan in plaats van halverwege de pagina:
// wie komt vandaag, hoe laat, en wat moet ik nu doen. De rest van het dashboard (tegoed,
// planner, tools) blijft waar het staat — dit is enkel de vandaag-laag erboven.
// Is er vandaag niets, dan tonen we één regel met de eerstvolgende sessie; is er helemaal
// niets, dan verdwijnt de strip. Een lege "0 sessies vandaag"-kaart helpt niemand.
export default function TodayStrip({ sessions = [], next = null }) {
  if (!sessions.length && !next) return null;

  if (!sessions.length) {
    return (
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-borderc bg-white px-5 py-3.5">
        <p className="text-sm text-brand/60">
          Geen sessies vandaag. Je volgende: <b className="capitalize text-brand">{next.when}</b> met <b className="text-brand">{next.who}</b>.
        </p>
        <div className="flex items-center gap-2">
          {next.shareText && <ShareSession text={next.shareText} />}
          <a href="#boeken" className="rounded-full bg-paper px-4 py-1.5 text-xs font-bold text-brand transition hover:bg-accent/15">Sessie boeken</a>
        </div>
      </div>
    );
  }

  return (
    <section className="mt-5 overflow-hidden rounded-3xl bg-brand text-white">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
        <h2 className="text-lg font-black">
          Vandaag · {sessions.length} {sessions.length === 1 ? "sessie" : "sessies"}
        </h2>
        <Link href="/coach/agenda" className="text-xs font-bold text-accent hover:underline">Volledige agenda →</Link>
      </div>
      <div className="mt-3 divide-y divide-white/10">
        {sessions.map((s) => (
          <div key={s.id} className={"flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 " + (s.live ? "bg-accent/15" : s.done ? "opacity-45" : "")}>
            <span className="w-24 shrink-0 text-lg font-black tabular-nums">{s.time}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{s.who}</p>
              <p className="truncate text-xs text-lav">{s.sub}</p>
            </div>
            <span className={"rounded-full px-3 py-1 text-[11px] font-black " + (s.live ? "bg-accent text-brand" : s.done ? "bg-white/10 text-lav" : "bg-white/10 text-white")}>
              {s.state}
            </span>
            {s.shareText && !s.done && <ShareSession text={s.shareText} />}
          </div>
        ))}
      </div>
      {sessions.some((s) => s.needsClient) && (
        <p className="bg-white/5 px-5 py-2.5 text-xs text-lav">
          Eén of meer slots staan nog zonder client. Voeg de naam toe bij <b className="text-white">Aankomende sessies</b> — dan weet de gym wie er binnenkomt.
        </p>
      )}
    </section>
  );
}
