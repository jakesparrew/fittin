import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { syncInbox } from "@/lib/inbox";
import { syncInboxAction } from "../inbox-actions";
import ComposeEmail from "@/components/admin/ComposeEmail";

export const dynamic = "force-dynamic";
const fmt = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const BOX = { "info@fittin.be": "Algemeen", "boekingen@booking.fittin.be": "Boekingen", "nieuwsbrief@news.fittin.be": "Nieuwsbrief" };

export default async function Inbox() {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym, profile } = ctx;
  if (profile.role !== "beheerder") return <div className="px-8 py-8 text-brand/60">Enkel de beheerder kan de inbox bekijken.</div>;

  // Pull any new mail from Resend, then read from our DB.
  try { await syncInbox(gym.id); } catch {}

  const { data: mails } = await supabase
    .from("inbound_emails")
    .select("id, from_email, from_name, to_email, subject, text_body, received_at, read")
    .eq("gym_id", gym.id)
    .eq("archived", false)
    .order("received_at", { ascending: false })
    .limit(100);

  const unread = (mails || []).filter((m) => !m.read).length;

  return (
    <div className="px-8 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-brand">Inbox</h1>
          <p className="mt-1 text-sm text-brand/50">Alle e-mails naar @fittin.be — lees en beantwoord ze hier. {unread > 0 && <span className="font-bold text-accentdark">{unread} ongelezen</span>}</p>
        </div>
        <div className="flex items-center gap-2">
          <form action={syncInboxAction}>
            <button className="rounded-full bg-paper px-4 py-2 text-sm font-bold text-brand transition hover:bg-accent/15">↻ Vernieuwen</button>
          </form>
          <ComposeEmail />
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-borderc bg-white">
        {(mails || []).map((m) => (
          <Link key={m.id} href={`/beheer/inbox/${m.id}`} className={"flex items-center gap-4 border-b border-borderc px-5 py-3.5 transition last:border-0 hover:bg-paper " + (!m.read ? "bg-accent/5" : "")}>
            <span className={"h-2 w-2 shrink-0 rounded-full " + (m.read ? "bg-transparent" : "bg-accent")} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className={"truncate text-sm " + (m.read ? "font-semibold text-brand/80" : "font-black text-brand")}>{m.from_name || m.from_email}</p>
                <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 text-[10px] font-bold text-brand/50">{BOX[m.to_email] || m.to_email}</span>
              </div>
              <p className={"truncate text-sm " + (m.read ? "text-brand/60" : "font-bold text-brand")}>{m.subject}</p>
              <p className="truncate text-xs text-brand/40">{(m.text_body || "").replace(/\s+/g, " ").slice(0, 120)}</p>
            </div>
            <span className="shrink-0 text-xs text-brand/40">{fmt(m.received_at)}</span>
          </Link>
        ))}
        {(!mails || mails.length === 0) && (
          <p className="px-5 py-10 text-center text-sm text-brand/40">Nog geen e-mails. Berichten naar info@fittin.be, boekingen@booking.fittin.be of nieuwsbrief@news.fittin.be verschijnen hier.</p>
        )}
      </div>
    </div>
  );
}
