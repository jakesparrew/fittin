import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { markRead, archiveInbox } from "../../inbox-actions";
import InboxReply from "@/components/admin/InboxReply";

export const dynamic = "force-dynamic";
const fmt = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default async function InboxItem({ params }) {
  const { id } = await params;
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym, profile } = ctx;
  if (profile.role !== "beheerder") return <div className="px-8 py-8 text-brand/60">Geen toegang.</div>;

  const { data: m } = await supabase.from("inbound_emails").select("*").eq("id", id).eq("gym_id", gym.id).single();
  if (!m) return <div className="px-4 py-6 md:px-8 md:py-8">Bericht niet gevonden. <Link href="/beheer/inbox" className="text-accentdark">← Inbox</Link></div>;
  if (!m.read) { try { await markRead(id); } catch {} }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="flex items-center justify-between">
        <Link href="/beheer/inbox" className="text-sm font-semibold text-brand/50 hover:text-brand">← Inbox</Link>
        <form action={archiveInbox}><input type="hidden" name="id" value={m.id} /><button className="rounded-full bg-paper px-3 py-1.5 text-xs font-bold text-brand/60 hover:bg-borderc">Archiveren</button></form>
      </div>

      <div className="mt-4 rounded-2xl border border-borderc bg-white p-6">
        <h1 className="text-2xl font-black text-brand">{m.subject}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-brand/60">
          <span className="font-bold text-brand">{m.from_name || m.from_email}</span>
          <span className="text-brand/40">&lt;{m.from_email}&gt;</span>
          <span className="text-brand/30">→</span>
          <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-bold">{m.to_email}</span>
          <span className="ml-auto text-xs text-brand/40">{fmt(m.received_at)}</span>
        </div>

        <div className="mt-5 border-t border-borderc pt-5">
          {m.html_body ? (
            <iframe title="email" sandbox="" srcDoc={m.html_body} className="h-[460px] w-full rounded-lg border border-borderc bg-white" />
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-brand/80">{m.text_body || "(geen inhoud)"}</pre>
          )}
        </div>
      </div>

      <div className="mt-5">
        <InboxReply id={m.id} fromEmail={m.to_email} toName={m.from_name || m.from_email} />
      </div>
    </div>
  );
}
