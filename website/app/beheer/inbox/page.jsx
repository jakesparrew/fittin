import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { syncInbox } from "@/lib/inbox";
import { syncInboxAction } from "../inbox-actions";
import ComposeEmail from "@/components/admin/ComposeEmail";
import ActionForm from "@/components/ui/ActionForm";

export const dynamic = "force-dynamic";
const fmt = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const BOX = { "info@fittin.be": "Algemeen", "boekingen@booking.fittin.be": "Boekingen", "nieuwsbrief@news.fittin.be": "Nieuwsbrief" };

export default async function Inbox({ searchParams }) {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym, profile } = ctx;
  if (profile.role !== "beheerder") return <div className="px-8 py-8 text-brand/60">Enkel de beheerder kan de inbox bekijken.</div>;
  const boxParam = (await searchParams)?.box;
  const box = boxParam === "sent" ? "sent" : boxParam === "auto" ? "auto" : "inbox";

  // Pull any new mail from Resend, then read from our DB.
  try { await syncInbox(gym.id); } catch {}

  const { data: mails } = await supabase
    .from("inbound_emails")
    .select("id, from_email, from_name, to_email, subject, text_body, received_at, read")
    .eq("gym_id", gym.id)
    .eq("archived", false)
    .order("received_at", { ascending: false })
    .limit(100);

  const { data: sent } = await supabase
    .from("sent_emails")
    .select("id, from_email, to_email, subject, body, created_at")
    .eq("gym_id", gym.id)
    .order("created_at", { ascending: false })
    .limit(100);

  // Automated transactional mail log (Batch 6.2) — only fetched when its tab is open.
  const { data: autoMails } = box === "auto"
    ? await supabase.from("email_log").select("id, to_email, kind, subject, status, error, created_at").order("created_at", { ascending: false }).limit(100)
    : { data: null };

  const unread = (mails || []).filter((m) => !m.read).length;
  const AUTO_STATUS = { sent: "bg-paper text-brand/50", delivered: "bg-accent/15 text-accentdark", opened: "bg-accent/15 text-accentdark", bounced: "bg-red-100 text-red-600", failed: "bg-red-100 text-red-600" };

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-brand">Inbox</h1>
          <p className="mt-1 text-sm text-brand/50">Alle e-mails naar @fittin.be — lees en beantwoord ze hier. {unread > 0 && <span className="font-bold text-accentdark">{unread} ongelezen</span>}</p>
        </div>
        <div className="flex items-center gap-2">
          <ActionForm action={syncInboxAction} success="Inbox gesynchroniseerd ✓">
            <button className="rounded-full bg-paper px-4 py-2 text-sm font-bold text-brand transition hover:bg-accent/15">↻ Vernieuwen</button>
          </ActionForm>
          <ComposeEmail />
        </div>
      </div>

      {/* Inbox / Sent tabs */}
      <div className="mt-6 flex gap-2 text-sm font-bold">
        <Link href="/beheer/inbox" className={"rounded-full px-4 py-1.5 transition " + (box === "inbox" ? "bg-brand text-white" : "bg-paper text-brand/60 hover:bg-accent/15")}>Ontvangen{unread > 0 && ` (${unread})`}</Link>
        <Link href="/beheer/inbox?box=sent" className={"rounded-full px-4 py-1.5 transition " + (box === "sent" ? "bg-brand text-white" : "bg-paper text-brand/60 hover:bg-accent/15")}>Verzonden</Link>
        <Link href="/beheer/inbox?box=auto" className={"rounded-full px-4 py-1.5 transition " + (box === "auto" ? "bg-brand text-white" : "bg-paper text-brand/60 hover:bg-accent/15")}>Automatisch</Link>
      </div>

      {box === "auto" ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-borderc bg-white">
          {(autoMails || []).map((m) => {
            const failed = m.status === "failed" || m.status === "bounced";
            return (
              <div key={m.id} className={"border-b border-borderc px-5 py-3.5 last:border-0 " + (failed ? "bg-red-50/50" : "")}>
                <div className="flex flex-wrap items-center gap-2">
                  {m.kind && <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 text-[10px] font-bold text-brand/50">{m.kind}</span>}
                  <p className="truncate text-sm font-bold text-brand">aan {m.to_email || "—"}</p>
                  <span className={"shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize " + (AUTO_STATUS[m.status] || "bg-paper text-brand/50")}>{m.status}</span>
                  <span className="ml-auto shrink-0 text-xs text-brand/40">{fmt(m.created_at)}</span>
                </div>
                <p className="mt-1 truncate text-sm text-brand/70">{m.subject}</p>
                {m.error && <p className="mt-1 truncate text-xs text-red-500">{m.error}</p>}
              </div>
            );
          })}
          {(!autoMails || autoMails.length === 0) && (
            <p className="px-5 py-10 text-center text-sm text-brand/40">Nog geen automatische e-mails gelogd. Boekingsbevestigingen, deurcodes en herinneringen verschijnen hier zodra ze verstuurd worden.</p>
          )}
        </div>
      ) : box === "inbox" ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-borderc bg-white">
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
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-borderc bg-white">
          {(sent || []).map((m) => (
            <div key={m.id} className="border-b border-borderc px-5 py-3.5 last:border-0">
              <div className="flex items-center gap-2">
                <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 text-[10px] font-bold text-brand/50">van {BOX[m.from_email] || m.from_email}</span>
                <p className="truncate text-sm font-bold text-brand">aan {m.to_email}</p>
                <span className="ml-auto shrink-0 text-xs text-brand/40">{fmt(m.created_at)}</span>
              </div>
              <p className="mt-1 truncate text-sm font-semibold text-brand/80">{m.subject}</p>
              <p className="truncate text-xs text-brand/40">{(m.body || "").replace(/\s+/g, " ").slice(0, 120)}</p>
            </div>
          ))}
          {(!sent || sent.length === 0) && (
            <p className="px-5 py-10 text-center text-sm text-brand/40">Nog geen verzonden e-mails.</p>
          )}
        </div>
      )}
    </div>
  );
}
