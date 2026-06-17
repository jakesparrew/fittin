import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { markAllRead } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notificaties | Fittin'" };

const ICON = { buddy_request: "🤝", buddy_accepted: "🤝", booking_invite: "💪", coach_booked: "🏋️", payment_request: "💳", credits: "🎟️", coach_assigned: "🧑‍🏫", event: "📅", challenge: "🏆", system: "🔔" };
const fmt = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default async function Notificaties() {
  const { user } = await getSessionProfile();
  if (!user) redirect("/login?next=/notificaties");
  const supabase = await createClient();
  const { data: notifs } = await supabase
    .from("notifications")
    .select("id, type, title, body, link, read, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const unread = (notifs || []).filter((n) => !n.read).length;
  // Opening the notifications list clears the unread badge for the next load.
  if (unread > 0) { try { await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false); } catch {} }

  return (
    <main className="bg-paper min-h-screen">
      <div className="mx-auto max-w-2xl px-5 py-16">
        <Link href="/account" className="text-sm font-semibold text-brand/50 hover:text-brand">← Mijn account</Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-black text-brand">Notificaties</h1>
          {unread > 0 && (
            <form action={markAllRead}>
              <button className="rounded-full bg-paper px-4 py-2 text-sm font-bold text-brand transition hover:bg-accent/15">Alles gelezen</button>
            </form>
          )}
        </div>

        <div className="mt-6 space-y-2">
          {(notifs || []).map((n) => {
            const inner = (
              <div className={"flex items-start gap-3 rounded-2xl border border-borderc p-4 transition " + (n.read ? "bg-white" : "bg-accent/5")}>
                <span className="text-xl">{ICON[n.type] || "🔔"}</span>
                <div className="min-w-0 flex-1">
                  <p className={"text-sm " + (n.read ? "font-semibold text-brand/80" : "font-black text-brand")}>{n.title}</p>
                  {n.body && <p className="text-sm text-brand/60">{n.body}</p>}
                  <p className="mt-0.5 text-xs text-brand/40">{fmt(n.created_at)}</p>
                </div>
                {!n.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" />}
              </div>
            );
            return n.link ? <Link key={n.id} href={n.link} className="block">{inner}</Link> : <div key={n.id}>{inner}</div>;
          })}
          {(!notifs || notifs.length === 0) && (
            <div className="rounded-3xl border border-dashed border-borderc bg-white p-10 text-center">
              <p className="font-semibold text-brand/70">Nog geen notificaties.</p>
              <p className="mt-1 text-sm text-brand/50">Hier zie je buddy-aanvragen, uitnodigingen, betaalverzoeken en meer.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
