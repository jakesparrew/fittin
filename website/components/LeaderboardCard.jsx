import Link from "next/link";

// Compact monthly leaderboard card. `rows` = [{id,name,n}] sorted desc, `meId` highlights you.
export default function LeaderboardCard({ rows = [], meId, myBooked }) {
  const myRank = rows.findIndex((r) => r.id === meId);
  return (
    <section className="rounded-3xl border border-borderc bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-black text-brand">Toppers <span className="text-brand/40">· deze maand</span></h2>
        {typeof myBooked === "number" && (
          <span className="rounded-full bg-paper px-3 py-1 text-xs font-bold text-brand/60">Jij: {myBooked} sessies totaal</span>
        )}
      </div>
      <div className="mt-4 space-y-2">
        {rows.slice(0, 5).map((r, i) => (
          <div key={r.id} className={"flex items-center justify-between rounded-xl px-3 py-2 text-sm " + (r.id === meId ? "bg-brand text-white" : "bg-paper")}>
            <span className="flex items-center gap-3">
              <span className={"flex h-6 w-6 items-center justify-center rounded-full text-xs font-black " + (i < 3 ? "bg-accent text-brand" : r.id === meId ? "bg-white/20" : "bg-white")}>{i + 1}</span>
              <span className="font-bold">{r.name}</span>
            </span>
            <span className="flex items-center gap-1.5 font-black">{r.score ?? r.n}{r.pts > 0 && <span className="text-[10px] font-bold text-accentdark" title={`${r.pts} via uitnodigingen`}>🎁{r.pts}</span>}</span>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-brand/50">Nog geen sessies deze maand. Wees de eerste!</p>}
        {myRank >= 5 && <p className="pt-1 text-center text-xs text-brand/50">Jij: #{myRank + 1} · {rows[myRank].score ?? rows[myRank].n} punten</p>}
      </div>
      <Link href="/community" className="mt-4 inline-block text-sm font-bold text-accentdark">Volledig klassement →</Link>
    </section>
  );
}
