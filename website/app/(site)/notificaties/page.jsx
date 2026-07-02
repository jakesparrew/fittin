import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { markAllRead } from "./actions";
import NotifItem from "@/components/notifications/NotifItem";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notificaties | Fittin'" };

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
  // Note: we intentionally do NOT bulk-mark everything read on open — each row marks itself read when
  // the member actually opens it (see NotifItem), so the badge reflects genuinely-seen items.

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
          {(notifs || []).map((n) => <NotifItem key={n.id} n={n} />)}
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
